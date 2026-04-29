# Cosmogony — 專案說明

---

## AI 協作規則（Claude Code 必讀）

### 1. 說「謝謝」時 → 儲存工作摘要
當 user 說「謝謝」時，將本次對話的工作內容整理成 project memory，儲存至：
`~/.claude/projects/-Users-abnertsai-JiaBao-Mendesky-EventStormingTool/memory/`
格式使用 `project_YYYY-MM-DD_<主題>.md`，記錄本次修改的功能、決策與影響的檔案。

---

### 2. Agent 優先原則
**每次收到任務，先判斷應該用哪個 agent，盡量不要自己在主對話中執行。**
原因：避免 context window 過大，保持主對話簡潔。

規則：
- 有對應 agent → 直接用 Agent tool 分配任務
- 沒有對應 agent → **提醒 user 需要建立對應的 agent，不要自己硬做**
- 多個獨立任務 → 同時啟動多個 agent（parallel）

---

### 3. 可用 Agent 清單

#### Agent tool（subagent_type）
| Agent | 適用場景 |
|-------|---------|
| `frontend-engineer` | React/TypeScript 前端實作、元件修改、UI bug 修復 |
| `backend-engineer` | MCP server、Express API、資料結構設計 |
| `ui-ux-designer` | UI/UX 設計規格、互動流程、視覺審查 |
| `qa-lead-engineer` | 測試策略、E2E 測試、release readiness |
| `arch-decision-advisor` | 架構決策、技術選型、trade-off 分析 |
| `product-manager` | PRD、需求定義、功能優先級（見下方觸發規則）|
| `Plan` | 實作計劃、任務拆解 |
| `Explore` | 程式碼探索、關鍵字搜尋、檔案結構分析 |
| `general-purpose` | 複雜研究、多步驟查找 |

#### PM Agent 觸發規則

**核心判斷問題：用戶說的是「問題/想法」，還是「已給出解法」？**
- 描述問題/想法 → spawn PM agent
- 已給出明確解法 → 跳過 PM，直接派執行 agent

| 情況 | 判斷標準 | 範例 |
|------|---------|------|
| ✅ 新功能請求 | 說「想要 X」但沒說怎麼做 | 「我想加多人協作」|
| ✅ 需求模糊 | 描述的是問題或感受 | 「這個流程很難用」|
| ✅ 功能優先級 | 有多個想法不知先做哪個 | 「有 A/B/C 三個想法」|
| ✅ 範疇不清楚 | 不知道邊界在哪 | 「版本歷史要怎麼做？」|
| ❌ Bug 修復 | 問題已明確 | 直接派 FE/BE |
| ❌ 小範圍調整 | 已有足夠細節 | 直接派 FE/UX |
| ❌ 技術問題 | 不是產品決策 | 直接回答或派對應 agent |
| ❌ 已給明確規格 | 需求已定義完 | 直接派執行 agent |

灰色地帶：「UX 不好」→ PM 先定義問題 → 再交 UX designer

#### Frontend Engineer 觸發規則

**核心判斷：任務有明確的 UI 規格可以直接實作嗎？**

| 情況 | 觸發 |
|------|------|
| ✅ React/TypeScript 元件修改 | 直接派 |
| ✅ UI bug 修復（問題已明確）| 直接派 |
| ✅ UX 規格已確認，要實作 | 直接派 |
| ✅ Zustand store 狀態調整 | 直接派 |
| ❌ 還沒有設計方向 | 先 ui-ux-designer |
| ❌ 需要新 API | 先 backend-engineer |

#### Backend Engineer 觸發規則

**核心判斷：任務涉及 server 端邏輯或 API 嗎？**

| 情況 | 觸發 |
|------|------|
| ✅ MCP server 新增/修改 tools | 直接派 |
| ✅ Express API 端點 | 直接派 |
| ✅ 資料結構設計（types）| 直接派 |
| ✅ SSE 同步機制 | 直接派 |
| ❌ 前端 UI 元件 | 派 frontend-engineer |
| ❌ 涉及整體架構選型 | 先 arch-decision-advisor |

#### UI/UX Designer 觸發規則

**核心判斷：有沒有足夠的設計方向可以直接實作？**

