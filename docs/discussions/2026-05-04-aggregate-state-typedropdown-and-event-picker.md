---
topic: "Aggregate State 編輯器加 TypeDropdown + Pick from Event 功能"
status: consensus
created: "2026-05-04"
updated: "2026-05-04"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 1
---

# Aggregate State 編輯器加 TypeDropdown + Pick from Event 功能

## 議題定義

### 背景

DetailPanel 的 Aggregate State 編輯器（`src/components/DetailPanel/AggregatePanel.tsx` 內部 `StatePropertyTable`）目前 Type 欄位是純 `<input>`，跟 `AddCommandModal` 的下拉式 `TypeDropdown` 不一致。User 反映兩個 UX 缺陷：

1. State 的 Type 欄位沒下拉選單，得手打。
2. Aggregate State 的欄位常與所屬 event 的 Command input parameters / DomainEvent eventProperties 重疊，希望可以直接挑。

### 目標

收斂出可一次寫成 spec 的實作細節，避免實作後反覆修。

### 範圍

- 抽 `TypeDropdown` 為共用元件並套用到 4 處（AddCommandModal、AggregatePanel state、DetailPanel Command information、DetailPanel DomainEvent eventProperties）。
- AggregatePanel state 加「+ Pick from Event ▾」按鈕（方案 A），單擊 append 一筆，重複 attrName 顯示「(added)」。
- 來源：相關 event 的 `Command.information` ＋ `DomainEvent.eventProperties`。
- 沒有相關 event 時按鈕 disabled + tooltip "No related events yet"。
- 「相關 event」= 所有 `event.entityId === aggregateNote.id` 的 DomainEvent。

### 約束

- 三層 wire-strip / persist v16 migration / cross-store reactivity 不能被破壞。
- 沿用既有 `updateStateProperties` action，不增 store action。
- 不改 wire schema、不影響 SSE sync 行為。
- 視覺風格與 AddCommandModal 一致（深色 dropdown）。

### 子議題

- [ ] **S1**：`TypeDropdown` 元件抽到哪、props 介面、是否需要 theme 支援
- [ ] **S2**：「+ Pick from Event ▾」資料來源結構（grouping、ordering、empty rule）
- [ ] **S3**：「(added)」判斷條件（單純 attrName / attrName+type / 其他）與 type conflict 處理
- [ ] **S4**：dropdown 開關行為（單擊 append 後是否關閉？click-outside / Esc）與鍵盤可達性
- [ ] **S5**：Pick from Event 時，未在 customTypes 的 type 是否自動加入 `project.customTypes`
- [ ] **S6**：實作 step、檔案改動表、驗收 grep 設計（給 spec 用）

---

## 討論紀錄

### Round 1 (2026-05-04)

#### 🅰️ Claude (facilitator) — 提案

**S1 — TypeDropdown 抽到哪、props、theme**

立場：抽到 `src/components/shared/TypeDropdown.tsx`，**props 維持現狀**（`value, onChange, customTypes, onAddCustomType`），**不**加 theme prop。

論點：
1. `BUILT_IN_TYPES` 同樣搬進 shared 檔案 `export` 出去，避免散落。
2. `ColoredPropertyTable` 的淺色卡片是 Remodel 內部塊，這次 user 沒提 Remodel，**不換**那邊的 input；繼續用舊 input。等 Remodel 也要換時再加 theme，YAGNI。
3. 共用 4 處（AggregatePanel state、DetailPanel PropertyTable、AddCommandModal、未來 dtoFields editor 也可改）— 全部都是深色背景，不會不一致。

風險點：若日後 ColoredPropertyTable 也想換成 dropdown，需要再開一個 ticket。可接受。

**S2 — Pick from Event dropdown 結構**

立場：以「每個相關 event 一個 group」為主架構，每個 group 內分 **Input** 與 **Output** 兩 sub-section。

