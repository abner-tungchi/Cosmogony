# Policy card 加 triggeredBy / issues 結構化欄位

## 來源

討論:`docs/discussions/2026-05-06-policy-card-triggered-by-and-issues.md`(Round 1 + Round 2,三方 agreed)

## 目標

DDD 中 Policy 是「reactive(響應 DomainEvent)+ proactive(發起 Command 至某 Aggregate)」的角色,但目前 `StickyNote.type === 'Policy'` 沒有任何 Policy-specific 欄位,只有 `label` 自由文字。本 task 為 Policy 加結構化欄位 `policyTrigger`(單值)+ `policyIssues`(array),包含 type 列舉(初版 trigger=DomainEvent / issues=Command)、name 字串(canonical)、可選 noteRef(對應 board notes 的 graph 連結)、targetAggregate(per issue)。新增 `PolicyPanel` 編輯器與 `policyDerived` canvas 顯示 helper;沿用 `dtoSpecRef` pattern(noteRef 與 name 雙寫,resolve 失敗 fallback)。Schema 為 optional 欄位,zero migration。

---

## 介面合約(Interface Contract)

### 1. `src/types/specs.ts` 新增型別

```ts
/**
 * Policy 描述「Policy 由哪個 DomainEvent 觸發」。
 * 初版 type 列舉只 'DomainEvent';未來擴展可加 'TimeTrigger' / 'ExternalSystem' 等。
 * name 是 canonical 顯示名(user 自訂);noteRef 是可選的 graph 連結至 active board 上的 DomainEvent note。
 */
export interface PolicyTrigger {
  type: 'DomainEvent';
  name: string;
  noteRef?: string;
}

/**
 * Policy 描述「Policy 發起哪些 Commands(可多筆)」。
 * 初版 type 列舉只 'Command'。
 * targetAggregate 是 per-issue 的目標 Aggregate 顯示名 + 可選的 ref。
 */
export interface PolicyIssue {
  type: 'Command';
  name: string;
  noteRef?: string;
  targetAggregate?: string;
  targetAggregateRef?: string;
}
```

### 2. `src/types/elements.ts` 的 `StickyNote` 加欄位

```ts
export interface StickyNote {
  // ... 既有欄位
  // --- Policy-specific ---
  policyTrigger?: PolicyTrigger;
  policyIssues?: PolicyIssue[];
}
```

並在頂部 `import` 區塊加入新型別:

```ts
import type {
  Invariant,
  AggregateIdentity,
  DtoField,
  ReturnTypeSpec,
  PolicyTrigger,
  PolicyIssue,
} from './specs';
```

### 3. `src/types/board.ts` `BoardStore` interface 加 actions

```ts
updatePolicyTrigger: (noteId: string, trigger: PolicyTrigger | undefined) => void;
updatePolicyIssues: (noteId: string, issues: PolicyIssue[]) => void;
```

### 4. `src/store/boardStore.ts` 實作 actions

```ts
updatePolicyTrigger: (noteId, trigger) =>
  set((state) => {
    const board = findActiveBoard(state);
    if (!board) return;
    const note = board.notes.find((n) => n.id === noteId);
    if (!note) return;
    if (trigger === undefined) {
      delete note.policyTrigger;
    } else {
      note.policyTrigger = trigger;
    }
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    state.project.updatedAt = note.updatedAt;
  }),

updatePolicyIssues: (noteId, issues) =>
  set((state) => {
    const board = findActiveBoard(state);
    if (!board) return;
    const note = board.notes.find((n) => n.id === noteId);
    if (!note) return;
    note.policyIssues = issues;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    state.project.updatedAt = note.updatedAt;
  }),
```

**所有權明示**:
- `note.policyTrigger` / `note.policyIssues` 唯一寫入路徑就是這兩個 actions(類似 `updateAggregateIdentity` / `updateStateProperties` pattern)
- `findActiveBoard(state)` helper 已存在於 boardStore 內

### 5. `src/utils/policyDerived.ts`(新檔)

