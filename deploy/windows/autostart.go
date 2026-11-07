package main

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

const autostartTaskName = "EMRD Website"

// installAutostart 以 Windows 工作排程器設定開機自動啟動並立即啟動。
// 用 XML 建立工作：schtasks 的參數沒有辦法取消預設的「執行超過 3 天就停止」與「使用電池時不啟動」。
func installAutostart(port int, bind string) int {
	if port == 0 {
		fmt.Fprintln(os.Stderr, "請同時指定 Port / Please also pass the port：EMRD-Server.exe --install-autostart --port 8080")
		return 2
	}
	if bind != "" && net.ParseIP(bind) == nil {
		fmt.Fprintln(os.Stderr, "--bind 必須是 IP 位址 / --bind must be an IP address:", bind)
		return 2
	}
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "找不到執行檔路徑 / Cannot locate this program:", err)
		return 1
	}

	// 先停止舊的執行個體：舊的還在執行時 /Run 不會啟動新的，網站會停在舊 Port
	stopAutostart()
	if err := waitForPortFree(bind, port); err != nil {
		fmt.Fprintf(os.Stderr, "Port %d 已被其他程式占用（有按兩下開啟的視窗請先關閉），請換一個 / Port %d is in use: %v\n", port, port, err)
		return 1
	}

	arguments := fmt.Sprintf("--port %d --no-browser", port)
	if bind != "" {
		arguments += " --bind " + bind
	}
	file, err := os.CreateTemp("", "emrd-autostart-*.xml")
	if err != nil {
		fmt.Fprintln(os.Stderr, "無法建立暫存檔 / Cannot create a temporary file:", err)
		return 1
	}
	defer os.Remove(file.Name())
	_, err = file.Write(encodeUTF16(autostartTaskXML(exe, arguments)))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "無法寫入暫存檔 / Cannot write a temporary file:", err)
		return 1
	}

	if err := runSchtasks("/Create", "/TN", autostartTaskName, "/XML", file.Name(), "/F"); err != nil {
		fmt.Fprintln(os.Stderr, "設定失敗，請以系統管理員身分開啟命令提示字元再執行一次 / Failed; run again as administrator:", err)
		return 1
	}
	if err := runSchtasks("/Run", "/TN", autostartTaskName); err != nil {
		fmt.Fprintln(os.Stderr, "已設定開機自動啟動，但無法立即啟動 / Configured, but could not start now:", err)
		return 1
	}
	// /Run 只代表工作已排入，程式可能讀不到執行檔或無法使用 Port：要連得上才算啟動成功
	if !waitForServer(bind, port) {
		fmt.Fprintf(os.Stderr, "已設定開機自動啟動，但網站沒有在 Port %d 回應。請確認執行檔放在 NETWORK SERVICE 讀得到的資料夾（建議 C:\\Program Files\\EMRD），並以 schtasks /Query /TN \"%s\" /V /FO LIST 查看結果 / Configured, but the site did not respond.\n", port, autostartTaskName)
		return 1
	}
	fmt.Printf("已設定開機自動啟動，網站已在 Port %d 啟動 / Auto-start configured; the site is running on port %d.\n", port, port)
	fmt.Printf("停止網站 / Stop：schtasks /End /TN \"%s\"\n", autostartTaskName)
	fmt.Println("取消自動啟動 / Remove：EMRD-Server.exe --remove-autostart")
	return 0
}

// removeAutostart 停止網站並刪除工作（只刪除工作不會停止執行中的程式）。
func removeAutostart() int {
	stopAutostart()
	if err := runSchtasks("/Delete", "/TN", autostartTaskName, "/F"); err != nil {
		fmt.Fprintln(os.Stderr, "取消失敗，請以系統管理員身分開啟命令提示字元再執行一次 / Failed; run again as administrator:", err)
		return 1
	}
	fmt.Println("已停止網站並取消開機自動啟動 / Stopped and removed auto-start.")
	return 0
}

// stopAutostart 停止工作啟動的網站；工作不存在或網站沒有在執行時會失敗，兩者都不影響接下來的步驟，所以不顯示輸出。
func stopAutostart() {
	_ = exec.Command("schtasks", "/End", "/TN", autostartTaskName).Run()
}

// waitForPortFree 確認 Port 可用；剛停止的程式可能還沒釋放，所以多試幾次。
func waitForPortFree(bind string, port int) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Second)
		}
		var listener net.Listener
		listener, err = net.Listen("tcp", net.JoinHostPort(bind, strconv.Itoa(port)))
		if err == nil {
			return listener.Close()
		}
	}
	return err
}

// waitForServer 等待網站開始接受連線，最多約 15 秒。
func waitForServer(bind string, port int) bool {
	host := bind
	if host == "" || net.ParseIP(host).IsUnspecified() {
		host = "127.0.0.1"
	}
	for attempt := 0; attempt < 15; attempt++ {
		connection, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), time.Second)
		if err == nil {
			connection.Close()
			return true
		}
		time.Sleep(time.Second)
	}
	return false
}

func runSchtasks(arguments ...string) error {
	command := exec.Command("schtasks", arguments...)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	return command.Run()
}

// autostartTaskXML 產生工作排程器的工作定義：
//   - ExecutionTimeLimit PT0S：不限執行時間（預設 3 天後會被停止，要到下次開機才恢復）；
//   - DisallowStartIfOnBatteries、StopIfGoingOnBatteries 為 false：不間斷電源可能被回報為電池；
//   - S-1-5-20（NETWORK SERVICE）：網站只讀取執行檔內的檔案，不需要 SYSTEM 權限；
//   - RestartOnFailure：程式啟動失敗時每分鐘重試，最多 3 次（不涵蓋程式啟動後才結束的情況，例如 Port 被占用）；
//   - Command 加上引號：Go 依原始命令列解析參數，路徑含空白（C:\Program Files）時不加引號會被拆開。
func autostartTaskXML(exe, arguments string) string {
	return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>EMRD official website (EMRD-Server.exe)</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-20</UserId>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>` + escapeXML(`"`+exe+`"`) + `</Command>
      <Arguments>` + escapeXML(arguments) + `</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

func escapeXML(text string) string {
	var buffer bytes.Buffer
	_ = xml.EscapeText(&buffer, []byte(text))
	return buffer.String()
}

// encodeUTF16 輸出 schtasks /XML 要求的 UTF-16（小端序、含 BOM）。
func encodeUTF16(text string) []byte {
	units := utf16.Encode([]rune(strings.ReplaceAll(text, "\n", "\r\n")))
	encoded := make([]byte, 0, 2+2*len(units))
	encoded = append(encoded, 0xFF, 0xFE)
	for _, unit := range units {
		encoded = append(encoded, byte(unit), byte(unit>>8))
	}
	return encoded
}