```
FROM userCreated/createUser
  Input
    id : String
    employeeId : String
  Output
    userId : UUID
FROM userEdited/editUser
  Input
    id : String  (added)
  Output
    ...
```

論點：
1. Group header 顯示 `event.label / command.label`（command 可能不存在，缺則只顯示 event）。
2. ordering：依 event.position.x 升序（畫布從左到右），讓 user 易找。
3. 空 group：若 event 沒有 input 也沒有 output 屬性，**整個 event group 不顯示**。
4. 整個 picker 為 0 entry → 按鈕本身 disabled（涵蓋 user 拍板的「沒有相關 event」case + 「有 event 但全空」case，行為一致）。

**S3 — "(added)" 判斷與 conflict 處理**

立場：**只看 attrName**，不看 type。已 added 的 row **點擊 no-op**（gray cursor:not-allowed）。

論點：
1. State 裡同 attrName 只能一筆（否則語意衝突）。判斷邏輯：`stateProperties.some(s => s.attrName.trim() === picker.attrName.trim())`。
2. 同 attrName 不同 type（e.g. createUser 的 `id: String` vs userCreated 的 `id: UUID`）的處理：兩個 row 都顯示在 picker，但**只要 user 已加過 `id`（從任一個來源），其餘 `id` row 都顯示 (added)**。要改 type，請 user 自己改 state 裡那個 row，不是 picker 替換。
3. 不做「點擊已 added 替換 type」是因為靜默替換太危險（state 已有 invariants 引用這欄位）。

風險點：user 可能困惑為什麼明明來源不同卻全都灰掉。Mitigate：tooltip "Already in state — edit the row above to change type"。

**S4 — dropdown 行為**

立場：
- **單擊 append → dropdown 保持開啟**（使用者可連點多筆）。
- **click outside 關閉**（含畫布、其他面板區域）。
- **Esc 關閉**。
- **不**做 arrow-key navigation（既有 TypeDropdown 也沒做，保持一致）。
- 按鈕本身 `aria-label="Pick state field from related events"`，每個 row `role="button"` + `aria-disabled`。

論點：與既有 TypeDropdown 行為對稱（click-outside / Esc / no kbd-nav），降低學習成本。

**S5 — Pick 時 type 自動 addCustomType？**

立場：**是**，自動呼叫 `addCustomType(type)`，但**只在 type 既不在 BUILT_IN_TYPES 也不在 customTypes 時**。

論點：
1. 假設 Command 已用 `User` type（從某 Aggregate 名延伸），但 `project.customTypes` 沒登錄 → state pick 後若不自動加，下次 TypeDropdown 看不到，違反 user 一致性期待。
2. addCustomType action 已是 idempotent（內含 `!includes(trimmed)` 防呆，boardStore.ts:611-617）— 即使重複呼叫也安全。
3. 不做這個會讓 picker 引入 type 後 dropdown 顯示「自定義 type」少一個，不一致。

**S6 — spec 用 step / 改動檔案 / 驗收 grep**

立場：分 4 個 step + 1 個 verification gate set。

Steps：
1. 新增 `src/components/shared/TypeDropdown.tsx`（內含 BUILT_IN_TYPES + TypeDropdown + HoverOption）— 純剪貼自 AddCommandModal 並 export。
2. AddCommandModal 改 import shared，刪本地副本。
3. DetailPanel `PropertyTable`（line 97-184）的 type input 換為 TypeDropdown；引入 customTypes/addCustomType 從 store。
4. AggregatePanel `StatePropertyTable` type input 換 TypeDropdown；新增 `EventPropertyPicker` 子元件 + 「+ Pick from Event ▾」按鈕。

改動檔案：
- `src/components/shared/TypeDropdown.tsx` (NEW)
- `src/components/Modals/AddCommandModal.tsx` (refactor import)
- `src/components/DetailPanel/DetailPanel.tsx` (PropertyTable 換 dropdown)
- `src/components/DetailPanel/AggregatePanel.tsx` (StatePropertyTable 換 dropdown + 加 picker)

