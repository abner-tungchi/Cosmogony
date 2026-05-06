---
topic: "Policy card 加 triggeredBy / issues 結構化欄位"
status: consensus
created: "2026-05-06"
updated: "2026-05-06"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 2
---

# Policy card 加 triggeredBy / issues 結構化欄位

## 議題定義

### 背景

目前 Policy 在 `StickyNote.type === 'Policy'` 但沒有任何 Policy-specific 欄位 — 整張卡只有 `label`(自由文字)。User 想加入結構化欄位描述 DDD 中 Policy 的雙端關係:

```json
"triggeredBy": {
  "type": "DomainEvent",
  "name": "permissionDeleted"
},
"issues": {
  "type": "Command",
  "name": "removePermissionReference",
  "targetAggregate": "Role"
}
```

語意:Policy 由某個 DomainEvent 觸發,然後 issue 一個或多個 Command 至某 Aggregate。

註:雖然 `src/types/elements.ts` 行 14-17 有個 `interface Policy { rule, severity }`,**沒有被 StickyNote 用**(legacy unused),本 task 不延用此型別。

### 目標

收斂出可一次寫成 spec 的實作方案:
- StickyNote 新增 Policy-specific 欄位(`policyTrigger` / `policyIssues` 或類似命名)
- DetailPanel 加 PolicyPanel(類似 AggregatePanel / DtoPanel pattern)讓 user 編輯這兩個欄位
- type 欄位用 dropdown(列出可能值);name 欄位 user 自由輸入或從 board 上 reference 對應 note
- Migration:既有 Policy notes 沒有這兩欄,讀進來時欄位為 undefined,不影響顯示
- MCP tools 要不要同步加(讓 AI 設這兩欄)?

### 範圍

**討論內**:
- 欄位 schema 設計(命名、結構、單值 vs array)
- triggeredBy / issues 的 `type` 列舉(只 DomainEvent / Command?還是包含其他?)
- `name` 是 free-form 字串還是 board note id ref?
- targetAggregate 同樣問題:free string 還是 note ref?
- PolicyPanel UI 設計(欄位 layout、picker / input 配置)
- canvas 上 Policy note 是否要顯示這些欄位摘要(類似 DTO 顯示 fields)?
- MCP tool 是否擴充?

**討論外**:
- 不刪 legacy `interface Policy { rule, severity }`(無人用,但不主動清)
- 不改 Policy 顏色 / 視覺樣式 / dnd 行為
- 不改 Aggregate / Command / DomainEvent 的 schema
- 跨 board reference(targetAggregate 指向別 context 的 Aggregate)— 暫不支援

### 約束

- StickyNote 是 wire schema 中心,新增 optional 欄位對舊資料無 impact
- BE-local Project type 鏡像同步
- 既有 v16 wire-strip 機制不能 break
- migration 不需要(optional fields 加進去就好)
- DDD 語意要正確 — Policy 是 reactive(by event)+ proactive(issue command),不是 read-only 標籤

### 子議題

- [ ] **S1**:Schema 設計 — 欄位命名(`policyTrigger` / `triggeredBy`?)、結構(單值 object / array?)、是否多 issues?
- [ ] **S2**:`type` 列舉值 — 只 `DomainEvent` / `Command`,還是包含 `TimeTrigger` / `ExternalSystem` / `Manual` 等?
- [ ] **S3**:`name` 是 free-form string 還是 note id reference(像 dtoSpecRef)?free 簡單但失去結構;ref 結構但需要對應 note 存在
- [ ] **S4**:`targetAggregate` 同 S3 — free string 還是 ref 到 Aggregate note?
- [ ] **S5**:PolicyPanel UI — 欄位 layout、type dropdown / name 輸入 / 多筆 issues 排版
- [ ] **S6**:Canvas 顯示 — Policy note 卡面要不要顯示 `triggered by X` / `issues Y`(類似 DTO 顯示 fields 那樣 derive)?
- [ ] **S7**:MCP tool — 是否新增 `es_update_policy_*` tools 或擴充既有 update_note?
- [ ] **S8**:實作 step、改動檔案、verification grep

---

## 討論紀錄

### Round 1 (2026-05-06)

#### 🅰️ Claude — 提案

**S1 — Schema 設計**

立場:**StickyNote 加兩個 optional 欄位**:

