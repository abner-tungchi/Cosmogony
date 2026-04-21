# Spec Design 說明文件

> **目的**：記錄為什麼 Spec Design 會是現在這樣 — 讓未來的你（或新加入的人）快速理解設計理由，不用再重新討論一輪。
> **對象**：Event Storming Tool 的維護者 / 用此 spec 做實作的 AI agent。
> **完整規格**：`docs/spec-design.md`
> **討論過程**：`docs/discussions/2026-04-20-usecase-spec-and-readmodel-extension.md`

---

## 1. 這份 spec 想解決什麼問題？

### 背景
Event Storming Tool 原本只能匯出 markdown 給人類看。要讓 AI 能直接讀 spec 產出可執行程式碼，markdown 太不精確 — AI 會亂猜欄位、亂編方法名、亂補假設。

### 目標
產出一份 JSON 格式的 **Spec Bundle**，讓 AI 能：
1. 精確知道有哪些 Aggregate、UseCase、ReadModel、DTO
2. 知道哪些是 user 明確定義的事實，哪些是工具自動推導的建議
3. 知道業務規則（invariants）與錯誤處理
4. 能跨框架/語言產出一致的實作

---

## 2. 為什麼是 4 種 Spec？

Event Storming 在 DDD/CQRS 的世界裡，自然分成這幾個職責，不是我們憑空發明的：

| Spec 類型 | DDD 對應概念 | 回答什麼問題 |
|-----------|------------|-------------|
| **AggregateSpec** | Aggregate（一致性邊界）| 「這個領域物件的 state 是什麼？有什麼規則要守？」 |
| **UseCaseSpec** | Command + DomainEvent | 「誰發起這個動作？輸入什麼？產出什麼事件？」 |
| **ReadModelSpec** | Query / Projection | 「要查什麼資料？輸入輸出格式？」 |
| **DtoSpec** | Data Transfer Object | 「傳遞資料的結構長什麼樣？」 |

**為什麼不把它們合成一份？** 因為 Command-side 跟 Query-side 本質不同（CQRS 原則）。Aggregate 是名詞、UseCase 是動詞、ReadModel 是查詢、DTO 是資料容器。混在一起會讓每份 spec 都塞一堆對它不適用的欄位。

---

## 3. 核心設計原則（讀懂這三條就能理解整個 spec）

### 原則 1：Single Source of Truth
**每個資訊只存一個地方**。
- Event payload 只在 `UseCaseSpec.eventPayload`，Aggregate spec 的 `events[]` 只放名字
- Invariant 只在 Aggregate spec，不重複在 UseCase spec
- Link 資訊從 board 的 `linkedXxxIds` 拆出來，用 minimal schema

**為什麼？** 重複欄位會 drift（一邊改了另一邊忘了改），是 bug 滋生地。

---

### 原則 2：Authored vs Derived 明確分層
- **Authored**（user 在 UI 填的）：無前綴，AI 必須 100% 信任
- **Derived**（程式自動推導的建議）：`_suggested_` 前綴，AI 可改

**舉例：**
```json
{
  "aggregate": "Order",                  // ✅ user 填的，AI 必信
  "_suggested_repository": "OrderRepository"  // ⚠ 自動推導，AI 可按框架調整
}
```

**為什麼？** 如果不分層，AI 會把 `"repository": "OrderRepository"` 當聖旨，跨框架時產出僵硬。加前綴後，AI 知道「這只是建議」，能在 Spring Boot 用 `JpaRepository`、在 NestJS 用 class、在 Python 改成 `order_repository`。

---

### 原則 3：Target type 決定語義，不需要 relationType enum
**Link 不需要額外的關係類型 enum**。看 `targetType` 就能 100% 推斷關係。

| Target type | 推斷的關係 |
|-------------|----------|
| `Entity` | `contains` |
| `Policy` | `governs` / `governed_by`（方向決定）|
| `ExternalSystem` | `integrates_with` |
| `DomainEvent`（from ReadModel） | `sources_from` |
| `Dto`（from ReadModel） | `returns` |
| `Actor` | `consumed_by` / `triggered_by`（方向決定）|
| `ReadModel`（from ReadModel） | `composes_with` |

**為什麼？** 關係類型與 target type 是 1:1 對應，加 enum 是冗餘、會造成 drift。

---

## 4. FAQ — 為什麼做這個決定？

