# Coach Agent — Spec B：Agent + Skill + Action Card MVP-mid

## 來源

- 討論：`docs/discussions/2026-05-07-coach-agent-and-skill-architecture.md`（Round 1+2+3，consensus，含 D1-D24 + N1-N16）
- 前置 spec（已 ship）：`docs/tasks/2026-05-07-coach-agent-spec-a-handler-refactor.md`（38 個 tool handler 抽出 + `TOOL_DEFINITIONS` registry，所有 `risk='unset'` placeholder）

本 spec 為 **Spec B**（MVP-mid 範圍），把 P1 唯讀 Coach 升級為 Gemini function calling agent + 前端 Action Card 確認 UI。**範圍嚴格限制在 read-only 3 tools auto-exec + additive 9 tools propose-confirm**（共暴露 12 個 — audit HIGH-4 把 `es_link_entity_to_aggregate_root` 從 additive 重分類至 mutate）；mutate / destructive / inversePatch / UI undo / batch-replace current-state injection 全推 Spec C。

---

## 目標

讓使用者能用自然語言請 Coach 動畫布（例：「請幫我建一個 OrderPlaced event 並關聯到 Order aggregate」），Coach 用 Gemini function calling 提出 1-N 個建議卡片（Action Card），使用者明確點 [套用] 或 [拒絕] 後才寫入 board。架構上提供 5 個關鍵能力：(1) Skill 包裝 Spec A 純 handlers 給 LLM 呼叫（不走 MCP transport）、(2) Orchestrator 控制 read-only auto-exec / mutating require-confirm 的 loop、(3) Pending Action Store + 4 個 confirm/reject endpoints、(4) Action Card UI（inline + sticky pending tray）、(5) Lightweight audit log 留 dogfood trace。**整套維持 propose-confirm 不可繞過**，destructive / mutate 推 Spec C 才開放。

---

## 介面合約（Interface Contract）

### 1. `mcp-server/src/coach/tools/toolDefinitions.ts`（修改）— `risk` 欄位實質化

Spec A 把所有 38 個 `TOOL_DEFINITIONS[].risk` 設為 `'unset'`。Spec B 對 27 個目標 tool 填入具體 `ToolRiskLevel`，剩 11 個維持 `'unset'`：

| Risk | Tool 名單（共 27 分類完整、Spec B 暴露 12 個 = read 3 + additive 9） |
|---|---|
| `'read'` (3) | `es_get_project`、`es_list_contexts`、`es_get_board` |
| `'additive'` (9) | `es_create_context`、`es_add_note`、`es_add_command_for_event`、`es_add_entity_for_event`、`es_add_flow`、`es_add_remodel`、`es_add_invariant`、`es_add_link`、`es_add_flow_path` |
| `'mutate'` (14)（Spec C 用） | `es_update_note`、`es_update_command_information`、`es_update_event_properties`、`es_link_entity_to_event`、`es_link_entity_to_aggregate_root`（**含 unlink 語義不適 additive 範疇 — audit HIGH-4**）、`es_update_aggregate_identity`、`es_update_state_properties`、`es_update_invariant`、`es_set_invariant_status`、`es_update_dto_fields`、`es_update_remodel`、`es_update_remodel_behavior`、`es_update_remodel_parameters`、`es_update_remodel_return_type` |
| `'destructive'` (1)（Spec C 用） | `es_delete_link` |
| `'unset'`（剩 11） | `es_switch_context`、`es_set_board_name`、`es_rename_context`、`es_delete_context`、`es_clear_board`、`es_set_event_paths`、`es_set_event_phase`、`es_delete_note`、`es_delete_remodel`、`es_delete_invariant`、`es_delete_flow_path` |

**所有權**：`TOOL_DEFINITIONS` 仍是 single source of truth（與 Spec A 既有契約一致）；Spec B 只填欄位，不改 schema/handler/policy。

### 2. `mcp-server/src/coach/tools/handlers.ts`（修改）— 補 step 0 handler validation（D18）

對應 Spec A `handle_es_add_link` 與 `handle_es_link_entity_to_aggregate_root` 兩個 handler 補 server-side 驗證（N13、N14）：

```ts
// es_add_link：驗 fromId / toId 對應的 note / remodel 真實存在；type 對應正確
// 失敗回 ok:false code:'NOT_FOUND' | 'INVALID_TYPE'，message 規格如下：
//   'Source note ${fromId} not found.'              （fromType='note' 時）
//   'Source remodel ${fromId} not found.'           （fromType='remodel' 時）
//   'Target note ${toId} not found.'                （toType='note' 時）
//   'Target remodel ${toId} not found.'             （toType='remodel' 時）

// es_link_entity_to_aggregate_root：當 aggregateRootNoteId 非空字串時，驗 target note 存在 + type === 'Aggregate'
// 失敗回：
//   'Aggregate note ${aggregateRootNoteId} not found.'      → 'NOT_FOUND'
//   'Note ${aggregateRootNoteId} is not an Aggregate (type: ${actual}).' → 'INVALID_TYPE'
// 空字串（unlink）行為不變
```

**所有權**：handler 內部驗證；adapter（Spec A `mcpAdapter.ts`）流程不變。

### 3. `mcp-server/src/coach/llm/adapter.ts`（修改）— `LLMReply` 擴充（D15）

```ts
export interface LLMReply {
  content: string;
  modelUsed: string;
  tokenUsage: { input: number; output: number };
  // Spec B 新增：
  functionCalls?: FunctionCallRequest[];   // LLM 此輪要求呼叫的 tools（read 自動執行；additive 進 pending）
  isFinished: boolean;                     // false = LLM 仍想繼續（auto-exec read 後再 chat）；true = 終止 loop
}

export interface FunctionCallRequest {
  /** Gemini SDK 提供的原生 functionCall id（用於配對 functionResponse）。 */
  id: string;
  name: string;        // tool name（必須在 EventStormingSkill.declarations 範圍內）
  args: Record<string, unknown>;   // Gemini 已 parse 的 args（型別由 zod schema 在 skill.execute 時再驗）
}

// chat opts 新增：
chat(opts: {
  systemPrompt: string;
  messages: LLMAdapterMessage[];
  signal?: AbortSignal;
  model?: string;
  // Spec B 新增：
  tools?: ToolDeclaration[];          // EventStormingSkill.buildDeclarations() 產出
  toolConfig?: ToolConfig;            // Gemini AUTO mode；caller 預設 AUTO
  /**
   * Pending action 上一輪的結果。orchestrator 在 user 下次發訊息前注入 functionResponse messages，
   * 對應每個已 confirmed/rejected/failed/stale 的 actionId。**注入用 'tool' role / functionResponse 形式**
   * （D2 + D17(a)），不可用 user-role context block。
   */
  toolResponses?: ToolResponseMessage[];
}): Promise<LLMReply>;

export interface ToolDeclaration {
  // Gemini SDK FunctionDeclaration 形狀；由 zod-to-json-schema 從 TOOL_DEFINITIONS[].schema 產生
  name: string;
  description: string;
  parameters: object;  // JSON Schema (OpenAPI subset)
}

export interface ToolResponseMessage {
  /** 對應 LLM 上一輪的 functionCall.id；synthetic id 用 'pending-${actionId}' / 'rejected-${actionId}' 等 namespace（N8）。 */
  toolCallId: string;
  toolName: string;
  /** 強型別 schema (N9)。status='pending' 是 server 故意給 LLM 的「等使用者確認」訊號，不是 error。 */
  response: ToolResponseEnvelope;
}

export type ToolResponseEnvelope =
  | { status: 'pending'; uiContext: 'Requires user click Apply'; actionId: string }
  | { status: 'confirmed'; actionId: string; resultJson: unknown }
  | { status: 'rejected'; actionId: string; reason: string | null }
  | { status: 'stale'; actionId: string; reason: 'TargetEntityHash mismatch' }
  | { status: 'failed'; actionId: string; errorEnvelope: ErrorEnvelope }
  | { status: 'auto_exec_result'; resultJson: unknown };

export interface ErrorEnvelope {
  code: 'NOT_FOUND' | 'INVALID_TYPE' | 'PRECONDITION_FAILED' | 'GEMINI_INVALID_ARGS' | 'TOOL_THREW' | 'STALE' | 'INTENT_GATE_BLOCKED';
  message: string;
  detail?: Record<string, unknown>;
}
```

**Framework 備註**：Gemini SDK (`@google/genai`) 用 `Content.role: 'user' | 'model' | 'function'`；`functionCall` 在 model parts、`functionResponse` 在 function parts。`GeminiAdapter` 必須 map `'tool' role` → `'function'` part type。

### 4. `mcp-server/src/types/coach.ts`（修改）— `ProposedAction` 擴充（D21）