| 情況 | 觸發 |
|------|------|
| ✅ 新功能/元件需要設計方案 | 直接派 |
| ✅ 用戶反映體驗不好但不知道怎麼改 | 直接派 |
| ✅ 實作前需要確認互動流程 | 直接派 |
| ✅ UX 完整性審查 | 直接派 |
| ❌ 需求還沒定義清楚 | 先 product-manager |
| ❌ 有設計了，要實作 | 派 frontend-engineer |

#### QA Lead Engineer 觸發規則

**核心判斷：任務與品質保證、測試或 release 有關嗎？**

| 情況 | 觸發 |
|------|------|
| ✅ 功能完成，需要測試策略 | 直接派 |
| ✅ E2E / 整合測試撰寫 | 直接派 |
| ✅ Release readiness 評估 | 直接派 |
| ✅ Bug 正式回報與調查 | 直接派 |
| ❌ 還在實作中 | 等 FE/BE 完成再派 |

#### Arch Decision Advisor 觸發規則

**核心判斷：這個決定會影響整體架構、有多個方案需要 trade-off 分析嗎？**

| 情況 | 觸發 |
|------|------|
| ✅ 技術選型（要用 A 還是 B）| 直接派 |
| ✅ 現有架構擴充性評估 | 直接派 |
| ✅ 跨前後端的系統設計決策 | 直接派 |
| ❌ 已有架構決策，要實作 | 派 frontend-engineer / backend-engineer |
| ❌ 產品方向不清楚 | 先 product-manager |

#### PM Agent 回傳後的處理流程

PM agent 完成後，**不自動 spawn 下一個 agent**，先呈現以下摘要讓 user 確認：

```
## PM 分析結果

**核心結論**
[1-3 點最重要的產品決策]

**建議下一步**
交接給：[agent 名稱]
原因：[一句話]

**需要你確認**
- [ ] 以上結論是否正確？
- [ ] 是否授權我 spawn [agent 名稱]？
```

User 確認後，spawn 下一個 agent，並將 PM 的產出（完整交接文件）帶入該 agent 的 prompt。

#### Spawn PM Agent 的標準 Prompt 模板

```
## 用戶需求
[用戶原始說法，盡量保留原話]

## 已確定的約束
[技術限制、已拍板的決策、不能動的範圍]
（沒有可填「無」）

## 期望產出
[PRD / 功能優先級分析 / 問題定義 / 其他]

---
請先閱讀 CLAUDE.md 與專案 memory 了解背景，再開始分析。
```

#### Skill tool（/slash commands）
| Skill | 適用場景 |
|-------|---------|
| `commit` | 整理並執行 git commit |
| `ui-design` | 實作前產出 UI 設計方案（ASCII 線框圖）供確認 |
| `ux-audit` | 整體 UX 完整性審查 |
| `ux-component` | 單一元件 UX 深度審查 |
| `ux-spec` | 產出完整 UX 規格文件 |
| `create-event-storming` | 在畫布上建立 Event Storming 圖 |
| `explain-code` | 解釋程式碼運作原理 |
| `simplify` | 審查並簡化已修改的程式碼 |
| `test` | 執行測試循環 |

---

## 專案目的

一個給 Domain Expert 和 AI 協作使用的 **Event Storming 白板工具**。
支援人員在 UI 上繪製 Event Storming 圖，也支援 AI 透過 MCP 工具直接操作畫布。

---

## 技術架構

### Frontend — React + TypeScript（Vite）

- **React**：元件化架構，每個 StickyNote / Remodel / Link 都是獨立互動元件
- **TypeScript**：資料結構複雜（`StickyNote`、`Remodel`、`Link`、`Board`、`Project`），型別保護讓 refactor 安全
- **Vite**：HMR 極快，開發體驗好
- **Zustand + immer**：狀態管理，含 `persist` middleware（localStorage）和版本 migration（目前 v11）
- **dnd-kit**：拖拉排序

### Backend — Node.js + TypeScript + Express

- **Node.js**：前後端同一語言，型別定義共享
- **Express**：輕量 HTTP server，提供 `/api/board`（POST）、`/api/events`（SSE）等端點
- **MCP SDK**（`@modelcontextprotocol/sdk`）：只有 JS/TS 版本
- **SSE（Server-Sent Events）**：MCP server → React 的即時推播

### 為什麼前後端都用 TypeScript

同一份型別定義貫穿前後端，MCP server 和 React 說同一種語言，減少資料格式轉換的錯誤。

---

## 專案結構

