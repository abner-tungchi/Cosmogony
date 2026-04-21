# Spec Design Document

> **目的**：定義 Event Storming Tool 匯出給 AI 實作用的 spec 格式。
> **狀態**：2026-04-21 定稿
> **討論紀錄**：`docs/discussions/2026-04-20-usecase-spec-and-readmodel-extension.md`
> **延伸說明**：`docs/spec-design-explanation.md`（設計理由與 FAQ）

---

## 1. Overview

Event Storming Tool 的 board 可匯出為 **Spec Bundle** — 一份 JSON 文件，包含 4 種 spec 類型，供 AI agent 產出程式碼實作。

Bundle 結構：

```json
{
  "manifestVersion": 1,
  "bundleId": "<opaque id>",
  "context": "<bounded context name>",
  "aggregates": [AggregateSpec, ...],
  "useCases":   [UseCaseSpec,   ...],
  "readModels": [ReadModelSpec, ...],
  "dtos":       [DtoSpec,       ...]
}
```

---

## 2. AggregateSpec

描述一個 Aggregate 的靜態結構（state / invariants / methods / relationships / emitted events）。

```json
{
  "kind": "AggregateSpec",
  "aggregateSpecId": "<opaque id>",
  "aggregate": "<Aggregate name>",
  "behavior": "<自然語言描述>",

  "identity": {
    "name": "<field name>",
    "_suggested_type": "<id type>",
    "_suggested_field": "<field name>"
  },

  "state": [Property, ...],

  "invariants": [Invariant, ...],

  "methods": [
    {
      "useCaseSpecId": "<ref>",
      "useCase": "<UseCase name>",
      "emitsEvent": "<Event name>",
      "_suggested_method": "<method name hint>"
    }
  ],

  "relationships": [Link, ...],

  "events": [
    { "name": "<Event name>", "emittedByUseCaseSpecId": "<ref>" }
  ],

  "_suggested_aggregateId": "<ID type>",
  "_suggested_repository": "<Repository name>"
}
```

### 欄位說明

| 欄位 | 必填 | 說明 |
|------|------|------|
| `kind` | ✅ | 固定 `"AggregateSpec"` |
| `aggregateSpecId` | ✅ | 唯一識別符，供跨 spec 參照 |
| `aggregate` | ✅ | Aggregate 名稱（authored）|
| `behavior` | ✅ | 行為描述（authored）|
| `identity` | ✅ | Aggregate 的識別欄位定義 |
| `state` | ✅ | state 欄位列表（authored）|
| `invariants` | ⚠️ | 不變量列表，可為空陣列 |
| `methods` | ✅ | 操作列表，每筆 reference 一個 UseCase |
| `relationships` | ⚠️ | 與其他元素的關係（可為空）|
| `events` | ✅ | 此 Aggregate 會發出的所有事件名稱列表 |

**不包含**：`lifecycle`、`paths`（見說明文件的 FAQ）

---

## 3. UseCaseSpec

描述一個 Command 執行的單次動作（input → method → emitted event）。

```json
{
  "kind": "UseCaseSpec",
  "useCaseSpecId": "<opaque id>",
  "aggregateSpecId": "<ref>",

  "useCase": "<Command name>",
  "behavior": "<自然語言描述>",
  "aggregate": "<Aggregate name>",
  "paths": ["<FlowPath name>", ...],

  "input": [Property, ...],

  "emittedEvent": "<Event name>",
  "eventPayload": [Property, ...],

  "links": [Link, ...],

  "_suggested_aggregateId": "<ID type>",
  "_suggested_method": "<method name>",
  "_suggested_domainEvent": "<event class name>",
  "_suggested_repository": "<Repository name>"
}
```

### 欄位說明

| 欄位 | 必填 | 說明 |
|------|------|------|
| `kind` | ✅ | 固定 `"UseCaseSpec"` |
| `useCaseSpecId` | ✅ | 唯一識別符 |
| `aggregateSpecId` | ✅ | 指向此 UseCase 操作的 Aggregate |
| `useCase` | ✅ | Command 名稱（authored）|
| `behavior` | ✅ | 行為描述（authored）|
| `aggregate` | ✅ | Aggregate 名稱（human-readable 方便閱讀）|
| `paths` | ⚠️ | 所屬 FlowPath 名稱列表 |
| `input` | ✅ | Command 輸入參數 |
| `emittedEvent` | ✅ | 發出的事件名稱（reference）|
| `eventPayload` | ✅ | 發出事件的 payload 定義 |
| `links` | ⚠️ | 關聯的其他元素（Actor / Policy ...）|