```ts
export interface ProposedAction {
  id: string;                       // server 端產生的 actionId（uuid）
  toolName: string;
  args: Record<string, unknown>;
  /**
   * 對應 Gemini SDK 此次 propose 時的 functionCall.id（pairing — audit HIGH-2）。
   * 下一輪 orchestrator 注入 functionResponse 時必須用此 id 對應；synthetic 來源
   * （e.g. user 直接 reload）的 ProposedAction 用 'synthetic-${actionId}' namespace。
   */
  toolCallId: string;
  // Spec B 新增（D21）：
  targetIds: string[];              // 此 action 觸碰的既有 note/remodel id（純新增 tool 為空 array）
  subjectLabel: string;             // 給 sticky tray 顯示，例：「OrderPlaced (DomainEvent)」
  humanSummary: string;             // 自然語言摘要，例：「在 board-A 加 DomainEvent 'OrderPlaced'」
  rationale: string;                // LLM 提此 action 的理由（從 LLM message text 中 best-effort 抽取或空字串）
  // Spec B 新增 lifecycle 欄位：
  status: ProposedActionStatus;
  baseHash: string;                 // propose 時 ctx.projectState 的 TargetEntityHash（targetIds 為空時 = ''）
  baseProjectVersion: string;       // propose 時 projectState.updatedAt（粗粒度 fingerprint，輔助 debug）
  createdAt: string;
  /** 走完 lifecycle 後的 timestamp，例：confirmed/rejected/failed 完成時間。 */
  finalizedAt: string | null;
  /** Reject 時 user 填的選填 reason（A2/D17(a)）；可為空字串。 */
  rejectReason: string | null;
  /** Stale 後 user force-apply 時記錄；server 仍會做 reverify（D24）。 */
  forceApply: boolean;
  /** 失敗時記錄；對應 ErrorEnvelope。 */
  errorEnvelope: ErrorEnvelope | null;
}

/**
 * D20 — formal transition table（**寫進 spec 是契約，不只是實作細節**）：
 *   pending    → confirming（user click Apply）
 *   pending    → rejected  （user click Reject）
 *   confirming → confirmed | failed | stale（server 完成）
 *   stale      → confirming（user click Force-apply 後）
 *   stale      → rejected  （user click Reject）
 * 不允許的轉移（runtime 必須拒絕）：
 *   confirmed/rejected/failed/stale → confirming（lifecycle 已終結）
 *   pending → confirmed/failed/stale（必須經 confirming 中介）
 *   confirming → pending（不可逆）
 *   Apply All 中段 fail：失敗 card 變 'failed'；後續 cards 留 'pending'（不自動跳 'failed'）
 */
export type ProposedActionStatus =
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'rejected'
  | 'stale'
  | 'failed';
```

**所有權**：`src/types/coach.ts` 仍是 FE/BE 共用 single source；`mcp-server/src/coach/types.ts` 鏡像必須同步更新（per Spec A 既有 pattern）。

### 5. `mcp-server/src/coach/skills/eventStormingSkill.ts`（新檔）— Skill registry

```ts
export interface Skill {
  name: string;
  buildDeclarations(): ToolDeclaration[];
  /** 執行單個 tool；read-only 直接走；mutating 由 orchestrator 包成 pending。 */
  execute(toolName: string, args: unknown, ctx: ToolHandlerCtx): ToolHandlerResult;
}

export class EventStormingSkill implements Skill {
  readonly name = 'event-storming';
  /** 啟動時 cache 一次（G1 用 zod-to-json-schema）；只 export risk in ['read','additive'] 共 12 個（read 3 + additive 9 — audit HIGH-4 修正後）。 */
  buildDeclarations(): ToolDeclaration[];
  execute(toolName: string, args: unknown, ctx: ToolHandlerCtx): ToolHandlerResult;
  /** 對應 D21：propose 時計算 targetIds + subjectLabel + humanSummary。 */
  describeProposal(toolName: string, args: unknown, ctx: ToolHandlerCtx): {
    targetIds: string[];
    subjectLabel: string;
    humanSummary: string;
  };
}
```

**所有權**：`Skill.execute()` 直接呼叫 `TOOL_DEFINITIONS[name].handler(args, ctx)` — 不走 MCP transport，但 caller（pendingActions / orchestrator）拿到 `ToolHandlerResult` 後必須呼 `commitHandlerResult` helper（§8 末段）做 save/sync/broadcast 收尾。Skill 本身不 commit。`describeProposal` 是 Spec B 新增的純函數，**不重複 handler 邏輯**（不會 mutate projectState）。

**`describeProposal` targetIds 計算規則（修正 audit HIGH-3 — `es_add_link` 與 `aggregateRootNoteId` 漏網）**：

| Tool | targetIds 計算 |
|---|---|
| `es_add_command_for_event` | `[args.eventNoteId]` |
| `es_add_entity_for_event` | `[args.eventNoteId]` |
| `es_add_invariant` | `[args.noteId]` |
| `es_add_link` | `args.fromType === 'note' && args.toType === 'note' ? [args.fromId, args.toId] : args.fromType === 'note' ? [args.fromId] : args.toType === 'note' ? [args.toId] : []`（remodel 端不算 carrier，因 remodel hash 計算邊界另案） |
| 其他 5 個純新增（add_note / add_flow / add_remodel / add_flow_path / create_context）| `[]` |

> **`es_link_entity_to_aggregate_root` 不在此表**（已 reclassify 為 `mutate`，HIGH-4），Spec B 不暴露。

### 6. `mcp-server/src/coach/agent/intentGate.ts`（新檔，D23）— Intent gate + proposal budget

```ts
export interface IntentGateResult {
  allowMutating: boolean;
  reason?: 'no_mutation_intent_in_user_turn' | 'budget_exceeded';
}

/**
 * 判斷使用者本輪訊息是否含明確 mutation intent。
 * 規則（rule-based，可在後續 dogfood 調權重）：
 *   - 中文 keyword：建/加/新增/做/連/補/做出/建立/請/幫我/麻煩/補上/畫出/接到/串起 → match
 *   - 英文 keyword（case-insensitive）：add / create / link / build / make / connect / append → match
 *   - 對話訊號（即使有 keyword 也駁回）：訊息結尾為「？」或「嗎」且字數 < 10 → 視為純問句，回 false
 * 任何 read-only tool call 不受此限制。
 * **此規則由 `intentGate.ts` 為 single source of truth**；orchestrator 與 audit log 都從這裡取，
 * 不得在 spec body 各段重述差異版本（防 Step 1.6 vs §6 漂移 — audit MED-3 矯正）。
 */
export function detectMutationIntent(userTurnText: string): boolean;

export function checkProposalBudget(
  countAlreadyProposed: number,
  perTurnLimit: number,
): IntentGateResult;

/** Spec B 預設：perTurnLimit = 2（D23）；超過後 LLM 額外的 mutating call 一律 synthetic-rejected。 */
export const DEFAULT_PROPOSAL_BUDGET_PER_TURN = 2;
```

### 7. `mcp-server/src/coach/agent/orchestrator.ts`（新檔）— Agent loop

```ts
export interface AgentTurnInput {
  sessionId: string;
  userId: string;
  userMessage: string;
  attachSnapshot: boolean;
  boardSnapshot: BoardSnapshot | null;
  modelOverride?: string;
}

export interface AgentTurnResult {
  assistantMessage: CoachMessage;   // 含 metadata.proposedActions
  newPendingActions: ProposedAction[];
}

export interface OrchestratorDeps {
  llm: LLMAdapter;
  skill: EventStormingSkill;
  pendingStore: PendingActionStore;
  auditLog: AuditLog;
  sessionStore: CoachSessionStore;
  loadProject: () => Project;             // BE-local projectState getter
  reloadProject: () => Promise<void>;     // mcp-server loadProjectFromRelay 包裝
}

/**
 * runAgentTurn loop（D17(c) 強制中斷規則）：
 *   1. 注入上輪 ToolResponseMessage（從 pendingStore 抓）+ system prompt + new userMessage
 *   2. llm.chat({ tools, toolConfig: AUTO, toolResponses })
 *   3. 對每個 functionCall 分桶：
 *      a. risk='read' → skill.execute() 立即跑、result 進 toolResponses 下一個 chat call、繼續 loop
 *         （受 maxReadCalls=3 + dedup guard 限制 — D3）
 *      b. risk='additive' → intentGate 檢查（detectMutationIntent + budget）→
 *         pass: 寫進 pendingStore 變 'pending'、auditLog propose 事件
 *         fail: 不寫 pending，只 audit 'intent_gate_blocked'，不擾亂後續 loop
 *      c. risk='mutate'/'destructive'/'unset'：永遠拒絕（synthetic rejection 給 LLM）—
 *         Spec B 不處理；Spec C 啟用
 *   4. **任何 mutating proposal 進 pending 後立即終止 loop**（D17(c)），return
 *   5. 否則重複 1-3，maxSteps=6 總上限保護
 */
export async function runAgentTurn(
  input: AgentTurnInput,
  deps: OrchestratorDeps,
): Promise<AgentTurnResult>;
```

**所有權**：orchestrator 是 confirm/propose 流程的唯一控制點；FE 不直接呼叫 skill / handler。

### 8. `mcp-server/src/coach/agent/pendingActions.ts`（新檔）— Pending action store