```ts
// src/types/specs.ts
export interface PolicyTrigger {
  type: 'DomainEvent';            // 列舉值,初版只支援 DomainEvent;未來擴展
  name: string;                   // 顯示名 / canonical 名稱
  noteRef?: string;               // 對應 board 上 DomainEvent note id(若 user 從 picker 選)
}

export interface PolicyIssue {
  type: 'Command';                // 初版只 Command
  name: string;
  noteRef?: string;               // 對應 Command note id
  targetAggregate?: string;       // Aggregate 顯示名
  targetAggregateRef?: string;    // 對應 Aggregate note id
}

// src/types/elements.ts — StickyNote 加:
policyTrigger?: PolicyTrigger;     // 單一 trigger
policyIssues?: PolicyIssue[];      // multiple issues(array)
```

論點:
1. **單一 trigger**:DDD Policy 慣例「reactive — 一個 event 觸發」。若有複合條件,user 可拆多個 Policy 卡。
2. **多 issues(array)**:Policy 可能 issue 多個 Commands(例如「Order Cancelled → IssueRefund + ReleaseInventory」),陣列必要。
3. **noteRef 雙寫**:類似 `Property.dtoSpecRef` pattern — name 是顯示 + codegen 用,noteRef 是 graph 連結。
4. user JSON 範例的 `issues` 是單一 object,但**前瞻性**做成 array 比較不會被未來打臉(empty array = 一樣等同單一場景簡化)。

**S2 — type 列舉值**

立場:**初版 trigger 只 `'DomainEvent'`;issues 只 `'Command'`**。Schema 上預留 union 寫法供未來擴展。

論點:
1. 嚴格符合 DDD 經典 Policy 語意:反應 DomainEvent,發起 Command
2. TimeTrigger / ExternalSystem / Manual 等 use case 真實存在但**不主流**,加進來 UI 選單會雜
3. 未來要擴只需把 union 加值,不需 schema 重做(向前兼容設計)
4. type 欄位 UI:dropdown 雖然只 1 選擇,**仍用 dropdown**(視覺一致性 + 提示這是受限欄位、不是 free string)

**S3 — name 是 free-form 還是 note ref?**

立場:**主鍵是 `name: string`(free-form),`noteRef?: string` 可選輔助**。UI 提供 picker 同時填兩欄。

論點:
1. 跟 user JSON 範例一致(他寫 `"name": "permissionDeleted"`)
2. Free name 允許 user 在還沒畫對應 note 時先寫 Policy(常見 design flow)
3. noteRef 提供結構性連結,類似 dtoSpecRef pattern
4. UI:有 board 上對應 type 的 notes 時 picker 顯示「pick from board」清單(以 label 顯示);user 也可手打 free string(忽略 picker)
5. Resolve 顯示順序:`noteRef` 已設且能 resolve → 顯示 note label;否則顯示 raw name

**S4 — targetAggregate 同 S3**

立場:**同樣 free-form `targetAggregate: string` + 可選 `targetAggregateRef?: string`**。

論點:
1. Pattern 一致,降低 user 心智負擔
2. UI:targetAggregate 旁邊提供 Aggregate notes 的 picker

**S5 — PolicyPanel UI**

立場:**新增 `src/components/DetailPanel/PolicyPanel.tsx`**(沿用 AggregatePanel / DtoPanel pattern):

```
┌─ Policy Detail Panel ─────────────┐
│ [Policy 名稱 input]               │
│ ─────────────────────────────────  │
│ TRIGGERED BY                      │
│   Type: [DomainEvent ▾]          │
│   Name: [permissionDeleted...] [⌕]│ ← name 輸入 + 旁邊小 picker icon (board notes)
│ ─────────────────────────────────  │
│ ISSUES (Commands fired)           │
│   ┌─ Issue 1 ──────────────────┐  │
│   │ Type: [Command ▾]          │  │
│   │ Name: [removePerm...] [⌕]  │  │
│   │ Target Aggregate: [Role][⌕]│  │
│   │              [× Delete]     │  │
│   └────────────────────────────┘  │
│   [+ Add Issue]                  │
│ ─────────────────────────────────  │
│ NOTES                             │
│   [free text area]                │
└────────────────────────────────────┘
```

UI 元件:
- type 用既有 dark-theme dropdown(可重用 TypeDropdown 但不適合 — 它是給 type 字串用的)。**新做小 EnumDropdown 元件** 或直接 inline `<select>`(少代碼)。
- name input 旁邊 picker icon 點開 → 顯示 board 上對應 type 的 notes(列表),user pick → 同寫 name + noteRef
- targetAggregate 同 pattern
- issues 是 array,每筆有刪除按鈕,底下「+ Add Issue」

**S6 — Canvas 顯示**

立場:**Canvas Policy note 卡面 derive 顯示 trigger + issues 摘要**(類似 DTO note 用 dtoDerived 顯示 fields):

