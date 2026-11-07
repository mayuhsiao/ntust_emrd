#!/usr/bin/env python3
"""
個資保護用的檔案處理（scripts/migrate_legacy.py 與下方指令共用）。

清除圖片的檔案資訊（拍攝地點 GPS、作者、著作權欄的電話、相機與軟體資訊），不重新編碼：像素完全不變。

  JPEG：只保留 JFIF、色彩描述檔（ICC）與 Adobe 色彩轉換標記；EXIF 方向不是 1 時保留只含方向的最小 EXIF，
        否則瀏覽器顯示的方向會改變。檔尾多餘的資料（多圖格式的附圖等）一併移除。
  PNG： 移除文字區塊（tEXt、zTXt、iTXt）、eXIf 與 tIME。

scripts/migrate_legacy.py 下載與整理圖片時會呼叫這裡的 strip_image；不經搬遷的圖片（src/assets、reference_photo 等）
以指令處理，處理後逐一比對像素：

  python scripts/strip_image_metadata.py src/assets reference_photo

另有：strip_office 清除 Word／OpenDocument 檔的作者欄位；blur_regions 模糊照片中投影片上的名單；
redact_pdf_text 移除 PDF 中的文字列、連結與無障礙替代文字。
"""

from __future__ import annotations

import io
import re
import struct
import sys
import zipfile
from pathlib import Path

