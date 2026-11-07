#!/usr/bin/env node
/**
 * 建置 Windows 一鍵部署包：dist/windows/EMRD-Server.exe（網站內容打包在執行檔內）與 README.txt、zip。
 *
 *   npm run package:windows                       靜態匯出網站並建置執行檔
 *   npm run package:windows -- --reuse-site       沿用上次匯出的網站，只重新建置執行檔（改 deploy/windows 時）
 *   npm run package:windows -- --native           另外建置本機平台的執行檔（在非 Windows 的開發機上測試用）
 *
 * 需要 Go：預設使用 PATH 上的 go，或以環境變數 GO 指定。建議用最新穩定版（支援 Windows 10／Server 2016 以上）。
 *
 * 請在 macOS 或 Linux 上匯出：Next 16.4 在 Windows 上匯出的換頁預先載入檔路徑有問題（見 README.md）。
 *
 * 靜態匯出的前置處理與 .github/workflows/pages.yml 相同（移除 Proxy、刪除只在 cacheComponents 下有效的宣告），
 * 但只改暫存複本，不動工作目錄；另外設定 NEXT_STATIC_RELEASE=1：這是正式部署，不是預覽版。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = path.join(ROOT, "deploy", "windows");
const BUNDLE_DIR = path.join(SERVER_DIR, "bundle");
const OUTPUT_DIR = path.join(ROOT, "dist", "windows");
const EXE_NAME = "EMRD-Server.exe";
const ZIP_NAME = "EMRD-Windows-Deploy.zip";

/** 網站建置不需要的項目（不複製到暫存目錄） */
const COPY_EXCLUDES = new Set([
  ".claude",
  ".git",
  ".github",
  ".legacy-cache",
  ".next",
  ".private-originals",
  "R-Page2",
  "deploy",
  "dist",
  "docs",
  "legacy-originals",
  "media",
  "out",
  "reference_photo",
  "reference_形象素材",
  "scripts",
  "文件",
]);
/** 同 .github/workflows/pages.yml：只在 cacheComponents 下有效，匯出模式會建置失敗的單行宣告 */
const CACHE_COMPONENTS_ONLY = /^export const (ensureStatic|unstable_paramMatching|instant) = /;
/** 預先壓縮的文字檔類型；影片、圖片、PDF 本身已壓縮 */
const COMPRESSIBLE = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);
const MIN_COMPRESS_BYTES = 1024;
const GO = process.env.GO || "go";

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function walk(dir, visit, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit, base);
    else visit(full, path.relative(base, full));
  }
}

/** 在暫存複本中靜態匯出網站，回傳 out/ 的路徑 */
function exportSite(workDir) {
  console.log("複製專案到暫存目錄…");
  fs.cpSync(ROOT, workDir, {
    recursive: true,
    // 複製 node_modules 很大：檔案系統支援時以寫入時複製（APFS、ReFS）節省時間與空間
    mode: fs.constants.COPYFILE_FICLONE,
    verbatimSymlinks: true,
    filter: (source) => {
      const relative = path.relative(ROOT, source);
      return !COPY_EXCLUDES.has(relative.split(path.sep)[0]);
    },
  });

  fs.rmSync(path.join(workDir, "src", "proxy.ts"), { force: true });
  walk(path.join(workDir, "src", "app"), (file) => {
    if (!/\.tsx?$/.test(file)) return;
    const source = fs.readFileSync(file, "utf8");
    const stripped = source
      .split("\n")
      .filter((line) => !CACHE_COMPONENTS_ONLY.test(line))
      .join("\n");
    if (stripped !== source) fs.writeFileSync(file, stripped);
  });

  console.log("靜態匯出網站（next build）…");
  const env = {
    ...process.env,
    NEXT_OUTPUT: "export",
    NEXT_STATIC_RELEASE: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    // Turbopack 需要 PATH 上有 node
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  delete env.NEXT_PUBLIC_BASE_PATH;
  delete env.NEXT_PUBLIC_SITE_URL;
  run(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "build"], {
    cwd: workDir,
    env,
  });
  return path.join(workDir, "out");
}

