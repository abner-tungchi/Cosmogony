---
topic: "評估 UseCase 輸出格式作為 AI 實作 spec 的合理性，及其延伸到 ReadModel 的可行性"
status: in-progress
created: "2026-04-20"
updated: "2026-04-21"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 3
---

# 評估 UseCase 輸出格式作為 AI 實作 spec 的合理性，及其延伸到 ReadModel 的可行性

## 議題定義

### 背景

Event Storming Tool 已實作 UseCase（DomainEvent）的 JSON 匯出功能。輸出格式如下：

```json
{
  "useCase": "DeleteProduct",
  "behavior": "Delete a product",
  "input": [
    { "name": "productId", "type": "String", "note": "Product 的唯一識別碼" }
  ],
  "aggregate": "Product",
  "aggregateId": "ProductId",
  "method": "Product.markAsDelete",
  "domainEvent": "ProductEvents.ProductDeleted",
  "repository": "ProductRepository",
  "links": [
    { "type": "Actor", "name": "審計人員" },
    { "type": "DomainEvent", "name": "accountCreate" },
    { "type": "Policy", "name": "XXXPolicy" }
  ],
  "paths": ["OrderFlow", "AuditFlow"]
}
```

此格式是為了讓 AI（如 Claude / Codex）能直接讀取後產出可執行的程式碼（Aggregate method、Domain Event class、Repository 等）。

### 目標

1. 評估目前 UseCase JSON 格式作為 AI 實作 spec 的「資訊充分性」與「歧義性」
2. 找出格式中可能造成 AI 實作困難或誤解的缺口
3. 評估此格式能否延伸到 ReadModel（查詢側）的匯出，或需要設計另一套格式

### 範圍

**討論內：**
- UseCase JSON 格式本身的完整性（欄位是否足以實作）
- AI 解讀此 spec 時可能的歧義或盲點
- ReadModel 的匯出格式設計（沿用 vs 另立）
- 兩者共通的設計原則

**討論外：**
- 工具的 UI 實作細節
- 具體程式語言或框架的實作（討論的是 spec 本身，不是某個語言的實現）
- 匯出檔案的儲存/分享機制

### 約束

- 必須保持 Event Storming 工具現有的資料模型（DomainEvent-Centric）
- 輸出格式應對人類也可讀（不是純機器格式）
- 不能要求 user 在 UI 上填寫過多額外欄位（要尊重 Event Storming 的輕量精神）

### 子議題

**Round 1（已完成）**
- [x] **子議題 1**：UseCase JSON 格式的欄位充分性
- [x] **子議題 2**：欄位語義的歧義性
- [x] **子議題 3**：ReadModel 是否能沿用此格式
- [x] **子議題 4**：兩者共通的設計原則

**Round 2（新議題，基於 Round 1 + user 決策衍生）**
- [x] **子議題 5**：Aggregate spec 的完整欄位組成
- [x] **子議題 6**：Invariants 如何從 Event Storming 畫布取得？
- [x] **子議題 7**：Aggregate spec 與 UseCase spec 的參照關係
- [x] **子議題 8**：ReadModel link 的 relation types enum 值（⚠️ 決策 #13 已於 Round 3 撤回）

**Round 3（User 審視 Round 2 後衍生）**
- [ ] **子議題 9**：ReadModel link 是否真的需要 `relationType`？User 觀察 target type 與 relationType 是 1:1 對應，enum 可能冗餘
- [ ] **子議題 10**：`stateTransitions` 評估（user 傾向不加，請 Codex/Gemini 反思）
- [ ] **子議題 11**：AI 推斷 invariant 寫回 spec 的具體做法（spec 標記 / UI 呈現 / 程式碼註解三層都要能分辨）
- [ ] **子議題 12**：Event link 的 `relationType` enum 收斂（user Q2 未完成的部分）

---

## 討論紀錄

### Round 1 — Claude (Opus 4.6)

#### 子議題 1：UseCase 欄位充分性

**立場**：不充分，但「追求完全充分」是錯的方向。應該設計成「畫布事實層 + AI 補完層」分離。

**論點**：
1. 目前 spec **混合了 authored facts 與 derived naming**。`useCase`、`behavior`、`input`、`aggregate` 是 user 在畫布上明確指定的事實；`aggregateId`、`method`、`domainEvent`、`repository` 則是命名推導。AI 沒辦法分辨哪些可信、哪些只是預設。
2. 最致命的缺失是 **事件 payload**。`StickyNote.eventProperties` 在 codebase 已經存在（`src/types/elements.ts:51`），UI 也會在建立 Command 時把 `Information.information` 複製成 `eventProperties` 預設值，但 `jsonExporter.ts` 完全沒匯出。AI 知道有 `ProductDeleted` 事件，卻不知道事件本身帶什麼資料 — 連基本的 event sourcing 都做不到。
3. **不變式（invariants）與前置條件是 DDD 核心，但 Event Storming 本質不擅長表達**。這是工具與模型的本質張力，不該硬塞進畫布。建議的方向：spec 提供「事實」，AI 在實作時把假設明確標註出來（`// ASSUMPTION: ...`），由人類審視。
4. `input` 的 `note` 欄位目前永遠是空字串（`jsonExporter.ts` 已說明），因為 `Property` 只有 `attrName` 和 `type`。這是個低成本可修的缺口。

#### 子議題 2：欄位語義歧義性

**立場**：高度歧義。根因是 schema 沒有區分「authored vs derived」、「semantic vs convention」、「intent vs implementation」。

**論點**：
1. `method` 最危險，因為它**看起來像實作入口，實際上是命名推導**。應重新命名為 `commandName` 或 `intent`，把方法簽名留給 AI/人類決定。否則不同 AI 會分別生出 `Product.markAsDelete()`、`product.delete()`、`handleDeleteProduct(cmd)` 三種版本。
2. `links` 缺方向與 relation type。一個指向 Policy 的 link 可以是「呼叫前 guard」、「事件後反應」、「文件註記」三種完全不同的實作意圖。建議在 `Link` type 加 `relationType` 與 `direction`。
3. `repository` 不應該存在於 spec 中。它是 100% 命名推導，把實作細節（DI token、interface 名稱、CRUD 方法）洩漏到 spec。Repository 本身就應該由實作層決定。
4. spec 缺 versioning。Event Storming 工具還在演進，AI 需要知道 `specVersion` 來判斷哪些欄位可信、哪些已被 deprecated。

#### 子議題 3：ReadModel 沿用可行性

**立場**：不能沿用，要分開設計。但兩者應遵循同一套 **meta-format**。

**論點**：
1. CQRS 本質差異（Codex/Gemini 已論證充分）— Command 改變狀態並產出 events，Query 不改變狀態並產出 DTO。
2. 工具層面的證據：`Remodel` 已經有獨立的資料結構（4-in-1 + `linkedDtoIds` + `linkedActorId` + `linkedBundleIds`），這暗示工具設計者本來就把它當另一種 entity。強行套 `UseCaseExport` 會丟失這些結構資訊。
3. 但**兩者可以共用 envelope**：
   ```
   { kind, identity, behavior, inputs, outputs, context, source }
   ```
   - UseCase: outputs = DomainEvent payload, source = Aggregate + Repository
   - ReadModel: outputs = DTO schema, source = source events + projection rules

#### 子議題 4：共通設計原則

**立場**：應設計一個抽象的 **SpecEnvelope**，UseCase 與 ReadModel 是它的兩種具體實作。

**論點**：
1. **共通層次**：
   - `identity`：name + kind（`UseCase` / `ReadModel` / `Saga` / ...）
   - `behavior`：自然語言描述意圖
   - `inputs`：結構化參數（含驗證規則）
   - `outputs`：UseCase 是 events + payload；ReadModel 是 DTO schema
   - `context`：links（含 relation type）、paths、actors
   - `source`：UseCase 是 aggregate；ReadModel 是 source events
2. **設計原則：authored vs derived 必須明確分層**。建議結構：
   ```json
   {
     "authored": { ... },   // user 在畫布上的事實（AI 必信）
     "derived": { ... }     // 命名推導的建議（AI 可改）
   }
   ```
3. 此 envelope 設計讓未來新增 spec 類型（Saga、Policy、IntegrationEvent）能延伸而不破壞既有格式。
4. **MD 與 JSON 是不同消費者**：JSON 給 AI / 工具鏈，MD 給人類審閱。MD 可以「翻譯」derived hints 為自然語言（「方法可命名為 markAsDelete」），JSON 則保留結構化資料。

#### 對其他 Agent 的回應

第一輪，先建立基線。但我注意到 Codex 與 Gemini 對「應該擴充 spec 補上 invariants」這點態度不同 — Gemini 主張積極擴充（加 preconditions、validations），Codex 較保守（強調 authored vs derived 區分）。我傾向 Codex 的取向：Event Storming 不該被改造成 BDD spec，否則會失去 workshop 的輕量精神。invariants 應該由 AI 在實作時標註假設，而非要求 user 在畫布上預先填寫。

---

### Round 1 — Codex (GPT-5.4)

#### 子議題 1：UseCase 欄位充分性

**立場**：不充分；足以產出骨架，但不足以穩定產出可執行且語義正確的 Aggregate 實作。

