---
topic: Command preCondition / postCondition 欄位設計
date: 2026-05-12
participants: claude, codex, gemini
rounds: 4
status: consensus-reached
---

# Command preCondition / postCondition 欄位設計

## 議題定義

### 目標

為 Cosmogony（React + TypeScript + Zustand + Express MCP server，DDD/Event Storming Tool）的 Command 便條紙新增 `preCondition` 與 `postCondition` 兩個欄位，並讓它們出現在 export 的 JSON 中。需要決定：
1. Schema 形狀（純字串 / 結構化陣列 / Gherkin）
2. 與既有概念（`information`、Aggregate `invariants`、`eventProperties`）的分工
3. UI 設計（DetailPanel 放哪一段、是否 inline edit）
4. JSON export + boardStore migration 衝擊
5. MCP tool 設計 + Coach Spec B 影響

### 範圍

**討論內**：
- StickyNote (type='Command') 加 `preConditions?: CommandCondition[]` / `postConditions?: CommandCondition[]`
- `CommandCondition` 型別設計
- DetailPanel 兩段新 section
- markdownExporter / aiPromptBuilder / UseCaseSpec 整合
- boardStore v17 migration
- MCP tool registry 擴充
- Coach Spec B propose-confirm 流程的影響
- `mcp-server/src/coach/agent/pendingActions.ts` stableSubset hash 更新

**討論外**（Non-goals）：
- DomainEvent / Policy / Aggregate 等其他 sticky note type 加 pre/post condition
- Gherkin Given-When-Then 完整語法支援
- 自動驗證 condition 文字的工具
- LLM 直接執行 condition（純文字記錄，不執行）
- Spec C 才開放的 Coach mutate condition 行為

### 約束

- boardStore 已 v16，需 migration 到 v17
- 既有 MCP tools 共 38 個（Spec A handler refactor + Spec B agent + Action Card 都已 ship）
- Spec B 198/198 tests 必須維持 green
- 不能 overload `es_update_command_information`（其 name 是 semantic contract）
- ToolErrorCode enum 目前只有 NOT_FOUND/INVALID_TYPE/PRECONDITION_FAILED
- Coach Spec B 的 EXPOSED_RISKS = ['read', 'additive']（mutate/destructive 推 Spec C）
- 必須是 additive migration（純加欄位，不破壞既有 export bundle）
- 需與既有 Property[] / Invariant[] 的 pattern 一致（UI/MCP 體驗統一）

## 決策紀錄

### D1: Schema 形狀 — 結構化陣列（agreed by claude + codex + gemini）

採用結構化陣列 `CommandCondition`：

```typescript
interface CommandCondition {
  id: string;              // 穩定 id 給 diff / link 用
  text: string;            // 自然語言描述
  invariantId?: string;    // pre only — 可選 FK 到 Aggregate invariant
  // eventId?: string;     // post only — delay to v17.1（先不上）
}

// StickyNote (Command only) 加：
preConditions?: CommandCondition[];
postConditions?: CommandCondition[];
```

**拒絕的方案**：
- 純字串 + markdown：失去 cross-ref 能力、parser 成本高、Coach `stableSubset` hash 不穩定
- 完整 Gherkin Given/When/Then：屬於 use-case spec 層，不是 Event Storming 畫布；「When」會跟 Command 本身重複，語意冗餘

**逃生口**：若 dogfood 證實 `invariantId` 沒人用，可退回 `CommandCondition: string[]`，但**不**退到 markdown blob。`eventId` 延 v17.1（避免一次塞太多概念）。

### D2: 與既有概念的分工 — 三維獨立（agreed）

| 概念 | 語意 | 適用對象 | 操作模型 |
|---|---|---|---|
| `information` | input schema (envelope/types) | Command | 整批替換（schema-level） |
| `preCondition` | per-command state gate（接受前的狀態前提） | Command | 累積條目（規則一條一條） |
| Aggregate `invariant` | always-true rule（永遠成立） | Aggregate | 累積條目 |
| `eventProperties` | event data schema（output 結構） | DomainEvent | 整批替換 |
| `postCondition` | semantic outcome（成功後的語意變化）| Command | 累積條目 |

**判別法則**：
- 規則對每條路徑都成立 → invariant
- 只為這個 command 把關 → preCondition
- 成功後的語意斷言 → postCondition
- preCondition 可選擇連結 `invariantId` 做 traceability（不重複描述）

**已知漂移風險**：dogfood 階段預期會發生 preCondition vs Aggregate invariant 語意漂移 — 靠 UI 引導（invariantId 下拉=happy path）+ 文案區分，不靠 schema 強制。接受短期重複。

### D3: UI — DetailPanel 三段，Hoare triple 排序（agreed）

**排序**：Pre-conditions → Information → Post-conditions（對應 Hoare triple `{P} c {Q}`）