```ts
import type { StickyNote } from '../types/elements';

/**
 * Resolve note label by id (DomainEvent / Command / Aggregate).
 * Returns the resolved label first-line trimmed, or the fallback name string,
 * or '?' when both empty. Stale ref → returns name (or 'name (?)'-style marker).
 *
 * Used by PolicyPanel trigger / issues display, canvas Policy note derived
 * content, and markdown / json export — single source of truth.
 */
export function resolveNoteRefDisplay(
  name: string,
  noteRef: string | undefined,
  allNotes: StickyNote[],
  expectedType: 'DomainEvent' | 'Command' | 'Aggregate',
): { display: string; isStale: boolean };

/**
 * Build a one-line summary for a Policy note's trigger.
 * Format: "◇ on <triggerName>" (or '' if no trigger)
 */
export function derivePolicyTriggerLine(note: StickyNote, allNotes: StickyNote[]): string;

/**
 * Build a one-line summary for a Policy note's issues.
 * Format:
 *   0 issues → ''
 *   1 issue → "→ <issue1>"
 *   2 issues → "→ <issue1>, <issue2>"
 *   3+ → "→ <issue1>, <issue2> (+N more)"
 */
export function derivePolicyIssuesLine(note: StickyNote, allNotes: StickyNote[]): string;

/**
 * Compose the full derived multi-line content for a Policy note.
 * Returns null when no trigger and no issues (caller falls back to label-only).
 */
export function derivePolicyContent(note: StickyNote, allNotes: StickyNote[]): string | null;
```

### 6. `src/components/DetailPanel/PolicyPanel.tsx`(新檔)

`<PolicyPanel note={...} flowPaths={...} allNotes={...} />` — 沿用 AggregatePanel / DtoPanel pattern。內部含:

- Policy 名稱輸入(`note.label`)
- **TRIGGERED BY** section
  - Type:hardcoded label「DomainEvent」(初版只 1 列舉,不顯示 dropdown — 視覺極簡)
  - Name:`<input>` + 旁邊 `[⌕]` icon 按鈕點開 inline picker(顯示 active board 上 type='DomainEvent' 的 notes 列表)
  - 點 picker 中某 note → 同寫 `name = note.label.split('\n')[0].trim()` + `noteRef = note.id`
  - User 直接打字 → 只更新 `name`,`noteRef` 不動(若先前有 ref,不主動清)
  - **Clear trigger** button:`× Remove trigger` → `updatePolicyTrigger(note.id, undefined)`
- **ISSUES** section
  - List of issue cards(可 0 或多筆)
  - 每筆 issue card 內:
    - Type:hardcoded「Command」label
    - Name:同 trigger 模式 picker(顯示 type='Command' notes)
    - Target Aggregate:同模式 picker(顯示 type='Aggregate' notes)
    - `× Delete issue` button
  - 末尾「+ Add Issue」button

**Inline NoteRefPicker(file-local 元件,不抽共用)**:每個 picker 都是同一 pattern 的 inline 實作。功能極簡:popover 列出 board 上指定 type 的 notes,點選即填回 name + noteRef。stale ref 顯示「(deleted)」紅字。

**所有權明示**:
- name 與 noteRef 同寫由 PolicyPanel 內部 handler 負責;僅 picker 點擊時雙寫,user 手打 input 時只更新 name(避免覆蓋 user 的 canonical 命名)
- targetAggregate / targetAggregateRef 同模式

### 7. `src/components/DetailPanel/DetailPanel.tsx` switch case 'Policy'

在既有 switch 內新增:

```tsx
case 'Policy':
  return (
    <PolicyPanel
      note={note}
      allNotes={activeBoard.notes}
      flowPaths={activeBoard.flowPaths}
    />
  );
```

### 8. `src/components/StickyNote/StickyNote.tsx` Policy 顯示

Policy type 渲染時,**若 `derivePolicyContent(note, allNotes)` 非 null**,在 label 下方顯示 derived 兩行內容(trigger line + issues line);否則只顯示 label(既有行為)。

### 9. `mcp-server/src/index.ts` BE 鏡像 + zod schema

- BE 鏡像:`interface Policy*` 同步;`StickyNote` BE-local type 加 `policyTrigger?` / `policyIssues?`
- `es_update_note` zod schema 在 `inputSchema` 內加:
  ```ts
  policyTrigger: z.object({
    type: z.literal('DomainEvent'),
    name: z.string(),
    noteRef: z.string().optional(),
  }).optional()
   .describe('Policy trigger (DomainEvent that fires this policy). Setting overwrites entirely; pass undefined to remove.'),
  policyIssues: z.array(z.object({
    type: z.literal('Command'),
    name: z.string(),
    noteRef: z.string().optional(),
    targetAggregate: z.string().optional(),
    targetAggregateRef: z.string().optional(),
  })).optional()
   .describe('Policy issues (Commands fired by this policy). Setting replaces the entire array (not append).'),
  ```

