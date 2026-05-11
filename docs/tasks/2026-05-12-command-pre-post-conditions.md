# Command preCondition / postCondition 欄位設計

## 來源

討論：`docs/discussions/2026-05-12-command-pre-post-conditions.md`（4 輪 Magi，13 個決策紀錄 D1-D13）

## 目標

為 Command 便條紙新增 `preConditions` / `postConditions` 欄位，讓 DDD 建模時可以對應 Hoare triple `{P} c {Q}` 三段式表達「前置狀態 → 命令 → 後置狀態」。欄位以結構化條目（非整批 schema）形式存在，每條 preCondition 可選擇連結到 Aggregate invariant 做 traceability。新增 2 個 MCP tool（`es_add_command_condition` additive 在 Spec B 暴露給 Coach、`es_update_command_conditions` mutate 推 Spec C），讓 AI 教練在領域探索階段就能漸進增補 condition。

---

## 介面合約（Interface Contract）

### 1. `src/types/elements.ts`（修改）— 新增 `CommandCondition` 型別、擴充 `StickyNote`

```typescript
/**
 * 一條 Command 的 pre/post condition。dogfood 階段以自然語言文字為主；
 * preCondition 可選擇連結 Aggregate invariant 做 traceability。
 */
export interface CommandCondition {
  id: string;                 // 穩定 uuid，給 diff / cross-ref 用
  text: string;               // 自然語言描述（中英文皆可）
  invariantId?: string;       // 只 pre 用 — 連結同 board 上的 Aggregate invariant id
  _brokenInvariantLink?: {    // soft-null：cascade delete 時保留歷史軌跡（D7）
    previousId: string;
    deletedAt: string;        // ISO8601
  };
}
```

`StickyNote` 新增兩個欄位（**只對 `type === 'Command'` 有意義**，其他 type 應為 undefined）：

```typescript
preConditions?: CommandCondition[];
postConditions?: CommandCondition[];
```

**Non-goal**：`postCondition.eventId`（指向 resulting DomainEvent）延 v17.1，本 spec 不上。

### 2. `src/store/boardStore.ts`（修改）— v16 → v17 migration

`version: 17`，`migrate(persistedState, version)` 既有 chain 末加上：

```typescript
if (version < 17) {
  // v16 → v17: Add preConditions / postConditions arrays to Command notes
  // Pure additive — default []. Other note types stay undefined.
  const state = persistedState as { project?: { boards?: Array<{ notes?: StickyNote[] }> } };
  const boards = state.project?.boards ?? [];
  for (const board of boards) {
    for (const note of board.notes ?? []) {
      if (note.type === 'Command') {
        if (note.preConditions === undefined) (note as StickyNote).preConditions = [];
        if (note.postConditions === undefined) (note as StickyNote).postConditions = [];
      }
    }
  }
}
```

**Migration 不變量**：
- 純 additive：default `[]`，未存在的 note 對待 = 空 array（不破壞既有 export bundle）
- 不修改非 Command type 的 note
- 不修改 note count、id、position、其他既有欄位
- 預設值用 `[]` 而非 `undefined`：UI 渲染分支簡單（`array.length === 0` 顯示 collapsed empty state）

### 3. `src/types/board.ts`（修改）+ `src/store/boardStore.ts`（修改）— 新增 store actions

**`BoardStore` interface（在 `src/types/board.ts`）必須加上**（**audit HIGH-4** — 否則 `useBoardStore()` 型別少方法 → tsc 失敗）：

```typescript
addCommandCondition(commandNoteId: string, kind: 'pre' | 'post', condition: Omit<CommandCondition, 'id'> & { id?: string }): void;
updateCommandConditions(commandNoteId: string, preConditions?: CommandCondition[], postConditions?: CommandCondition[]): void;
deleteCommandCondition(commandNoteId: string, kind: 'pre' | 'post', conditionId: string): void;
```

**`boardStore.ts` 實作這 3 個 action**：
- `addCommandCondition` — append 一條到 pre/post array；若無 id 則自動產生 uuid；更新 note.updatedAt + board.updatedAt + project.updatedAt
- `updateCommandConditions` — 整批替換 pre/post array（任一參數 undefined = 不動）
- `deleteCommandCondition` — by id 移除

### 3a. `src/store/boardStore.ts`（修改）— Command creation path 初始化空 array（**audit HIGH-1**）

既有 Command 創建路徑必須在創建瞬間補上 `preConditions: []` 與 `postConditions: []`，否則新 Command 沒有 array 欄位（migration 只 cover 既有 data）：

- **`addNote(note)` action**：若 `note.type === 'Command'`，set 預設 `preConditions: note.preConditions ?? []` 與 `postConditions: note.postConditions ?? []`。
- **`addCommandForEvent(eventNoteId, commandLabel, information)` action**：建立 Command note 時直接初始化兩個 array 為 `[]`。

**契約**：所有未來新增的 Command creation path 都必須遵守此規則（include `addActorBoard`-internal-created Commands 等）。BE 端 mirror 同樣規則：`handle_es_add_note`（type='Command' 時）+ `handle_es_add_command_for_event` 也要初始化 — 見 §7 末段。

### 4. `src/store/boardStore.ts`（修改）— FE `deleteInvariant` cascade reverse-lookup（D7 — P0）

`deleteInvariant(noteId, invariantId)` 既有 immer recipe 中、**共用既有 action 內已產生的 timestamp**（避免 LOW-1 多 timestamp 不一致），追加：

```typescript
// Cascade: scan all Command notes; if any preCondition references the deleted invariantId,
// soft-null + mark _brokenInvariantLink for UI ⚠️ flag (D7).
// `now` 是該 action 既有的 timestamp 變數（既有 deleteInvariant 已建立）
for (const board of state.project.boards) {
  for (const note of board.notes) {
    if (note.type !== 'Command' || !note.preConditions) continue;
    for (const pre of note.preConditions) {
      if (pre.invariantId === invariantId) {
        pre._brokenInvariantLink = { previousId: invariantId, deletedAt: now };
        pre.invariantId = undefined;
        note.updatedAt = now;
        board.updatedAt = now;
      }
    }
  }
}
```

**契約**：
- cascade scan **必須** 在 deleteInvariant 同一次 immer recipe 中完成（不能 dispatch 第二個 action，否則中間狀態會洩漏到 SSE）
- 整個 action（含 cascade）共用單一 `now` timestamp（與 `project.updatedAt` 既有設定點對齊）

### 4a. `mcp-server/src/coach/tools/handlers.ts`（修改）— BE `handle_es_delete_invariant` cascade（**audit HIGH-2**）

FE cascade 只解 React UI；當 Coach 透過 MCP 呼叫 `es_delete_invariant` 時，BE 必須做同樣 cascade，否則 BE 寫入的 `project.json` 會留 dangling `invariantId`，且 SSE 不會通知 FE 受影響的 Command notes。

**修改 `handle_es_delete_invariant`**：在現有 invariant 移除邏輯之後、`return` 之前追加：

