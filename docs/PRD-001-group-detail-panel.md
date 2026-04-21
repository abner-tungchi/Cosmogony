# PRD-001: Group Detail Panel (Group Mode)

> Version: 1.0
> Status: Draft
> Date: 2026-03-24
> Author: PM Agent

---

## 1. 背景與問題

### 1.1 現狀描述

目前 Detail Panel（右側 360px 面板）是以**單一元素**為粒度運作：

- 使用者選取一張 StickyNote → Detail Panel 顯示**該張便條**的屬性
- 使用者選取一張 Remodel → Detail Panel 顯示**該 Remodel** 的屬性
- 切換 Panel 的邏輯由 `selectedElementId` + `selectedElementType` 控制（`uiStore`）

在 DomainEvent Group 情境下，使用者要編輯一個完整的 Command Flow（DomainEvent + Command + Information + Entity），必須：

| 要編輯的內容 | 目前操作步驟 | 互動模式 |
|---|---|---|
| DomainEvent 名稱 | 畫布上 double-click 直接編輯 | 畫布內 inline edit |
| Command 名稱 | 點 Group → 再點 Command → Detail Panel，或從 DomainEvent Panel 點 Edit 開 Modal | Modal (AddCommandModal) |
| Information (Property[]) | 透過 AddCommandModal 彈窗 | Modal 表單 |
| Entity 名稱 | 點 Group → 再點 Entity → Detail Panel | Detail Panel inline |
| Event Properties | 選取 DomainEvent → Detail Panel 內的 tab 切換 | Detail Panel PropertyTable |

### 1.2 問題陳述

**操作粒度（individual note）與思維粒度（whole group）不匹配。**

使用者在建模時，思考的單位是「一個完整的 Command → DomainEvent 流程」，但操作時必須在三種不同的互動模式（畫布 inline、Detail Panel、Modal 彈窗）之間反覆切換，導致：

1. **上下文切換成本高** — 編輯一個 Group 的完整屬性需要 5+ 次點擊與模式切換
2. **編輯入口分散** — 同一個概念單位的屬性散落在三種互動模式中
3. **缺乏 Group 全貌** — 無法在單一視圖看到 Group 的完整結構並做整合編輯

### 1.3 用戶影響

- **影響對象**：所有使用 DomainEvent Group 的用戶（Domain Expert + AI 協作）
- **頻率**：每次建模 session 中，每個 Group 平均會被編輯 3-5 次
- **嚴重程度**：中等 — 功能可用但體驗破碎，降低建模效率

---

## 2. 目標

### 2.1 業務目標

- 提升 Event Storming 建模效率，減少單一 Group 的完整編輯時間

### 2.2 用戶目標

- 在單一視圖中完成一個 DomainEvent Group 的所有屬性編輯
- 在單一視圖中完成一個 Remodel 的所有屬性編輯
- 不需要學習新的操作概念（利用現有的兩層選取機制）

### 2.3 成功指標

| 指標 | 目前基準 | 目標 |
|---|---|---|
| 完成一個 Group 完整屬性編輯的操作步驟數 | 5+ 次點擊 + 模式切換 | 2 次點擊（選取 Group → 在 Panel 內編輯） |
| 需要開啟 Modal 的場景數 | Command 新增/編輯必須開 Modal | 僅「新建 Command」和「新建/連結 Entity」需要 Modal |
| 使用者在 Group 編輯流程中的困惑報告 | 存在（入口分散） | 消除 |

---

## 3. 觸發邏輯（Group Mode vs Note Mode）

### 3.1 核心原則

Detail Panel 的模式由**當前選取狀態**自動決定，不需要使用者手動切換。利用現有的兩層選取機制：