```ts
export interface PendingActionStore {
  /** 同 session 寫入；async-mutex 保護整段 critical section（D22）。 */
  propose(sessionId: string, action: ProposedAction): Promise<void>;
  /** confirm transaction：lock → CAS reverify → handler exec → audit append → status transition → SSE emit（D22） */
  confirm(sessionId: string, actionId: string, opts: ConfirmOpts): Promise<ConfirmResult>;
  reject(sessionId: string, actionId: string, reason: string | null): Promise<void>;
  /** Apply All：sequential、依賴鏈 rebase、fail-stop（D8 + D13）。 */
  confirmBatch(sessionId: string, actionIds: string[], opts: ConfirmBatchOpts): Promise<ConfirmBatchResult>;
  listPending(sessionId: string): Promise<ProposedAction[]>;
  getAction(sessionId: string, actionId: string): Promise<ProposedAction | null>;
  /** SSE 廣播給同 session 全部 listeners；payload = { sessionId, actionId, status, ...delta } */
  subscribe(sessionId: string, listener: ActionUpdateListener): Unsubscribe;
}

export interface ConfirmOpts {
  forceApply: boolean;        // user 在 stale 後選 force（D24）；server 仍 reverify
  userId: string;
}

export interface ConfirmResult {
  status: 'confirmed' | 'stale' | 'failed';
  finalAction: ProposedAction;
  errorEnvelope?: ErrorEnvelope;
}

export interface ConfirmBatchResult {
  /** 走完的 cards（按 input 順序） — 第 1 個 fail 後其餘留 'pending'（D20）。 */
  results: Array<{ actionId: string; status: 'confirmed' | 'stale' | 'failed'; errorEnvelope?: ErrorEnvelope }>;
  stoppedAt?: string;          // 第一個 fail 的 actionId
}

/**
 * TargetEntityHash 計算（B1 範圍：4 個 additive tool 觸碰既有 entity）：
 *   targetIds=[]              → ''（空 hash，confirm 不檢查）
 *   targetIds=['evt-1']       → sha256(JSON.stringify(stableSubset(note='evt-1'))).slice(0, 16)
 * stableSubset 取 entity 的關鍵欄位（type, label, commandId, entityId, eventProperties, dtoFields, invariants 等），
 * 排除 position/zIndex/updatedAt 等視覺/時序欄位（避免拖動就誤判 stale）。
 */
export function computeTargetEntityHash(projectState: Project, targetIds: string[]): string;
```

**所有權**：`PendingActionStore` 是 FS-backed，per-session 單獨檔案 `mcp-server/data/coach/pending/<sessionId>.json`（保 P1 sessionStore 同 pattern）；async-mutex 套用到整個 confirm transaction（D22）。

### 8a. `mcp-server/src/coach/tools/mcpAdapter.ts`（**修改** — audit HIGH-1）— 抽出 `commitHandlerResult` helper

Spec A `mcpAdapter.ts` 的 commit pipeline（pre-commit broadcast → save → sync → post-commit broadcast）原本只在 `registerMcpTools` 內部使用。Spec B 要把它抽成可共用的 export，讓 `pendingActions.confirm` 也能呼叫**同一份**邏輯：

```ts
// Spec B 新增 export（既有 registerMcpTools 改成內部呼此）：
export interface CommitDeps {
  saveProject: () => void;
  syncProjectToRelay: () => Promise<void>;
  broadcast: (action: string, payload: unknown, excludeId?: string) => Promise<void>;
}

export async function commitHandlerResult(
  result: ToolHandlerResult,
  policy: CommitBroadcastPolicy,
  deps: CommitDeps,
): Promise<void>;
```

**契約**：
1. caller 確認 `result.ok === true` 才能呼叫（ok=false 由 caller 自己處理 error envelope）
2. dev-mode invariant assertion 維持 Spec A 既有行為（read-only emit events → throw 等）
3. policy === 'read-only' → 直接 return，不 save/sync/broadcast
4. 其他 policy → 依 BroadcastEvent.phase 執行 pre-commit broadcasts → saveProject → syncProjectToRelay → post-commit broadcasts

**為何抽出**：Spec A `registerMcpTools` 的 callback 與 Spec B `pendingActions.confirm` **不能各自實作 commit pipeline**，否則 broadcast phase ordering 會分叉（例如 `es_add_command_for_event` 的 mixed pre+post 時序可能在 confirm path 走錯）。Spec B 階段抽出此 helper 等於把 commit 邏輯收斂為 single source of truth。

**Spec A 既有行為不破**：`registerMcpTools` 改寫成「`const result = handler(args, ctx); if (!result.ok) {...}; await commitHandlerResult(result, def.policy, deps);`」；既有 mcpAdapter.test.ts（11 tests）期待行為不變，必須仍然全綠。

### 9. `mcp-server/src/coach/audit/auditLog.ts`（新檔）— Audit log v1（D19）

```ts
export interface AuditLogEntry {
  schemaVersion: 1;                    // Spec C 升 v2 加 inversePatch / inversePatchVersion
  toolVersion: string;                 // 來自 package.json version；schema migration 信號
  eventType: 'propose' | 'confirm' | 'reject' | 'auto_exec_read' | 'intent_gate_blocked' | 'force_apply' | 'failed';
  timestamp: string;                   // ISO8601
  sessionId: string;
  messageId: string | null;            // 對應 assistant message id；auto_exec_read 為 null
  actionId: string | null;             // intent_gate_blocked / auto_exec_read 為 null
  toolName: string;
  args: Record<string, unknown>;       // 原始 LLM args（含 hallucinate 過的）
  status: ProposedActionStatus | 'auto_exec' | 'gate_blocked';
  baseHash: string;                    // propose 時的 TargetEntityHash；confirm/stale 比對用
  baseProjectVersion: string;          // propose 時的 projectState.updatedAt
  forceApply: boolean | null;          // confirm 時記
  errorEnvelope: ErrorEnvelope | null; // failed/stale 時記
  resultJson: unknown | null;          // confirm 成功時記 handler return（debug 友善）
}

/** 寫入 mcp-server/data/coach/audit/audit-YYYY-MM-DD.jsonl；append-only；每次寫前 check date 切檔。 */
export interface AuditLog {
  append(entry: AuditLogEntry): Promise<void>;
}

export function createAuditLog(opts: { dataDir: string }): AuditLog;
```

**所有權**：`AuditLog.append` 用 `async-mutex` 序列化（D16）；不做 gzip / 30 天輪轉（推 Spec C，記入「已知限制」）。

### 10. `mcp-server/src/coach/router.ts`（修改）— 4 個新 endpoints + POST /message 改走 orchestrator

```
POST /api/coach/message                       — 既有；body 不變但內部改呼叫 orchestrator.runAgentTurn
POST /api/coach/actions/:actionId/confirm     — body: { sessionId, forceApply: boolean }；回 ConfirmResult
POST /api/coach/actions/confirm-batch         — body: { sessionId, actionIds: string[] }；回 ConfirmBatchResult
POST /api/coach/actions/:actionId/reject      — body: { sessionId, reason: string | null }；回 { ok: true }
GET  /api/coach/sessions/:sessionId/pending   — 回 ProposedAction[]（reload / cold-load 用）
```

**Auth**：所有 endpoint 沿用 P1 既有 `X-Coach-User-Id` header（N4 警語：不是真 auth，文件須註明）。

### 11. SSE 廣播 — `coach_action_update` 事件（B4 + N7）

既有 SSE 通道（`/api/events`）擴 1 個 action：

```
data: { "action": "coach_action_update", "payload": {
  "sessionId": "<sid>",
  "actionId": "<aid>",
  "status": "pending" | "confirming" | "confirmed" | "rejected" | "stale" | "failed",
  "delta": { "errorEnvelope"?, "finalizedAt"?, "forceApply"? }
} }
```

**SSE 規則**：
- 廣播給該 session 對應 user 的所有 SSE listeners（重用 P1 sessionStore 的 user 對應，不需新權限模型）
- FE 收到後對 `coachStore.messages[].metadata.proposedActions` 找對應 actionId 更新 status
- SSE 為通知用，**reload / reconnect / 漏訊息時靠 `GET /pending` 對帳**（N7）

### 12. `src/components/Coach/ActionCard.tsx`（新檔）— Action Card 元件

**Props**:

```tsx
interface ActionCardProps {
  action: ProposedAction;        // status 由此驅動所有視覺
  onApply: () => Promise<void>;  // 觸發 POST /confirm
  onReject: (reason: string | null) => Promise<void>;
  onForceApply: () => Promise<void>;
}
```

**渲染分支**（依 D20 transition table）：
- `pending` → 完整高度（~120px）；showsApplyAndRejectButtons + collapsible raw args；rationale 引文（若非空）
- `confirming` → 灰色 + spinner（buttons disabled）
- `confirmed` → 綠色摘要列（~32px）：「已套用 at HH:MM — `subjectLabel`」
- `rejected` → 灰色摘要列：「已拒絕（{reason || '無'}）at HH:MM」
- `stale` → 黃色完整高度 + 警告 banner「畫布已變動，仍要套用？」buttons：[仍要套用] [拒絕]
- `failed` → 紅色完整高度 + errorEnvelope.message + Reject only

