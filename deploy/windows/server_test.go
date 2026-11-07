package main

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
)

func gzipBytes(t *testing.T, content string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := io.WriteString(writer, content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func testServer(t *testing.T) *siteServer {
	t.Helper()
	legacy, err := newLegacyIndex([]byte(`[
		{"source":"/p/404-1039-1.php","destination":"/posts/1"},
		{"source":"/var/file/a.pdf","destination":"/legacy/files/a.pdf"},
		{"source":"/app/index.php?Action=downloadfile&file=x","destination":"/legacy/files/a.pdf"},
		{"source":"/p/450-1039-9.php","destination":"https://drive.google.com/file/d/abc"}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	const page = "<html>home</html>"
	return &siteServer{
		site: fstest.MapFS{
			"index.html":                 {Data: []byte(page)},
			"404.html":                   {Data: []byte("<html>not found</html>")},
			"404/index.html":             {Data: []byte("<html>not found</html>")},
			"_not-found/index.html":      {Data: []byte("<html>not found</html>")},
			"posts/1/index.html":         {Data: []byte("<html>post</html>")},
			"posts/1/index.txt":          {Data: []byte("rsc payload")},
			"news/index.html":            {Data: []byte("<html>news</html>")},
			"news/events/index.html":     {Data: []byte("<html>events</html>")},
			"robots.txt":                 {Data: []byte("User-agent: *")},
			"_next/static/chunks/a.js":   {Data: []byte("alert(1)")},
			"_next/static/media/f.woff2": {Data: []byte("font")},
			"videos/hero.mp4":            {Data: []byte("0123456789")},
			"legacy/files/a.pdf":         {Data: []byte("%PDF")},
			"legacy/files/a.unknown":     {Data: []byte("???")},
		},
		gzipped: fstest.MapFS{
			"index.html.gz": {Data: gzipBytes(t, page)},
			"404.html.gz":   {Data: gzipBytes(t, "<html>not found</html>")},
		},
		legacy:  legacy,
		buildID: "test",
	}
}

func request(t *testing.T, s *siteServer, method, target string, headers map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	s.ServeHTTP(recorder, req)
	return recorder.Result()
}

func body(t *testing.T, res *http.Response) string {
	t.Helper()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestRouting(t *testing.T) {
	s := testServer(t)
	for _, test := range []struct {
		target, wantBody string
		wantStatus       int
		wantLocation     string
	}{
		{"/", "<html>home</html>", 200, ""},
		{"/posts/1/", "<html>post</html>", 200, ""},
		{"/posts/1", "", 308, "/posts/1/"},
		{"/posts/1?a=1", "", 308, "/posts/1/?a=1"},
		{"/news/", "<html>news</html>", 200, ""},
		{"/news/events/", "<html>events</html>", 200, ""},
		{"/robots.txt", "User-agent: *", 200, ""},
		{"/posts/1/index.txt?_rsc=abc", "rsc payload", 200, ""},
		{"/none", "<html>not found</html>", 404, ""},
		{"/none/", "<html>not found</html>", 404, ""},
		{"/robots.txt/", "<html>not found</html>", 404, ""},
		// 匯出產生的 404 頁不可回應 200
		{"/404", "<html>not found</html>", 404, ""},
		{"/404/", "<html>not found</html>", 404, ""},
		{"/404.html", "<html>not found</html>", 404, ""},
		{"/_not-found", "<html>not found</html>", 404, ""},
		{"/_not-found/", "<html>not found</html>", 404, ""},
		{"/404/index.html", "<html>not found</html>", 404, ""},
		{"/_not-found/index.html", "<html>not found</html>", 404, ""},
		// 路徑穿越：只會在網站檔案內查找
		{"/../../windows/win.ini", "<html>not found</html>", 404, ""},
		{"/..%5c..%5cwindows%5cwin.ini", "<html>not found</html>", 404, ""},
		{"/posts/../robots.txt", "User-agent: *", 200, ""},
	} {
		t.Run(test.target, func(t *testing.T) {
			res := request(t, s, http.MethodGet, test.target, nil)
			if res.StatusCode != test.wantStatus {
				t.Errorf("狀態 %d，應為 %d", res.StatusCode, test.wantStatus)
			}
			if location := res.Header.Get("Location"); location != test.wantLocation {
				t.Errorf("Location %q，應為 %q", location, test.wantLocation)
			}
			if test.wantBody != "" {
				if got := body(t, res); got != test.wantBody {
					t.Errorf("內容 %q", got)
				}
			}
		})
	}
}

func TestLegacyRouting(t *testing.T) {
	s := testServer(t)
	for _, test := range []struct {
		target       string
		wantStatus   int
		wantLocation string
	}{
		{"/p/404-1039-1.php", 308, "/posts/1/"},         // 目的地是頁面時直接補上結尾斜線
		{"/var/file/a.pdf", 308, "/legacy/files/a.pdf"}, // 檔案不補
		{"/app/index.php?Action=downloadfile&file=x", 308, "/legacy/files/a.pdf"},
		{"/p/450-1039-9.php", 308, "https://drive.google.com/file/d/abc"},
		{"/index.php", 308, "/"},
		// 多餘的斜線不影響比對
		{"/p/404-1039-1.php/", 308, "/posts/1/"},
		{"//p/404-1039-1.php", 308, "/posts/1/"},
		{"/p//404-1039-1.php", 308, "/posts/1/"},
		{"/index.php/", 308, "/"},
		{"/var/file//a.pdf", 308, "/legacy/files/a.pdf"},
		{"/app/index.php/?Action=downloadfile&file=x", 308, "/legacy/files/a.pdf"},
		{"/p/412-1039-1.php", 307, "/sitemap"},
		{"/var/file/none.pdf", 404, ""},
		{"/app/index.php?Action=downloadfile&file=none", 404, ""},
	} {
		t.Run(test.target, func(t *testing.T) {
			res := request(t, s, http.MethodGet, test.target, nil)
			if res.StatusCode != test.wantStatus || res.Header.Get("Location") != test.wantLocation {
				t.Errorf("得到 %d %q", res.StatusCode, res.Header.Get("Location"))
			}
		})
	}
	if got := body(t, request(t, s, http.MethodGet, "/var/file/none.pdf", nil)); !strings.Contains(got, "未搬遷") {
		t.Errorf("舊檔案的 404 內容：%q", got)
	}
}

// 檔案類型不可依賴作業系統（Windows 登錄檔）
func TestContentTypes(t *testing.T) {
	s := testServer(t)
	for target, want := range map[string]string{
		"/":                           "text/html; charset=utf-8",
		"/posts/1/index.txt":          "text/plain; charset=utf-8",
		"/_next/static/chunks/a.js":   "text/javascript; charset=utf-8",
		"/_next/static/media/f.woff2": "font/woff2",
		"/videos/hero.mp4":            "video/mp4",
		"/legacy/files/a.pdf":         "application/pdf",
		"/legacy/files/a.unknown":     "application/octet-stream",
	} {
		if got := request(t, s, http.MethodGet, target, nil).Header.Get("Content-Type"); got != want {
			t.Errorf("%s：%q，應為 %q", target, got, want)
		}
	}
}

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	s := testServer(t)
	for _, target := range []string{"/", "/none", "/posts/1", "/p/404-1039-1.php", "/var/file/none.pdf"} {
		header := request(t, s, http.MethodGet, target, nil).Header
		if header.Get("X-Content-Type-Options") != "nosniff" || header.Get("X-Frame-Options") != "SAMEORIGIN" ||
			header.Get("Referrer-Policy") != "strict-origin-when-cross-origin" || header.Get("Content-Security-Policy") == "" {
			t.Errorf("%s 的安全標頭不完整：%v", target, header)
		}
	}
}

// CSP 要與正式 Next 伺服器（next.config.ts）一致
func TestContentSecurityPolicyMatchesNextConfig(t *testing.T) {
	raw, err := os.ReadFile("../../next.config.ts")
	if err != nil {
		t.Fatal(err)
	}
	block := regexp.MustCompile(`(?s)const contentSecurityPolicy = \[(.*?)\]\.join`).FindSubmatch(raw)
	if block == nil {
		t.Fatal("找不到 next.config.ts 的 contentSecurityPolicy")
	}
	var directives []string
	for _, match := range regexp.MustCompile(`"([^"]+)"`).FindAllSubmatch(block[1], -1) {
		directives = append(directives, string(match[1]))
	}
	if want := strings.Join(directives, "; "); contentSecurityPolicy != want {
		t.Errorf("CSP 不一致：\n%s\n%s", contentSecurityPolicy, want)
	}
}

func TestGzipNegotiation(t *testing.T) {
	s := testServer(t)

	res := request(t, s, http.MethodGet, "/", map[string]string{"Accept-Encoding": "gzip, deflate"})
	if res.Header.Get("Content-Encoding") != "gzip" || !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
		t.Fatalf("應回應 gzip：%v", res.Header)
	}
	reader, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if string(decoded) != "<html>home</html>" {
		t.Errorf("解壓後內容 %q", decoded)
	}
	if res.ContentLength <= 0 {
		t.Errorf("應有 Content-Length：%d", res.ContentLength)
	}

	for _, acceptEncoding := range []string{"", "br", "gzip;q=0", "gzip; q=0.0"} {
		res = request(t, s, http.MethodGet, "/", map[string]string{"Accept-Encoding": acceptEncoding})
		if res.Header.Get("Content-Encoding") != "" || body(t, res) != "<html>home</html>" {
			t.Errorf("Accept-Encoding %q 不應回應 gzip", acceptEncoding)
		}
		if !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
			t.Errorf("Accept-Encoding %q 也要有 Vary", acceptEncoding)
		}
	}
	if request(t, s, http.MethodGet, "/robots.txt", map[string]string{"Accept-Encoding": "gzip"}).Header.Get("Content-Encoding") != "" {
		t.Error("沒有預先壓縮的檔案不應標示 gzip")
	}
}