**論點**：
1. 目前 JSON 缺少「事件輸出」與「狀態變更規則」。資料模型其實有 `StickyNote.eventProperties`，而且 UI 還會把 `Command.information` 複製成 `eventProperties` 預設值；但匯出的 UseCase JSON 只有 `input`，沒有 event payload。AI 可以生出 `ProductDeleted` 類別名稱，卻不知道事件內要帶哪些欄位、Aggregate 要改哪些 state。
2. `aggregate` / `aggregateId` / `method` / `repository` 大多是命名推導，不是業務事實。實作程式時真正缺的是 invariant、前置條件、找不到 Aggregate 時的錯誤、刪除是否軟刪除、是否允許重複刪除、是否需要 version/concurrency control。這些都不在 spec 內，AI 只能自行腦補。
3. `input` 只提供 `{ name, type, note }`，而 `note` 在實作匯出時是空字串；也沒有 required/optional、格式限制、值域、跨欄位規則。對 Aggregate method 來說，這不足以決定 validation 與錯誤分支。
4. `links` 與 `paths` 能補上下文，但不能替代執行規格。即使知道此事件連到 `Actor`、`Policy`、`ReadModel`，AI 仍無法判斷 Policy 是呼叫前檢查、事件後反應，還是純文件註記。

#### 子議題 2：欄位語義歧義性

**立場**：有明顯歧義；若不收斂 schema，AI 對同一份 JSON 很容易做出不同實作。

**論點**：
1. `method` 最容易誤導。匯出器實際規則是 `${Aggregate}.${Command label}`，但範例卻是 `Product.markAsDelete`，顯示它可能被理解為「建議方法名」、「既有實作入口」或「自然語言動詞」。不同 AI 可能分別產生 `deleteProduct`、`markAsDelete`、`handleDeleteProduct`。
2. `links` 目前只有 `{ type, name }`，遺失了方向、link label、另一端是 note 還是 remodel、以及連結語義。連到 `Policy` 時，AI 無法知道是 command guard、event subscriber，還是僅供閱讀；連到 `DomainEvent` 時，也不知道是 causal chain、前置事件，還是 saga/policy。
3. `repository` 也不穩定。它可能代表 interface 名稱、具體類別、DI token，或只是「此 Aggregate 需要持久化」的提示。若 spec 不區分「conceptual role」與「code symbol」，AI 會依慣用框架各自解讀。
4. `aggregateId` 的語義同樣不清楚。它可能是型別 `ProductId`、欄位名 `productId`、value object 類別，或 route key。範例同時有 `input.productId` 與頂層 `aggregateId: "ProductId"`，兩者關係沒有明說。

#### 子議題 3：ReadModel 沿用可行性

**立場**：部分沿用，不適合直接共用同一格式；ReadModel 需要獨立 schema。

**論點**：
1. Remodel 的資料模型本質就不同。它是 `aggregateNote`、`parameterNote`、`queryNote`、`returnTypeNote` 的 4-in-1 卡片，另有 `linkedDtoIds`、`linkedActorId`、`linkedBundleIds`。這比較像「查詢定義 + 回傳模型 + 關聯來源」，不是 Command/Aggregate/DomainEvent 的因果鏈。
2. Query 端常跨多個事件或 Aggregate，但 UseCase JSON 假設單一 `aggregate`、單一 `method`、單一 `repository`。把這套硬套到 ReadModel，AI 不是被迫填假資料，就是會錯把 projection 寫成 aggregate method。
3. ReadModel 真正需要的欄位是資料來源與組裝規則，例如 source events、join key、排序/分頁、回傳 DTO、是否 materialized view。現有 Remodel 只有 `queryNote` / `returnTypeNote` / links，可作為基礎，但和 UseCase 所需的 `domainEvent`、`method` 不是同一層抽象。
4. 可沿用的是「可讀性與關聯上下文」的外框，而不是完整欄位集合。`behavior`、`paths`、`links`、參數/輸出結構可共享；`method`、`repository`、`domainEvent` 應留在 Command/UseCase 專屬格式。

#### 子議題 4：共通設計原則

**立場**：應共享「語意描述 + 關聯上下文 + 結構化 I/O」，不要共享會把 Command 與 Query 混為一談的執行欄位。

**論點**：
1. 共享欄位應偏向使用者明確輸入的事實，而不是匯出器推導出的命名。像 `behavior`、`paths`、`notes`、結構化參數/回傳欄位、關聯節點，比 `repository`、`aggregateId` 這種 convention-derived 欄位更穩定。
2. `links` 若要共享，至少要補語義：`targetType`、`targetName`、`direction`、`relation`。否則同一個 `Policy` 連結在 UseCase 與 ReadModel 上都只剩「有連到」，對 AI 幾乎不可執行。
3. 共通 schema 應清楚區分 `authored` 與 `derived`。例如 `aggregate: "Product"` 是 authored context，`repository: "ProductRepository"` 是 derived naming。AI 在生成程式碼時，應優先信任 authored facts，derived 名稱只作預設。
4. 共通原則是描述「意圖、輸入、輸出、依賴、來源」，而不是強迫兩邊都長得像 transaction script。UseCase 再加 mutation/invariant；ReadModel 再加 source/projection/DTO，這樣才符合 CQRS 差異。

#### 對其他 Agent 的回應

常見問題不是 AI 不會寫，而是 spec 把「畫布上的關聯」誤當成「可執行語義」。一旦缺少 invariant、事件 payload、link relation，AI 就會用熟悉框架補完空白，結果每個模型都能生出能編譯但語義不同的版本。

---

### Round 1 — Gemini

#### 子議題 1：UseCase 欄位充分性

**立場**：目前的 `UseCaseExport` JSON schema (`src/utils/jsonExporter.ts`) **嚴重不足**，無法讓 AI agent 可靠地產生出一個健壯且符合 DDD 原則的 Aggregate 實作。它僅僅描述了「快樂路徑」的資料結構，卻完全忽略了 Aggregate 最核心的職責：**保護業務不變性 (invariants)**。

**論點**：
1. **缺乏不變性與前置條件**：`input` 欄位只是一個 `Property` 陣列 (`src/types/elements.ts:25, 41`)，僅有 `attrName` 和 `type`。它沒有定義任何業務規則，例如：必填、長度限制、格式，也無法表達跨欄位的驗證邏輯。更重要的是，它沒有地方可以定義執行 Command 的「前置條件」（例如：只有處於 "draft" 狀態的文章才能被 "publish"）。Aggregate 的靈魂在於其方法執行前的狀態檢查，這點完全缺失。
2. **缺乏錯誤路徑定義**：整個 `UseCaseExport` schema 沒有描述任何失敗場景。如果一個不變性被違反，應該拋出什麼樣的特定 Exception 或返回什麼錯誤？AI agent 只能自行猜測，這會導致產出的程式碼脆弱且不一致。
3. **單一事件模型的假設**：`jsonExporter.ts:46` 的實作是遍歷 `DomainEvent`，這隱含了「一個 Command 只會觸發一個 DomainEvent」的假設。在真實世界中，一個 Command 操作完全可能原子性地產生多個 DomainEvent。目前的結構無法表達這種 1-to-N 的關係。
4. **執行細節的缺失**：
   - **Concurrency**：沒有任何關於並行控制的資訊。要用 Optimistic Lock 嗎？如果是，Aggregate 和 `StickyNote` (`src/types/elements.ts:20`) 都沒有 `version` 欄位。
   - **Idempotency**：如何處理重複的 Command 請求？缺乏對冪等性機制的描述。
   - **Authorization**：雖然 `FlowPath` (`src/types/elements.ts:13`) 可關聯 `actorId`，但 `UseCaseExport` 本身沒有明確指定是哪個 Actor 在執行操作，以及其權限為何。這對生成安全的業務邏輯是致命的缺失。

**建議**：擴充 `UseCaseExport` schema，至少加入 `preconditions: string[]`、`invariants: string[]`，並將 `input` 的 `Property` 擴充為包含 `validations: ValidationRule[]` 的物件。

#### 子議題 2：欄位語義歧義性

**立場**：是的，多個核心欄位存在高度的語義歧義，不同的 AI agent 極有可能產生截然不同的實作。

**論點**：
1. **`method` 欄位過於武斷**：`'${Aggregate}.${Command.label}'` 的格式強行規定了 Aggregate 上的方法名稱必須等於 Command 的 `label`。這雖然常見，但並非總是如此（例如 `handle(command)` 模式）。它混淆了「意圖」（Command）與「實作」（方法名），限制了設計的靈活性。
2. **`links` 欄位是最大的模糊地帶**：這是最有價值的欄位，也是最模糊的。一個指向 `Policy` note 的 `link`，其意圖是「必須強制執行此策略」，還是僅僅是「受此策略治理」的標註？一個指向 `ReadModel` 的 `link`，意圖是「此 Command 會更新這個 ReadModel」，還是「此 Command 的決策依賴這個 ReadModel 的資料」？目前的 `Link` type (`src/types/elements.ts:68`) 只有一個可選的 `label`，不足以承載這些關鍵的語義關係。AI 只能靠猜測，無法保證正確性。
3. **`repository` 欄位過於簡化**：它假設了「一個 Aggregate 對應一個 Repository」的模式，並規定了其命名。但 Repository 的介面方法（`findById`, `save`, `delete` 等）完全是隱含的，AI 不知道應該產生哪些方法簽名。

**建議**：增強 `Link` type，加入一個 `relationType: string` enum 欄位（例如：`'validates_with'`, `'triggers'`, `'updates_projection'`），讓 link 的語義變得明確。

#### 子議題 3：ReadModel 沿用可行性

