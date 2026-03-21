# FE-003 — Fit All 自適應縮放 實作摘要

> 完成時間：2026-03-21
> 負責：frontend-engineer

---

## 實作概覽

實作 Fit All 功能，讓使用者一鍵將畫布縮放並平移至顯示所有元素的最適視野。

---

## 變更檔案

### `src/store/uiStore.ts`
- 新增 `FitAllParams` interface（notes、bundles、viewportWidth、viewportHeight）
- 新增 `fitAll` action 到 `UIStore` interface 及實作
- 新增模組頂層常數：
  - `NOTE_DEFAULT_WIDTH = 160`、`NOTE_DEFAULT_HEIGHT = 80`
  - `BUNDLE_WIDTH = 496`、`BUNDLE_HEIGHT = 248`
  - `FIT_ALL_PADDING = 80`
  - `ZOOM_MIN = 0.25`、`ZOOM_MAX = 3`
- `fitAll` 邏輯：
  1. 無元素時 → `resetView`（zoom=1, pan=0,0）
  2. 遍歷所有 notes + bundles 計算 bounding box
  3. 加 80px padding
  4. 計算 `rawZoom = min(vpW / bbW, vpH / bbH)`，clamp 至 0.25–3
  5. 計算 panX/panY 使 bounding box 居中於 viewport

### `src/components/Board/BoardCanvas.tsx`
- 從 `useUIStore` 取得 `fitAll`
- 新增 `F` 鍵快捷鍵（`useEffect` + `window.addEventListener('keydown')`）
  - 跳過條件：`INPUT`、`TEXTAREA`、`contentEditable` focus 中
  - 使用 `containerRef.getBoundingClientRect()` 取得實際 viewport 尺寸

### `src/components/Board/Board.tsx`
- 對主畫布容器 `<div>` 加上 `id="board-canvas-viewport"`，供 SidebarPalette 按鈕查詢尺寸

### `src/components/Sidebar/SidebarPalette.tsx`
- 從 `useUIStore` 取得 `fitAll`
- 新增 `handleFitAll` handler（查詢 `#board-canvas-viewport` 取得 rect，fallback to `window.innerWidth/Height`）
- 在 Board section 的 zoom 控制列加入 `⊡` Fit All 按鈕
  - 展開模式：排在 Reset view（⌂）旁邊
  - 收起模式：排在 ⌂ 下方
  - `title="Fit All (F)"` 提示快捷鍵

---

## 技術決策說明

**`fitAll` 放在 `uiStore`（非 utils/ 中的純函式）**

因為它需要直接呼叫 `set({ zoom, panX, panY })`，放在 store action 裡語意最清晰，且與 `resetView` 保持一致的模式。`FitAllParams` 由呼叫端（BoardCanvas、SidebarPalette）負責傳入 viewport 尺寸，讓 store 保持對 DOM 的無感知（viewport 尺寸不放進 store state）。

**Bundle 尺寸用固定常數 496x248**

與 `handleBundleSelected` 中的計算（`160*3 + 8*2 = 496`、`120*2 + 8 = 248`）一致，不從 DOM 量測以避免時序問題。collapsed bundle 尺寸（`COLLAPSED_BUNDLE_W/H`）不納入計算，因 fitAll 針對的是完整展開視圖。

---

## 已知限制 / 後續建議

- Collapsed bundle 的尺寸比展開小，目前 fitAll 以展開尺寸（496x248）計算，若使用者全部收起再按 Fit All 會稍有過多留白。後續可在 `fitAll` 中根據 `bundle.collapsed` 改用 `COLLAPSED_BUNDLE_W/H`。
- Bundle 的 `BUNDLE_WIDTH/HEIGHT` 常數與 `src/utils/linkUtils.ts` 中的 `COLLAPSED_BUNDLE_W/H` 類似，未來考慮統一到共享常數檔。
