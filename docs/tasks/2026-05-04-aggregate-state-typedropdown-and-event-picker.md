# Aggregate State 編輯器加 TypeDropdown + Pick from Event 功能

## 來源

討論：`docs/discussions/2026-05-04-aggregate-state-typedropdown-and-event-picker.md`（Round 1，三方 agreed）

## 目標

DetailPanel 的 Aggregate State 編輯器目前 Type 欄位是純 `<input>`，與 AddCommandModal 的 dropdown 體驗不一致；同時 Aggregate State 欄位常與所屬 Event 的 Command input parameters / DomainEvent eventProperties 重疊，user 必須手抄。本 task 將 `TypeDropdown` 抽為共用元件並套用到三個 component：`AggregatePanel` 內的 `StatePropertyTable`、`DetailPanel` 內的 `PropertyTable`（同一份元件涵蓋 Command information + DomainEvent eventProperties 兩個 callsite）、`AddCommandModal`；`ColoredPropertyTable`（Remodel light-theme block）刻意保留 plain input。並在 AggregatePanel state 區段新增 「+ Pick from Event ▾」功能，讓 user 從相關 event 直接挑欄位並自動把 type 帶入。

---

## 介面合約（Interface Contract）

### 1. 新檔 `src/components/shared/TypeDropdown.tsx`

```ts
// 與既有 BUILT_IN_TYPES 完全一致（僅搬位置）
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

**所有權明示**：
- 「客製化 type 列表」唯一寫入者：`useBoardStore.addCustomType`，由各個 consumer 透過 prop `onAddCustomType` 注入。`TypeDropdown` 自身**不直接** import `useBoardStore`，純受控元件。
- 「客製化 type 列表」唯一讀取來源：`useBoardStore((s) => s.project.customTypes)`，由 consumer 透過 prop `customTypes` 注入。

**Framework 備註**：
- 沿用現有實作的 click-outside 偵測（`useEffect` + `mousedown` listener + `containerRef.contains`）與 Esc 偵測（input 上的 `keydown`）。zustand 不參與此元件 lifecycle。

### 2. 新元件 `EventPropertyPicker`（inline 於 `AggregatePanel.tsx`）

```ts
interface EventPropertyEntry {
  eventId: string;
  eventLabel: string;
  commandLabel?: string;          // 若 event 有 commandId 對應 Command note
  kind: 'input' | 'output';
  attrName: string;
  type: string;
}

interface EventPropertyPickerProps {
  aggregateNoteId: string;        // 目前面板的 Aggregate note id
  // dropdown trigger 是按鈕 "+ Pick from Event ▾"
  // entries 在元件內透過 useActiveBoard() + memoization 計算
  // 點擊 entry 時：
  //   1. 檢查 attrName（case-sensitive、trim 後）是否已在 stateProperties → 是則 no-op
  //   2. 否則 useBoardStore.getState() 取最新 stateProperties → append → updateStateProperties
  //   3. 若 entry.type 既不在 BUILT_IN_TYPES 也不在 customTypes → addCustomType(entry.type)
  // dropdown 開啟期間：單擊 entry 不關閉、click-outside 關、Esc 關
}
```

**所有權明示**：
- `aggregateNote.stateProperties` 唯一寫入路徑：`useBoardStore.updateStateProperties(noteId, updated)`，已存在 action（`src/store/boardStore.ts:646`），不新增。
- `project.customTypes` 唯一寫入路徑：`useBoardStore.addCustomType(typeName)`，已 idempotent（`src/store/boardStore.ts:622-633` 內含 `!includes(trimmed)` 防呆）。

**「相關 event」定義（不變）**：
- `relatedEvents = activeBoard.notes.filter(n => n.type === 'DomainEvent' && n.entityId === aggregateNoteId)`
- 排序：先按 `position.x` 升序，平手時按 `createdAt` 升序（避免 React reorder flicker）。

### 3. AddCommandModal、DetailPanel `PropertyTable`、AggregatePanel `StatePropertyTable`

對外行為**完全不變**：
- AddCommandModal `Props` 介面、`onConfirm(commandLabel, information)` 簽名不變。
- DetailPanel `PropertyTable<{ properties, onChange }>` 簽名不變（內部多 import 兩個 store hook 取 customTypes / addCustomType）。
- AggregatePanel `StatePropertyTable<{ properties, onChange }>` 簽名不變（同上）。

### 4. 不在介面合約內的元件 — `ColoredPropertyTable`

`ColoredPropertyTable`（DetailPanel.tsx:1032-1122 內、淺色背景的 Remodel block 用）**不**改，繼續使用 plain `<input>`。理由：本 task 範圍僅深色面板的 type 欄位，Remodel light-theme 卡片有獨立視覺語言，不混進 dropdown。

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/components/shared/TypeDropdown.tsx` | **NEW**。整段搬出 AddCommandModal 的 `BUILT_IN_TYPES`、`TypeDropdown`、`HoverOption` 與必要 styles；export `TypeDropdown`、`BUILT_IN_TYPES`、`TypeDropdownProps` |
| `src/components/Modals/AddCommandModal.tsx` | 刪本地 `BUILT_IN_TYPES` / `TypeDropdown` / `HoverOption`；改 `import { TypeDropdown } from '../shared/TypeDropdown'`；JSX 維持原樣 |
| `src/components/DetailPanel/DetailPanel.tsx` | `PropertyTable`（line ~97）的 type `<input>` 換 `<TypeDropdown />`；元件內加 `useBoardStore` 取 `customTypes` + `addCustomType`；`ColoredPropertyTable` **保留** plain input |
| `src/components/DetailPanel/AggregatePanel.tsx` | `StatePropertyTable` 的 type `<input>` 換 `<TypeDropdown />`；新增 `EventPropertyPicker` 子元件；State section 在「+ Add State Field」旁加按鈕「+ Pick from Event ▾」；新增 `useActiveBoard` import 取得 active board notes |