**立場**：**絕對不可行**。試圖用同一種 `UseCaseExport` 格式來描述 ReadModel 是對 CQRS 模式的根本性誤解。Command-side 和 Query-side 的需求截然不同。

**論點**：
1. **輸入參數的差異**：Query 的輸入遠比 Command 複雜。它需要支援分頁 (`pagination`)、排序 (`sorting`)、複雜過濾 (`filtering`)。而 `Remodel` 的 `parameterNote` (`src/types/elements.ts:83`) 僅僅是一個非結構化的 `content` 字串，無法承載這些結構化資訊。
2. **資料來源的差異**：Command 通常作用於單一 Aggregate 邊界內。而 Query（即 ReadModel）的本質就是做「投影 (projection)」，它可能需要跨越多個 Aggregates 或關聯多種 Domain Events 的資料來建立一個反正規化的 DTO。`Remodel.linkedBundleIds` (`src/types/elements.ts:88`) 正確地捕捉到了這一點（它現在指向 source event notes），這與 Command 的單一 Aggregate 上下文完全不同。
3. **返回值的差異**：Command 的「返回值」是持久化的狀態改變（即 Domain Events），其同步返回值通常是 `void`。而 Query 的核心就是其「返回值」，即查詢結果的資料結構 (DTO)。`Remodel` 透過 `linkedDtoIds` (`src/types/elements.ts:89`) 指向了 DTO notes，但目前的 `Dto` note type 自身在 `src/types/elements.ts` 中並沒有定義其欄位 schema，這是一個巨大的缺口。AI 無法知道該生成什麼樣的返回物件。

**建議**：必須為 Remodel 設計一個獨立的 `ReadModelExport` schema，其中應包含結構化的 `queryParameters`（含分頁/排序）、明確的 `sourceEvents: string[]`，以及包含完整 schema 的 `returnDto` 物件。

#### 子議題 4：共通設計原則

**立場**：儘管 Command-side 和 Query-side 的 schema 必須分開，但它們應共享部分核心設計原則，以確保整個系統的上下文一致性。

**論點**：
1. **共享行為意圖 (Behavior/Intent)**：兩者都應有一個 `behavior` 或 `description` 欄位，用自然語言描述其業務意圖。`DomainEvent.behavior` (`src/types/elements.ts:40`) 是個好例子。這有助於 AI 理解其在業務流程中的角色。
2. **共享上下文連結 (Contextual Links)**：兩者都應有 `links` 和 `paths` 欄位。這能幫助 AI 理解：「是哪個 `Actor` 觸發了這個操作/查詢？」、「它屬於哪個主要用戶旅程 (`FlowPath`)？」、「它和哪些外部系統或策略有關？」這些是超越了 Command/Query 自身邏輯的寶貴系統級上下文。
3. **統一領域語言 (Ubiquitous Language)**：所有從 Event Storming board (`src/store/boardStore.ts`) 導出的命名，都應被視為是統一領域語言的唯一真實來源 (single source of truth)。無論是 Command 的 `useCase`、`aggregate` 名稱，還是 Query 的 `queryName`、`returnDto` 名稱，都應直接來自於圖上的 `label`。這一點目前的實作做得很好。
4. **共享元數據 (Metadata)**：`notes` (`src/types/elements.ts:31, 97`) 這樣供開發人員閱讀的註解欄位，對兩種類型的導出都很有價值，應予以保留。

#### 對其他 Agent 的回應

（第一輪略過）

---

### Round 2 — Claude (Opus 4.6)

#### 子議題 5：Aggregate spec 欄位組成

**立場**：Codex 與 Gemini 的 schema 草稿方向一致。關鍵差異在 `methods[]` 的深度。我傾向 Codex 的輕量版本（reference-only），避免與 UseCase spec 重複。

**論點**：
1. **Aggregate spec = "what IS"，UseCase spec = "what HAPPENS"**。前者描述 Aggregate 的恆常真相（state schema、invariants、lifecycle），後者描述某個 command 執行的動態過程（input、preconditions、事件發出）。這個邊界必須清晰，否則兩個 spec 會互相複製而 drift。
2. 因此 Gemini 把 `preconditions`/`postconditions` 放進 `methods[]` 是錯的歸位 — preconditions 是 Command spec 的責任（User 決策 #4），不該又出現在 Aggregate spec 的 method 定義裡。
3. 我建議 Codex schema 再加一個 `stateTransitions[]`（可選），描述「某事件發生時，state 的 field 如何變化」。這對 AI 生成 event handler 很重要，比分散在 methods/events 兩邊更集中。
4. Codex 的 `invariants[].provenance: ui | assumption` + `status: confirmed | needs_review` 設計非常關鍵 — 讓 AI 產出的猜測能被追蹤，符合 authored/derived 區分的精神（雖然用了不同欄位名）。

#### 子議題 6：Invariants 來源機制

**立場**：選 C（Hybrid），與 Codex / Gemini 一致。但我更強調實作細節的「預設輕量」。

**論點**：
1. UI 層：Aggregate Detail Panel 新增一個可選的 `invariants: string[]` 文字列表欄位。workshop 中可完全不填。
2. Export 行為：若 user 未填，export 的 JSON **不包含** `invariants` 區塊（而非空陣列）。這樣 AI 能清楚區分「沒有規則」vs「有規則但未定義」。
3. AI 補完行為：實作時若 AI 推斷出 invariant，必須以 `// ASSUMPTION: <description>` 註解產出，由人類審視。這條規則應寫入給 AI 的 system prompt，不是 spec 本身的責任。
4. 反對 Gemini 的「Phase 2/3/4 AI 自動擴張 invariants 並寫回 spec」流程 — 這會讓 spec 變得有「AI 汙染」風險（AI 的推斷跟 user 的事實混在一起）。保持 spec 只承載 authored 事實，AI 推斷留在程式碼註解。

#### 子議題 7：Aggregate / UseCase spec 參照關係

**立場**：完全同意 Codex 與 Gemini — 需要 `aggregateSpecId` 這種 machine-stable reference，並且應該 export 成 bundle。

**論點**：
1. 目前 UseCase 的 `aggregate: "Product"` 是 human-readable 名稱，不是 foreign key。若 user 重新命名 Aggregate，所有 UseCase spec 都會斷鏈。用 opaque ID（例如 UUID）作為 stable reference 是必要的。
2. Bundle 結構建議：
   ```json
   {
     "manifestVersion": 1,
     "aggregates": [ AggregateSpec, ... ],
     "useCases":   [ UseCaseSpec,   ... ],
     "readModels": [ ReadModelSpec, ... ]
   }
   ```
   好處：
   - AI 單次推論就能拿到完整鏈條，不用跨檔解析
   - 互相引用用 `aggregateSpecId` / `useCaseSpecId`，rename 時只需改一處
   - 拆檔的問題變成 packaging 決策，不影響 schema
3. `_suggested_aggregateId`（命名推導）與 `aggregateSpecId`（spec foreign key）是**兩個不同層次**的東西：前者是 Aggregate 的 business identity 型別建議，後者是 spec manifest 裡的 reference。兩個都保留，語義不衝突。

#### 子議題 8：ReadModel link relation types

**立場**：Codex 4 個 + Gemini 5 個的聯集需要再收斂。我提出一個合併版，回歸 user 在 Q4 的定位（connected events + other readmodels + Actor + DTO）。

**論點**：
1. User 在 Q4 已經界定 ReadModel 會連的對象：**events、other readmodels**（加上隱含的 Actor 與 DTO via `linkedActorId` / `linkedDtoIds`）。沒有 Aggregate。
2. 因此 Gemini 的 `references_state`（ReadModel → Aggregate 現時狀態）不應納入 — 這違反 CQRS 純粹性，也不在 user 的設計範圍。
3. 命名上建議採動詞片語（`sources_from`、`composes_with`），避免 `projected_from` 這種過去分詞形式混用。
4. `sources_from` vs `projected_from` 語義差異：前者是「從這些事件取資料」（中性描述），後者是「由這些事件投影而來」（暗示 projection 機制）。我傾向 `sources_from`，因為 projection 機制應由 AI 實作時決定，spec 不該預設。

**最終建議 enum**：

| enum | 語義 | 對應 Remodel 欄位 |
|------|------|------------------|
| `sources_from` | 從哪些 DomainEvent 取得資料 | `linkedBundleIds` |
| `composes_with` | 組合其他 ReadModel | ReadModel ↔ ReadModel link |
| `returns_dto` | 回傳的 DTO schema | `linkedDtoIds` |
| `consumed_by` | 被哪個 Actor 使用 | `linkedActorId` |

#### 對 Round 1 / Round 2 其他 Agent 觀點的回應

- **Codex 的 `invariants[].provenance`** 設計我高度認同，但我認為不該在 spec 層寫 `assumption` — spec 應該只寫 `ui`（authored），若 AI 推斷出 invariant 就留在程式碼註解。`provenance` 欄位可保留但值簡化為 `ui` 一種，未來如需其他來源再擴充。
- **Gemini 的 `_suggested_logic`**（在 invariants 裡放 JS 表達式）是過度工程化。spec 用自然語言描述即可，logic 表達式是實作層責任。若納入會讓 spec 綁死在特定語言語法。
- **Codex 的 Bundle export 建議** 與 **Gemini 的 Context Manifest** 是同一概念不同名稱，我們可採用 Codex 的 `aggregates[] / useCases[] / readModels[]` 命名。

---

### Round 2 — Codex (GPT-5.4)

#### 子議題 5：Aggregate spec 欄位組成