**Reject UX**（A2）：點 [拒絕] inline 展開 textarea「為什麼拒絕？(可選)」 + 確認按鈕；submit 後呼叫 onReject(reason)。空字串視為「沒填」也送出。

### 13. `src/components/Coach/PendingTray.tsx`（新檔）— Sticky pending tray

當 `pendingActions` selector 含 ≥3 個 `pending` 狀態時顯示在 CoachPanel 頂端 sticky 區。

```tsx
interface PendingTrayProps {
  pendingCount: number;
  onApplyAll: () => Promise<void>;
  onRejectAll: () => Promise<void>;
}
```

點 [Apply All] → 對所有 pending（按 createdAt 排序）順序送 `confirm-batch`，FE 預期 SSE 廣播每個卡片狀態變化（per-card 進度，A5）。

### 14. `src/store/coachStore.ts`（修改）— 加 pendingActions selector + actions

```ts
// 既有 CoachState 擴：
interface CoachState {
  // ... 既有欄位 ...
  // Spec B 新增：
  /** 注意：actions persistence source = messages[].metadata.proposedActions[]；
   * runtime 為快速查找另維護以下 normalized index（重建自 messages） */
  pendingActionsById: Record<string, ProposedAction>;
  pendingActionIds: string[];                              // status='pending'/'confirming'/'stale' 的 id 列表，按 createdAt 排
  applyAction(actionId: string): Promise<void>;
  rejectAction(actionId: string, reason: string | null): Promise<void>;
  forceApplyAction(actionId: string): Promise<void>;
  applyAllPending(): Promise<void>;
  rejectAllPending(): Promise<void>;
  /** SSE 收到 coach_action_update 後呼叫（B4） */
  applyActionUpdate(payload: { sessionId: string; actionId: string; status: ProposedActionStatus; delta?: Partial<ProposedAction> }): void;
  /** Reload 時對帳（B4 + N7） */
  reconcilePending(serverPending: ProposedAction[]): void;
}
```

**所有權**：persistence 仍嵌 `messages[].metadata.proposedActions[]`（B6）；`pendingActionsById` / `pendingActionIds` 是 normalized cache，每次 message 變動後 derive。

### 15. `src/utils/coachApi.ts`（修改）— 4 個新 API

```ts
export async function confirmAction(actionId: string, sessionId: string, forceApply: boolean): Promise<ConfirmResult>;
export async function rejectAction(actionId: string, sessionId: string, reason: string | null): Promise<{ ok: true }>;
export async function confirmBatchActions(sessionId: string, actionIds: string[]): Promise<ConfirmBatchResult>;
export async function listPendingActions(sessionId: string): Promise<ProposedAction[]>;
```

### 16. `mcp-server/data/coach/system_prompt.md`（修改）— Tool-using mode（D6 + D17）

P1「read-only mode」整段改寫成「tool-using mode」，必含：

1. **Decision ladder**（D6）：分析/提問 → 模糊先澄清 → 明確要求才 propose
2. **負向約束**（D6）：「未釐清 user 真實意圖前，絕不主動 propose mutating action」
3. **結構化指令**（D6）：1. 總結現狀 → 2. 提問 / 釐清 → 3. 才提 proposal
4. **跨 context 引導守則**（D9）：「無法跨 board 改，需先請使用者切換 active context」
5. **Pending 行為禁令**（D17(a)）：
   - functionResponse status='pending' → 立即停止 + 引導 user click，**禁止重試**
   - functionResponse status='rejected' → 必須詢問拒絕原因，**嚴禁直接改參數重發同 tool**
6. **Anti-anchoring**（D17(b)）：「user 明確要求重構時，鼓勵大膽覆寫，不要受 inject 的 current state 限制」（**Spec B 不適用**，但寫入規則為 Spec C 鋪路）
7. **Mutating call 後強制中斷**（D17(c)）：「丟出 mutating function call 後等待，不續產生內容」
8. **`attachSnapshot=false` 守則**（N16）：「若 boardSnapshot 為空，禁止 propose mutating tools；改回純文字回」
9. **Example 6**（新）：propose-confirm 流程的範本對話

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| **新檔** | |
| `mcp-server/src/coach/skills/eventStormingSkill.ts` | EventStormingSkill 實作（buildDeclarations + execute + describeProposal） |
| `mcp-server/src/coach/agent/orchestrator.ts` | runAgentTurn loop（read auto-exec、additive propose、intent gate、maxSteps） |
| `mcp-server/src/coach/agent/pendingActions.ts` | PendingActionStore（FS-backed per-session、async-mutex、SSE subscribe） |
| `mcp-server/src/coach/agent/intentGate.ts` | detectMutationIntent + checkProposalBudget |
| `mcp-server/src/coach/audit/auditLog.ts` | jsonl append-only audit log + 跨日切檔 + async-mutex |
| `mcp-server/src/coach/__tests__/eventStormingSkill.test.ts` | declarations 對 12 個 export（read 3 + additive 9） + execute 走 handler + describeProposal 對 4 個 carrier-mode tool |
| `mcp-server/src/coach/__tests__/orchestrator.test.ts` | mock LLM：read auto-exec、additive proposal、intent gate block、maxSteps、interrupt loop after mutating |
| `mcp-server/src/coach/__tests__/pendingActions.test.ts` | propose/confirm/reject、CAS reverify、Apply All fail-stop、SSE broadcast、async-mutex 並發 |
| `mcp-server/src/coach/__tests__/intentGate.test.ts` | 中文/英文 keyword、問句、budget |
| `mcp-server/src/coach/__tests__/auditLog.test.ts` | append、跨日切檔、並發 append、schemaVersion=1 |
| `src/components/Coach/ActionCard.tsx` | 6-state 渲染 + Apply/Reject/Force-apply + Reject reason textarea |
| `src/components/Coach/PendingTray.tsx` | sticky tray（>=3 pending 顯示）+ Apply All / Reject All |
| **改檔** | |
| `mcp-server/src/coach/tools/handlers.ts` | `handle_es_add_link` + `handle_es_link_entity_to_aggregate_root` 補 server-side validation（D18） |
| `mcp-server/src/coach/tools/__tests__/handlers.test.ts` | 為 D18 新增 NOT_FOUND / INVALID_TYPE 測試 case |
| `mcp-server/src/coach/tools/toolDefinitions.ts` | 27 個 tool 的 risk 欄位填值（剩 11 維持 'unset'） |
| `mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts` | 加 risk distribution 斷言（read 3 / additive 9 / mutate 14 / destructive 1 / unset 11） + exact name set |
| `mcp-server/src/coach/tools/mcpAdapter.ts` | 抽出 `commitHandlerResult` export（§8a，audit HIGH-1）；`registerMcpTools` 改用此 helper，行為等價 |
| `mcp-server/src/coach/tools/__tests__/mcpAdapter.test.ts` | 既有 11 tests 必須仍全綠（refactor 不改變外部行為） |
| `mcp-server/src/coach/llm/adapter.ts` | LLMReply 加 functionCalls?, isFinished；chat opts 加 tools?/toolConfig?/toolResponses? |
| `mcp-server/src/coach/llm/gemini.ts` | 接 Gemini SDK function calling（FunctionDeclaration / FunctionCall / FunctionResponse parts），map ToolResponseMessage→Content |
| `mcp-server/src/coach/router.ts` | POST /message 改走 orchestrator；新增 4 endpoints；error middleware 兼容 ErrorEnvelope |
| `mcp-server/src/coach/types.ts` | 鏡像 src/types/coach.ts 新欄位（per Spec A pattern） |
| `mcp-server/src/coach/__tests__/router.test.ts` | 加 4 endpoints 整合測試（confirm flow、reject、batch、list） |
| `mcp-server/src/index.ts` | createCoachRouter deps 加 skill / pendingStore / auditLog / loadProject / reloadProject |
| `mcp-server/data/coach/system_prompt.md` | P1 read-only 段 → tool-using 段（D6+D17 全 9 條規則） |
| `mcp-server/package.json` | 加依賴：`zod-to-json-schema`、`async-mutex` |
| `src/types/coach.ts` | ProposedAction 擴 D21 欄位 + ProposedActionStatus + ToolResponseEnvelope + ErrorEnvelope（從 BE 鏡像） |
| `src/store/coachStore.ts` | applyAction / rejectAction / forceApplyAction / applyAllPending / rejectAllPending / applyActionUpdate / reconcilePending + pendingActionsById/pendingActionIds derived index |
| `src/utils/coachApi.ts` | confirmAction / rejectAction / confirmBatchActions / listPendingActions |
| `src/utils/apiSync.ts` | SSE 收到 `coach_action_update` action 時 dispatch 到 coachStore.applyActionUpdate |
| `src/components/Coach/CoachPanel.tsx` | 在 messages.map 之間穿插 ActionCard；頂端掛 PendingTray；reload 時呼叫 reconcilePending |

未改動（Non-goals 章節詳列）：所有 Spec A 既有 handlers（除 D18 修正的 2 個）；既有 38 個 MCP tool 註冊機制；boardStore；mutate / destructive 13+1 個 tools 的 risk 暴露邏輯；inversePatch / undo / batch-replace current-state injection。

