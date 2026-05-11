# AI Coach P1 — 對話 UI + Board 狀態感知（唯讀，純 Gemini）

## 來源

Plan：`/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md`（含 Round 1 Claude / Codex / Gemini 三方共識看板）

本 spec 僅 cover Plan 中的 **P1**（對話 UI + 狀態快照感知，唯讀）。**P2（Action Card 提案）與 P3（MCP 自動執行）不在本 spec 範圍**，留作後續 spec。

---

## 目標

Cosmogony 目前讓外部 AI（如 Claude Code）透過 28 個 MCP tools 操作畫布，但使用者本人在 UI 工作時沒有從旁協助的 DDD 教練。本 task 在右側欄下方新增 `CoachPanel` 對話面板，讓使用者跟 Gemini 對話、由 Gemini 觀察當前 board 狀態給 DDD 思維校正建議（不變量設計、是否滑向 OOP / Read Model 思維等）。**P1 唯讀**：Coach 不會也不能改畫布。對話 session 存後端 JSON file，跨 tab 共用。

P1 不做：自動執行 MCP tool、Action Card 提案、Audit log、Undo、敏感資料遮罩、跨 model 切換、streaming response、rate limit。這些列為後續 phase。

---

## 介面合約（Interface Contract）

### 1. Frontend：`coachUserId` 工具（新檔 `src/utils/coachUser.ts`）

```ts
/**
 * Coach 專用使用者識別。**獨立於 apiSync.ts 的 clientId**。
 * - clientId（既有 sessionStorage `es-client-id`）：board sync / broadcastExcept 的 sender 標識，tab-scoped 是正確語意
 * - coachUserId（本檔 localStorage `es-coach-user-id`）：Coach session ownership，跨 tab 共用對話需要
 *
 * **不要把兩者合併** — apiSync 的 broadcastExcept(senderId) 期待 tab 為單位的 sender；
 * 若改 localStorage 同瀏覽器多 tab 會被當成同一 sender，cross-tab board sync 會壞掉。
 */
export function getCoachUserId(): string;
```

**所有權明示**：
- `coachUserId` 唯一寫入路徑就是這個 module（首次呼叫時 `localStorage.setItem`）
- `apiSync.ts` 的 `clientId` 維持不動，**不可** 改 storage scope

### 1.5 Frontend：共用型別檔（新檔 `src/types/coach.ts`）

**所有 Coach 共用型別的單一定義來源**（避免跨檔重複定義 / 自引）：

```ts
// src/types/coach.ts

export interface CoachMessage {
  id: string;                          // server 產的 nanoid (canonical)
  clientMessageId?: string;            // optimistic 訊息的對齊鍵；server response 會把它附在 userMessage 上
  role: 'user' | 'assistant' | 'system';
  content: string;                     // 純文字
  metadata?: {
    model?: string;                    // 'gemini-2.5-pro'
    boardSnapshotHash?: string;
    activeBoardId?: string;
    attachedSnapshot?: boolean;
    proposedActions?: ProposedAction[]; // P2 才填
    driftSignals?: DriftSignal[];       // 由 buildBoardSnapshot 產，附在 user message
    tokenUsage?: { input: number; output: number };
    aborted?: boolean;
  };
  createdAt: string;                   // ISO 8601
}

// DriftSignal 的單一定義位置（coachSnapshot.ts 從此 import，coachStore.ts 也從此 import）
export interface DriftSignal {
  kind:
    | 'high_dto_ratio'
    | 'aggregate_no_invariants'
    | 'crud_event_naming'
    | 'policy_missing_trigger'
    | 'oop_terminology'
    | 'high_readmodel_ratio';
  detail: string;
}

// ProposedAction 為 P2/P3 預留的 forward type；P1 只佔位、不使用
export interface ProposedAction {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  // P2/P3 spec 才會擴
}
```

**所有權明示**：
- `CoachMessage` / `DriftSignal` / `ProposedAction` 唯一定義位置就是本檔
- 後端 `mcp-server/src/coach/types.ts`（鏡像）保留同名 interface（後端不能直接 import 前端 src）；P1 容忍兩處平行定義，加註「需與 src/types/coach.ts 保持同步」

### 2. Frontend：`coachStore` (新檔 `src/store/coachStore.ts`)

```ts
import type { CoachMessage } from '../types/coach';

export interface CoachState {
  panelOpen: boolean;
  attachSnapshot: boolean;             // localStorage es-coach-attach-snapshot, 預設 true
  currentSessionId: string | null;     // null = 尚未建立任何 session
  messages: CoachMessage[];            // 當前 session 的 messages（in-memory，server 是 source of truth）
  isStreaming: boolean;
  error: string | null;
  abortController: AbortController | null;

  // actions
  setPanelOpen: (open: boolean) => void;
  setAttachSnapshot: (on: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
  loadCurrentSession: () => Promise<void>;
  clearSession: () => void;            // 開新一條 session（不刪舊的）
  cancel: () => void;                  // abort current request
}

export const useCoachStore: UseBoundStore<StoreApi<CoachState>>;
```

**所有權明示**：
- `currentSessionId` 由 `sendMessage` 在收到後端首次回覆時持久化到 localStorage `es-coach-current-session-id`，下次載入由 `loadCurrentSession` 復原
- `messages` 永遠以後端回應為準；前端的 user message 是 optimistic add，但任何 server-rejected 或 abort 時要 reconcile

### 3. Frontend：`coachApi` (新檔 `src/utils/coachApi.ts`)

```ts
export interface PostMessageRequest {
  sessionId: string | null;            // null = 後端建新 session
  clientMessageId: string;             // **必填** — 前端 optimistic message 的 nanoid，server 會把它放回 userMessage.clientMessageId
  text: string;
  attachSnapshot: boolean;
  boardSnapshot: BoardSnapshot | null; // attachSnapshot=false 時傳 null
}

export interface PostMessageResponse {
  sessionId: string;
  userMessage: CoachMessage;           // server 產的權威版本，含 server nanoid 與 clientMessageId（從 request 抄回來）
  assistantMessage: CoachMessage;      // 全新 server 產的訊息，無 clientMessageId
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export async function postMessage(req: PostMessageRequest, signal?: AbortSignal): Promise<PostMessageResponse>;
export async function listSessions(): Promise<SessionMeta[]>;
export async function getSession(sessionId: string): Promise<{ id: string; messages: CoachMessage[] }>;

/**
 * 所有呼叫自動帶 X-Coach-User-Id header（從 getCoachUserId() 取）
 * 不要自行帶 X-Client-Id（與既有 board sync 的 header 名衝突）
 */
```

### 4. Frontend：BoardSnapshot 型別與 builder

```ts
// src/utils/coachSnapshot.ts (新檔)
import type { DriftSignal } from '../types/coach';   // 唯一定義在 types/coach.ts

export interface AdjacentContextRef {
  boardId: string;
  boardName: string;
  aggregateNames: string[];                  // 該 board 上的 Aggregate.label
  sharedDomainEvents: string[];              // 雙方都出現的 DomainEvent.label
  sharedPolicies: string[];                  // active board 的 Policy 提到此 context 名稱
  sharedExternalSystems: string[];
}

export interface BoardSnapshot {
  activeBoardId: string;
  activeBoardName: string;
  aggregates: AggregateSummary[];
  domainEvents: EventSummary[];
  commands: CommandSummary[];
  policies: PolicySummary[];
  readModelsCount: number;
  dtosCount: number;
  hotspots: string[];                        // full label 列出
  adjacentContexts: AdjacentContextRef[];
  driftSignals: DriftSignal[];               // P1 cheap rule pre-flag (DriftSignal from types/coach)
  hash: string;                              // 簡化 string hash hex（見 Step 2 說明）
}

export function buildBoardSnapshot(project: Project, activeBoardId: string): BoardSnapshot;
export function computeSnapshotHash(snapshot: Omit<BoardSnapshot, 'hash'>): string;
```

**所有權明示與 source of truth**：
- `BoardSnapshot` 由 **client 端**（CoachPanel 觸發 sendMessage 時）建構並傳給 server
- **Server 端不重算 snapshot**，也不從 `loadProject()` 自行產生 — 即使 router 持有 `loadProject` 引用，那只是為了未來（P2+ 跨 context 主動拉取）預留；P1 完全信任 client 傳來的 snapshot
- `driftSignals` 由 client builder 計算，server 不驗證 / 不重算
- `BoardSnapshot.hash` 由 client `computeSnapshotHash` 產生，server 只儲存到 message metadata 不重算