**立場**: Aggregate spec 應聚焦在 Aggregate 自身的 truth：identity、state、invariants、lifecycle。Command/UseCase 已有的 input 與 preconditions 不要重複定義，只保留 method/event 的 reference edge。

**論點**:
- User 決策 #4 已切分責任：preconditions 在 Command spec，invariants 在 Aggregate spec；schema 應照這個邊界設計。
- User 決策 #7 已鎖定 `1 Command : 1 DomainEvent`，所以 `methods[].emitsEvent` 可維持單值 reference，不必為多事件做複雜化。
- Aggregate spec 應回答的是「這個 Aggregate 有哪些 state、哪些規則永遠成立、有哪些 lifecycle 邊界」；UseCase spec 回答的是「某個 command 想做什麼」。
- `events[].payload` 可直接承接現有 `StickyNote.eventProperties` 的輸出結構；`state[]` 則補上目前畫布沒有被結構化表達、但 AI 實作時必須知道的 Aggregate 狀態面。
- 命名推導欄位應沿用 Round 1 已定案的扁平 `_suggested_` 前綴，不再回到 `authored/derived` 巢狀分層。
- `relationships[]` 應是語義化後的關係，不是原始 `Link.label` 文字；AI 需要的是可執行語義，不是箭頭註解。

**JSON schema 草稿**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AggregateSpec",
  "type": "object",
  "required": ["kind", "aggregateSpecId", "aggregate", "identity", "state", "invariants", "methods", "lifecycle", "relationships", "events"],
  "properties": {
    "kind": { "const": "AggregateSpec" },
    "aggregateSpecId": { "type": "string" },
    "aggregate": { "type": "string" },
    "behavior": { "type": "string" },
    "notes": { "type": "string" },
    "paths": { "type": "array", "items": { "type": "string" } },

    "identity": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "name": { "type": "string" },
        "type": { "type": "string" },
        "field": { "type": "string" },
        "composite": { "type": "boolean" }
      }
    },

    "state": {
      "type": "array",
      "items": { "$ref": "#/definitions/property" }
    },

    "invariants": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["description", "provenance", "status"],
        "properties": {
          "description": { "type": "string" },
          "provenance": { "type": "string", "enum": ["ui", "assumption"] },
          "status": { "type": "string", "enum": ["confirmed", "needs_review"] },
          "relatedState": { "type": "array", "items": { "type": "string" } }
        }
      }
    },

    "methods": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["commandSpecId", "useCase", "emitsEvent"],
        "properties": {
          "commandSpecId": { "type": "string" },
          "useCase": { "type": "string" },
          "emitsEvent": { "type": "string" },
          "_suggested_method": { "type": "string" }
        }
      }
    },

    "lifecycle": {
      "type": "object",
      "properties": {
        "initialState": { "type": ["string", "null"] },
        "terminalStates": { "type": "array", "items": { "type": "string" } },
        "createdByEvent": { "type": ["string", "null"] },
        "archivedByEvent": { "type": ["string", "null"] }
      }
    },

    "relationships": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["targetType", "targetName", "relationType"],
        "properties": {
          "targetType": { "type": "string", "enum": ["Entity", "Aggregate", "Policy", "ReadModel", "ExternalSystem"] },
          "targetName": { "type": "string" },
          "targetSpecId": { "type": "string" },
          "relationType": { "type": "string", "enum": ["contains", "references", "governs", "projects_to", "integrates_with"] }
        }
      }
    },

    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "payload"],
        "properties": {
          "name": { "type": "string" },
          "payload": { "type": "array", "items": { "$ref": "#/definitions/property" } },
          "emittedByCommandSpecId": { "type": "string" },
          "_suggested_domainEvent": { "type": "string" }
        }
      }
    },

    "_suggested_aggregateId": { "type": "string" },
    "_suggested_repository": { "type": "string" }
  },
  "definitions": {
    "property": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "name": { "type": "string" },
        "type": { "type": "string" },
        "required": { "type": "boolean" },
        "notes": { "type": "string" }
      }
    }
  }
}
```

#### 子議題 6：Invariants 來源機制

**立場**: 選 C，Hybrid。UI 可選填、AI 補缺口，並把 AI 補出的內容明確標成 `assumption` 而不是假裝它是 user-authored fact。

**論點**:
- A 會直接撞上本討論已列出的約束：不能要求 user 在 UI 上填過多額外欄位，否則 Event Storming workshop 會變重。
- B 雖保留輕量性，但 invariants 只存在於 codegen/comment 階段，無法在 spec 層被 review、對齊、追蹤。
- C 讓已知的業務規則可以被人明確寫入，但預設流程仍然可以零額外輸入，符合 Claude/Codex 在 Round 1 的定位。
- Aggregate spec 應把 invariants 結構化為 `invariants[]`，並附 `provenance: ui | assumption`、`status: confirmed | needs_review`；這樣 AI 產出的假設不是黑箱。
- 生成程式碼時仍應保留 `ASSUMPTION:` 標記，讓 reviewer 能從 spec 與 code 兩邊都看到未確認規則。
- 這也吸收了 Gemini 的核心關切：invariants 不能完全缺席；只是它們不應被設計成所有人都必填的 UI 表單。

#### 子議題 7：Aggregate / UseCase spec 參照關係

**立場**: `aggregate` 只能算 human-readable context，不足以當 machine-stable reference；應新增明確的 `aggregateSpecId`。邏輯模型上應統一成一個 export bundle，檔案是否拆分屬於 packaging 問題。

**論點**:
- 依 Round 1 決策 #9，UseCase 端已有 `aggregate` 與 `_suggested_aggregateId`；前者是名稱，後者是命名 hint，兩者都不是 Aggregate spec foreign key。
- `aggregateSpecId` 應是 spec-level 參照；`_suggested_aggregateId` 仍保留為 business identity type/field 的 naming hint，兩者不要混用。
- UseCase spec 應持續擁有 `useCase`、`behavior`、`input`、`aggregate`，以及 `_suggested_method` / `_suggested_domainEvent` / `_suggested_repository`；Aggregate spec 則擁有 `state`、`invariants`、`lifecycle`。這樣不重複也不失聯。
- Aggregate spec 的 `methods[]` 應只 reference `commandSpecId` / `useCase`，不要再複製一份 command input，避免兩邊 drift。
- 建議 export 成單一 bundle：`aggregates[]`、`useCases[]`、`readModels[]` 同檔，互相用 `aggregateSpecId` / `useCaseSpecId` 連結；這對 AI ingestion 最簡單，也減少跨檔解析成本。
- 若未來真的要拆檔，也應維持同一組 opaque IDs；拆檔不應改變 schema 關係模型。

#### 子議題 8：ReadModel link relation types

**立場**: 先收斂成小而明確的 enum，不要引入 `depends_on` 這種萬用值。這組 enum 應直接對應 `Remodel.linkedActorId`、`Remodel.linkedBundleIds`、`Remodel.linkedDtoIds`，以及 `Link.fromType` / `Link.toType` 可表達的 remodel-to-remodel 關係。

**建議 enum 值與語義**:
| enum | 語義 | 範例 |
|------|------|------|
| `requested_by` | 此 ReadModel 服務哪個 Actor；對應 `linkedActorId` | `OrderSummary.requested_by -> CSR` |
| `sources_from` | 此 ReadModel 從哪些 source events 投影資料；對應 `linkedBundleIds` | `InventoryView.sources_from -> StockAdjusted` |
| `composes_with` | 此 ReadModel 組合另一個 ReadModel 的結果 | `OrderDetail.composes_with -> CustomerBadgeView` |
| `returns_dto` | 此 ReadModel 回傳哪個 DTO schema；對應 `linkedDtoIds` | `OrderDetailQuery.returns_dto -> OrderDetailDto` |

#### 對 Round 1 其他 Agent 觀點的回應

- 我同意 Claude 對工具定位的判斷：Event Storming 不該被推成重型 BDD/spec editor；但既然 Round 1 已決定引入 Aggregate spec，invariants 最好不要只停留在 code comment，而要升級成可 review 的結構化欄位。
- 我接受 Gemini 對 invariant / DTO / source-event 缺口的問題意識；不同意的是解法不必走到「全部變成必填 UI 欄位」。Hybrid 比 mandatory schema 更符合這個工具的 workshop 本質。
- 在 ReadModel 上，我認為比 Round 1 更重要的是「縮小 relation enum 的語義面積」：如果 enum 太泛，AI 會重新回到猜測；如果直接對應 `linkedActorId` / `linkedBundleIds` / `linkedDtoIds` / remodel-to-remodel link，實作與 UI 都會更穩。

---

### Round 2 — Gemini

#### 子議題 5：Aggregate spec — 完整欄位組成分析

Aggregate 在 DDD 中不只是數據容器，更是「一致性邊界 (Consistency Boundary)」。目前的 `src/types/elements.ts` 中，Aggregate 僅由 Entity 轉換而來，缺乏結構化描述。我提議 Aggregate Spec 應作為「狀態機與規則」的定義，而 UseCase Spec 則是觸發這些規則的「交易信封」。

**JSON Schema 提案**：

```json
{
  "aggregate": "Order",
  "identity": {
    "field": "orderId",
    "type": "UUID",
    "is_suggested_type": true
  },
  "state": [
    {
      "name": "status",
      "type": "OrderStatus",
      "description": "訂單目前的生命週期狀態"
    },
    {
      "name": "totalAmount",
      "type": "Money",
      "description": "訂單總金額"
    }
  ],
  "invariants": [
    {
      "id": "INV-001",
      "rule": "Total amount must be positive",
      "context": "Payment validation",
      "_suggested_logic": "this.totalAmount > 0"
    },
    {
      "id": "INV-002",
      "rule": "Order cannot be cancelled after shipping",
      "context": "State transition",
      "_suggested_logic": "this.status !== 'SHIPPED'"
    }
  ],
  "methods": [
    {
      "name": "cancel",
      "params": [],
      "preconditions": ["INV-002"],
      "postconditions": ["this.status === 'CANCELLED'"],
      "emitted_events": ["OrderCancelled"]
    }
  ],
  "lifecycle": {
    "factory": "PlaceOrder",
    "deletion_policy": "Archive after 5 years",
    "is_root": true
  },
  "references": [
    {
      "aggregate": "Customer",
      "relation": "reference-by-id",
      "is_suggested_id": "customerId"
    }
  ],
  "authoritative_events": ["OrderPlaced", "OrderCancelled", "PaymentReceived"],
  "_suggested_repository": "OrderRepository"
}
```

**論點**：
1. **狀態與規則分離**：`state` 定義靜態結構，`invariants` 定義動態邊界。這解決了傳統模型中 Invariants 散落在代碼中的問題。
2. **方法簽名 (Methods)**：直接對應 Domain Command 的處理邏輯。`preconditions` 引用 `invariants` ID，確保規則的單一事實來源 (Single Source of Truth)。
3. **引用規則 (References)**：嚴格遵守 DDD 規範，對外部 Aggregate 僅保留 ID 引用，避免物件圖 (Object Graph) 過度耦合。
4. **權威事件清單 (Authoritative Events)**：Aggregate 必須宣告它「能」發出哪些事件，這與 UseCase 中「實際」發出的事件形成對應關係。

#### 子議題 6：Invariants 的來源與產生策略

選 **(C) Hybrid**。

**論點**：
1. **理論軸**：Invariants 是 Aggregate 的靈魂。若無 Invariants，Aggregate 就退化為貧血模型 (Anemic Domain Model)。
2. **工作坊軸**：強迫用戶在 Storming 期間填寫複雜的 Invariants 會中斷 Flow。
3. **推薦路徑**：
   - **Phase 1**：用戶在 `StickyNote.behavior` 或標籤中輸入非正式文字。
   - **Phase 2**（Export 時）：AI 掃描所有與該 Aggregate 相關的 `DomainEvent` 與 `Command`，提取出行為描述。
   - **Phase 3**：AI 生成 `_suggested_invariants` 並呈現於 Detail Panel。
   - **Phase 4**：用戶勾選確認，將其提升為正式 `invariants` 欄位。

#### 子議題 7：Aggregate spec ↔ UseCase spec 的引用與協作

UseCase Spec 不應重複定義 Aggregate 的屬性，兩者應透過「合約引用」關聯。

```json
{
  "useCase": "CancelOrder",
  "trigger": "Actor.Customer",
  "action": {
    "aggregate_ref": "Order",
    "method_ref": "cancel",
    "params_from_input": ["orderId"]
  },
  "transaction_envelope": {
    "emitted_event": "OrderEvents.OrderCancelled",
    "consistency": "Strong"
  },
  "paths": ["CustomerPortal.CancellationFlow"]
}
```

**協作規則**：
1. **事件歸屬**：`authoritative_events` 存在於 Aggregate Spec（靜態定義）；`domainEvent` 存在於 UseCase Spec（動態執行結果）。
2. **AI 消費路徑**：建議採用 **單一 Context Manifest 模式**。導出時，將所有相關的 Aggregate Specs 與 UseCase Specs 打包成一個 JSON 陣列或地圖。
3. **Cross-Reference 處理**：當 UseCase 涉及跨 Aggregate 通訊（如透過 Policy 觸發），UseCase 應標記 `secondary_aggregates` 引用。

#### 子議題 8：ReadModel Link Relation Types — Enum 規範

| Enum Value | 描述 (CQRS Context) | 對應現有結構 |
| :--- | :--- | :--- |
| `projected_from` | 訂閱 Domain Event 並更新 ReadModel | `linkedBundleIds` (Source Events) |
| `composes_with` | 查詢時橫跨多個 ReadModel 進行 Join/Merge | ReadModel ↔ ReadModel links |
| `schema_def` | 定義回傳的數據結構 (DTO) | `linkedDtoIds` |
| `consumed_by` | 該 ReadModel 被哪個 Actor 或前端組件使用 | `linkedActorId` |
| `references_state` | 查詢時直接引用 Aggregate 的現時狀態 (罕見但存在) | ReadModel ↔ Aggregate links |

**決策理由**：
1. **Drop `sources_from` / `invalidated_by`**：合併為 `projected_from`。
2. **Drop `returns_as`**：更名為 `schema_def`。
3. **Drop `filtered_by`**：邏輯過於細碎，過濾器應被視為 `parameterNote`，而非獨立的 Link 類型。
4. **Keep `composes_with`**：對於解決 Bounded Context 之間的數據聚合至關重要。

#### 對其他 Agent 的回應

**對 Codex 的建議**：完全同意 `_suggested_` 前綴的策略。建議在 `aggregateId` 欄位中增加一個 `mapping_source` 屬性，標明它是從哪個 Property 標記演化而來。

**對 Claude 的建議**：Claude 在 Round 1 提到的 `parameters` + `func name` 結構非常紮實。在 Round 2 的 `projected_from` 關係中，建議增加一個 `transformation_logic` 的 `_suggested_` 欄位，由 AI 根據 Event Properties 與 ReadModel Fields 的名稱相似度，自動推論 SQL-like 或 Map-function 的轉換邏輯。

---

### Round 3 — Claude (Opus 4.7)

#### 子議題 9：ReadModel link relationType 必要性反思

**立場**：**撤回 Round 2 決策 #13**。User 觀察正確，Round 2 我自己犯了過度設計的錯。

**論點**：
1. **資訊理論層面**：target type（Actor / DomainEvent / Dto / ReadModel）與我 Round 2 提的 4 個 relationType 是**雙射**關係。`H(relationType | targetType) = 0`，意即 relationType 沒有帶來任何新資訊。
2. **犯錯的根因**：Round 2 我們太專注「enum 該收到幾個」，忘了先問「為什麼需要 enum」。這是設計對稱癖（symmetry bias）— 看到 Event 端可能需要 enum，就預設 ReadModel 也需要。
3. **Single source of truth 原則**：多一個冗餘欄位就多一個 drift 風險。未來若 user 改了 target，exporter 要同步兩處 — 這是 bug 滋生地。
4. **新方案**：ReadModel link 只需：
   ```json
   { "targetType": "DomainEvent", "targetName": "StockAdjusted", "targetSpecId": "..." }
   ```
   AI 看 `targetType` 就能 100% 推斷語義，spec 保持最小化。

#### 子議題 10：stateTransitions 評估

**立場**：**不加**。與 user / Codex 一致。

**論點**：
1. **Event Sourcing 視角**：`stateTransitions` 的資訊已經隱含在「events[] payload + state[] schema」兩者的 join 中。明確列出等於第三份真相，是 drift 源。
2. **非所有 Aggregate 都是狀態機**：Order、Subscription 是狀態機典型，但 ShoppingCart、InventoryItem 是屬性級增量，硬套 state transitions 是過度擬合。
3. **工具哲學**：Event Storming 的精神是「事件優先、不預先定義 state graph」。若強制 transitions，會把工具推向 XState/statecharts editor，違反輕量本質。
4. **備案**：若未來某個 Aggregate 真的是複雜狀態機，應該用**獨立的 `StateMachineSpec`**（只有需要的用），而非塞進所有 Aggregate 的共通欄位。
5. **AI 實作時的處理**：AI 生 event handler 時產 `// STATE CHANGE: status: pending → shipped` 註解，與 invariant assumption 的處理對稱。

