package main

import (
	"encoding/json"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// 舊站（emrd.ntust.edu.tw，Rpage）網址轉址：與 src/proxy.ts 相同的比對規則（正式 Next 伺服器用 proxy.ts，
// 靜態匯出沒有 Proxy，由本程式處理）。修改規則時兩邊都要改。

// 原站網站代碼 1039，網址形如 /p/404-1039-12345.php
var (
	// 文章網址家族：16 列印版、404 內文、405 單元內文（,c…）、406 RSS（,r…）；逗號後的變體代碼可省略
	postURL = regexp.MustCompile(`(?i)^/p/(?:16|40[456])-1039-(\d+)(?:,[^/]*)?\.php$`)
	// 450 連結紀錄（原站轉貼外部網址或檔案）
	linkURL = regexp.MustCompile(`(?i)^/p/450-1039-(\d+)(?:,[^/]*)?\.php$`)
	// 列表單元與其分頁：/p/403-1039-<單元>.php、/p/403-1039-<單元>-<頁>.php
	unitURL          = regexp.MustCompile(`(?i)^/p/403-1039-(\d+)(?:-\d+)?\.php$`)
	postDestination  = regexp.MustCompile(`^/posts/(\d+)$`)
	validDestination = regexp.MustCompile(`(?i)^(?:/(?:[^/]|$)|https?://)`)
	// 不參與比對的查詢參數（原站語系與常見追蹤參數）
	ignoredQueryKey = regexp.MustCompile(`(?i)^(?:lang|fbclid|gclid|msclkid|utm_\w+)$`)
)

type legacyRedirect struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
}

type legacyIndex struct {
	byQuery     map[string]string // 路徑＋正規化查詢字串 → 目的地
	byPath      map[string]string // 路徑 → 目的地
	byLowerPath map[string]string // 小寫路徑 → 目的地（不分大小寫的後備比對）
	postIDs     map[string]bool   // 已搬遷的文章代碼
	postPages   map[string]string // 文章代碼 → 清單中的非文章目的地
	links       map[string]string // 450 連結紀錄代碼 → 目的地
	units       map[string]string // 列表單元代碼 → 目的地
}

func newLegacyIndex(redirectsJSON []byte) (*legacyIndex, error) {
	var all []legacyRedirect
	if err := json.Unmarshal(redirectsJSON, &all); err != nil {
		return nil, err
	}
	index := &legacyIndex{
		byQuery:     map[string]string{},
		byPath:      map[string]string{},
		byLowerPath: map[string]string{},
		postIDs:     map[string]bool{},
		postPages:   map[string]string{},
		links:       map[string]string{},
		units:       map[string]string{},
	}

	var entries []legacyRedirect
	for _, entry := range all {
		if strings.HasPrefix(entry.Source, "/") && validDestination.MatchString(entry.Destination) {
			entries = append(entries, entry)
			if post := postDestination.FindStringSubmatch(entry.Destination); post != nil {
				index.postIDs[post[1]] = true
			}
		}
	}

	for _, entry := range entries {
		pathname, search := splitSource(entry.Source)
		key := pathKey(pathname)
		if query := queryKey(search); query != "" {
			setOnce(index.byQuery, key+"?"+query, entry.Destination)
			continue
		}
		if key == entry.Destination {
			continue
		}
		setOnce(index.byPath, key, entry.Destination)
		setOnce(index.byLowerPath, strings.ToLower(key), entry.Destination)

		if post := postURL.FindStringSubmatch(key); post != nil {
			if entry.Destination != "/posts/"+post[1] {
				setOnce(index.postPages, post[1], entry.Destination)
			}
			continue
		}
		if link := linkURL.FindStringSubmatch(key); link != nil {
			setOnce(index.links, link[1], entry.Destination)
			continue
		}
		if unit := unitURL.FindStringSubmatch(key); unit != nil {
			setOnce(index.units, unit[1], entry.Destination)
		}
	}
	return index, nil
}

func setOnce(target map[string]string, key, value string) {
	if _, exists := target[key]; !exists {
		target[key] = value
	}
}