不改：`ColoredPropertyTable` (Remodel 區塊保留 plain input)、store actions、wire schema、persist version。

驗收 grep（給 audit-spec / pickup verification 用）：
```
test -f src/components/shared/TypeDropdown.tsx
grep -q 'export.*TypeDropdown' src/components/shared/TypeDropdown.tsx
grep -q 'export.*BUILT_IN_TYPES' src/components/shared/TypeDropdown.tsx
! grep -n 'const TypeDropdown' src/components/Modals/AddCommandModal.tsx
! grep -n 'BUILT_IN_TYPES = \[' src/components/Modals/AddCommandModal.tsx
grep -q "from.*shared/TypeDropdown" src/components/Modals/AddCommandModal.tsx
grep -q "from.*shared/TypeDropdown" src/components/DetailPanel/DetailPanel.tsx
grep -q "from.*shared/TypeDropdown" src/components/DetailPanel/AggregatePanel.tsx
grep -q 'Pick from Event' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'No related events yet' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'addCustomType' src/components/DetailPanel/AggregatePanel.tsx
npx tsc --build
npm run build
```

子議題建議狀態：S1/S2/S5/S6 → `pending`（等他方覆審）；S3/S4 → `pending`（爭議點 attrName-only 與 dropdown 不關閉行為，需確認）。

---

#### 🅱️ Codex (GPT-5.4) — 回應

**S1**：基本同意，但建議 props 留**第三個彈性參數** `position?: 'absolute' | 'static'`。理由：未來嵌進 Modal vs 嵌進 sidebar 時 dropdown panel 可能需要不同 popup 策略。但 YAGNI 另一面，Claude 提案不加也合理 — **暫時不加，等真的撞到再加**。對 BUILT_IN_TYPES export 強烈贊成。

**S2**：贊成 Input/Output 分組。但要釐清：
1. 「Input」section 標題應寫 `Input (Command)` 還是直接 `Input`？建議 `Input` — 簡潔，user 已從 group header 知道 command name。
2. 若 event 有 entityId 指向當前 aggregate 但 commandId 為 null（沒設 command），**Output 仍要顯示**，只是沒 Input。這是常見的 incremental 編輯 case。
3. event ordering 用 `position.x` 升序我同意，但平手時用 `event.createdAt` 為 tie-breaker，避免 React reorder flicker。

**S3**：強烈同意 attrName-only。補一個邊角案例：state 裡有 `id` (大寫 ID 同義詞)，picker 出 `Id` — trim 後 lowercase compare 會誤判嗎？建議 **case-sensitive trim equality**（保持嚴謹，不做 case-insensitive 否則 user 可能想要 `id` 和 `Id` 並存）。tooltip 加上去，避免「為什麼明明來源不同卻全灰」的困惑。

**S4**：同意所有點。**但補強一個風險**：dropdown 保持開啟的情況下，user 連點 5 筆，每筆都 setState → 5 次 re-render。對 zustand 來說不是問題（內部 batch），但要確認 `useBoardStore.getState()` 取最新 state 時的 closure（`updateStateProperties` 接收 `[...current, newProp]`，current 必須來自最新 state，不能 closure 舊值）。建議 picker 內每次計算 `current` 用 `useBoardStore.getState().project...stateProperties` 而非 props 傳下來的（prop 來自 hook，可能 stale 1 frame）。

風險：跨 store reactivity loss 在這次 v16 後已修，但 picker 是新 code，要小心。

**S5**：同意 auto addCustomType。補一條：picker 顯示 type 時也要做相同邏輯 — 比如 type 不在 customTypes 也不在 BUILT_IN_TYPES，picker 行還是要顯示出 type（不能因為「沒登錄」就不顯示）。display 不做過濾，只在 click 時 register。