---

## 實作步驟

### Step 0 — Handler validation hardening（D18）

前置必修。對 Spec A 既有 2 個 handler 補 server-side validation，否則 MVP-mid 「additive=安全」前提崩潰。

1. **修 `handle_es_add_link`**：
   - 在原本 mutate 邏輯**之前**加：依 `args.fromType` 在 `board.notes` 或 `board.remodels` 找 `args.fromId`，找不到 → return `{ ok: false, error: { code: 'NOT_FOUND', message: 'Source ${fromType} ${fromId} not found.' } }`；同理 `args.toId`。
   - 訊息格式逐字按介面合約 §2 規格。
2. **修 `handle_es_link_entity_to_aggregate_root`**：
   - 既有 unlink 路徑（`aggregateRootNoteId.trim() === ''`）保留不變。
   - 非空時加：在 `board.notes` 找 target；找不到 → `'Aggregate note ${id} not found.'` (NOT_FOUND)；找到但 `type !== 'Aggregate'` → `'Note ${id} is not an Aggregate (type: ${actual}).'` (INVALID_TYPE)。
3. **更新 `handlers.test.ts`**：
   - `es_add_link` 加 4 個 test case：fromId not found（note）、fromId not found（remodel）、toId not found（note）、toId not found（remodel）。
   - `es_link_entity_to_aggregate_root` 加 2 個：target not found、target is Command（INVALID_TYPE）。
4. 跑 `cd mcp-server && npx vitest run --reporter=default`，新舊 test 全綠。

### Step 1 — Skill + Orchestrator 骨架 + Audit log v1

1. **`toolDefinitions.ts` 填 risk**：依介面合約 §1 表填 27 個 risk；剩 11 維持 'unset'。
2. **`toolDefinitions.test.ts` 加斷言**：
   - `TOOL_DEFINITIONS.filter(d => d.risk === 'read').length === 3` 且名單對應 `['es_get_project','es_list_contexts','es_get_board']`（exact set assertion — audit nit 矯正）
   - additive=9、mutate=14、destructive=1、unset=11；所有 risk 值在合法 enum
   - additive name set `=== { es_create_context, es_add_note, es_add_command_for_event, es_add_entity_for_event, es_add_flow, es_add_remodel, es_add_invariant, es_add_link, es_add_flow_path }`（exact set，防 link_entity_to_aggregate_root 重新混入）
3. **新 deps**：在 `mcp-server/package.json` 加 `zod-to-json-schema` 與 `async-mutex`，跑 `cd mcp-server && npm install`。
4. **`eventStormingSkill.ts`**：
   - 啟動時用 `zod-to-json-schema` 把 **12 個 exposed tool**（read 3 + additive 9）的 schema 轉成 Gemini FunctionDeclaration，cache 在 instance 屬性。
   - `execute(toolName, args, ctx)`：找 `TOOL_DEFINITIONS` 中 risk in ['read','additive'] 的 entry；用 zod re-validate args；不在範圍 → return `{ ok: false, error: { code: 'PRECONDITION_FAILED', message: 'Tool ${toolName} not exposed in MVP-mid.' } }`。
   - `describeProposal(toolName, args, ctx)`：依 §5 末段「targetIds 計算規則」表 switch：4 個 carrier-mode tool（add_command_for_event / add_entity_for_event / add_invariant / add_link）按表計算 targetIds；其他 5 個純新增 → `[]`。
     - `subjectLabel`：carrier 第一個 id 對應 entity 的 `${type} "${label}"`；無 carrier 時用新增物 type+label（例：「DomainEvent 'OrderPlaced'」）。
     - `humanSummary`：簡單 template，例：`在 board "${activeBoard.name}" 加 Command "${args.commandLabel}" 並關聯到 event "${eventLabel}"`。
5. **`auditLog.ts`**：
   - `createAuditLog({ dataDir })` 回 `{ append }`；首次 append 時 `mkdirSync(dataDir, { recursive: true })`。
   - 用 `async-mutex` `acquire()` lock 整段 `[檢查當前日期 → 切檔 → fs.appendFileSync(jsonl)]`。
   - `schemaVersion: 1` 寫死；`toolVersion` 從 `package.json` 讀。
6. **`intentGate.ts`**：
   - `detectMutationIntent(text)`：實作 §6 規則（**單一 source of truth — 不得重述差異**）。normalize 小寫 + trim；測試所有列舉 keyword；ask-vs-do 訊號（結尾 ?/嗎 + 字數<10）優先於 keyword match。
   - `checkProposalBudget(count, limit)`：count >= limit → `{ allowMutating: false, reason: 'budget_exceeded' }`；否則 allow。
7. **`orchestrator.ts`**：
   - 主 loop 按介面合約 §7。
   - 每輪 functionCall 處理：
     - read：`skill.execute()` → 結果寫 `auditLog 'auto_exec_read'` → 加進下一輪 toolResponses → 繼續 loop（受 `maxReadCalls=3` 全 turn 上限 + 同 (toolName + args sha) dedup guard 限制 — D3）。
     - additive：先 `detectMutationIntent` + `checkProposalBudget`，pass 才寫 pending；fail → `auditLog 'intent_gate_blocked'`、給 LLM 一條 synthetic-rejected toolResponse。
     - mutate / destructive / unset：永遠拒絕（一律 synthetic rejection；audit 寫 'intent_gate_blocked' reason='not_in_mvp_scope'）。
   - **Mutating proposal 進 pending 後立刻 break loop**（D17(c)）。
   - maxSteps=6 上限：超過記 audit 並終止。
8. **單元測試**：`auditLog.test.ts`、`intentGate.test.ts`、`eventStormingSkill.test.ts`、`orchestrator.test.ts` mock LLM 跑 5 個關鍵 path（read auto-exec、additive propose、intent gate block、budget hit、maxSteps）。
9. **驗證**：
   - `cd mcp-server && npx tsc --noEmit && npx vitest run` 全綠
   - 新 audit log 檔產生在 `mcp-server/data/coach/audit/audit-${today}.jsonl`，schemaVersion=1

### Step 2 — Pending lifecycle + Action Card UI + 4 endpoints

1. **`pendingActions.ts`**：
   - 檔案路徑 `${COACH_DATA_DIR}/pending/${sessionId}.json`，shape `{ actions: ProposedAction[] }`；首次 propose 時建檔。
   - `propose(sessionId, action)`：mutex.acquire → load file → push → save → release；同步呼叫 SSE subscribe listeners 廣播 `pending` 狀態。
   - `confirm(sessionId, actionId, opts)`：mutex.acquire 整段 critical section（D22）：
     1. load action（不存在 → throw 404）
     2. status 檢查：只允許 `pending` 或 `stale`（後者要 forceApply=true）
     3. 設 status='confirming'，save，**broadcast SSE confirming**
     4. **CAS reverify**（D24）：computeTargetEntityHash(latest projectState, action.targetIds)，與 action.baseHash 比對；不符 + `!forceApply` → status='stale'、save、broadcast SSE stale、return ConfirmResult{status:'stale'}（mutex 釋放前）
     5. **Force-apply 額外 reverify**（D24）：targetIds 中每個 id 都要在 latest board.notes / remodels 存在 + type 對應；任一缺失 → status='failed'、errorEnvelope.code='NOT_FOUND'、broadcast、return
     6. 呼叫 `skill.execute(toolName, args, ctx)` 取得 `ToolHandlerResult`（pure handler）
     7. **`!result.ok`** → status='failed'、errorEnvelope 來自 handler error（含 NOT_FOUND / INVALID_TYPE / PRECONDITION_FAILED）、audit 'failed'、broadcast SSE failed、return
     8. **`result.ok`** → 呼叫 `commitHandlerResult(result, policy, { saveProject, syncProjectToRelay, broadcast })`（§8a 抽出的 single source of truth；handle pre-commit/post-commit broadcast phase ordering） — 此呼叫**仍在 mutex lock 內**，不得釋放後再 reload；status='confirmed'、audit log 'confirm' 含 resultJson
     9. broadcast 最終 status；release mutex
   - `reject(sessionId, actionId, reason)`：lock → load → 只允許從 pending/stale 轉；status='rejected'、rejectReason=reason、audit、SSE。
   - `confirmBatch`：對每個 actionId 順序呼叫 `confirm`；遇 fail（failed/stale）即停，剩餘 unprocessed 留 'pending'（D20 規定）。
2. **`router.ts` 4 endpoints**：
   - 沿用既有 HttpError pattern；錯誤統一回 `{ error: msg, code?: ErrorEnvelope.code }`。
   - confirm：若 ConfirmResult.status === 'stale' → http 409 + body 含 status，FE 顯示 stale UI；'failed' → 200 + body status='failed'（用 200 因為這是業務狀態，非 HTTP 失敗）。