### 10. Display invariant(formalize)

> 對 Policy note:
> 1. **PolicyPanel trigger 顯示**:用 `resolveNoteRefDisplay(name, noteRef, allNotes, 'DomainEvent')`;stale ref 顯示紅字 + `(deleted)` 標記
> 2. **Canvas 顯示**:呼叫 `derivePolicyContent(note, allNotes)`;非 null 時 label 下方顯示 trigger + issues 兩行
> 3. **stale ref 不擋寫入**:user 即使指向已刪除的 note 也能保留 name(可後續 user 重新指定)
> 4. **name 自動同步禁止**:若 noteRef 對應 note 重新命名,Policy.name 不主動更新(尊重 user canonical 命名)

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/types/specs.ts` | 新增 `PolicyTrigger` / `PolicyIssue` interface |
| `src/types/elements.ts` | `StickyNote` 加 `policyTrigger?` / `policyIssues?`;import 新型別 |
| `src/types/board.ts` | `BoardStore` interface 加 `updatePolicyTrigger` / `updatePolicyIssues` 簽名 |
| `src/store/boardStore.ts` | 實作兩個新 actions(沿用 findActiveBoard pattern) |
| `src/utils/policyDerived.ts` | NEW — `resolveNoteRefDisplay` / `derivePolicyTriggerLine` / `derivePolicyIssuesLine` / `derivePolicyContent` |
| `src/components/DetailPanel/PolicyPanel.tsx` | NEW — Policy 編輯器 panel,含 inline NoteRefPicker |
| `src/components/DetailPanel/DetailPanel.tsx` | switch case 'Policy' → render PolicyPanel |
| `src/components/StickyNote/StickyNote.tsx` | Policy type 顯示透過 derivePolicyContent 衍生 |
| `mcp-server/src/index.ts` | BE-local Policy types 鏡像;`es_update_note` zod schema 加兩欄 |

未改動:

- `src/utils/markdownExporter.ts` / `src/utils/jsonExporter.ts`(本 task 不擴 export — Policy 結構性資料目前只在 detail panel 與 canvas;export follow-up 視需要再加)
- v16 wire-strip / persist / sync 機制
- Aggregate / Command / DomainEvent / DTO / Remodel 既有行為
- 既有 legacy `interface Policy { rule, severity }`(無人用,但不主動清)

---

## 實作步驟

### Step 1 — `src/types/specs.ts` 加型別

1. 在檔案末尾(其他 spec 型別之後)加:`PolicyTrigger`、`PolicyIssue`(內容如介面合約 #1)。
2. 不動既有 Invariant / AggregateIdentity / DtoField / ReturnTypeSpec。

### Step 2 — `src/types/elements.ts` 與 `src/types/board.ts`

1. `elements.ts`:`StickyNote` 在 `// --- Dto-specific ---` 區塊之後加:
   ```ts
   // --- Policy-specific ---
   policyTrigger?: PolicyTrigger;
   policyIssues?: PolicyIssue[];
   ```
   import 新型別至檔案頂部。
2. `board.ts`:`BoardStore` interface 在「Spec Bundle: Dto」之後加 Policy section:
   ```ts
   // --- Spec Bundle: Policy ---
   updatePolicyTrigger: (noteId: string, trigger: PolicyTrigger | undefined) => void;
   updatePolicyIssues: (noteId: string, issues: PolicyIssue[]) => void;
   ```
   並 import 新型別。

### Step 3 — `src/store/boardStore.ts` 加 actions