**S6**：spec step 與 grep 都合理，但建議多 1 條 grep：
```
! grep -n 'placeholder="String"' src/components/DetailPanel/DetailPanel.tsx
! grep -n 'placeholder="Type"' src/components/DetailPanel/DetailPanel.tsx
```
偵測舊的 `<input placeholder="Type">` 是否確實被換掉（怕 PropertyTable 換了但漏 ColoredPropertyTable 寫錯地方 — 雖然我們刻意不換 Colored 版）。

但等等 — ColoredPropertyTable 也有 `placeholder="Type"` line 1078。grep 會誤報。**Refine**：只 grep `PropertyTable` 函式 body 範圍：

```
awk '/^const PropertyTable/,/^const ColoredPropertyTable/' src/components/DetailPanel/DetailPanel.tsx | grep -q 'TypeDropdown'
```

子議題建議狀態：S1/S2/S3/S4/S5/S6 → 全部 `agreed`（Claude 提案合理，我補的細節都是強化）。

---

#### 🅲 Gemini — 回應

**S1**：同意抽 shared，但**強烈建議**檔案結構：
```
src/components/shared/
  TypeDropdown.tsx    # 元件 + types
  TypeDropdown.types.ts  # OR 直接 inline
```
不用拆 types 檔；Claude 路徑 OK。BUILT_IN_TYPES 命名建議改 `BUILT_IN_TYPE_LIST` 與其他常數呼應（src/constants/elementTypes.ts 用 `PALETTE_TYPE_LIST`）— 但這是純 cosmetic，不堅持。

**S2**：贊成 Input/Output 分組。多一個觀察：picker 必須**同時**訂閱 `note.stateProperties` 與相關 events 兩邊；如果 event 增刪 / property 改名 / commandId 改連結，picker 要即時反映。建議 picker 用 `useMemo`，依賴 `[note.stateProperties, allEventsRelatedSignature]`，其中 signature 用 `events.map(e => e.id + ':' + e.commandId + ':' + (e.eventProperties?.length ?? 0)).join(',')` 之類。

**S3**：attrName-only 同意。**但補一個 user research 觀察**：user 可能不知道 picker 自己 Aggregate 的 stateProperties 已含相同 attrName（剛在 textbox 打了一個還沒 blur），在 picker 看到 "(added)" 會困惑。**Solution**：picker 開啟時 force focus 出當前 input — 或乾脆讓 picker 計算 added 用「persisted state」即可（即用 `note.stateProperties` 而非 local input value）。我同意 Claude 的 persisted-state 方案，純 attrName 比對。

**S4**：dropdown 行為都同意。但**補一條 a11y**：`role="listbox"` 在 dropdown 容器，每個 row `role="option"` + `aria-selected={isAdded}`，方便螢幕閱讀器。Claude 沒提到，Codex 也沒提，但這是基本 a11y。可選但建議。

**S5**：同意自動 addCustomType。但**警告一個 edge case**：picker 連點 5 筆 type 都不在 customTypes，會 5 次 dispatch addCustomType → 5 次 re-render → 5 次 wire POST（debounced）。實務上 OK 但**確認 addCustomType 是 idempotent**（boardStore.ts:611-617 已防呆，✅）。

**S6**：grep 補強建議：
```
# 確保 useUIStore 不被誤引入（picker 不該訂閱 UI state）
! grep -n 'useUIStore' src/components/shared/TypeDropdown.tsx
```
（防止 shared 元件意外耦合 store）。其他都同意。

**架構 / 一致性視角**：這次抽 shared 元件是**正確方向**，未來 DtoPanel 編輯 dtoFields 也可以共用。但要注意 `Property` 型別 與 `DtoField` 型別不完全同（DtoField 有 nullable, dtoSpecRef）— shared TypeDropdown 只負責 type 字串，不關心是哪種 wrapper，OK 不衝突。