### Q1：為什麼 Aggregate 沒有 `lifecycle` 欄位？
**原本有**（`initialState`, `terminalStates`, `createdByEvent`, `archivedByEvent`）。
**後來移除**，因為：
- `initialState` 可從 `state` 的 default value 推得
- `terminalStates` 可從 invariants 推得（例如「status == shipped 時不可 cancel」）
- `createdByEvent` 可從 `events[]` + UseCase spec 推得
- **四個都是從其他欄位重複出來的資訊**，保留會 drift

如果未來真的需要狀態機，會另起一個獨立的 `StateMachineSpec` 類型，只給需要的 Aggregate 用。

---

### Q2：為什麼只有 UseCase 有 `paths`，Aggregate 和 ReadModel 沒有？
- **FlowPath 是事件流程**（event sequence）
- **UseCase** 產生事件，屬於事件流程 ✅
- **Aggregate** 是名詞（資料結構），不「在」流程上 ❌
- **ReadModel** 是查詢動作，不在事件鏈上 ❌

---

### Q3：為什麼不用 `authored` / `derived` 分巢狀區塊，而用 `_suggested_` 前綴？
有三個方案：
- **方案 A**：`{ authored: {...}, derived: {...} }` — 明確但 JSON 深
- **方案 B**：扁平 + `_suggested_` 前綴 — 簡單
- **方案 C**：不分 — AI 會誤解

最終選 B，因為結構夠扁、但前綴一眼分辨。

---

### Q4：為什麼 Invariant 要搞這麼複雜（rules / when / errorCode / applicability）？
因為 AI 產程式碼時需要這些資訊：
- `name` → method 名稱（`checkCancellable`）
- `applicability` → guard 條件（`guard customerStatus == .established else { return }`）
- `rules[].when` → switch/if-else 分支
- `rules[].rule` → 實際邏輯或錯誤訊息
- `errorCode` → 拋哪個 error（`throw Error.orderAlreadyShipped`）

沒這些，AI 只看到「已出貨不可取消」，會自己瞎猜 method 名、error 名、guard 寫法。每次產的程式碼都不一樣。

---

### Q5：為什麼 Invariant 的 `when` 用 plain string，不用結構化 AST？
**結構化**太複雜，user 難寫。
**自由文字**太模糊，AI 難解。
**折衷**：定幾個 reserved keywords（`always` / `never`）+ 建議的語法慣例（`<field> <operator> <value>`），讓 AI 能跨語言翻譯。

寫 `status == .shipped` 在 Swift 直接能用；AI 產 Java 時翻成 `status == OrderStatus.SHIPPED`、Python 翻成 `status == "shipped"`。

---

### Q6：為什麼 AI 推斷的 Invariant 可以寫回 spec，但其他欄位不行？
因為 invariants 是**最容易遺漏的業務規則**。Event Storming 的畫布不擅長表達 invariants（它擅長事件/命令/策略），所以 AI 從 UseCase 語義推斷 invariants 有最高價值。

其他欄位（state, methods, lifecycle）要嘛 user 已經填了，要嘛能從 board 直接匯出，不需要 AI 猜。

---

### Q7：什麼是 T1/T2/T3 分離？
**AI 推斷何時會寫回 spec** 的三個不同時機，嚴格分離：

- **T1 Export**：user 按「匯出 bundle」 → **絕對不寫回**，只輸出既有內容
- **T2 Analyze**：user 在 Detail Panel 按「請 AI 分析」 → **寫回 spec**，但標 `needs_review`
- **T3 Code-gen**：user 把 bundle 餵給 AI 實作 → **不寫回 spec**，只在程式碼產 `// ASSUMPTION` 註解

**為什麼要分？** 因為如果 export 時 AI 就默默寫回 spec，user 根本不知道 spec 被動過。T1/T2/T3 分離讓 AI 寫回 spec 這件事**永遠需要 user 明示觸發**。

---

### Q8：為什麼 DtoSpec 要獨立？不能塞進 ReadModel 嗎？
因為 DTO 會**跨 ReadModel 共用**。
- `OrderSummaryDto` 可能被多個 Query 回傳
- `OrderLineDto` 可能被 `OrderSummaryDto` 和 `OrderDetailDto` 巢狀引用

如果塞進 ReadModel 會造成重複定義。獨立後用 `dtoSpecRef` 引用，single source of truth。

---

### Q9：為什麼所有 ID 都叫 `*SpecId`？
為了讓 rename 不會斷鏈。