### 5. Frontend：`CoachPanel` 元件 (新檔 `src/components/Coach/CoachPanel.tsx`)

```tsx
interface CoachPanelProps {
  height: number;                            // 由 RightColumn 傳入
  width: number;
}

export const CoachPanel: React.FC<CoachPanelProps>;
```

**內部結構**（沿用 DetailPanel 的 PANEL_BG / BORDER_COLOR / TEXT_MAIN / TEXT_MUTED 配色）：
- Header：標題「AI Coach」+ Privacy toggle（『附帶 board snapshot』，預設開）+ disclosure 文字「對話與 board summary 會送至 Google Gemini」+ 三點選單（清空對話 / 開新 session）
- Messages list：垂直 scroll，user / assistant / system 訊息泡泡，loading dots（streaming 時）
- Input：textarea + Send button，Cmd/Ctrl+Enter 送出；streaming 時 button 變 Cancel（呼叫 `cancel()`）

**所有權明示**：
- Privacy toggle 狀態存 `localStorage['es-coach-attach-snapshot']`，由 coachStore 的 `setAttachSnapshot` 寫入；CoachPanel 只 render 與觸發

### 6. Frontend：`RightColumn` 元件 (新檔 `src/components/Coach/RightColumn.tsx`)

```tsx
export const RightColumn: React.FC;          // no props，從 stores 自取所需
```

**布局策略**：自身 `position: fixed; top: 0; right: 0; bottom: 0; width: <columnWidth>`，內部 flex column；DetailPanel 與 CoachPanel 變欄內 child（**移除自身 fixed positioning**）。

**DetailPanel 必須 always-mounted**（保留既有 Esc listener、missing-element cleanup、scroll container；見 Step 10）。視覺呈現透過 height 動畫切換，**不可** 用 conditional render `{hasSelection && <DetailPanel />}`。

```
┌─ RightColumn (fixed) ─────────┐
│ <DetailPanel /> (always mounted, height 動畫: open=>1-r, closed=>0) │
│ <ResizeBar (水平) />            │  ← 只在 isOpen=true 時可互動
│ <CoachPanel /> (flex r 或 100%) │
└────────────────────────────────┘
```

**寬度與比例**：
- `es-right-column-width` localStorage：預設 480，min 320，max 720
- `es-coach-panel-ratio` localStorage：預設 0.4（CoachPanel 占下方 40%），min 0.2，max 0.8
- 左邊垂直 ResizeBar 拖曳改 width，水平 ResizeBar 拖曳改 ratio

**Migration**：`es-detail-panel-width` 既有 key，讀進來當 `es-right-column-width` 預設值（向下相容），讀完後不刪舊 key（保留以防 rollback）。

**小螢幕 fallback**：`window.innerWidth < 1280` 時 RightColumn 改 tab 模式（內部 state 切換哪個 child render），保留現有 DetailPanel 可收合語意；resize 觀察用 `window.matchMedia('(min-width: 1280px)')` listener 動態切換。

### 7. Backend：Coach Express router (新檔 `mcp-server/src/coach/router.ts`)

```ts
import { Router } from 'express';

export interface CoachRouterDeps {
  sessionStore: CoachSessionStore;
  llm: LLMAdapter;
  baseDddGuide: string;                      // mcp-server/CLAUDE.md 內容（啟動時載入）
  userDraft: string | null;                  // user 既有 system prompt 草稿
  loadProject: () => Project;                // P2+ 預留；P1 router 不調用，server 完全信任 client snapshot
}

export function createCoachRouter(deps: CoachRouterDeps): Router;

/**
 * 當 GEMINI_API_KEY 缺時 mount 此降級 router；所有 method（POST /message、GET /sessions、
 * GET /sessions/:id、POST /sessions/:id/clear）一致回 503 + JSON：
 *   { error: 'GEMINI_API_KEY not configured' }
 */
export function createDegradedCoachRouter(): Router;
```

**Auth 範圍警語**：`X-Coach-User-Id` header **不是真實認證**。P1 假設使用者在自己的本機跑 Cosmogony，server-side 信任 header 值作為使用者區分鍵。多人共用同一 server 場景需要 P2/P3 補真實 auth（JWT / session cookie）。

**端點**：
- `POST /api/coach/message` — body: `{ sessionId, clientMessageId, text, attachSnapshot, boardSnapshot }`，header: `X-Coach-User-Id`；回 `{ sessionId, userMessage, assistantMessage }`；LLM 失敗回 502；缺 GEMINI_API_KEY 啟動時就 503；缺 clientMessageId 回 400
- `GET /api/coach/sessions` — header: `X-Coach-User-Id`；回 `SessionMeta[]`，依 `updatedAt` desc
- `GET /api/coach/sessions/:id` — header: `X-Coach-User-Id`；回 `{ id, messages[] }`；不屬該 user 回 404（不洩漏存在性）
- `POST /api/coach/sessions/:id/clear` — 將該 session 標 archived（仍可讀但 ListSessions 不顯示），不刪檔；header: `X-Coach-User-Id`

**Auth 中介函式**：
```ts
function getCoachUserId(req: Request): string {
  const id = req.headers['x-coach-user-id'];
  if (typeof id !== 'string' || !id) throw new HttpError(401, 'X-Coach-User-Id header required');
  return id;
}
```

**Abort 行為**：handler 內建 `const ac = new AbortController()` 與 `req.on('aborted', () => ac.abort())`，把 `ac.signal` 透過 `LLMAdapter.chat({ signal })` 傳入；abort 觸發後，把 partial assistant message（content '(已取消)'、metadata.aborted=true）與 user message 一起 append 到 session，回 client HTTP 200 + `{ sessionId, userMessage, assistantMessage }`（assistantMessage.metadata.aborted=true）。**不**走 HTTP 499（前端較難處理；統一以 metadata 標記）。

### 8. Backend：CoachSessionStore (新檔 `mcp-server/src/coach/sessionStore.ts`)

```ts
export interface CoachSessionStore {
  listSessions(userId: string): Promise<SessionMeta[]>;
  getSession(userId: string, sessionId: string): Promise<CoachSession | null>;
  createSession(userId: string): Promise<CoachSession>;
  appendMessages(userId: string, sessionId: string, msgs: CoachMessage[]): Promise<void>;
  archiveSession(userId: string, sessionId: string): Promise<void>;
}

export interface CoachSession {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  messages: CoachMessage[];
}
```

**檔案佈局**：
```
mcp-server/data/coach/
├── index.json                           # { userId → [sessionId, ...] }
└── sessions/
    └── <sessionId>.json                 # CoachSession
```

**寫入策略**：
- 每次寫入用 `tmpfile + rename` atomic 寫法（沿用 `saveProject()` 既有 pattern）
- per-`sessionId` in-memory `Map<string, Promise<void>>` mutex，新寫入 chain 在前一個 promise 之後（序列化）
- `index.json` 寫入用獨立的 in-memory mutex（單一 lock）

**P1 假設 single process**：multi-process（relay mode）下 in-memory mutex 失效，會撞檔案 race。**本 spec 範圍內僅警告，不解決** — P3 切 SQLite 時一併處理。

### 9. Backend：LLMAdapter + GeminiAdapter

```ts
// mcp-server/src/coach/llm/adapter.ts

// LLMAdapter 只接受 user/assistant 兩種 role，避免 'system' 在 adapter 落入錯誤分支
export type LLMAdapterMessage = Pick<CoachMessage, 'content'> & {
  role: 'user' | 'assistant';
};

export interface LLMAdapter {
  readonly modelName: string;
  chat(opts: {
    systemPrompt: string;
    messages: LLMAdapterMessage[];           // **caller 負責過濾 system role**
    signal?: AbortSignal;
  }): Promise<{ content: string; tokenUsage: { input: number; output: number } }>;
}

// mcp-server/src/coach/llm/gemini.ts
export class GeminiAdapter implements LLMAdapter;
// constructor: new GeminiAdapter({ apiKey: string, model?: string }) — model default 'gemini-2.5-pro'
// 內部用 @google/genai 套件
```

