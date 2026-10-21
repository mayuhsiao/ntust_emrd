/**
 * 頁面捲動鎖定（行動版選單、全站搜尋視窗共用），以計數管理：
 * 第一個鎖定時保存 <html> 的 overflow／scrollbar-gutter，最後一個解除時才還原。
 *
 * 各元件若各自保存再還原，兩者在同一次更新中開關（例如在選單內開啟搜尋：選單收合、視窗開啟）時，
 * 後執行的 effect 會把另一方設定的 hidden 當成原值保存並在關閉時還原，頁面因而停在無法捲動的狀態。
 */
let count = 0;
let saved: { overflow: string; scrollbarGutter: string } | null = null;
const listeners = new Set<() => void>();

/** 鎖定狀態改變（未鎖定 ↔ 已鎖定）時通知訂閱者 */
function notify() {
  for (const listener of listeners) listener();
}

/** 鎖定頁面捲動（保留捲軸寬度，避免版面左右跳動）；回傳解除函式，重複呼叫不會多解除 */
export function lockScroll() {
  const root = document.documentElement;
  const wasUnlocked = count === 0;
  if (wasUnlocked) {
    saved = { overflow: root.style.overflow, scrollbarGutter: root.style.scrollbarGutter };
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "stable";
  }
  count += 1;
  if (wasUnlocked) notify();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count > 0) return;
    if (saved) {
      root.style.overflow = saved.overflow;
      root.style.scrollbarGutter = saved.scrollbarGutter;
      saved = null;
    }
    notify();
  };
}

/**
 * 目前是否有選單或搜尋視窗鎖定頁面（供 useSyncExternalStore 讀取）。
 * 在選單內開啟搜尋時，解除與鎖定發生在同一次 commit，訂閱者重新讀取時已回到「鎖定」，不會閃現。
 */
export function isScrollLocked() {
  return count > 0;
}

/** 訂閱鎖定狀態的變化；回傳取消訂閱函式 */
export function subscribeScrollLock(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