```
第一次點擊 Group 中任何便條（或背景框）
  → uiStore.selectedNoteIds = [DomainEvent.id]（Group 代表）
  → uiStore.selectedElementId = DomainEvent.id
  → Detail Panel 顯示 → Group Mode

再次點擊 Group 中的個別便條
  → uiStore.selectedNoteIds = [該便條.id]
  → uiStore.selectedElementId = 該便條.id
  → Detail Panel 切換 → Note Mode（顯示該便條的個別屬性）
```

### 3.2 判斷規則

Detail Panel 在渲染時，依據 `selectedElementId` 找到對應的 note，按以下優先順序判斷模式：

```
if (note.type === 'DomainEvent' && note 有任何衛星便條) {
  → 顯示 GroupPanel（Group Mode）
}
else if (note.type === 'DomainEvent' && note 沒有衛星便條) {
  → 顯示 GroupPanel（Group Mode）— 顯示空狀態，提供 Add Command / Set Entity 入口
}
else if (selectedElementType === 'remodel') {
  → 顯示 RemodelGroupPanel（Remodel Group Mode）— 新設計
}
else {
  → 顯示原有的 NotePanel / EntityPanel / 其他（Note Mode，行為不變）
}
```

### 3.3 行為對照表

| 用戶操作 | 選取結果 | Detail Panel 模式 |
|---|---|---|
| 點擊 Group 背景框 | DomainEvent 被選取 | Group Mode |
| 第一次點擊 Group 中的衛星便條 | DomainEvent 被選取（現有行為） | Group Mode |
| Group 已選取後，再次點擊衛星便條 | 該衛星便條被選取 | Note Mode |
| Group 已選取後，再次點擊 DomainEvent | DomainEvent 被選取（保持） | Group Mode（不變） |
| 點擊獨立便條（非 Group 成員） | 該便條被選取 | Note Mode |
| 點擊 Remodel | Remodel 被選取 | Remodel Group Mode |
| 按 Esc 或點擊空白處 | 取消選取 | Panel 關閉 |

### 3.4 與現有 DomainEventPanel 的關係

目前的 `DomainEventPanel`（DetailPanel.tsx L257-646）**已經**包含 Group 的部分資訊（Linked Command、Command Input/Event Output、Linked Entity）。Group Mode 將**取代** `DomainEventPanel`，以更完整、更直觀的方式呈現同樣的資訊，並增加 inline 編輯能力。

---

## 4. DomainEvent Group Detail Panel — 資訊架構

### 4.1 Layout 結構

```
┌──────────────────────────────────────┐
│  HEADER                              │
│  [Group 標題] [DomainEvent 名稱]      │  ← 可編輯 input
│  domain event group · abc123         │
│                              [×]     │
├──────────────────────────────────────┤
│                                      │
│  ── ENTITY ────────────────────────  │
│  ◈ [Entity 名稱]              [AR ✓] │  ← 可編輯 input / 或「+ Set Entity」按鈕
│  ─────────────────────────────────── │
│                                      │
│  ── COMMAND ───────────────────────  │
│  ▸ [Command 名稱]                    │  ← 可編輯 input / 或「+ Add Command」按鈕
│  ─────────────────────────────────── │
│                                      │
│  ── INFORMATION (Command Input) ──  │
│  [attrName]  [type]           [×]    │  ← inline 可編輯 PropertyTable
│  [attrName]  [type]           [×]    │
│  [+ Add Property]                    │
│  ─────────────────────────────────── │
│                                      │
│  ── EVENT OUTPUT ──────────────────  │
│  [attrName]  [type]           [×]    │  ← inline 可編輯 PropertyTable
│  [attrName]  [type]           [×]    │
│  [+ Add Property]                    │
│  ─────────────────────────────────── │
│                                      │
│  ── PATHS ─────────────────────────  │
│  [✓] ● Path A                        │
│  [ ] ● Path B                        │
│  ─────────────────────────────────── │
│                                      │
│  ── NOTES ─────────────────────────  │
│  [textarea]                          │
│                                      │
└──────────────────────────────────────┘
```

### 4.2 Section 排列順序的設計理由