**Label**：中文化「前置狀態 / 輸入 / 執行後狀態」（不放 Hoare triple jargon）+ inline `?` help + 範例

**互動**：
- Pre/Post 兩段 collapsible：default expanded if length>0、collapsed if empty
- Information 維持 non-collapsible（既有 DetailPanel.tsx:691-723 pattern）
- 收合狀態下直接 unmount inputs entirely + aria-expanded（不需 tabIndex={-1} tricks）
- Inline edit，重用 PropertyList 元件樣式
- + 按鈕 add、hover trash delete
- 每行 optional「Link invariant」chip-picker（v1 上）

**Tab 順序**：跟視覺一致 — Pre → Info → Post，DOM 自然順序就對

### D4: JSON export 結構（agreed）

新增 `src/types/elements.ts`：

```typescript
export interface CommandCondition {
  id: string;
  text: string;
  invariantId?: string;
}
```

`StickyNote`（Command type 限定）加：
- `preConditions?: CommandCondition[]`
- `postConditions?: CommandCondition[]`

**影響檔案**：
- `src/types/elements.ts` — type 定義
- `src/store/boardStore.ts` — migration v16 → v17
- `src/utils/markdownExporter.ts` — 加獨立 `### Preconditions` + `### Postconditions` block
- `src/utils/aiPromptBuilder.ts` — Command 段順序：Command label → Information → Preconditions → Postconditions → Linked Aggregate
- `src/types/bundle.ts` — `UseCaseSpec` 加 preConditions/postConditions
- `src/utils/jsonExporter.ts` — `buildUseCaseSpec` 帶兩個新欄位
- `mcp-server/src/coach/agent/pendingActions.ts` — `stableSubset` hash 納入兩欄位
- `mcp-server/src/coach/types.ts` — 鏡像 type
- `mcp-server/src/coach/tools/handlers.ts` — 新增 handlers
- `mcp-server/src/coach/tools/toolDefinitions.ts` — 新增 tool entries

### D5: markdownExporter / aiPromptBuilder 整合（agreed by claude + codex）

- **markdownExporter**：postCondition 用獨立 `### Postconditions` block，**不**合併進「執行後產生的 events」段落
  - 理由：events 是事實流、postcondition 是 state predicate，合併會破壞 Hoare triple 語意
  - preCondition 同樣 `### Preconditions` block + bullet list；invariantId 渲染為 markdown link
- **aiPromptBuilder**：Command 段順序 — Command label → Information → Preconditions → Postconditions → Linked Aggregate
  - 保持 {P} C {Q} adjacent，自然 read

### D6: MCP tool — split add + update pair（majority: gemini + claude vs codex）

採 **Option C**：拆對 pattern，類比既有 `es_add_invariant` + `es_update_invariant`：

```
es_add_command_condition(commandId, kind: 'pre'|'post', condition: { text, invariantId? })
  risk: 'additive'
  Spec B 暴露給 Coach（buildDeclarations include）

es_update_command_conditions(commandId, preConditions?, postConditions?)
  risk: 'mutate'
  Spec B 不暴露（推 Spec C）
```

**Gemini 主導理由**：
> 「Pre/Post conditions 在 Event Storming 實務上是隨領域探索逐步浮現、累積的業務規則，賦予 Coach `es_add_command_condition` (additive) 能讓它在 Spec B 階段就主動發掘 edge cases 並逐條增補，發揮『領域專家』協作價值，這比等到 Spec C 才能整批覆寫更符合漸進式塑模體驗。」

**Claude 補充理由**：
- preCondition/postCondition 是累積條目（DDD 建模過程逐條發現），更接近 invariant 而非 information schema
- Coach 「我發現這個 Command 還缺一條 precondition」是最自然的 additive 提案
- Option A 強迫 Coach 走 mutate 路徑，被 Spec B 的 risk gate + budget=2 擋下，把 Coach 價值整整推後一個 spec

**Codex 異議（少數）**：「同一組資料若同時存在 append mental model 和 replace-all mental model，會增加 Coach + human 的判斷複雜度，UX ambiguity」— 此意見記入 ADR：若未來實證顯示 pre/post condition 大量被整批重寫，再退回單一 mutate tool（Option A）。

**拒絕的方案**：
- A（單一 mutate tool）：少數意見保留，記入 ADR
- B（additive + handler 拒絕覆寫）：自相矛盾（additive 卻可能拒絕）；需要新 `INVALID_OPERATION` error code，propagation 到 llm/adapter.ts、types.ts、router.ts

### D7: Cascade delete — soft-null + broken-link flag（agreed）— P0

Aggregate invariant 被刪除時，所有引用該 `invariantId` 的 preCondition 必須：
1. `invariantId` 設為 `undefined`（soft-null）
2. 加 `_brokenInvariantLink: { previousId, deletedAt }` flag
3. UI 顯示 ⚠️ icon + tooltip「原 invariant 已刪除」
4. 實作位置：`boardStore.deleteInvariant` action 加 reverse-lookup 掃所有 Command notes