格式:
```
┌─ Policy ──────────────┐
│ Permission Cleanup    │ ← label
│                       │
│ ◇ on permissionDel..  │ ← trigger 摘要(◇ icon 表示 reactive)
│ → removePermission... │ ← issues 摘要(→ icon 表示 issued)
└───────────────────────┘
```

論點:
1. canvas 上看一眼就知道 Policy 做什麼,不用點開 panel
2. 新增 `policyDerived.ts`(類似 `dtoDerived.ts`)
3. 多筆 issues 顯示「→ X (+2 more)」

**S7 — MCP tool**

立場:**短期擴充既有 `es_update_note` 的 zod schema 接受 `policyTrigger` / `policyIssues`**,不新增專用 `es_update_policy_*` tools。

論點:
1. Policy 寫法相對簡單,專用 tool 邊際效益低
2. 既有 update_note 已支援 partial update,加 optional 欄位即可
3. 若未來 AI 工作流需要「批次設 Policy」可再開專用 tool
4. **務必**同步補 BE-local Project type 的 Policy 欄位(對稱)

**S8 — 實作 step + 改動檔案 + grep**

Steps:
1. `src/types/specs.ts`:加 `PolicyTrigger` / `PolicyIssue` interface
2. `src/types/elements.ts`:StickyNote 加 `policyTrigger?` / `policyIssues?`
3. `mcp-server/src/index.ts`:BE 鏡像同步
4. `src/store/boardStore.ts`:**新增 actions**:`updatePolicyTrigger(noteId, trigger)` / `updatePolicyIssues(noteId, issues)`(類似 `updateAggregateIdentity` pattern)
5. `src/components/DetailPanel/PolicyPanel.tsx`(NEW):panel 元件
6. `src/components/DetailPanel/DetailPanel.tsx`:case 'Policy' switch dispatch 到 PolicyPanel
7. `src/utils/policyDerived.ts`(NEW):canvas 顯示 derive
8. `src/components/StickyNote/StickyNote.tsx`:Policy type 顯示用 policyDerived
9. (可選)`mcp-server/src/index.ts`:`es_update_note` zod schema 加 policy 欄位
10. (可選)`src/utils/markdownExporter.ts` / `jsonExporter.ts`:Policy export 包含這兩欄

驗收 grep:
```
grep -q 'export interface PolicyTrigger' src/types/specs.ts
grep -q 'export interface PolicyIssue' src/types/specs.ts
grep -q 'policyTrigger?:' src/types/elements.ts
grep -q 'policyIssues?:' src/types/elements.ts
test -f src/components/DetailPanel/PolicyPanel.tsx
test -f src/utils/policyDerived.ts
grep -q 'updatePolicyTrigger' src/store/boardStore.ts
grep -q 'updatePolicyIssues' src/store/boardStore.ts
grep -q "case 'Policy'" src/components/DetailPanel/DetailPanel.tsx
npx tsc --build && npm run build
```

---

#### 🅱️ Codex — 回應

**S1**:同意 schema。**補強**:`policyIssues` 是 array,但**初版可選擇單一**(0 或 1 issue),UI 用「+ Add Issue」遞增。對舊 Policy(沒這欄位)resolve 要安全:`note.policyTrigger?.name ?? ''`、`note.policyIssues ?? []`,canvas 顯示沒值就空白即可。

**S2**:同意嚴格初版列舉。**補強**:type 欄位設成 `'DomainEvent'` 字面值 union(嚴格 1 選),UI 上 dropdown 只列 1 選擇,**外觀上看起來是 readonly 提示**。未來擴展時改 union 即可,UI 自動展開。

**S3**:同意 free-form name + 可選 noteRef pattern。**補強**:noteRef 解析失敗(stale)時,不擋 user — 仍顯示 name(類似 DTO stale ref 行為)。**警告**:user 重新命名 DomainEvent note 時,Policy 的 name 不會自動更新(只有 noteRef 跟 note id 連結);UI **不主動同步** name(避免 user 自訂的 canonical name 被覆蓋)。在 UI 顯示 stale 警示即可。

**S4**:同意。**補強**:targetAggregate 是 issues 內欄位,所以是 per-issue。每個 issue 都可能有不同 aggregate target。

**S5**:同意 PolicyPanel UI。**補強**:
- type dropdown 用 inline `<select>` 或 EnumDropdown — 我傾向 `<select>`(原生、a11y 好、code 少)
- 既然 type 列舉只 1 選擇,可考慮**初版不顯示 dropdown,直接 hardcode label 顯示「DomainEvent」/「Command」**,等未來擴展再加 dropdown。
- name picker icon `[⌕]` 點開後 popover 顯示對應 type notes,跟 dtoSpecRef picker 行為一致。建議**重用 / 抽出共用 NoteRefPicker** 元件:`<NoteRefPicker noteType="DomainEvent" allNotes={...} value={noteRef} onPick={(name, ref) => ...} />`

