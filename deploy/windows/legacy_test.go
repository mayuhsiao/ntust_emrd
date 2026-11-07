package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

const redirectsPath = "../../src/content/legacy/data/redirects.json"

func loadLegacyIndex(t *testing.T) (*legacyIndex, []legacyRedirect) {
	t.Helper()
	raw, err := os.ReadFile(redirectsPath)
	if err != nil {
		t.Fatal(err)
	}
	var entries []legacyRedirect
	if err := json.Unmarshal(raw, &entries); err != nil {
		t.Fatal(err)
	}
	index, err := newLegacyIndex(raw)
	if err != nil {
		t.Fatal(err)
	}
	return index, entries
}

// 清單中的每一筆都要轉到清單寫的目的地
func TestEveryListedRedirectResolves(t *testing.T) {
	index, entries := loadLegacyIndex(t)
	if len(entries) < 900 {
		t.Fatalf("清單只有 %d 筆", len(entries))
	}
	for _, entry := range entries {
		pathname, search := splitSource(entry.Source)
		destination, permanent, found := index.resolve(pathname, search)
		if !found || !permanent || destination != entry.Destination {
			t.Errorf("%s → %q（permanent=%v, found=%v），應為 %s", entry.Source, destination, permanent, found, entry.Destination)
		}
	}
}

func TestLegacyVariants(t *testing.T) {
	index, _ := loadLegacyIndex(t)
	for _, test := range []struct {
		name, path, query, destination string
		permanent, found               bool
	}{
		{"語系參數不影響比對", "/p/404-1039-76672.php", "Lang=zh-tw", "/posts/76672", true, true},
		{"文章的單元內文變體", "/p/405-1039-76672,c999.php", "", "/posts/76672", true, true},
		{"文章的列印版", "/p/16-1039-76672.php", "", "/posts/76672", true, true},
		{"舊首頁", "/index.php", "", "/", true, true},
		{"未知的舊頁面暫時轉到網站導覽", "/p/412-1039-1.php", "", "/sitemap", false, true},
		{"未知的舊文章暫時轉到網站導覽", "/p/404-1039-1.php", "", "/sitemap", false, true},
		{"未搬遷的舊檔案沒有對照", "/var/file/39/1039/img/none.jpg", "", "", false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			destination, permanent, found := index.resolve(test.path, test.query)
			if destination != test.destination || permanent != test.permanent || found != test.found {
				t.Errorf("得到 %q permanent=%v found=%v", destination, permanent, found)
			}
		})
	}
}

// 依查詢字串比對的舊下載網址：「+」與空白、參數順序、語系參數都不影響結果
func TestQueryRedirectNormalization(t *testing.T) {
	index, entries := loadLegacyIndex(t)
	checked := 0
	for _, entry := range entries {
		pathname, search := splitSource(entry.Source)
		if search == "" {
			continue
		}
		checked++
		parts := strings.Split(search, "&")
		for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
			parts[i], parts[j] = parts[j], parts[i]
		}
		reordered := strings.Join(parts, "&") + "&Lang=zh-tw"
		destination, _, found := index.resolve(pathname, reordered)
		if !found || destination != entry.Destination {
			t.Errorf("%s 調整順序後得到 %q", entry.Source, destination)
		}
	}
	if checked == 0 {
		t.Fatal("清單中沒有依查詢字串比對的轉址")
	}
}