#### 子議題 11：AI 推斷 invariant 的標示機制

接受 user 決策（寫回 spec），但必須搭配嚴格的流程設計才能化解 Round 2 我對「AI 污染 spec」的擔憂。

**Spec 層**：沿用 Codex 的 `provenance` + `status`，但補上 `source` 子物件以確保**可追溯性**：

```json
{
  "id": "INV-003",
  "description": "Cannot cancel order after shipping",
  "provenance": "assumption",
  "status": "needs_review",
  "source": {
    "agent": "claude-opus-4.7",
    "derivedFrom": ["UseCase:CancelOrder", "UseCase:ShipOrder"],
    "inferredAt": "2026-04-21T10:00:00Z",
    "rationale": "CancelOrder 未在 spec 標 precondition，但與 ShipOrder 操作同一 status 欄位，語義暗示需 non-terminal"
  },
  "relatedState": ["status"]
}
```

**關鍵不變量**：**AI 推斷只能寫入 Aggregate spec 的 `invariants[]`，其他欄位（state / methods / lifecycle）必須 authored-only**。這比 Round 2 更嚴格，限制 AI 污染範圍。

**UI 層**：Aggregate Detail Panel 分三個視覺 band：

```
┌─ Invariants ──────────────────────────────┐
│ [CONFIRMED]  (實線，無底色)                 │
│   • INV-001 Total amount must be positive │
│                                            │
│ [NEEDS REVIEW · AI-inferred] (虛線 + 淡黃底)│
│   ⚠ INV-003 Cannot cancel after shipping  │
│     source: claude-opus-4.7                │
│     [ Approve ] [ Edit ] [ Reject ]        │
│                                            │
│ [REJECTED] (灰色 + 刪除線，可摺疊)          │
└────────────────────────────────────────────┘
```