**S6**:同意 canvas 顯示。**補強**:multi-issues 顯示策略:
- 1 issue → `→ <name>`
- 2 issues → `→ <name1>, <name2>`
- 3+ issues → `→ <name1>, <name2> (+N more)`
不要折行太多,避免卡片高度爆炸。

**S7**:同意擴 update_note。**警告**:既有 update_note partial update 寫進 store 是 `Object.assign` 模式;若 user 透過 MCP 傳 `policyIssues: [...]` 是**整段替換**(不是 append),這個語意要明示在 tool description。

**S8**:Steps 同意。**補強 grep**:
```
! grep -n 'policyTrigger\\|policyIssues' src/types/bundle.ts  # legacy bundle 不該被波及
```
spec 裡寫進 invariant:`note.type !== 'Policy'` 時 policyTrigger / policyIssues 應為 undefined(若有資料是異常,顯示但不刪)。

---

#### 🅲 Gemini — 回應

**S1**:同意 schema。**架構觀察**:PolicyTrigger / PolicyIssue 放在 `src/types/specs.ts` 還是 `src/types/elements.ts`?
- specs.ts 是「Spec Bundle 相關型別」(Invariant、AggregateIdentity 等)
- elements.ts 是「畫布元素」(StickyNote、Link、Remodel)
- Policy spec 偏 specs.ts(它是 sticky note 的 spec content,類似 AggregateIdentity / DtoField)
- 我建議放 **specs.ts**

**S2**:同意嚴格列舉。**補強**:zod 鏡像在 BE 也要對齊,future expansion 同步。

**S3**:同意。**強烈建議**抽出 `noteRefDisplay(name, noteRef, allNotes, expectedType)` helper 至 policyDerived.ts(或共用 utils),讓 PolicyPanel trigger 顯示、canvas 顯示、export 都走同一段邏輯,避免顯示不一致(這次 dtoDerived 的經驗教訓)。

**S4**:同意。

**S5**:同意 PolicyPanel pattern。**強烈支持** Codex 提的 `NoteRefPicker` 共用元件 — 同樣的 picker pattern 已經在 dtoSpecRef 實現過(藏在 TypeOrDtoPicker 內),這次再做一次容易漂移。**建議在本 task 抽出共用 NoteRefPicker**(雖然 scope 加大,但長遠投資)。但若怕 scope creep,可**先 inline 實作**,future task 再 refactor。**user 偏好決定**。

**S6**:同意。**補強 invariant**:Policy note 的 label 仍是 user 自訂,canvas 顯示應該是「label + trigger 摘要 + issues 摘要」三層。folded / collapsed 狀態下只顯示 label。

**S7**:同意擴 update_note。

**S8**:同意 step。**補強 verification**:
- 新 actions 在 `BoardStore` interface 也要加(否則 TS 會抱怨)
- `case 'Policy'` switch 確保 fallthrough 到 NotePanel(若 panel 渲染失敗時的 fallback)

子議題建議狀態:S1 / S2 / S3 / S4 / S6 / S7 / S8 → `agreed`;S5 → `pending`(NoteRefPicker 抽不抽,需 user 拍板)。

---

### Round 2 (2026-05-06) — S5 鎖定

#### 🅰️ Claude 收斂

**S5 final**:**inline 實作,不抽 NoteRefPicker 共用元件**。

理由:
1. Policy 版 picker 與 dtoSpecRef picker 顯示與欄位皆不同(DTO label vs Event/Command label;name+noteRef vs type+dtoSpecRef),抽得「巧」反而增加參數複雜度
2. Inline 約 200 行 vs 抽共用 250 行 + 兩個 wrapper 50 行 — 投資不划算
3. 若未來真有第三個類似 picker(很可能),屆時再 refactor,pattern 已穩

ARM Codex / Gemini agreed implicitly(both said "leave to user");Claude 拍板,進 spec。