3. **`router.ts` POST /message** 改走 orchestrator：既有 chat pipeline 改成 `runAgentTurn(...)`，回傳 assistantMessage 已含 metadata.proposedActions。
4. **`gemini.ts` function calling 接通**：
   - chat opts.tools/toolConfig 透過 `config.tools` + `config.toolConfig` 傳給 Gemini SDK。
   - response 解析：`response.candidates[0].content.parts` 中 `functionCall` 抽出成 `FunctionCallRequest[]`；text 部分仍進 `content`。
   - opts.toolResponses 轉成 Gemini `Content.role='function'` parts 加在 messages 之前（按時序）。
5. **FE side**：
   - `coach.ts` 鏡像新 type；`coachStore.ts` 加 derived index 與 5 個 actions。
   - `coachApi.ts` 加 4 個 fetch；error 回 `CoachApiError`（既有）但保留 `code` 欄位讀取。
   - `apiSync.ts` 在 SSE handler switch case 加 `'coach_action_update'` → `useCoachStore.getState().applyActionUpdate(payload)`。
   - `ActionCard.tsx` 按 §12 渲染分支實作；`useState` 管 reject textarea 顯示。
   - `CoachPanel.tsx` 在每個 assistant message 後 map metadata.proposedActions 渲染 cards；在 mount 時呼叫 `reconcilePending`（從 GET /pending）。
6. **單元測試**：
   - `pendingActions.test.ts`：propose/confirm/reject、CAS stale path、forceApply 補 reverify、Apply All fail-stop、async-mutex 並發（同時 confirm 同 actionId 第二個收 already-confirmed error）
   - `router.test.ts` 加 4 endpoints integration 測試（mock skill + pendingStore）
7. **驗證**：FE/BE tsc + vitest 全綠；手動跑「propose es_add_note → confirm → 畫布出現 note」happy path。

### Step 3 — Apply All + stale/CAS + force-apply + intent gate（已大半在 Step 1+2 內實作；本 step 收尾）

1. **PendingTray.tsx**：
   - selector：messages.flatMap(m => m.metadata?.proposedActions ?? []).filter(a => ['pending','stale'].includes(a.status))。
   - 顯示條件：count >= 3。
   - Apply All click：sequential dispatch confirm；UI 期待 SSE 即時更新每個 card。
2. **CoachPanel.tsx integration**：
   - PendingTray 掛在 panel header sticky 區。
   - 已 confirmed/rejected/failed 的 card 渲染成 32px 摘要列（A4）；data-testid 提供 e2e debug 用。
3. **stale path 端對端**：
   - 開 2 tab；tab A propose 一個 add_command_for_event；tab B 透過 DetailPanel **修改該 event 的 label**（拖動位置不算 stable subset 改動，故不會 stale；必須改 label / commandId / eventProperties 等 stable 欄位才觸發 hash 變動）；tab A 按 [套用] → 預期 card 變黃色 stale；點 [仍要套用] → server reverify pass → confirmed；切到 tab B 確認 card 透過 SSE 也變 confirmed。
4. **intent gate 端對端**：
   - 純問句「這個 event 是什麼意思？」→ Coach 純文字回，無 cards
   - 動作詞「請建立 OrderPlaced」→ Coach 給 cards
   - 一輪內 LLM 嘗試 propose 5 個 → 預期前 2 個進 pending、後 3 個被 budget block，audit log 有 3 條 'intent_gate_blocked' reason='budget_exceeded'。

### Step 4 — system_prompt 改寫 + dogfood polish

1. **`system_prompt.md` 改寫**：
   - 移除 P1「read-only mode」段落；新增「Tool-using mode」段落含 §16 的 9 條規則。
   - 加 Example 6（propose-confirm 完整對話 trace）。
   - 保留 P1 既有：Socratic、Stage 3 hint、繁中 default、DDD 英文術語規則。
2. **`audit-spec` 自查**：跑 `system_prompt` 改寫前後對比，5 個典型情境（純對話 / propose-confirm / reject / stale / 跨 context 引導）人工觀察 LLM 行為。
3. **README / `mcp-server/CLAUDE.md` 更新**：把 P2 / P3 段（若有）改成 Spec B / Spec C 命名一致；加 audit log 路徑說明。
4. **手動 dogfood 11 項 checklist**（驗收 §Human）。

---

## 失敗路徑

### LLM hallucinate noteId

LLM 提 `es_add_command_for_event(eventNoteId='evt-fake')`。
1. orchestrator 進 pending（intent gate pass）。
2. user 點 [套用] → `confirm()` → CAS reverify 第 1 步：computeTargetEntityHash 找不到 'evt-fake' → status='failed'、errorEnvelope.code='NOT_FOUND'、message='Target entity evt-fake not found.'
3. SSE broadcast；FE card 變紅色 failed
4. 下輪 user 訊息前 orchestrator 注入 toolResponse `{status:'failed', errorEnvelope}` → LLM 看到 + system_prompt D17(a) 規則 → 不重試、改文字回應或詢問 user

### CAS mismatch（stale）— 多 tab 場景

Tab A propose、tab B 手動編輯 target entity → tab A 點 [套用]：
1. confirm() CAS reverify → hash 不符 + forceApply=false → status='stale'
2. SSE broadcast 兩個 tab；FE 變黃色 stale UI
3. user 點 [仍要套用]（forceApply=true）→ server 仍 reverify entity 存在（D24）→ 通過則 status='confirmed'；不通過 status='failed'

### Apply All 中段失敗

5 cards 排隊；第 2 個 confirm 時 hallucinate noteId 失敗：
1. ConfirmBatchResult.results 第 1=confirmed、第 2=failed、第 3-5 不在 results；stoppedAt='action-2'
2. FE 收到 result，第 3-5 cards 留 'pending' 狀態（D20）
3. user 可手動逐個處理或 Reject All

### Gemini SDK error envelope（N5）

LLM 回 functionCall.args 不合法 JSON / zod re-validate fail：
1. skill.execute() return `{ ok:false, code:'GEMINI_INVALID_ARGS', detail:{ rawArgs } }`
2. 不進 pending；audit 'intent_gate_blocked'（複用此 code 表示「不接受」）；toolResponse 給 LLM `{status:'failed', errorEnvelope:{...GEMINI_INVALID_ARGS}}`

### attachSnapshot=false + mutating call（N16）

User 關掉 boardSnapshot toggle，問 Coach「請建一個 OrderPlaced」：
1. system_prompt §16.8 規則：attachSnapshot=false 時禁 propose mutating
2. LLM 應改純文字回（依 prompt 約束）
3. **若 LLM 違反 prompt 仍 propose**：orchestrator 偵測 `boardSnapshot===null` + functionCall risk in ['additive'] → 直接 synthetic-rejected、audit 'intent_gate_blocked' reason='no_snapshot_attached'

### Audit log append failure

磁碟滿 / 權限錯：`fs.appendFileSync` throw → mutex 內 catch、寫 stderr warning（不影響 user-facing 流程）；audit fail-soft，不該擋 confirm pipeline。

### 並發 confirm 同 actionId（多 tab race）

兩 tab 同時點 [套用] 同個 actionId：
1. async-mutex 先進的拿到 lock，狀態 pending → confirming → 終結態（confirmed / stale / failed 任一）
2. 後進的 lock 拿到時讀檔 status 已為終結態 → throw `{ code: 'PRECONDITION_FAILED', message: 'Action ${id} already finalized (status: ${actualStatus}).' }` → http 409；FE 收 409 不顯示錯誤 UI（SSE 早已同步狀態）
3. **泛化規則**：lock 內第 2 步永遠檢查當前 status === 'pending' 或（forceApply=true 時）'stale'；任何其他狀態 → 拒絕，不假設第一個一定成功

**不變量**：
- `confirm()` 的 mutex 範圍 = 整個 transaction（load → reverify → execute → audit → SSE）— D22
- `propose()` 後立刻終止 orchestrator loop — D17(c)
- `risk in ['mutate','destructive','unset']` 的 functionCall 永遠 synthetic-rejected — Spec B 不啟用
- `boardSnapshot===null` + risk='additive' → 一律 block — N16

---

## 不改動的部分

- Spec A 既有 38 個 handler 內部邏輯（**除** D18 修正的 `handle_es_add_link`、`handle_es_link_entity_to_aggregate_root` 兩個）
- Spec A `mcpAdapter.ts` 流程
- Spec A `TOOL_DEFINITIONS` 順序、name、description、schema、handler、policy（**只填 risk 欄位**）
- 既有 38 個 MCP tool stdio 註冊（Claude Code 仍可呼叫所有 tools，包含 mutate/destructive — 但 Coach LLM 透過 Skill 只暴露 12 個）
- `boardStore.ts` 任何欄位
- P1 既有 Coach UI 視覺風格、CoachPanel 對話流程、CoachMessage 主 schema（只擴 metadata.proposedActions）
- SSE 既有 actions（add_note / update_note / delete_note / sync_project / ... 全部）— 只新增 `coach_action_update`
- `mcp-server/data/project.json` schema 不變
- 既有 P1 system_prompt 中：Socratic、Stage 3 hint、繁中 default、DDD 英文術語規則

### Non-goals（行為層）

