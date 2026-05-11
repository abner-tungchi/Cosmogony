# Coach Agent — Spec A：38 個 MCP Tool Handler Refactor

## 來源

- Plan：`/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md`（含 R1+R2 三方共識決策 D1-D17）
- 討論：`docs/discussions/2026-05-07-coach-agent-and-skill-architecture.md`（Round 1 + Round 2，三方 agreed）

本 spec 為 **Spec A**（純 refactor），是後續 Spec B（Agent + Skill + Action Card）的前置。範圍嚴格限制在「結構抽取、零功能變化」。

---

## 目標

把 `mcp-server/src/index.ts` 內 38 個 `server.tool(name, desc, schema, async (args) => { ... })` 的 callback body 抽出成兩層架構：(1) **pure handler** 收 `args + ctx` 回 `{ result, events }`、(2) **mcpAdapter** 負責 `loadProjectFromRelay → 呼叫 handler → save → sync → broadcast` 的調度。

理由：Spec B 的 Skill `execute()` 必須走 pure handler 路徑（不能透過 MCP transport），但既有 38 個 tool 內部混雜 5 種步驟（load / mutate / save / sync / broadcast）且每個 tool 的 broadcast 時序不一致（`es_add_flow` 全 pre-commit、`es_add_command_for_event` 混合、`es_switch_context` 不廣播、其他 post-commit）。

Spec A 的交付物是 **可獨立 ship 的 refactor**，預期行為等價於現況（包含上述時序差異）。Spec B 才會在此基礎上引入 risk metadata、Gemini function calling、Action Card 等新功能。

---

## 介面合約（Interface Contract）

### 1. `mcp-server/src/coach/tools/handlers.ts`（新檔）— Pure handler 型別系統

```ts
import type { Project } from '../../../../src/types/board';

/**
 * Pure handler 收到的執行 context。projectState 是 mutable ref（caller 已先呼 loadProjectFromRelay）。
 * `now()` 抽出來方便 unit test 注入固定時間戳（既有 callbacks 直接 `new Date().toISOString()`，
 * adapter 預設傳 `() => new Date().toISOString()`）。
 */
export interface ToolHandlerCtx {
  projectState: Project;
  now: () => string;
}

/**
 * Broadcast event 的時序標記。adapter 依 phase 決定在 saveProject/syncProjectToRelay 之前或之後 fire。
 * - 'pre-commit': 在 saveProject 之前 fire（保留 es_add_flow / es_add_command_for_event 既有時序）
 * - 'post-commit': 在 syncProjectToRelay 之後 fire（標準 pattern）
 */
export type BroadcastPhase = 'pre-commit' | 'post-commit';

export interface BroadcastEvent {
  phase: BroadcastPhase;
  action: string;          // 例如 'add_note' / 'update_note' / 'delete_note' / 'add_link' 等既有 SSE action
  payload: unknown;        // 對應 action 的 payload，與既有 broadcast(action, payload) 第二參數等價
}

/**
 * 標準錯誤碼。handlers 用這幾種；adapter 把它們轉成既有的「Note ${id} not found.」等 text response。
 */
export type ToolErrorCode = 'NOT_FOUND' | 'INVALID_TYPE' | 'PRECONDITION_FAILED';

export interface ToolHandlerError {
  code: ToolErrorCode;
  message: string;         // adapter 直接用作回給 MCP 的 text content
}

/**
 * 每個 handler 的回傳。
 * - ok=true：成功，resultJson 是要回給 caller 的資料；events 是要 broadcast 的列表
 * - ok=false：不修改 projectState（handler 必須在 mutate 之前 detect 失敗條件並早退）
 *
 * 不變量：ok=false 時 events 應為空陣列，resultJson 為 null
 */
export interface ToolHandlerResult {
  ok: boolean;
  resultJson: unknown;
  events: BroadcastEvent[];
  error?: ToolErrorCode extends never ? never : ToolHandlerError;
}

export type ToolHandler<Args> = (args: Args, ctx: ToolHandlerCtx) => ToolHandlerResult;
```

**所有權明示**：
- `projectState` mutation 只能由 handler 內部進行；adapter 不直接動 projectState
- `saveProject()` / `syncProjectToRelay()` / `broadcast()` 由 adapter 統一呼叫；handler **不可** 自行呼叫這些 helper（保持 pure 屬性）
- `loadProjectFromRelay()` 由 adapter 在 handler 之前呼叫；handler 假設 projectState 已是最新

### 2. `mcp-server/src/coach/tools/toolDefinitions.ts`（新檔）— 共享 registry

```ts
import { z } from 'zod';
import type { ToolHandler } from './handlers';

/**
 * Tool 在 commit / broadcast 時序上的 policy 描述。**5 種**對應現況實際行為，**不是「應該」如何**：
 *
 * - 'read-only': loadProjectFromRelay → handler → return；**不呼叫** saveProject / syncProjectToRelay / broadcast
 *                範例：es_list_contexts、es_get_project、es_get_board（純讀，回 JSON）
 * - 'standard': loadProjectFromRelay → handler → saveProject → syncProjectToRelay → 全 post-commit broadcast
 *               範例：es_add_note、es_update_note、es_delete_note、…等 32 個一般 mutating tool
 * - 'pre-commit-only': loadProjectFromRelay → handler（含 pre-commit broadcasts，**無 post-commit**）→ saveProject → syncProjectToRelay
 *                     唯一範例：es_add_flow（每個 step push 後立即 broadcast、最後才 save、無 post-commit）
 * - 'mixed': 同時有 pre-commit 與 post-commit broadcast
 *            唯一範例：es_add_command_for_event（infoNote pre-commit add_note；commandNote/eventNote post-commit）
 * - 'no-broadcast': loadProjectFromRelay → handler → saveProject → syncProjectToRelay；**無 broadcast**
 *                   唯一範例：es_switch_context（刻意 server-local，不通知 FE active tab）
 *
 * 38 個 tool 分桶：32 standard + 3 read-only + 1 pre-commit-only + 1 mixed + 1 no-broadcast = 38。
 *
 * **Spec A 的核心**：保留每個 tool 既有的 phase 順序，避免引入回歸。
 */
export type CommitBroadcastPolicy = 'read-only' | 'standard' | 'pre-commit-only' | 'mixed' | 'no-broadcast';

/**
 * 風險等級的 type placeholder。Spec A 不讀此欄位，spec B 才填入並由 orchestrator 使用做
 * auto-exec / require-confirm / destructive-2step 的決策。**Spec A 必須允許此欄位為 'unset'**。
 */
export type ToolRiskLevel = 'unset' | 'read' | 'additive' | 'mutate' | 'destructive';

/**
 * 一個 tool 的完整描述。MCP server.tool 註冊與 spec B 的 Skill.buildDeclarations 都從這裡讀。
 *
 * Spec A 範圍：runtime 只讀 name / description / schema / handler / policy。
 * Spec B 才會讀 risk。
 */
export interface ToolDefinition<Args = unknown> {
  name: string;
  description: string;
  schema: Record<string, z.ZodType>;     // 與既有 server.tool 第三參數同形（已是 zod schema map）
  handler: ToolHandler<Args>;
  policy: CommitBroadcastPolicy;
  risk: ToolRiskLevel;                    // Spec A 全部填 'unset'；spec B 才填具體值
}

/**
 * Registry 是個有序陣列（保留 mcp-server/src/index.ts 既有註冊順序，便於 audit log diff）。
 */
export const TOOL_DEFINITIONS: ToolDefinition[];
```