```
EventStormingTool/
├── src/                        # React 前端
│   ├── components/
│   │   ├── Board/              # 畫布主體（Board.tsx、BoardCanvas.tsx、Minimap.tsx）
│   │   ├── StickyNote/         # Sticky Note 元件（StickyNote.tsx、FormatToolbar.tsx）
│   │   ├── Remodel/            # Read Model 4-in-1 卡片（Remodel.tsx）
│   │   ├── Canvas/             # 畫布背景（CanvasBackground.tsx）
│   │   ├── Links/              # 連結箭頭（LinkLayer.tsx、LinkArrow.tsx）
│   │   ├── DetailPanel/        # 右側屬性面板（DetailPanel.tsx）
│   │   ├── Sidebar/            # 左側工具列（SidebarPalette.tsx）
│   │   ├── TabBar/             # Context 分頁（TabBar.tsx）
│   │   ├── PathBar/            # FlowPath 過濾 dots（PathDots.tsx）
│   │   ├── HintBar/            # 提示列（HintBar.tsx）
│   │   ├── Homepage/           # 專案首頁（Homepage.tsx）
│   │   └── Modals/             # 彈窗（AddCommandModal、SetEntityModal、ExportModal）
│   ├── store/
│   │   ├── boardStore.ts       # 主要狀態（Project / Board / StickyNote / Remodel / Link）
│   │   └── uiStore.ts          # UI 狀態（zoom、pan、選取、工具、activePath）
│   ├── types/
│   │   ├── board.ts            # Project、Board、BoardStore interface
│   │   └── elements.ts         # StickyNote、Remodel、Link、FlowPath、Property interface
│   └── utils/
│       ├── apiSync.ts          # SSE 訂閱 + POST /api/board 同步
│       ├── markdownExporter.ts # Board → Markdown
│       └── aiPromptBuilder.ts  # 組合 AI 交接 prompt
│
├── mcp-server/
│   ├── src/index.ts            # MCP server + Express HTTP server（28 個 MCP tools）
│   ├── data/project.json       # 持久化（runtime 寫入，勿手動編輯）
│   ├── CLAUDE.md               # AI Domain Expert 操作手冊
│   └── package.json
│
└── .mcp.json                   # Claude Code MCP 設定（本機）
```

---

## 核心概念

### 資料模型

```
Project
└── boards: Board[]                 # 每個 Board = 一個 Bounded Context
    ├── notes: StickyNote[]         # 所有便條紙（含 group 關聯）
    ├── remodels: Remodel[]         # Read Model 4-in-1 卡片
    ├── links: Link[]               # 元素間的連結箭頭
    └── flowPaths: FlowPath[]       # 命名流程路徑
```

### DomainEvent-Centric 設計

每個 DomainEvent 是一個 **Group 的錨點**，可以附掛衛星便條：

```
DomainEvent（橘）
  ├── commandId ──→ Command（藍）            # 觸發此事件的指令
  │                    └── informationForCommandId ──→ Information（綠）  # Command 的輸入參數
  └── entityId  ──→ Entity（黃）             # 此事件操作的 Aggregate
                       └── linkedAggregateNoteId ──→ Aggregate（黃金框）  # 當 Entity 被標記為 AR
```

衛星便條（Command、Information、Entity）帶有 `groupEventId` 指向父 DomainEvent，
拖動 DomainEvent 時整個 group 一起移動。

### ElementType（12 種）

| Type | 顏色 | 說明 |
|------|------|------|
| `DomainEvent` | 橘 | 已發生的領域事件（Group 錨點）|
| `Command` | 藍 | 使用者意圖/指令（衛星，需透過 Add Command 創建）|
| `Information` | 綠 | Command 的輸入參數表（衛星，Add Command 時自動創建）|
| `Entity` | 黃 | 被操作的 Aggregate（衛星，需透過 Set Entity 創建）|
| `Aggregate` | 黃金框 | Aggregate 概念節點（Entity 被標記為 AR 時自動創建）|
| `Actor` | 淡黃 | 使用者/外部角色 |
| `Policy` | 紫 | 業務規則/策略 |
| `ExternalSystem` | 粉紅 | 外部系統 |
| `ReadModel` | 深綠 | 查詢視圖（已改為 Remodel，此 type 保留相容性）|
| `Hotspot` | 紅 | 需要討論的問題點 |
| `Diamond` | 粉 | 決策菱形 |
| `Dto` | 淺綠 | 資料傳輸物件（monospace 呈現）|

