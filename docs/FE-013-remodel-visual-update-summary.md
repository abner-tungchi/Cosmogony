# FE-013 Remodel 視覺更新 — 完成摘要

**完成時間**：2026-03-23
**任務狀態**：✅ 完成

---

## 實作內容

### 1. 配色更新

| 格子 | 欄位 | 舊顏色 | 新顏色 | 說明 |
|------|------|--------|--------|------|
| 右下 | `returnTypeNote` | `#ede9fe`（薰衣草） | `#bbf7d0`（薄荷綠） | 區分「輸出/回傳型別」與「輸入參數」（cyan） |

其他格子不變：
- 上方 `aggregateNote`：`#e9d5ff`（淡紫）
- 左下 `parameterNote`：`#cffafe`（青色）
- 中下 `queryNote`：`#bfdbfe`（藍灰）

### 2. 收合/展開功能

**展開狀態**（預設）：
- 完整 4-in-1 卡片（496 × 248px）
- 左上角新增收合按鈕（▲），紫色 `#a78bfa` 背景

**收合狀態**：
- 縮小卡片（200 × 64px），與 Bundle 收合尺寸相同
- 背景色：`#a78bfa`（紫色）
- 主標題：`queryNote.label`（粗體 12px）
- 副標題：`aggregateNote.label`（半透明小字 10px，有值才顯示）
- Universe badge 仍顯示（若 `isUniverseRemodel` 為 true）
- 右側中央展開按鈕（▼），`rgba(255,255,255,0.25)` 背景
- 收合狀態下不渲染子 SubNote 區域（自然不顯示 Source Events，與 FE-014 兼容）

### 3. linkUtils.ts 更新

新增 `COLLAPSED_REMODEL_W = 200` 和 `COLLAPSED_REMODEL_H = 64` 常數。

`getRemodelBounds()` 現在根據 `remodel.collapsed` 狀態返回正確的邊界尺寸（之前 Remodel 總是使用展開尺寸），確保收合後的 Link 連接點計算正確。

---

## 變更檔案

| 檔案 | 變更說明 |
|------|---------|
| `src/components/Remodel/Remodel.tsx` | 配色更新、新增收合/展開視圖、收合/展開按鈕 |
| `src/utils/linkUtils.ts` | 新增 `COLLAPSED_REMODEL_W/H` 常數、更新 `getRemodelBounds` 支援收合狀態 |

---

## 備註

- FE-014（Source Events 附屬區域）在收合狀態下自然不顯示，因為整個 SubNote 層不渲染。FE-014 實作時只需確保附屬區域在 `collapsed` 為 false 時才渲染即可。
- `COLORS.sourceEvent` 欄位已移除，改用語意明確的 `COLORS.returnType`，避免未來混淆。