**理由**：不能直接 cascade delete 整條 preCondition（business rule 仍存在，只是 traceability link 斷了）。也不能放任 dangling reference（UI 點下去會 404）。

### D8: CAS reverify — stableSubset 納入整 array（agreed）

`mcp-server/src/coach/agent/pendingActions.ts` 的 `stableSubset(note)` 必須加：
- `preConditions: preConditions ?? []`
- `postConditions: postConditions ?? []`

**必須 hash 整個 array 序列化結果，不能只 hash 改動項**，否則並發改寫會髒寫入。

### D9: propose-confirm risk classification（agreed）

新 tool 在 Spec B 暴露範圍：
- `es_add_command_condition` → risk: 'additive'，加入 `EXPOSED_RISKS`
- `es_update_command_conditions` → risk: 'mutate'，不加入 `EXPOSED_RISKS`（Spec C 才暴露）

**`describeProposal` targetIds 計算**：
- `es_add_command_condition` → `[commandId]`（修改既有 Command note → CAS reverify 比對 Command 的 stableSubset）

**Coach proposal kind**：
- 新增 `CommandConditionProposal` kind（Action Card UI 顯示「在 Command X 加 preCondition: ...」）

### D10: Migration validation test（agreed by claude + codex）

雖然 v17 migration 是純 additive（default `[]`），但需寫**一次性驗證測試**：
1. 用既有 `mcp-server/data/project.json`（已累積多 sprint 內容）為 fixture
2. Load 為 v16 state → run migrate(v16→v17) → assert：
   - 每個 Command note 都有 `preConditions: []` 與 `postConditions: []` 預設值
   - 無既有欄位流失
   - Note count 不變
3. One-shot test（不長存），擋 silent corruption 回歸

成本 ~30 分鐘，cost-effective insurance。

### D11: Feature flag — 不需要（agreed by claude）

簡單 ship，不加 feature flag：
- Schema 純 additive，empty 不顯示，無 rollback 路徑需求
- OQ-1 已決定 `es_add_command_condition` 是 additive 上 Spec B；`es_update_command_conditions` 推 Spec C — 這是天然 gate
- Feature flag 本身有成本（dead config path、ship-then-rip work、「is it on?」混淆）
- 若 Spec C 階段 Coach mutate 暴露出問題，那時在 Coach exposure layer 加 flag，不是 schema layer

## 開放問題

### OQ-A: postCondition 是否含 reverse traceability？

`CommandCondition.eventId` 延 v17.1 — 但 dogfood 階段是否需要 postCondition → DomainEvent 的關聯？目前判斷：
- v17 不需要（postcondition 是斷言，不是事件）
- v17.1 視 dogfood 反饋決定

### OQ-B: BoardSnapshot summary 是否帶 conditions？

Coach 在 `attachSnapshot=true` 時看的 boardSnapshot 是否要在 summary 段帶 preCondition/postCondition？
- 推薦：帶（讓 Coach 看得到，才能做有 grounding 的提議）
- 但 token 預算要評估（Command 數量大時可能爆）

### OQ-C: aiPromptBuilder 是否更新 prompt template

`aiPromptBuilder` 目前 dump 全 boardJson + markdown summary verbatim。新欄位走 markdown summary 渲染即可，prompt template literal 不必動。確認此判斷與既有「Coach 從 markdown 看結構、從 raw JSON 看精確值」一致。

### OQ-D: ADR 記錄 Codex 反對意見

Codex 對 D6 拆對 tool 的反對 — 必須在 spec「已知限制」段註明，定義將來退回 Option A 的判準：「若 dogfood 階段觀察到 ≥30% 的 condition 操作是整批重寫（不是 append-only），重新評估退回單一 mutate tool」。

## 共識狀態

| 子議題 | 狀態 | 投票 |
|---|---|---|
| D1 Schema = 結構化陣列 | agreed | 3/3 |
| D2 三維獨立分工 | agreed | 3/3 |
| D3 UI Hoare ordering + 中文 label | agreed | 2/3（gemini 第 1-3 輪缺席，第 4 輪未測） |
| D4 JSON export 結構 | agreed | 3/3 |
| D5 markdownExporter 獨立 block + aiPromptBuilder 順序 | agreed | 2/2（gemini 第 1-3 輪缺席） |
| D6 拆對 add+update pair | majority | 2/3（gemini+claude vs codex；codex 異議記入 ADR） |
| D7 Cascade delete soft-null + flag | agreed | 2/2 |
| D8 stableSubset 納入 array | agreed | 2/2 |
| D9 risk classification + Proposal kind | agreed | 2/2 |
| D10 Migration validation test | agreed | 2/2 |
| D11 不加 feature flag | agreed | 2/2 |