func splitSource(source string) (pathname, search string) {
	withoutHash, _, _ := strings.Cut(source, "#")
	pathname, search, _ = strings.Cut(withoutHash, "?")
	return pathname, search
}

// pathKey 解碼百分比編碼，讓 %28／(、%2C／,、中文的兩種寫法視為相同；解碼後不是有效的 UTF-8 時維持原樣
// （同 decodeURIComponent 失敗）。%ZZ 這類無效編碼在到達這裡之前，net/http 就已回應 400。
func pathKey(escapedPath string) string {
	decoded, err := url.PathUnescape(escapedPath)
	if err != nil || !utf8.ValidString(decoded) {
		return escapedPath
	}
	return decoded
}

// queryKey 正規化查詢字串：去除語系與追蹤參數、參數名不分大小寫並排序。
// 比照 URLSearchParams：「+」解成空白、無效的百分比編碼維持原樣；舊站 base64 參數兩種寫法都可能出現，故空白一律還原為「+」。
func queryKey(search string) string {
	var pairs []string
	for _, part := range strings.Split(search, "&") {
		rawKey, rawValue, _ := strings.Cut(part, "=")
		key := decodeFormValue(rawKey)
		if key == "" || ignoredQueryKey.MatchString(key) {
			continue
		}
		value := decodeFormValue(rawValue)
		pairs = append(pairs, strings.ToLower(key)+"="+strings.ReplaceAll(value, " ", "+"))
	}
	sort.Strings(pairs)
	return strings.Join(pairs, "&")
}

func decodeFormValue(raw string) string {
	raw = strings.ReplaceAll(raw, "+", " ")
	decoded := make([]byte, 0, len(raw))
	for i := 0; i < len(raw); i++ {
		if raw[i] == '%' && i+2 < len(raw) {
			if value, err := strconv.ParseUint(raw[i+1:i+3], 16, 8); err == nil {
				decoded = append(decoded, byte(value))
				i += 2
				continue
			}
		}
		decoded = append(decoded, raw[i])
	}
	return strings.ToValidUTF8(string(decoded), "�")
}

// resolve 回傳目的地與是否永久轉址；無對照時 found 為 false。比對順序見 src/proxy.ts。
func (index *legacyIndex) resolve(escapedPath, search string) (destination string, permanent, found bool) {
	key := pathKey(escapedPath)

	if query := queryKey(search); query != "" {
		if target, ok := index.byQuery[key+"?"+query]; ok {
			return target, true, true
		}
	}

	if target, ok := index.byPath[key]; ok {
		return target, true, true
	}
	lower := strings.ToLower(key)
	if target, ok := index.byLowerPath[lower]; ok {
		return target, true, true
	}

	if post := postURL.FindStringSubmatch(key); post != nil {
		if target, ok := index.postPages[post[1]]; ok {
			return target, true, true
		}
		if index.postIDs[post[1]] {
			return "/posts/" + post[1], true, true
		}
	}

	if link := linkURL.FindStringSubmatch(key); link != nil {
		if target, ok := index.links[link[1]]; ok {
			return target, true, true
		}
	}

	if unit := unitURL.FindStringSubmatch(key); unit != nil {
		if target, ok := index.units[unit[1]]; ok {
			return target, true, true
		}
	}

	if lower == "/index.php" {
		return "/", true, true
	}
	if lower == "/p" || strings.HasPrefix(lower, "/p/") {
		return "/sitemap", false, true
	}
	return "", false, false
}

// isLegacyPath 對應 src/proxy.ts 的 matcher：只有這些路徑才比對舊站轉址。
func isLegacyPath(pathname string) bool {
	return pathname == "/index.php" || pathname == "/app/index.php" ||
		pathname == "/p" || strings.HasPrefix(pathname, "/p/") ||
		pathname == "/var/file" || strings.HasPrefix(pathname, "/var/file/")
}

// 舊站檔案與下載網址：無對照時直接回應 404，不顯示網站的 404 頁
var legacyFileURL = regexp.MustCompile(`(?i)^/(?:var/file/|app/index\.php$)`)

func isLegacyFilePath(escapedPath string) bool {
	return legacyFileURL.MatchString(escapedPath)
}