Section 排列遵循**Event Storming 的閱讀方向**（由上至下 = 由概念到細節）：

1. **DomainEvent 名稱**（header）— Group 的核心識別
2. **Entity** — 被操作的 Aggregate，是結構上層概念
3. **Command** — 觸發事件的指令
4. **Information** — Command 的輸入參數（Command 的子概念）
5. **Event Output** — DomainEvent 的輸出屬性
6. **Paths** — 組織 metadata
7. **Notes** — 自由文字備註

---

## 5. 每個可編輯欄位的行為規格

### 5.1 DomainEvent 名稱

| 項目 | 規格 |
|---|---|
| 元件 | `<input type="text">` |
| 資料來源 | `DomainEvent.label` |
| 同步時機 | **即時同步**（onChange → `updateNote(eventId, { label })`） |
| 原因 | 使用者可以在畫布上即時確認命名效果（字數、截斷） |
| 空值處理 | 允許暫時為空，畫布顯示 placeholder "(Unnamed Event)" |

### 5.2 Command 名稱

| 項目 | 規格 |
|---|---|
| 元件 | `<input type="text">`（已連結時）/ 按鈕（未連結時） |
| 資料來源 | `Command.label`（透過 `DomainEvent.commandId` 找到） |
| 同步時機 | **即時同步**（onChange → `updateNote(commandId, { label })`） |
| 空值處理 | 已連結但名稱為空 → 顯示 placeholder "(Unnamed Command)" |
| 前提 | 必須先有 Command（透過 Add Command 建立） |

### 5.3 Entity 名稱

| 項目 | 規格 |
|---|---|
| 元件 | `<input type="text">`（已連結時）/ 按鈕（未連結時） |
| 資料來源 | `Entity.label`（透過 `DomainEvent.entityId` 找到） |
| 同步時機 | **即時同步**（onChange → `updateNote(entityId, { label })`） |
| 連動 | Entity rename 時，若有 linkedAggregateNoteId，Aggregate note 的 label 同步更新（現有行為，`boardStore.updateNote` 已實作） |
| AR 狀態 | **唯讀顯示**（badge 標示 AR / 非 AR），標記/取消操作保留在 Note Mode 的 EntityPanel |

### 5.4 Information（Command Input Parameters）

| 項目 | 規格 |
|---|---|
| 元件 | `PropertyTable`（現有元件，複用） |
| 資料來源 | `Command.information: Property[]` |
| 同步時機 | **onChange 即同步**（與現有 DomainEventPanel 行為一致：onChange → `updateCommandInformation(cmdId, updated)`） |
| 空值處理 | 無 Property → 顯示空的 PropertyTable + "Add Property" 按鈕 |
| 前提 | 必須先有 Command；未連結時此 section 顯示 disabled 狀態 + 提示 "Link a command first" |

### 5.5 Event Output Properties

| 項目 | 規格 |
|---|---|
| 元件 | `PropertyTable`（現有元件，複用） |
| 資料來源 | `DomainEvent.eventProperties: Property[]` |
| 同步時機 | **onChange 即同步**（onChange → `updateEventProperties(eventId, updated)`） |
| Seeding 行為 | 首次開啟 Event Output section 時，若 eventProperties 為空且 Command Input 有值，自動複製 Command Input 的內容作為初始值（現有行為，保留） |

### 5.6 Paths

| 項目 | 規格 |
|---|---|
| 元件 | Checkbox list（現有元件，複用） |
| 資料來源 | `DomainEvent.paths: string[]` |
| 同步時機 | **onClick 即同步**（與現有行為一致） |
| 備註 | Group Mode 的 Paths 操作的是 DomainEvent 的 paths，不影響衛星便條的 paths |

### 5.7 Notes（備註）

| 項目 | 規格 |
|---|---|
| 元件 | `<textarea>`（現有元件，複用） |
| 資料來源 | `DomainEvent.notes: string` |
| 同步時機 | **onBlur 同步**（與現有行為一致） |