未列入 = 不動。包含但不限於：
- `src/store/boardStore.ts`（沿用既有 actions）
- `src/store/uiStore.ts`、`src/utils/apiSync.ts`、`mcp-server/src/index.ts`（wire-strip / sync 不受影響）
- `src/types/board.ts`、`src/types/elements.ts`（型別不變）
- 其他 9 個用 `useActiveBoard()` 的 components

---

## 實作步驟

### Step 1 — 新增 `src/components/shared/TypeDropdown.tsx`

1. 建立目錄 `src/components/shared/`（若不存在）。
2. 從 `src/components/Modals/AddCommandModal.tsx` 整段剪下：
   - `const BUILT_IN_TYPES = [...]` 陣列宣告
   - `interface TypeDropdownProps` 與 `const TypeDropdown: React.FC<TypeDropdownProps>` 元件本體
   - `interface HoverOptionProps` 與 `const HoverOption: React.FC<HoverOptionProps>` 元件本體
   - 上述元件用到的樣式常數（`INPUT_STYLE`、`TEXT_MAIN`、`TEXT_MUTED`、`TEXT_DIM`、`BORDER_COLOR`、`MODAL_BG` 等）一併複製到新檔內部
3. 新檔 export：`TypeDropdown`（named）、`BUILT_IN_TYPES`（named）、`TypeDropdownProps`（named）。`HoverOption` 保留為 file-local（不 export）。
4. 不引入任何 store / hook（純 controlled）。
5. 不 export 任何顏色常數或樣式（避免擴散；若日後其他地方需要，再個別處理）。

### Step 2 — `src/components/Modals/AddCommandModal.tsx` 改用 shared

1. 刪本地 `const BUILT_IN_TYPES = [...]` 宣告。
2. 刪本地 `interface TypeDropdownProps` 與 `const TypeDropdown` 整段。
3. 刪本地 `interface HoverOptionProps` 與 `const HoverOption` 整段。
4. 在 import 區塊新增：`import { TypeDropdown } from '../shared/TypeDropdown';`
5. JSX 內既有 `<TypeDropdown ... />` 用法不變（位於 information map 列表內，props 不需調整）。
6. 既有 `const customTypes = useBoardStore((state) => state.project.customTypes) ?? [];` 與 `const addCustomType = useBoardStore((state) => state.addCustomType);` 保留不變。
7. 注意：搬完後 AddCommandModal 內若有未使用的 `BORDER_COLOR` / `MODAL_BG` 等樣式常數仍被 modal overlay JSX 引用，**不可一併刪除**；只刪 TypeDropdown / HoverOption 自身用到、AddCommandModal 其他段落沒在用的常數（搬走前先 grep 確認）。