Reject 不刪除紀錄，避免下次 AI 再推同條規則。

**程式碼層**：三種層級標示：
```typescript
// INVARIANT: INV-001 (ui, confirmed) - Total amount must be positive
// INVARIANT: INV-003 (assumption, needs_review) - Cannot cancel after shipping
//   SOURCE: claude-opus-4.7 @ 2026-04-21
// ASSUMPTION: no corresponding spec invariant, discovered during implementation
//   Consider promoting to Aggregate spec if universal
```

**流程（關鍵貢獻）**：分三個時機點，**T1 與 T2 必須分離**：

| 時機 | 觸發 | 產物 |
|------|------|------|
| **T1 Export** | user 按「Export Spec Bundle」| **不寫回**。純讀取既有 spec，只輸出 `provenance: "ui"` 項目 |
| **T2 Infer Invariants** | user 在 Detail Panel 按「Analyze with AI」| **寫回 spec**，`status: "needs_review"` |
| **T3 Code generation** | user 把 bundle 餵給 Claude Code 做實作 | **不寫回 spec**，只在程式碼產 `INVARIANT` / `ASSUMPTION` 註解 |

這個分離是我 Round 2 反對「寫回」的關鍵修正：**只要 T1 不偷偷寫回、T2 要 user 明示觸發，AI 就不會無聲污染 spec**。這是 git-style 的 suggestion workflow。

#### 子議題 12：Event link relationType enum

**立場**：**Event link 也不需要 `relationType` enum**。這是對 Round 2 更徹底的反思 — 不只 ReadModel，Event 也不需要。

**論點**：

Event Storming Tool 的 `Link` 已有 `fromId` / `toId`（方向）、`fromType` / `toType`。配合 ElementType，AI 能解得出絕大多數語義：

| target type | 方向 | 語義 | 需要 enum 嗎？ |
|-------------|------|------|-------------|
| Actor | Event→Actor | 事件通知 Actor | ❌ 方向即語義 |
| Actor | Actor→Event | 不合法（Actor 發 Command，不發 Event）| — |
| Policy | Event→Policy | 事件觸發 Policy（reactive）| ❌ 方向區分兩種 policy pattern |
| Policy | Policy→Event | Policy 守護事件發生前提（proactive）| ❌ 同上 |
| DomainEvent | Event→Event | 因果鏈 / 時序 / 補償 | ⚠ 這是唯一真正可能需要細分的 |

**對 Event→Event 的特殊處理**：
- Event Storming 慣例是**事件之間不直接連線** — 透過 Policy 或 Read Model 串接
- User 已鎖定 1 Command : 1 DomainEvent（決策 #7），Saga / cascading events 沒有 first-class 表達位置
- 若真的有直接連線需求，**不擴 enum，改用現有的 `Link.label` 自由文字欄位**（`elements.ts:72` 已存在）

**統一方案**：三種 spec（UseCase / Aggregate / ReadModel）的 links 陣列共用同一 minimal schema：

```json
{
  "direction": "outbound" | "inbound",
  "targetType": "Actor" | "DomainEvent" | "Policy" | "ReadModel" | "Dto" | ...,
  "targetName": "...",
  "targetSpecId": "...",
  "label": "..."  // optional，保留 ad-hoc 語義的逃生口
}
```

`direction` 由 exporter 根據 `link.fromId === thisNote.id` 自動推出，user 不需填。

#### 衍生議題：Aggregate spec 的 `relationships[].relationType` 是否也該精簡？

Codex Round 2 schema 留了 5 個 relationship enum：`contains` / `references` / `governs` / `projects_to` / `integrates_with`。

**我的建議**：比照精簡，但 Aggregate relationships 的語義確實比 Event/ReadModel 複雜（例如「contains」與「references」在 DDD 中是不同的聚合邊界語義），**保留 2 個核心值** — `contains` vs `references`，去除其他可由 target type 推斷的值。

這個衍生議題可延後到 Round 4 或直接由 user 決策。

#### 對 Codex / Gemini 觀點的回應

- **與 Codex 在子議題 9、10 完全一致**。Codex 撤回自己 Round 2 立場的自省令人欣賞。
- **與 Gemini 在子議題 9、10 也一致**（Gemini 的輸出誤標為 Claude header，但內容立場是 Gemini 視角）。
- **子議題 11 我的 T1/T2/T3 分離** 比 Codex 的「Sync AI Assumptions to Spec」更明確 — 強調 export 絕不寫回，只有專門觸發的 Analyze 動作才寫回。
- **子議題 12 我比 Codex 更徹底**：Codex 對 Event→Event、Event→Policy 保留了 `causes` / `compensates` / `handled_by_policy` / `governed_by_policy` 4 個 enum；我認為方向已能區分 Policy 的兩種 pattern，Event→Event 則用 label 欄位而非 enum。

---

### Round 3 — Codex (GPT-5.4)

#### 子議題 9：ReadModel link relationType 必要性反思

**立場**：拿掉

**論點**：
- Round 2 決策 #13 把 ReadModel link 收斂成 `sources_from` / `composes_with` / `returns_dto` / `consumed_by`，而 user 現在指出它們分別對應 `DomainEvent` / `ReadModel` / `DTO` / `Actor`。在目前模型下，這確實是 1:1 映射，`relationType` 沒有新增資訊，只是重複編碼 `targetType`。
- 冗餘欄位會帶來 drift 風險。最糟情況不是資訊少，而是 `targetType: "DTO"` 卻寫成 `relationType: "consumed_by"` 這種自相矛盾資料，AI 反而更難判斷。
- Round 2 當時的判斷錯在把「語義明確」直接等同於「一定要 enum」。若語義已可由型別唯一推出，最穩定的做法是讓 schema 只保留單一事實來源。
- 對 ReadModel 而言，真正重要的是保留 `targetType`、`targetSpecId`、direction 與 owning field（`linkedBundleIds` / `linkedDtoIds` / `linkedActorId` / remodel-to-remodel link），不是再加一層同義 enum。

**反例檢驗**：
- 假設未來 `ReadModel -> DomainEvent` 除了「資料來源」還可能表示「cache invalidation signal」，那同一個 target type 就會出現第二語義；此時才有必要重新引入 enum。
- 假設未來 `ReadModel -> DTO` 可能同時有 `returns_dto` 與 `accepts_filter_dto`，也會打破 1:1；但這不在 user Q4 與 Round 2 決策 #13 的目前範圍內。

#### 子議題 10：stateTransitions 評估

**立場**：不加

**論點**：
- Round 2 決策 #10 已把 Aggregate spec 定位為 `identity / state / invariants / lifecycle` 的 truth model；`stateTransitions[]` 會把它往「事件處理腳本」推，開始和 UseCase / handler 實作層混線。
- `stateTransitions[]` 的資訊密度看似高，但 authoring 成本也最高。user 已明確擔心 workshop 變重，這個擔心是成立的，因為每個 event 都要補 `from -> to` 與 field diff，會把畫布從語意建模拉成半個 state machine editor。
- AI 並非完全無法推斷 transition。它可先用 `methods[].emitsEvent` 建立 command→event 關聯，再用 `lifecycle.createdByEvent` / `archivedByEvent` / `terminalStates` 推斷建立與終止，再結合 `events[].payload`、event 名稱、`state[]` 欄位名與 `invariants[].relatedState` 推斷哪些 state 會被改動。
- 若推斷出兩個以上同樣合理的 transition，AI 不應偷偷定案；應在程式碼內標 `// ASSUMPTION:`，必要時產出暫時性的 `_suggested_stateTransitions` 給 reviewer，看完再決定是否升格，而不是直接進 authored schema。

#### 子議題 11：AI 推斷 invariant 的標示機制

**Spec 層做法**：每筆 invariant 帶 `provenance` + `status` + `source` 三軸資訊，spec 不分兩套陣列，用同一 shape 但標記不同來源。`source.reason` 必須是自然語言，不放可執行 expression。

**UI 層做法**：Aggregate Detail Panel 分 `Confirmed Invariants` 與 `AI-Assumed Invariants` 兩區塊。AI 推斷用黃底 + 虛線 + `Needs Review` 標章，附 `Accept as Authored` / `Edit & Confirm` / `Dismiss` 三個動作。顯示 `Derived From` 與 `Why AI inferred this`。

**程式碼層做法**：
```ts
// INVARIANT[ui|confirmed|inv-order-total-nonnegative]: order.totalAmount must be >= 0
// ASSUMPTION[invariant|needs_review|inv-order-cannot-cancel-shipped]: Shipped order cannot be cancelled.
```
固定 tag 格式讓工具能搜尋。

**流程設計**：不在 export 時寫回。AI 在實作過程中於記憶體產生 candidates、在程式碼留 `ASSUMPTION` 註解。實作完成後走獨立的 `Sync AI Assumptions to Spec` 回饋流程；只有使用者按下同步，才以 `provenance: "assumption"` 寫回 spec。reviewer 在 Detail Panel 接受後升格為 `ui/confirmed`。

#### 子議題 12：Event link relationType enum

**立場**：混合

**建議 enum 值**：
| enum | 語義 | 適用 target |
|------|------|-----------|
| `causes` | 此事件是另一個事件的直接業務前因 | `event` |
| `compensates` | 此事件是對另一個事件的補償、撤銷或逆向結果 | `event` |
| `handled_by_policy` | 某 Policy 以此事件為觸發輸入 | `policy` |
| `governed_by_policy` | 此事件受某 Policy/規則約束 | `policy` |

