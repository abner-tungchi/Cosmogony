# FE: Spec Bundle Exporter

## 任務摘要

擴充 `jsonExporter.ts`，從原本只匯出 `UseCaseExport[]`（DomainEvent-only）改為匯出完整的 **Spec Bundle**，含 `aggregates[] / useCases[] / readModels[] / dtos[]` 四區塊與頂層 manifest，對齊 `docs/spec-design.md` 的格式。

---

## 實作內容

### 1. 新增 Bundle 型別（`src/types/bundle.ts`）

- `SpecBundle` — 頂層 bundle（`manifestVersion` / `bundleId` / `context` / 四大 spec array）
- `AggregateSpec`、`UseCaseSpec`、`ReadModelSpec`、`DtoSpec` — 四種 spec body
- `SpecLink` / `SpecLinkTargetType` — 統一的 minimal link schema（direction + targetType + targetName + targetSpecId [+ label]）
- `SpecProperty` — bundle property format（`name` / `type` / `required?` / `notes?`），與 board 端的 `Property`（`attrName` / `type`）分離
- `AggregateMethodRef` / `AggregateEventRef` — Aggregate spec 內的 method 與 event refs

選擇單獨新檔（而非擴充 `specs.ts`）的理由：`specs.ts` 是 editing-time spec fragments（Invariant、AggregateIdentity、DtoField、ReturnTypeSpec），`bundle.ts` 是 export-time contract。兩者職責不同，分開比較清楚。

### 2. 改寫 `src/utils/jsonExporter.ts`

- 新增 `exportBoardAsBundle(board: Board): SpecBundle` — 主要入口
- 拆出純函式 builder：`buildAggregateSpec` / `buildUseCaseSpec` / `buildReadModelSpec` / `buildDtoSpec`
- 共用 helper：
  - `camelCase(raw)` — 推導 `_suggested_*` 欄位
  - `firstLine(label)` — 處理多行 label（Dto 舊格式、query name 等）
  - `toSpecProperty` / `toSpecProperties` — `{ attrName → name }` 欄位對應
  - `buildSpecLinks(ownerId, ...)` — 從 Board.links 產生該元素視角的 `outbound / inbound` SpecLink，統一用於 `relationships[]` 與 `links[]`
  - `resolveLinkTarget(endpointId, endpointKind, ...)` — 支援 note / remodel 兩種端點類型
  - `pruneEmpty(obj, keepKeys)` — 刪掉 `undefined` / 空字串 / 空陣列 / 空物件欄位（頂層 bundle array 以 keepKeys 保留）
- 保留舊的 `exportBoardToJson` 並標 `@deprecated`，降低 regression 風險

### 3. 更新 `src/components/Modals/ExportModal.tsx`

- `handleDownloadJson` 改呼叫 `exportBoardAsBundle`
- 下載檔名從 `${name}_usecases.json` 改為 `${name}_bundle.json`

---

## 欄位來源對照（實作總表）

### AggregateSpec
| Spec 欄位 | 來源 |
|-----------|------|
| `aggregateSpecId` | `note.id` |
| `aggregate` | `firstLine(note.label)` |
| `behavior` | `note.notes`（暫借，Aggregate 沒有 behavior 欄位）|
| `identity` | `note.aggregateIdentity`，無則從 label 推導 `{ name: "${camelCase(label)}Id", _suggested_type: "${label}Id", _suggested_field: "${camelCase(label)}Id" }` |
| `state` | `note.stateProperties` → `SpecProperty[]` |
| `invariants` | `note.invariants`（直接沿用 `Invariant` 結構，含 `source` 等欄位）|
| `methods` | 所有 `entityId === note.id` 的 DomainEvent，每筆產 `{ useCaseSpecId, useCase, emitsEvent, _suggested_method }` |
| `relationships` | `buildSpecLinks(note.id, board.links, ...)` |
| `events` | 同 methods，產 `{ name, emittedByUseCaseSpecId }` |
| `_suggested_aggregateId` / `_suggested_repository` | `${label}Id` / `${label}Repository` |

### UseCaseSpec（來源：type='DomainEvent' 的 note）
| Spec 欄位 | 來源 |
|-----------|------|
| `useCaseSpecId` | `event.id` |
| `aggregateSpecId` | `event.entityId`（指向 Aggregate note 的 id） |
| `useCase` | Command note.label（第一行 trim） |
| `behavior` | `event.behavior` |
| `aggregate` | Aggregate note.label |
| `paths` | `event.paths` → `flowPath.name` |
| `input` | Command.information → `SpecProperty[]` |
| `emittedEvent` | `event.label` |
| `eventPayload` | `event.eventProperties` → `SpecProperty[]` |
| `links` | `buildSpecLinks(event.id, board.links, ...)` |
| `_suggested_*` | 從 aggregate + command label 推導 |

當 DomainEvent 沒有 `commandId` 時 → `console.warn` 並產 partial spec（`useCase: ''`），不 throw。