```typescript
const now = ctx.now();
const cascadeEvents: BroadcastEvent[] = [];
for (const board of ctx.projectState.boards) {
  for (const cmdNote of board.notes) {
    if (cmdNote.type !== 'Command' || !cmdNote.preConditions) continue;
    let changed = false;
    for (const pre of cmdNote.preConditions) {
      if (pre.invariantId === invariantId) {
        pre._brokenInvariantLink = { previousId: invariantId, deletedAt: now };
        pre.invariantId = undefined;
        changed = true;
      }
    }
    if (changed) {
      cmdNote.updatedAt = now;
      board.updatedAt = now;
      cascadeEvents.push({
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: cmdNote.id, preConditions: cmdNote.preConditions },
      });
    }
  }
}
// existing events ... 後加上 ...cascadeEvents
```

**契約**：cascade 事件與既有 `update_note`（aggregate 的 invariants 變動）一起 emit 在 `post-commit` phase，FE 收到後依序 dispatch；無重複 SSE 廣播 race。

### 5. `mcp-server/src/coach/agent/pendingActions.ts`（修改）— `stableSubset` 納入新欄位（D8）

```typescript
function stableSubset(note: ProjectSnapshot['boards'][number]['notes'][number]) {
  return {
    type: note.type,
    label: note.label,
    commandId: note.commandId ?? null,
    entityId: note.entityId ?? null,
    eventProperties: note.eventProperties ?? [],
    dtoFields: note.dtoFields ?? [],
    invariants: note.invariants ?? [],
    // Spec C-ready (v17): include condition arrays so CAS reverify catches stale state
    preConditions: note.preConditions ?? [],
    postConditions: note.postConditions ?? [],
  };
}
```

**Type 影響**：`ProjectSnapshot['boards'][number]['notes'][number]` 的 inline type 也要加 `preConditions?: unknown[]` 與 `postConditions?: unknown[]`（與既有 `dtoFields?`/`invariants?` 同寫法）。

**契約**：hash **整個 array 序列化結果**，不可只 hash 改動項。並發改寫場景下任何條目順序變動都應觸發 stale。

### 6. BE 型別鏡像（**audit HIGH-5** — 拆兩處）

BE 的 `StickyNote` interface 並**不**住在 `mcp-server/src/coach/types.ts`，而是住在 `mcp-server/src/coach/tools/handlers.ts`（同檔最上方 export）。為避免修錯地方：

- **`mcp-server/src/coach/tools/handlers.ts`**：在既有 `export interface StickyNote { ... }` 內加 `preConditions?: CommandCondition[]` 與 `postConditions?: CommandCondition[]`；並 export `CommandCondition` interface（與 §1 等價，BE 完整 mirror）。
- **`mcp-server/src/coach/types.ts`**：保持不動（這檔是 session / CoachMessage 共用 mirror，不含 StickyNote）。

**契約**：FE 與 BE 的 `CommandCondition` 必須欄位完全對齊（含 `_brokenInvariantLink` 形狀）。

### 7. `mcp-server/src/coach/tools/handlers.ts`（新增 2 個 handler）

```typescript
// ─── Handlers — Command conditions（D6 split pair） ────────────────────────

export interface EsAddCommandConditionArgs {
  commandNoteId: string;
  kind: 'pre' | 'post';
  condition: Omit<CommandCondition, 'id'> & { id?: string };
}

export const handle_es_add_command_condition: ToolHandler<EsAddCommandConditionArgs> = (
  { commandNoteId, kind, condition },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === commandNoteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Command note ${commandNoteId} not found.` },
    };
  }
  if (note.type !== 'Command') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${commandNoteId} is not a Command (type: ${note.type}).` },
    };
  }

  // invariantId 驗證（audit MED-4）：
  // - kind='post' 不允許 invariantId（語意上只有 pre 連結 invariant）
  // - kind='pre' + 有提供 invariantId → target 必須存在且屬於某 Aggregate
  if (kind === 'post' && condition.invariantId) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: `postCondition must not carry invariantId (linkage only applies to pre).` },
    };
  }
  if (kind === 'pre' && condition.invariantId) {
    const referenced = board.notes.some(
      (n) => n.type === 'Aggregate' && (n.invariants ?? []).some((inv) => inv.id === condition.invariantId),
    );
    if (!referenced) {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: { code: 'NOT_FOUND', message: `Invariant ${condition.invariantId} not found in any Aggregate.` },
      };
    }
  }

  const newCondition: CommandCondition = {
    ...condition,
    id: condition.id ?? uuidv4(),
  };

  const arrayKey = kind === 'pre' ? 'preConditions' : 'postConditions';
  if (!note[arrayKey]) note[arrayKey] = [];
  note[arrayKey]!.push(newCondition);

  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  return {
    ok: true,
    resultJson: { success: true, conditionId: newCondition.id },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: commandNoteId, [arrayKey]: note[arrayKey] },
      },
    ],
  };
};

export interface EsUpdateCommandConditionsArgs {
  commandNoteId: string;
  preConditions?: CommandCondition[];
  postConditions?: CommandCondition[];
}

export const handle_es_update_command_conditions: ToolHandler<EsUpdateCommandConditionsArgs> = (
  { commandNoteId, preConditions, postConditions },
  ctx,
) => {
  // NOT_FOUND / INVALID_TYPE 檢查同上
  // 整批替換：undefined = 不動，[] = 清空（含 broken-link flag 也清掉）
  // 額外驗證（audit MED-4）：postConditions[] 中若有任何 entry 帶 invariantId → PRECONDITION_FAILED
  // SSE emit policy（audit MED-2）：**單一** update_note payload 同時帶兩個 array（若有任一改動）
  //   payload = { id: commandNoteId, preConditions: <new or unchanged>, postConditions: <new or unchanged> }
  //   FE 收到後用 Object.assign 既有 shallow-merge pattern 直接覆蓋
};
```

### 7a. `handle_es_add_note` / `handle_es_add_command_for_event`（**audit HIGH-1**）

BE 創建 Command path 必須初始化兩個 array：

- **`handle_es_add_note`**：若 `args.type === 'Command'`，建立 note 時 set `preConditions: []` / `postConditions: []`。
- **`handle_es_add_command_for_event`**：建立 Command note 時直接初始化兩個 array 為 `[]`。

跟 FE §3a 對稱；migration 路徑只 cover 既有 data，新建路徑必須自帶。

**錯誤回傳契約**：
- `NOT_FOUND`：Command note 不存在 / invariantId 不存在
- `INVALID_TYPE`：note 存在但 type !== 'Command'

**Broadcast policy**：`'standard'`（post-commit only，跟 invariant handlers 一致）。

### 8. `mcp-server/src/coach/tools/toolDefinitions.ts`（修改）— 註冊 2 個新 tool

加在 invariant tools 旁（順序：……, `es_add_invariant`, `es_update_invariant`, **`es_add_command_condition`**, **`es_update_command_conditions`**, ……）：