- `Actor` 不設 enum，直接吃 `direction + targetType`
- `Event -> Event` 與 `Event -> Policy` 才是真正需要 enum 的地方
- 若未來所有 link 強制要有 `relationType` 以求 schema 對稱，也可給 actor 補 `triggered_by_actor`；但以目前語義清晰度考量，那是冗餘

#### 對 Round 2 其他 Agent 觀點的回應與自我反思

- **修正 Round 2 子議題 8 立場**：當時主張 ReadModel relation enum 應收斂成小集合，現在看 user 的質疑是對的，對 ReadModel 來說 `relationType` 本身就是過度建模，應直接撤掉。
- **部分修正 Round 2 子議題 6 做法**：仍支持 `provenance: "assumption"`，但現在更明確認為它不應在 export 或一般 codegen 中自動寫回，必須經過獨立的 `Sync AI Assumptions to Spec` 流程。Claude 對 spec 被 AI 靜默污染的警告是成立的。
- **不修正 Round 2 子議題 5**：Aggregate spec 仍應是 truth-oriented，不把每個 event 的 field diff 直接 author 進 schema。也因此本輪對 `stateTransitions[]` 結論是不加。

---

### Round 3 — Gemini

> **注**：Gemini 的輸出誤將自己 header 標為「Claude Opus 4.7」，但內容是 Gemini 視角（長 context 掃描 + DDD 理論深度），此處修正歸位。

#### 掃描結論（Gemini 長 context 優勢）

- `Link` type（`src/types/elements.ts:66-74`）**已有方向**：`fromId` → `toId`，並帶 `fromType` / `toType`
- ReadModel 對各類 target 的連結在 `Remodel` 型別裡已是**分欄位**存在（`linkedActorId`, `linkedBundleIds`, `linkedDtoIds`），不是走 `Link` table
- `exportBoardToJson`（`src/utils/jsonExporter.ts:65-80`）在 UseCase 匯出時，直接以 `otherNote.type` 當 link 的 type — 目前 spec 實質已含 target type，但沒含 relationType

#### 子議題 9：ReadModel link 是否真的需要 relationType

**立場**：**User 觀察正確。Round 2 決策 #13 的 4-enum 是冗餘設計，應撤回**。

**自我反思**：我 Round 2 提的 5 個 enum，重新檢視其中 4 個（`projected_from` / `composes_with` / `schema_def` / `consumed_by`）都與 target type 1:1。第 5 個 `references_state` 已被 user Q4 排除（ReadModel 不連 Aggregate）。四個都是 1:1 映射，看了 target type 就 100% 決定 relationType — enum 只是 target type 的別名。

**最終結論**：撤回 #13，ReadModel link 只需 `targetType` + `targetName` + `targetSpecId`。

#### 子議題 10：stateTransitions 評估

**立場**：撤回 Round 2 建議，與 user 一致不加。

**DDD 角度**：Aggregate 可以被看成狀態機（Evans 原書也把 lifecycle 視為重要面向），但：
1. 不是所有 Aggregate 都是狀態機（ShoppingCart 是屬性級增量）
2. Event Sourcing 裡 transitions 已內建在 events + state
3. DDD 慣例是「specification pattern + 事件驅動」，不是 explicit FSM DSL

**工具輕量性**：加會連鎖影響 schema / UI / Export 三層驗證邏輯，ROI 負值。

**結論**：不加 `stateTransitions[]`，保留 Codex 的 `lifecycle` 即可。若未來需要狀態機，走獨立的 `StateMachineSpec`。

#### 子議題 11：AI 推斷 invariant 寫回 spec 的具體做法

**Spec 層**：沿用 Codex 的 `provenance + status`，擴充 `source` 子物件帶 agent / derivedFrom / inferredAt / rationale / relatedState。**關鍵不變量**：AI 推斷只能寫入 `invariants[]`，其他欄位（state / methods / lifecycle）必須 authored-only。

**UI 層**：Aggregate Detail Panel 分 CONFIRMED / NEEDS REVIEW / REJECTED 三個視覺 band。needs_review 虛線 + 淡黃底 + 警告，附 Approve / Edit / Reject 三個動作。Reject 保留紀錄（避免下次 AI 再推）。

**程式碼層**：
```typescript
// INVARIANT: INV-003 (assumption, needs_review) - Cannot cancel after shipping
// SOURCE: claude-opus-4.7 @ 2026-04-21
// REVIEW: please confirm this is a real business rule before production
```

**流程（T1/T2/T3 三段式）**：
- T1 Export — **不寫回**，只輸出 `provenance: "ui"`
- T2 Infer Invariants — user 明示觸發，寫回 spec 且 `status: needs_review`
- T3 Code generation — 不寫回，只在程式碼產註解

**關鍵**：T1 與 T2 分離，才化解 Round 2 Claude 對「silent spec pollution」的擔憂。

#### 子議題 12：Event link relationType enum

**立場**：**Event link 也不需要 `relationType` enum**。比 Codex 更徹底。

**三種 target 的分析**：
| target | 方向 | 語義 | 需要 enum？ |
|--------|------|------|-----------|
| Actor | Event→Actor | 通知 | ❌ 方向即語義 |
| Actor | Actor→Event | 不合法 | — |
| Policy | Event→Policy | reactive policy | ❌ 方向區分 |
| Policy | Policy→Event | proactive policy | ❌ 方向區分 |
| Event | Event→Event | 因果 / 時序 / 補償 | ⚠ 這裡才有歧義 |

**但 Event→Event 在 Event Storming 慣例中不該直接連線**（走 Policy 或 ReadModel 串接）。User 已鎖定 1:1 限制，Saga 無 first-class 表達。

**結論**：不加 enum，用 `direction + targetType + optional label`。若未來 Event→Event 真的需要語義，用現有 `Link.label` 自由文字欄位（`elements.ts:72`）當作 ad-hoc 語義逃生口。

**統一 link schema**：UseCase / Aggregate / ReadModel 的 links 陣列共用同一最小格式：
```json
{
  "direction": "outbound" | "inbound",
  "targetType": "...",
  "targetName": "...",
  "targetSpecId": "...",
  "label": "..."
}
```

#### 衍生議題：Aggregate spec 的 relationships enum 是否也該精簡？

Codex 留的 5 個：`contains` / `references` / `governs` / `projects_to` / `integrates_with`。建議 Round 4 或 user 直接決策。

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| 1 | UseCase 欄位充分性 | 不充分（但不應追求完全充分） | 不充分 | 嚴重不足 | **agreed**（不充分）/ **disputed**（補救方式）|
| 2 | 欄位語義歧義性 | 高度歧義，需分 authored/derived | 有明顯歧義 | 高度歧義 | **agreed** |
| 3 | ReadModel 沿用可行性 | 不能沿用，需分開設計 | 不適合直接共用 | 絕對不可行 | **agreed** |
| 4 | 共通設計原則 | SpecEnvelope + authored/derived 分層 | 共享語意+上下文+I/O，不共享執行欄位 | 共享 behavior/links/paths/UL | **majority**（方向一致，框架不同）|
| 5 | Aggregate spec 欄位組成 | 輕量版（reference-only methods）+ 加 stateTransitions | Codex schema（methods reference-only，invariants 帶 provenance/status）| 完整 schema，methods 含 preconditions/postconditions | **majority**（Claude + Codex 對齊，Gemini 在 methods 深度上分歧）|
| 6 | Invariants 來源機制 | C（Hybrid，但 provenance 只留 ui，assumption 走程式碼註解）| C（Hybrid，provenance: ui/assumption 都入 spec）| C（Hybrid，AI 自動擴張並寫回 spec）| **agreed**（都選 C）/ **disputed**（AI 推斷要不要入 spec）|
| 7 | Aggregate / UseCase 參照關係 | 用 `aggregateSpecId`，export 成 bundle | 同上 | 同上（Context Manifest）| **agreed** |
| 8 | ReadModel link relation types | ~~4 個：sources_from / composes_with / returns_dto / consumed_by~~ ⚠ Round 3 撤回 | ~~4 個~~ ⚠ Round 3 撤回 | ~~5 個~~ ⚠ Round 3 撤回 | **撤回**（Round 3 決策 #14）|
| 9 | ReadModel link 是否需要 relationType | 撤回 #13，不需要 | 撤回 #13，不需要 | 撤回 #13，不需要 | **agreed** |
| 10 | stateTransitions 是否加入 | 不加（撤回 Round 2 的建議）| 不加 | 不加（撤回 Round 2 的建議）| **agreed** |
| 11 | AI invariant 寫回的 T1/T2/T3 分離流程 | T1 export 不寫回 / T2 明示觸發才寫回 / T3 code-gen 不寫回 | 同意 T1/T2 分離（稱「Sync AI Assumptions to Spec」）| 同 T1/T2/T3 三段式 | **agreed** |
| 12 | Event link relationType enum | 不需要，用 direction + target type + optional label | 混合：Actor 不需要、Event/Policy 各保留 2 個 enum | 不需要（同 Claude）| **majority**（Claude + Gemini 對齊，Codex 保留 Event→Event / Event→Policy 的 enum）|