---

## 6. Add Command / Set Entity 入口

### 6.1 Add Command

| 項目 | 規格 |
|---|---|
| 觸發條件 | DomainEvent 尚未連結 Command（`commandId` 為空） |
| UI 呈現 | Command section 顯示 `+ Add Command` 虛線按鈕（與現有 DomainEventPanel 的按鈕一致） |
| 點擊行為 | 開啟 `AddCommandModal`（現有元件，不修改） |
| Modal 關閉後 | Group Panel 自動更新，顯示新建的 Command 名稱 input + Information 區塊 |

### 6.2 Edit Command（已連結狀態）

| 項目 | 規格 |
|---|---|
| 觸發條件 | DomainEvent 已連結 Command |
| UI 呈現 | Command section 顯示 Command 名稱 input（inline 可編輯），旁邊保留「Edit」連結（開啟 AddCommandModal 編輯模式） |
| 差異說明 | Command 名稱可直接在 Group Panel inline 編輯（新能力）；Information 的完整編輯（含新增/刪除 Property）直接在 Group Panel 內的 PropertyTable 操作（不需要再開 Modal） |
| Modal 保留原因 | AddCommandModal 的 Edit 模式作為「重新命名 + 批次編輯 Information」的替代入口，不移除 |

### 6.3 Set Entity

| 項目 | 規格 |
|---|---|
| 觸發條件 | DomainEvent 尚未連結 Entity（`entityId` 為空） |
| UI 呈現 | Entity section 顯示 `+ Set Entity` 虛線按鈕 |
| 點擊行為 | 開啟 `SetEntityModal`（現有元件，不修改）— 支援 New Entity / Link Existing 兩個 tab |
| Modal 關閉後 | Group Panel 自動更新，顯示 Entity 名稱 input |

### 6.4 Unlink Entity（已連結狀態）

| 項目 | 規格 |
|---|---|
| 觸發條件 | DomainEvent 已連結 Entity |
| UI 呈現 | Entity 名稱 input 旁邊顯示 `x` 按鈕（unlink） |
| 點擊行為 | 呼叫 `linkEntityToEvent(eventId, undefined)`（現有 action） |
| 結果 | Entity section 回到空狀態，顯示 `+ Set Entity` 按鈕 |

---

## 7. 空狀態處理

### 7.1 新建的 DomainEvent（無 Command、無 Entity）

```
┌──────────────────────────────────────┐
│  [DomainEvent 名稱]                   │  ← 可編輯
│  domain event group · abc123         │
├──────────────────────────────────────┤
│                                      │
│  ── ENTITY ────────────────────────  │
│  [+ Set Entity]  ← 虛線按鈕          │
│  ─────────────────────────────────── │
│                                      │
│  ── COMMAND ───────────────────────  │
│  [+ Add Command]  ← 虛線按鈕         │
│  ─────────────────────────────────── │
│                                      │
│  ── INFORMATION ───────────────────  │
│  (灰字) Link a command first          │  ← disabled 提示
│  ─────────────────────────────────── │
│                                      │
│  ── EVENT OUTPUT ──────────────────  │
│  [+ Add Property]                    │  ← 可直接新增（不依賴 Command）
│  ─────────────────────────────────── │
│                                      │
│  ── PATHS ─────────────────────────  │
│  ...                                 │
│  ── NOTES ─────────────────────────  │
│  ...                                 │
└──────────────────────────────────────┘
```

### 7.2 有 Command 但無 Entity

- Entity section：顯示 `+ Set Entity` 按鈕
- Command section：顯示 Command 名稱 input
- Information section：可正常編輯

### 7.3 有 Entity 但無 Command

- Entity section：顯示 Entity 名稱 input + AR badge
- Command section：顯示 `+ Add Command` 按鈕
- Information section：灰字提示 "Link a command first"

---

## 8. Remodel Group Mode

### 8.1 觸發條件