### Step 3 — `src/components/DetailPanel/DetailPanel.tsx` `PropertyTable` 換 dropdown

1. 在檔案頂部 imports 新增：`import { TypeDropdown } from '../shared/TypeDropdown';`
2. `PropertyTable` 元件內：
   - 新增從 store 取資料（在 component body 頂端、`inputBase` 樣式宣告之前）：
     ```ts
     const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
     const addCustomType = useBoardStore((s) => s.addCustomType);
     ```
   - 將 properties.map 內第二個 `<input>`（其上有 `placeholder="String"`、綁定 `prop.type` 與 `onChange` 中 `field: 'type'` 的那個）整個替換為：
     ```tsx
     <TypeDropdown
       value={prop.type}
       onChange={(newType) => onChange(properties.map((p, idx) => idx === i ? { ...p, type: newType } : p))}
       customTypes={customTypes}
       onAddCustomType={addCustomType}
     />
     ```
   - 注意：原本 type input 的 `flex: 1` 視覺位置由 TypeDropdown 內部 `flex: 1` 容器承擔，外層 row `<div style={{ display: 'flex', gap: 6 }}>` 結構不變。
3. **不**改 `ColoredPropertyTable` 元件（同檔案內、用於 Remodel light-theme block）— 維持原 plain input。
4. 已知 callsite（不需改其他地方）：
   - `<PropertyTable />` 在 GroupPanel 的「Information (Command Input)」section 與「Event Output」section 兩處被引用 — props `properties` / `onChange` 不變，因此 dropdown 自動套用。

### Step 4 — `src/components/DetailPanel/AggregatePanel.tsx`：StatePropertyTable + EventPropertyPicker

1. 在 imports 新增：
   ```ts
   import { TypeDropdown, BUILT_IN_TYPES } from '../shared/TypeDropdown';
   import { useActiveBoard } from '../../store/selectors';
   ```
2. **`StatePropertyTable` 內**：
   - Component body 頂端（`inputBase` 樣式宣告之前）取 store：
     ```ts
     const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
     const addCustomType = useBoardStore((s) => s.addCustomType);
     ```
   - 將 properties.map 內第二個 `<input>`（其上有 `placeholder="Type"`、綁定 `prop.type` 與 `field: 'type'` onChange 的那個）整個替換為 `<TypeDropdown ... />`（同 Step 3 的模式）。
3. **新增 `EventPropertyPicker` 子元件**（在同檔案內、`StatePropertyTable` 上方或下方皆可）：
   - Props：`{ aggregateNoteId, currentStateProperties, onPick }`，`onPick(attrName, type)` 由父元件實作 store dispatch 與 customType register。
   - 內部 state：`isOpen: boolean`、`containerRef: RefObject<HTMLDivElement>`。
   - 用 `useActiveBoard()` 取 board，再 `useMemo` 計算 entries：
     ```
     relatedEvents = board.notes.filter(n => n.type === 'DomainEvent' && n.entityId === aggregateNoteId)
     sorted = [...relatedEvents].sort((a, b) => (a.position.x - b.position.x) || (a.createdAt < b.createdAt ? -1 : 1))
     entries = sorted.flatMap(event => {
       const command = event.commandId ? board.notes.find(n => n.id === event.commandId) : undefined
       const inputs = (command?.information ?? []).map(p => ({
         eventId: event.id, eventLabel: event.label, commandLabel: command?.label,
         kind: 'input', attrName: p.attrName, type: p.type,
       }))
       const outputs = (event.eventProperties ?? []).map(p => ({
         eventId: event.id, eventLabel: event.label, commandLabel: command?.label,
         kind: 'output', attrName: p.attrName, type: p.type,
       }))
       return [...inputs, ...outputs]
     })
     ```
     依賴：`[board.notes, aggregateNoteId]`（**最終以 closure 分析為準**：useMemo body 只用到 board.notes 衍生與 aggregateNoteId，board.flowPaths / 其他 board 欄位無關。memo signature 用 `board.notes` reference 即可，因 immer 在 notes 變動時會換 reference）。
   - **按鈕 trigger** disabled 條件：`entries.length === 0`。disabled 時 `title="No related events yet"`、`aria-disabled="true"`。
   - **Dropdown panel**：
     - 容器 `role="listbox"`。
     - Group header 顯示 `event.label` 及 `command.label`（若有）：例如 `From userCreated / createUser`。
     - 每個 group 內分 `Input` 與 `Output` 兩 sub-section heading（小字 uppercase 樣式同既有 sectionLabelStyle）。
     - 若 group 內 inputs + outputs 皆為 0 → **整個 group 不顯示**。
     - 每個 row 是一個 entry：左欄顯示 `attrName`、右欄顯示 `: type`。
     - `role="option"`、`aria-selected={isAdded}`、`aria-disabled={isAdded}`。
     - `isAdded = currentStateProperties.some(s => s.attrName.trim() === entry.attrName.trim())`（**case-sensitive**）。
     - `isAdded` 顯示 `(added)` 灰字 + cursor `not-allowed` + `title="Already in state — edit the row above to change type"`。
     - `!isAdded` → click 觸發 `onPick(entry.attrName, entry.type)`，**不關閉 dropdown**。
   - 開關行為：
     - 點 trigger 切 isOpen。
     - `useEffect` 監聽 `mousedown`，若 `containerRef.current && !containerRef.current.contains(target)` → setIsOpen(false)。
     - 開啟時 `keydown` 監聽 `Escape` → setIsOpen(false)。
