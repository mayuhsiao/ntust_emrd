/**
 * 頁面捲動鎖定（行動版選單、全站搜尋視窗共用），以計數管理：
 * 第一個鎖定時保存 <html> 的 overflow／scrollbar-gutter，最後一個解除時才還原。
 *
 * 各元件若各自保存再還原，兩者在同一次更新中開關（例如在選單內開啟搜尋：選單收合、視窗開啟）時，
 * 後執行的 effect 會把另一方設定的 hidden 當成原值保存並在關閉時還原，頁面因而停在無法捲動的狀態。
 */
let count = 0;
let saved: { overflow: string; scrollbarGutter: string } | null = null;

/** 鎖定頁面捲動（保留捲軸寬度，避免版面左右跳動）；回傳解除函式，重複呼叫不會多解除 */
export function lockScroll() {
  const root = document.documentElement;
  if (count === 0) {
    saved = { overflow: root.style.overflow, scrollbarGutter: root.style.scrollbarGutter };
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "stable";
  }
  count += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count > 0 || !saved) return;
    root.style.overflow = saved.overflow;
    root.style.scrollbarGutter = saved.scrollbarGutter;
    saved = null;
  };
}