- 本 task **不**啟用 mutate 14 個 tool 的 LLM 暴露（含 `es_link_entity_to_aggregate_root` — 因 audit HIGH-4 從原 additive 重分類至 mutate；其 `aggregateRootNoteId=""` unlink 語義屬 destructive 範疇，破壞 MVP 安全前提；risk 欄位填 'mutate' 但 Skill.buildDeclarations filter 不取）
- 本 task **不**啟用 destructive 1 個 tool（es_delete_link）的 LLM 暴露
- 本 task **不**做 inversePatch / 任何 undo 機制（包含 audit log 內的 inverse 資料）
- 本 task **不**做 batch-replace tool 的 current-state injection（D7）
- 本 task **不**加 batch-replace tool description「REPLACES ENTIRELY」警告（D14）
- 本 task **不**加 expired / superseded action 狀態（D20 6-state 不含這兩個）
- 本 task **不**做 audit log gzip / 30 天輪轉（推 Spec C）
- 本 task **不**做 conditional tool exposure（每次 chat 都附 12 個 tools schema）
- 本 task **不**做 LLM hash collision 升級（boardSnapshotHash 用既有 P1 64-bit FNV-1a）
- 本 task **不**改 Claude Code MCP stdio 介面（`server.tool` 註冊機制不動）
- 本 task **不**改其他 SSE actions 的時序、payload、廣播範圍

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
test -f mcp-server/src/coach/skills/eventStormingSkill.ts
test -f mcp-server/src/coach/agent/orchestrator.ts
test -f mcp-server/src/coach/agent/pendingActions.ts
test -f mcp-server/src/coach/agent/intentGate.ts
test -f mcp-server/src/coach/audit/auditLog.ts
test -f mcp-server/src/coach/__tests__/eventStormingSkill.test.ts
test -f mcp-server/src/coach/__tests__/orchestrator.test.ts
test -f mcp-server/src/coach/__tests__/pendingActions.test.ts
test -f mcp-server/src/coach/__tests__/intentGate.test.ts
test -f mcp-server/src/coach/__tests__/auditLog.test.ts
test -f src/components/Coach/ActionCard.tsx
test -f src/components/Coach/PendingTray.tsx

# 3. Step 0 — D18 handler 補強（exact symbol，非寬鬆 substring）
grep -qE "Source (note|remodel) \\\$\\{fromId\\} not found" mcp-server/src/coach/tools/handlers.ts
grep -qE "Target (note|remodel) \\\$\\{toId\\} not found" mcp-server/src/coach/tools/handlers.ts
grep -qE "Aggregate note \\\$\\{aggregateRootNoteId\\} not found" mcp-server/src/coach/tools/handlers.ts
grep -qE "is not an Aggregate \\(type:" mcp-server/src/coach/tools/handlers.ts

# 4. 關鍵 export
grep -q 'export class EventStormingSkill' mcp-server/src/coach/skills/eventStormingSkill.ts
grep -q 'buildDeclarations' mcp-server/src/coach/skills/eventStormingSkill.ts
grep -q 'describeProposal' mcp-server/src/coach/skills/eventStormingSkill.ts
grep -q 'export async function runAgentTurn' mcp-server/src/coach/agent/orchestrator.ts
grep -q 'export interface PendingActionStore' mcp-server/src/coach/agent/pendingActions.ts
grep -q 'export function computeTargetEntityHash' mcp-server/src/coach/agent/pendingActions.ts
grep -q 'export function detectMutationIntent' mcp-server/src/coach/agent/intentGate.ts
grep -q 'DEFAULT_PROPOSAL_BUDGET_PER_TURN = 2' mcp-server/src/coach/agent/intentGate.ts
grep -q 'export interface AuditLogEntry' mcp-server/src/coach/audit/auditLog.ts
grep -q "schemaVersion: 1" mcp-server/src/coach/audit/auditLog.ts

# 5. LLMReply 擴充（D15）
grep -q 'functionCalls?:' mcp-server/src/coach/llm/adapter.ts
grep -q 'isFinished:' mcp-server/src/coach/llm/adapter.ts
grep -q 'tools?:' mcp-server/src/coach/llm/adapter.ts
grep -q 'toolResponses?:' mcp-server/src/coach/llm/adapter.ts

# 6. ProposedAction 擴充（D21 + audit HIGH-2 toolCallId）
grep -q 'toolCallId:' src/types/coach.ts
grep -q 'targetIds:' src/types/coach.ts
grep -q 'subjectLabel:' src/types/coach.ts
grep -q 'humanSummary:' src/types/coach.ts
grep -q "export type ProposedActionStatus" src/types/coach.ts
grep -q 'baseHash:' src/types/coach.ts
grep -q 'forceApply:' src/types/coach.ts
grep -q 'rejectReason:' src/types/coach.ts
grep -q 'errorEnvelope:' src/types/coach.ts

# 6a. commitHandlerResult helper 抽出（audit HIGH-1）
grep -q 'export async function commitHandlerResult' mcp-server/src/coach/tools/mcpAdapter.ts
grep -q 'commitHandlerResult' mcp-server/src/coach/agent/pendingActions.ts

# 7. router 加 4 endpoints
grep -q "actions/:actionId/confirm" mcp-server/src/coach/router.ts
grep -q "actions/confirm-batch" mcp-server/src/coach/router.ts
grep -q "actions/:actionId/reject" mcp-server/src/coach/router.ts
grep -q "sessions/:sessionId/pending" mcp-server/src/coach/router.ts

# 8. SSE coach_action_update
grep -q "coach_action_update" mcp-server/src/coach/agent/pendingActions.ts
grep -q "coach_action_update" src/utils/apiSync.ts

# 9. coachStore 加 actions
grep -q 'applyAction:' src/store/coachStore.ts
grep -q 'rejectAction:' src/store/coachStore.ts
grep -q 'forceApplyAction:' src/store/coachStore.ts
grep -q 'applyAllPending:' src/store/coachStore.ts
grep -q 'applyActionUpdate:' src/store/coachStore.ts
grep -q 'reconcilePending:' src/store/coachStore.ts
grep -q 'pendingActionsById' src/store/coachStore.ts

# 10. coachApi 4 個 client functions
grep -q 'export async function confirmAction' src/utils/coachApi.ts
grep -q 'export async function rejectAction' src/utils/coachApi.ts
grep -q 'export async function confirmBatchActions' src/utils/coachApi.ts
grep -q 'export async function listPendingActions' src/utils/coachApi.ts

# 11. system_prompt 改寫（D6 + D17 全 9 條）
grep -q 'Decision ladder' mcp-server/data/coach/system_prompt.md
grep -q 'Anti-anchoring' mcp-server/data/coach/system_prompt.md
grep -q '不主動' mcp-server/data/coach/system_prompt.md
grep -q 'attachSnapshot' mcp-server/data/coach/system_prompt.md
grep -q 'Pending' mcp-server/data/coach/system_prompt.md
! grep -q 'P1 capability scope' mcp-server/data/coach/system_prompt.md

# 12. dependencies
grep -q '"zod-to-json-schema"' mcp-server/package.json
grep -q '"async-mutex"' mcp-server/package.json

# 13. 不該動的東西沒被動
! grep -q "risk: 'mutate'" mcp-server/src/coach/skills/eventStormingSkill.ts
grep -q "risk in" mcp-server/src/coach/skills/eventStormingSkill.ts || grep -q "filter" mcp-server/src/coach/skills/eventStormingSkill.ts

# 14. vitest 全綠
cd mcp-server && npx vitest run --reporter=default
```

**Runtime 斷言（vitest 內必含，取代 grep -c 計數）**：

```ts
// toolDefinitions.test.ts 加：
it("Spec B fills risk distribution 3+9+14+1+11 = 38", () => {
  const distribution = TOOL_DEFINITIONS.reduce<Record<string, number>>((acc, d) => {
    acc[d.risk] = (acc[d.risk] ?? 0) + 1;
    return acc;
  }, {});
  expect(distribution).toEqual({ read: 3, additive: 9, mutate: 14, destructive: 1, unset: 11 });
});

it("'read' risk maps to 3 tools (exact set)", () => {
  expect(new Set(TOOL_DEFINITIONS.filter(d => d.risk === 'read').map(d => d.name)))
    .toEqual(new Set(['es_get_project','es_list_contexts','es_get_board']));
});

it("'additive' risk maps to exact 9 tools (es_link_entity_to_aggregate_root NOT in)", () => {
  expect(new Set(TOOL_DEFINITIONS.filter(d => d.risk === 'additive').map(d => d.name)))
    .toEqual(new Set([
      'es_create_context','es_add_note','es_add_command_for_event','es_add_entity_for_event',
      'es_add_flow','es_add_remodel','es_add_invariant','es_add_link','es_add_flow_path',
    ]));
});

// eventStormingSkill.test.ts 加：
it('buildDeclarations exports exactly 12 tools (read 3 + additive 9)', () => {
  const skill = new EventStormingSkill();
  expect(skill.buildDeclarations().length).toBe(12);
});