**例子**：
- 初始：`{ targetName: "Policy_Cancel", targetSpecId: "note-abc-123" }`
- User 改名：`{ targetName: "RefundPolicy", targetSpecId: "note-abc-123" }` ← name 改了，但 id 沒變

所有跨 spec 引用都用 id，name 只是 human-readable 輔助。

---

### Q10：`label` 欄位在 link 裡是幹嘛的？
**逃生口**。如果未來真的遇到 1:N 語義（同一個 target type 有多種關係），不用改 schema，直接在 `label` 自由描述即可。

目前用到的情境只有一個：Aggregate → ExternalSystem 時，多種整合模式可以區分：
```json
{
  "targetType": "ExternalSystem",
  "targetName": "PaymentGateway",
  "label": "refund on cancellation"
}
```

---

## 5. 完整範例（用 Order 取消訂單情境）

```json
{
  "manifestVersion": 1,
  "bundleId": "order-management-bundle",
  "context": "OrderManagement",

  "aggregates": [
    {
      "kind": "AggregateSpec",
      "aggregateSpecId": "agg-order",
      "aggregate": "Order",
      "behavior": "訂單生命週期管理",

      "identity": {
        "name": "orderId",
        "_suggested_type": "OrderId",
        "_suggested_field": "orderId"
      },

      "state": [
        { "name": "status", "type": "OrderStatus", "required": true },
        { "name": "totalAmount", "type": "Money", "required": true },
        { "name": "customerId", "type": "CustomerId", "required": true },
        { "name": "lines", "type": "OrderLine[]", "required": true }
      ],

      "invariants": [
        {
          "id": "inv-total-amount-non-negative",
          "name": "checkTotalAmount",
          "title": "總金額不得為負",
          "rules": [
            { "when": "always", "rule": "totalAmount >= 0" }
          ],
          "errorCode": "invalidTotalAmount",
          "relatedState": ["totalAmount"],
          "provenance": "ui",
          "status": "confirmed",
          "source": null
        },
        {
          "id": "inv-cannot-cancel-shipped",
          "name": "checkCancellable",
          "title": "已出貨不可取消",
          "rules": [
            { "when": "status == .shipped", "rule": "不允許 cancel 操作" },
            { "when": "status != .shipped", "rule": "允許 cancel 操作" }
          ],
          "errorCode": "orderAlreadyShipped",
          "relatedState": ["status"],
          "provenance": "assumption",
          "status": "needs_review",
          "source": {
            "agent": "claude-opus-4.7",
            "derivedFrom": ["UseCase:CancelOrder", "UseCase:ShipOrder"],
            "inferredAt": "2026-04-21T10:00:00Z",
            "rationale": "CancelOrder 未標 precondition，但與 ShipOrder 操作同一 status 欄位"
          }
        }
      ],

      "methods": [
        {
          "useCaseSpecId": "uc-cancel-order",
          "useCase": "CancelOrder",
          "emitsEvent": "OrderCancelled",
          "_suggested_method": "Order.cancel"
        }
      ],

      "relationships": [
        {
          "direction": "outbound",
          "targetType": "Entity",
          "targetName": "OrderLine",
          "targetSpecId": "note-orderline-001"
        },
        {
          "direction": "outbound",
          "targetType": "Policy",
          "targetName": "CancellationPolicy",
          "targetSpecId": "note-policy-001"
        }
      ],

      "events": [
        { "name": "OrderCancelled", "emittedByUseCaseSpecId": "uc-cancel-order" }
      ],

      "_suggested_aggregateId": "OrderId",
      "_suggested_repository": "OrderRepository"
    }
  ],

  "useCases": [
    {
      "kind": "UseCaseSpec",
      "useCaseSpecId": "uc-cancel-order",
      "aggregateSpecId": "agg-order",

      "useCase": "CancelOrder",
      "behavior": "取消未出貨的訂單",
      "aggregate": "Order",
      "paths": ["OrderFlow"],

      "input": [
        { "name": "orderId", "type": "OrderId", "required": true },
        { "name": "userId", "type": "UserId", "required": true },
        { "name": "reason", "type": "String", "required": false }
      ],

      "emittedEvent": "OrderCancelled",
      "eventPayload": [
        { "name": "orderId", "type": "OrderId" },
        { "name": "cancelledAt", "type": "DateTime" },
        { "name": "reason", "type": "String" }
      ],

      "links": [
        {
          "direction": "inbound",
          "targetType": "Actor",
          "targetName": "Customer",
          "targetSpecId": "note-actor-customer-001"
        }
      ],

      "_suggested_aggregateId": "OrderId",
      "_suggested_method": "Order.cancel",
      "_suggested_domainEvent": "OrderEvents.OrderCancelled",
      "_suggested_repository": "OrderRepository"
    }
  ],

  "readModels": [
    {
      "kind": "ReadModelSpec",
      "readModelSpecId": "rm-order-summary-view",

      "queryName": "OrderSummaryView",
      "behavior": "客服查看訂單摘要",

      "parameters": [
        { "name": "customerId", "type": "CustomerId", "required": true }
      ],

      "returnType": {
        "shape": "object",
        "fields": [
          { "name": "orders", "type": "OrderSummaryDto[]", "dtoSpecRef": "dto-order-summary" }
        ]
      },

      "links": [
        {
          "direction": "outbound",
          "targetType": "DomainEvent",
          "targetName": "OrderCancelled",
          "targetSpecId": "note-event-ordercancelled-001"
        }
      ],

      "_suggested_queryFunction": "OrderSummaryView.query"
    }
  ],

  "dtos": [
    {
      "kind": "DtoSpec",
      "dtoSpecId": "dto-order-summary",
      "name": "OrderSummaryDto",
      "fields": [
        { "name": "orderId", "type": "String" },
        { "name": "status", "type": "OrderStatus" },
        { "name": "totalAmount", "type": "Decimal" },
        { "name": "cancelledAt", "type": "DateTime?", "nullable": true }
      ]
    }
  ]
}
```