子議題建議狀態：S1/S2/S5/S6 → `agreed`；S3 → `agreed`（含 Codex 的 case-sensitive 與我的 added-tooltip 補強）；S4 → `agreed`（Claude 主軸 + Codex closure 警告 + 我的 a11y 補強）。

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| S1 | TypeDropdown 抽到 `src/components/shared/TypeDropdown.tsx`，props 維持 `value/onChange/customTypes/onAddCustomType`，**不**加 theme prop（YAGNI），BUILT_IN_TYPES 一併搬入並 export | ✅ | ✅ | ✅ | `agreed` |
| S2 | Picker 以 event 為 group，每 group 內分 Input / Output 兩 sub-section；ordering 用 `position.x` 升序、`createdAt` tie-breaker；空 group 不顯示；entry 為 0 整體按鈕 disabled | ✅ | ✅ | ✅ | `agreed` |
| S3 | "(added)" 判斷只看 attrName（case-sensitive trim equality）；點已 added row no-op + tooltip "Already in state — edit the row above to change type"；不做靜默 type replace | ✅ | ✅ | ✅ | `agreed` |
| S4 | 單擊 append 後 dropdown 保持開啟；click outside 關、Esc 關；不做 arrow-key nav；picker 內讀 `useBoardStore.getState()` 取最新 stateProperties 避免 stale closure；container `role="listbox"`、row `role="option"` + `aria-selected` | ✅ | ✅ | ✅ | `agreed` |
| S5 | Pick 時 type 不在 BUILT_IN 也不在 customTypes → 自動 `addCustomType(type)`（idempotent，已驗證）；display 階段不過濾，僅 click 時 register | ✅ | ✅ | ✅ | `agreed` |
| S6 | 4 step 實作 + 4 個檔案改動 + 13 個 verification grep（含 Codex 提的 awk PropertyTable 範圍鎖定 + Gemini 提的 useUIStore 反向耦合防呆） | ✅ | ✅ | ✅ | `agreed` |

**全部子議題在 Round 1 收斂，無 dispute。**

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|
| D1 | TypeDropdown 抽到 `src/components/shared/TypeDropdown.tsx`，props 不加 theme，BUILT_IN_TYPES 同檔 export | 2026-05-04 | R1 | ColoredPropertyTable 不換，等真撞到再加 theme |
| D2 | EventPropertyPicker 資料結構：event 為主 group → Input/Output sub-section，按 position.x 排 | 2026-05-04 | R1 | 空 group 隱藏；總 entry 為 0 → 按鈕 disabled |
| D3 | "(added)" 純 attrName 比對（case-sensitive），點已 added row no-op + tooltip 提示 | 2026-05-04 | R1 | 同 attrName 跨 event 統一灰掉；不做 type replace |
| D4 | 單擊 append 後 dropdown 不關閉；click-outside / Esc 關閉；無 arrow-key nav；listbox/option ARIA | 2026-05-04 | R1 | picker 內取最新 state 用 `useBoardStore.getState()` |
| D5 | 自動 addCustomType 當 type 既不在 BUILT_IN 也不在 customTypes（idempotent 安全） | 2026-05-04 | R1 | display 不過濾、click 時 register |
| D6 | 4 step / 4 file / 13 grep 驗收條（含 awk 範圍鎖 + 防 shared 反向耦合 useUIStore） | 2026-05-04 | R1 | 細節見下方 checklist |

---

## 開放問題

無。

---

## Spec-Ready Checklist（給 `/write-spec` 用）

### 介面合約

**新檔 `src/components/shared/TypeDropdown.tsx`**
```ts
export const BUILT_IN_TYPES: readonly string[] = [
  'String', 'Int', 'Float', 'Boolean',
  'Date', 'DateTime', 'UUID', 'ID',
  'Long', 'Double', 'Decimal',
  'Object', 'Array', 'JSON',
];

export interface TypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  customTypes: string[];
  onAddCustomType: (typeName: string) => void;
}

export const TypeDropdown: React.FC<TypeDropdownProps>;
```

