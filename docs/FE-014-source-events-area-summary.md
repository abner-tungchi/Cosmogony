# FE-014 — Source Events 附屬區域 實作摘要

## 完成狀態

完成時間：2026-03-23
負責：frontend-engineer

---

## 實作內容

### 變更檔案

**修改：**
- `src/components/Remodel/Remodel.tsx` — 加入 `SourceEventsPanel` 子元件、擴充 `Props` interface（加入 `bundles: Bundle[]`）、在 expanded view 中渲染 Source Events 區域
- `src/components/Board/BoardCanvas.tsx` — 在 `<Remodel>` 元件呼叫處加入 `bundles={activeBoard.bundles}` prop

---

## 技術設計

### SourceEventsPanel 元件

位置：`Remodel.tsx` 內部，為 file-scoped 子元件（未 export）

**資料流：純 computed，不存資料。**

```typescript
// 每次 render 即時從 bundles prop 查找
const sourceEvents = linkedBundleIds.map((bundleId) => {
  const bundle = bundles.find((b) => b.id === bundleId);
  if (!bundle) return { ..., isDeleted: true };
  return { bundleId, eventLabel: bundle.eventNote.label, aggregateLabel: bundle.infoNote.label, isDeleted: false };
});
```

Bundle 的 `eventNote.label` 修改後，Source Events 區域自動即時更新（因為 `bundles` prop 從 Zustand store 來，每次 state 變更都會觸發 re-render）。

### 展開/收合狀態管理

- `remodel.sourceEventsExpanded !== false` 為 true 時顯示展開（undefined 也算 true，符合 Remodel interface 的「預設 true by convention」）
- 點擊按鈕呼叫 `updateRemodel(id, { sourceEventsExpanded: !currentExpanded })`，持久化到 localStorage

### CSS 定位

Source Events panel 使用 `position: absolute`，`top: REMODEL_CARD_H + 4`（248 + 4 = 252px）定位在四格卡片正下方。

外層 expanded view 容器加了 `overflow: 'visible'`，使 panel 能超出父容器的高度 boundary 顯示（collapsed view 維持 `overflow: 'hidden'`）。

---

## 驗收標準確認

| # | 驗收標準 | 狀態 |
|---|---------|------|
| 1 | Remodel 展開時，下方顯示 Source Events 區域，列出所有 linked Bundles 的 eventNote.label | ✅ |
| 2 | 修改某個 linked Bundle 的 eventNote.label 後，Source Events 區域即時更新 | ✅ — computed，自動反映 |
| 3 | 點擊收合按鈕後，Source Events 區域收合為「N Source Events ▼」摘要行 | ✅ |
| 4 | 點擊展開按鈕後，恢復完整 event 列表 | ✅ |
| 5 | linkedBundleIds 為空時顯示空狀態提示 | ✅ |
| 6 | 已刪除的 Bundle 顯示為 "(Deleted Bundle)" 灰色斜體 | ✅ |
| 7 | Remodel 本體收合時，Source Events 區域不渲染 | ✅ — collapsed view return 不含 SourceEventsPanel |
| 8 | 拖動 Remodel 時，Source Events 區域跟著移動 | ✅ — 同一個 DOM 容器的子元素 |
| 9 | Path 篩選 dim 效果覆蓋 Source Events 區域 | ✅ — 繼承父容器 opacity |

---

## 注意事項

- Minimap、fitAll、Link 錨點均不受影響（規格設計如此，Source Events 不計入有效尺寸）
- `bundles` prop 設為 required（非 optional），強制 BoardCanvas 明確傳入，避免 Source Events 顯示錯誤資料
- `SourceEventsPanel` 不 export，為 file-scoped 元件，只有 Remodel 使用