/** 把匯出結果整理成執行檔要打包的 bundle/：site/、gzip/、redirects.json */
function writeBundle(outDir) {
  for (const required of ["index.html", "404.html"]) {
    if (!fs.existsSync(path.join(outDir, required))) {
      throw new Error(`靜態匯出缺少 ${required}`);
    }
  }
  for (const entry of fs.readdirSync(BUNDLE_DIR)) {
    if (entry !== ".gitkeep") fs.rmSync(path.join(BUNDLE_DIR, entry), { recursive: true, force: true });
  }

  fs.cpSync(outDir, path.join(BUNDLE_DIR, "site"), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "src", "content", "legacy", "data", "redirects.json"),
    path.join(BUNDLE_DIR, "redirects.json"),
  );

  let compressed = 0;
  walk(path.join(BUNDLE_DIR, "site"), (file, relative) => {
    if (!COMPRESSIBLE.has(path.extname(file).toLowerCase())) return;
    const data = fs.readFileSync(file);
    if (data.length < MIN_COMPRESS_BYTES) return;
    const gzipped = zlib.gzipSync(data, { level: 9 });
    if (gzipped.length >= data.length) return;
    const target = path.join(BUNDLE_DIR, "gzip", `${relative}.gz`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, gzipped);
    compressed += 1;
  });
  console.log(`已整理網站檔案；預先壓縮 ${compressed} 個文字檔`);
  // gzip/ 一定要存在，執行檔才能開啟
  fs.mkdirSync(path.join(BUNDLE_DIR, "gzip"), { recursive: true });
}

/** 網站內容的雜湊：內容一變，版本與每個檔案的 ETag 都跟著變，瀏覽器才不會留著舊頁面 */
function bundleHash() {
  const files = [];
  walk(BUNDLE_DIR, (file, relative) => files.push([relative.split(path.sep).join("/"), file]));
  files.sort(([a], [b]) => (a < b ? -1 : 1));
  const hash = createHash("sha256");
  for (const [relative, file] of files) {
    hash.update(relative);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex").slice(0, 8);
}

function buildID() {
  let revision = "dev";
  try {
    revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    // 不在 git 工作目錄中建置時，只用日期
  }
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${date}-${revision}-${bundleHash()}`;
}

function goBuild(goos, goarch, output, id) {
  run(GO, ["build", "-trimpath", "-ldflags", `-s -w -X main.buildID=${id}`, "-o", output, "."], {
    cwd: SERVER_DIR,
    env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: "0" },
  });
}

/** README 以 Windows 記事本都能正確顯示的格式輸出：UTF-8 BOM＋CRLF */
function writeReadme() {
  const text = fs.readFileSync(path.join(SERVER_DIR, "README.txt"), "utf8").replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "README.txt"), `\uFEFF${text}`);
}

function writeZip() {
  const zipPath = path.join(OUTPUT_DIR, ZIP_NAME);
  fs.rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${EXE_NAME}','README.txt' -DestinationPath '${ZIP_NAME}'`,
    ], { cwd: OUTPUT_DIR });
  } else {
    run("zip", ["-q", "-X", ZIP_NAME, EXE_NAME, "README.txt"], { cwd: OUTPUT_DIR });
  }
}

const args = new Set(process.argv.slice(2));
if (process.platform === "win32" && !args.has("--reuse-site")) {
  throw new Error("請在 macOS 或 Linux 上匯出網站：Next 16.4 在 Windows 上匯出的換頁預先載入檔路徑有問題（見 README.md）");
}
console.log(execFileSync(GO, ["version"], { encoding: "utf8" }).trim());
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.rmSync(path.join(OUTPUT_DIR, "EMRD-Server.port"), { force: true });

if (args.has("--reuse-site")) {
  if (!fs.existsSync(path.join(BUNDLE_DIR, "site", "index.html"))) {
    throw new Error("沒有可沿用的網站檔案，請先不加 --reuse-site 執行一次");
  }
} else {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "emrd-package-"));
  try {
    writeBundle(exportSite(workDir));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

const id = buildID();
console.log(`建置執行檔（版本 ${id}，windows/386：32 與 64 位元 Windows 都能執行）…`);
goBuild("windows", "386", path.join(OUTPUT_DIR, EXE_NAME), id);
writeReadme();
writeZip();

if (args.has("--native")) {
  const native = path.join(OUTPUT_DIR, `EMRD-Server-${process.platform}-${process.arch}`);
  goBuild(process.platform, process.arch === "arm64" ? "arm64" : "amd64", native, id);
}

for (const file of fs.readdirSync(OUTPUT_DIR)) {
  const { size } = fs.statSync(path.join(OUTPUT_DIR, file));
  console.log(`  ${file}  ${(size / 1024 / 1024).toFixed(1)} MB`);
}
