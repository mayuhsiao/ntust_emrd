國立臺灣科技大學 EMRD 官方網站 — Windows 部署包
==================================================

只有一個檔案 EMRD-Server.exe，網站內容都在裡面。32 位元（x86）與 64 位元（x64）的
Windows 都用同一個檔案，主機不需要安裝 Node.js、IIS 或其他軟體。
支援 Windows 10／Windows Server 2016 以上。


一、啟動網站
------------
1. 把 EMRD-Server.exe 複製到主機上的資料夾（請先解壓縮，不要在壓縮檔裡直接執行）。
   正式主機建議放在只有管理員能修改的資料夾，例如 C:\Program Files\EMRD。
2. 按兩下 EMRD-Server.exe。
3. 輸入要使用的 Port 後按 Enter（直接按 Enter 會使用上次的 Port，第一次是 8080）。
4. 瀏覽器會自動開啟網站；黑色視窗會列出本機與區網的網址。

要停止網站：關閉黑色視窗。
注意：登出 Windows 也會停止網站（只中斷遠端桌面連線不會）。主機要長期提供網站時，
請用下面第四節的開機自動啟動。


二、第一次執行可能看到的提示
----------------------------
- 「Windows 已保護您的電腦」（SmartScreen）：本程式尚未做數位簽章。
  按「其他資訊」→「仍要執行」。
- Windows 防火牆詢問是否允許存取：要讓其他電腦連線請按「允許」。
  沒有出現詢問、其他電腦又連不上時，以系統管理員身分開啟命令提示字元執行
  （8080 請換成實際的 Port）：

    netsh advfirewall firewall add rule name="EMRD Website" dir=in action=allow protocol=TCP localport=8080

- 「無法使用 Port」：該 Port 已被其他程式占用（Port 80 常見於 IIS），請換一個。
- Windows Server 2016／2019 內建的 Internet Explorer 無法正確顯示本網站，這不代表網站有問題。
  請改用 Edge 或 Chrome，或從其他電腦連線確認。


三、用指令指定 Port
-------------------
在命令提示字元中切換到 EMRD-Server.exe 所在的資料夾：

    EMRD-Server.exe --port 8080                  指定 Port，不再詢問
    EMRD-Server.exe --port 8080 --no-browser     不自動開啟瀏覽器
    EMRD-Server.exe --port 8080 --bind 127.0.0.1 只接受本機連線（由 IIS 等反向代理轉入時）

指定 Port 時若該 Port 無法使用，程式會顯示原因後直接結束。


四、開機後自動啟動
------------------
以系統管理員身分開啟命令提示字元，切換到 EMRD-Server.exe 所在的資料夾後執行
（80 請換成實際的 Port）：

    EMRD-Server.exe --install-autostart --port 80

設定完成後網站會立即在背景啟動，之後每次開機也會自動啟動，不需要有人登入，也不會出現黑色視窗。
程式會確認網站真的連得上才顯示成功；Port 被占用或程式無法啟動時會顯示原因。
請先關閉按兩下開啟的視窗，並確認第二節的防火牆已開放該 Port。
要換 Port 時，用新的 Port 再執行一次同樣的指令即可。

    停止網站：    schtasks /End /TN "EMRD Website"
    再次啟動：    schtasks /Run /TN "EMRD Website"
    查看狀態：    schtasks /Query /TN "EMRD Website" /V /FO LIST
    取消自動啟動：EMRD-Server.exe --remove-autostart   （同時會停止網站）

請不要把 EMRD-Server.exe 放在桌面或個人資料夾：自動啟動使用權限較低的 NETWORK SERVICE 帳戶，
可能讀不到這些位置。之後若移動了 EMRD-Server.exe，要重新執行一次設定。


五、其他事項
------------
- 更新網站內容：開發端重新建置後，先停止網站（關閉視窗，或執行第四節的停止指令），
  用新的 EMRD-Server.exe 覆蓋舊檔，再啟動。執行中的 EXE 無法被覆蓋。
- HTTPS：本程式只提供 HTTP。需要 HTTPS 時，由 IIS 或學校的反向代理處理憑證，再轉到本程式的 Port。
- 舊網站網址（emrd.ntust.edu.tw 的 /p/… 與 /var/file/…）會自動轉到新網站對應的頁面。
- EMRD-Server.port 是程式自動產生、用來記住上次 Port 的檔案，可以刪除。