func TestRangeForVideo(t *testing.T) {
	s := testServer(t)
	res := request(t, s, http.MethodGet, "/videos/hero.mp4", map[string]string{"Range": "bytes=2-5"})
	if res.StatusCode != http.StatusPartialContent || body(t, res) != "2345" {
		t.Errorf("範圍請求：%d", res.StatusCode)
	}
	if res.Header.Get("Content-Range") != "bytes 2-5/10" || res.Header.Get("Content-Type") != "video/mp4" {
		t.Errorf("範圍標頭：%v", res.Header)
	}
}

// 列出過多範圍的請求由 Go 1.27.2 起的 ServeContent 忽略（GO-2026-6609，go.mod 因此要求 1.27.3）
func TestManyRangesIgnored(t *testing.T) {
	s := testServer(t)
	res := request(t, s, http.MethodGet, "/videos/hero.mp4", map[string]string{"Range": "bytes=0-0" + strings.Repeat(",0-0", 200)})
	if res.StatusCode != http.StatusOK || body(t, res) != "0123456789" {
		t.Errorf("範圍太多應回應完整檔案：%d", res.StatusCode)
	}
	res = request(t, s, http.MethodGet, "/videos/hero.mp4", map[string]string{"Range": "bytes=0-0,2-2,4-4"})
	if res.StatusCode != http.StatusPartialContent {
		t.Errorf("少量範圍仍要支援：%d", res.StatusCode)
	}
}