JPEG_SUFFIXES = {".jpg", ".jpeg"}
PNG_SUFFIXES = {".png"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_DROPPED_CHUNKS = {b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"}


def _jpeg_orientation(exif_payload: bytes) -> int:
    """APP1 的 EXIF 內容（含 "Exif\\0\\0"）中的方向，讀不到時視為 1。"""
    tiff = exif_payload[6:]
    if len(tiff) < 8 or tiff[:2] not in (b"II", b"MM"):
        return 1
    endian = "<" if tiff[:2] == b"II" else ">"
    try:
        offset = struct.unpack_from(endian + "I", tiff, 4)[0]
        count = struct.unpack_from(endian + "H", tiff, offset)[0]
        for index in range(count):
            entry = offset + 2 + index * 12
            if struct.unpack_from(endian + "H", tiff, entry)[0] == 0x0112:
                return struct.unpack_from(endian + "H", tiff, entry + 8)[0]
    except struct.error:
        pass
    return 1


def _minimal_orientation_exif(orientation: int) -> bytes:
    """只含方向一個欄位的 APP1 區段。"""
    body = b"Exif\0\0II*\0" + struct.pack("<I", 8) + struct.pack("<H", 1)
    body += struct.pack("<HHIHH", 0x0112, 3, 1, orientation, 0) + struct.pack("<I", 0)
    return b"\xff\xe1" + struct.pack(">H", len(body) + 2) + body


def strip_jpeg(data: bytes) -> bytes:
    if data[:2] != b"\xff\xd8":
        raise ValueError("不是 JPEG")
    kept: list[bytes] = []
    orientation = 1
    pos = 2
    size = len(data)
    while pos < size:
        if data[pos] != 0xFF:
            raise ValueError(f"JPEG 區段位置 {pos} 不正確")
        while pos + 1 < size and data[pos + 1] == 0xFF:  # 區段之間的填充位元組
            pos += 1
        marker = data[pos + 1]
        if marker == 0xD9:  # EOI：之後的資料都不要
            kept.append(b"\xff\xd9")
            break
        if 0xD0 <= marker <= 0xD7 or marker == 0x01:  # 沒有長度的標記
            kept.append(data[pos:pos + 2])
            pos += 2
            continue
        length = struct.unpack_from(">H", data, pos + 2)[0]
        segment = data[pos:pos + 2 + length]
        payload = data[pos + 4:pos + 2 + length]
        if marker == 0xDA:  # SOS：複製到下一個非資料的標記
            end = pos + 2 + length
            while end + 1 < size:
                if data[end] == 0xFF and data[end + 1] != 0x00 and not 0xD0 <= data[end + 1] <= 0xD7:
                    break
                end += 1
            kept.append(data[pos:end])
            pos = end
            continue
        if marker == 0xE1 and payload[:6] == b"Exif\0\0":
            orientation = _jpeg_orientation(payload)
        keep = (
            not (0xE0 <= marker <= 0xEF or marker == 0xFE)
            or (marker == 0xE0 and payload[:5] in (b"JFIF\0", b"JFXX\0"))
            or (marker == 0xE2 and payload[:12] == b"ICC_PROFILE\0")
            or (marker == 0xEE and payload[:5] == b"Adobe")
        )
        if keep:
            kept.append(segment)
        pos += 2 + length
    else:
        raise ValueError("JPEG 沒有結束標記")

    head = [b"\xff\xd8"]
    # JFIF 必須緊接在 SOI 之後，方向區段放在它後面
    if kept and kept[0][:2] == b"\xff\xe0":
        head.append(kept.pop(0))
    if orientation != 1:
        head.append(_minimal_orientation_exif(orientation))
    return b"".join(head + kept)


def strip_png(data: bytes) -> bytes:
    if data[:8] != PNG_SIGNATURE:
        raise ValueError("不是 PNG")
    out = [PNG_SIGNATURE]
    pos = 8
    while pos < len(data):
        length = struct.unpack_from(">I", data, pos)[0]
        kind = data[pos + 4:pos + 8]
        end = pos + 12 + length
        if kind not in PNG_DROPPED_CHUNKS:
            out.append(data[pos:end])
        pos = end
        if kind == b"IEND":  # 之後的資料都不要
            break
    return b"".join(out)


def strip_image(data: bytes, name: str) -> bytes:
    """依副檔名清除檔案資訊；其他格式與不符合格式的檔案原樣回傳（交由呼叫端的流程處理）。"""
    suffix = Path(name).suffix.lower()
    try:
        if suffix in JPEG_SUFFIXES:
            return strip_jpeg(data)
        if suffix in PNG_SUFFIXES:
            return strip_png(data)
    except (ValueError, struct.error):
        return data
    return data


def strip_office(data: bytes) -> bytes:
    """Word（docx）與 OpenDocument（odt）：清空作者、最後修改者與公司欄位，移除文件屬性中殘留的連結。內文不變。"""
    source = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    changed = False
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
        for info in source.infolist():
            body = source.read(info.filename)
            new = body
            if info.filename == "docProps/core.xml":
                new = re.sub(rb"<(dc:creator|cp:lastModifiedBy)>[^<]*</\1>", rb"<\1></\1>", new)
            elif info.filename == "docProps/app.xml":
                new = re.sub(rb"<(Manager|Company|HyperlinkBase)>[^<]*</\1>", rb"<\1></\1>", new)
                new = re.sub(rb"<HLinks>.*?</HLinks>", b"", new, flags=re.S)
            elif info.filename == "meta.xml":
                new = re.sub(rb"<(dc:creator|meta:initial-creator)>[^<]*</\1>", rb"<\1></\1>", new)
            changed = changed or new != body
            target.writestr(info, new)
    return out.getvalue() if changed else data


def blur_regions(
    data: bytes,
    rects: list[tuple[float, float, float, float]],
    keep: tuple | list = (),
) -> bytes:
    """模糊照片中的投影片區域（rects：左、上、右、下，占寬高的比例）；keep 內的橢圓範圍（例：前方人物的頭）
    維持清晰。JPEG 重新編碼，保留色彩描述檔。"""
    from PIL import Image, ImageDraw, ImageFilter

    with Image.open(io.BytesIO(data)) as image:
        icc = image.info.get("icc_profile")
        original = image.convert("RGB")
    width, height = original.size
    radius = max(6, round(width * 0.006))
    result = original.copy()
    for left, top, right, bottom in rects:
        box = (int(left * width), int(top * height), int(right * width), int(bottom * height))
        result.paste(original.crop(box).filter(ImageFilter.GaussianBlur(radius)), box)
    if keep:
        mask = Image.new("L", original.size, 0)
        draw = ImageDraw.Draw(mask)
        for left, top, right, bottom in keep:
            draw.ellipse((left * width, top * height, right * width, bottom * height), fill=255)
        result.paste(original, mask=mask.filter(ImageFilter.GaussianBlur(radius / 4)))
    out = io.BytesIO()
    options = {"icc_profile": icc} if icc else {}
    result.save(out, "JPEG", quality=90, optimize=True, **options)
    return out.getvalue()


def redact_pdf_text(data: bytes, patterns: list[str]) -> bytes:
    """移除 PDF 中符合 patterns 的文字列與連結；Word／PowerPoint 輸出的 PDF 另把文字存在標籤結構的
    ActualText，一併移除。沒有符合時原樣回傳，因此重跑結果相同。"""
    import pymupdf

    matcher = re.compile("|".join(patterns), re.I)
    doc = pymupdf.open(stream=data, filetype="pdf")
    changed = False
    for page in doc:
        for link in page.get_links():
            if matcher.search(link.get("uri") or ""):
                page.delete_link(link)
                changed = True
        lines = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                if matcher.search("".join(span["text"] for span in line["spans"])):
                    lines.append(line["bbox"])
        for rect in lines:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        if lines:
            page.apply_redactions()
            changed = True
    if changed:
        for xref in range(1, doc.xref_length()):
            if doc.xref_get_key(xref, "ActualText")[0] != "null":
                doc.xref_set_key(xref, "ActualText", "null")
    return doc.tobytes(garbage=4, deflate=True, no_new_id=True) if changed else data


def pixels(data: bytes) -> tuple:
    """解碼後的像素與顯示方向，用於確認清除前後畫面相同。"""
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        image.load()
        return image.size, image.mode, image.getexif().get(0x0112, 1), image.tobytes()


def main(paths: list[str]) -> int:
    changed = failed = 0
    for root in paths:
        root_path = Path(root)
        files = [root_path] if root_path.is_file() else sorted(root_path.rglob("*"))
        for file in files:
            if not file.is_file() or file.suffix.lower() not in JPEG_SUFFIXES | PNG_SUFFIXES:
                continue
            data = file.read_bytes()
            out = strip_image(data, file.name)
            if out == data:
                continue
            if pixels(data) != pixels(out):
                print(f"像素不同，未修改：{file}")
                failed += 1
                continue
            file.write_bytes(out)
            changed += 1
    print(f"已清除 {changed} 個檔案的檔案資訊；{failed} 個失敗")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
