package main

import (
	"fmt"
	"hash/fnv"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

// contentSecurityPolicy 與 next.config.ts 相同（server_test.go 會比對）。
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self' 'unsafe-inline'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: https://i.ytimg.com; " +
	"font-src 'self'; " +
	"media-src 'self'; " +
	"frame-src https://www.youtube-nocookie.com https://calendar.google.com; " +
	"connect-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"frame-ancestors 'self'"

// contentTypes 是固定的檔案類型表。不使用 mime.TypeByExtension：它在 Windows 上讀取登錄檔，部分主機會把 .js 對應成
// text/plain，加上 X-Content-Type-Options: nosniff 後瀏覽器會拒絕執行。
var contentTypes = map[string]string{
	".avif":  "image/avif",
	".bmp":   "image/bmp",
	".css":   "text/css; charset=utf-8",
	".doc":   "application/msword",
	".docx":  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".gif":   "image/gif",
	".html":  "text/html; charset=utf-8",
	".ico":   "image/x-icon",
	".jpeg":  "image/jpeg",
	".jpg":   "image/jpeg",
	".js":    "text/javascript; charset=utf-8",
	".json":  "application/json",
	".mp4":   "video/mp4",
	".odt":   "application/vnd.oasis.opendocument.text",
	".pdf":   "application/pdf",
	".png":   "image/png",
	".ppt":   "application/vnd.ms-powerpoint",
	".pptx":  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".svg":   "image/svg+xml",
	".txt":   "text/plain; charset=utf-8",
	".webm":  "video/webm",
	".webp":  "image/webp",
	".woff":  "font/woff",
	".woff2": "font/woff2",
	".xls":   "application/vnd.ms-excel",
	".xlsx":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xml":   "application/xml",
	".zip":   "application/zip",
}

// siteServer 提供靜態匯出的網站，並補上靜態主機沒有的舊站轉址（legacy.go）與安全標頭。
type siteServer struct {
	site    fs.FS // 網站檔案
	gzipped fs.FS // 預先壓縮的文字檔：<路徑>.gz
	legacy  *legacyIndex
	buildID string
}

func (s *siteServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	header := w.Header()
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "SAMEORIGIN")
	header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	header.Set("Content-Security-Policy", contentSecurityPolicy)

	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		header.Set("Allow", "GET, HEAD")
		http.Error(w, "405 Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 比對舊站網址前先移除結尾斜線與重複斜線（Next 也會先正規化，舊網址多一個斜線仍要轉到正確頁面）
	if cleanPath := path.Clean("/" + r.URL.Path); isLegacyPath(cleanPath) {
		cleanEscaped := path.Clean("/" + r.URL.EscapedPath())
		if destination, permanent, found := s.legacy.resolve(cleanEscaped, r.URL.RawQuery); found {
			s.redirect(w, destination, permanent)
			return
		}
		if isLegacyFilePath(cleanEscaped) {
			header.Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			if r.Method != http.MethodHead {
				_, _ = io.WriteString(w, "404 Not Found：此檔案未搬遷至新網站。")
			}
			return
		}
	}

	// 網址只用來在執行檔內的檔案中查找，不會碰到主機的檔案系統
	relative := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	wantsDirectory := strings.HasSuffix(r.URL.Path, "/")
	switch {
	case relative == "404" || relative == "404.html" || relative == "404/index.html" ||
		relative == "_not-found" || relative == "_not-found/index.html":
		// 靜態匯出會輸出這些頁面，但它們不是網站內容，不可回應 200
		s.serveNotFound(w, r)
	case relative == "":
		s.serveFile(w, r, "index.html")
	case !wantsDirectory && s.isFile(relative):
		s.serveFile(w, r, relative)
	case s.isFile(relative + "/index.html"):
		if wantsDirectory {
			s.serveFile(w, r, relative+"/index.html")
			return
		}
		// 每頁輸出為 <路徑>/index.html：與靜態主機相同，補上結尾斜線
		target := (&url.URL{Path: "/" + relative + "/", RawQuery: r.URL.RawQuery}).String()
		header.Set("Location", target)
		w.WriteHeader(http.StatusPermanentRedirect)
	default:
		s.serveNotFound(w, r)
	}
}

func (s *siteServer) isFile(name string) bool {
	info, err := fs.Stat(s.site, name)
	return err == nil && !info.IsDir()
}

// redirect 回應舊站轉址。站內目的地若是頁面（<路徑>/index.html），直接補上結尾斜線，少轉一次。
func (s *siteServer) redirect(w http.ResponseWriter, destination string, permanent bool) {
	location := destination
	if parsed, err := url.Parse(destination); err == nil {
		if parsed.Host == "" && parsed.Path != "/" && !strings.HasSuffix(parsed.Path, "/") &&
			s.isFile(strings.TrimPrefix(parsed.Path, "/")+"/index.html") {
			parsed.Path += "/"
		}
		location = parsed.String()
	}
	w.Header().Set("Location", location)
	if permanent {
		w.WriteHeader(http.StatusPermanentRedirect)
	} else {
		w.WriteHeader(http.StatusTemporaryRedirect)
	}
}

func (s *siteServer) serveFile(w http.ResponseWriter, r *http.Request, name string) {
	header := w.Header()
	header.Set("Content-Type", contentTypeOf(name))
	header.Set("Cache-Control", cacheControlOf(name))

	if compressed, err := s.gzipped.Open(name + ".gz"); err == nil {
		defer compressed.Close()
		// 同一個網址依 Accept-Encoding 有兩種內容
		header.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			info, err := compressed.Stat()
			if err != nil {
				http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
				return
			}
			header.Set("Content-Encoding", "gzip")
			header.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
			header.Set("ETag", s.etagOf(name, "-gzip"))
			r.Header.Del("Range") // 範圍請求只對未壓縮內容有意義（影片、PDF 不會預先壓縮）
			s.serveContent(w, r, compressed)
			return
		}
	}

	file, err := s.site.Open(name)
	if err != nil {
		s.serveNotFound(w, r)
		return
	}
	defer file.Close()
	header.Set("ETag", s.etagOf(name, ""))
	s.serveContent(w, r, file)
}

