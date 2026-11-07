// EMRD 官方網站的 Windows 一鍵部署程式：網站（靜態匯出的 out/）打包在單一執行檔內，執行後即可提供網頁。
//
// 以 windows/386 建置，32 位元與 64 位元的 Windows 都能執行，主機不需安裝其他軟體；
// 需要 Windows 10／Server 2016 以上。建置方式見 scripts/build_windows_package.mjs。
package main

import (
	"bufio"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const defaultPort = 8080

// buildID 於建置時以 -ldflags "-X main.buildID=…" 寫入，也是 ETag 的一部分（換版後瀏覽器才會重新下載）
var buildID = "dev"

// bundle 由建置腳本產生：site/（網站檔案）、gzip/（預先壓縮的文字檔）、redirects.json（舊站轉址清單）
//
//go:embed all:bundle
var bundle embed.FS

func main() {
	os.Exit(run())
}

func run() int {
	portFlag := flag.Int("port", 0, "網站 Port（1-65535）；未指定時於視窗中詢問")
	flag.IntVar(portFlag, "p", 0, "同 --port")
	bind := flag.String("bind", "", "只在指定的 IP 上提供網站（例：127.0.0.1）；預設為本機所有網路介面")
	noBrowser := flag.Bool("no-browser", false, "啟動後不開啟瀏覽器")
	installTask := flag.Bool("install-autostart", false, "設定開機自動啟動並立即啟動（需系統管理員身分，要同時指定 --port）")
	removeTask := flag.Bool("remove-autostart", false, "停止網站並取消開機自動啟動（需系統管理員身分）")
	flag.Parse()

	port := *portFlag
	if flag.NArg() > 0 {
		fmt.Fprintln(os.Stderr, "無法辨識的參數 / Unknown argument:", flag.Arg(0), "（指定 Port 請用 --port 8080）")
		return 2
	}
	if port != 0 && !validPort(port) {
		fmt.Fprintln(os.Stderr, "Port 必須是 1 到 65535 的整數 / Port must be 1-65535.")
		return 2
	}

	if *removeTask {
		return removeAutostart()
	}
	if *installTask {
		return installAutostart(port, *bind)
	}

	// 只有按兩下執行（沒有指定 Port）才詢問與停留；指定 Port 時可能沒有人在看（排程工作），失敗就直接結束
	attended := port == 0 && isInteractive()
	input := bufio.NewReader(os.Stdin)

	handler, err := newBundledServer()
	if err != nil {
		fmt.Println("此執行檔沒有包含網站內容 / This build has no site content:", err)
		pause(input, attended)
		return 1
	}

	fmt.Println("==================================================")
	fmt.Println(" 國立臺灣科技大學 EMRD 官方網站")
	fmt.Println(" 版本 Version：" + buildID)
	fmt.Println("==================================================")

	portFile := portFilePath()
	canAsk := attended
	var listener net.Listener
	for listener == nil {
		if port == 0 {
			port, canAsk = askPort(input, canAsk, lastPort(portFile))
		}
		listener, err = net.Listen("tcp", net.JoinHostPort(*bind, strconv.Itoa(port)))
		if err != nil {
			fmt.Printf("無法使用 Port %d（可能已被其他程式占用）/ Cannot use port %d: %v\n", port, port, err)
			if !canAsk {
				pause(input, attended)
				return 1
			}
			port = 0
		}
	}
	_ = os.WriteFile(portFile, []byte(strconv.Itoa(port)), 0o644) // 資料夾不可寫入時只是不記住，不影響網站

	printAddresses(*bind, port)

	if !*noBrowser {
		openBrowser(localURL(*bind, port))
	}

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      10 * time.Minute, // 最大的檔案約 7 MB：每秒約 12 KB 的連線也傳得完
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 16,
		// 不寫到主控台：Windows 視窗被滑鼠選取文字時，寫入主控台會卡住，連帶卡住處理中的請求
		ErrorLog: log.New(io.Discard, "", 0),
	}
	err = server.Serve(retryListener{listener})
	fmt.Println("網站已停止 / Server stopped:", err)
	pause(input, attended)
	return 1
}

// retryListener 讓 Accept 失敗（例：系統的通訊端資源暫時用盡）不會使網站停止：
// http.Server.Serve 遇到 Windows 的這類錯誤會直接結束並關閉 listener，要重試只能在這裡。
type retryListener struct {
	net.Listener
}

