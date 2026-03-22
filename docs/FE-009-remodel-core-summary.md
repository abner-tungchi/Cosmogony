# FE-009 Remodel 核心功能 — 實作摘要

> 完成日期：2026-03-22

## 任務目標

在 EventStormingTool 前端實作 Remodel（Read Model 4-in-1 卡片）的完整核心功能，包含資料模型、元件、畫布整合，以及周邊系統（Minimap、Fit All、Markdown Export、Link 系統）的擴充。

---

## 變更檔案

### 新增

| 檔案 | 說明 |
|------|------|
| `src/components/Remodel/Remodel.tsx` | Remodel 畫布元件（4-in-1 冷色系配色、inline 編輯、Universe badge、dnd-kit 拖拉、Path dim） |
| `src/utils/remodelUtils.ts` | `isUniverseRemodel()` helper 函式 |
| `docs/FE-009-remodel-core-summary.md` | 本文件 |

### 修改

| 檔案 | 變更摘要 |
|------|---------|
| `src/types/elements.ts` | 新增 `Remodel` interface；`Link.fromType/toType` 加 `'remodel'`；`FlowPath` 加 `actorId?`（供 FE-011 使用） |
| `src/types/board.ts` | `Board` 加 `remodels: Remodel[]`；`UIState.linkFromType` 加 `'remodel'`；`BoardStore` 加 addRemodel/updateRemodel/deleteRemodel |
| `src/store/boardStore.ts` | 實作 addRemodel/updateRemodel/deleteRemodel；createBoard 加 remodels: []；clearBoard 清空 remodels；persist v5→v6 migration |
| `src/store/uiStore.ts` | `selectedElementType` 加 `'remodel'`；setSelectedElement/setLinkFrom 型別更新；`FitAllParams` 加 `remodels`；fitAll bounding box 包含 Remodel |
| `src/components/Board/Board.tsx` | draggedRemodelStart ref；handleDragStart/End 支援 remodel- prefix；handleCanvasMouseDown 加 Remodel 建立邏輯；DragOverlay 加 Remodel 預覽；Minimap 傳入 remodels；deleteRemodel 加入 keyboard shortcut handler |
| `src/components/Board/BoardCanvas.tsx` | 渲染 activeBoard.remodels；onLinkTarget/onDetailClick 型別加 'remodel'；fitAll 傳入 remodels；filteredRemodelCount 加入 isEmptyState 判斷 |
| `src/components/Board/Minimap.tsx` | 支援 remodels prop；computeWorldBounds 包含 remodels；繪製紫色矩形（#a78bfa） |
| `src/components/Sidebar/SidebarPalette.tsx` | 新增 Remodel (4-in-1) 按鈕（⊟）；filter ReadModel 出 ELEMENT_TYPE_LIST；fitAll 傳入 remodels |
| `src/components/DetailPanel/DetailPanel.tsx` | 新增 remodel 查找邏輯；isOpen 關閉判斷加 !remodel；title/subtitle 支援 remodel；Body 加 Remodel placeholder（FE-010 補充） |
| `src/utils/linkUtils.ts` | `DragOffset` 加 remodelIds；`getAnchorPoints` 支援 'remodel' type；新增 getRemodelBounds() |
| `src/components/Links/LinkLayer.tsx` | onDragMove 加 remodel- 判斷；getAnchorPoints 傳入 activeBoard.remodels |
| `src/utils/markdownExporter.ts` | 新增 Remodels 區塊；getLabelForId 支援 remodels |
| `src/App.tsx` | deleteRemodel 加入 keyboard Delete 處理 |
| `docs/PM-roadmap.md` | FE-009 標記為 ✅ 完成 |

---

## 配色設計

| 格子 | 語意 | 色碼 |
|------|------|------|
| 上方 | Aggregate（讀取視角） | `#e9d5ff`（淺紫） |
| 左下 | Parameters（查詢參數） | `#cffafe`（淡青） |
| 中下 | Query（查詢名稱） | `#bfdbfe`（灰藍） |
| 右下 | Source Events（事件來源） | `#ede9fe`（薰衣草） |

文字色：`#1e293b`（與 Bundle 一致）

---

## 技術決策

### isUniverse 不存 store，由 UI 層計算
- 原因：Universe 狀態取決於 linkedBundleIds 對應 Bundle 的 infoNote.label。若 Bundle 被重命名，Remodel 的 Universe 狀態須自動更新。存成 stored flag 需要額外同步邏輯，computed property 更簡潔。

### persist migration v5→v6
- `if (version <= 4)` 區塊移除 early return，改為 fall-through 到 `if (version <= 5)` 區塊
- `version < 3` 的 early return 路徑也補上了 `remodels: []`

### Link 系統更新
- `getAnchorPoints` 新增 `remodels` 可選參數，向後相容（舊呼叫不傳 remodels 也不會 crash）
- Remodel 沒有 collapsed 狀態，永遠使用 Bundle 的展開尺寸（496 x 248）

---

## 未完成（留給後續任務）

| 項目 | 後續任務 |
|------|---------|
| Remodel Detail Panel 完整編輯介面 | FE-010 |
| Linked Bundles 管理（+ Add Bundle 下拉、× 刪除） | FE-010 |
| Link Mode：Remodel ↔ Bundle 自動更新 linkedBundleIds | FE-010 |
| PhaseLane 包含 Remodel phase 範圍 | FE-010 或獨立 |
| MCP 工具 CRUD | BE-003 |

---

## 驗收狀態

| 項目 | 狀態 |
|------|------|
| 畫布可透過 Sidebar 新增 Remodel，呈現四格冷色系 | ✅ |
| Remodel 可拖動、double-click 編輯各格 | ✅ |
| Path 篩選 dim 效果 | ✅ |
| Sidebar 不再顯示 ReadModel StickyNote 按鈕 | ✅ |
| 已存在的 ReadModel StickyNote 仍可正常顯示 | ✅（ElementType 未移除） |
| persist migration v5→v6 | ✅ |
| Minimap 顯示 Remodel（紫色點） | ✅ |
| Fit All 計算包含 Remodel | ✅ |
| Markdown Export 包含 Remodel | ✅ |
