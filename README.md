# Event Storming Tool

一個給 **Domain Expert** 和 **AI** 協作使用的 **Event Storming 白板工具**。支援人員在畫布上繪製 Event Storming 圖，也支援 AI 透過 MCP 工具直接操作畫布，最終能匯出為 **Spec Bundle**（JSON）餵給 AI 產出可執行的程式碼。

![Hero](docs/screenshots/01-hero.png)

---

## 目錄

- [1. 專案目的](#1-專案目的)
- [2. 核心概念](#2-核心概念)
  - [2.1 DomainEvent-Centric 設計](#21-domainevent-centric-設計)
  - [2.2 Aggregate 與 Invariant](#22-aggregate-與-invariant)
  - [2.3 Read Model](#23-read-model)
  - [2.4 Spec Bundle 匯出](#24-spec-bundle-匯出)
- [3. 12 種元素類型](#3-12-種元素類型)
- [4. 技術架構](#4-技術架構)
- [5. 快速開始](#5-快速開始)
- [6. 主要功能](#6-主要功能)
- [7. 文件索引](#7-文件索引)

---

## 1. 專案目的

**Event Storming** 是一種視覺化協作方法，用來探索複雜業務領域。透過貼便條紙的方式，領域專家與工程師能共同梳理：

- **發生了什麼事**（DomainEvent）
- **誰觸發的**（Actor / Command）
- **由哪個實體處理**（Entity / Aggregate）
- **有什麼規則**（Policy / Invariant）

本工具的特色是：

1. **不只給人用**，也讓 AI（Claude）能透過 **MCP** 協議直接操作畫布
2. **可匯出為結構化 Spec**，AI 讀完後能產出可執行的 DDD/CQRS 程式碼
3. **輕量 workshop 精神**：不強迫使用者填寫過多欄位，支援漸進式精緻化

**適合誰用？**
- 領域專家（Domain Expert）：梳理業務流程、與工程師對齊
- 架構師 / 資深工程師：做 DDD 建模
- AI agent（Claude）：自動建模或協助實作

---

## 2. 核心概念

### 2.1 DomainEvent-Centric 設計

在傳統 Event Storming 中，命令（Command）、事件（Event）、實體（Entity）通常是獨立的便條。本工具採**以 DomainEvent 為錨點**的 group 設計：

```
DomainEvent（橘）              ← Group 錨點
  ├── commandId → Command（藍）
  │                └── informationForCommandId → Information（綠）
  └── entityId  → Entity（黃）或 Aggregate（金色外框）
```

- **DomainEvent 是 Group 的錨點**，拖動它整個 group 一起移動
- **Command / Information / Entity 是衛星便條**，帶有 `groupEventId` 指向父 DomainEvent
- **可折疊為 Chip**：畫面複雜時，整個 group 可折疊成 40px 橘色小卡

**展開的 Group：**

![DomainEvent Group](docs/screenshots/02-domain-event-group.png)

**折疊的 Chip：**

![Collapsed Chip](docs/screenshots/03-collapsed-chip.png)

> 💡 **為什麼要這樣設計？**
> 原本的 4-in-1 Bundle 卡片把四個格子綁死在一起，但實務上 Command 和 Entity 會跨多個 DomainEvent 共享。改為 DomainEvent-Centric 後，同一個 Entity 可被多個 DomainEvent 引用，Command 也可重用。

---

### 2.2 Aggregate 與 Invariant

**Aggregate** 是 DDD 中的「一致性邊界」，負責保護業務規則不被破壞。

在本工具中：
- **Entity 被標記為 Aggregate Root 後**，便條會**直接轉型為 Aggregate**（不新增新的便條）
- Aggregate 有金色外框 + 右上角 `AR` badge
- 多個 DomainEvent 可透過 `entityId` 共享同一個 Aggregate

**Aggregate 的 Detail Panel** 可定義完整 spec：

![Aggregate Detail Panel](docs/screenshots/04-aggregate-detail-panel.png)

#### Aggregate Spec 的欄位

- **Identity**：Aggregate 的識別欄位（例如 `orderId`），並顯示推導的型別建議（`OrderId`）
- **State**：Aggregate 持有的屬性列表（name / type / required）
- **Invariants**：業務不變量（規則），分三個視覺 band：
  - **CONFIRMED**：使用者明確填寫的規則（實線無底色）
  - **NEEDS REVIEW · AI-inferred**：AI 推斷的候選規則（虛線淡黃底）
    - 每張卡片附 `source.agent` / `source.rationale`（推斷來源與理由）
    - 附 `Approve` / `Edit` / `Reject` 三個動作
  - **Rejected**：被拒絕的規則（灰色刪除線，可摺疊）

#### Invariant 的完整結構

每條 invariant 包含：
- `name`：語意識別符（camelCase，例 `checkCancellable`），對應產出程式碼的 method 名稱
- `title`：人類可讀標籤（例「已出貨不可取消」）
- `applicability`：此規則何時適用（選填，例 `customerStatus == .established`）
- `rules`：**多條條件規則**，每條有 `when` + `rule` 兩欄
  - `when`：條件（例 `status == .shipped`、或 reserved keyword `always` / `never`）
  - `rule`：違反時的行為或狀態（自然語言或表達式）
- `errorCode`：違反時的錯誤識別符（例 `orderAlreadyShipped`）
- `relatedState`：此規則牽涉到哪些 state 欄位

> 💡 **為什麼 Invariant 這麼複雜？**
> 因為 AI 需要這些資訊才能穩定產出程式碼：`name` → method 名稱、`applicability` → guard 條件、`rules[].when` → if/switch 分支、`errorCode` → 拋哪個 error。沒這些，每次 AI 生出的程式碼都不一樣。

---

### 2.3 Read Model

**Read Model** 代表 CQRS 的 Query side — 描述「如何查詢資料」，與 Command side（Aggregate）分離。

在畫布上以 **4-in-1 卡片**呈現：

![Remodel Card](docs/screenshots/05-remodel-card.png)

三個彩色格子：

| 格子 | 顏色 | 含義 | 例 |
|------|------|------|-----|
| 左（Parameters） | Mint green | 查詢參數 | `customerId: CustomerId, from: Date` |
| 中（Func Name） | Blue-gray | 查詢函式名 | `getOrderSummary` |
| 右（Return Type） | Mint green | 回傳資料結構 | `OrderSummaryDto[]` |

**Detail Panel** 使用結構化編輯器（非 plain text）：

![Remodel Detail Panel](docs/screenshots/06-remodel-detail-panel.png)

- **Parameters**：table 編輯器（name / type / required）
- **Return Type**：
  - `shape`：下拉選單（object / array / primitive）
  - `fields`：每個欄位有 name / type / nullable / **dtoSpecRef**（可引用 DTO）
- 畫布上的 sub-note 內容會**從結構化資料自動生成**（你改欄位 → 畫布即時更新）

#### Source Events（可選）

Read Model 可連結到 DomainEvent，表示「從這些事件投影資料」。展開 Source Events 區塊即可管理。

---

### 2.4 Spec Bundle 匯出

工具最終目的是產出 **Spec Bundle**：一份 JSON 文件，AI 讀完後能產出可執行的 DDD/CQRS 程式碼。

![Export Modal](docs/screenshots/10-export-modal.png)

支援兩種格式：
- **Markdown**：給人類審閱（含 DomainEvents / ReadModels / FlowPaths 段落）
- **JSON**：給 AI 處理（結構化，含推導欄位）

### Bundle 結構

```json
{
  "manifestVersion": 1,
  "bundleId": "...",
  "context": "OrderManagement",
  "aggregates":  [AggregateSpec, ...],
  "useCases":    [UseCaseSpec,   ...],
  "readModels":  [ReadModelSpec, ...],
  "dtos":        [DtoSpec,       ...]
}
```

### 四種 Spec 類型

| Spec 類型 | 對應 DDD 概念 | 回答什麼問題 |
|-----------|------------|-------------|
| **AggregateSpec** | Aggregate（一致性邊界） | 這個 Aggregate 有什麼 state？有什麼 invariant？ |
| **UseCaseSpec** | Command + DomainEvent | 誰發起動作？輸入什麼？產出什麼事件？ |
| **ReadModelSpec** | Query / Projection | 要查什麼資料？輸入輸出格式？ |
| **DtoSpec** | Data Transfer Object | 傳遞資料的結構長什麼樣？ |

### Authored vs Derived（`_suggested_` 前綴）

為避免 AI 把推導欄位當成使用者明確規定的事實，Spec 中所有**命名推導**的欄位都加 `_suggested_` 前綴：

```json
{
  "aggregate": "Order",                      // ✅ 使用者填的，AI 必信
  "_suggested_aggregateId": "OrderId",       // ⚠️ 命名推導建議，AI 可依框架調整
  "_suggested_method": "Order.cancel",       // ⚠️ 同上
  "_suggested_repository": "OrderRepository" // ⚠️ 同上
}
```

> 📖 **完整 Spec 規格**：[`docs/spec-design.md`](docs/spec-design.md)
> 📖 **設計理由 FAQ**：[`docs/spec-design-explanation.md`](docs/spec-design-explanation.md)

---

## 3. 12 種元素類型

| Type | 顏色 | 說明 |
|------|------|------|
| `DomainEvent` | 橘 | 已發生的領域事件（Group 錨點）|
| `Command` | 藍 | 使用者意圖 / 指令（衛星便條）|
| `Information` | 綠 | Command 的輸入參數（衛星便條）|
| `Entity` | 黃 | 被操作的實體（衛星便條）|
| `Aggregate` | 金色外框 | Aggregate Root（由 Entity 標記轉型）|
| `Actor` | 淡黃 | 使用者 / 外部角色 |
| `Policy` | 紫 | 業務規則 / 策略 |
| `ExternalSystem` | 粉紅 | 外部系統 |
| `ReadModel` | 深綠 | 查詢視圖（legacy，現在用 Remodel 4-in-1）|
| `Hotspot` | 紅 | 需要討論的問題點 |
| `Diamond` | 粉 | 決策菱形 |
| `Dto` | 淺綠 | 資料傳輸物件（支援結構化欄位定義）|

---

## 4. 技術架構

### 前端 — React + TypeScript (Vite)

- **React** + **TypeScript**：元件化架構，型別貫穿全專案
- **Vite**：極速 HMR
- **Zustand + immer**：狀態管理，含 `persist` middleware（localStorage，目前 v14）和版本 migration
- **dnd-kit**：拖拉排序

### 後端 — Node.js + TypeScript + Express

- **Express**：輕量 HTTP server，提供 `/api/board`（POST）、`/api/events`（SSE）
- **MCP SDK**（`@modelcontextprotocol/sdk`）：AI 操作畫布的協議
- **SSE**（Server-Sent Events）：MCP server → React 的即時推播

### 前後端共用 TypeScript 的好處

同一份型別定義貫穿前後端，MCP server 和 React 說同一種語言，減少資料格式轉換的錯誤。

---

## 5. 快速開始

### 安裝

```bash
npm install
cd mcp-server && npm install
```

### 啟動開發環境

```bash
# Terminal 1 — 前端 (Vite :5173)
npm run dev

# Terminal 2 — MCP server (:3333)
cd mcp-server
npm run dev
```

打開 http://localhost:5173/ 即可使用。

### 建置

```bash
npm run build               # 前端
cd mcp-server && npm run build   # MCP server
```

### MCP 設定（讓 Claude Code 連上）

在 Claude Code 的 `.mcp.json` 加入：

```json
{
  "mcpServers": {
    "event-storming": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

---

## 6. 主要功能

### 6.1 FlowPath 過濾

為 DomainEvent 指定所屬的 FlowPath（命名流程）。啟用過濾後，不在此路徑的元素會淡化，便於聚焦某條流程。

![FlowPath Filter](docs/screenshots/09-flowpath-filter.png)

### 6.2 Group 折疊（Chip）

畫面複雜時，可將整個 DomainEvent group 折疊成 40px Chip：
- **雙擊**展開
- **單擊**選取
- 支援 Link Mode 連線

### 6.3 Link Mode

啟用 Link Mode 後，可在任意兩個元素間拉箭頭連線，表示語意關聯（Actor → Command、Event → Policy 等）。

![Link Mode](docs/screenshots/08-link-mode.png)

### 6.4 MCP 整合（AI 直接操作畫布）

AI（例如 Claude Code）可透過 28 個 MCP tools 直接在畫布上：
- 建立 / 修改 / 刪除便條與 Remodel
- 連結元素
- 批次建立完整 Event Storming 流程
- 指定 FlowPath 與 Phase

這讓 AI 能擔任「共同建模者」的角色，而非只是事後總結。

### 6.5 Dto 結構化欄位 + 巢狀引用

Dto 便條支援定義結構化欄位，並可引用其他 Dto（例如 `OrderSummaryDto.lines: OrderLineDto[]`）：

![Dto Detail Panel](docs/screenshots/07-dto-detail-panel.png)

**REF picker** 會列出當前 board 上所有 Dto note（排除自身，防止循環引用）。

---

## 7. 文件索引

| 文件 | 內容 |
|------|------|
| [`CLAUDE.md`](CLAUDE.md) | 專案完整說明（給 Claude Code 讀的），含資料模型、Store Actions、MCP Tools 清單 |
| [`docs/spec-design.md`](docs/spec-design.md) | Spec Bundle 正式規格 |
| [`docs/spec-design-explanation.md`](docs/spec-design-explanation.md) | Spec Bundle 設計理由 FAQ |
| [`docs/UX-004-spec-bundle-ui.md`](docs/UX-004-spec-bundle-ui.md) | Aggregate / Dto / Remodel UI 規格 |
| [`docs/discussions/`](docs/discussions/) | 多方 AI 討論紀錄（Claude / Codex / Gemini），記錄每個設計決策的推理過程 |
| [`docs/screenshots/README.md`](docs/screenshots/README.md) | 本 README 引用的截圖清單與規範 |

---

## License

（待定）