**所有權明示**：
- `TOOL_DEFINITIONS` 是 spec A 唯一交付的 single source of truth；既有 `server.tool(...)` 與 spec B 的 Skill 都從此讀
- `risk` 在 spec A 永遠 `'unset'`；spec A 的 mcpAdapter 不讀此欄位（保「零功能變化」）

### 3. `mcp-server/src/coach/tools/mcpAdapter.ts`（新檔）— 把 handler 接到 server.tool

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from './toolDefinitions';

/**
 * Adapter 依賴：載入既有的 helpers（避免重複定義或 import 循環）。
 * mcp-server/src/index.ts 在 register 時注入。
 */
export interface McpAdapterDeps {
  loadProjectFromRelay: () => Promise<void>;
  saveProject: () => void;
  syncProjectToRelay: () => Promise<void>;
  broadcast: (action: string, payload: unknown, excludeId?: string) => Promise<void>;
}

/**
 * 把所有 ToolDefinition 註冊到 MCP server。每個 tool 的 server.tool callback 變成薄 adapter。
 *
 * Adapter 流程**依 policy 分支**：
 *
 *   server.tool(def.name, def.description, def.schema, async (args) => {
 *     await deps.loadProjectFromRelay();
 *     const result = def.handler(args, { projectState: <mut ref>, now: () => new Date().toISOString() });
 *     if (!result.ok) {
 *       return { content: [{ type: 'text', text: result.error.message }] };
 *     }
 *     if (def.policy === 'read-only') {
 *       // 不 save / sync / broadcast — events 必為空
 *       return { content: [{ type: 'text', text: textFromResult(result.resultJson) }] };
 *     }
 *     // pre-commit broadcasts（保 es_add_flow / es_add_command_for_event 既有時序）
 *     for (const e of result.events.filter(x => x.phase === 'pre-commit')) {
 *       await deps.broadcast(e.action, e.payload);
 *     }
 *     deps.saveProject();
 *     await deps.syncProjectToRelay();
 *     // post-commit broadcasts（標準 pattern）
 *     for (const e of result.events.filter(x => x.phase === 'post-commit')) {
 *       await deps.broadcast(e.action, e.payload);
 *     }
 *     return { content: [{ type: 'text', text: textFromResult(result.resultJson) }] };
 *   });
 *
 * 不變量：'read-only' policy 的 tool events.length 必為 0；adapter 用 dev-mode runtime check
 * 保護（譬如 NODE_ENV !== 'production' 時 throw 防實作者誤填 events）。
 */
export function registerMcpTools(server: McpServer, definitions: ToolDefinition[], deps: McpAdapterDeps): void;

/**
 * 把 handler 的 resultJson 轉成 MCP text content 的內部 helper。
 * 保留既有 38 個 tool 的回傳格式：
 *   - 字串：直接傳（如 'Note updated.' / 'Note deleted.' / `Switched to context ${id}.`）
 *   - object/array：JSON.stringify（如 es_get_board / es_get_project / es_list_contexts / es_add_flow）
 *   - null：傳空字串 ''
 *
 * 每個 handler 的 resultJson 已是「正確型別」（string 或 object/array），handler 內部負責決定。
 * 此 helper 純粹做型別 dispatch，不做業務邏輯。
 */