1. import `PolicyTrigger` / `PolicyIssue` 從 specs.ts(若 BoardStore interface 已 re-export 則不需直接 import)。
2. 在「Spec Bundle — Dto」區塊之後加新 section,實作兩個 actions(內容如介面合約 #4)。
3. 注意 `set((state) => { ... })` 內 `findActiveBoard(state)` 是既有 helper,沿用。

### Step 4 — `src/utils/policyDerived.ts` 新檔

實作四個 export(內容如介面合約 #5):

```ts
import type { StickyNote } from '../types/elements';

export function resolveNoteRefDisplay(
  name: string,
  noteRef: string | undefined,
  allNotes: StickyNote[],
  expectedType: 'DomainEvent' | 'Command' | 'Aggregate',
): { display: string; isStale: boolean } {
  if (noteRef) {
    const target = allNotes.find((n) => n.id === noteRef && n.type === expectedType);
    if (target) {
      const label = (target.label.split('\n')[0] ?? '').trim();
      return { display: label || name || '(Unnamed)', isStale: false };
    }
    return { display: name || '(deleted)', isStale: true };
  }
  return { display: name || '?', isStale: false };
}

export function derivePolicyTriggerLine(note: StickyNote, allNotes: StickyNote[]): string {
  if (!note.policyTrigger) return '';
  const { name, noteRef } = note.policyTrigger;
  const { display } = resolveNoteRefDisplay(name, noteRef, allNotes, 'DomainEvent');
  return `◇ on ${display}`;
}

export function derivePolicyIssuesLine(note: StickyNote, allNotes: StickyNote[]): string {
  const issues = note.policyIssues ?? [];
  if (issues.length === 0) return '';
  const names = issues.slice(0, 2).map((iss) => {
    const { display } = resolveNoteRefDisplay(iss.name, iss.noteRef, allNotes, 'Command');
    return display;
  });
  if (issues.length === 1) return `→ ${names[0]}`;
  if (issues.length === 2) return `→ ${names.join(', ')}`;
  return `→ ${names.join(', ')} (+${issues.length - 2} more)`;
}

export function derivePolicyContent(note: StickyNote, allNotes: StickyNote[]): string | null {
  const trigger = derivePolicyTriggerLine(note, allNotes);
  const issues = derivePolicyIssuesLine(note, allNotes);
  if (!trigger && !issues) return null;
  return [trigger, issues].filter(Boolean).join('\n');
}
```

### Step 5 — `src/components/DetailPanel/PolicyPanel.tsx` 新檔

1. 元件接收 `{ note, allNotes, flowPaths }` props。
2. 內部 inline 實作 `<NoteRefPickerInline />`(file-local,不 export):popover 列出 board 上指定 type 的 notes,點選即觸發 onChange(name, noteRef)。
3. JSX 結構(沿用 panelStyles 的 BORDER_COLOR / TEXT_MAIN / TEXT_MUTED):

```tsx
export const PolicyPanel: React.FC<PolicyPanelProps> = ({ note, allNotes, flowPaths }) => {
  const { updateNote, updatePolicyTrigger, updatePolicyIssues } = useBoardStore();

  const trigger = note.policyTrigger;
  const issues = note.policyIssues ?? [];

  // Inline NoteRefPickerInline: file-local sub-component (not exported)
  // ... 顯示 type filter 後的 notes,點 row → onChange(name, noteRef)

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Label input */}
      {/* divider */}
      {/* TRIGGERED BY section: Type label + Name input + picker */}
      {/* divider */}
      {/* ISSUES section: array of issue cards + "+ Add Issue" */}
      {/* divider */}
      {/* NOTES textarea (既有 note.notes 行為) */}
      {/* divider */}
      {/* PATHS chips (沿用其他 panel) */}
    </div>
  );
};
```

4. **Add Issue handler**:
   ```ts
   const addIssue = () => {
     const newIssues = [...(note.policyIssues ?? []), { type: 'Command', name: '' } as PolicyIssue];
     updatePolicyIssues(note.id, newIssues);
   };
   ```

5. **Update issue handler**:單筆 partial update,push 整個 array 進 store。

6. **Delete issue handler**:filter 掉該 index,push 剩餘。

7. **NoteRefPickerInline 行為**:
   - Trigger button 顯示 `[⌕]` icon
   - 點開 popover absolute-positioned;list active board notes filtered by `n.type === expectedType && n.id !== note.id`(避免自我引用)
   - search input 即時 filter labels
   - 點 row → `onPick({ name: rowLabel, noteRef: rowId })` → close
   - click outside / Esc 關 popover

### Step 6 — `src/components/DetailPanel/DetailPanel.tsx` switch case 'Policy'

在既有 type switch 內 case 'Aggregate'(或 case 'Dto')之後加:

```tsx
case 'Policy':
  return (
    <PolicyPanel
      note={note}
      allNotes={activeBoard.notes}
      flowPaths={activeBoard.flowPaths}
    />
  );
```

import PolicyPanel 自 './PolicyPanel'。

### Step 7 — `src/components/StickyNote/StickyNote.tsx` Policy 顯示

1. import `derivePolicyContent` from utils。
2. 在 render 邏輯內,若 `note.type === 'Policy'`,計算:
   ```ts
   const policyDerived = note.type === 'Policy'
     ? derivePolicyContent(note, allNotes)
     : null;
   ```
3. label 下方若 `policyDerived !== null` 多 render 一段(類似 dtoDerived 的 derived content 顯示模式),字體較小(fontSize: 10–11)、color muted。

### Step 8 — `mcp-server/src/index.ts` BE 鏡像

1. 找到 BE-local `interface StickyNote {...}`(BE 自己的鏡像),在 Dto-specific 區塊之後加 Policy 欄位(同 FE)。
2. 加 BE-local 鏡像型別 `interface PolicyTrigger {...}`、`interface PolicyIssue {...}`(同 specs.ts)。
3. `es_update_note` 的 zod schema 在 inputSchema 內加 policyTrigger / policyIssues optional 欄位(內容如介面合約 #9)。
4. 在 `es_update_note` handler body 內,接收後寫入 note 即可(既有 partial update 模式)。**注意**:zod 解析後的 object,`policyIssues` 是整段替換(不是 append)— 在 tool description 明示。

---

## 失敗路徑

- **note.policyTrigger 為 undefined 但 panel render**:`trigger = note.policyTrigger` undefined 時 PolicyPanel 顯示空 trigger section + 「Set trigger」placeholder(或「No trigger」+ 引導 user 點 picker)
- **note.policyIssues 為 undefined**:`?? []` 防呆,顯示空列表 + 「+ Add Issue」
- **noteRef 指向已刪除的 note**:`resolveNoteRefDisplay` 偵測 stale,回傳 `{ display: name, isStale: true }`;UI 顯示紅字 + 「(deleted)」
- **noteRef 指向錯誤 type 的 note**(罕見:user 透過 MCP 寫了 Aggregate id 給 trigger.noteRef):`expectedType` 不符視為 stale(`find` 失敗),同上 fallback
- **MCP `es_update_note` 接 issues array 但只想 append**:文件明示**整段替換語意**,user 需先 read 再 write 完整 array(若有需求可 follow-up 加 `es_append_policy_issue`,本 task 不做)
- **shared / cross-store impact**:無,policyDerived / PolicyPanel 純讀 note + allNotes;actions 走既有 immer producer,wire-strip / sync 不受影響

---

## 不改動的部分

- `src/utils/markdownExporter.ts` / `src/utils/jsonExporter.ts`:本 task 不擴 export
- v16 wire-strip / persist / sync 機制
- Aggregate / Command / DomainEvent / DTO / Remodel 既有 schema 與行為
- 既有 legacy `interface Policy { rule, severity }`(elements.ts 行 14-17,無人用,不主動清)
- Policy note 的視覺顏色 / palette / dnd / 拖動行為
- TypeOrDtoPicker 等其他 picker 元件

### Non-goals(行為層)

- 本 task **不**支援 trigger.type 除 `'DomainEvent'`(初版列舉)
- 本 task **不**支援 issues[].type 除 `'Command'`
- 本 task **不**做 cross-board reference(noteRef 限 active board)
- 本 task **不**自動同步 name(noteRef 對應 note 重新命名時 Policy.name 不更新)
- 本 task **不**抽共用 NoteRefPicker(Policy 內 inline 實作;TypeOrDtoPicker 不變)
- 本 task **不**自動建立 Policy → 對應 Event/Command/Aggregate 的 Link 線
- 本 task **不**擴 markdown / json export(structure 在 schema 但 export 不改;follow-up)
- 本 task **不**新 MCP tool(只擴 existing es_update_note)
- 本 task **不**清 legacy Policy interface

---

## 驗收標準

### Agent 必做(可機器執行)

```bash
# 1. 型別 / build
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..
npm run build

# 2. specs.ts 新型別
grep -q 'export interface PolicyTrigger' src/types/specs.ts
grep -q 'export interface PolicyIssue' src/types/specs.ts

# 3. StickyNote 加欄位
grep -q 'policyTrigger?:' src/types/elements.ts
grep -q 'policyIssues?:' src/types/elements.ts

# 4. BoardStore interface + 實作
grep -q 'updatePolicyTrigger' src/types/board.ts
grep -q 'updatePolicyIssues' src/types/board.ts
grep -q 'updatePolicyTrigger:' src/store/boardStore.ts
grep -q 'updatePolicyIssues:' src/store/boardStore.ts

# 5. 新檔
test -f src/utils/policyDerived.ts
test -f src/components/DetailPanel/PolicyPanel.tsx
grep -q 'export function resolveNoteRefDisplay' src/utils/policyDerived.ts
grep -q 'export function derivePolicyContent' src/utils/policyDerived.ts
grep -q 'export const PolicyPanel' src/components/DetailPanel/PolicyPanel.tsx

# 6. DetailPanel switch case
grep -q "case 'Policy'" src/components/DetailPanel/DetailPanel.tsx
grep -q "PolicyPanel" src/components/DetailPanel/DetailPanel.tsx

# 7. StickyNote 顯示
grep -q 'derivePolicyContent' src/components/StickyNote/StickyNote.tsx

# 8. MCP BE 鏡像 + zod schema
grep -q 'PolicyTrigger' mcp-server/src/index.ts
grep -q 'PolicyIssue' mcp-server/src/index.ts
grep -q 'policyTrigger' mcp-server/src/index.ts
grep -q 'policyIssues' mcp-server/src/index.ts

# 9. legacy Policy interface 仍在(本 task 不刪)
grep -q 'export interface Policy {' src/types/elements.ts
```

### Human 補做(需要人類介入)

- [ ] Sidebar palette 拖一個 Policy 到 canvas;點開 detail panel 看到新的 PolicyPanel(label 輸入 + TRIGGERED BY + ISSUES + NOTES + PATHS sections)
- [ ] TRIGGERED BY 旁的 Type 顯示「DomainEvent」label(初版只 1 列舉,不可改)
- [ ] Name 輸入框可手打 free string;旁邊 `[⌕]` icon 點開 popover,列出 board 上所有 DomainEvent notes,點選即同寫 name + noteRef
- [ ] ISSUES 區可加多筆 issue;每筆有 Type=Command / Name picker / Target Aggregate picker / 刪除按鈕
- [ ] Canvas 上 Policy note 卡面 label 下方多顯示 `◇ on <triggerName>` 與 `→ <issue1>, <issue2> (+N more)` 兩行(若有設值);無設值時只顯示 label
- [ ] 把 trigger.noteRef 對應的 DomainEvent note 刪除 → Policy panel 顯示 stale 紅字「(deleted)」、canvas 顯示 `◇ on <name>`(name 仍在);user 可重新 pick 修復
- [ ] noteRef 對應的 note 重新命名 → Policy.name **不**自動更新(canonical 名維持)
- [ ] 透過 MCP `es_update_note` 傳入 `policyTrigger` / `policyIssues`(JSON),前端收到 sync_project 後 Policy 卡面正確顯示
- [ ] 跨 board 同步:Tab A 編輯 Policy 後 Tab B 透過 SSE 看到更新
- [ ] DevTools console 全程無錯誤
- [ ] 同 board 兩個 Policy 卡片各自獨立(不互相影響)

---

## 已知限制

- **trigger.type 與 issues[].type 列舉初版固定**:UI 不顯示 dropdown(只有 1 選擇);未來擴展時 UI 自動展開
- **不支援多筆 trigger**:DDD Policy 慣例「reactive — 一個 event 觸發」;若 user 有複合條件需求,拆多個 Policy 卡
- **不支援嵌套**(trigger 觸發另一個 Policy):Policy 是 reactive,不是 chain
- **noteRef 是 active-board 限定**:跨 BoundedContext reference 不支援(同 dtoSpecRef 既有限制)
- **name 不自動同步**:刻意設計,尊重 user canonical 命名
- **markdown / json export 不擴**:本 task 範圍外;將來若需要再 follow-up 補 exporter
- **legacy `interface Policy`(elements.ts 行 14-17)** 維持不刪 — 本 task 範圍外;將來 cleanup 再做
- **MCP `es_update_note` 整段替換 issues**:append 場景需 read-merge-write,文件明示
- **依賴關係**:無前置 task。`findActiveBoard` 已存在,`useActiveBoard` selector 已存在
- **與 Topic A(Array container picker)正交**,不阻塞