```typescript
{
  name: 'es_add_command_condition',
  description: 'Append a single pre/post condition to a Command note. Used when discovering edge cases incrementally during domain modeling.',
  schema: {
    commandNoteId: z.string(),
    kind: z.enum(['pre', 'post']),
    condition: z.object({
      id: z.string().optional(),
      text: z.string(),
      invariantId: z.string().optional(),
    }),
  },
  handler: handle_es_add_command_condition as ToolHandler<unknown>,
  policy: 'standard',
  risk: 'additive',
},
{
  name: 'es_update_command_conditions',
  description: 'Batch-replace pre and/or post conditions on a Command note. undefined means no change; [] means clear.',
  schema: {
    commandNoteId: z.string(),
    preConditions: z.array(z.object({
      id: z.string(),
      text: z.string(),
      invariantId: z.string().optional(),
    })).optional(),
    postConditions: z.array(z.object({
      id: z.string(),
      text: z.string(),
      invariantId: z.string().optional(),
    })).optional(),
  },
  handler: handle_es_update_command_conditions as ToolHandler<unknown>,
  policy: 'standard',
  risk: 'mutate',
},
```

**Risk 分配契約**：
- `es_add_command_condition` = `'additive'` → 由 `EventStormingSkill.buildDeclarations()` filter 自動納入暴露範圍
- `es_update_command_conditions` = `'mutate'` → Spec B **不暴露**給 Coach；Spec C 再評估
- 38 tools → 40 tools；risk 分布從 (read 3 / additive 9 / mutate 14 / destructive 1 / unset 11) 變為 (read 3 / additive 10 / mutate 15 / destructive 1 / unset 11)

### 9. `mcp-server/src/coach/skills/eventStormingSkill.ts`（修改）— `describeProposal` 加新 case

```typescript
case 'es_add_command_condition': {
  const cmdId = typeof a.commandNoteId === 'string' ? a.commandNoteId : '';
  targetIds = cmdId ? [cmdId] : [];
  const cmdLabel = findLabel(cmdId) ?? cmdId;
  const cond = (a.condition ?? {}) as Record<string, unknown>;
  const kind = a.kind === 'pre' ? '前置狀態' : '執行後狀態';
  const text = String(cond.text ?? '(unnamed condition)');
  subjectLabel = `${kind} "${text.slice(0, 40)}"`;
  humanSummary = `在 Command "${cmdLabel}" 加 ${kind}：${text}`;
  break;
}
```

**targetIds 契約**：始終 `[commandNoteId]`（CAS reverify 比對 Command 的 stableSubset；既有 condition 變動會觸發 stale）。

### 10. `src/components/DetailPanel/DetailPanel.tsx`（修改）— `GroupPanel` 加 Pre / Post 兩段 collapsible（D3）

既有 `GroupPanel` 中 Command-related section 的渲染順序：
```
Command label → Information (Command Input) → Event Output → ...
```
（錨點：`<SectionLabel>Command</SectionLabel>` → `<SectionLabel>Information (Command Input)</SectionLabel>` → `<SectionLabel>Event Output</SectionLabel>`）

改為：
```
Command label
→ Pre-conditions（新，collapsible）
→ Information (Command Input)（既有，non-collapsible）
→ Post-conditions（新，collapsible）
→ Event Output（既有）
→ ...
```

**Collapsible 行為**：
- Default expanded：當 `preConditions?.length > 0` 或 `postConditions?.length > 0`
- Default collapsed：當 empty array（顯示 `+ 新增條件` 按鈕作 entry point）
- 收合時 **unmount inputs entirely**（不是 `display: none`，避免 a11y tabbing 進入隱藏元素）
- 用 `aria-expanded={isOpen}` 在 header；不需 `tabIndex={-1}`

**SectionLabel 中文化**：
- `<SectionLabel>前置狀態（Pre-conditions）</SectionLabel>`
- `<SectionLabel>執行後狀態（Post-conditions）</SectionLabel>`

**Inline help（`?` icon）**：tooltip 顯示一句範例，例：「PlaceOrder 的 precondition：『顧客信用額度 ≥ 訂單金額』」。

**Tab order**：跟視覺順序一致（Pre → Info → Post）；既有 Information section 是 non-collapsible plain div，DOM 自然順序就能滿足，**不需要** 任何 tabIndex tricks。

### 11. `src/components/DetailPanel/`（新增）— `CommandConditionEditor` 元件

```typescript
interface CommandConditionEditorProps {
  conditions: CommandCondition[];
  allAggregateInvariants: Array<{ id: string; title: string; aggregateLabel: string }>;
  kind: 'pre' | 'post';
  onChange: (next: CommandCondition[]) => void;
}
```

**渲染**：
- 每條 row：`text` 輸入框（textarea autosize）+（kind='pre' 時）invariantId 下拉 + hover trash delete
- `+ 新增條件` 按鈕 append 空 condition
- 若 `_brokenInvariantLink` 存在 → 顯示 ⚠️ icon + tooltip「原 invariant 已刪除」（D7 UI）

**Invariant 下拉資料來源**：scan all Aggregate notes 收集 `invariants[]`，flatten 為 `{ id, title, aggregateLabel }` 列表。

### 12. `src/utils/markdownExporter.ts`（修改）— Command 段加 Pre/Post block（D5）

既有 `Domain Event Flows` 段內，每個 event 的 `Command` block（`if (event.commandId)` 分支內）後加：

```typescript
if (cmdNote.preConditions && cmdNote.preConditions.length > 0) {
  lines.push(`- **Preconditions**:`);
  for (const pre of cmdNote.preConditions) {
    let line = `  - ${pre.text}`;
    if (pre.invariantId) {
      const invMatch = findInvariantById(board, pre.invariantId);
      if (invMatch) line += ` _(links to invariant: ${invMatch.title})_`;
    }
    if (pre._brokenInvariantLink) line += ` _(⚠️ broken link to deleted invariant)_`;
    lines.push(line);
  }
}
```

`postConditions` 同樣 pattern，title `**Postconditions**`，無 invariantId 邏輯（post 沒有 invariantId 欄位）。

**插入點**：`Command` block 結束（即 `cmdNote.information` 渲染後）→ **Preconditions** → 接著渲染 `Event Properties` / `Entity/Aggregate` / `Links` 等 → **Postconditions** 放在 Command/Information 之後、Event Output 之前，與 UI Hoare ordering 一致。

（注意：markdownExporter 既有結構是以 DomainEvent 為錨點、Command 是 sub-item。Pre/Post 應放在 Command sub-block 內部，緊鄰 Information / Event Properties。最終樣式由實作驗證。）

### 13. `src/utils/aiPromptBuilder.ts`（**不改動** — audit MED-1）

實際 `aiPromptBuilder` 是 `markdownExporter(board)` 的 thin wrapper（包 raw board JSON + markdown summary），不維護自己的 Command-section ordering。**Hoare ordering 責任完全集中在 §12 `markdownExporter`**，aiPromptBuilder 透過引用 markdownExporter 自動帶到正確順序。