// 412／416 不可帶著成功回應的標頭（長度不符會讓連線出錯，也不可被快取）
func TestFailureResponsesHaveCleanHeaders(t *testing.T) {
	s := testServer(t)
	for _, test := range []struct {
		target  string
		headers map[string]string
		status  int
	}{
		{"/", map[string]string{"Accept-Encoding": "gzip", "If-Match": `"nope"`}, http.StatusPreconditionFailed},
		{"/_next/static/media/f.woff2", map[string]string{"Range": "bytes=999999-"}, http.StatusRequestedRangeNotSatisfiable},
	} {
		res := request(t, s, http.MethodGet, test.target, test.headers)
		if res.StatusCode != test.status {
			t.Errorf("%s：%d", test.target, res.StatusCode)
		}
		for _, name := range []string{"Cache-Control", "Content-Encoding", "ETag"} {
			if value := res.Header.Get(name); value != "" {
				t.Errorf("%s 不應有 %s：%q", test.target, name, value)
			}
		}
		if res.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s 仍要有安全標頭", test.target)
		}
	}
}

func TestNotFoundGzip(t *testing.T) {
	s := testServer(t)
	res := request(t, s, http.MethodGet, "/none", map[string]string{"Accept-Encoding": "gzip"})
	if res.StatusCode != 404 || res.Header.Get("Content-Encoding") != "gzip" || !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
		t.Fatalf("%d %v", res.StatusCode, res.Header)
	}
	reader, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := io.ReadAll(reader)
	if err != nil || string(decoded) != "<html>not found</html>" {
		t.Errorf("解壓後內容 %q %v", decoded, err)
	}
	res = request(t, s, http.MethodGet, "/none", nil)
	if res.Header.Get("Content-Encoding") != "" || body(t, res) != "<html>not found</html>" {
		t.Errorf("不接受 gzip 時應回應未壓縮內容")
	}
}