4. **State section JSX 改動**：
   - 在 AggregatePanel 的 State section（包住 `<StatePropertyTable />` 那層 `<div>`）內，把按鈕「+ Add State Field」從 `StatePropertyTable` 內部搬出來，與「+ Pick from Event ▾」並排在 `StatePropertyTable` 之下。
   - `StatePropertyTable` 內部刪除「+ Add State Field」按鈕；元件變成只負責 row 列表（props 介面 `{ properties, onChange }` 不變）。
   - AggregatePanel 在 State section 內依序 render：
     1. `<StatePropertyTable properties={...} onChange={...} />`
     2. 一個 `<div style={{ display: 'flex', gap: 6, marginTop: 6 }}>` 包兩個按鈕：
        - 既有「+ Add State Field」按鈕樣式（dashed border、`flex: 1`），onClick 呼叫 `updateStateProperties(note.id, [...(note.stateProperties ?? []), { attrName: '', type: '' }])`
        - `<EventPropertyPicker aggregateNoteId={note.id} currentStateProperties={note.stateProperties ?? []} onPick={handlePickFromEvent} />`，內部 trigger 按鈕樣式對齊「+ Add State Field」（dashed border、`flex: 1`、文字「+ Pick from Event ▾」）
   - **最終視覺**：兩個 dashed border 按鈕橫向並排、平分寬度，視覺風格一致。
5. **`onPick` 實作（在 AggregatePanel `handlePickFromEvent`）**：
   ```ts
   const handlePickFromEvent = (attrName: string, type: string) => {
     const trimmed = attrName.trim();
     // 從 boardStore.getState() 取所有 boards 內所有 notes 找這顆 aggregate 的最新 stateProperties，
     // 不依賴 closure 的 note prop（連點時 prop 尚未隨 React render 更新）。note.id 在整個專案
     // 的 boards.notes 中唯一，flatMap 一次找到不需先解析 active board。
     const latest = useBoardStore.getState().project.boards
       .flatMap((b) => b.notes)
       .find((n) => n.id === note.id);
     const current = latest?.stateProperties ?? [];
     if (current.some((p) => p.attrName.trim() === trimmed)) return; // 防呆：picker 已過濾，雙保險
     // 自動 register customType（addCustomType 已 idempotent）
     if (type && !BUILT_IN_TYPES.includes(type) && !customTypes.includes(type)) {
       addCustomType(type);
     }
     updateStateProperties(note.id, [...current, { attrName: trimmed, type }]);
   };
   ```
   - **stale closure 防護**：用 `useBoardStore.getState()` 取最新 state，`flatMap` 略過 active board 路徑（note.id 在 boards.notes 中唯一），不需 import `useUIStore`。

---

## 失敗路徑