**重要：** Aggregate spec 的 `events[]` 只放 event name，payload 在 UseCase spec 的 `eventPayload`。這是 single source of truth 原則。

---

## 4. ReadModelSpec

描述一個查詢（CQRS 的 Query side）。

```json
{
  "kind": "ReadModelSpec",
  "readModelSpecId": "<opaque id>",

  "queryName": "<Query name>",
  "behavior": "<自然語言描述>",

  "parameters": [Property, ...],

  "returnType": {
    "shape": "object",
    "fields": [
      {
        "name": "<field name>",
        "type": "<type>",
        "dtoSpecRef": "<optional DtoSpec id>"
      }
    ]
  },

  "links": [Link, ...],

  "_suggested_queryFunction": "<function name>"
}
```

### 欄位說明

| 欄位 | 必填 | 說明 |
|------|------|------|
| `kind` | ✅ | 固定 `"ReadModelSpec"` |
| `readModelSpecId` | ✅ | 唯一識別符 |
| `queryName` | ✅ | 查詢名稱（authored）|
| `behavior` | ✅ | 行為描述 |
| `parameters` | ✅ | 查詢參數 |
| `returnType` | ✅ | 回傳的結構形狀，可引用 DtoSpec |
| `links` | ⚠️ | 關聯的其他元素 |

**不包含**：`paths`（ReadModel 不在事件流程上）

---

## 5. DtoSpec

描述獨立的資料結構，供 ReadModel 回傳或巢狀引用。

```json
{
  "kind": "DtoSpec",
  "dtoSpecId": "<opaque id>",
  "name": "<DTO name>",
  "description": "<自然語言描述>",
  "fields": [
    {
      "name": "<field name>",
      "type": "<type>",
      "nullable": true | false,
      "dtoSpecRef": "<optional DtoSpec id for nested DTO>"
    }
  ]
}
```

### 欄位說明

| 欄位 | 必填 | 說明 |
|------|------|------|
| `kind` | ✅ | 固定 `"DtoSpec"` |
| `dtoSpecId` | ✅ | 唯一識別符 |
| `name` | ✅ | DTO 名稱 |
| `description` | ⚠️ | 選填說明 |
| `fields` | ✅ | 欄位列表（支援巢狀 DTO 引用）|

---

## 6. 共用結構

### 6.1 Property

```json
{
  "name": "<field name>",
  "type": "<type>",
  "required": true | false,
  "notes": "<optional description>"
}
```

用於 `state[]` / `input[]` / `eventPayload[]` / `parameters[]`。

---

### 6.2 Link / Relationship（Minimal Schema）

三種 spec 共用同一格式（AggregateSpec 稱 `relationships`，UseCaseSpec / ReadModelSpec 稱 `links`）：

```json
{
  "direction": "outbound" | "inbound",
  "targetType": "<ElementType>",
  "targetName": "<target's name>",
  "targetSpecId": "<opaque id>",
  "label": "<optional ad-hoc semantic>"
}
```

**設計原則**：不需 `relationType` enum，靠 `direction + targetType` 即可 100% 推斷語義。

**可用的 `targetType` 值**：`Actor` / `DomainEvent` / `Command` / `Entity` / `Aggregate` / `Policy` / `ExternalSystem` / `ReadModel` / `Dto` / `Hotspot` / `Diamond`

**`targetSpecId` 一律有值**：對應 board 上 note 的 id 或 spec 的 id。

**`label` 欄位**：保留給 ad-hoc 語義補充（例如 `"refund on cancellation"`），不是結構化欄位。

---

### 6.3 Invariant

```json
{
  "id": "<opaque id>",
  "name": "<semantic identifier, camelCase>",
  "title": "<human-readable label>",
  "applicability": "<optional condition>",
  "rules": [
    {
      "when": "<condition>",
      "rule": "<rule statement or expression>"
    }
  ],
  "errorCode": "<error identifier, camelCase>",
  "relatedState": ["<state field name>", ...],

  "provenance": "ui" | "assumption",
  "status": "confirmed" | "needs_review" | "rejected",
  "source": {
    "agent": "<AI agent name>",
    "derivedFrom": ["<spec ref>", ...],
    "inferredAt": "<ISO timestamp>",
    "rationale": "<natural language reasoning>"
  } | null
}
```

