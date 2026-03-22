# FE-011 Actor PathBar 篩選器 — 實作摘要

**完成時間**：2026-03-22
**負責**：frontend-engineer
**狀態**：完成

---

## 實作內容

### 1. `src/types/elements.ts`

`FlowPath` interface 新增 `actorId?: string`，用於關聯到 `StickyNote.id`（where `type === 'Actor'`）。
此欄位為 optional，舊資料無需 migration（`undefined` 等同「未指定 Actor」）。

### 2. `src/store/uiStore.ts`

新增兩個 store 成員：
- `activeActorFilter: string | null` — 目前選中的 Actor ID，`null` 表示「All Actors」
- `setActiveActorFilter: (actorId: string | null) => void` — setter action

### 3. `src/components/PathBar/PathBar.tsx`

主要 UI 變更：

**Actor 下拉選單（PathBar 左側）**
- 位置：`PATH` label 右側，`All` tab 左側，中間用分隔線隔開
- 選項：All Actors + 從 `activeBoard.notes.filter(n => n.type === 'Actor')` 取得的 Actor 列表
- 選中的 Actor 以 `#3b82f6` 高亮（blue）
- 外觀：pill 形狀（border-radius 14px），高度 28px，符合 Path tab 風格

**FlowPath tab 篩選邏輯**
```typescript
const filteredPaths = activeActorFilter
  ? activeBoard.flowPaths.filter(fp => fp.actorId === activeActorFilter || !fp.actorId)
  : activeBoard.flowPaths;
```
未指定 `actorId` 的 FlowPath 永遠顯示（不被篩選掉）。

**Actor 刪除容錯（`useEffect`）**
當選中的 Actor StickyNote 被刪除時，`activeActorFilter` 自動 reset 為 `null`。

### 4. `src/components/PathBar/PathModal.tsx`

新增 Actor 選擇欄位（`<select>`）：
- 選項：`(No Actor)` + 所有 Actor StickyNote
- 無 Actor 時顯示提示文字
- 編輯現有 FlowPath 時預選當前 `actorId`
- 提交時將 `actorId` 包含在 `Omit<FlowPath, 'id'>` 資料中

---

## 驗收標準確認

| 項目 | 狀態 |
|------|------|
| PathBar 左側出現 Actor 下拉選單，列出當前 board 的所有 Actor | 完成 |
| 選擇特定 Actor 後，PathBar 只顯示該 Actor 的 FlowPath + 未指定 Actor 的 FlowPath | 完成 |
| 選擇 "All Actors" 時顯示全部 FlowPath | 完成 |
| 新增/編輯 FlowPath 時可以指定 Actor | 完成 |
| 刪除 Actor StickyNote 後，篩選器自動 reset 為 "All Actors" | 完成 |
| 無 Actor StickyNote 時，下拉選單只有 "All Actors" 一個選項（仍顯示，不隱藏） | 完成 |

---

## 技術備註

- `FlowPath.actorId` 是 optional，無需 persist migration（版本仍為 v5）
- FE-009 與 FE-011 平行開發期間，linter 自動將 FE-009 的 `Remodel` 型別擴充（`uiStore.ts`）合入，兩功能不互相干擾
- PathBar 的事件計數 badge 行為不受 Actor 篩選影響（仍基於所有 flowPaths 計算）
- TabBar 統計數字不受 Actor 篩選影響

---

## 變更檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `src/types/elements.ts` | 修改 | FlowPath 加 `actorId?: string` |
| `src/store/uiStore.ts` | 修改 | 加 `activeActorFilter` + `setActiveActorFilter` |
| `src/components/PathBar/PathBar.tsx` | 修改 | Actor 下拉選單、篩選邏輯、刪除容錯 |
| `src/components/PathBar/PathModal.tsx` | 修改 | Actor 選擇欄位 |
| `docs/PM-roadmap.md` | 修改 | FE-011 標記為 ✅ 完成 |
| `docs/FE-011-actor-filter-summary.md` | 新增 | 本摘要文件 |