### ReadModelSpec（來源：Remodel）
| Spec 欄位 | 來源 |
|-----------|------|
| `readModelSpecId` | `remodel.id` |
| `queryName` | `firstLine(remodel.queryNote.content) || firstLine(remodel.queryNote.label)` |
| `behavior` | `remodel.behavior` |
| `parameters` | `remodel.parameters` → `SpecProperty[]` |
| `returnType` | `remodel.returnType`，缺省則 `{ shape: 'object', fields: [] }` |
| `links` | Board.links + 衍生 links（`linkedActorId` 單一 + `linkedBundleIds[]` + `linkedDtoIds[]` 多個），以 `(direction, targetSpecId)` 去重 |
| `_suggested_queryFunction` | `${queryName}.query` |

### DtoSpec（來源：type='Dto' 的 note）
| Spec 欄位 | 來源 |
|-----------|------|
| `dtoSpecId` | `note.id` |
| `name` | `firstLine(note.label)`（舊格式的 inline fields 會被剝掉）|
| `description` | `note.notes` |
| `fields` | `note.dtoFields`（保留原 `DtoField` 結構）|

---

## 空欄位策略

- 頂層 bundle 四個 array 永遠存在（即使空），以 `pruneEmpty` 的 `keepKeys` 保護
- 每個 spec body 內的可選欄位（`behavior` / `paths` / `links` / `_suggested_*` 等）若為空或 undefined，直接不放進 JSON
- 但 spec 內的必填 array（如 `AggregateSpec.state` / `UseCaseSpec.input` / `UseCaseSpec.eventPayload` / `ReadModelSpec.parameters`）也以 `keepKeys` 保留，確保 shape 可預期

---

## 驗證

1. **TypeScript compile**：`tsc --noEmit` 及 `tsc -b` 雙通道皆 0 error
2. **Build**：`npm run build` 成功
3. **Lint**：`npm run lint` 於改動檔案（`jsonExporter.ts` / `bundle.ts` / `ExportModal.tsx`）0 error（repo 其他檔案 pre-existing issues 不在此任務範圍）
4. **Smoke test**：臨時 smoke harness 以 Order 流程（Aggregate + DomainEvent + Command + Actor link + Remodel + Dto + FlowPath）驗證輸出 JSON 對齊 `spec-design-explanation.md` §5 的參考範例，以及 empty board 的空 bundle 情境；通過後移除，避免污染 build 流程

### Smoke 輸出重點對照

- `bundleId` / `context` 正確取自 `board.id` / `board.name`
- `AggregateSpec.methods[0] = { useCaseSpecId: "note-event-cancelled", useCase: "CancelOrder", emitsEvent: "OrderCancelled", _suggested_method: "Order.CancelOrder" }`
- `UseCaseSpec.input[0] = { name: "orderId", type: "OrderId" }` — 確認 `attrName → name` 對應
- `UseCaseSpec.paths = ["OrderFlow"]` — FlowPath id 解為 name
- `UseCaseSpec.links[0] = { direction: "inbound", targetType: "Actor", ... }` — direction 判斷正確
- `ReadModelSpec.links` 同時含 Board.links 產生的、以及 `linkedBundleIds` / `linkedDtoIds` 衍生的 outbound links，`(direction, targetSpecId)` 去重
- `DtoSpec.fields` 保留完整 `DtoField` 結構（含 `dtoSpecRef`）

---

## 新增/修改檔案

- **NEW** `src/types/bundle.ts` — Bundle & 四種 spec 的 TypeScript 型別
- **MODIFIED** `src/utils/jsonExporter.ts` — 新增 `exportBoardAsBundle` 與 builder pure functions；舊 `exportBoardToJson` 以 `@deprecated` 標註保留
- **MODIFIED** `src/components/Modals/ExportModal.tsx` — 改呼叫 `exportBoardAsBundle`，檔名改為 `${name}_bundle.json`

---

## 非本任務範圍（後續工作）

- **Markdown exporter 的 Bundle 格式** — `markdownExporter.ts` 仍是舊格式
- **MCP tool 版 bundle export** — 未來 AI 可直接抓 bundle
- **T2 Analyze with AI** — 寫回 invariant 的 `provenance: "assumption"`
- **移除舊 `exportBoardToJson`** — 目前標 `@deprecated` 等下一版再清
- **`Aggregate.behavior` 專屬欄位** — 目前借用 `note.notes`，未來 UI 可加獨立欄位

---

## Tech notes / caveats

- `_suggested_method` 目前產出的格式是 `${Aggregate}.${commandLabel}`（例如 `Order.CancelOrder`），規格範例裡寫的是 `Order.cancel`。這是 `_suggested_*` 欄位，AI 有權改寫；若未來想改成更符合 idiom 的 camelCase method 名稱，於 `buildAggregateSpec` / `buildUseCaseSpec` 裡改 `_suggested_method` 推導邏輯即可。
- `pruneEmpty` 用 `object` 而非 `Record<string, unknown>` 做型別約束，讓 interface-typed 物件可直接傳入；嚴格性以 `Object.entries` 的 runtime 行為保證。
- Remodel 的 `linkedBundleIds` 欄名是歷史遺留（舊 Bundle → 新 DomainEvent 命名過渡期）；本 exporter 視之為 source event note id list，和 task 規格一致。