**契約**：本 task **不**修改 `aiPromptBuilder.ts`；驗收標準不檢查此檔變動。

### 14. `src/types/bundle.ts`（修改）— `UseCaseSpec` 擴充

```typescript
export interface UseCaseSpec {
  kind: 'UseCaseSpec';
  useCaseSpecId: string;
  aggregateSpecId?: string;
  useCase: string;
  behavior?: string;
  aggregate?: string;
  paths?: string[];
  input: SpecProperty[];
  // Spec B v17 additions：
  preconditions: SpecCondition[];   // 必填（即使是空 array）
  postconditions: SpecCondition[];
  emittedEvent: string;
  eventPayload: SpecProperty[];
  links?: SpecLink[];
  _suggested_aggregateId?: string;
  _suggested_method?: string;
  _suggested_domainEvent?: string;
  _suggested_repository?: string;
}

export interface SpecCondition {
  text: string;
  invariantSpecId?: string;  // 若 invariantId 在當前 bundle 中對應某個 AggregateSpec invariant
}
```

**SpecCondition vs CommandCondition**：bundle 是匯出格式、不需要 dogfood-only 的 `_brokenInvariantLink` 與 sticky-note level `id`。`invariantId`（runtime）→ `invariantSpecId`（spec-level cross-ref）。

### 15. `src/utils/jsonExporter.ts`（修改）— `buildUseCaseSpec` 帶兩個新欄位 + 更新 `pruneEmpty` keepKeys

**audit HIGH-3**：`jsonExporter` 用 `pruneEmpty(spec, keepKeys)` 機制處理 empty array — 不在 `keepKeys` 裡的空 array 會被 strip。spec 契約要求 `preconditions` / `postconditions` **即使是空也保留 `[]`**，因此必須加入 `keepKeys`：

```typescript
return pruneEmpty(spec, ['input', 'eventPayload', 'preconditions', 'postconditions']);
```

既有 `buildUseCaseSpec` function body 中：

```typescript
const input = toSpecProperties(commandNote?.information);
// ...
const spec: UseCaseSpec = {
  kind: 'UseCaseSpec',
  // ...
  input,
  emittedEvent: eventLabel,
  // ...
};
```

加：

```typescript
const preconditions: SpecCondition[] = (commandNote?.preConditions ?? []).map((c) => ({
  text: c.text,
  invariantSpecId: c.invariantId,  // 直接帶 runtime id；下游可選擇 resolve 為 SpecId
}));

const postconditions: SpecCondition[] = (commandNote?.postConditions ?? []).map((c) => ({
  text: c.text,
}));

// 插入 spec object：
preconditions,
postconditions,
```