**新元件 `EventPropertyPicker`（在 `AggregatePanel.tsx` 內或抽小檔皆可，傾向 inline）**
```ts
interface EventPropertyPickerProps {
  aggregateNoteId: string;
  // 透過 useBoardStore 取所有 notes，篩選 event.entityId === aggregateNoteId
  // 透過 event.commandId 找 command（可 null）
  // entries: { eventId, eventLabel, commandLabel?, kind: 'input'|'output', attrName, type }[]
  onPick: (attrName: string, type: string) => void;
  // disabled 由父決定（entries 為 0 時）
}
```

### 改動檔案

| 檔案 | 動作 | 描述 |
|---|---|---|
| `src/components/shared/TypeDropdown.tsx` | NEW | 從 AddCommandModal 整段搬出（TypeDropdown + HoverOption + BUILT_IN_TYPES + 必要 styles） |
| `src/components/Modals/AddCommandModal.tsx` | UPDATE | 刪本地 TypeDropdown / HoverOption / BUILT_IN_TYPES，改 import shared |
| `src/components/DetailPanel/DetailPanel.tsx` | UPDATE | `PropertyTable`（line 97-184）的 type input 換 TypeDropdown；引入 customTypes / addCustomType；`ColoredPropertyTable` **不動**（line 1032-1122 維持 plain input） |
| `src/components/DetailPanel/AggregatePanel.tsx` | UPDATE | `StatePropertyTable` type input 換 TypeDropdown；新增 `EventPropertyPicker` + 「+ Pick from Event ▾」按鈕（按鈕在 `+ Add State Field` 旁，水平並列） |

### 實作 Step

1. **建立 `src/components/shared/TypeDropdown.tsx`**：
   - 整段剪 AddCommandModal.tsx:15-275 的 TypeDropdown / HoverOption / BUILT_IN_TYPES / 必要的 INPUT_STYLE / 顏色常數
   - export `TypeDropdown` (default + named)、`BUILT_IN_TYPES`、`TypeDropdownProps`

2. **AddCommandModal.tsx 改 import**：
   - 刪本地 BUILT_IN_TYPES / TypeDropdown / HoverOption
   - `import { TypeDropdown } from '../shared/TypeDropdown';`
   - 確保 customTypes / onAddCustomType 仍從 store 取後傳入

3. **DetailPanel.tsx PropertyTable 換 dropdown**：
   - import TypeDropdown
   - 函式內引入 `useBoardStore` 取 customTypes + addCustomType（避免每個 row prop drilling）
   - line 132-141 的 type input 換為 `<TypeDropdown value={prop.type} onChange={...} customTypes={...} onAddCustomType={...} />`
   - **不**動 ColoredPropertyTable

4. **AggregatePanel.tsx**：
   - StatePropertyTable type input 換 TypeDropdown（同 step 3 模式）
   - 新增 EventPropertyPicker 元件（dropdown panel + entries 列表）：
     - 取 active board notes：`useBoardStore((s) => s.project.boards.find((b) => /* 透過 useUIStore 得 activeBoardId */)?.notes ?? [])`
       - 但 AggregatePanel 已從 `flowPaths` prop 拿到 board context，注意 notes 來源；最簡單是從 store 用 `useActiveBoard()` hook（已存在於 src/store/selectors.ts）
     - 篩選 `n.type === 'DomainEvent' && n.entityId === note.id` → relatedEvents
     - sort by position.x asc, createdAt asc
     - 每個 event 取 commandNote = notes.find(n => n.id === event.commandId)
     - entries = events.flatMap(e => [...input from commandNote.information, ...output from e.eventProperties]) 帶 sourceLabel
     - 若 entries.length === 0 → 按鈕 disabled + title="No related events yet"
   - 點 entry → 檢查 attrName 已在 stateProperties → 若是 → no-op（disabled cursor + "(added)" + tooltip "Already in state — edit the row above to change type"）；若否 → `useBoardStore.getState()` 取最新 stateProperties，append `{ attrName, type }`，呼叫 `updateStateProperties(note.id, [...]).`；若 type 不在 BUILT_IN 也不在 customTypes 則同步 `addCustomType(type)`
   - dropdown 行為：click outside 關、Esc 關、單擊 append 不關
   - ARIA：container `role="listbox"`、row `role="option" aria-selected={isAdded} aria-disabled={isAdded}`