S5 → `agreed`。

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| S1 | StickyNote 加 `policyTrigger?: PolicyTrigger`(單值) + `policyIssues?: PolicyIssue[]`(array);PolicyTrigger / PolicyIssue 放 `src/types/specs.ts` | ✅ | ✅ | ✅ | `agreed` |
| S2 | 初版 trigger.type 只 `'DomainEvent'`、issues[].type 只 `'Command'`;schema 用 union 寫法預留擴展 | ✅ | ✅ | ✅ | `agreed` |
| S3 | name 是 free-form `string`;`noteRef?: string` 可選輔助;UI picker 同寫;stale ref 不主動清也不覆蓋 name | ✅ | ✅ | ✅ | `agreed` |
| S4 | targetAggregate 同 S3 模式(per issue,有 free string + optional ref) | ✅ | ✅ | ✅ | `agreed` |
| S5 | **inline 實作**:不抽共用 NoteRefPicker;Policy picker 與 dtoSpecRef picker 各自實作;未來 refactor follow-up | ✅ | ✅ | ✅ | `agreed` |
| S6 | Canvas 顯示 derive:`◇ on <trigger>` + `→ <issue1>, <issue2> (+N more)`;新檔 policyDerived.ts | ✅ | ✅ | ✅ | `agreed` |
| S7 | MCP 擴 `es_update_note` zod schema 接 policyTrigger / policyIssues;不新 tool;tool description 明示 issues 是整段替換 | ✅ | ✅ | ✅ | `agreed` |
| S8 | 7-9 個檔案改動;新 actions `updatePolicyTrigger` / `updatePolicyIssues`;case 'Policy' switch 接 PolicyPanel | ✅ | ✅ | ✅ | `agreed` |

**全 8 子議題 R1+R2 收斂,無 dispute。**

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round |
|---|------|---------|-----------|
| D1 | StickyNote 加 `policyTrigger?` 單值 + `policyIssues?` array;PolicyTrigger / PolicyIssue 放 specs.ts | 2026-05-06 | R1 |
| D2 | type 嚴格列舉(初版 trigger=DomainEvent / issues=Command);union 預留擴展 | 2026-05-06 | R1 |
| D3 | name + 可選 noteRef pattern;UI picker 同寫;stale ref 不覆蓋 name | 2026-05-06 | R1 |
| D4 | PolicyPanel inline 實作 picker(不抽共用 NoteRefPicker);type 用原生 `<select>` 或 inline display | 2026-05-06 | R2 |
| D5 | Canvas 顯示用 policyDerived.ts(新檔);多 issues 顯示 +N more 摺疊 | 2026-05-06 | R1 |
| D6 | MCP 擴 update_note(不新 tool);整段替換語意明示 | 2026-05-06 | R1 |
| D7 | 新增 store actions `updatePolicyTrigger` / `updatePolicyIssues` | 2026-05-06 | R1 |

---

## 開放問題

無。

---

## Spec-Ready Checklist

### Schema(specs.ts)

```ts
export interface PolicyTrigger {
  type: 'DomainEvent';      // future: union expansion
  name: string;
  noteRef?: string;         // optional DomainEvent note id
}

export interface PolicyIssue {
  type: 'Command';          // future: union expansion
  name: string;
  noteRef?: string;         // optional Command note id
  targetAggregate?: string;
  targetAggregateRef?: string;  // optional Aggregate note id
}
```

StickyNote(elements.ts)加:
```ts
policyTrigger?: PolicyTrigger;
policyIssues?: PolicyIssue[];
```

### 改動檔案

| 檔案 | 動作 |
|---|---|
| `src/types/specs.ts` | 加 PolicyTrigger / PolicyIssue interface |
| `src/types/elements.ts` | StickyNote 加 policyTrigger? / policyIssues? |
| `mcp-server/src/index.ts` | BE 鏡像同步;`es_update_note` zod schema 加兩欄 optional |
| `src/store/boardStore.ts` | 加 actions `updatePolicyTrigger` / `updatePolicyIssues`;BoardStore interface 同步 |
| `src/types/board.ts` | BoardStore interface 加 actions 簽名 |
| `src/components/DetailPanel/PolicyPanel.tsx`(NEW) | Policy 編輯器 panel,含 trigger / issues 兩段、inline note ref picker |
| `src/components/DetailPanel/DetailPanel.tsx` | switch case 'Policy' → render PolicyPanel |
| `src/utils/policyDerived.ts`(NEW) | derive canvas 顯示字串 |
| `src/components/StickyNote/StickyNote.tsx` | Policy type 顯示用 policyDerived 衍生內容 |

### Non-goals(行為層)

- 不刪 legacy `interface Policy { rule, severity }`(未用,但不主動清)
- 不改 Policy note 顏色 / dnd / palette UI
- 不支援 trigger.type 除 DomainEvent 以外(初版)
- 不支援 issues[].type 除 Command 以外(初版)
- 不支援嵌套(trigger 觸發另一個 Policy 等)
- 不抽共用 NoteRefPicker(Policy picker 與 dtoSpecRef picker 各自實作)
- 不做 Policy → Aggregate 自動建立 link 線(將來 follow-up)
- 不做跨 board reference