**契約**：commandNote 不存在時兩個 array 都填 `[]`（不是 undefined）。

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/types/elements.ts` | 加 `CommandCondition` 型別；`StickyNote` 加 `preConditions?` / `postConditions?` |
| `src/types/bundle.ts` | `UseCaseSpec` 加 `preconditions` / `postconditions`；新 `SpecCondition` 型別 |
| `src/types/board.ts` | `BoardStore` interface 加 3 個新 action 簽名（**audit HIGH-4**） |
| `src/store/boardStore.ts` | bump version 16→17；加 v17 migration；實作 3 個新 actions；**Command creation paths（`addNote`/`addCommandForEvent`）必須初始化兩個 array 為 `[]`（HIGH-1）**；`deleteInvariant` 加 cascade reverse-lookup |
| `src/store/__tests__/boardStore.test.ts` | 加 v16→v17 migration test + 新 actions happy-path test（重用既有 boardStore.test.ts；**audit HIGH-6** — FE 無獨立 migration test file，整合進既有 test，避免新建獨立 test infra） |
| `src/utils/markdownExporter.ts` | DomainEvent 段內 Command sub-block 加 Preconditions / Postconditions bullet list（Hoare ordering 集中於此） |
| `src/utils/jsonExporter.ts` | `buildUseCaseSpec` 帶兩個新欄位；`pruneEmpty` keepKeys 加 `'preconditions'` / `'postconditions'`（**audit HIGH-3** — 否則空 array 會被 strip） |
| `src/components/DetailPanel/DetailPanel.tsx` | `GroupPanel` 在 Information section 前後加 collapsible Pre / Post sections |
| `src/components/DetailPanel/CommandConditionEditor.tsx` (新檔) | 兩段共用編輯元件 — text textarea + invariantId 下拉 + delete |
| `mcp-server/src/coach/tools/handlers.ts` | 加 `handle_es_add_command_condition` + `handle_es_update_command_conditions`；對應 args interface；**`StickyNote` interface 加 preConditions/postConditions（HIGH-5）**；**`handle_es_add_note` / `handle_es_add_command_for_event` 創建 Command 時初始化兩個 array（HIGH-1）**；**`handle_es_delete_invariant` 加 cascade reverse-lookup（HIGH-2）** |
| `mcp-server/src/coach/tools/__tests__/handlers.test.ts` | 新增兩個新 handler 的 happy / NOT_FOUND / INVALID_TYPE 測試（共 6+ case）；`handle_es_delete_invariant` cascade test；postCondition 帶 invariantId → PRECONDITION_FAILED test |
| `mcp-server/src/coach/tools/toolDefinitions.ts` | 註冊 2 個新 tool（risk: additive + mutate） |
| `mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts` | 更新 EXPECTED_NAMES（38→40）+ 更新 risk distribution 斷言（additive 9→10, mutate 14→15） |
| `mcp-server/src/coach/agent/pendingActions.ts` | `stableSubset` 納入 `preConditions` / `postConditions`；`ProjectSnapshot` notes type 加兩個 optional 欄位 |
| `mcp-server/src/coach/__tests__/pendingActions.test.ts` | 加 CAS reverify 對 condition 變動的測試（新增/刪除/重排 conditions → hash 變）（**audit MED-3** — 既有路徑是 `__tests__/`，不是 `agent/__tests__/`） |
| `mcp-server/src/coach/skills/eventStormingSkill.ts` | `describeProposal` 加 `es_add_command_condition` case（targetIds + label） |
| `mcp-server/src/coach/__tests__/eventStormingSkill.test.ts` | 加 describeProposal `es_add_command_condition` 的測試 |

---

## 實作步驟

### Step 0 — Types + migration + store actions（前端基礎）

1. **`src/types/elements.ts`**：依 §1 加 `CommandCondition` interface 與 `StickyNote` 新欄位。
2. **`src/types/bundle.ts`**：依 §14 加 `SpecCondition` + 擴 `UseCaseSpec`。
3. **`src/types/board.ts`**（audit HIGH-4）：在 `BoardStore` interface 加 3 個新 action 簽名（§3）。**先做這步**，否則 store 實作時 typescript 會擋。
4. **`src/store/boardStore.ts`**：
   - `version: 16` → `version: 17`
   - 在 migrate function 末加 v16→v17 邏輯（§2）
   - 實作 3 個 action：`addCommandCondition` / `updateCommandConditions` / `deleteCommandCondition`（§3）
   - **`addNote` action**（既有）：若 `note.type === 'Command'`，set 預設 `preConditions: note.preConditions ?? []` 與 `postConditions: note.postConditions ?? []`（§3a / audit HIGH-1）
   - **`addCommandForEvent` action**（既有）：建立 Command note 時直接初始化兩個 array 為 `[]`（§3a / audit HIGH-1）
   - `deleteInvariant` 內 cascade reverse-lookup（§4），共用既有 `now` 變數（audit LOW-1）
5. **FE 既有 `boardStore.test.ts` 內**（audit HIGH-6 — 不開新 test file，整合進既有）加：
   - v16→v17 migration test：inline 一個 minimal Command-bearing project（不依賴 `mcp-server/data/project.json` 外部 path）→ run migrate(persistedState, 16) → 斷言每個 Command note 都有 `preConditions: []` 與 `postConditions: []`；非 Command type note 兩欄位仍 undefined；note count / id / position / label 不變
   - 3 個新 store action happy-path test（add / update / delete condition）
   - `deleteInvariant` cascade test：preCondition.invariantId match → 變 `_brokenInvariantLink`
6. **驗證**：`npx tsc -b` 全乾淨；既有 + 新 boardStore tests 全綠（FE 既有有用 vitest，可以跑 `cd ./ && npx vitest run src/store/__tests__/boardStore.test.ts`）。

### Step 1 — Backend handlers + tool registration

1. **`mcp-server/src/coach/tools/handlers.ts`**（**audit HIGH-5**：BE `StickyNote` 在這檔，不在 `coach/types.ts`）：
   - 既有 `export interface StickyNote { ... }` 加 `preConditions?: CommandCondition[]` 與 `postConditions?: CommandCondition[]`
   - export `CommandCondition` interface（與 FE §1 對齊，含 `_brokenInvariantLink`）
   - 加 `handle_es_add_command_condition`（§7）— NOT_FOUND/INVALID_TYPE 驗證 + invariantId 存在性檢查 + `kind='post'` 帶 invariantId 拒絕（audit MED-4）
   - 加 `handle_es_update_command_conditions`（§7）— 整批替換語意；單一 `update_note` payload 同時帶兩個 array（audit MED-2）；undefined = 不動、[] = 清空（含 broken-link flag）
   - **修 `handle_es_add_note`**：若 `args.type === 'Command'`，初始化兩個 array 為 `[]`（§7a / audit HIGH-1）
   - **修 `handle_es_add_command_for_event`**：建立 Command note 時直接初始化兩個 array 為 `[]`（§7a / audit HIGH-1）
   - **修 `handle_es_delete_invariant`**：在現有 invariant 移除邏輯後追加 cascade reverse-lookup，emit cascade events（§4a / audit HIGH-2）
2. **`mcp-server/src/coach/tools/__tests__/handlers.test.ts`**：
   - `handle_es_add_command_condition`：happy（'pre' + 'post' 各一）、NOT_FOUND（commandNoteId）、INVALID_TYPE（target 是 DomainEvent）、invariantId NOT_FOUND、**postCondition 帶 invariantId → PRECONDITION_FAILED**（audit MED-4）
   - `handle_es_update_command_conditions`：happy（同時更新 pre + post，**斷言單一 update_note** — audit MED-2）、partial（只給 preConditions）、clear（給 []）、NOT_FOUND
   - **`handle_es_delete_invariant` cascade test**（audit HIGH-2）：先建 Command preCondition 連結 invariant → 刪 invariant → 斷言 Command note `preConditions[i]._brokenInvariantLink` 已設 + `invariantId === undefined` + 該 Command 也 emit `update_note` event
   - **`handle_es_add_note` / `handle_es_add_command_for_event` 創建 Command 後**：斷言 `preConditions === []` && `postConditions === []`（audit HIGH-1）
3. **`mcp-server/src/coach/tools/toolDefinitions.ts`**：依 §8 註冊 2 個新 tool；位置插在 `es_update_invariant` 之後（讓 invariant 相關 tool 連在一起讀）。
4. **`mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts`**：更新：
   - `EXPECTED_NAMES` 加 2 個 name → length 38 → 40
   - distribution 斷言 `{ read: 3, additive: 10, mutate: 15, destructive: 1, unset: 11 }`
   - additive exact set 加 `es_add_command_condition`
   - mutate exact set 加 `es_update_command_conditions`
5. **驗證**：`cd mcp-server && npx tsc --noEmit && npx vitest run` 全綠（包含新增 6+ 個 handler test + cascade test + creation-path test + 4 個 risk-distribution assertion update）。

### Step 2 — Coach Skill + Pending CAS reverify 整合

1. **`mcp-server/src/coach/agent/pendingActions.ts`**：
   - `stableSubset` 加 `preConditions: note.preConditions ?? []` + `postConditions: note.postConditions ?? []`（§5）
   - `ProjectSnapshot` inline type 補 `preConditions?: unknown[]` + `postConditions?: unknown[]`
2. **`mcp-server/src/coach/__tests__/pendingActions.test.ts`**（audit MED-3 — 既有真實路徑）：
   - 加 `computeTargetEntityHash` 對 conditions 變動的 case：propose action → 同 sessionId 不動 → hash 不變；外部對 target Command 加一條 preCondition → hash 變
3. **`mcp-server/src/coach/skills/eventStormingSkill.ts`**：
   - `describeProposal` 加 `case 'es_add_command_condition'` 的分支（§9）— targetIds=`[commandNoteId]`，subjectLabel 用中英混合的「前置狀態 / 執行後狀態」
4. **`mcp-server/src/coach/__tests__/eventStormingSkill.test.ts`**：
   - 加 1 個 test：`describeProposal('es_add_command_condition', { commandNoteId, kind, condition })` 回傳 targetIds 包含 commandNoteId
   - 確認 `buildDeclarations()` 數量從 12 → 13（read 3 + additive 9 + 1 new additive）
5. **驗證**：`cd mcp-server && npx tsc --noEmit && npx vitest run` 198+ 全綠（既有 198 + 至少 5 個新 test）。

### Step 3 — Frontend UI（DetailPanel）

1. **新增 `src/components/DetailPanel/CommandConditionEditor.tsx`**：依 §11 實作
   - Props 含 `conditions` / `allAggregateInvariants` / `kind` / `onChange`
   - 渲染：textarea autosize（重用既有 textarea pattern，禁止引入新 lib）+（kind='pre' 時）invariantId `<select>` + hover delete button
   - broken-link UI：`_brokenInvariantLink` 存在時，invariantId 旁顯示 ⚠️ + tooltip 文字「原 invariant 已刪除於 X」
   - `+ 新增條件` 按鈕：append `{ id: uuidv4(), text: '', invariantId: undefined }`
2. **修改 `src/components/DetailPanel/DetailPanel.tsx`**：
   - 在 `GroupPanel` 內，於 `<SectionLabel>Information (Command Input)</SectionLabel>` 之前加 Pre-conditions collapsible block：
     ```tsx
     <CollapsibleSection
       label="前置狀態（Pre-conditions）"
       defaultOpen={(linkedCommand?.preConditions?.length ?? 0) > 0}
       help="本 Command 接受前必須滿足的狀態，可選擇連結到 Aggregate invariant"
     >
       <CommandConditionEditor
         conditions={linkedCommand?.preConditions ?? []}
         allAggregateInvariants={collectInvariants(allNotes)}
         kind="pre"
         onChange={(next) => updateCommandConditions(linkedCommand!.id, next, undefined)}
       />
     </CollapsibleSection>
     ```
   - 在 Information section 後、Event Output 前加 Post-conditions collapsible block（kind='post'，無 invariantId）
   - 若無 linkedCommand → 同 Information 的 disabled 狀態（顯示 "Link a command first" message）
3. **CollapsibleSection 元件**：若 DetailPanel.tsx 既有此元件就直接用；若無，inline 一個小 div + `<button onClick={toggle}>`，**收合時 unmount 內容**（不是 display:none）。
4. **驗證**：`npx tsc -b` 全乾淨；手動跑 dev server 確認 GroupPanel 渲染順序、collapsible toggle 正常、+ 新增條件 / delete 都連到 store。

### Step 4 — Export 整合（markdownExporter + jsonExporter）

1. **`src/utils/markdownExporter.ts`**：依 §12 在 DomainEvent 段內的 Command sub-block 加 Preconditions / Postconditions bullet list；invariantId 渲染為 **textual reference**（audit LOW-3：例 `_(links to invariant: <title>)_`，不是 markdown anchor link — 既有 exporter 沒有 anchor system）；broken-link 標 ⚠️。
2. **`src/utils/aiPromptBuilder.ts` 不動**（audit MED-1 — 它只是 markdownExporter 的 wrapper）。Hoare ordering 完全集中在 markdownExporter。
3. **`src/utils/jsonExporter.ts`**：`buildUseCaseSpec` 加 `preconditions` / `postconditions` 兩個欄位（§15）；空 commandNote 時 fallback 為 `[]`；**`pruneEmpty` keepKeys 加 `'preconditions'` / `'postconditions'`**（audit HIGH-3）。
4. **驗證**：
   - 手動 export markdown — 確認既有 board 的 Command 都有 Preconditions / Postconditions section（**空 array 不渲染**，避免噪音）
   - 手動 export JSON bundle — 確認 UseCaseSpec 有兩個新欄位，且**空 array 不被 pruneEmpty 移除**（HIGH-3 fix 驗證點）

### Step 5 — 整體驗收

1. **跑全套測試**：
   ```bash
   npx tsc -b
   cd mcp-server && npx tsc --noEmit && npx vitest run
   # FE store tests（含 v17 migration test）— 直接指定 path，root package.json 無 'test' script:
   npx vitest run src/store/__tests__/boardStore.test.ts
   ```
2. **手動 dogfood**：用 dev server 跑一遍 Demo 1-11（見驗收標準的 Human 補做段）。

---

## 失敗路徑

### 路徑 1：LLM hallucinate invariantId

Coach 提 `es_add_command_condition({ kind: 'pre', condition: { text: '...', invariantId: 'inv-fake' }})`：
1. orchestrator intentGate 過（有 mutation intent）→ pending → user 點 [套用]
2. server `pendingStore.confirm()` → CAS reverify 第 1 步：targetIds=[commandNoteId] → Command 本身的 stableSubset hash 對得起來（because invariantId 是 condition 內的 field，不是 Command 的 stableSubset），**通過 CAS**
3. handler 內部 invariantId 驗證：scan 所有 Aggregate 的 invariants → 找不到 → 回 `{ ok: false, code: 'NOT_FOUND', message: 'Invariant inv-fake not found in any Aggregate.' }`
4. `pendingStore.confirm` 看到 result.ok=false → status='failed'、errorEnvelope.code='NOT_FOUND'、broadcast SSE failed
5. FE Action Card 變紅色 failed；下輪 Coach 看到 functionResponse → system_prompt D17(a) 規則 → 不重試，改文字回應

### 路徑 2：CAS stale — 並發加 condition

Tab A propose `es_add_command_condition`，tab B 同時手動加另一條 → tab A 點 [套用]：
1. `confirm()` → CAS reverify：stableSubset 包含 `preConditions: [...]` 整 array，tab B 已加的條目改變 hash
2. hash 不符 + forceApply=false → status='stale' → SSE broadcast 兩個 tab
3. user 點 [仍要套用]（forceApply=true）→ server 重新讀 latest state → reverify Command 仍存在 + type='Command' → 通過則執行 handler（append 第 2 條）→ status='confirmed'

### 路徑 3：deleteInvariant 期間並發 add preCondition

Tab A 刪 Aggregate invariant，tab B 同時 propose `es_add_command_condition({ kind: 'pre', invariantId: 該 invariant id })`：
1. tab A 的 deleteInvariant action 跑完（含 cascade scan）→ broadcast `update_note` 把所有 Command notes 的 preConditions soft-null 改動推送
2. tab B 的 propose 進 pending；user 點 [套用]
3. confirm 階段 handler 內部驗證 invariantId：找不到（已刪）→ NOT_FOUND
4. **不**會誤寫 broken-link flag（因為 condition 還沒寫進去就被擋下）

### 路徑 4：Migration 載入舊版 project.json（v16 以下）

舊版 Command 沒有 preConditions / postConditions：
1. boardStore persist hydrate → version < 17 → 跑 migrate
2. v16→v17 邏輯：scan 所有 board.notes，type === 'Command' 才補 `preConditions: []` / `postConditions: []`；非 Command type 不動
3. 結果：所有 Command notes 有 empty array；UI 渲染 collapsed empty state（顯示 `+ 新增條件`）

### 路徑 5：handler 內部 condition 處理錯誤

`handle_es_update_command_conditions` 收到 preConditions 含 duplicate id：
1. 不做 deduplication（責任在 caller — UI 或 Coach 應自帶 unique id）
2. 整批寫入 → 後續 hash 不穩、UI bug — **這是接受的 trade-off**，由 caller 負責；若 dogfood 觀察到此問題，未來補 server-side dedup

### 不變量

- `stableSubset` hash **整 array 序列化結果**（D8）
- `deleteInvariant` cascade reverse-lookup 必須在**同一個 immer recipe** 完成（D7）
- `es_update_command_conditions` 是 mutate risk，**永不**加入 Spec B 的 `EXPOSED_RISKS`（D6 + D9）
- `_brokenInvariantLink` 是 soft-null marker，**不可**被 `es_update_command_conditions` 重設清空後 condition 又意外保留（caller 給的 array 就是 ground truth）

---

## 不改動的部分

- Spec A 既有 38 個 handler 邏輯（**除** 本 spec §4 修改 `deleteInvariant` 加 cascade）
- Spec B 既有 12 個 exposed tool 行為（`es_add_command_condition` 是第 13 個 exposed，**追加**，不取代）
- Coach Spec B 既有 propose-confirm 流程、SSE channel、PendingActionStore 對 confirm/reject/batch 的 transaction 規則
- 既有 markdown export / JSON export 對 Command 以外 type 的處理
- boardStore 既有 actions（除 §3 / §4 列出的）

### Non-goals（行為層）

- 本 task **不**包含 `CommandCondition.eventId`（postCondition → DomainEvent 反向關聯）— 延 v17.1
- 本 task **不**包含 invariantId 自動建議（系統觀察 invariant.when 文字 match preCondition.text）— 推 Spec C
- 本 task **不**包含 condition 文字的結構化解析（operator、variable extraction）— 永遠保持 free-text + optional invariantId
- 本 task **不**改 `es_update_command_information` 既有語意（仍是單一 mutate replace-all）
- 本 task **不**做 Coach `es_update_command_conditions`（mutate）的暴露 — 推 Spec C
- 本 task **不**做 Pre/Post conditions 在 Aggregate / Policy / DomainEvent 上的對稱欄位（只限 Command）
- 本 task **不**做 inline help 的 i18n（中文 hardcoded）
- 本 task **不**做 BoardSnapshot summary 帶 conditions 給 Coach 看（推 Spec C；目前 Coach 只能透過 `es_get_board` 拉到 raw 帶 conditions 的 board）

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別與 build
cd mcp-server && npx tsc --noEmit
cd ..
npx tsc -b

# 2. 新檔存在（audit HIGH-6：FE migration test 整合進既有 boardStore.test.ts，不另開檔）
test -f src/components/DetailPanel/CommandConditionEditor.tsx

# 3. 關鍵 export 與 schema
grep -q 'export interface CommandCondition' src/types/elements.ts
grep -q 'preConditions?: CommandCondition\[\]' src/types/elements.ts
grep -q 'postConditions?: CommandCondition\[\]' src/types/elements.ts
grep -q 'preconditions: SpecCondition\[\]' src/types/bundle.ts
grep -q 'postconditions: SpecCondition\[\]' src/types/bundle.ts
grep -q 'export interface SpecCondition' src/types/bundle.ts
grep -q 'version: 17' src/store/boardStore.ts
grep -q 'if (version < 17)' src/store/boardStore.ts
grep -q 'addCommandCondition' src/store/boardStore.ts
grep -q 'updateCommandConditions' src/store/boardStore.ts
grep -q 'deleteCommandCondition' src/store/boardStore.ts
grep -q '_brokenInvariantLink' src/store/boardStore.ts

# 4. BE handlers 與 tool registration
grep -q 'handle_es_add_command_condition' mcp-server/src/coach/tools/handlers.ts
grep -q 'handle_es_update_command_conditions' mcp-server/src/coach/tools/handlers.ts
grep -q "name: 'es_add_command_condition'" mcp-server/src/coach/tools/toolDefinitions.ts
grep -q "name: 'es_update_command_conditions'" mcp-server/src/coach/tools/toolDefinitions.ts
grep -q 'Command note .* not found' mcp-server/src/coach/tools/handlers.ts
grep -q 'is not a Command (type:' mcp-server/src/coach/tools/handlers.ts
grep -q 'postCondition must not carry invariantId' mcp-server/src/coach/tools/handlers.ts
grep -qE 'export interface (StickyNote|CommandCondition)' mcp-server/src/coach/tools/handlers.ts

# 5. stableSubset 更新
grep -q 'preConditions: note.preConditions' mcp-server/src/coach/agent/pendingActions.ts
grep -q 'postConditions: note.postConditions' mcp-server/src/coach/agent/pendingActions.ts

# 6. Skill describeProposal 加 case
grep -q "case 'es_add_command_condition'" mcp-server/src/coach/skills/eventStormingSkill.ts

# 7. Exporters
grep -q 'Preconditions' src/utils/markdownExporter.ts
grep -q 'Postconditions' src/utils/markdownExporter.ts
grep -q 'preconditions' src/utils/jsonExporter.ts
grep -q 'postconditions' src/utils/jsonExporter.ts

# 8. UI 中文 label
grep -q '前置狀態' src/components/DetailPanel/DetailPanel.tsx
grep -q '執行後狀態' src/components/DetailPanel/DetailPanel.tsx

# 9. BoardStore interface 加新 actions（audit HIGH-4）
grep -q 'addCommandCondition' src/types/board.ts
grep -q 'updateCommandConditions' src/types/board.ts
grep -q 'deleteCommandCondition' src/types/board.ts

# 10. jsonExporter pruneEmpty 含 preconditions（audit HIGH-3）
grep -qE "keepKeys.*preconditions|'preconditions'.*keepKeys" src/utils/jsonExporter.ts || grep -qE "pruneEmpty\(spec, \[.*preconditions.*postconditions" src/utils/jsonExporter.ts

# 11. BE cascade in handle_es_delete_invariant（audit HIGH-2）
grep -q '_brokenInvariantLink' mcp-server/src/coach/tools/handlers.ts

# 12. Vitest 全綠
cd mcp-server && npx vitest run --reporter=default
npx vitest run src/store/__tests__/boardStore.test.ts
```