**Framework 備註**：
- `@google/genai`（不是 deprecated 的 `@google/generative-ai`），ESM-only，需 Node ≥ 18
- Gemini 訊息格式：`{ role: 'user'|'model', parts: [{ text }] }`；`system` 用 `systemInstruction` 欄位（非訊息陣列）
- AbortSignal 透過 `requestOptions: { signal }` 傳入

### 10. Backend：snapshotBuilder (新檔 `mcp-server/src/coach/snapshotBuilder.ts`)

```ts
/**
 * 接收 client 端送來的 BoardSnapshot，轉成丟給 LLM 的 markdown 文字。
 * 不重算 hash 也不驗證 — 信任 client 給的內容。
 *
 * P1 純 server-side 行為：snapshot 已由 client 算好；server 只負責 markdown render。
 */
export function snapshotToMarkdown(snapshot: BoardSnapshot): string;
```

輸出格式範例見 Plan §P1.5「Board snapshot 注入策略」段。

### 11. Backend：systemPromptBuilder (新檔 `mcp-server/src/coach/prompts/system.ts`)

```ts
/**
 * 載入 user 提供的 system prompt 草稿（環境變數 COACH_SYSTEM_PROMPT_FILE 指向檔案路徑，
 * 預設 mcp-server/data/coach/system_prompt.md），與 mcp-server/CLAUDE.md 的 Domain Expert
 * 操作手冊拼接，加上 5 步 CoT 框架，組成完整 system instruction。
 */
export function buildSystemPrompt(opts: {
  baseDddGuide: string;       // mcp-server/CLAUDE.md 內容
  userDraft: string | null;   // user 既有 system prompt 草稿
  attachSnapshot: boolean;    // 影響 prompt 中是否提示「user 已關閉 board 附帶」
  snapshotMarkdown: string | null;
}): string;
```

**5 步 CoT 框架**（hard-coded 在 buildSystemPrompt 內，user draft 不可覆寫）：
1. 識別使用者意圖
2. 分析模式（Aggregate / Value Object / Repository / Read Model）
3. 比對 DDD 原則（是否貧血模型？是否封裝 invariant？Repository 是否混入查詢？）
4. 判斷漂移並分類（OOP 滑坡 / Read Model 滑坡 / 邊界錯置）
5. 用蘇格拉底式提問引導，**不直接說「你錯了」**

### 12. Backend：mcp-server/src/index.ts 集成

修改點（不動既有 28 個 tool 的 handler）：
- 載入 `GEMINI_API_KEY` 與 `COACH_SYSTEM_PROMPT_FILE` env
- 建立 `coachSessionStore = new CoachSessionStore({ dataDir: 'mcp-server/data/coach' })`
- 若 `GEMINI_API_KEY` 存在 → 建 `geminiAdapter = new GeminiAdapter({ apiKey })`
- `app.use('/api/coach', createCoachRouter({ sessionStore, llm: geminiAdapter, loadProject: () => projectState }))`
- 若 `GEMINI_API_KEY` 不存在 → mount 一個降級 router 所有端點回 503 + `{ error: 'GEMINI_API_KEY not configured' }`

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/types/coach.ts` | NEW — 共用型別 `CoachMessage` / `DriftSignal` / `ProposedAction`（單一定義位置） |
| `src/utils/coachUser.ts` | NEW — `getCoachUserId()` localStorage helper |
| `src/utils/coachApi.ts` | NEW — fetch 封裝（`postMessage` / `listSessions` / `getSession`），帶 clientMessageId |
| `src/utils/coachSnapshot.ts` | NEW — `buildBoardSnapshot()` / `computeSnapshotHash()` / drift signal 計算（DriftSignal 從 types/coach import） |
| `src/store/coachStore.ts` | NEW — Zustand store；用 clientMessageId reconcile optimistic |
| `src/components/Coach/CoachPanel.tsx` | NEW — 對話面板（header + messages list + input） |
| `src/components/Coach/CoachMessage.tsx` | NEW — 單則訊息渲染 |
| `src/components/Coach/RightColumn.tsx` | NEW — fixed 容器；DetailPanel always-mounted；小螢幕 tab 模式 |
| `src/App.tsx` | 加 `<RightColumn />`；中央 fixed 區的 `right: 0` 改 `right: rightColumnWidth`（語意錨：含 TabBar + Board 的 fixed div） |
| `src/components/Board/Board.tsx` | 移除 DetailPanel import 與 mount（改由 RightColumn 渲染） |
| `src/components/DetailPanel/DetailPanel.tsx` | 移除自身 fixed positioning 與 panelWidth 自管；改受 props (containerHeight/containerWidth/hidden) 控；保留 isOpen / Esc listener / missing-element cleanup / 子面板 |
| `mcp-server/src/coach/router.ts` | NEW — Express sub-router；export createCoachRouter + createDegradedCoachRouter |
| `mcp-server/src/coach/sessionStore.ts` | NEW — JSON file CRUD；read-modify-write 整段 in mutex |
| `mcp-server/src/coach/snapshotBuilder.ts` | NEW — `snapshotToMarkdown()` |
| `mcp-server/src/coach/llm/adapter.ts` | NEW — `LLMAdapter` + `LLMAdapterMessage` interface |
| `mcp-server/src/coach/llm/gemini.ts` | NEW — `GeminiAdapter` 實作 |
| `mcp-server/src/coach/prompts/system.ts` | NEW — `buildSystemPrompt()` |
| `mcp-server/src/coach/types.ts` | NEW — 後端鏡像 CoachMessage / DriftSignal（與 src/types/coach.ts 同步） |
| `mcp-server/src/coach/__tests__/sessionStore.test.ts` | NEW — 並發 append、跨 user 隔離 |
| `mcp-server/src/coach/__tests__/router.test.ts` | NEW — auth 401、跨 user 404、degraded 503、clientMessageId reconcile（mock LLM）、abort 行為 |
| `mcp-server/src/index.ts` | 啟動讀 `GEMINI_API_KEY` 與 `COACH_SYSTEM_PROMPT_FILE`；掛 `/api/coach` router；缺 key mount degraded |
| `mcp-server/package.json` | 加依賴 `@google/genai` 與 `nanoid`；devDeps 加 `vitest` |
| `package.json`（root） | 加依賴 `nanoid` |

未改動：
- `src/utils/apiSync.ts` — clientId 與既有 board sync 邏輯維持不動
- 既有 28 個 MCP tool 的 handler
- `src/store/boardStore.ts` / `src/store/uiStore.ts` 的 actions 與 state shape
- `src/types/elements.ts` / `src/types/specs.ts` / `src/types/board.ts`
- `mcp-server/data/project.json` 持久化機制
- 既有 SSE `/api/events` / `POST /api/board` / `GET /api/board` / `POST /api/broadcast` 端點

---

## 實作步驟

### Step 0 — `src/types/coach.ts` 新檔（共用型別）

實作介面合約 #1.5 中宣告的 `CoachMessage` / `DriftSignal` / `ProposedAction` 三個 interface。

`mcp-server/src/coach/types.ts` 鏡像同名 interface（後端不能直接 import 前端 src），加註：「需與 src/types/coach.ts 保持同步；未來 P2/P3 加欄位記得兩邊一起改」。

### Step 1 — `src/utils/coachUser.ts` 新檔

```ts
import { v4 as uuidv4 } from 'uuid';

