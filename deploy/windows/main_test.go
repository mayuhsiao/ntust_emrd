package main

import (
	"bufio"
	"encoding/xml"
	"errors"
	"net"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestAskPort(t *testing.T) {
	for _, test := range []struct {
		name, input string
		wantPort    int
		wantCanAsk  bool
	}{
		{"直接按 Enter 用預設值", "\r\n", 8080, true},
		{"輸入 Port（Windows 主控台以 CRLF 結尾）", "9000\r\n", 9000, true},
		{"輸入錯誤後重問", "abc\r\n70000\r\n0\r\n9001\r\n", 9001, true},
		{"輸入結束（NUL、Ctrl+Z）用預設值且不再詢問", "", 8080, false},
		{"最後一行沒有換行", "9002", 9002, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			port, canAsk := askPort(bufio.NewReader(strings.NewReader(test.input)), true, 8080)
			if port != test.wantPort || canAsk != test.wantCanAsk {
				t.Errorf("得到 %d, %v", port, canAsk)
			}
		})
	}
	if port, canAsk := askPort(bufio.NewReader(strings.NewReader("9000\n")), false, 8080); port != 8080 || canAsk {
		t.Errorf("不可詢問時應直接用預設值：%d %v", port, canAsk)
	}
}

type flakyListener struct {
	net.Listener
	failures int
}

func (l *flakyListener) Accept() (net.Conn, error) {
	if l.failures > 0 {
		l.failures--
		return nil, errors.New("WSAEMFILE")
	}
	return nil, net.ErrClosed
}

// Accept 失敗要重試，listener 關閉時才結束
func TestRetryListener(t *testing.T) {
	flaky := &flakyListener{failures: 1}
	if _, err := (retryListener{flaky}).Accept(); !errors.Is(err, net.ErrClosed) {
		t.Errorf("應重試到 listener 關閉：%v", err)
	}
	if flaky.failures != 0 {
		t.Errorf("沒有重試：%d", flaky.failures)
	}
}

func TestAutostartTaskXML(t *testing.T) {
	text := autostartTaskXML(`C:\Program Files\A&B\EMRD-Server.exe`, "--port 80 --no-browser")

	var task struct {
		XMLName  xml.Name  `xml:"Task"`
		Trigger  *struct{} `xml:"Triggers>BootTrigger"`
		UserID   string    `xml:"Principals>Principal>UserId"`
		RunLevel string    `xml:"Principals>Principal>RunLevel"`
		Limit    string    `xml:"Settings>ExecutionTimeLimit"`
		Battery  string    `xml:"Settings>DisallowStartIfOnBatteries"`
		Command  string    `xml:"Actions>Exec>Command"`
		Args     string    `xml:"Actions>Exec>Arguments"`
	}
	decoder := xml.NewDecoder(strings.NewReader(strings.Replace(text, `encoding="UTF-16"`, `encoding="UTF-8"`, 1)))
	if err := decoder.Decode(&task); err != nil {
		t.Fatal(err)
	}
	if task.Trigger == nil {
		t.Error("要在開機時啟動")
	}
	if task.UserID != "S-1-5-20" || task.RunLevel != "LeastPrivilege" {
		t.Errorf("執行身分 %q %q", task.UserID, task.RunLevel)
	}
	if task.Limit != "PT0S" {
		t.Errorf("不可有執行時間上限：%q", task.Limit)
	}
	if task.Battery != "false" {
		t.Errorf("使用電池時也要啟動：%q", task.Battery)
	}
	if task.Command != `"C:\Program Files\A&B\EMRD-Server.exe"` || task.Args != "--port 80 --no-browser" {
		t.Errorf("動作 %q %q", task.Command, task.Args)
	}
}

func TestWaitForPortFree(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := waitForPortFree("127.0.0.1", port); err == nil {
		t.Error("Port 被占用時應回報錯誤")
	}
	if !waitForServer("127.0.0.1", port) {
		t.Error("有程式在接受連線時應回報成功")
	}
	listener.Close()
	if err := waitForPortFree("127.0.0.1", port); err != nil {
		t.Errorf("Port 釋放後應可使用：%v", err)
	}
}

func TestEncodeUTF16(t *testing.T) {
	encoded := encodeUTF16("a\n中")
	if encoded[0] != 0xFF || encoded[1] != 0xFE {
		t.Fatal("缺少 BOM")
	}
	var units []uint16
	for i := 2; i < len(encoded); i += 2 {
		units = append(units, uint16(encoded[i])|uint16(encoded[i+1])<<8)
	}
	if got := string(utf16.Decode(units)); got != "a\r\n中" {
		t.Errorf("內容 %q", got)
	}
}