使用者選取一個 Remodel 元素時，Detail Panel 顯示 Remodel Group Mode。

> 這與目前的行為相同（選取 Remodel → 顯示 RemodelPanel），但以下規格確認現有設計的完整性，並在需要時提供增強方向。

### 8.2 現有 RemodelPanel 已涵蓋的能力

現有 `RemodelPanel`（DetailPanel.tsx L928-）已具備整合編輯體驗：

- 3 個 EditableColorBlock（Query、Return Type、Parameters）— inline 可編輯
- Linked Source Events — 搜尋、連結、移除
- Linked DTOs — 搜尋、連結、移除、新建
- Linked Actor — 新建、連結現有、移除
- Phase + Notes

### 8.3 本次需確認的增強項目

| 項目 | 現狀 | 建議 |
|---|---|---|
| Aggregate 欄位 | `aggregateNote`（BundleSubNote）存在但 Panel 未曝露 | 待確認是否納入 v1 |
| Source Events 區塊的名稱編輯 | 只能搜尋並連結，不能在 Panel 內 rename | v2 考量 |

> Remodel Group Mode 的增強項目建議在 DomainEvent Group Mode 完成後，作為 Phase 2 評估。目前 RemodelPanel 的整合度已足夠。

---

## 9. User Stories

### US-1: Group 全貌編輯

```
As a Domain Expert,
I want to see and edit all parts of a DomainEvent Group
  (Event name, Command name, Information, Entity name, Event Output)
  in a single panel,
so that I can complete the modeling of one command flow
  without switching between multiple views.
```

**Acceptance Criteria:**

- **Given** 一個 DomainEvent 已連結 Command 和 Entity
- **When** 使用者第一次點擊 Group 中的任何便條（或背景框）
- **Then** Detail Panel 顯示 Group Mode，包含：DomainEvent 名稱 input、Command 名稱 input、Information PropertyTable、Entity 名稱 input（含 AR badge）、Event Output PropertyTable、Paths、Notes

### US-2: 名稱即時連動

```
As a Domain Expert,
I want my edits to Event/Command/Entity names in the Group Panel
  to immediately reflect on the canvas sticky notes,
so that I can verify the naming without extra steps.
```

**Acceptance Criteria:**

- **Given** Group Panel 已開啟，DomainEvent 名稱 input 顯示 "OrderPlaced"
- **When** 使用者將名稱改為 "OrderConfirmed"
- **Then** 畫布上的 DomainEvent 便條文字即時從 "OrderPlaced" 變為 "OrderConfirmed"
- **And** Command、Entity 名稱的修改也同樣即時反映在畫布上

### US-3: 從 Group Panel 建立 Command

```
As a Domain Expert,
I want to add a Command to a DomainEvent directly from the Group Panel,
so that I can build the group structure without leaving the panel.
```

**Acceptance Criteria:**

- **Given** 一個 DomainEvent 尚未連結 Command
- **When** 使用者在 Group Panel 中點擊 "+ Add Command"
- **Then** 開啟 AddCommandModal
- **When** 使用者在 Modal 中填入 Command 名稱和 Information，點擊 Create
- **Then** Modal 關閉，Group Panel 自動更新：Command section 顯示名稱 input，Information section 顯示已填入的 Property 列表

### US-4: 從 Group Panel 設定 Entity

```
As a Domain Expert,
I want to set an Entity for a DomainEvent directly from the Group Panel,
so that I can associate the aggregate without context-switching.
```

**Acceptance Criteria:**

- **Given** 一個 DomainEvent 尚未連結 Entity
- **When** 使用者在 Group Panel 中點擊 "+ Set Entity"
- **Then** 開啟 SetEntityModal（支援 New Entity / Link Existing）
- **When** 使用者完成 Entity 設定
- **Then** Modal 關閉，Group Panel 自動更新：Entity section 顯示名稱 input + AR 狀態 badge

### US-5: 二次點擊切回 Note Mode