export function getCoachUserId(): string {
  const KEY = 'es-coach-user-id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 隱私模式 / localStorage 被禁用 → fallback 到記憶體 ID（每次 reload 變新）
    return uuidv4();
  }
}
```

### Step 2 — `src/utils/coachSnapshot.ts` 新檔

1. `buildBoardSnapshot(project, activeBoardId)`：
   - 找 active board，產出 `aggregates`、`domainEvents`、`commands`、`policies`、`readModelsCount`、`dtosCount`、`hotspots`
   - `adjacentContexts`：對 `project.boards` 中其他 board，計算 `aggregateNames` / `sharedDomainEvents`（依 label 比對）/ `sharedPolicies`（active board 的 Policy.label 含其他 board 名）/ `sharedExternalSystems`
   - `driftSignals`：
     - `high_dto_ratio` if `dtosCount > domainEvents.length`
     - `aggregate_no_invariants` for each aggregate with stateProperties.length > 0 但 invariants 為空
     - `crud_event_naming` if 事件名以 `Created` / `Updated` / `Deleted` 結尾占比 > 0.5
     - `policy_missing_trigger` for each policy with no `policyTrigger`
     - `oop_terminology` if 任何 note label 含 `Repository|Service|Controller|Manager|Helper`
     - `high_readmodel_ratio` if `readModelsCount > domainEvents.length`
2. `computeSnapshotHash(snapshot)`：
   - `JSON.stringify(snapshot)` → Web Crypto `crypto.subtle.digest('SHA-256', ...)` → 取 hex 前 16 字元
   - 為了同步呼叫（builder 不要 async），P1 用簡化版：hash 只取 `JSON.stringify` 後丟一個快速 string hash（FNV-1a 或類似），16 字元 hex 輸出
   - **接受 trade-off**：hash collision 風險極低（碰到不影響正確性，只影響 unchanged 偵測），效能優先

### Step 3 — `src/utils/coachApi.ts` 新檔

實作三個 fetch 函式，全部加 `X-Coach-User-Id: <coachUserId>` header；用 `import.meta.env` 讀 vite proxy（dev 時 `/api/coach/*` proxy 到 3333）。`postMessage` 接受 `signal?: AbortSignal` 並透傳 fetch。網路錯誤 throw `CoachApiError`。

### Step 4 — `src/store/coachStore.ts` 新檔

1. 用 Zustand + immer。state 形狀如介面合約 #2。
2. `sendMessage(text)`：
   ```ts
   const clientMessageId = nanoid();   // 對齊鍵
   const optimisticUser: CoachMessage = {
     id: clientMessageId,              // 暫用 clientMessageId 當 id（server 回來會 replace 整則）
     clientMessageId,
     role: 'user', content: text, createdAt: now(),
   };
   set(state => {
     state.messages.push(optimisticUser);
     state.isStreaming = true;
     state.error = null;
     state.abortController = new AbortController();
   });
   const snapshot = get().attachSnapshot ? buildBoardSnapshot(...) : null;
   try {
     const res = await postMessage({
       sessionId: get().currentSessionId, clientMessageId,
       text, attachSnapshot: get().attachSnapshot, boardSnapshot: snapshot,
     }, get().abortController!.signal);
     // 對齊：用 clientMessageId 找 optimistic，整則替換為 server canonical user message；append assistant
     set(state => {
       const idx = state.messages.findIndex(m => m.clientMessageId === clientMessageId);
       if (idx >= 0) state.messages[idx] = res.userMessage;
       state.messages.push(res.assistantMessage);
       state.currentSessionId = res.sessionId;
     });
     localStorage.setItem('es-coach-current-session-id', res.sessionId);
   } catch (err) {
     if (err.name === 'AbortError') {
       // append local-only aborted assistant message; 不刪 optimistic user
       set(state => {
         state.messages.push({ id: nanoid(), role: 'assistant', content: '(已取消)',
           metadata: { aborted: true }, createdAt: now() });
       });
     } else {
       set(state => { state.error = err.message; });
       // 保留 optimistic user message（讓 user 看到送了什麼），但顯示錯誤橫條
     }
   } finally {
     set(state => { state.isStreaming = false; state.abortController = null; });
   }
   ```
3. `loadCurrentSession()`：
   - 從 localStorage 取 sessionId → `getSession()` → 把 messages 灌入 state
   - sessionId 不存在或 404：state messages 為空
   - **StrictMode 防呆**：用 in-memory ref `loadingPromise` 確保並發呼叫只觸發一次 fetch；useEffect 依賴 `[coachUserId, currentSessionId]` 而非 `[]`
4. `clearSession()`：localStorage 移除 `es-coach-current-session-id`，state messages = []，currentSessionId = null
5. `cancel()`：`abortController?.abort()`

### Step 5 — `src/components/Coach/CoachPanel.tsx` 新檔

1. mount 時呼叫 `useCoachStore.getState().loadCurrentSession()`；**不要直接寫 `useEffect(..., [])`**（StrictMode 會雙觸發），改成兩擇一：
   - (a) `useEffect(() => { useCoachStore.getState().loadCurrentSession(); }, [])` + 由 coachStore 內部用 in-memory ref guard（如 Step 4 第 3 點所述）
   - (b) `useEffect(() => { useCoachStore.getState().loadCurrentSession(); }, [coachUserId])`，當 coachUserId 取自 `getCoachUserId()` 為固定值時實際只觸發一次
   - 推薦 (a)，因為 guard 集中在 store，元件側單純
2. JSX 結構：
   ```tsx
   <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: PANEL_BG }}>
     <Header />          {/* title + privacy toggle + disclosure + 三點選單 */}
     <MessagesList />    {/* 垂直 scroll，底部對齊 */}
     <Input />           {/* textarea + Send/Cancel button */}
   </div>
   ```
3. **Header**：
   - 標題 `🤖 AI Coach`
   - Privacy toggle：checkbox / switch + 文字「附帶 board snapshot」
   - 灰字 disclosure：「對話與 board summary 會送至 Google Gemini」
   - `⋯` button → 下拉「開新對話」（呼叫 clearSession）/ 「歷史對話」（暫不實作 panel，列入 P1 已知限制）
4. **MessagesList**：
   - 用 `useRef` 在新 message append 時自動 scroll bottom
   - 每則 render `<CoachMessage message={msg} />`
   - 若 `isStreaming` 顯示底部 loading dots
5. **Input**：
   - Cmd/Ctrl+Enter 觸發 send；Send button click 也觸發
   - streaming 時 button 變 Cancel，click 呼叫 `cancel()`
   - 空白訊息不送

### Step 6 — `src/components/Coach/CoachMessage.tsx` 新檔

簡單 message bubble：user 靠右，assistant 靠左，system / aborted 用不同樣式。markdown：純文字（不解析 markdown，避免複雜度）。`metadata.aborted` 在訊息底部顯示「（已取消）」灰字。

### Step 7 — `src/components/Coach/RightColumn.tsx` 新檔

1. 自身 fixed positioning：`{ position: 'fixed', top: 0, right: 0, bottom: 0, width: columnWidth, zIndex: 100 }`
2. 從 localStorage 讀 width（預設 480；若沒有則嘗試讀 legacy `es-detail-panel-width`）與 ratio（預設 0.4）
3. 用 `useState` 管 width / ratio，change 時寫 localStorage
4. small screen detection：`window.matchMedia('(min-width: 1280px)')` listener；< 1280 改 tab 模式
5. 由 `useUIStore` 取 `selectedElementId`、`selectedElementType` 算 `isOpen`
6. **DetailPanel always-mounted**：JSX 永遠 render `<DetailPanel />`，**不**用 `{isOpen && ...}` 包；DetailPanel 內部依 isOpen 切換高度（Step 10）
7. JSX：
   ```tsx
   // wide-screen (>= 1280px)
   <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width, display: 'flex', flexDirection: 'column' }}>
     <VerticalResizeBar onResize={setWidth} />          {/* 左邊緣，always 可互動 */}
     <DetailPanel
       containerHeight={isOpen ? Math.round(innerHeight * (1 - ratio)) : 0}
       containerWidth={width}
     />
     {isOpen && <HorizontalResizeBar onResize={setRatio} />}
     <CoachPanel
       height={isOpen ? Math.round(innerHeight * ratio) : innerHeight}
       width={width}
     />
   </div>

   // small-screen tab 模式（< 1280px）
   <div style={{ position: 'fixed', ..., width }}>
     <TabHeader active={activeTab} onChange={setActiveTab} />  {/* Detail / Coach */}
     <DetailPanel
       containerHeight={activeTab === 'detail' ? innerHeight - TAB_HEADER_H : 0}
       containerWidth={width}
       hidden={activeTab !== 'detail'}                  // 用 hidden style，不 unmount
     />
     {activeTab === 'coach' && <CoachPanel height={innerHeight - TAB_HEADER_H} width={width} />}
   </div>
   ```
8. **小螢幕切換策略**（防止 H1 / M2 漏洞）：
   - DetailPanel **不可 unmount**（保留 selection / Esc lifecycle）— 用 `hidden` style 或 `display: none` 隱藏
   - CoachPanel 切走時**保留 input draft**：可 unmount（draft 由 coachStore state 持有）或 hidden style，二者擇一在實作時定，但 draft 不可丟
   - tab 切換時 focus restore 到上一個 active 的可 focus 元件（用 `tabIndex={-1}` 容器當 fallback target）
9. **ResizeBar 元件**：file-local 元件（不抽共用）；onPointerDown → setPointerCapture → onPointerMove 計算 delta → onPointerUp release。**Pointer events 防呆**：在 onPointerUp 前先檢查 `e.currentTarget.hasPointerCapture(e.pointerId)` 才 release；onLostPointerCapture 已 release，不可重 release

### Step 8 — `src/App.tsx` 修改

1. import `RightColumn` 與 `useRightColumnWidth` (新 hook 從 localStorage 讀寬度，listen storage event)
2. 在 `useApiSync()` 之後 (component body 內) 找到中央 fixed 容器（含 `<TabBar />` + `<PathBar />` + `<Board />` 的那層 `position: fixed; left: sidebarWidth; right: 0` div）：將 `right: 0` 改成 `right: rightColumnWidth`
3. 在 root flex container 結束標籤之前加 `<RightColumn />`

### Step 9 — `src/components/Board/Board.tsx` 修改

1. 移除 DetailPanel import 與 `<DetailPanel />` mount（搜 `DetailPanel` token 找到對應位置）
2. 確認沒有殘留的 selection 副作用 — DetailPanel 之前由 Board 渲染但 selection 來自 uiStore，移除 mount 不影響 selection state
3. 注意：Board.tsx 內若有 prop pass DetailPanel-related，一併清

### Step 10 — `src/components/DetailPanel/DetailPanel.tsx` 修改（保留 lifecycle，僅換尺寸來源）

**不可動的既有行為**（這些是 always-mounted 才生效的）：
- `isOpen = selectedElementId !== null` 內部判斷（既有）
- Esc key listener（既有 useEffect 依賴 isOpen）
- missing-element cleanup（isOpen 但 note/remodel 不存在 → setSelectedElement(null, null) 的既有 useEffect）
- 內部 scroll container 與 sticky header
- 子面板（AggregatePanel / DtoPanel / PolicyPanel / InvariantCard / ReturnTypeEditor）所有渲染與互動 — **一字不改**

**改動**：

1. **新增 props**：
   ```tsx
   interface DetailPanelProps {
     containerHeight: number;            // 由 RightColumn 傳入，0 = collapsed
     containerWidth: number;
     hidden?: boolean;                   // 小螢幕 tab 切走時設 true（用 display:none）
   }
   ```
2. **Root div 樣式改寫**（保留 mount，改變尺寸 / 動畫）：
   - 移除 `position: fixed; right: 0; top: 0; height: 100vh; width: panelWidth`
   - 移除 `transform: translateX(...)`（不再用左右滑入）
   - 改為 `width: 100%; height: containerHeight; overflow: hidden; transition: height 240ms ease`（高度動畫 = 上下展開）
   - 若 `hidden` 為 true：`display: none`
   - 保留 `background: PANEL_BG; borderLeft: ...`（雖然在 RightColumn 內無 border 需求，但保留樣式不影響視覺）
3. **移除自管寬度**：
   - 刪除 `PANEL_WIDTH_DEFAULT` / `PANEL_WIDTH_MIN` / `PANEL_WIDTH_MAX` / `PANEL_WIDTH_STORAGE_KEY` 常數
   - 刪除 `readStoredPanelWidth` 函式
   - 刪除 `panelWidth` useState 與 `setPanelWidth` 寫 localStorage 的副作用
   - 刪除「左邊 ResizeBar」JSX（既有的 role="separator" aria-label="Resize detail panel" 那段）— 寬度由 RightColumn 的 VerticalResizeBar 控
4. **保留**：
   - `isOpen` 計算與所有 useEffect
   - 內容區的 `{isOpen && (...)}` 條件 render（內容收合時不顯示子面板，但 root div 保持 mount）
   - 既有 `useRef`、子面板選擇 switch
5. RightColumn 對 DetailPanel 的呼叫遵守新 props signature

### Step 11 — `mcp-server/src/coach/sessionStore.ts` 新檔

1. 建 `data/coach/sessions/` 目錄（不存在則 mkdir -p）
2. 維護 in-memory `Map<sessionId, Promise<void>>` 作為 per-session mutex chain
3. **整段 read-modify-write 必須在 mutex 內**（防 lost update）：

```ts
async appendMessages(userId, sessionId, msgs) {
  const prev = this.mutexMap.get(sessionId) ?? Promise.resolve();
  const next = prev.then(async () => {
    // ←—— 全部包在 mutex 內：read、modify、write 不可拆
    const session = await this.readSessionFile(sessionId);
    if (!session) throw new Error('session not found');
    if (session.userId !== userId) throw new Error('forbidden');
    session.messages.push(...msgs);
    session.updatedAt = new Date().toISOString();
    await this.writeAtomic(filePath, JSON.stringify(session));
  });
  this.mutexMap.set(sessionId, next.catch(() => {}));  // 不讓錯誤 break chain
  await next;
}