**狀態說明**：
- `agreed` — 三方達成共識
- `majority` — 兩方同意，一方保留意見
- `disputed` — 有根本分歧
- `pending` — 尚未充分討論
- `deferred` — 延後到後續議題

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|
| 1 | 目前 UseCase JSON spec 對 AI 實作而言不充分，至少缺事件 payload、link 語義、authored/derived 區分 | 2026-04-20 | Round 1 | 三方一致 |
| 2 | ReadModel 不能沿用 UseCase 格式，需設計獨立 schema | 2026-04-20 | Round 1 | 三方一致 |
| 3 | UseCase 與 ReadModel 應共享 `behavior`、`links`、`paths` 三個元素（CQRS 上下文相同的部分）| 2026-04-20 | Round 1 | 三方一致 |
| 4 | 引入第三種 spec 類型：**Aggregate spec**。preconditions → Command spec；invariants → Aggregate spec | 2026-04-20 | User 決策（Q1） | 開啟新議題 |
| 5 | Event link types 收斂為 `actor` / `event` / `policy` 三種；ReadModel link 待討論 | 2026-04-20 | User 決策（Q2） | 部分解決 |
| 6 | ReadModel schema = parameters + func name + return type + connected events + connected other readmodels | 2026-04-20 | User 決策（Q4） | 提供草稿基礎 |
| 7 | 1 Command : 1 DomainEvent 是工具的硬性限制（多事件情境不納入） | 2026-04-20 | User 決策（Q5） | 關閉 Gemini 的擔憂 |
| 8 | 不需要 `specVersion` 欄位 | 2026-04-20 | User 決策（Q6） | Q6 關閉 |
| 9 | authored / derived 採方案 B：扁平化 + `_suggested_` 前綴。`aggregateId` / `method` / `domainEvent` / `repository` 加前綴 | 2026-04-20 | User 決策（Q3） | Q3 關閉 |
| 10 | Aggregate spec 採 Codex schema 的輕量架構：identity / state / invariants / methods（reference-only）/ lifecycle / relationships / events | 2026-04-21 | Round 2 | Claude + Codex 對齊；Gemini 的 preconditions/postconditions 設計過度，歸位錯誤（preconditions 應在 Command spec）|
| 11 | Invariants 採 Hybrid（C）：UI 可選填、未填則 export 不含 invariants 區塊；AI 推斷出的假設留在程式碼註解（`// ASSUMPTION: ...`），不寫回 spec | 2026-04-21 | Round 2 | 三方選 C；Claude 堅持 AI 推斷不污染 spec，Codex/Gemini 保留彈性但同意區分 provenance |
| 12 | UseCase 與 Aggregate 互相用 `aggregateSpecId` / `useCaseSpecId` 做 machine-stable reference。Export 成單一 bundle：`{ manifestVersion, aggregates[], useCases[], readModels[] }` | 2026-04-21 | Round 2 | 三方一致 |
| 13 | ~~ReadModel link relation types 收斂為 4 個~~ ⚠ **Round 3 撤回**（詳見 #14）| 2026-04-21 | Round 2 → 撤回 | — |
| 14 | **撤回決策 #13**。ReadModel link 不需要 `relationType` 欄位，因為 target type 與 relationType 是 1:1 對應（User 的觀察正確，三方 Round 3 一致撤回）| 2026-04-21 | Round 3 | User 發起，三方自省後一致同意 |
| 15 | 不加 `stateTransitions[]` 到 Aggregate spec。Claude 撤回 Round 2 的建議。stateTransitions 資訊隱含在 events[] + state[] 的 join 中，額外欄位會造成 drift | 2026-04-21 | Round 3 | 三方一致（Claude 撤回、Codex Gemini 同意）|
| 16 | AI 推斷 invariant 寫回採 **T1/T2/T3 三段式分離**：T1 Export 不寫回、T2 獨立「Analyze with AI」動作才寫回（`provenance: "assumption"` + `status: "needs_review"`）、T3 Code-gen 只產註解不寫回 | 2026-04-21 | Round 3 | 三方一致。解決 Round 2 「silent spec pollution」擔憂 |
| 17 | Invariant spec 欄位擴充為三軸：`provenance` (ui/assumption) + `status` (confirmed/needs_review/rejected) + `source` (agent/derivedFrom/inferredAt/rationale)。**AI 推斷限制在 invariants[]，其他欄位必須 authored-only** | 2026-04-21 | Round 3 | 三方一致 |
| 18 | Aggregate Detail Panel 的 Invariants 區塊分三個視覺 band：CONFIRMED / NEEDS REVIEW / REJECTED。needs_review 虛線 + 淡黃底 + Approve/Edit/Reject 三動作。Reject 保留紀錄 | 2026-04-21 | Round 3 | 三方一致，細節移交 ui-ux-designer |
| 19 | 程式碼層註解採固定 tag：`// INVARIANT: <id> (provenance, status) - <description>` 和 `// ASSUMPTION: ...` | 2026-04-21 | Round 3 | 三方一致 |
| 20 | Event link 也不需要 `relationType` enum。用 `direction + targetType + optional label` 涵蓋所有情境。Event→Event 若需要 ad-hoc 語義，用現有 `Link.label` 欄位 | 2026-04-21 | Round 3 | Claude + Gemini 對齊；Codex 保留 `causes`/`compensates`/`handled_by_policy`/`governed_by_policy` 4 個；User 決策導向 Claude/Gemini 方案（比照 ReadModel 簡化）|
| 21 | 三種 spec（UseCase / Aggregate / ReadModel）共用同一 minimal link schema：`{ direction, targetType, targetName, targetSpecId, label? }`。`direction` 由 exporter 自動推出 | 2026-04-21 | Round 3 | 承 Round 1 決策 #3 共通設計原則 |
| 22 | Aggregate relationships 也不需要 `relationType` enum。User 確認 Aggregate 只會 `contains Entity` / `governed by Policy` / `integrates_with ExternalSystem` 三種情境，皆與 target type 1:1 對應。三種 spec 最終完全對稱，共用同一 minimal link schema | 2026-04-21 | User 決策（Q12 關閉）| 所有開放問題關閉 |
| 23 | Aggregate spec 的 state 欄位保留原名（不改 attribute）。provenance 欄位也保留原名（不改 authoredBy / origin 等）| 2026-04-21 | User 決策 | 維持 DDD 慣用詞 |
| 24 | **移除 Aggregate spec 的 lifecycle 欄位**。`initialState` / `terminalStates` / `createdByEvent` / `archivedByEvent` 均可從 state + invariants + events 推得，保留會造成重複填寫與 drift | 2026-04-21 | User 決策 | AggregateSpec 精簡為 identity + state + invariants + methods + relationships + events |
| 25 | **`paths` 欄位只出現在 UseCase spec**。Aggregate 與 ReadModel 都移除。理由：FlowPath 是事件流程，只有 UseCase 屬於事件流程；Aggregate 是名詞（資料結構）、ReadModel 是查詢動作，都不在事件鏈上 | 2026-04-21 | User 決策 | 精簡 Aggregate 與 ReadModel schema |

---

## 開放問題

> Round 1 的 Q1–Q6 已全部關閉（詳見決策紀錄 #4–#9）。
> Round 2 的 Q7 / Q8 / Q10 / Q11 已於 Round 3 關閉（詳見決策紀錄 #14–#21）。
> Q9（Aggregate UI 入口）移交 ui-ux-designer 處理。

~~### Q12（新）：Aggregate spec 的 `relationships[].relationType` 是否也該精簡？~~ ✅ **已關閉（決策 #22）**

**所有開放問題關閉**。可進入下一階段（產出範例 spec / 實作）。

---

## 下次討論指引

### 進度摘要

Round 3 完成，三方達成強共識。主要成果：

- **撤回決策 #13**（ReadModel 4-enum）— User 的觀察正確，target type 與 relationType 是 1:1 對應，enum 冗餘
- **Event link 也不需要 enum** — Claude + Gemini 一致，Codex 保留部分；最終取較簡方案
- **stateTransitions 不加** — 三方同意
- **AI invariant 寫回採 T1/T2/T3 三段式分離** — 化解 Round 2 分歧
- **三種 spec 共用 minimal link schema**：`{ direction, targetType, targetName, targetSpecId, label? }`

### 待處理事項

僅剩 Q12（Aggregate relationships enum 是否精簡），或可由 user 直接決策。

接下來可走的路徑：

1. **直接產出 3 份範例 spec**（UseCase / Aggregate / ReadModel 的 Bundle 實例），仿 `DeleteProduct` 具體化，讓 user 審核最終格式
2. **進入實作階段**：
   - UI：Aggregate Detail Panel 擴充（Q9，需 ui-ux-designer 產 wireframe）
   - Schema：`elements.ts` 擴充（state / invariants / lifecycle）
   - Exporter：改寫 `jsonExporter.ts` 產出 Bundle 格式，ReadModel exporter 新增
   - Store migration（新增欄位）
3. **Round 4**：針對 Q12 做最後收斂（若 user 認為需要）

### 閱讀建議

- Round 3 三方分析，特別是 Codex 對 `INVARIANT[ui|confirmed|id]` 固定 tag 格式的設計
- Claude Round 3 的 T1/T2/T3 時機分離表格
- 決策紀錄 #14–#21（Round 3 新增）

### 注意事項

- Bundle 結構已確定：`{ manifestVersion, aggregates[], useCases[], readModels[] }`
- 三種 spec 共用 link schema 為 Round 3 的關鍵簡化成果
- 實作順序建議：先做 Schema（types）→ Exporter → UI（需 ui-ux-designer 先產 wireframe）