```
As a Domain Expert,
I want to click a specific satellite note (while the group is selected)
  to see that note's individual detail,
so that I can access note-specific settings like Aggregate Root marking.
```

**Acceptance Criteria:**

- **Given** Group 已選取，Group Panel 正在顯示
- **When** 使用者再次點擊 Entity 便條
- **Then** Detail Panel 切換為 EntityPanel（Note Mode），顯示 Entity 的個別屬性（含 Aggregate Root mark/unmark）
- **When** 使用者按 Esc 或點擊空白處
- **Then** Detail Panel 關閉

### US-6: Information disabled 狀態

```
As a Domain Expert,
I want to see a clear message when Information cannot be edited
  (because no Command is linked),
so that I understand what action to take next.
```

**Acceptance Criteria:**

- **Given** 一個 DomainEvent 尚未連結 Command
- **When** Group Panel 顯示
- **Then** Information section 呈現 disabled 狀態，顯示灰字提示 "Link a command first to edit input parameters"
- **And** PropertyTable 不可操作

---

## 10. Acceptance Criteria（綜合驗收清單）

### 10.1 觸發與切換

- [ ] 第一次點擊 Group 衛星便條 → Detail Panel 顯示 Group Mode（以 DomainEvent 為代表）
- [ ] 點擊 Group 背景框 → Detail Panel 顯示 Group Mode
- [ ] Group 已選取 + 再次點擊個別衛星便條 → Detail Panel 切換為 Note Mode
- [ ] Group 已選取 + 再次點擊 DomainEvent 本身 → 維持 Group Mode
- [ ] 點擊獨立便條（非 Group）→ 顯示原有 Note Mode（行為不變）
- [ ] 點擊 Remodel → 顯示 RemodelPanel（行為不變）
- [ ] 按 Esc → Panel 關閉

### 10.2 DomainEvent 名稱

- [ ] 顯示在 header 區域，可 inline 編輯
- [ ] onChange 即時更新畫布上的 DomainEvent 便條文字
- [ ] 空值時畫布顯示 "(Unnamed Event)" placeholder

### 10.3 Command Section

- [ ] 已連結 Command → 顯示名稱 input，onChange 即時更新畫布
- [ ] 未連結 Command → 顯示 "+ Add Command" 虛線按鈕
- [ ] 點擊按鈕 → 開啟 AddCommandModal
- [ ] Modal 完成後 → Group Panel 自動刷新

### 10.4 Entity Section

- [ ] 已連結 Entity → 顯示名稱 input + AR badge（唯讀）+ unlink 按鈕
- [ ] Entity rename → 畫布上 Entity 便條即時更新；若有 Aggregate，同步更新
- [ ] 未連結 Entity → 顯示 "+ Set Entity" 虛線按鈕
- [ ] 點擊按鈕 → 開啟 SetEntityModal
- [ ] Modal 完成後 → Group Panel 自動刷新
- [ ] 點擊 unlink → Entity 斷開連結，section 回到空狀態

### 10.5 Information (Command Input)

- [ ] 已連結 Command → 顯示 PropertyTable，可新增/編輯/刪除 Property
- [ ] onChange 即同步至 store（`updateCommandInformation`）
- [ ] 未連結 Command → 顯示 disabled 提示 "Link a command first"

### 10.6 Event Output

- [ ] 顯示 PropertyTable，可新增/編輯/刪除 Property
- [ ] onChange 即同步至 store（`updateEventProperties`）
- [ ] Seeding 行為保留：首次有值的 Command Input 存在時，自動複製至 Event Output

### 10.7 Paths & Notes

- [ ] Paths checkbox list 操作的是 DomainEvent 的 paths（行為與現有一致）
- [ ] Notes textarea onBlur 同步（行為與現有一致）

### 10.8 向後相容

- [ ] 現有的 Note Mode（EntityPanel、NotePanel、其他 type）行為完全不變
- [ ] 現有的 RemodelPanel 行為完全不變
- [ ] MCP tools 不受影響（Group Mode 是純前端 UI 變更）