func (l retryListener) Accept() (net.Conn, error) {
	for {
		conn, err := l.Listener.Accept()
		if err == nil || errors.Is(err, net.ErrClosed) {
			return conn, err
		}
		time.Sleep(time.Second)
	}
}

// newBundledServer 以執行檔內的 bundle 建立網站伺服器。
func newBundledServer() (*siteServer, error) {
	site, err := fs.Sub(bundle, "bundle/site")
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		return nil, err
	}
	gzipped, err := fs.Sub(bundle, "bundle/gzip")
	if err != nil {
		return nil, err
	}
	redirects, err := bundle.ReadFile("bundle/redirects.json")
	if err != nil {
		return nil, err
	}
	legacy, err := newLegacyIndex(redirects)
	if err != nil {
		return nil, err
	}
	return &siteServer{site: site, gzipped: gzipped, legacy: legacy, buildID: buildID}, nil
}

func validPort(port int) bool {
	return port >= 1 && port <= 65535
}

// isInteractive 判斷標準輸入是否像主控台。NUL 也算（讀取時立刻得到 EOF，askPort 會改用預設值），
// 所以它只用於按兩下執行（沒有指定 Port）的流程；可能無人看管的執行方式一律指定 Port。
func isInteractive() bool {
	info, err := os.Stdin.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// askPort 詢問 Port，直接按 Enter 使用 fallback；回傳的 bool 表示之後還能不能再詢問（輸入已結束時為 false）。
func askPort(input *bufio.Reader, canAsk bool, fallback int) (int, bool) {
	for canAsk {
		fmt.Printf("請輸入網站 Port / Enter port (1-65535)，直接按 Enter 使用 / press Enter for %d：", fallback)
		line, err := input.ReadString('\n')
		text := strings.TrimSpace(line)
		if err != nil {
			canAsk = false
		}
		if text == "" {
			return fallback, canAsk
		}
		if port, convErr := strconv.Atoi(text); convErr == nil && validPort(port) {
			return port, canAsk
		}
		fmt.Println("Port 必須是 1 到 65535 的整數 / Port must be 1-65535.")
	}
	return fallback, false
}

// portFilePath 是記住上次 Port 的檔案（放在執行檔旁邊）。
func portFilePath() string {
	exe, err := os.Executable()
	if err != nil {
		return "EMRD-Server.port"
	}
	return filepath.Join(filepath.Dir(exe), "EMRD-Server.port")
}

func lastPort(file string) int {
	data, err := os.ReadFile(file)
	if err != nil {
		return defaultPort
	}
	port, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil || !validPort(port) {
		return defaultPort
	}
	return port
}

func localURL(bind string, port int) string {
	host := "localhost"
	if bind != "" && bind != "0.0.0.0" && bind != "::" {
		host = bind
	}
	return "http://" + net.JoinHostPort(host, strconv.Itoa(port)) + "/"
}

func printAddresses(bind string, port int) {
	fmt.Println()
	fmt.Println("網站已啟動 / Server started")
	fmt.Println("  本機 Local：", localURL(bind, port))
	if bind == "" || bind == "0.0.0.0" || bind == "::" {
		for _, ip := range lanIPs() {
			fmt.Println("  區網 LAN：  ", "http://"+net.JoinHostPort(ip, strconv.Itoa(port))+"/")
		}
		fmt.Printf("  其他電腦連不上時，請在 Windows 防火牆開放 TCP %d / Open TCP %d in the firewall if others cannot connect.\n", port, port)
	}
	fmt.Println()
	fmt.Println("關閉此視窗即停止網站 / Close this window to stop.")
}

func lanIPs() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var ips []string
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() || ipNet.IP.IsLinkLocalUnicast() {
			continue
		}
		if ip := ipNet.IP.To4(); ip != nil {
			ips = append(ips, ip.String())
		}
	}
	return ips
}

// openBrowser 以預設瀏覽器開啟網址；沒有瀏覽器的主機（例：Server Core）開不起來也不影響網站。
func openBrowser(url string) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		command = exec.Command("open", url)
	default:
		command = exec.Command("xdg-open", url)
	}
	_ = command.Start()
}

// pause 讓按兩下執行的視窗在出錯時停留，使用者才看得到錯誤訊息。
func pause(input *bufio.Reader, attended bool) {
	if !attended {
		return
	}
	fmt.Print("按 Enter 結束 / Press Enter to exit…")
	_, _ = input.ReadString('\n')
}