func (s *siteServer) serveContent(w http.ResponseWriter, r *http.Request, file fs.File) {
	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
		return
	}
	http.ServeContent(cleanFailureWriter{w}, r, "", time.Time{}, seeker)
}

// cleanFailureWriter 在 ServeContent 回應 412／416 等錯誤時，移除只適用於成功回應的標頭：
// 否則錯誤回應會帶著檔案的長度與編碼，或被快取一年。
type cleanFailureWriter struct {
	http.ResponseWriter
}

func (w cleanFailureWriter) WriteHeader(status int) {
	if status >= http.StatusBadRequest {
		header := w.Header()
		for _, name := range []string{"Cache-Control", "Content-Encoding", "Content-Length", "ETag"} {
			header.Del(name)
		}
	}
	w.ResponseWriter.WriteHeader(status)
}

func (s *siteServer) serveNotFound(w http.ResponseWriter, r *http.Request) {
	header := w.Header()
	// 掃描網站的機器人大多落在 404：有壓縮版就用壓縮版（約 23 KB，未壓縮約 198 KB）
	var body []byte
	if acceptsGzip(r.Header.Get("Accept-Encoding")) {
		if compressed, err := fs.ReadFile(s.gzipped, "404.html.gz"); err == nil {
			body = compressed
			header.Set("Content-Encoding", "gzip")
		}
	}
	if body == nil {
		page, err := fs.ReadFile(s.site, "404.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		body = page
	}
	header.Add("Vary", "Accept-Encoding")
	header.Set("Content-Type", contentTypes[".html"])
	header.Set("Cache-Control", "no-store")
	header.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusNotFound)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func (s *siteServer) etagOf(name, variant string) string {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(name))
	return fmt.Sprintf(`"%s-%08x%s"`, s.buildID, hash.Sum32(), variant)
}

func contentTypeOf(name string) string {
	if contentType, ok := contentTypes[strings.ToLower(path.Ext(name))]; ok {
		return contentType
	}
	return "application/octet-stream"
}

func cacheControlOf(name string) string {
	switch {
	case strings.HasPrefix(name, "_next/static/"): // 檔名含內容雜湊
		return "public, max-age=31536000, immutable"
	case strings.HasPrefix(name, "legacy/"), strings.HasPrefix(name, "videos/"):
		return "public, max-age=86400"
	}
	return "public, max-age=0, must-revalidate"
}

// acceptsGzip 依 Accept-Encoding 判斷（gzip;q=0 表示不接受）。
func acceptsGzip(acceptEncoding string) bool {
	for _, part := range strings.Split(acceptEncoding, ",") {
		fields := strings.Split(part, ";")
		if !strings.EqualFold(strings.TrimSpace(fields[0]), "gzip") {
			continue
		}
		for _, parameter := range fields[1:] {
			key, value, _ := strings.Cut(strings.TrimSpace(parameter), "=")
			if strings.EqualFold(key, "q") {
				if quality, err := strconv.ParseFloat(value, 64); err == nil && quality == 0 {
					return false
				}
			}
		}
		return true
	}
	return false
}