func TestConditionalRequests(t *testing.T) {
	s := testServer(t)
	for _, headers := range []map[string]string{nil, {"Accept-Encoding": "gzip"}} {
		first := request(t, s, http.MethodGet, "/", headers)
		etag := first.Header.Get("ETag")
		if etag == "" {
			t.Fatal("應有 ETag")
		}
		conditional := map[string]string{"If-None-Match": etag}
		for key, value := range headers {
			conditional[key] = value
		}
		if res := request(t, s, http.MethodGet, "/", conditional); res.StatusCode != http.StatusNotModified {
			t.Errorf("%q 應回應 304，得到 %d", etag, res.StatusCode)
		}
	}
	plain := request(t, s, http.MethodGet, "/", nil).Header.Get("ETag")
	compressed := request(t, s, http.MethodGet, "/", map[string]string{"Accept-Encoding": "gzip"}).Header.Get("ETag")
	if plain == compressed {
		t.Error("壓縮與未壓縮的內容不可共用 ETag")
	}
}

func TestCacheControl(t *testing.T) {
	s := testServer(t)
	for target, want := range map[string]string{
		"/_next/static/chunks/a.js": "public, max-age=31536000, immutable",
		"/videos/hero.mp4":          "public, max-age=86400",
		"/legacy/files/a.pdf":       "public, max-age=86400",
		"/":                         "public, max-age=0, must-revalidate",
		"/none":                     "no-store",
	} {
		if got := request(t, s, http.MethodGet, target, nil).Header.Get("Cache-Control"); got != want {
			t.Errorf("%s：%q", target, got)
		}
	}
}

func TestMethods(t *testing.T) {
	s := testServer(t)
	res := request(t, s, http.MethodHead, "/", nil)
	if res.StatusCode != 200 || body(t, res) != "" || res.ContentLength <= 0 {
		t.Errorf("HEAD：%d %d", res.StatusCode, res.ContentLength)
	}
	res = request(t, s, http.MethodHead, "/none", nil)
	if res.StatusCode != 404 || body(t, res) != "" {
		t.Errorf("HEAD 404：%d", res.StatusCode)
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions} {
		res := request(t, s, method, "/", nil)
		if res.StatusCode != http.StatusMethodNotAllowed || res.Header.Get("Allow") != "GET, HEAD" {
			t.Errorf("%s：%d", method, res.StatusCode)
		}
	}
}

func TestAcceptsGzip(t *testing.T) {
	for value, want := range map[string]bool{
		"":               false,
		"gzip":           true,
		"GZIP":           true,
		"br, gzip":       true,
		"gzip;q=1.0, br": true,
		"gzip;q=0":       false,
		"gzip ; q=0.000": false,
		"x-gzip":         false,
		"deflate, br":    false,
	} {
		if got := acceptsGzip(value); got != want {
			t.Errorf("%q：%v", value, got)
		}
	}
}