---

## 11. 技術考量

### 11.1 新增元件

- `GroupPanel`：新的 React 元件，放在 `src/components/DetailPanel/` 下
- 複用現有 sub-components：`PropertyTable`、`SectionLabel`、`InlineField`

### 11.2 UI Store 影響

- 不需要新增 state。現有的 `selectedElementId` + `selectedElementType` 足以判斷 Group Mode
- 判斷邏輯：在 `DetailPanel` 主元件中，當 note.type === 'DomainEvent' 時渲染 `GroupPanel` 取代 `DomainEventPanel`

### 11.3 相依性

- `boardStore` actions：全部使用現有 actions，無需新增
  - `updateNote`（名稱修改）
  - `updateCommandInformation`（Information 修改）
  - `updateEventProperties`（Event Output 修改）
  - `linkEntityToEvent`（Unlink Entity）
- Modals：複用現有 `AddCommandModal` 和 `SetEntityModal`，不修改

### 11.4 風險

| 風險 | 嚴重度 | 緩解方案 |
|---|---|---|
| Group Panel 內容過多，需要 scroll | 低 | Panel 已有 `overflowY: auto`，section 可折疊 |
| 名稱即時同步造成畫布 re-render 效能問題 | 低 | Zustand selector + React.memo 已在使用，每次只更新目標 note |
| AddCommandModal / SetEntityModal 關閉後 Group Panel 未刷新 | 中 | 確保 Modal callback 觸發 store update 後，GroupPanel 透過 selector 自動 re-render |

---

## 12. Out of Scope（v1 排除）

| 項目 | 原因 |
|---|---|
| 在 Group Panel 中刪除衛星便條 | 破壞性操作，應保留在畫布上明確操作 |
| 在 Group Panel 中拖拉排序成員 | 不改變 Group 的空間佈局邏輯 |
| Entity 的 Aggregate Root 標記/取消操作 | 保留在 Note Mode 的 EntityPanel，避免 Group Panel 過於複雜 |
| FlowPath / Phase 的批次指派（同時套用到所有 Group 成員） | 增加複雜度，v2 評估 |
| Remodel Group Mode 增強 | 現有 RemodelPanel 已足夠，Phase 2 評估 |
| 便條的 notes 備註（衛星便條的個別 notes） | 屬於個別便條的細節，保留在 Note Mode |

---

## 13. 交接建議

### 交接對象：設計師

- **交接原因**：Group Panel 的 layout、section 折疊/展開互動、空狀態的視覺提示、色彩運用（需配合 Event Storming 的語意色彩系統）需要設計師判斷
- **產品背景摘要**：本 PRD 第 4 節的 layout 結構是功能性建議，非最終 UI 設計
- **待解決問題**：
  - section 之間是否需要折疊？哪些預設展開、哪些收合？
  - Entity 的 AR badge 唯讀標示的視覺形式
  - disabled Information section 的視覺樣式
  - Group Mode header 與 Note Mode header 的視覺區分
- **已確定的決策**：section 排列順序（Entity → Command → Information → Event Output → Paths → Notes）、名稱即時同步、Property 列表 onChange 同步
- **開放的彈性空間**：視覺樣式、動畫效果、元件間距、色彩深淺

### 交接對象：前端工程

- **交接原因**：實作 GroupPanel 元件、修改 DetailPanel 的模式判斷邏輯
- **產品背景摘要**：本 PRD 全文
- **待解決問題**：
  - `GroupPanel` 元件的 props interface 設計
  - PropertyTable 的 debounce 策略（名稱即時同步 vs Property 列表的頻繁 onChange）
  - Modal 關閉後的 re-render 確認
- **已確定的決策**：複用現有 store actions、不新增 UI state、不修改 Modals
- **開放的彈性空間**：元件內部結構、state 管理策略、效能優化方式