it('describeProposal targetIds covers 4 carrier tools (audit HIGH-3)', () => {
  // es_add_command_for_event / es_add_entity_for_event → [eventNoteId]
  // es_add_invariant → [noteId]
  // es_add_link (note→note) → [fromId, toId]
});

// orchestrator.test.ts 加（mock LLM）：
it('mutating proposal interrupts loop after first card', async () => { /* maxSteps=6 但實際 1 個 mutating 後就 break */ });
it('budget=2 blocks 3rd additive call in same turn', async () => { /* ... */ });
it('attachSnapshot=null blocks all additive calls', async () => { /* N16 */ });
it('toolCallId is propagated from functionCall.id to ProposedAction', async () => { /* audit HIGH-2 */ });
it('next-turn toolResponses use ProposedAction.toolCallId for pairing', async () => { /* audit HIGH-2 */ });

// pendingActions.test.ts 加：
it('CAS reverify rejects confirm when hash mismatch and !forceApply', async () => { /* D10 + D24 */ });
it('forceApply still requires server-side reverify (target exists + type match)', async () => { /* D24 */ });
it('confirmBatch fail-stop leaves remaining cards in pending', async () => { /* D20 */ });
it('confirm uses commitHandlerResult helper (single source of truth — audit HIGH-1)', async () => { /* spy on imports */ });
it('concurrent confirm second wins finalized status (not assumed confirmed)', async () => { /* audit Codex #9 generalized */ });

// mcpAdapter.test.ts 加（既有 11 tests 不動，新增）：
it('commitHandlerResult dispatches pre-commit before save then post-commit (single source of truth)', async () => { /* phase ordering 對標 Spec A 既有 standard tool 行為 */ });
```

### Human 補做（需要人類介入）

- [ ] **Demo 1 — 純對話路徑**：問「請解釋 OrderPlaced 跟 PaymentReceived 的關係」→ Coach 純文字回應，無任何 Action Card
- [ ] **Demo 2 — additive propose-confirm happy path**：問「請建一個 OrderPlaced event」→ 出現 1 張 pending card → 點 [套用] → card 變綠色 + 畫布出現 OrderPlaced note
- [ ] **Demo 3 — Apply All 多 cards**：問「請建立 3 階段 happy path: PlaceOrder → OrderPlaced、AssignAuditor → AuditorAssigned、CompleteAudit → AuditCompleted」→ 出現 3+ cards 進 pending → PendingTray 顯示計數 3 → 點 Apply All → 依序 confirming → confirmed，畫布同步更新
- [ ] **Demo 4 — Reject + reason**：問「請建一個 Foo aggregate」→ 出現 card → 點 [拒絕] → inline textarea「為什麼拒絕？(可選)」→ 填「Foo 命名不對」→ 確認 → card 變灰色 rejected 摘要列；下輪 user 訊息 Coach 應**不會自動改參數重發**（D17(a)），預期會詢問替代命名
- [ ] **Demo 5 — Stale + force**：propose 一張 add_command_for_event card 後**修改該 target event 的 label**（非位置 — 因 TargetEntityHash stableSubset 排除 position；使用 DetailPanel rename event 觸發 hash 變動）→ card 變黃色 stale + 警告「畫布已變動」→ 點 [仍要套用] → server reverify entity 仍存在 + type 對應 → card 變綠色 confirmed
- [ ] **Demo 6 — Stale + target deleted**：propose 後手動刪除 target event → 點 [仍要套用] → card 變紅色 failed + errorEnvelope 顯示「Target entity X not found」（D24 force 仍 reverify）
- [ ] **Demo 7 — Multi-tab sync**：開 2 個 tab，tab A confirm 一個 card → tab B 同 session 的 card 透過 SSE 即時變 confirmed
- [ ] **Demo 8 — Intent gate 純問句**：問「能解釋一下 events 該怎麼命名嗎？」→ 純文字回應，無 cards（即使 LLM 想 propose 也被 server gate 駁回）
- [ ] **Demo 9 — Budget=2 block**：問「請建立 5 個 actor: A B C D E」→ 預期出現 2 cards 進 pending、3 個被 budget block，audit log 有 3 條 'intent_gate_blocked' reason='budget_exceeded'
- [ ] **Demo 10 — attachSnapshot=false + mutating intent**：取消 toggle，問「請建一個 event」→ Coach 應純文字提示「請勾選 board snapshot 才能 propose」（依 system_prompt §16.8）
- [ ] **Demo 11 — Reload 補 pending**：propose 多個 cards 後 refresh 整個瀏覽器 → CoachPanel re-mount → reconcilePending() 從 GET /pending 補回所有 pending/stale cards
- [ ] **System prompt regression**：以 P1 5 個典型情境（範圍探討、命名建議、概念解釋、結構審查、流程說明）跑前後對比，確認 Coach 仍維持 Socratic + 繁中 + 不直接給答案的人格
- [ ] DevTools console 全程無錯誤
- [ ] `mcp-server/data/coach/audit/audit-${today}.jsonl` 存在且可解析（每行為合法 JSON）；至少含 propose/confirm/reject 各一筆
- [ ] `mcp-server/data/coach/pending/<sessionId>.json` 存在；reload 後內容與 GET /pending 一致

---

## 已知限制

- **Spec C 必含項**（Spec B 預留 hook 不啟用）：mutate 14（含 audit HIGH-4 reclassify 的 `es_link_entity_to_aggregate_root`） + destructive 1 tools 暴露、inversePatch（D11 fast-json-patch）、UI undo button、batch-replace current-state injection（D7）+ schema warnings（D14）、`expired`/`superseded` action 狀態、audit log v2 schema（含 inversePatch 欄位）、audit log gzip/30 天輪轉
- **`risk='unset'`** 在 Spec B 仍有 11 個 tool（switch/rename/clear_board/delete_*/set_*）— Spec C 啟用 destructive/unset 暴露時補
- **MCP stdio 介面照舊**：Claude Code 仍可呼叫所有 38 個 tools（含 mutate/destructive），這是設計選擇 — Skill 限制只應用於 Coach LLM 路徑
- **`X-Coach-User-Id` 不是真 auth**（N4）：本 spec 接受此既有限制；spec C 或 spec D 才考慮升級
- **`clientMessageId` 多 tab 唯一性**（N15）：依賴 nanoid 21 字元 → 衝突極低，但理論上仍可能；server 端用 `(userId, sessionId, clientMessageId)` triple 作 idempotency key 緩解，spec B 不做更強保證
- **boardSnapshotHash 維持 64-bit FNV-1a**（D4）：Spec B 不升級至 SHA-256；TargetEntityHash 用 SHA-256 截 16 字（B1 用，跟 boardSnapshotHash 用途不同）
- **Intent gate keyword 規則 rule-based**：dogfood 階段可能有誤判（false positive：user 說「我建議改名」但其實不要動畫布）— Spec B 接受此風險，後續可從 audit log 觀察 reject/cancel 比例調規則
- **無 Pending action timeout / TTL**（B3）：個人專案 dogfood 範圍可接受；session archive 時 pending file 會留下，需手動清理（記在已知限制不阻 ship）
- **依賴關係**：前置 task `2026-05-07-coach-agent-spec-a-handler-refactor`（已 done 2026-05-08）；Spec A handlers + toolDefinitions registry 是 Spec B 的基礎，必須完整 ship 後才開工 Spec B
- **Reload 後 finalized card 狀態**（audit MED-1）：confirm/reject/fail 後 `messages[].metadata.proposedActions[]` 的 status 會在 server-side session message append 時更新；reload 後從 `GET /sessions/:id` 讀回的 messages 已含最終 status，**不需**靠 `GET /pending`。`GET /pending` 只回 `status='pending'` 或 `'stale'` 的 actions（cold-load 補回未完成）。FE `reconcilePending` 規則：以 server `GET /pending` 結果取代 store `pendingActionsById` 中所有 pending/stale 項，已終結（confirmed/rejected/failed）以 messages 為準
- **`confirmBatch` 對 stale cards 的處理**（audit MED-2）：batch 只接受 `status='pending'` 的 actions；input array 含 `status='stale'` 的 id → server 回 400 `{ error: 'Stale actions cannot be batch-applied; force-apply individually.' }`。outer-lock 語義：每個 actionId 自取自釋 lock，不持有 cross-action lock（避免長時間阻塞 SSE 廣播）；Apply All 沒有 atomic 保證，這是接受的 trade-off
- **Intent gate keyword false negative**（audit MED-3）：rule-based detection 在 dogfood 階段預期會誤判（user 說「我覺得需要一個 OrderPlaced」沒命中 keyword）。Spec B 接受此風險；audit log 'intent_gate_blocked' 事件可分析誤判率，Spec C 視情況升級為 LLM-based intent classifier
- **與 Spec C 的擴充關係**：Spec C 將擴 `ProposedActionStatus` 加 `expired/superseded`、擴 `AuditLogEntry` 加 `inversePatch/inversePatchVersion` 欄位、改 `EventStormingSkill.buildDeclarations` filter 條件（加入 mutate/destructive 共 15 個）、加 mutate/destructive handler 的 D7 current-state injection。Spec C 不會破壞 Spec B 介面，只擴充
