# FE-007 — 鍵盤快捷鍵與底部提示列

> 完成時間：2026-03-21

## 實作摘要

強化全域鍵盤快捷鍵處理，並新增底部 hint bar 元件。

---

## 變更清單

### 新增

- `src/components/HintBar/HintBar.tsx`
  - fixed 定位於底部中央，顯示 F / Esc / Del 快捷鍵提示
  - 使用 `focusin` / `focusout` 事件偵測 input / textarea / contentEditable focus，focus 時自動隱藏
  - 半透明深色背景 + backdrop-filter blur，`pointerEvents: none` 不干擾操作

### 修改

- `src/App.tsx`
  - import `HintBar`、`deleteBundle`、`selectedElementId`、`selectedElementType`、`setSelectedElement`
  - 統一 `isEditingText` guard（新增 `contentEditable` 檢查，原本僅檢查 INPUT/TEXTAREA）
  - `Escape`：同時清除 `selectedNoteIds` 和 `setSelectedElement(null, null)`
  - `Delete/Backspace`：優先刪除 multi-select notes，其次刪除 Detail Panel 選取的 note 或 bundle（呼叫對應的 `deleteNote` / `deleteBundle`）
  - 在 JSX 最頂層掛載 `<HintBar />`

---

## 設計決策

### F 鍵不重複綁定

`BoardCanvas.tsx` 中已有完整的 F 鍵 fitAll 實作（FE-003），且該實作能正確取得 canvas viewport ref 的實際尺寸，無需在 App.tsx 重複綁定。

### Hint bar 為何放在 App.tsx 而非 Board.tsx

Hint bar 的快捷鍵（Esc、Del）的 handler 都在 App.tsx，且 hint bar 需要在 home view 也顯示（F 鍵在 home view 雖無效，但 Esc/Del 的概念仍適用），因此放在最頂層語意最清晰。

### Delete 優先順序

Multi-select（`selectedNoteIds`）優先於 Detail Panel 單選（`selectedElementId`），因為 multi-select 是更明確的使用者意圖（批次操作），而 Detail Panel 選取是輔助資訊，兩者不應同時處理。

---

## 已知限制

- F 鍵快捷鍵的 hint 顯示在 hint bar，但 F 鍵 handler 在 `BoardCanvas.tsx`（viewport ref 所在處），在 home view 按 F 無效但 hint 仍顯示。若未來需要針對不同 view 顯示不同 hints，可依 `currentView` 動態過濾。
- `Backspace` 在 Mac 上是習慣的刪除鍵，但 hint bar 僅顯示 `Del` 以保持簡潔。

---

## 測試建議

1. 在 board view 按 F — 畫布應 fit all
2. 點選 note 開啟 Detail Panel，按 Esc — panel 關閉
3. 選取一或多個 note，按 Del/Backspace — note 被刪除
4. 從 Detail Panel 選取 bundle，按 Del — bundle 被刪除
5. 雙擊 note 進入編輯模式，按 Del — 不觸發刪除（只刪字元）
6. 點擊任意 input 欄位 — hint bar 自動隱藏；離開 input — hint bar 重新出現