### Runtime 斷言（vitest 內必含）

```typescript
// mcp-server/src/coach/tools/__tests__/toolDefinitions.test.ts
it('Spec B v17 fills risk distribution 3+10+15+1+11 = 40', () => {
  const distribution = TOOL_DEFINITIONS.reduce<Record<string, number>>((acc, d) => {
    acc[d.risk] = (acc[d.risk] ?? 0) + 1;
    return acc;
  }, {});
  expect(distribution).toEqual({ read: 3, additive: 10, mutate: 15, destructive: 1, unset: 11 });
});

it("'additive' includes es_add_command_condition (NOT es_update_command_conditions)", () => {
  const additiveNames = new Set(TOOL_DEFINITIONS.filter((d) => d.risk === 'additive').map((d) => d.name));
  expect(additiveNames.has('es_add_command_condition')).toBe(true);
  expect(additiveNames.has('es_update_command_conditions')).toBe(false);
});

// mcp-server/src/coach/__tests__/eventStormingSkill.test.ts
it('buildDeclarations exposes 13 tools (read 3 + additive 10)', () => {
  expect(new EventStormingSkill().buildDeclarations().length).toBe(13);
});

it('describeProposal es_add_command_condition returns targetIds=[commandNoteId]', () => {
  // ...
});

// src/store/__tests__/boardStore.test.ts（既有 file，加新 it block — audit HIGH-6）
it('v16 → v17 adds empty preConditions/postConditions to Command notes only', () => {
  // build inline minimal project at v16 → migrate → assert each Command note has both empty arrays;
  // non-Command notes remain unchanged; note count unchanged
});

it('addNote on Command-type sets preConditions[]/postConditions[] (audit HIGH-1)', () => { /* ... */ });
it('addCommandForEvent sets preConditions[]/postConditions[] on the new Command note', () => { /* ... */ });
it('deleteInvariant cascades to Command preCondition.invariantId → soft-null + _brokenInvariantLink', () => { /* ... */ });

// mcp-server/src/coach/tools/__tests__/handlers.test.ts
it('handle_es_add_command_condition NOT_FOUND when target Command missing', () => { /* ... */ });
it('handle_es_add_command_condition INVALID_TYPE when target is DomainEvent', () => { /* ... */ });
it('handle_es_add_command_condition NOT_FOUND when invariantId references missing invariant', () => { /* ... */ });
it('handle_es_add_command_condition PRECONDITION_FAILED when postCondition carries invariantId (audit MED-4)', () => { /* ... */ });
it('handle_es_update_command_conditions emits single update_note with both arrays (audit MED-2)', () => { /* ... */ });
it('handle_es_update_command_conditions undefined means no change for that field', () => { /* ... */ });
it('handle_es_update_command_conditions [] clears the array (including broken-link flags)', () => { /* ... */ });
it('handle_es_add_note on Command-type initializes both arrays (audit HIGH-1)', () => { /* ... */ });
it('handle_es_add_command_for_event initializes both arrays on new Command', () => { /* ... */ });
it('handle_es_delete_invariant cascades to Command preConditions + emits update_note events (audit HIGH-2)', () => { /* ... */ });
```