#### `when` 欄位格式

**Reserved keywords**：
- `"always"` — 無條件適用
- `"never"` — 永不適用（用於 rejected invariant 保留紀錄）

**一般條件語法**：`<field> <operator> <value>`
- Operators: `==` `!=` `>` `<` `>=` `<=` `&&` `||`
- Values: 字面值（`0`, `"text"`）/ enum case（`.draft`）/ 其他欄位

範例：
```json
{ "when": "always", "rule": "totalAmount >= 0" }
{ "when": "status == .shipped", "rule": "不允許 cancel 操作" }
{ "when": "customerStatus == .established && status != .draft", "rule": "必須有值，且 >= 0" }
```

#### Provenance 規則

- `"provenance": "ui"` → 人類在 UI 填寫；`status` 必為 `"confirmed"`；`source` 為 `null`
- `"provenance": "assumption"` → AI 推斷；`status` 預設 `"needs_review"`；必須附 `source`

**AI 推斷限制**：AI 推斷**只能寫入 `invariants[]`**，Aggregate spec 的其他欄位（state / methods / identity）必須 authored-only。

---

### 6.4 Authored vs Derived（`_suggested_` 前綴）

**Authored 欄位**（user 在 UI 明確輸入的事實）：無前綴
- AI 必須 100% 信任，不得修改

**Derived 欄位**（程式依命名慣例推導的建議）：`_suggested_` 前綴
- AI 可採用，也可根據目標框架/語言調整

範例：
```json
{
  "aggregate": "Order",                       // authored — AI 必信
  "_suggested_aggregateId": "OrderId",        // derived — AI 可改
  "_suggested_method": "Order.cancel",        // derived
  "_suggested_repository": "OrderRepository"  // derived
}
```

---

### 6.5 Machine-stable References

所有跨 spec 參照都用 opaque ID，不用 name：

| 欄位 | 指向 |
|------|------|
| `aggregateSpecId` | AggregateSpec.aggregateSpecId |
| `useCaseSpecId` | UseCaseSpec.useCaseSpecId |
| `readModelSpecId` | ReadModelSpec.readModelSpecId |
| `dtoSpecId` / `dtoSpecRef` | DtoSpec.dtoSpecId |
| `targetSpecId` | 任何 spec 的 id 或 board note id |

**理由**：user 重新命名時不會斷鏈。

---

## 7. 流程：AI 推斷 Invariant 的 T1/T2/T3 分離

| 時機 | 觸發 | 行為 |
|------|------|------|
| **T1 Export** | user 按「Export Bundle」| **不做 AI 推斷**，純輸出既有 authored 內容 |
| **T2 Analyze** | user 在 Detail Panel 按「Analyze with AI」| **寫回 spec**，標 `provenance: "assumption"` + `status: "needs_review"` |
| **T3 Code-gen** | user 把 bundle 餵給 Claude Code 實作 | **不寫回 spec**，只在程式碼產 `// INVARIANT` / `// ASSUMPTION` 註解 |

**關鍵原則**：Export 不會污染 spec；只有 user 明示觸發 Analyze 才寫回。

---

## 8. 程式碼層標示慣例（AI 產生的程式碼）

AI 實作時，invariant 與 assumption 的註解格式：

```swift
// INVARIANT: inv-total-amount-non-negative (ui, confirmed) — 總金額不得為負
guard totalAmount >= 0 else { throw OrderError.invalidTotalAmount }

// INVARIANT: inv-cannot-cancel-shipped (assumption, needs_review) — 已出貨不可取消
// SOURCE: claude-opus-4.7 @ 2026-04-21
// REVIEW: please confirm this is a real business rule before production
guard status != .shipped else { throw OrderError.orderAlreadyShipped }

// ASSUMPTION: no corresponding spec invariant, discovered during implementation
// Consider promoting to Aggregate spec if universal
guard cancellationRequests < 3 else { throw OrderError.tooManyAttempts }
```

**固定格式**：
- `// INVARIANT: <id> (provenance, status) — <title>`
- `// ASSUMPTION: <rule statement>`

---

## 9. 完整範例

請參考 `docs/spec-design-explanation.md` 的「完整範例」段落。

---

## 10. 版本

- **v1** — 2026-04-21 定稿（本文件）
- 未來若 schema 變動，`manifestVersion` 遞增，提供 migration 指引