- **picker entries 為空**：按鈕 disabled，user 點不下去（已涵蓋）。
- **picker entry click 已 added**：`isAdded` 阻擋，`onPick` 不執行；雙重檢查的 `current.some(...)` 是補保險。
- **連點同 entry**：`onPick` 第一次成功後 `currentStateProperties` 更新，再點到同 entry 時 `isAdded=true` 灰掉，無法重複加。即使 React 還沒 re-render 第二次 click 已經 dispatch，雙重檢查 `current.some` 阻擋。
- **`aggregateNote.entityId` 反向關聯不存在**：relatedEvents 為空 → 按鈕 disabled。
- **event.commandId 指向已刪除的 note**：`board.notes.find(n => n.id === event.commandId)` 回 `undefined` → group 仍 render 但只顯示 Output sub-section（沒 Input），`commandLabel` undefined。
- **type 為空字串**：addCustomType 內已過濾 `if (!trimmed) return`（boardStore.ts:625）。append 後 state row 顯示 type 為空 — 由既有 UX（user 自行修）處理。
- **shared TypeDropdown 在 AddCommandModal 與 PropertyTable 行為不一致**：因為都是同一份 source、props 完全外部注入，不會分歧。
- **persist / sync 衝突**：本 task 不改 wire schema，Property 型別已是 wire-stable 結構（attrName, type, _suggested_type, _suggested_field 既有欄位）。`updateStateProperties` 走既有 broadcast 路徑，無新風險。

---

## 不改動的部分

以下檔案 / 行為不應被本 task 修改：

- `src/store/boardStore.ts`：actions 維持原狀，沒有新增 action 也沒改既有 signature。
- `src/store/uiStore.ts`、`src/store/selectors.ts`、`src/hooks/useReconcileUIState.ts`：per-tab UI state 管理機制不動。
- `src/utils/apiSync.ts`、`mcp-server/src/index.ts`：wire-strip 與 SSE sync 機制不動。
- `src/types/board.ts`、`src/types/elements.ts`：`Property` 型別、`StickyNote` 型別不變。
- `src/components/DetailPanel/DetailPanel.tsx` 的 `ColoredPropertyTable` 元件：保留 plain input，不換 dropdown。
- `src/components/DetailPanel/DtoPanel.tsx`：dtoFields editor 不改（這次範圍不含 DtoField）。
- 其他 9 個用 `useActiveBoard()` 的 components：不影響。

### Non-goals（行為層）

- 本 task **不**包含 ColoredPropertyTable（Remodel light-theme block）的 type dropdown。
- 本 task **不**包含 DtoPanel 的 dtoFields editor 改 dropdown。
- 本 task **不**包含 picker 的 case-insensitive attrName 比對（刻意保留 case-sensitive）。
- 本 task **不**包含 picker 點已 added row 後的 type 替換功能（user 要改 type 自己改 row）。
- 本 task **不**包含 dropdown 的 keyboard arrow-key navigation（與既有 TypeDropdown 一致）。
- 本 task **不**新增任何 store action 或 wire schema 欄位。
- 本 task **不**改變 persist version、SSE broadcast scope。
- 本 task **不**包含 picker 中 type 顯示的 syntax highlight 或自訂顏色。
- 本 task **不**包含 picker 中 entries 的關鍵字搜尋輸入框（keep simple，未來再加）。

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別檢查
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..

# 2. Build
npm run build

# 3. Shared 元件存在 + export
test -f src/components/shared/TypeDropdown.tsx
grep -q 'export.*TypeDropdown' src/components/shared/TypeDropdown.tsx
grep -q 'export.*BUILT_IN_TYPES' src/components/shared/TypeDropdown.tsx

# 4. AddCommandModal 不再持有副本
! grep -n 'const TypeDropdown' src/components/Modals/AddCommandModal.tsx
! grep -nE '^const BUILT_IN_TYPES' src/components/Modals/AddCommandModal.tsx
grep -q "shared/TypeDropdown" src/components/Modals/AddCommandModal.tsx

# 5. DetailPanel 引用 shared、PropertyTable 換掉 input；ColoredPropertyTable 維持 plain input
grep -q "shared/TypeDropdown" src/components/DetailPanel/DetailPanel.tsx
awk '/^const PropertyTable: React/,/^const EditableColorBlock/' src/components/DetailPanel/DetailPanel.tsx | grep -q 'TypeDropdown'
awk '/^const ColoredPropertyTable: React/,/^\/\/ ─.* Remodel Panel/' src/components/DetailPanel/DetailPanel.tsx | grep -vq 'TypeDropdown'

