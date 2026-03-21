# FE-005 — Minimap 實作摘要

> 完成時間：2026-03-21
> 負責：frontend-engineer

---

## 實作內容

在 EventStormingTool 前端新增 Minimap（小地圖）元件，提供畫布整體的鳥瞰視角與 viewport 位置指示。

---

## 技術決策

### 繪製技術：Canvas API
選擇 `<canvas>` 而非 SVG 或 div 的理由：
- 元素數量可能達到數十個 Bundle + 數十個 Note，Canvas 一次 draw call 效能最佳
- SVG 需要為每個元素產生 DOM node，div 方案同理
- Canvas API 天然支援 globalAlpha、arc、fillRect 等操作，符合需求

### 座標轉換邏輯
畫布使用 `transform: translate(panX, panY) scale(zoom)`，因此：
- Viewport 左上角在 world 座標 = `(-panX/zoom, -panY/zoom)`
- Viewport 在 world 的尺寸 = `(viewportW/zoom, viewportH/zoom)`

Minimap 計算所有元素 + viewport 的 bounding box，加上 margin，等比例縮放到 minimap 畫面空間。

### 高 DPI 支援
設定 `canvas.width = MINIMAP_W * dpr` 後再 `ctx.scale(dpr, dpr)`。
Canvas 尺寸設定本身會 reset context transform，所以 scale 只執行一次，無累積問題。

---

## 新增檔案

| 檔案 | 說明 |
|------|------|
| `src/components/Board/Minimap.tsx` | Minimap 元件本體（canvas 繪製） |

## 修改檔案

| 檔案 | 修改內容 |
|------|---------|
| `src/components/Board/Board.tsx` | import Minimap；加 `useState` + `useEffect`；canvasContainerRef + ResizeObserver 追蹤容器尺寸；在 JSX 渲染 `<Minimap>`；從 useUIStore destructure `activePath` |

---

## 功能清單

- [x] 180x110px，fixed 定位右下角（bottom: 16px, right: 16px）
- [x] 半透明深色背景（rgba(30,41,59,0.85)）+ 圓角 8px + subtle border
- [x] zIndex 90（低於 sidebar）
- [x] 計算所有 notes + bundles 的 bounding box 映射到 minimap 座標系
- [x] Note: 繪製圓形色點（r=2.5px），顏色對應 `ELEMENT_CONFIGS[note.type].color`
- [x] Bundle: 繪製黃色矩形，尺寸根據 collapsed 狀態調整（展開 496x248，收起 200x64）
- [x] Viewport 框：1.5px 藍色邊框（#3b82f6）+ 淡藍填色
- [x] 即時同步（zoom/pan/元素變化時 useEffect 重繪）
- [x] activePath 篩選時，非該 path 元素在 minimap 上 dim（opacity: 0.12-0.15）
- [x] 高 DPI 螢幕支援（devicePixelRatio）
- [x] backdrop-filter: blur(4px) 玻璃感背景
- [x] pointerEvents: none（v1 不支援點擊跳轉）

---

## 已知限制 / 後續建議

1. **點擊跳轉（nice-to-have）**：v1 省略。後續可移除 `pointerEvents: none`，計算點擊位置對應的 world 座標，呼叫 `setPan` 跳轉
2. **Board 切換時 viewportSize 初值**：初值使用 `window.innerWidth/Height`，ResizeObserver 連接後立即校正，通常不會有明顯閃爍
3. **Bundle 位置僅顯示 top-left 格**：當 Bundle 展開時左上方格子（infoNote）是空格（layout 中 top row 只有 center），實際元素從 (0, 248/2 + gap) 開始；minimap 以整個 bundle bounding box 顯示，視覺上足夠準確