### Human 補做（需要人類介入）

- [ ] **Demo 1 — Migration**：用既有的 dev `localStorage` (v16) reload UI → 確認既有 Command notes 都顯示「前置狀態」「執行後狀態」collapsible section（empty state, 顯示 `+ 新增條件`）；DevTools console 無錯誤
- [ ] **Demo 2 — 人類加 preCondition (happy)**：選一個 Command group anchor → 展開「前置狀態」→ 點 `+ 新增條件` → 輸入文字「顧客信用額度 ≥ 訂單金額」→ blur → reload → 條目仍在
- [ ] **Demo 3 — 人類加 preCondition with invariantId**：先在某 Aggregate 加一條 invariant（既有 UI）→ 回到 Command 加 preCondition → invariantId 下拉看得到剛加的 invariant → 選擇 → 條目顯示連結
- [ ] **Demo 4 — Cascade delete (FE)**：刪掉 Demo 3 連結到的 invariant（從 UI）→ Command 的 preCondition 顯示 ⚠️ + tooltip「原 invariant 已刪除」；條目 text 仍在
- [ ] **Demo 4b — Cascade delete (BE)**：請 Coach 透過 `es_delete_invariant`（如已暴露給 mutate 階段；否則用既有 MCP CLI client 直接呼叫）刪掉 invariant → 跨 tab 的 React UI 也收到 SSE `update_note` 廣播 → preCondition 一樣顯示 ⚠️ broken-link（audit HIGH-2 驗證點）
- [ ] **Demo 5 — Coach additive propose**：問 Coach「請幫 PlaceOrder Command 加一條 precondition：顧客必須已驗證身份」→ Coach 回應 + 出現 1 張 Action Card (`es_add_command_condition`) pending → 點 [套用] → 條目寫入 Command note + 畫布 SSE 即時更新
- [ ] **Demo 6 — Coach mutate 被擋下**：問 Coach「請改寫 PlaceOrder 的所有 preconditions」→ Coach **不應**呼叫 `es_update_command_conditions`（risk=mutate 不在 EXPOSED_RISKS）；若 Coach 仍 hallucinate → orchestrator synthetic-rejected，pending=0、audit 記 'intent_gate_blocked' reason='not_in_mvp_scope'
- [ ] **Demo 7 — CAS stale**：開 2 個 tab，tab A propose `es_add_command_condition`，tab B 手動加另一條到同 Command；tab A 點 [套用] → 預期 card 變黃色 stale → 點 [仍要套用] → server 仍 reverify → 通過則 confirmed
- [ ] **Demo 8 — Markdown export**：export markdown → 確認 DomainEvent block 內 Command 區段含 Preconditions / Postconditions bullet list；invariantId 顯示為 `_(links to invariant: X)_`；broken-link 顯示 ⚠️
- [ ] **Demo 9 — JSON bundle export**：export JSON bundle → 確認 UseCaseSpec 含 `preconditions` 與 `postconditions` 兩個 array（即使空也是 `[]` 不是 undefined）
- [ ] **Demo 10 — Tab order**：focus 在 Command label input → Tab 順序為 Pre-conditions（若 expanded）→ Information → Post-conditions（若 expanded）→ Event Output；收合段不會 Tab 進入內部 input
- [ ] **System prompt regression**：跑 P1 5 個典型 Socratic 情境，確認 Coach 維持人格（不直接給答案、繁中、不主動 propose mutating）
- [ ] DevTools console 全程無錯誤
- [ ] localStorage `event-storming-board` version 顯示為 17

