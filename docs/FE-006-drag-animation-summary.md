# FE-006 拖曳微旋轉動畫效果 — 任務結果摘要

> 完成時間：2026-03-21
> 負責：frontend-engineer

---

## 實作說明

### 架構決策

dnd-kit 的拖曳機制在拖曳期間有兩個視覺層：

1. **原始元件**（`StickyNote` / `Bundle`）：拖曳時 `opacity: 0`，在原始位置隱形
2. **DragOverlay**（`Board.tsx`）：拖曳時顯示的幽靈副本，跟隨滑鼠移動

所有拖曳動畫效果都在 `Board.tsx` 的 `DragOverlay` 內實作，不需修改 `StickyNote.tsx` 或 `Bundle.tsx`，也不影響拖曳位置計算。

### 拖曳時效果（scale + rotate）

在 `DragOverlay` 的所有 children 上加入：
```
transform: scale(1.05) rotate(1.5deg)
```
以及 enhanced box-shadow：
```
box-shadow: 0 8px 24px rgba(0,0,0,0.2)
```

覆蓋類型：
- **一般 StickyNote**（矩形）：直接在外層 `div` 加 `transform`
- **Diamond StickyNote**（菱形）：外層 wrapper 加 `transform`，內層 `rotate(45deg)` 維持不變（疊加效果視覺上正常）；用 `filter: drop-shadow()` 取代 `box-shadow` 避免 rotated 元素的 shadow 裁切問題
- **Bundle（collapsed）**：直接在外層 `div` 加 `transform`
- **Bundle（expanded）**：外層 wrapper 加 `transform` + `filter: drop-shadow()`（multi-card 佈局無法用 `box-shadow`）

### 放下時平滑回復

取代原本的 `dropAnimation={null}`，改用自訂 `DropAnimation` config：

```ts
const DRAG_DROP_ANIMATION: DropAnimation = {
  keyframes: ({ transform }) => [
    {
      transform: `translate3d(...initial) scale(1.05) rotate(1.5deg)`,
      opacity: 0.45,
    },
    {
      transform: `translate3d(...final) scale(1) rotate(0deg)`,
      opacity: 0,
    },
  ],
  duration: 200,
  easing: 'ease',
  sideEffects: null,
};
```

效果：DragOverlay 在放下時於原地縮小 + 淡出（200ms ease），不會有「飛回原始位置」的視覺錯亂。`sideEffects: null` 確保不會對原始元件套用任何額外樣式。

同時，原始元件的 `opacity: 0 → 1` 回復有既有 transition（200ms ease），搭配後形成自然的「放下」視覺感。

---

## 變更檔案

| 檔案 | 變更內容 |
|------|---------|
| `src/components/Board/Board.tsx` | 新增 `DRAG_DROP_ANIMATION` 常數；DragOverlay 所有 children 加入 `transform: scale(1.05) rotate(1.5deg)`；`dropAnimation={null}` 改為 `dropAnimation={DRAG_DROP_ANIMATION}` |
| `docs/PM-roadmap.md` | FE-006 狀態更新為 ✅ 完成 |

---

## 注意事項

- Diamond note 外層 transform 與內層 `rotate(45deg)` 會疊加，實際旋轉角度為 46.5deg，視覺效果正常
- `filter: drop-shadow()` 用於 Diamond 和 expanded Bundle，因為這些元件用 `position: absolute` 排列子元件，`box-shadow` 只會套用在容器 bounding box 上，效果不正確
- `sideEffects: null` 關閉 dnd-kit 預設的 side effects，避免對原始元件產生未預期的樣式修改
