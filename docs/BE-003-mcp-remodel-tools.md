# BE-003 — MCP 工具擴充（Remodel CRUD）

> 完成時間：2026-03-22
> 負責：backend-engineer

---

## 概述

在 `mcp-server/src/index.ts` 新增完整的 Remodel CRUD MCP 工具，讓 AI 可以透過 MCP 建立、讀取、更新、刪除 Read Model 投影卡片（Remodel）。

---

## 異動清單

### `mcp-server/src/index.ts`

#### 型別新增 / 更新

| 型別 | 說明 |
|------|------|
| `Remodel` interface | 新增，與 `src/types/elements.ts` 保持一致 |
| `Link.fromType / toType` | `'note' \| 'bundle'` → `'note' \| 'bundle' \| 'remodel'` |
| `Board.remodels` | 新增 `remodels: Remodel[]` 欄位 |
| `FlowPath.actorId` | 新增 optional `actorId?: string`（同步 FE-011 資料模型） |

#### 函式新增

| 函式 | 說明 |
|------|------|
| `nextRemodelX()` | Auto-layout：回傳現有 bundles + remodels 最右側 X + 736 |
| `isUniverseRemodel(remodel, bundles)` | 計算 Remodel 是否跨越多個 Aggregate Root |

#### 遷移更新（`migrateProject`）

- 舊資料載入時自動補 `board.remodels = []`
- 舊 remodel 資料補 `paths = []` 和 `linkedBundleIds = []`

#### 新增 MCP 工具

| 工具名稱 | 說明 |
|---------|------|
| `es_add_remodel` | 建立 Remodel，回傳完整 JSON（含 `_isUniverse`） |
| `es_update_remodel` | Partial update，sub-note 僅更新提供的欄位 |
| `es_delete_remodel` | 刪除 Remodel 及所有相關 Link |

#### 擴充既有工具

| 工具名稱 | 變更 |
|---------|------|
| `es_get_board` | 回傳 `remodels` 陣列，每筆附帶 `_isUniverse` computed 欄位 |
| `es_get_project` | context summary 加入 `remodelCount` |
| `es_clear_board` | 清空時一併清空 `board.remodels` |
| `es_add_link` | `fromType` / `toType` 新增 `'remodel'` 選項 |
| `es_set_event_paths` | 搜尋範圍加入 `board.remodels` |
| `es_set_event_phase` | 搜尋範圍加入 `board.remodels` |

---

## 工具規格

### `es_add_remodel`

```
參數：
  aggregateLabel    string (required) — 上格：Aggregate 名稱（讀取視角）
  aggregateContent  string (optional)
  parameterLabel    string (required) — 左下格：查詢參數名稱
  parameterContent  string (optional)
  queryLabel        string (required) — 中下格：Query 名稱（慣例 "Get" + 名稱）
  queryContent      string (optional)
  sourceEventLabel  string (required) — 右下格：Event Source 摘要
  sourceEventContent string (optional)
  linkedBundleIds   string[] (optional, default: [])
  x                 number (optional, default: auto-layout)
  y                 number (optional, default: 520)
  paths             string[] (optional)
  phase             string (optional)
  notes             string (optional)

回傳：完整 Remodel JSON（含 id、_isUniverse）
```

### `es_update_remodel`

```
參數：
  id                string (required)
  [以下全部 optional，未提供的欄位不覆蓋]
  aggregateLabel / aggregateContent
  parameterLabel / parameterContent
  queryLabel / queryContent
  sourceEventLabel / sourceEventContent
  linkedBundleIds   string[] — 完整替換（非追加）
  x / y
  paths / phase / notes

回傳：更新後的完整 Remodel JSON（含 _isUniverse）
```

### `es_delete_remodel`

```
參數：
  id  string (required)

回傳：{ success: true, deletedId: string }
副作用：一併刪除 fromId 或 toId 等於此 id 的所有 Link
```

### `es_get_board`（擴充）

```
新增欄位：
  remodels: Array<Remodel & { _isUniverse: boolean }>

_isUniverse 計算規則：
  linkedBundleIds 對應的 Bundle 中，若涉及 > 1 個不同的 infoNote.label
  （去空白後轉小寫比對），則為 true
```

---

## `_isUniverse` 語意說明

`_isUniverse` 是 **computed field**，不儲存於 `project.json`，每次 `es_get_board` / `es_add_remodel` / `es_update_remodel` 即時計算。

| 狀態 | 條件 | 意義 |
|------|------|------|
| `false` | linkedBundleIds 為空，或所有 linked bundles 都指向同一個 Aggregate | Single-Aggregate Read Model |
| `true` | linked bundles 涵蓋 > 1 個不同的 Aggregate Root | Universe Remodel（跨 Aggregate 投影） |

---

## 驗收確認

- [x] `es_add_remodel` 建立 Remodel，前端即時顯示（SSE `add_remodel` 推播）
- [x] `es_update_remodel` 局部更新，sub-note 欄位獨立更新不互相覆蓋
- [x] `es_delete_remodel` 刪除 Remodel 及所有相關 Link
- [x] `es_get_board` 回傳包含 `remodels` 和 `_isUniverse`
- [x] 舊 `project.json` 載入後自動補 `remodels: []`（`migrateProject`）
- [x] `es_clear_board` 清空 remodels
- [x] `es_add_link` 支援 remodel 作為 source/target
- [x] `es_set_event_paths` / `es_set_event_phase` 支援 Remodel ID