---

## 已知限制

- **Codex 對 D6 拆對 tool 的反對意見**（記入 ADR）：「同一組資料若同時存在 append mental model 和 replace-all mental model，會增加 Coach + human 的判斷複雜度，UX ambiguity」。**退回判準**：若 dogfood 階段觀察到 ≥30% 的 condition 操作是整批重寫（不是 append-only），重新評估退回單一 mutate tool（Option A），把 `es_add_command_condition` 改用 deprecation note 標記、`es_update_command_conditions` 升為 additive。
- **`CommandCondition.eventId`** 延 v17.1：postCondition → DomainEvent 反向關聯不在本 spec 範圍。
- **Coach `es_update_command_conditions` 不暴露**：Spec B 階段 Coach 只能 append、不能改寫；改寫需人類手動操作 UI 或等 Spec C。
- **Intent gate keyword rule-based**：Spec B 既有限制，本 spec 不改。
- **無 invariantId picker 自動建議**：Spec B 不做 invariant.when 文字 match 自動建議；推 Spec C。
- **`_brokenInvariantLink` 不會 cleanup**：使用者要顯式覆寫或刪除該 condition；無自動 sweep 機制（接受）。
- **BoardSnapshot summary 不帶 conditions**：Coach 在 `attachSnapshot=true` 時的 markdown summary 不含新欄位；若 Coach 要看必須走 `es_get_board`（read tool）拉 raw board。建議：未來 Spec C 評估是否升級 snapshotBuilder。
- **`mcp-server/data/project.json` 沒有 schema version 欄位**：BE migration 只是 shape-healing-only。Spec 不對齊 FE 的 explicit `version + migrate()` pattern（推 Spec C cleanup）。
- **依賴關係**：前置 task `2026-05-11-coach-agent-spec-b-mvp-mid`（done 2026-05-11）— 本 spec 假設 Spec B 的 EventStormingSkill / PendingActionStore / Action Card UI 都已 ship。