# 6. AggregatePanel 加 dropdown + picker
grep -q "shared/TypeDropdown" src/components/DetailPanel/AggregatePanel.tsx
grep -q 'Pick from Event' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'No related events yet' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'addCustomType' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'useActiveBoard' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'role="listbox"' src/components/DetailPanel/AggregatePanel.tsx
grep -q 'role="option"' src/components/DetailPanel/AggregatePanel.tsx

# 7. picker stale-closure 防呆：用 getState 而非 prop
grep -q 'useBoardStore.getState()' src/components/DetailPanel/AggregatePanel.tsx

# 8. shared 元件不反向耦合 uiStore
! grep -n 'useUIStore' src/components/shared/TypeDropdown.tsx
! grep -n 'useBoardStore' src/components/shared/TypeDropdown.tsx
```

### Human 補做（需要人類介入）

- [ ] 開 DetailPanel 一個 Aggregate note，State section 的 type 欄位是深色 dropdown（不是 plain input），點開可以選 BUILT_IN_TYPES 與 customTypes，可以「+ Add Type...」inline 新增
- [ ] 同樣的 dropdown 體驗在「Add Command」modal 裡的 Information 列、以及 DetailPanel 的 DomainEvent eventProperties 與 Command information 區段都看得到（一致風格）
- [ ] Remodel block 內的 Parameters / Return Type fields 維持 **plain input**（沒被誤改）— 這是刻意保留
- [ ] 一個 Aggregate 連結到一個或多個 DomainEvent（透過 `entityId`）：`+ Pick from Event ▾` 按鈕可點，下拉列出所有相關 event 的 Input + Output 欄位，按 event 分組
- [ ] 點一個 entry → 該欄位 append 到 State 列表（attrName + type 都帶過來），dropdown **保持開啟**
- [ ] 連點多個 entry：每個都成功 append，dropdown 仍開
- [ ] 已加過的 entry 顯示 `(added)`、cursor not-allowed、滑過顯示 tooltip `Already in state — edit the row above to change type`，再點不會重複加
- [ ] 同 attrName 跨 event 不同 type（例如 createUser 的 `id: String` 與 userCreated 的 `id: UUID`）— state 加了一個之後，所有同 attrName 的 row 都灰掉
- [ ] picker 中出現非 BUILT_IN_TYPES 也非 customTypes 的 type 時，pick 後 `project.customTypes` 自動加入該 type，重開 TypeDropdown 看得到
- [ ] click outside（畫布、其他面板區）→ picker 關閉
- [ ] Esc → picker 關閉
- [ ] 沒有任何 event `entityId` 指向此 Aggregate 時，按鈕 disabled、tooltip `No related events yet`
- [ ] 螢幕閱讀器（VoiceOver）能讀到 `listbox` 容器與 `option` row 的 `aria-selected` / `aria-disabled` 狀態
- [ ] DevTools console 全程 clean，無 warning / `Cannot read properties of undefined`
- [ ] 跨 tab 同步：Tab A 加一個 state field，Tab B 看到（沿用既有 SSE）；Tab B 切到別的 context Tab A **不**受影響（per v16 task 已拍板的 per-tab 獨立性）

---

## 已知限制

- **不改 ColoredPropertyTable**：Remodel light-theme block 的 type 欄位仍是 plain input。如果未來 user 反映需要一致，再開 follow-up task（需處理深 / 淺色 dropdown 風格切換，可能需加 `theme` prop 到 TypeDropdown）。
- **picker 沒搜尋框**：相關 event 多時（>10）下拉很長。short-term 可用瀏覽器 Ctrl-F；long-term follow-up 可加 inline search input。
- **ARIA `role="listbox"` 嚴格意義要求**：listbox 的 `aria-activedescendant` 與 keyboard nav 沒做（與既有 TypeDropdown 一致）。對螢幕閱讀器使用者體驗為「可讀但不能 keyboard 巡覽」，符合既有 Cosmogony 的 a11y baseline。
- **picker 可能在 disabled trigger 上的 tooltip 不在所有瀏覽器一致**：`title=` 在 disabled `<button>` 的顯示在 Safari 與 Chrome 行為略有差異。可接受。
- **依賴關係**：無前置 task。`useActiveBoard` selector（`src/store/selectors.ts`）與 v16 uiStore migration 已在 commit `8a70bc9` 上線，本 task 直接使用。
- **跟其他 tasks 並行性**：與 Phase 1（per-entity `_rev` versioning）正交、不阻塞。
