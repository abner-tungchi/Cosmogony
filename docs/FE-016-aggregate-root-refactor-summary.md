# FE-016: Entity → Aggregate Root 流程重構

## 任務摘要

重構 Entity 升格 Aggregate Root 的整體流程，從「保留 Entity + 新建 Aggregate note」改為「Entity type 直接轉換成 Aggregate」，並支援多個 DomainEvent 共享同一個 Aggregate note。

---

## 實作狀況

### Task 1: Store Actions 重構（boardStore.ts）

已完成，於上一版已實作：

- **`setEntityAsAggregateRoot(entityNoteId)`**：Entity type 直接轉換為 `Aggregate`，清除 `isAggregateRoot`、`linkedAggregateNoteId`，不再新建另一張 note。
- **`unsetEntityAsAggregateRoot(aggregateNoteId)`**：將 Aggregate type 改回 Entity，清除所有非 original group 的 DomainEvent 的 `entityId` 引用。
- **`linkEventToAggregate(eventId, aggregateNoteId)`**：讓其他 DomainEvent 引用共享的 Aggregate note，自動刪除被取代的衛星 Entity note。
- **`deleteNote` Aggregate cascade**：刪除 Aggregate note 時自動清除所有 DomainEvent 的 `entityId` 引用。

### Task 2: BoardCanvas 渲染重構（BoardCanvas.tsx）

已完成，於上一版已實作：

- `computeAggregateVirtualPosition()`：計算共享 Aggregate 在非 original group 中的虛擬位置。
- `computeGroupBoundingBoxes()`：bounding box 計算已納入虛擬 Aggregate 位置。
- `sharedAggregateInstances` 渲染邏輯：每個引用 Aggregate 的 DomainEvent 都渲染一份 ghost copy，non-original group 的 ghost 設為 `isDragDisabled`。

### Task 3: DetailPanel 更新

GroupPanel（Group Panel）三個 State 已完成（上一版）：
- **State A**：無 Entity 也無 Aggregate → 顯示 `+ Add Entity` + `Link Aggregate` 下拉選單
- **State B**：有 Entity（未升格）→ 顯示 Entity 名稱 + `Mark as Aggregate Root` 按鈕
- **State C**：entityId 指向 Aggregate note → 顯示 Aggregate 名稱 + 引用計數 + `Unlink` / `Unmark Aggregate Root` 按鈕

EntityPanel（本次修改）：
- 移除 legacy `isAggregateRoot` / `linkedAggregateNoteId` UI 分支（在新流程中永遠不會被觸發）
- 移除未使用的 `allNotes` prop
- 簡化為只顯示 "Mark as Aggregate Root" 按鈕

### Task 4: Export 更新（markdownExporter.ts）

新增 `## Aggregates` 區段，位於 Domain Event Flows 和 Remodels 之間：
- 列出每個 Aggregate note 的名稱
- 列出所有 `entityId === agg.id` 的 DomainEvent

---

## 變更檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `src/components/DetailPanel/DetailPanel.tsx` | 修改 | EntityPanel 移除 legacy isAggregateRoot UI，清理 allNotes prop |
| `src/utils/markdownExporter.ts` | 修改 | 新增 Aggregates 區段 |

---

## 設計決策

- `isAggregateRoot` 和 `linkedAggregateNoteId` 欄位保留在 TypeScript 型別定義（向後相容），不在新流程中寫入。
- Aggregate type note 在 Detail Panel 路由到 `NotePanel`（通用 Panel），暫無專屬 AggregatePanel。
- Option Y（每個引用 group 各自渲染一份，資料共享）：label 更新時所有 group 自動同步，因為都讀同一份資料。