### StickyNote 重要欄位

```typescript
// 核心
id, type, label, position, size, zIndex, createdAt, updatedAt

// DomainEvent 專用
commandId?: string          // → 已連結的 Command note
entityId?: string           // → 已連結的 Entity note
eventProperties?: Property[] // Event output 屬性列表

// Command 專用
information?: Property[]    // Command input 參數列表

// 衛星便條（groupEventId 有值代表是衛星）
groupEventId?: string           // → 父 DomainEvent ID
informationForCommandId?: string // （Information note）→ 所屬 Command ID

// Entity 專用
isAggregateRoot?: boolean       // Entity 是否被標記為 Aggregate Root
linkedAggregateNoteId?: string  // → 自動建立的 Aggregate note

// 視覺/樣式
textFormat?: TextFormat         // { fontSize, bold, italic, color }
paths?: string[]                // 所屬 FlowPath ID 列表
phase?: string                  // 所屬 Phase 名稱
notes?: string                  // 自由文字備註
```

### Aggregate Root 概念

`AggregateRoot` 是一個**標籤**，施加在 Entity 上：
- 在 Entity 的 Detail Panel 點擊「Mark as Aggregate Root」
- 系統自動建立一個 `Aggregate` type 的便條，名稱 = Entity 名稱
- Entity 顯示金色外框 + 右上角 `AR` badge
- Entity 重新命名時，Aggregate 同步更新
- 刪除 Entity → 連帶刪除 Aggregate

### Remodel（Read Model 卡片）

4-in-1 卡片，用於描述查詢側：

| 格子 | 顏色 | 含義 |
|------|------|------|
| 左 | 綠 | Parameters（查詢條件）|
| 中 | 藍 | Query（查詢名稱）|
| 右 | 綠 | Return Type（回傳格式）|

可折疊。可連結 StickyNote（via linkTargetIds）和 Dto note。

### Context 管理

- 每個 Board = 一個 Bounded Context，以 Tab 分頁呈現
- `openBoardIds`：記錄哪些 Context 目前開著（Tab 顯示）
- 關閉 Tab ≠ 刪除，從 Homepage 可重新開啟
- Actor Sub-board：可在 Context 下建立子 Board（`parentContextId`）

### FlowPath 系統

- 命名的流程路徑（有顏色），用於過濾畫布上的元素
- StickyNote / Remodel 都可指定所屬 `paths`
- 啟用 FlowPath 後，不在此路徑的元素會淡化

### Group 互動規則

1. **第一次點擊** group 中任何便條（或背景框）→ 選取整個 group（以 DomainEvent 為代表）
2. **再次點擊**（group 已選取）→ 選取該個別便條，Detail Panel 顯示其屬性
3. **衛星便條不可在畫布上 double-click 編輯**，只能透過 Detail Panel（sidebar）修改
4. **FormatToolbar** 不顯示於 group anchor 或 satellite notes，格式編輯走 sidebar

---

## Store Actions（完整清單）

### Project / Board 管理
| Action | 說明 |
|--------|------|
| `loadProject(project)` | 載入整份專案 |
| `setProjectName(name)` | 更新專案名稱 |
| `addBoard(name)` | 新增 Bounded Context Board |
| `addActorBoard(contextId, name)` | 新增 Actor Sub-board |
| `deleteBoard(id)` | 刪除 Board |
| `openBoard(id)` / `closeBoard(id)` | 開啟/關閉 Tab |
| `setActiveBoard(id)` | 切換 active Board |
| `renameBoard(id, name)` | 重新命名 Board |

### Note 操作
| Action | 說明 |
|--------|------|
| `addNote(note)` | 新增便條 |
| `updateNote(id, updates)` | 更新便條（Entity rename 時同步 Aggregate label）|
| `deleteNote(id)` | 刪除便條（DomainEvent 刪除時 cascade 刪所有衛星）|

### DomainEvent-Centric 動作
| Action | 說明 |
|--------|------|
| `addCommandForEvent(eventId, label, info)` | 新增 Command（+ Information）至 DomainEvent |
| `updateCommandInformation(cmdId, info)` | 更新 Command 的 input 參數 |
| `updateEventProperties(eventId, props)` | 更新 DomainEvent 的 output 屬性 |
| `addEntityForEvent(eventId, label)` | 新增 Entity 至 DomainEvent group |
| `linkEntityToEvent(eventId, entityId)` | 連結現有 Entity 至 DomainEvent |