function textFromResult(resultJson: unknown): string;
```

**所有權明示**：
- `saveProject()` / `syncProjectToRelay()` / `broadcast()` 由 adapter 唯一呼叫；handler 不得直接呼叫
- `loadProjectFromRelay()` 在每次 server.tool callback 開頭呼叫；spec A 完整保留此既有行為
- pre-commit / post-commit broadcast 順序在同 phase 內等同既有 source 順序（events 陣列順序）

### 4. 廣播 phase 分類 — 38 個 tool 的具體 policy

**`'read-only'`（3 個 — 不 save/sync/broadcast）**：
- `es_list_contexts`, `es_get_project`, `es_get_board`
- 實際 callback 只 `await loadProjectFromRelay()` 然後 return JSON；**沒有** saveProject / syncProjectToRelay / broadcast
- adapter 對此類 tool 走精簡路徑：load → handler → return text；events 必為空

**`'standard'`（32 個 — 全 post-commit）**：

`es_create_context`, `es_rename_context`, `es_delete_context`, `es_set_board_name`, `es_clear_board`, `es_add_note`, `es_update_note`, `es_delete_note`, `es_update_command_information`, `es_update_event_properties`, `es_link_entity_to_event`, `es_link_entity_to_aggregate_root`, `es_add_remodel`, `es_update_remodel`, `es_delete_remodel`, `es_set_event_paths`, `es_set_event_phase`, `es_add_flow_path`, `es_delete_flow_path`, `es_add_link`, `es_delete_link`, `es_add_entity_for_event`, `es_update_aggregate_identity`, `es_update_state_properties`, `es_add_invariant`, `es_update_invariant`, `es_delete_invariant`, `es_set_invariant_status`, `es_update_dto_fields`, `es_update_remodel_behavior`, `es_update_remodel_parameters`, `es_update_remodel_return_type`

**`'pre-commit-only'`（1 個）**：
- `es_add_flow`：每個 step 內 `push commandNote / push eventNote / push cmdEventLink → broadcast 三件事` 為 pre-commit；auto-link 若 `autoLink && createdSteps.length > 1` 則每個 flowLink push 後也 broadcast pre-commit；最後 `saveProject + syncProjectToRelay`，無 post-commit broadcast

**`'mixed'`（1 個）**：
- `es_add_command_for_event`：`information.length > 0` 時 push commandNote + push infoNote → **pre-commit broadcast `add_note` 給 info** → 接著 mutate eventNote.commandId → `saveProject + syncProjectToRelay` → **post-commit broadcast `add_note` 給 command + `update_note` 給 event**

**`'no-broadcast'`（1 個）**：
- `es_switch_context`：events 永遠空陣列；adapter 仍走 load → handler → save → sync 流程

**Pre-commit broadcast 時序的微妙差異**（zero-functional-change 詮釋）：
- **既有實作**：mid-handler broadcast 在 server-side projectState 處於「中間態」時 fire（譬如 `es_add_command_for_event` 的 infoNote broadcast 時 server-side `eventNote.commandId` 尚未更新）
- **新 adapter 模型**：handler 完成所有 mutation 後再 fire pre-commit events，server-side 已是最終態
- **對 FE 不可見**：broadcast 第二參數是 explicit payload（不是 projectState ref），FE 收到的事件序列與內容**完全等同**
- spec A 接受此「server-side intermediate state 微差」為實作層細節，不視為功能變化（沒有 client 讀 server projectState）

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `mcp-server/src/coach/tools/handlers.ts` | NEW — 38 個 `ToolHandler<Args>` pure function；每個是 `(args, ctx) => ToolHandlerResult` |
| `mcp-server/src/coach/tools/toolDefinitions.ts` | NEW — `TOOL_DEFINITIONS: ToolDefinition[]`，含 name / description / schema / handler / policy / risk='unset' |
| `mcp-server/src/coach/tools/mcpAdapter.ts` | NEW — `registerMcpTools(server, definitions, deps)` + private `textFromResult` |
| `mcp-server/src/coach/tools/__tests__/handlers.test.ts` | NEW — 38 個 handler 的 unit test（input + projectState ref → 比對 resultJson + events 結構），含 STRICT vs PERMISSIVE 失敗語義驗證 |
| `mcp-server/src/coach/tools/__tests__/mcpAdapter.test.ts` | NEW — 5 種 policy 的 phase 順序驗證（read-only / standard / pre-commit-only / mixed / no-broadcast）+ error path + dev-mode invariant assertion |
| `mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts` | NEW — registry 完整性 runtime 斷言（38 unique tools、name 對 EXPECTED_NAMES、risk='unset'、policy enum 對應、policy distribution 32+3+1+1+1） |
| `mcp-server/src/index.ts` | 38 個 `server.tool(...)` 註冊呼叫**全部移除**；改成 `import { TOOL_DEFINITIONS } from './coach/tools/toolDefinitions';` + 一行 `registerMcpTools(server, TOOL_DEFINITIONS, { loadProjectFromRelay, saveProject, syncProjectToRelay, broadcast });`。**helpers `loadProjectFromRelay` / `saveProject` / `syncProjectToRelay` / `broadcast` / `broadcastExcept` / `getActiveBoard` / `nextEventX` / `nextRemodelX` / `migrateProject` / `createBoard` / `subscribers` / `projectState` 全部不動**（handlers 從 `ctx.projectState` 取，nextEventX / nextRemodelX 改成 handler 內部用 ctx 推導 — 見實作步驟 Step 3） |

未改動：
- `mcp-server/src/index.ts` 的 helpers / Express route / SSE 機制 / relay mode / startup 邏輯 / projectState init
- `mcp-server/src/coach/router.ts` / `sessionStore.ts` / `snapshotBuilder.ts` / `llm/*` / `prompts/*`（Coach P1 既有部分）
- 任何前端檔案
- `mcp-server/data/coach/system_prompt.md`
- 既有測試檔（`router.test.ts` / `sessionStore.test.ts`）

---

## 實作步驟

### Step 1 — `mcp-server/src/coach/tools/handlers.ts` 新檔（型別 + 38 個 handler）

1. 在檔案頂部 declare 型別系統：`ToolHandlerCtx`、`BroadcastPhase`、`BroadcastEvent`、`ToolErrorCode`、`ToolHandlerError`、`ToolHandlerResult`、`ToolHandler<Args>`（內容如介面合約 #1）
2. 從 `mcp-server/src/index.ts` 既有 `server.tool('es_xxx', ..., async (args) => { ... })` 的 callback body 逐個搬到 handler 形式：

   **轉換規則 — standard tool（35 個）**：
   ```ts
   // BEFORE (in index.ts):
   server.tool('es_xxx', desc, schema, async (args) => {
     await loadProjectFromRelay();
     // mutate projectState
     // ... validation 失敗 → return text
     saveProject();
     await syncProjectToRelay();
     await broadcast(action, payload);
     return { content: [{ type: 'text' as const, text: '...' }] };
   });

   // AFTER (in handlers.ts):
   export const handle_es_xxx: ToolHandler<XxxArgs> = (args, ctx) => {
     // mutate ctx.projectState（直接動）
     // 失敗 → return { ok: false, resultJson: null, events: [], error: { code, message } };
     return {
       ok: true,
       resultJson: '...' /* 既有 text */ 或 { ... } /* 既有 JSON.stringify 對象 */,
       events: [{ phase: 'post-commit', action, payload }],
     };
   };
   ```

   **轉換規則 — pre-commit-only（`es_add_flow`）**：handler 在每個 step push 完 commandNote / eventNote / cmdEventLink 後，把對應 broadcast 收進 events 陣列（phase: 'pre-commit'）；auto-link 區段同樣 phase: 'pre-commit'。最後 mutate `board.updatedAt = now` / `projectState.updatedAt = now` 並 return。**events 順序必須等同既有 broadcast 呼叫順序**（add_note command → add_note event → add_link cmdEvent →（若 autoLink）add_link flowLink ×N）

   **轉換規則 — mixed（`es_add_command_for_event`）**：
   - 若 `information.length > 0`：push commandNote → push infoNote → events.push({ phase: 'pre-commit', action: 'add_note', payload: infoNote }) → 設 eventNote.commandId
   - 若 `information.length === 0`：push commandNote → 設 eventNote.commandId
   - 末尾 events.push({ phase: 'post-commit', action: 'add_note', payload: commandNote })、events.push({ phase: 'post-commit', action: 'update_note', payload: { id: eventNoteId, commandId: commandNoteId } })
   - **eventNote.commandId 必須在 push 後才設**（既有行為：commandNote 推入 board.notes 在 update event 之前）

   **轉換規則 — no-broadcast（`es_switch_context`）**：
   - 若 `projectState.boards` 不含 id：return `{ ok: false, error: { code: 'NOT_FOUND', message: \`Context \${id} not found.\` } }`（注意 ok=false 但既有行為是回 text，不拋例外 — adapter 把 error.message 轉成 text）
   - 否則設 `projectState.activeBoardId = id`、`projectState.updatedAt = ctx.now()`、return `{ ok: true, resultJson: \`Switched to context \${id}.\`, events: [] }`

3. **handlers.ts 內部小 helper**（從 index.ts 既有 `nextEventX` / `nextRemodelX` 改寫）：
   - 在 handlers.ts 內 declare `function nextEventX(board: Board): number` 與 `function nextRemodelX(board: Board): number`，邏輯與 index.ts 既有等價但取 board 從 ctx.projectState 推導
   - **不能直接 import index.ts 的 nextEventX**（因為它呼叫 `getActiveBoard()` 隱含全域）；改 board-explicit version

4. **保留 createBoard helper**：`es_create_context` / `es_add_actor_board` 用到。在 handlers.ts 內 re-declare 等價邏輯（既有 `createBoard` 簽名 `(name, parentContextId?) => Board`），不要 import index.ts 的版本（避免循環）

5. **38 個 handler 完整列表**（必須全部抽，缺一不可）：
   ```
   es_list_contexts, es_get_project, es_create_context, es_switch_context,
   es_rename_context, es_delete_context, es_set_board_name,
   es_get_board, es_clear_board,
   es_add_note, es_update_note, es_delete_note,
   es_add_command_for_event, es_update_command_information, es_update_event_properties,
   es_link_entity_to_event, es_link_entity_to_aggregate_root,
   es_add_flow,
   es_add_remodel, es_update_remodel, es_delete_remodel,
   es_set_event_paths, es_set_event_phase,
   es_add_flow_path, es_delete_flow_path,
   es_add_link, es_delete_link,
   es_add_entity_for_event,
   es_update_aggregate_identity, es_update_state_properties,
   es_add_invariant, es_update_invariant, es_delete_invariant, es_set_invariant_status,
   es_update_dto_fields,
   es_update_remodel_behavior, es_update_remodel_parameters, es_update_remodel_return_type
   ```

6. **失敗檢測規則 — 必須逐個 tool 對照原 source 的 early-return 行為**（不可統一化）：
   - **既有有 early-return 文案的 tool**：handler 改 `return { ok: false, error: { code, message: <逐字保留原 text> }, ... }`，message 與既有一字不差：
     - `not found` → code: 'NOT_FOUND'
     - `is not a {Type}` → code: 'INVALID_TYPE'
     - 其他守門條件（如 `Cannot delete the last context`、`Note has no invariants`、`Invariant ${id} not found on note ${noteId}`）→ code: 'PRECONDITION_FAILED'
   - **既有 permissive no-op tool**（不檢查 id 存在、靜默成功）：handler **不要新增** ok=false 檢測；維持既有行為，filter 掉不存在 id 後仍 saveProject + broadcast、回 success text。**這條最重要**：誤改會把 silent no-op 變成 user-facing error。
   - **per-tool 失敗語義對照表**（complete reference）：

     | Tool | 行為 |
     |------|------|
     | `es_delete_note` | **PERMISSIVE** — id 不存在時 filter 後陣列不變但仍 save + broadcast + 回 'Note deleted.' |
     | `es_delete_link` | **PERMISSIVE** — 同上 |
     | `es_delete_remodel` | **STRICT** — early-return 'Remodel ${id} not found.' |
     | `es_delete_flow_path` | **STRICT** — early-return 'FlowPath ${id} not found.' |
     | `es_delete_invariant` | **STRICT** — 三段檢查（note exists / is Aggregate / has invariants）+ post-filter 確認真的刪到（length 比對） |
     | `es_delete_context` | **STRICT** — 'Cannot delete the last context.' |
     | `es_switch_context` | **STRICT** — 'Context ${id} not found.' |
     | `es_update_note` / `es_update_command_information` / `es_update_event_properties` 等 | **STRICT** — 對應原碼 early-return |

     實作時逐 tool 對照 mcp-server/src/index.ts 既有 callback；若 callback 中沒有 early-return 給該錯誤條件，handler **不可** 自創 ok=false。

   - **handler 在 mutate 之前完成所有檢測**（保「ok=false 不留下 mutation」不變量）— 這條**只適用 STRICT tools**。PERMISSIVE tool 沒有 ok=false path，不適用此規則。

   - **partial-mutate tools**（特別注意）：
     - `es_add_flow`：multi-step 操作，若中間 step 出錯會留下部分 mutation。**spec A 不引入 transaction 行為**：保留既有「step N 出錯前面 N-1 已 push 並 broadcast」的 partial-success 行為。實際既有 callback 沒有 step 內失敗檢測（只 zod schema 驗整段 input），所以 handler 也維持「全部 happy path」的單一 ok=true 結果
     - `es_set_event_paths` / `es_set_event_phase`：批次套到多 noteId 列表，既有 callback 是「ID 不存在的 silent skip」— PERMISSIVE 對待 individual ids，整體仍 ok=true

### Step 2 — `mcp-server/src/coach/tools/toolDefinitions.ts` 新檔

1. 從 `mcp-server/src/index.ts` 既有 38 個 `server.tool(name, description, schema, callback)` 把前 3 個參數抽出，加上 `handler`（指向 handlers.ts 對應 function）+ `policy`（依 #4 廣播分類） + `risk: 'unset'`
2. 順序與 index.ts 中 register 順序完全一致（便於 audit / diff）
3. **`description` 字串完全等同既有**（不修字、不加字、不調格式）

### Step 3 — `mcp-server/src/coach/tools/mcpAdapter.ts` 新檔

1. `registerMcpTools(server, definitions, deps)` 對每個 def 呼 `server.tool(def.name, def.description, def.schema, callback)`
2. callback 流程依 `def.policy` 分支：

   ```
   await deps.loadProjectFromRelay();
   const result = def.handler(args, { projectState, now: () => new Date().toISOString() });
   if (!result.ok) {
     return { content: [{ type: 'text', text: result.error.message }] };
   }

   if (def.policy === 'read-only') {
     // 不 save / sync / broadcast。events.length 在 dev mode 應 assert === 0
     return { content: [{ type: 'text', text: textFromResult(result.resultJson) }] };
   }

   // 'standard' / 'pre-commit-only' / 'mixed' / 'no-broadcast' 分支：
   for (const e of result.events.filter(x => x.phase === 'pre-commit')) {
     await deps.broadcast(e.action, e.payload);
   }
   deps.saveProject();
   await deps.syncProjectToRelay();
   for (const e of result.events.filter(x => x.phase === 'post-commit')) {
     await deps.broadcast(e.action, e.payload);
   }
   return { content: [{ type: 'text', text: textFromResult(result.resultJson) }] };
   ```

3. **Dev-mode invariant assertion**（NODE_ENV !== 'production' 時）：
   - `def.policy === 'read-only'` 且 `result.events.length > 0` → `throw new Error('read-only handler emitted events')`
   - `def.policy === 'pre-commit-only'` 且 `result.events.some(e => e.phase === 'post-commit')` → throw
   - `def.policy === 'no-broadcast'` 且 `result.events.length > 0` → throw

4. `textFromResult`：型別 dispatch
   - `typeof resultJson === 'string'` → 直接 `return resultJson`
   - `resultJson === null || resultJson === undefined` → return `''`
   - 其他（object / array / number）→ `return JSON.stringify(resultJson, null, 2)`

5. **adapter 不該知道 risk metadata**（spec A：runtime 不讀 def.risk）

### Step 4 — 修改 `mcp-server/src/index.ts`：把 38 個 server.tool 換成一行 register

1. 在檔案頂部加：
   ```ts
   import { TOOL_DEFINITIONS } from './coach/tools/toolDefinitions.js';
   import { registerMcpTools } from './coach/tools/mcpAdapter.js';
   ```
2. 找到既有 38 個 `server.tool(...)` 註冊區塊（從第一個 `es_list_contexts` 到最後一個 `es_update_remodel_return_type`），**整段刪掉**
3. 在原位置插：
   ```ts
   registerMcpTools(server, TOOL_DEFINITIONS, {
     loadProjectFromRelay,
     saveProject,
     syncProjectToRelay,
     broadcast,
   });
   ```
4. **保留必要 helpers**：`saveProject` / `loadProjectFromRelay` / `syncProjectToRelay` / `broadcast` / `broadcastExcept` / `migrateProject` / `createBoard` 都仍被 index.ts 其他位置（Express routes / startup）使用，必須保留。

5. **刪除 orphan helpers**：抽走 38 個 tool 後，下列 helper 在 index.ts 中變成 dead code（沒有其他 caller）：
   - `getActiveBoard()`：只被 nextEventX / nextRemodelX / 38 個 tool callback 用 — 抽走 callback 後變孤立
   - `nextEventX()`：只被 `es_add_flow` callback 用
   - `nextRemodelX()`：只被 `es_add_remodel` callback 用

   這 3 個 helper 在 handlers.ts 內已 re-declare 等價邏輯。**從 index.ts 中刪除這 3 個 function definition** 避免雙份邏輯漂移。實作時用 grep 二次確認沒有遺漏 caller：
   ```bash
   grep -nE 'getActiveBoard\(|nextEventX\(|nextRemodelX\(' mcp-server/src/index.ts
   # 抽完 + 刪 helper 後應只剩 0 個 match
   ```

6. **保留決策**：`createBoard` 仍在 index.ts 啟動時用（projectState 初始化）+ `es_create_context` handler 用。**handlers.ts 內 import index.ts 的 createBoard 會循環**，所以 handlers.ts 也 re-declare 一份 — 這是接受的雙份邏輯（trade-off：避免 import 循環 vs. 微小 maintenance overhead）

### Step 5 — `mcp-server/src/coach/tools/__tests__/handlers.test.ts` 新檔

1. 引入 vitest + 38 個 handler
2. 每個 handler 至少 2 個 test：(a) happy path → 比對 resultJson + events、(b) 失敗 path → 比對 ok=false + error code
3. **測試需要 in-memory `Project` fixture（多 fixture 對應不同類別測試需求）**：

   ```ts
   // Empty fixture — for create / list / first-add 測試
   function buildEmptyProject(): Project { ... only 1 empty board ... }

   // Rich fixture — for update / delete / linking 測試。包含：
   //   - 2 boards（活的 + 第二個用於 cross-context 測試）
   //   - 第一個 board 有：
   //     - 1 Aggregate note（含 stateProperties + invariants[2 條]+ aggregateIdentity）
   //     - 1 Dto note（含 dtoFields）
   //     - 1 DomainEvent note（含 eventProperties + commandId reference + entityId reference）
   //     - 1 Command note（含 information）
   //     - 1 Information satellite note（informationForCommandId）
   //     - 1 Entity satellite note
   //     - 1 Policy note（含 policyTrigger + policyIssues）
   //     - 1 ReadModel note + 1 Remodel（含 parameters + returnType + linkedEventIds）
   //     - 2 FlowPath
   //     - 3 Links（covering note→note、note→remodel）
   function buildRichProject(): Project { ... }
   ```

   實作時 fixture 應能 cover 38 個 handler 的所有路徑（happy + ok=false）。每個 handler test 自行選 fixture 變體。
4. **三個特殊 case 必跑 golden test**：
   - `es_add_flow`：input 兩 step + autoLink=true → events 有 7 筆全 phase='pre-commit'（add_note ×2 + add_link cmdEvent + add_note ×2 + add_link cmdEvent + add_link flowLink，按既有順序）
   - `es_add_command_for_event`：input information.length>0 → events 有 3 筆：[pre-commit add_note infoNote, post-commit add_note commandNote, post-commit update_note eventNoteId]；按 phase 排序時 pre-commit 在前、post-commit 在後（順序鎖死）
   - `es_switch_context`：成功 → events=[] 且 resultJson=text；失敗（id 不存在）→ ok=false code='NOT_FOUND'
5. **read-only tools** (`es_list_contexts`, `es_get_project`, `es_get_board`)：projectState 不變、events=[]、resultJson 是 object（symmetric to 既有 `JSON.stringify` content）

### Step 6 — `mcp-server/src/coach/tools/__tests__/mcpAdapter.test.ts` 新檔

1. mock `deps`：
   ```ts
   const calls: string[] = [];
   const deps = {
     loadProjectFromRelay: async () => { calls.push('load'); },
     saveProject: () => { calls.push('save'); },
     syncProjectToRelay: async () => { calls.push('sync'); },
     broadcast: async (action: string) => { calls.push(`bcast:${action}`); },
   };
   ```
2. 用 mock McpServer（記錄 `server.tool(name, desc, schema, callback)` 呼叫）
3. 測試 4 種 policy 的 phase 順序：
   - **standard**：呼叫 callback → calls 應為 `['load', 'save', 'sync', 'bcast:xxx']`
   - **pre-commit-only**：events 全 pre → `['load', 'bcast:a', 'bcast:b', 'save', 'sync']`
   - **mixed**：1 pre + 2 post → `['load', 'bcast:pre', 'save', 'sync', 'bcast:post1', 'bcast:post2']`
   - **no-broadcast**：events=[] → `['load', 'save', 'sync']`
4. **error path**：handler 回 ok=false → adapter return text but does not call save / sync / broadcast → calls 應為 `['load']`（**驗證 ok=false 時無副作用**）

### Step 7 — TypeScript build 與 既有 vitest 確認等價

1. `cd mcp-server && npx tsc --noEmit`
2. `npx vitest run`（既有 router.test + sessionStore.test 應仍 pass）
3. 新加 handlers.test + mcpAdapter.test 全綠

---

## 失敗路徑

- **Handler 收到不存在 noteId**（如 `es_update_note` / `es_delete_note` 的 id 找不到）：handler return `{ ok: false, error: { code: 'NOT_FOUND', message: \`Note \${id} not found.\` }, ... }` → adapter return `{ content: [{ type: 'text', text: 'Note ${id} not found.' }] }`；**不呼叫 save / sync / broadcast**（既有行為亦如此）
- **Handler 收到 wrong type note**（如 `es_update_command_information` 拿到 DomainEvent id）：return ok=false code='INVALID_TYPE'，message 與既有等同（如 `Note ${id} is not a Command (type: DomainEvent).`）
- **`es_delete_context` 嘗試刪最後一個 context**：return ok=false code='PRECONDITION_FAILED'，message='Cannot delete the last context.'
- **`es_switch_context` 切到不存在 id**：return ok=false code='NOT_FOUND'，message=`Context ${id} not found.`
- **Adapter 流程中 broadcast throw**：既有 broadcast 內部已 catch（mcp-server/src/index.ts 既有 `broadcast` 在 relay mode `try { fetch } catch {}`），spec A 不變更此行為；若 saveProject throw（disk 滿）→ 例外往上拋給 MCP framework，既有 server.tool callback 也未 catch，spec A 維持

**不變量**：
- `ok: false` 時 events 必為空、resultJson 必為 null
- `ok: false` 時 adapter 不呼叫 save / sync / broadcast（**這是新引入的隱式契約，但等價於既有「失敗早退 return text」的行為**）

---

## 不改動的部分

- `mcp-server/src/index.ts` 的**保留 helpers**：`saveProject` / `loadProjectFromRelay` / `syncProjectToRelay` / `broadcast` / `broadcastExcept` / `migrateProject` / `createBoard`（仍被 Express routes / startup 使用）
- `mcp-server/src/index.ts` 的 Express route（GET/POST `/api/board` / `/api/events` / `/api/broadcast` / `/api/coach/*`）

**注意**：spec A **會刪除** index.ts 中 3 個 orphan helper（`getActiveBoard` / `nextEventX` / `nextRemodelX`，抽走 38 callbacks 後變 dead code，handlers.ts 內已 re-declare 等價邏輯）。這是 spec 範圍**內**的改動，不算「破壞不改動承諾」— 因為這 3 個 function 在 refactor 後沒有 caller。
- `mcp-server/src/index.ts` 的 SSE subscribers / startup / relay mode 邏輯
- `mcp-server/src/coach/router.ts` / `sessionStore.ts` / `snapshotBuilder.ts` / `llm/adapter.ts` / `llm/gemini.ts` / `prompts/system.ts` / 既有測試檔
- `mcp-server/data/coach/system_prompt.md`
- `mcp-server/data/project.json` schema
- 任何 `src/**` 前端檔案
- 38 個 tool 的 description 字串、schema、回傳 text 內容（spec A 全部 1:1 保留）

### Non-goals（行為層）

- 本 task **不**引入 Gemini function calling / tools / toolConfig
- 本 task **不**引入 Skill / Agent orchestrator / PendingActionStore / Action Card / audit log / inversePatch
- 本 task **不**讀 `risk` metadata（runtime 永遠不查此欄位）
- 本 task **不**改變任何 broadcast 時序（包含 `es_add_flow` 全 pre-commit、`es_add_command_for_event` mixed、`es_switch_context` 不廣播這 3 個既有特殊 pattern）
- 本 task **不**改變 38 個 tool 的 description / schema / args / 回傳格式
- 本 task **不**新增 / 刪除 / 重命名 任何 tool
- 本 task **不**改變 mcp-server 啟動順序 / port / Express route / SSE 機制
- 本 task **不**改變既有 `mcp-server/data/project.json` 的儲存格式或 migration 邏輯
- 本 task **不**動前端
- 本 task **不**改變 system prompt
- 本 task **不**改變既有 vitest 套件（只加新 test 檔，舊 test 全綠不動）

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別與 build
cd mcp-server && npx tsc --noEmit
cd ..
npx tsc -b
npm run build

# 2. 新檔存在
test -f mcp-server/src/coach/tools/handlers.ts
test -f mcp-server/src/coach/tools/toolDefinitions.ts
test -f mcp-server/src/coach/tools/mcpAdapter.ts
test -f mcp-server/src/coach/tools/__tests__/handlers.test.ts
test -f mcp-server/src/coach/tools/__tests__/mcpAdapter.test.ts

# 3. 關鍵 export 與型別
grep -q 'export interface ToolHandlerCtx' mcp-server/src/coach/tools/handlers.ts
grep -q 'export interface ToolHandlerResult' mcp-server/src/coach/tools/handlers.ts
grep -q "export type BroadcastPhase" mcp-server/src/coach/tools/handlers.ts
grep -q "'pre-commit'" mcp-server/src/coach/tools/handlers.ts
grep -q "'post-commit'" mcp-server/src/coach/tools/handlers.ts
grep -q 'export const TOOL_DEFINITIONS' mcp-server/src/coach/tools/toolDefinitions.ts
grep -q "export type CommitBroadcastPolicy" mcp-server/src/coach/tools/toolDefinitions.ts
grep -q "export type ToolRiskLevel" mcp-server/src/coach/tools/toolDefinitions.ts
grep -q 'export function registerMcpTools' mcp-server/src/coach/tools/mcpAdapter.ts

# 4. mcp-server/src/index.ts 不再有 server.tool 直接註冊（runtime 斷言由 toolDefinitions test cover）
! grep -qE 'server\.tool\(' mcp-server/src/index.ts
grep -q 'registerMcpTools(server, TOOL_DEFINITIONS' mcp-server/src/index.ts

# 5. 既有必須保留的 helpers 仍在 index.ts
grep -q 'function saveProject' mcp-server/src/index.ts
grep -q 'async function loadProjectFromRelay' mcp-server/src/index.ts
grep -q 'async function syncProjectToRelay' mcp-server/src/index.ts
grep -q 'async function broadcast' mcp-server/src/index.ts
grep -q 'function broadcastExcept' mcp-server/src/index.ts
grep -q 'function migrateProject' mcp-server/src/index.ts
grep -q 'function createBoard' mcp-server/src/index.ts

# 6. orphan helpers 已從 index.ts 刪除（getActiveBoard / nextEventX / nextRemodelX 只在 handlers.ts 出現）
! grep -qE '^function getActiveBoard|^function nextEventX|^function nextRemodelX' mcp-server/src/index.ts
grep -qE 'getActiveBoard|nextEventX|nextRemodelX' mcp-server/src/coach/tools/handlers.ts

# 7. handler pure 屬性：不直接呼叫 saveProject / syncProjectToRelay / broadcast / loadProjectFromRelay
! grep -q 'saveProject(' mcp-server/src/coach/tools/handlers.ts
! grep -q 'syncProjectToRelay(' mcp-server/src/coach/tools/handlers.ts
! grep -qE '\bbroadcast\(' mcp-server/src/coach/tools/handlers.ts
! grep -q 'loadProjectFromRelay(' mcp-server/src/coach/tools/handlers.ts

# 8. adapter 不讀 risk（spec A 純結構抽取）
! grep -qE '\.risk\b' mcp-server/src/coach/tools/mcpAdapter.ts

# 9. vitest 全綠（既有 + 新增）— runtime 斷言由 vitest 處理：
#    - TOOL_DEFINITIONS.length === 38
#    - new Set(TOOL_DEFINITIONS.map(d => d.name)).size === 38
#    - TOOL_DEFINITIONS.every(d => d.risk === 'unset')
#    - TOOL_DEFINITIONS.every(d => POLICY_VALUES.includes(d.policy))
#    - 每個 tool name 必須出現在預期 38 名單（用 import + Set 對比 expected 38 names）
#    - 'read-only' policy 的 3 個 tool 名單對：[es_list_contexts, es_get_project, es_get_board]
#    - 'pre-commit-only' 名單：[es_add_flow]
#    - 'mixed' 名單：[es_add_command_for_event]
#    - 'no-broadcast' 名單：[es_switch_context]
cd mcp-server && npx vitest run --reporter=default
```

**新增驗收 test：`mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts`**

```ts
// 此 test file 必含以下 assertion（取代原 spec 的 grep -c 計數）：
import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS } from '../toolDefinitions';

const EXPECTED_NAMES = [
  'es_list_contexts', 'es_get_project', 'es_get_board',
  'es_create_context', 'es_switch_context', 'es_rename_context', 'es_delete_context', 'es_set_board_name', 'es_clear_board',
  'es_add_note', 'es_update_note', 'es_delete_note',
  'es_add_command_for_event', 'es_update_command_information', 'es_update_event_properties',
  'es_link_entity_to_event', 'es_link_entity_to_aggregate_root',
  'es_add_flow',
  'es_add_remodel', 'es_update_remodel', 'es_delete_remodel',
  'es_set_event_paths', 'es_set_event_phase',
  'es_add_flow_path', 'es_delete_flow_path',
  'es_add_link', 'es_delete_link',
  'es_add_entity_for_event',
  'es_update_aggregate_identity', 'es_update_state_properties',
  'es_add_invariant', 'es_update_invariant', 'es_delete_invariant', 'es_set_invariant_status',
  'es_update_dto_fields',
  'es_update_remodel_behavior', 'es_update_remodel_parameters', 'es_update_remodel_return_type',
] as const;

describe('TOOL_DEFINITIONS registry', () => {
  it('包含恰好 38 個 tool', () => {
    expect(TOOL_DEFINITIONS.length).toBe(38);
  });
  it('tool name unique', () => {
    expect(new Set(TOOL_DEFINITIONS.map(d => d.name)).size).toBe(38);
  });
  it('tool name 與預期 38 名單完全對應', () => {
    expect(new Set(TOOL_DEFINITIONS.map(d => d.name))).toEqual(new Set(EXPECTED_NAMES));
  });
  it('spec A 階段所有 risk 為 unset', () => {
    expect(TOOL_DEFINITIONS.every(d => d.risk === 'unset')).toBe(true);
  });
  it('policy 值在合法 enum 範圍', () => {
    const valid = ['read-only', 'standard', 'pre-commit-only', 'mixed', 'no-broadcast'];
    expect(TOOL_DEFINITIONS.every(d => valid.includes(d.policy))).toBe(true);
  });
  it("'read-only' policy 對應 3 個 read tool", () => {
    expect(new Set(TOOL_DEFINITIONS.filter(d => d.policy === 'read-only').map(d => d.name)))
      .toEqual(new Set(['es_list_contexts', 'es_get_project', 'es_get_board']));
  });
  it("'pre-commit-only' 唯一 es_add_flow", () => {
    expect(TOOL_DEFINITIONS.filter(d => d.policy === 'pre-commit-only').map(d => d.name))
      .toEqual(['es_add_flow']);
  });
  it("'mixed' 唯一 es_add_command_for_event", () => {
    expect(TOOL_DEFINITIONS.filter(d => d.policy === 'mixed').map(d => d.name))
      .toEqual(['es_add_command_for_event']);
  });
  it("'no-broadcast' 唯一 es_switch_context", () => {
    expect(TOOL_DEFINITIONS.filter(d => d.policy === 'no-broadcast').map(d => d.name))
      .toEqual(['es_switch_context']);
  });
  it("'standard' policy 共 32 個", () => {
    expect(TOOL_DEFINITIONS.filter(d => d.policy === 'standard').length).toBe(32);
  });
});
```

### Human 補做（需要人類介入）

- [ ] 啟動 mcp-server（`cd mcp-server && GEMINI_API_KEY=xxx npm run dev`），開瀏覽器到 frontend，**用 UI 跑 5 個典型 MCP 流程**對比 spec A 前後行為等價：
  1. 透過 Claude Code 呼叫 `es_add_note` → 畫布上立即出現 sticky note（SSE 即時 broadcast）
  2. 呼叫 `es_add_flow` 兩 step + autoLink=true → 畫布同時出現 2 對 command/event + 1 條 flow link，**順序與既有等同**
  3. 呼叫 `es_add_command_for_event`（帶 information）→ 畫布上 info note 先出現、再出現 command + event commandId 更新（**這是 mixed policy 的視覺化驗證**）
  4. 呼叫 `es_switch_context` → 後端 active board 切換、**FE active tab 不變**（既有 server-local 行為）
  5. 呼叫 `es_delete_note`（id 不存在）→ 回 `Note xxx not found.` 文字（不 crash）
- [ ] 跨 tab cross-tab board sync 仍正常：tab A 加 note → tab B 透過 SSE 立即看到（驗 broadcastExcept 仍對）
- [ ] DevTools console 全程無錯誤
- [ ] `mcp-server/data/coach/audit/` 目錄 / `audit.jsonl` 不存在（spec A 不引入 audit log，spec B 才加）
- [ ] `mcp-server/src/coach/agent/` 目錄不存在（spec B 才加）
- [ ] 既有 Coach P1 對話功能仍正常：發訊息給 Coach、收到回覆、跨 tab session 共用、model picker 切換生效

---

## 已知限制

- **Spec A 是 spec B 的前置**：未實作 spec B 之前，spec A 純粹 refactor 不帶來新使用者價值；但提供：(a) handlers 可 unit test、(b) toolDefinitions 為 spec B 的 Skill registry / Gemini function calling declarations 提供 single source of truth、(c) adapter 把 mutation pipeline 統一，spec B 才能加 audit / inversePatch / hash CAS hooks
- **risk 欄位 spec A 不讀**：spec A 的 toolDefinitions 中所有 38 個 entry 的 `risk: 'unset'`；spec B 才會把它改成具體值（read / additive / mutate / destructive）。Spec A 不檢查 risk 是否 'unset'（只在 grep 驗收用），spec B 啟動時會驗證 risk 都已被填
- **handlers.ts 內部 helpers 與 index.ts 等價但不共享**：`nextEventX` / `nextRemodelX` / `createBoard` 在 handlers.ts 內 re-declare，邏輯與 index.ts 等價。將來若有變更兩處都要改 — 接受此小重複避免 import 循環
- **Read-only tools 仍走 saveProject / syncProjectToRelay**：既有 `es_list_contexts` / `es_get_project` / `es_get_board` 不 mutate projectState 但仍呼叫 save / sync。Spec A **保留此既有行為**（即使略浪費磁碟 IO）；spec B 才考慮優化
- **textFromResult 對 `null` 回 `''`**：既有 server.tool callback 沒有 null resultJson 的 case，但 handlers.ts 為防呆加此處理；spec A 38 個 handler 永遠不回 null resultJson（在 happy path 都回 string 或 object）
- **依賴關係**：無前置 task。`@modelcontextprotocol/sdk` / `zod` / vitest 已是 mcp-server 既有依賴，無需新增
- **與 spec B 的 superseding 關係**：spec A 完成後 spec B 將擴 `ToolDefinition.risk` / `LLMReply` / 加入 audit / pendingActions。Spec B 不會破壞 spec A，只擴充