---

## 6. 實作時的注意事項

### 6.1 UI 需要的欄位 vs 匯出時推導的欄位

**UI 要支援 user 填寫：**
- Aggregate: `behavior`, `identity.name`, `state[]`, `invariants[]`
- UseCase: `behavior`, `input[]`, `emittedEvent`, `eventPayload[]`
- ReadModel: `behavior`, `parameters[]`, `returnType`
- DTO: `name`, `description`, `fields[]`

**匯出時自動推導（AI 不用填）：**
- 所有 `*SpecId` — UUID 自動生成
- 所有 `_suggested_*` — 用命名慣例從 authored 欄位拼出
- `methods[]` / `events[]` / `relationships[]` / `links[]` — 從 board 上的關聯圖推導

---

### 6.2 Store migration 影響

目前 store version v13。加入 spec 後需要：
- `StickyNote` 擴充 behavior（已做）
- `StickyNote.Aggregate` 新增 state / invariants 欄位
- 新增 `DtoSpec` 資料（可能獨立於 note）
- store version +1，舊資料 migration

---

### 6.3 Exporter 改動

`src/utils/jsonExporter.ts` 需要改寫：
- 原本是直接 export useCase JSON array
- 改成 export 完整 Bundle：`{ manifestVersion, aggregates[], useCases[], readModels[], dtos[] }`
- 新增 Aggregate / ReadModel / Dto 的 export 函式

---

## 7. 關鍵決策一覽（若要查「為什麼」）

| 決策 | 所在 |
|------|------|
| 為什麼引入 4 種 spec | §2 |
| 為什麼移除 lifecycle | Q1 |
| 為什麼只 UseCase 有 paths | Q2 |
| 為什麼用 `_suggested_` 前綴 | Q3 |
| 為什麼 Invariant 欄位這麼多 | Q4 |
| 為什麼 `when` 用 plain string | Q5 |
| 為什麼 AI 推斷限定在 invariants | Q6 |
| 為什麼要 T1/T2/T3 分離 | Q7 |
| 為什麼 DtoSpec 獨立 | Q8 |
| 為什麼所有 id 都是 opaque id | Q9 |
| `label` 欄位的用途 | Q10 |
| 為什麼 link 不需要 relationType | §3 原則 3 |

---

## 8. 如果之後要改設計...

1. **新增欄位**前先問：這個欄位能從其他欄位推得嗎？能推得就別加（原則 1）
2. **新增 enum** 前先問：它跟 target type 是 1:1 嗎？是就別加（原則 3）
3. **新增 spec 類型** 前先問：它真的無法套進 4 種現有 spec 嗎？
4. 如果以上都不行，那就做 — 但記得同步更新 `spec-design.md` 跟這份說明文件