### 驗收 grep / 指令（給 audit-spec 與 pickup verification）

```bash
# 檔案存在
test -f src/components/shared/TypeDropdown.tsx

# shared 元件 export
grep -q 'export.*TypeDropdown' src/components/shared/TypeDropdown.tsx
grep -q 'export.*BUILT_IN_TYPES' src/components/shared/TypeDropdown.tsx

# AddCommandModal 不再持有副本
! grep -n 'const TypeDropdown' src/components/Modals/AddCommandModal.tsx
! grep -n 'const BUILT_IN_TYPES' src/components/Modals/AddCommandModal.tsx
grep -q 'shared/TypeDropdown' src/components/Modals/AddCommandModal.tsx

# DetailPanel 引用 shared
grep -q 'shared/TypeDropdown' src/components/DetailPanel/DetailPanel.tsx

# PropertyTable（dark variant）改用 TypeDropdown，ColoredPropertyTable 保留 plain input
awk '/^const PropertyTable: React/,/^const EditableColorBlock/' src/components/DetailPanel/DetailPanel.tsx | grep -q 'TypeDropdown'
awk '/^const ColoredPropertyTable: React/,/^\/\/ ─.* Remodel Panel/' src/components/DetailPanel/DetailPanel.tsx | grep -vq 'TypeDropdown'

# AggregatePanel 兩個改動
grep -q 'shared/TypeDropdown' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'Pick from Event' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'No related events yet' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'addCustomType' src/components/DetailPanel/AggregatePanel.tsx
grep -q "role=\"listbox\"" src/components/DetailPanel/AggregatePanel.tsx

# 防 shared 反向耦合到 uiStore（per-tab UI state 不該流入 shared）
! grep -n 'useUIStore' src/components/shared/TypeDropdown.tsx

# 整體型別 / build
npx tsc --build
npm run build
```

### Non-goals

- **不**改 ColoredPropertyTable（Remodel 卡片內），維持 plain input。
- **不**新增 store action；沿用 `updateStateProperties` + `addCustomType`。
- **不**改 wire schema、persist version、SSE sync 行為。
- **不**做 arrow-key navigation（與既有 TypeDropdown 一致）。
- **不**做 case-insensitive attrName 比對。
- **不**做 type 靜默替換（user 要改 type 自己改 row）。

---

## 下次討論指引

### 進度摘要

Round 1 三方達成全面共識。所有 6 個子議題 → `agreed`，無遺留爭議。已輸出 spec-ready checklist（介面合約、改動檔案表、實作 step、驗收 grep、non-goals）。

### 待處理事項

無。下一步：
1. 呼叫 `/write-spec` 產出 `docs/tasks/2026-05-04-aggregate-state-typedropdown-and-event-picker.md`
2. 呼叫 `/audit-spec` 確認 spec 品質
3. 呼叫 `/pickup` 進入實作

### 閱讀建議

無更多 round 需要。

### 注意事項

實作時注意：
- AggregatePanel 拿 active board notes 應走 `useActiveBoard()` selector（src/store/selectors.ts），不要再寫 inline find。
- 連點 picker 時 stale closure 的危險：useBoardStore.getState() 取最新 state 再 spread。
- shared 元件不能反向 import uiStore（grep gate 會抓）。