### Entity / Aggregate Root
| Action | 說明 |
|--------|------|
| `setEntityAsAggregateRoot(entityId)` | 標記 Entity 為 AR，自動建立 Aggregate note |
| `unsetEntityAsAggregateRoot(entityId)` | 取消 AR 標記（Aggregate note 留在畫布）|

### Remodel / Link / FlowPath
| Action | 說明 |
|--------|------|
| `addRemodel(remodel)` / `updateRemodel` / `deleteRemodel` | Read Model 卡片 CRUD |
| `addLink(link)` / `deleteLink(id)` | 連結箭頭 CRUD |
| `addFlowPath(fp)` / `updateFlowPath` / `deleteFlowPath` | FlowPath CRUD |
| `clearBoard()` | 清空畫布 |

---

## MCP Tools（完整清單，28 個）

### Context 管理
- `es_list_contexts` — 列出所有 Bounded Context
- `es_get_project` — 取得整份專案資料
- `es_create_context` — 新建 Context
- `es_switch_context` — 切換 active Context
- `es_rename_context` — 重新命名 Context
- `es_delete_context` — 刪除 Context

### Board 操作
- `es_get_board` — 取得當前 Board 完整資料
- `es_set_board_name` — 更新 Board 名稱
- `es_clear_board` — 清空 Board

### 便條紙 CRUD
- `es_add_note` — 新增 StickyNote（指定 type、label、position）
- `es_update_note` — 更新 StickyNote 屬性
- `es_delete_note` — 刪除 StickyNote

### DomainEvent-Centric
- `es_add_command_for_event` — 為 DomainEvent 新增 Command（含 Information）
- `es_update_command_information` — 更新 Command input 參數
- `es_update_event_properties` — 更新 DomainEvent output 屬性
- `es_add_entity_for_event` — 為 DomainEvent 新增 Entity
- `es_link_entity_to_event` — 連結現有 Entity 至 DomainEvent
- `es_add_entity_for_event` — 新增 Entity 至 DomainEvent group

### Entity / Aggregate Root
- `es_add_entity_for_event` — 新增 Entity 並加入 group
- `es_link_entity_to_aggregate_root` — 連結 Entity 至 AggregateRoot（legacy）

### Read Model
- `es_add_remodel` — 新增 Remodel 卡片
- `es_update_remodel` — 更新 Remodel 內容
- `es_delete_remodel` — 刪除 Remodel

### Links & FlowPaths
- `es_add_link` — 新增連結箭頭
- `es_delete_link` — 刪除連結箭頭
- `es_add_flow_path` — 新增 FlowPath
- `es_delete_flow_path` — 刪除 FlowPath

### 批次操作
- `es_add_flow` — 一次性建立完整 Event Storming 流程
- `es_set_event_paths` — 批次指定多個便條的 FlowPath
- `es_set_event_phase` — 批次指定多個便條的 Phase

---

## 同步機制

```
React UI
  ↕ POST /api/board（每次 project state 變更）
Express Server（:3333）
  ↕ SSE /api/events（MCP 操作 → 推播給 React）
MCP Server（stdio）
  → 寫入 mcp-server/data/project.json（持久化）
```

### Relay 模式（跨主機）

若要從另一台主機的 Claude Code 操作同一個畫布：

```json
{
  "mcpServers": {
    "event-storming": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "ES_RELAY_MODE": "true",
        "ES_RELAY_BASE": "http://<主機A的IP>:3333"
      }
    }
  }
}
```

---

## 開發指令

```bash
# 前端
npm run dev         # 啟動 Vite dev server（port 5173）

# MCP server
cd mcp-server
npm run dev         # tsx watch（開發）
npm run build       # 編譯 TypeScript → dist/
```

---

## 狀態持久化

- **前端**：Zustand `persist`，存在 `localStorage`（key: `event-storming-board`，目前 version: 11）
- **MCP server**：`mcp-server/data/project.json`（每次操作後寫入）
- React sync 到 MCP server 的時間點：`project` state 每次變更時（`useEffect`）
- **Store migration**：版本升級時自動執行（目前最新 v11：AggregateRoot → Aggregate 改名）
