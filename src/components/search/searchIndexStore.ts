"use client";

import { useSyncExternalStore } from "react";
import { withBasePath } from "@/lib/basePath";
import { prepareIndex, SEARCH_INDEX_PATH, type PreparedDoc, type SearchIndex } from "@/lib/search";

/**
 * 搜尋索引的載入狀態（整個分頁共用一份）。
 * 第一次開啟搜尋視窗（或進入 /search 頁）時才下載 /search-index.json，之後重複使用；
 * 下載失敗時回到 error 狀態，可再次呼叫 loadSearchIndex() 重試。
 */
export type SearchIndexState =
  | { status: "idle" | "loading" | "error"; items: readonly PreparedDoc[] }
  | { status: "ready"; items: readonly PreparedDoc[] };

const EMPTY: readonly PreparedDoc[] = [];
const IDLE: SearchIndexState = { status: "idle", items: EMPTY };

let state: SearchIndexState = IDLE;
const listeners = new Set<() => void>();

function setState(next: SearchIndexState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isSearchIndex(value: unknown): value is SearchIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SearchIndex).version === 1 &&
    Array.isArray((value as SearchIndex).docs)
  );
}

/** 開始下載索引（已下載或下載中時不重複） */
export function loadSearchIndex() {
  if (state.status === "loading" || state.status === "ready") return;
  setState({ status: "loading", items: EMPTY });
  fetch(withBasePath(SEARCH_INDEX_PATH), { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`search index: HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then((index) => {
      if (!isSearchIndex(index)) throw new Error("search index: unexpected format");
      setState({ status: "ready", items: prepareIndex(index) });
    })
    .catch(() => {
      setState({ status: "error", items: EMPTY });
    });
}

export function useSearchIndex(): SearchIndexState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}