// getSession 也走同 mutex（避免 read 中途 file 被改）— 包在 mutex 內 readSessionFile
async getSession(userId, sessionId) {
  const prev = this.mutexMap.get(sessionId) ?? Promise.resolve();
  const next = prev.then(async () => {
    const session = await this.readSessionFile(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  });
  this.mutexMap.set(sessionId, next.catch(() => null));
  return next;
}
```

4. `writeAtomic(path, content)`：write to `${path}.tmp` then rename
5. `index.json` 用獨立的單一 mutex；createSession / archiveSession 透過它寫入；`createSession` 同時要 atomically 在 sessions/ 目錄寫新檔 + 在 index.json 加 entry — 兩步驟在 index mutex 內依序執行
6. **多 in-flight request 順序保證**：同 sessionId 的 send 嚴格串行（mutex 已保證）；client 若連發兩則 user message，順序由 mutex 隊列決定，**不保證以 wall-clock 順序**（這是 client 同 sessionId 連發的已知行為，spec 接受）

### Step 12 — `mcp-server/src/coach/llm/gemini.ts` 新檔

```ts
import { GoogleGenAI } from '@google/genai';

export class GeminiAdapter implements LLMAdapter {
  readonly modelName: string;
  private genai: GoogleGenAI;

  constructor(opts: { apiKey: string; model?: string }) {
    this.modelName = opts.model ?? 'gemini-2.5-pro';
    this.genai = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async chat({ systemPrompt, messages, signal }) {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const response = await this.genai.models.generateContent({
      model: this.modelName,
      contents,
      config: { systemInstruction: systemPrompt },
      requestOptions: signal ? { signal } : undefined,
    });
    return {
      content: response.text ?? '',
      tokenUsage: {
        input: response.usageMetadata?.promptTokenCount ?? 0,
        output: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
```

**Framework 備註**：
- @google/genai 的具體 API surface 可能因版本略異；實作時若 API 與此處不符，以實際 package types 為準調整
- abort：若 SDK 不支援 `signal`，fallback 用 `Promise.race` + `signal.addEventListener('abort', ...)` reject

### Step 13 — `mcp-server/src/coach/snapshotBuilder.ts` 新檔

把 client 傳來的 BoardSnapshot 轉 markdown，格式如 Plan §P1.5。簡單字串拼接，無分支邏輯。

### Step 14 — `mcp-server/src/coach/prompts/system.ts` 新檔

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FALLBACK_DRAFT = '';
const COT_FRAMEWORK = `
## 思考流程（每次回應前先在內心走一遍）
1. 識別使用者意圖
2. 分析模式（Aggregate / Value Object / Repository / Read Model）
3. 比對 DDD 原則（是否貧血模型？是否封裝 invariant？Repository 是否混入查詢？）
4. 判斷漂移並分類（OOP 滑坡 / Read Model 滑坡 / 邊界錯置）
5. 用蘇格拉底式提問引導，不直接說「你錯了」
`;

export function buildSystemPrompt({ baseDddGuide, userDraft, attachSnapshot, snapshotMarkdown }) {
  const parts = [
    userDraft ?? FALLBACK_DRAFT,
    COT_FRAMEWORK,
    '## DDD 操作手冊（domain expert reference）',
    baseDddGuide,
  ];
  if (attachSnapshot && snapshotMarkdown) {
    parts.push('## 當前 Board 快照', snapshotMarkdown);
  } else if (!attachSnapshot) {
    parts.push('## 注意：使用者已關閉 board snapshot 附帶。請只依對話內容回應，不要假設使用者的 board 結構。');
  }
  return parts.filter(Boolean).join('\n\n');
}

export function loadUserDraft(): string | null {
  const path = process.env.COACH_SYSTEM_PROMPT_FILE
    ?? resolve(process.cwd(), 'mcp-server/data/coach/system_prompt.md');
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function loadBaseDddGuide(): string {
  // mcp-server/CLAUDE.md
  return readFileSync(resolve(process.cwd(), 'mcp-server/CLAUDE.md'), 'utf8');
}
```

### Step 15 — `mcp-server/src/coach/router.ts` 新檔

1. `createCoachRouter(deps)` 回傳 Express Router
2. 中介函式：所有路由先呼 `getCoachUserId(req)`，捕到 HttpError 回 401
3. `POST /message` 流程：
   ```
   userId = getCoachUserId(req)
   { sessionId, clientMessageId, text, attachSnapshot, boardSnapshot } = req.body
   validate clientMessageId (string, non-empty); 缺則 400
   if !sessionId:
     session = await sessionStore.createSession(userId)
     sessionId = session.id
   else:
     session = await sessionStore.getSession(userId, sessionId)
     if !session: return 404 (不洩漏 ownership)
   userMsg = {
     id: nanoid(), clientMessageId,            // 把 client 傳的 clientMessageId 抄回去當對齊鍵
     role: 'user', content: text,
     metadata: { boardSnapshotHash: boardSnapshot?.hash, activeBoardId: boardSnapshot?.activeBoardId,
                 attachedSnapshot: attachSnapshot },
     createdAt: now()
   }
   systemPrompt = buildSystemPrompt({ baseDddGuide, userDraft, attachSnapshot,
     snapshotMarkdown: boardSnapshot ? snapshotToMarkdown(boardSnapshot) : null })
   const ac = new AbortController()
   req.on('aborted', () => ac.abort())
   try:
     // 過濾 system role（LLMAdapter 只接 user/assistant）
     const adapterMsgs = [...session.messages, userMsg]
       .filter(m => m.role !== 'system')
       .map(m => ({ role: m.role, content: m.content }));
     llmReply = await llm.chat({ systemPrompt, messages: adapterMsgs, signal: ac.signal })
     assistantMsg = { id: nanoid(), role: 'assistant', content: llmReply.content,
       metadata: { model: llm.modelName, tokenUsage: llmReply.tokenUsage,
                   boardSnapshotHash: boardSnapshot?.hash }, createdAt: now() }
   catch err:
     if ac.signal.aborted:
       assistantMsg = { id: nanoid(), role: 'assistant', content: '(已取消)',
         metadata: { aborted: true, model: llm.modelName }, createdAt: now() }
     else:
       return 502 + { error: err.message }
   await sessionStore.appendMessages(userId, sessionId, [userMsg, assistantMsg])
   res.json({ sessionId, userMessage: userMsg, assistantMessage: assistantMsg })
   ```
4. `GET /sessions` / `GET /sessions/:id` / `POST /sessions/:id/clear` 走 sessionStore method
5. 降級 router：所有 method 直接 `res.status(503).json({ error: 'GEMINI_API_KEY not configured' })`

### Step 16 — `mcp-server/src/index.ts` 修改

在 `app.use(express.json({ limit: '10mb' }));` 之後、`app.get('/api/events', ...)` SSE 端點宣告之前插入：
```ts
import { createCoachRouter } from './coach/router.js';
import { CoachSessionStore } from './coach/sessionStore.js';
import { GeminiAdapter } from './coach/llm/gemini.js';
import { loadBaseDddGuide, loadUserDraft } from './coach/prompts/system.js';

const coachSessionStore = new CoachSessionStore({ dataDir: 'mcp-server/data/coach' });
const baseDddGuide = loadBaseDddGuide();
const userDraft = loadUserDraft();

const apiKey = process.env.GEMINI_API_KEY;
if (apiKey) {
  const llm = new GeminiAdapter({ apiKey });
  app.use('/api/coach', createCoachRouter({
    sessionStore: coachSessionStore,
    llm,
    baseDddGuide,
    userDraft,
    loadProject: () => projectState,
  }));
} else {
  process.stderr.write('GEMINI_API_KEY not set — Coach endpoints will return 503\n');
  app.use('/api/coach', createDegradedCoachRouter());
}
```

### Step 17 — 依賴安裝

**Backend** `mcp-server/package.json`：
```json
"dependencies": {
  ...,
  "@google/genai": "^0.2.0",
  "nanoid": "^5.0.0"
}
```

**Frontend** `package.json`（root）：
```json
"dependencies": {
  ...,
  "nanoid": "^5.0.0"
}
```

`nanoid` 前後端都用：前端產 `clientMessageId`、後端產 message id 與 session id。`@google/genai` 只在後端。

**安裝指令**：
```bash
npm install                    # root 前端
cd mcp-server && npm install   # backend
```

---

## 失敗路徑

- **GEMINI_API_KEY 缺**：啟動 stderr warning + 所有 `/api/coach/*` 回 503 + `{ error: 'GEMINI_API_KEY not configured' }`；前端 CoachPanel 顯示「Coach 未配置」+ 灰底，input disabled
- **X-Coach-User-Id header 缺**：所有 coach 端點回 401 + `{ error: 'X-Coach-User-Id header required' }`；前端 coachApi 不會發生（`getCoachUserId()` 必回值）
- **session 不屬該 user**：回 404（不洩漏 session 存在性）
- **LLM 呼叫失敗（網路 / 額度 / API error）**：回 502 + `{ error: <message> }`；前端 coachStore.error 設訊息，CoachPanel 顯示紅色橫條 + 重試按鈕
- **使用者點 Cancel**：前端 `abortController.abort()` → fetch reject AbortError → coachStore 把已寫入 optimistic user message 保留，append 一個 `aborted: true` 的 assistant message（content '(已取消)'）；後端 `req.on('aborted')` 觸發 `ac.abort()` 中止 LLM 呼叫，sessionStore 寫入 partial assistant message metadata `aborted: true`
- **sessionStore 寫入失敗（磁碟滿 / permission）**：appendMessages throw → router 捕獲回 500；前端顯示錯誤 + 訊息「對話可能未保存，請稍後重試」
- **單一 process 假設失效（multi-process relay mode）**：sessionStore in-memory mutex 失效 → 並發寫入可能撞檔；P1 不解決，spec 已明示「P3 切 SQLite」；測試環境一律單 process
- **Board snapshot 過大（極多 notes）**：JSON.stringify 後 > 1MB → buildBoardSnapshot 不主動限制；後端接收後 LLM 可能因 context window 拒絕；P2 才補摘要壓縮
- **小螢幕（<1280px）下 RightColumn tab 模式**：CoachPanel 與 DetailPanel 共享空間，使用者切換需透過 tab；不破壞功能但體驗下降，spec 已知限制
- **clientId / coachUserId 名稱混淆**：若實作者不慎在 apiSync.ts 改 storage scope 或在 coachApi 帶 X-Client-Id → 回歸測試（cross-tab board sync）會抓到；驗收標準明列 grep 規則防止
- **clientMessageId 缺**：router 收 POST /message body 缺 `clientMessageId` → 回 400 + `{ error: 'clientMessageId required' }`
- **同 sessionId 並發 send**：sessionStore mutex 序列化寫入；client 連發兩則時，第二則的 optimistic message 會在第一則 reconcile 完之後才 reconcile（等於 user 看到順序遵守 mutex 隊列）
- **server 回傳 message 沒有 clientMessageId**（理論上不該發生，防呆）：coachStore 找不到對齊鍵時 fallback 直接 append（不替換 optimistic）— 結果是 optimistic 重複顯示一次，不影響後續對話

---

## 不改動的部分

- `src/utils/apiSync.ts` 的 `clientId` 與 sessionStorage 行為（**critical** — 改動會打壞 cross-tab board sync）
- 既有 28 個 MCP tool 的 handler、schema、broadcast 行為
- `mcp-server/data/project.json` 持久化機制
- `src/store/boardStore.ts` / `src/store/uiStore.ts` 的 actions 與 state
- `src/types/elements.ts` / `src/types/specs.ts` / `src/types/board.ts` 既有 interface
- 既有 SSE / Express 端點
- DetailPanel 內部子面板（AggregatePanel / DtoPanel / PolicyPanel / InvariantCard / ReturnTypeEditor）的邏輯與 styling
- mcp-server/CLAUDE.md（本 spec 只**讀取**作為 system prompt 來源，不修改）

### Non-goals（行為層）

- 本 task **不**支援自動執行 MCP tool（P3）
- 本 task **不**含 Action Card 提案 UI（P2）
- 本 task **不**做 audit log / undo snapshot（P3）
- 本 task **不**做敏感資料自動遮罩（P2）
- 本 task **不**支援 streaming response（未來）
- 本 task **不**做 per-userId rate limit（上線前才補）
- 本 task **不**支援 Claude / 其他 model（雖預留 LLMAdapter interface，但 P1 只實作 Gemini）
- 本 task **不**有「歷史對話列表」UI（雖然 `GET /api/coach/sessions` 已存在；P1 前端只用 currentSession）
- 本 task **不**做 markdown / code highlight 渲染（純文字訊息）
- 本 task **不**改既有 DetailPanel 內子面板的 styling
- 本 task **不**改 Board.tsx 的 DnDContext 邏輯（只移除 DetailPanel mount）
- 本 task **不**做 cross-context 完整 board summary（只給 `AdjacentContextRef` 三項清單）

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別 / build
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..
npm run build

# 2. 新檔存在
test -f src/utils/coachUser.ts
test -f src/utils/coachApi.ts
test -f src/utils/coachSnapshot.ts
test -f src/store/coachStore.ts
test -f src/components/Coach/CoachPanel.tsx
test -f src/components/Coach/CoachMessage.tsx
test -f src/components/Coach/RightColumn.tsx
test -f mcp-server/src/coach/router.ts
test -f mcp-server/src/coach/sessionStore.ts
test -f mcp-server/src/coach/snapshotBuilder.ts
test -f mcp-server/src/coach/llm/adapter.ts
test -f mcp-server/src/coach/llm/gemini.ts
test -f mcp-server/src/coach/prompts/system.ts

# 3. 關鍵 export
grep -q 'export function getCoachUserId' src/utils/coachUser.ts
grep -q 'export function buildBoardSnapshot' src/utils/coachSnapshot.ts
grep -q 'export function computeSnapshotHash' src/utils/coachSnapshot.ts
grep -q 'export const useCoachStore' src/store/coachStore.ts
grep -q 'export const CoachPanel' src/components/Coach/CoachPanel.tsx
grep -q 'export const RightColumn' src/components/Coach/RightColumn.tsx
grep -q 'export class GeminiAdapter' mcp-server/src/coach/llm/gemini.ts
grep -q 'export interface LLMAdapter' mcp-server/src/coach/llm/adapter.ts
grep -q 'export function buildSystemPrompt' mcp-server/src/coach/prompts/system.ts
grep -q 'export function createCoachRouter' mcp-server/src/coach/router.ts

# 4. 整合點
grep -q 'RightColumn' src/App.tsx
grep -q 'right: rightColumnWidth' src/App.tsx || grep -q "right: \`\${rightColumnWidth}px\`" src/App.tsx
grep -q "/api/coach" mcp-server/src/index.ts
grep -q 'createCoachRouter' mcp-server/src/index.ts

# 5. 拆兩個 ID 的硬性檢查（防止實作者誤把 clientId 改 localStorage）
grep -q "sessionStorage" src/utils/apiSync.ts
! grep -q "localStorage.getItem('es-client-id')" src/utils/apiSync.ts
! grep -q "localStorage.setItem('es-client-id'" src/utils/apiSync.ts
grep -q "localStorage" src/utils/coachUser.ts
grep -q "es-coach-user-id" src/utils/coachUser.ts

# 6. 沒有把 X-Client-Id 帶進 coach API（避免名稱誤用）
! grep -q "X-Client-Id" src/utils/coachApi.ts
grep -q "X-Coach-User-Id" src/utils/coachApi.ts

# 7. CoachPanel 含 Privacy toggle 關鍵字
grep -q "es-coach-attach-snapshot" src/store/coachStore.ts

# 8. RightColumn 處理小螢幕
grep -q "1280" src/components/Coach/RightColumn.tsx

# 9. DetailPanel 不再自管 fixed 寬度
! grep -q "PANEL_WIDTH_DEFAULT" src/components/DetailPanel/DetailPanel.tsx
! grep -q "es-detail-panel-width" src/components/DetailPanel/DetailPanel.tsx
# Board.tsx 不再 render DetailPanel
! grep -q "<DetailPanel" src/components/Board/Board.tsx

# 10. mcp-server 加依賴
grep -q '"@google/genai"' mcp-server/package.json

# 11. snapshotBuilder 產出 5 步 CoT 框架關鍵字
grep -q "蘇格拉底" mcp-server/src/coach/prompts/system.ts || grep -q "Socratic" mcp-server/src/coach/prompts/system.ts

# 12. 後端啟動測試（GEMINI_API_KEY 缺 → 503）— readiness probe 取代 sleep
# 前置：mcp-server 已 npm install (含 @google/genai 與 nanoid)
( cd mcp-server && env -u GEMINI_API_KEY PORT=3334 npx tsx src/index.ts > /tmp/coach-server.log 2>&1 & echo $! > /tmp/coach-server.pid )
# 等到 port bound 才繼續（最多 15s）
for i in $(seq 1 30); do curl -sf http://localhost:3334/api/board >/dev/null && break; sleep 0.5; done
# 所有 4 個 coach 端點都應 503
for endpoint in \
  "POST /api/coach/message -d '{\"text\":\"hi\",\"clientMessageId\":\"x\"}'" \
  "GET /api/coach/sessions" \
  "GET /api/coach/sessions/abc" \
  "POST /api/coach/sessions/abc/clear"; do
  : # 各 endpoint 應 503；具體寫成獨立 curl call 比對 status code
done
# (簡化：只測 POST /message)
test "$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3334/api/coach/message \
  -H 'Content-Type: application/json' -H 'X-Coach-User-Id: test' \
  -d '{"text":"hi","clientMessageId":"abc"}')" = "503"
kill "$(cat /tmp/coach-server.pid)" 2>/dev/null; rm /tmp/coach-server.pid

# 13. 既有 board sync 驗證仍 PASS（regression check）
grep -qE "sessionStorage\\.getItem\\('es-client-id'\\)|sessionStorage\\.setItem\\('es-client-id'" src/utils/apiSync.ts
grep -q "X-Client-Id" mcp-server/src/index.ts
grep -q "broadcastExcept" mcp-server/src/index.ts
# clientId query param 仍出現在 EventSource 訂閱
grep -q "clientId" src/utils/apiSync.ts

# 14. 共用型別檔
test -f src/types/coach.ts
grep -q 'export interface CoachMessage' src/types/coach.ts
grep -q 'export interface DriftSignal' src/types/coach.ts
grep -q 'clientMessageId' src/types/coach.ts
# coachStore 從 types/coach 而非自身 import forward types
! grep -q "from './coachStore'" src/store/coachStore.ts
grep -q "from '../types/coach'" src/store/coachStore.ts || grep -q 'from "../types/coach"' src/store/coachStore.ts

# 15. coachApi 帶 clientMessageId
grep -q 'clientMessageId' src/utils/coachApi.ts

# 16. router export createDegradedCoachRouter
grep -q 'export function createDegradedCoachRouter' mcp-server/src/coach/router.ts

# 17. LLMAdapter system role 過濾（router 中過濾後才 chat）
grep -qE "filter.*role !== 'system'|role === 'user' \\|\\| .*=== 'assistant'" mcp-server/src/coach/router.ts

# 18. 行為層 unit tests（vitest 或 node:test）— **以下每條都必須有對應 test case**
# (a) sessionStore 並發 append 不丟訊息
# (b) router 缺 X-Coach-User-Id 回 401
# (c) router 跨 user 取 session 回 404
# (d) createDegradedCoachRouter 全 4 端點回 503
# (e) clientMessageId reconcile（mock LLM 回固定字串，驗證 response.userMessage.clientMessageId 與 request 相等）
# (f) abort 行為：mock LLM 模擬中途 abort，驗證 sessionStore 寫入 user + assistant(aborted=true) 兩則訊息，response 回 200
# (g) router 缺 clientMessageId 回 400
test -f mcp-server/src/coach/__tests__/sessionStore.test.ts || test -f mcp-server/src/coach/sessionStore.test.ts
test -f mcp-server/src/coach/__tests__/router.test.ts || test -f mcp-server/src/coach/router.test.ts
( cd mcp-server && npx vitest run --reporter=verbose 2>&1 | tee /tmp/coach-tests.log; grep -q "PASS\\|✓.*passed" /tmp/coach-tests.log || npm test )
```

### Human 補做（需要人類介入）

#### A. Layout 與 Right Column 行為

- [ ] 啟動 dev（前端 + 後端帶 GEMINI_API_KEY），瀏覽器開首頁，**不選 note**：右側 RightColumn 只顯示 CoachPanel 占滿整個欄；左邊緣垂直 ResizeBar 拖曳改寬度，重整後保留
- [ ] 點選一個 Aggregate note：DetailPanel 從上方滑入，CoachPanel 縮到下方；中間水平 ResizeBar 可拖
- [ ] DetailPanel 內 sub-panel（AggregatePanel / DtoPanel / PolicyPanel / InvariantCard / ReturnTypeEditor）所有編輯互動正常（風險 #10 cover 點 b/c）
- [ ] 切換不同 type 的 note（DomainEvent / Command / Aggregate / Dto / Policy）DetailPanel 切換 sub-panel 正常
- [ ] 取消選取（Esc）→ DetailPanel 消失，CoachPanel 占滿
- [ ] 視窗 resize 至 1280px：tab 模式 fallback 啟動，可手動切換 Detail / Coach（風險 #5 cover）
- [ ] 視窗 resize 至 1024px：仍可用，CoachPanel 占滿（無 detail 因 small screen 不渲染 DetailPanel）
- [ ] 視窗 resize 回 1440px：恢復上下分割模式

#### B. Coach 對話流

- [ ] CoachPanel header 看到 Privacy toggle（預設開）+ disclosure 文字「對話與 board summary 會送至 Google Gemini」
- [ ] 第一次發訊息：建新 session，user 訊息立即顯示，loading dots 顯示，2-10s 後 assistant 回覆出現
- [ ] 重整頁面：對話歷史保留（loadCurrentSession 從 localStorage sessionId 還原）
- [ ] 開另一個瀏覽器 tab：看到同一條對話（cross-tab session 共用）
- [ ] 點 Cancel 中止 LLM 回覆：assistant 訊息顯示「(已取消)」灰字
- [ ] 點「開新對話」：messages 清空，下一則訊息建新 session（舊 session 仍在後端，可從 listSessions 看到）
- [ ] 關 Privacy toggle 後再發訊息：CoachPanel 仍可對話，但回覆不應提到具體 board 內容；後端 prompt 含「使用者已關閉 board snapshot 附帶」說明

#### C. Snapshot 與 Drift Detection 質性驗證

- [ ] 加一個 Aggregate「Order」+ 兩個 DomainEvent；對 Coach 問「我目前有什麼 aggregate？」→ reply 應提到 Order
- [ ] 改 Aggregate 名為「Invoice」→ 同 sessionId 再問 → reply 用新名稱（snapshot fresh）
- [ ] 在 Aggregate 加大量 stateProperties 但不加 invariants → 問 Coach「這個 aggregate 設計如何？」→ reply 應提示「沒有 invariants 是 DDD 滑坡訊號」
- [ ] 對 Coach 說「OrderRepository 應該有個 findByEmail 方法」→ reply 應指出 repository 不該是 query 模型，建議走 Read Model（drift detection 質性驗證）
- [ ] 對 Coach 說「我把 customerName 加在 Order aggregate，這樣可以直接 getCustomerName」→ reply 應指出偏向 OOP / read model thinking
- [ ] **判斷 LLM 是否誤判**：使用者明確設計 ReadModel 時 Coach 不應錯說「你在 read model 滑坡」；若誤判頻繁，回 plan 風險 #6 處理

#### D. 跨 Bounded Context 觀察

- [ ] 建兩個 Bounded Context：「Order」與「Logistics」；Order 有 DomainEvent「OrderPlaced」，Logistics 有 Aggregate「ShipmentOrder」reference 此事件
- [ ] 在 Order context 問 Coach「OrderPlaced 後續會被誰處理？」→ reply 應提到 Logistics（snapshot 中的 adjacentContexts）

#### E. 錯誤態 / 隱私

- [ ] 後端啟動不帶 GEMINI_API_KEY：CoachPanel 顯示「Coach 未配置」灰底，input disabled，不 crash
- [ ] 模擬 LLM 失敗（暫時擋 Gemini API URL 或設無效 key）：CoachPanel 顯示紅色錯誤橫條 + 重試按鈕，不 crash
- [ ] 切換 Privacy toggle 多次，重整後保留狀態
- [ ] 第一次開 CoachPanel 時 disclosure 顯著可見（user 至少能注意到資料會送 Google）

#### F. 既有功能回歸（不可破）

- [ ] **cross-tab board sync 仍正常**：tab A 加一個 note → tab B 透過 SSE 立即看到（風險 #10 之 a：apiSync 未動 = 既有 broadcastExcept 仍正確）
- [ ] **MCP tools 仍正常**：透過 Claude Code / Codex 呼叫 `es_add_note`、`es_get_board` 等正常運作
- [ ] **Board 拖曳 / link 建立 / phase / path filter 等既有互動**全部正常（Board.tsx 的 DnDContext 仍在）
- [ ] **DevTools console 全程無錯誤**

---

## 已知限制

- **X-Coach-User-Id 不是真實認證**：P1 假設使用者在自己的本機跑 Cosmogony，server 信任 header 值作為使用者區分鍵；多人共用同 server 場景**沒有**安全隔離保證。P2/P3 補真實 auth（JWT / session cookie），下游 sessionStore 介面不變（getCoachUserId 抽象）
- **單一 process 限定**：sessionStore 用 in-memory mutex 保護寫入，multi-process（relay mode）下會撞檔案 race。**P3 必須切 SQLite**才能解；P1 文件警告，不解決
- **無 streaming**：LLM 回應同步等 2-10s；使用者只能 Cancel 不能看部分回覆。streaming 列入 P2/P3 future
- **無 rate limit**：API key 共用 quota，某 user 短時間連發可能爆 quota。上線前必須補（spec 範圍外）
- **無歷史對話 panel**：只有 currentSession 在前端可見；舊 session 在後端 `data/coach/sessions/*.json`，可透過 `GET /api/coach/sessions` 列出但前端無 UI（P2 補）
- **Snapshot 不含完整跨 context 內容**：只給 `AdjacentContextRef`（名稱 + aggregate names + shared events/policies），跨 context 完整查詢列入 P2+
- **無 markdown / code highlight 渲染**：assistant 訊息純文字
- **小螢幕 tab 模式**：<1280px 時 DetailPanel 與 CoachPanel 不能同時看到，需手動切；切走的 tab **不 unmount**（用 `hidden` style），保留 selection / Esc listener / input draft；切回時 focus restore 到上一個 active 元件（fallback 到 `tabIndex={-1}` 容器）
- **Drift detection rule 為簡化版**：只有 6 種 cheap signal；複雜 trend signal（mutation history）需 P2
- **Hash collision 風險**：boardSnapshotHash 用簡化 string hash 而非 SHA-256（避免 async builder），碰撞極低但理論存在；只影響 unchanged 偵測，不影響正確性
- **DetailPanel 寬度 migration**：legacy `es-detail-panel-width` 讀進來當 `es-right-column-width` 預設值，不刪舊 key；user 若 rollback 會看到舊寬度，可接受
- **Board.tsx 移除 DetailPanel mount + DetailPanel always-mounted**：屬於非平凡重構；DetailPanel 改 props 控但保留所有 useEffect lifecycle；回歸測試覆蓋 4 點（A 段最後 4 條），務必驗 Esc 關閉、deleted-element selection cleanup、子面板互動
- **StrictMode 雙 mount 防呆**：`loadCurrentSession` 用 in-memory ref guard（不可只靠 `[]` deps），避免 dev mode 雙觸發建兩個 session
- **`@google/genai` API surface 假設**：實作時若 SDK 真實 API 與 spec 中 pseudocode 不符，以實際 package types 為準調整（仍維持 `chat()` 抽象介面不變）
- **system prompt 草稿讀取路徑**：預設 `mcp-server/data/coach/system_prompt.md`；user 需自行 copy 既有草稿到該路徑或設 `COACH_SYSTEM_PROMPT_FILE` env
- **依賴關係**：無前置 task。需先安裝 `@google/genai` 套件（`cd mcp-server && npm install`）
