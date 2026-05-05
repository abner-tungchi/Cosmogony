# ReturnTypeField / DtoField 的 type + dtoSpecRef 合併為單一 picker

## 來源

討論：`docs/discussions/2026-05-05-merge-type-and-dto-ref-into-unified-picker.md`（Round 1 + Round 2，三方 agreed）

## 目標

`ReturnTypeField` 與 `DtoField` 兩個型別在 schema 上各有 `type: string` 與 `dtoSpecRef?: string` 雙欄，UI 上分裂成兩個 picker（Type 欄 + Ref 欄）。User 引用 DTO 必須兩邊各填一次，且容易出現「type 字串與 dtoSpecRef 指向 DTO 不同」的不一致。本 task 把這兩個 picker 合併為單一 `TypeOrDtoPicker`，列出 BUILT_IN_TYPES、project.customTypes 與 active board 上的 DTO notes 三個分組；pick DTO 時 picker 兩欄同寫、pick 非 DTO 時清掉 `dtoSpecRef`。Wire schema **不動**（雙欄保留），無 migration（user 確認線上無 Remodel returnType 資料）。

---

## 介面合約（Interface Contract）

### 1. 新檔 `src/components/shared/TypeOrDtoPicker.tsx`

```ts
import type { StickyNote } from '../../types/elements';

/**
 * Tagged-union 描述 picker 的選擇結果，給 consumer 寫入 type + dtoSpecRef
 * 兩個欄位用。kind === 'dto' 才會帶 dtoNoteId。
 */
export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string }
  | { kind: 'custom'; type: string }
  | { kind: 'dto'; dtoNoteId: string; type: string };  // type = DTO label 第一行

export interface TypeOrDtoPickerProps {
  /** 目前欄位的 type 字串（fallback 顯示） */
  value: string;
  /** 目前欄位的 dtoSpecRef；若已設且能解析，trigger 顯示 DTO 名取代 value */
  dtoSpecRef?: string;
  /** Active board 上所有 DTO StickyNote（type === 'Dto'），由 consumer 過濾後傳入 */
  allDtoNotes: StickyNote[];
  /** project.customTypes，由 consumer 從 store 取出傳入 */
  customTypes: string[];
  /** 新增 customType 時呼叫，consumer 連到 useBoardStore.addCustomType */
  onAddCustomType: (typeName: string) => void;
  /** Pick 結果以 entry 形式傳出，consumer 自行寫入 { type, dtoSpecRef } 兩欄 */
  onPick: (entry: TypeOrDtoEntry) => void;
  /** 排除自身 DTO note id（DtoFieldsEditor 用，避免 nested DTO 自我引用） */
  excludeDtoId?: string;
  /** dark = DetailPanel sidebar；light = Remodel light-theme block */
  theme?: 'dark' | 'light';
}

export const TypeOrDtoPicker: React.FC<TypeOrDtoPickerProps>;
```

**外部可觀察行為**：

- **Trigger 顯示優先順序**：
  1. `dtoSpecRef` 已設 → 嘗試在 `allDtoNotes` 找 `n.id === dtoSpecRef`；找到 → 顯示該 DTO label 第一行（`label.split('\n')[0].trim()`）；找不到 → 顯示 `"<value> (deleted)"` 紅色字。
  2. `dtoSpecRef` 未設 → 顯示 `value`；若 `value` 為空字串，顯示 placeholder `"Select type..."`。

- **Dropdown 三段順序**（從上到下）：
  1. **DTOs on this board**：若 `allDtoNotes.filter(n => n.id !== excludeDtoId).length > 0` 才出現；每筆 row 帶 `📄` icon 與 DTO label 第一行。
  2. **Custom Types**：若 `customTypes.length > 0` 才出現。
  3. **Built-in**：固定顯示 `BUILT_IN_TYPES`（沿用既有共用的 BUILT_IN_TYPES 常數）。
  4. 末尾分隔線後：「+ Add Custom Type...」inline 輸入；user 按 Enter 觸發 `onAddCustomType(trimmed)` 後立即觸發 `onPick({ kind: 'custom', type: trimmed })` 把該 type 寫入。

- **每段內 search filter**：dropdown 頂端有 `<input>` 欄，user 鍵入後三段同時 case-insensitive substring 過濾；若某段過濾後為 0 筆則隱藏該段 header。空查詢時行為等同無 filter。

- **`onPick` 行為合約**：
  - 點 DTO row → `onPick({ kind: 'dto', dtoNoteId: <selected DTO note id>, type: <DTO label 第一行 trim> })`。
  - 點 Custom row → `onPick({ kind: 'custom', type })`。
  - 點 Built-in row → `onPick({ kind: 'builtin', type })`。
  - 點完一律關閉 dropdown 並清空 search query。

- **Dropdown 開關**：
  - Click trigger → 切換 open。
  - Click outside container → 關閉。
  - 開啟時按 Esc → 關閉（含搜尋 input focus 中也要 catch Esc）。
  - **不**做 arrow-key navigation（與既有 TypeDropdown 一致）。

- **Theme**：`theme === 'light'` 時 trigger 與 dropdown panel 採用淺色配色（參照既有 `DtoPicker` 的 light theme 配色：白底、深字、`rgba(0,0,0,*)` 邊框）；`theme === 'dark'`（預設）採用既有 TypeDropdown 的深色配色（`#1e293b` 底、`#334155` 邊框、`rgba(255,255,255,*)` 文字）。

**所有權明示**：

- TypeOrDtoPicker 純 controlled，**不**直接呼叫 `useBoardStore` / `useUIStore`。所有依賴（customTypes、allDtoNotes、onAddCustomType）由 consumer 注入。
- `onPick` 的 entry 由 consumer 翻譯成 `{ type, dtoSpecRef }` 兩欄寫入（dispatch update action）。
- `value` 與 `dtoSpecRef` 來自 consumer prop，**不**在 picker 內 derive。

### 2. `dtoDerived` invariant（formalize，本 task 不改實作但需在 spec 列出）

對任意 `DtoField` 或 `ReturnTypeField`：

> **顯示型別與 codegen 型別來源**：`dtoSpecRef` 已設且能在 `allNotes` 找到對應 DTO note → 用該 DTO 的顯示名（label 第一行 trim）；否則（未設或 stale）用 raw `type` 字串，stale 時顯示 `"<type> (?)"` 標記。

既有實作位置：`src/utils/dtoDerived.ts` 內的 `resolveFieldType`。本 task 不改該函式行為。新 picker 的 trigger 顯示與此 invariant **一致**。

### 3. ReturnTypeField / DtoField schema 不變

```ts
// src/types/specs.ts — 完全不動
export interface DtoField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;
}

export interface ReturnTypeField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;
}
```

`mcp-server/src/index.ts` 的 BE-local DtoField / ReturnTypeField type、`es_update_dto_fields` / `es_update_remodel_return_type` MCP tools 的 input schema 一律 **不動**。

### 4. Remodel.linkedDtoIds 行為不變

`Remodel.linkedDtoIds` 是 Remodel 卡片層級的「文件視角」DTO chip 列表（`src/types/elements.ts` 的 `Remodel.linkedDtoIds: string[]`），由 user 透過 RemodelPanel 內的 chip UI 手動策展。本 task **不**自動同步 picker 選的 DTO 到此列表。

### 5. 既有 `DtoPicker` 元件刪除

`src/components/DetailPanel/DtoPicker.tsx` 的唯二 caller 是 `ReturnTypeEditor.tsx` 與 `DtoFieldsEditor.tsx`，兩個都改用 `TypeOrDtoPicker` 後，DtoPicker **整檔刪除**。

---

## 改動檔案

| 檔案路徑 | 動作 | 改動描述 |
|---|---|---|
| `src/components/shared/TypeOrDtoPicker.tsx` | NEW | 綜合 picker 元件（dark + light theme、三段分組、search、+ Add Custom Type inline） |
| `src/components/DetailPanel/ReturnTypeEditor.tsx` | UPDATE | 刪 Ref column 與 DtoPicker 引用；Type column 換 TypeOrDtoPicker（`theme="light"`）；header 變成 4 欄（Name / Type / Null / delete-spacer） |
| `src/components/DetailPanel/DtoFieldsEditor.tsx` | UPDATE | 刪 Ref column 與 DtoPicker 引用；Type column 從 TypeDropdown 換為 TypeOrDtoPicker；新元件帶 `excludeDtoId={selfId}`；header 同上 |
| `src/components/DetailPanel/DtoPicker.tsx` | DELETE | 已無 caller |

未改動（明示）：

- `src/types/specs.ts`、`src/types/elements.ts`：`DtoField` / `ReturnTypeField` / `Remodel.linkedDtoIds` schema 完全不動。
- `src/store/boardStore.ts`：actions（`updateDtoFields` / `updateRemodelReturnType` / `addCustomType`）簽名與行為不變。
- `src/utils/dtoDerived.ts`、`src/utils/markdownExporter.ts`、`src/utils/jsonExporter.ts`：display / export 邏輯不變。
- `src/components/shared/TypeDropdown.tsx`：保留，其他 consumer（AddCommandModal、PropertyTable in DetailPanel、StatePropertyTable in AggregatePanel）繼續用。
- `mcp-server/src/index.ts`：BE Project type、MCP tools input schema、wire payload 完全不動。
- `src/components/DetailPanel/DetailPanel.tsx`：RemodelPanel 內 linkedDtoIds chip UI 不動。
- 其他 9 個 `useActiveBoard()` consumer、apiSync、uiStore、persist version：不動。

---

## 實作步驟

### Step 1 — 新增 `src/components/shared/TypeOrDtoPicker.tsx`

1. 建立檔案，引入既有 shared 常數：
   ```ts
   import { BUILT_IN_TYPES } from './TypeDropdown';
   ```
   **理由**：避免兩份 BUILT_IN_TYPES 定義漂移；`TypeDropdown` 已 export 此常數（先前 task 已驗證）。

2. 元件內部 state：
   - `isOpen: boolean`
   - `query: string`（搜尋輸入）
   - `isAddingNew: boolean`、`newTypeName: string`（沿用 TypeDropdown 的「+ Add Custom Type...」inline 模式）
   - `containerRef: RefObject<HTMLDivElement>`（用於 click outside 偵測）
   - `searchInputRef: RefObject<HTMLInputElement>`（dropdown 開啟時 autofocus 搜尋框）
   - `newTypeInputRef: RefObject<HTMLInputElement>`（isAddingNew 時 autofocus）

3. `useEffect` 監聽 `mousedown` 做 click outside 關閉：
   ```ts
   useEffect(() => {
     if (!isOpen) return;
     const handleClickOutside = (e: MouseEvent) => {
       if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
         setIsOpen(false);
         setIsAddingNew(false);
         setNewTypeName('');
         setQuery('');
       }
     };
     document.addEventListener('mousedown', handleClickOutside);
     return () => document.removeEventListener('mousedown', handleClickOutside);
   }, [isOpen]);
   ```

4. `useEffect` 監聽 `keydown` 做 Esc 關閉（覆蓋搜尋框 focus 中也能 catch）：
   ```ts
   useEffect(() => {
     if (!isOpen) return;
     const handleKey = (e: KeyboardEvent) => {
       if (e.key === 'Escape') {
         setIsOpen(false);
         setIsAddingNew(false);
         setNewTypeName('');
         setQuery('');
       }
     };
     document.addEventListener('keydown', handleKey);
     return () => document.removeEventListener('keydown', handleKey);
   }, [isOpen]);
   ```

5. **Trigger 顯示計算**：
   ```ts
   const dtoTarget = dtoSpecRef
     ? allDtoNotes.find((n) => n.id === dtoSpecRef && n.type === 'Dto')
     : undefined;
   const isStaleRef = dtoSpecRef !== undefined && !dtoTarget;
   const triggerLabel = (() => {
     if (dtoTarget) {
       const first = (dtoTarget.label.split('\n')[0] ?? '').trim();
       return first || '(Unnamed DTO)';
     }
     if (isStaleRef) return value ? `${value} (deleted)` : '(deleted DTO)';
     return value || 'Select type...';
   })();
   ```
   stale 時 trigger 文字顏色用紅色（dark `#ef4444` / light 同色）。

6. **Filtered groups 計算**（useMemo 依賴 `[allDtoNotes, customTypes, query, excludeDtoId]`，**最終以 closure 分析為準**）：
   ```ts
   const q = query.trim().toLowerCase();
   const matches = (s: string) => !q || s.toLowerCase().includes(q);
   const dtoEntries = allDtoNotes
     .filter((n) => n.id !== excludeDtoId)
     .map((n) => ({ note: n, name: (n.label.split('\n')[0] ?? '').trim() || '(Unnamed DTO)' }))
     .filter((e) => matches(e.name));
   const customEntries = customTypes.filter(matches);
   const builtinEntries = BUILT_IN_TYPES.filter(matches);
   ```

7. **Dropdown render** 分三段，每段加 group header（fontSize 9, uppercase, muted color）：
   - `dtoEntries.length > 0` → render `📄` icon + DTO name
   - `customEntries.length > 0` → render type 字串
   - `builtinEntries.length > 0` → render type 字串
   - 三段都空且非 isAddingNew → 顯示 "(no matches)"
   - 永遠在最底端 render「+ Add Custom Type...」inline 區塊（沿用 TypeDropdown 的 isAddingNew 模式）

8. **Click handler**：
   ```ts
   const pickDto = (note: StickyNote) => {
     const name = (note.label.split('\n')[0] ?? '').trim() || '(Unnamed DTO)';
     onPick({ kind: 'dto', dtoNoteId: note.id, type: name });
     close();
   };
   const pickCustom = (type: string) => { onPick({ kind: 'custom', type }); close(); };
   const pickBuiltin = (type: string) => { onPick({ kind: 'builtin', type }); close(); };
   const close = () => {
     setIsOpen(false);
     setIsAddingNew(false);
     setNewTypeName('');
     setQuery('');
   };
   const handleAddTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
     e.stopPropagation();
     if (e.key === 'Enter') {
       const trimmed = newTypeName.trim();
       if (trimmed) {
         onAddCustomType(trimmed);
         onPick({ kind: 'custom', type: trimmed });
         close();
       }
     } else if (e.key === 'Escape') {
       setIsAddingNew(false);
       setNewTypeName('');
     }
   };
   ```

9. **Theme palette**：
   ```ts
   const isDark = theme !== 'light';
   const triggerBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
   const triggerBorder = isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)';
   const triggerColor = isStaleRef ? '#ef4444' : (isDark ? 'rgba(255,255,255,0.9)' : '#1e293b');
   const dropdownBg = isDark ? '#1e293b' : '#ffffff';
   const dropdownBorder = isDark ? '1px solid #334155' : '1px solid rgba(0,0,0,0.15)';
   const optionColor = isDark ? 'rgba(255,255,255,0.6)' : '#1e293b';
   const headerColor = isDark ? 'rgba(255,255,255,0.4)' : '#475569';
   const hoverBg = isDark ? '#334155' : 'rgba(0,0,0,0.05)';
   const separatorColor = isDark ? '#334155' : 'rgba(0,0,0,0.1)';
   ```

10. **Search input** render 在 dropdown 頂部，autoFocus 開啟時。Input 樣式：
    ```ts
    width: 100%, background depending on theme (slight contrast),
    fontSize: 11, padding: '4px 8px', borderRadius: 4
    ```

11. **不引入 store**：grep gate 會驗證 `! grep -n 'useBoardStore' ... TypeOrDtoPicker.tsx`。

12. Export：`TypeOrDtoPicker`（named）、`TypeOrDtoEntry`（type，named）、`TypeOrDtoPickerProps`（named）。

### Step 2 — `src/components/DetailPanel/ReturnTypeEditor.tsx`

1. Imports：刪 `import { DtoPicker } from './DtoPicker';`；新增 `import { TypeOrDtoPicker } from '../shared/TypeOrDtoPicker';`、`import { useBoardStore } from '../../store/boardStore';`。

2. 元件 body 頂端加 store hooks：
   ```ts
   const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
   const addCustomType = useBoardStore((s) => s.addCustomType);
   ```
   **注意**：ReturnTypeEditor 既有 `inputBase` 已含 `minWidth: 0`（先前 task 修過），row 的 `<input>` for `name` 仍維持 plain input。

3. **Row 改寫**：把現有 row 的 5-column layout（Name / Type / Null / Ref / delete）改成 4-column（Name / Type / Null / delete）：
   - 刪除 `<input ...placeholder="String"... />` Type plain input 整段。
   - 刪除 `<div style={{ width: 70 }}><DtoPicker ... /></div>` Ref 整段。
   - 在 Type 位置換成 `<div style={{ flex: 2, minWidth: 0 }}><TypeOrDtoPicker ... /></div>`。
   - Null checkbox 維持 width 24。
   - delete button 維持 width 18。

4. **Header 改寫**：對應 row layout 改成 4 欄：
   ```tsx
   <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
     <div style={{ flex: 2, ...headerStyle }}>Name</div>
     <div style={{ flex: 2, ...headerStyle }}>Type</div>
     <div style={{ width: 24, ...headerStyle, textAlign: 'center' }}>Null</div>
     <div style={{ width: 18 }} />
   </div>
   ```
   **不再出現** `<div style={{ width: 70, ...headerStyle }}>Ref</div>`。

5. **`onPick` 翻譯**（在 row 的 TypeOrDtoPicker 內）：
   ```tsx
   <TypeOrDtoPicker
     value={f.type}
     dtoSpecRef={f.dtoSpecRef}
     allDtoNotes={allDtoNotes}
     customTypes={customTypes}
     onAddCustomType={addCustomType}
     theme="light"
     onPick={(entry) => {
       if (entry.kind === 'dto') {
         updateField(i, { type: entry.type, dtoSpecRef: entry.dtoNoteId });
       } else {
         updateField(i, { type: entry.type, dtoSpecRef: undefined });
       }
     }}
   />
   ```
   **注意**：`updateField` 走既有 `Partial<ReturnTypeField>` 路徑。`dtoSpecRef: undefined` 在 immer / 普通 spread 都會把欄位設為 `undefined`（語意上等同清掉）。

6. **不傳 `excludeDtoId`**：Remodel 不會 nested DTO 引用自己。

7. Primitive shape 段（`shape === 'primitive'`）的 type input **保留** plain input（既有行為），不改 — Primitive 模式下沒有「ref to DTO」的語意，沿用最簡單 UX。

### Step 3 — `src/components/DetailPanel/DtoFieldsEditor.tsx`

1. Imports：刪 `import { DtoPicker } from './DtoPicker';` 與 `import { TypeDropdown } from '../shared/TypeDropdown';`；新增 `import { TypeOrDtoPicker } from '../shared/TypeOrDtoPicker';`。
   `useBoardStore` 與 `customTypes / addCustomType` 既有變數**保留**（picker 仍要這些 prop）。

2. **Row 改寫**：
   - 刪除既有 TypeDropdown 整段（在 type column）。
   - 刪除既有 DtoPicker 整段（在 ref column）。
   - 在 Type 位置（既有 `<div style={{ flex: 2, minWidth: 0 }}>` 容器）換成 TypeOrDtoPicker：
     ```tsx
     <div style={{ flex: 2, minWidth: 0 }}>
       <TypeOrDtoPicker
         value={f.type}
         dtoSpecRef={f.dtoSpecRef}
         allDtoNotes={allDtoNotes}
         customTypes={customTypes}
         onAddCustomType={addCustomType}
         excludeDtoId={selfId}
         theme="dark"
         onPick={(entry) => {
           if (entry.kind === 'dto') {
             updateField(i, { type: entry.type, dtoSpecRef: entry.dtoNoteId });
           } else {
             updateField(i, { type: entry.type, dtoSpecRef: undefined });
           }
         }}
       />
     </div>
     ```

3. **Header 改寫**（4 欄）：
   ```tsx
   <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
     <div style={{ flex: 2, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</div>
     <div style={{ flex: 2, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
     <div style={{ width: 24, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Null</div>
     <div style={{ width: 18 }} />
   </div>
   ```
   不再出現 `>Ref<`。

4. `excludeDtoId={selfId}` 必傳：避免 DTO 內部欄位選自己造成循環。

### Step 4 — 刪除 `src/components/DetailPanel/DtoPicker.tsx`

1. 確認 grep 全 src/ 無剩餘 import：
   ```bash
   grep -rn 'DtoPicker' src/
   ```
   應該只剩 `DtoPicker.tsx` 自己。

2. 刪除檔案：`rm src/components/DetailPanel/DtoPicker.tsx`。

3. 重新 grep 應該完全 0 命中。

---

## 失敗路徑

- **picker 開啟時 `allDtoNotes` 為空**：DTO group 不顯示；user 仍可選 Custom / Built-in / Add Custom Type；無錯誤狀態。
- **picker 開啟時 `customTypes` 為空**：Custom group 不顯示；其他段照常。
- **search query 過濾後三段全空**：dropdown 顯示 "(no matches)"；user 可清空 query 或新增 custom type。
- **`dtoSpecRef` 指向已刪除的 DTO**：trigger 顯示 `"<value> (deleted)"` 紅字；user 點開 picker 可重選或選 Custom/Built-in 把 ref 清掉。**不**主動清 ref（避免靜默資料損失，與既有 dtoDerived 行為一致）。
- **跨 board DTO ref**：`allDtoNotes` 來自 active board，跨 board ref 自動視為 stale；行為同上。
- **連點 picker 後 prop 還沒同步**：picker 是受控元件，trigger 顯示永遠來自最新 prop（React render cycle 保證）；不需要 stale closure 防護（與 EventPropertyPicker 不同，picker 內部不存 entries 副本）。
- **「+ Add Custom Type」內 Enter 觸發 race**：`onAddCustomType(trimmed)` 與 `onPick({ kind: 'custom', type: trimmed })` 順序確定（先 add 後 pick）；若 consumer 的 `addCustomType` action 是 sync（既有 zustand action 是 sync），picker 後續 render 的 customTypes 已包含此 type。若 consumer 是 async（**不會發生**，但防呆），picker 仍 pick 正確 trimmed 字串，後續 customTypes 加入也不影響。
- **schema 不一致老資料（type="A" + dtoSpecRef→B）**：picker trigger 走 `dtoSpecRef` 優先邏輯，顯示 B 的 DTO 名（既有 dtoDerived invariant）。User 重選會自動修。
- **DtoPicker 刪除後仍有 import**：build 時 tsc 會報 `Cannot find module`；驗收 grep 強制 0 命中。

---

## 不改動的部分

- `src/types/specs.ts`：`DtoField` / `ReturnTypeField` schema 不動。
- `src/types/elements.ts`：`Remodel.linkedDtoIds`、`StickyNote.dtoFields` 不動。
- `src/store/boardStore.ts`：`updateDtoFields` / `updateRemodelReturnType` / `addCustomType` actions 不動。
- `src/utils/dtoDerived.ts`：`resolveFieldType` invariant 與行為不動。
- `src/utils/markdownExporter.ts`、`src/utils/jsonExporter.ts`：export 邏輯不動。
- `src/components/shared/TypeDropdown.tsx`：保留供 AddCommandModal、DetailPanel `PropertyTable`、AggregatePanel `StatePropertyTable` 使用。
- `src/components/DetailPanel/DetailPanel.tsx` 內 RemodelPanel 的 `linkedDtoIds` chip 列表 UI：不動。
- `mcp-server/src/index.ts`：BE Project type、`DtoField` / `ReturnTypeField` 宣告、MCP tools input schema、wire payload 一律不動。
- FE persist version、uiStore、apiSync wire-strip：不動。

### Non-goals（行為層）

- 本 task **不**做 schema migration、不 bump persist version、不 normalize 老資料。
- 本 task **不**做 `Remodel.linkedDtoIds` 自動 sync（picker 選 DTO 不會寫進 chip 列表）。未來若要自動 sync 是 follow-up。
- 本 task **不**改 `Property` 結構（Aggregate stateProperties / Command information / DomainEvent eventProperties），仍只有 `type` 字串無 `dtoSpecRef`，其 Type 欄繼續用既有 TypeDropdown。
- 本 task **不**改 BE Project 型別、MCP tools input schema、wire payload shape。
- 本 task **不**做 keyboard arrow-key navigation（picker 只支援 click + Esc + click outside）。
- 本 task **不**支援跨 board DTO ref（`allDtoNotes` 來源仍是 active board）。
- 本 task **不**改 ReturnTypeEditor 的 primitive shape（`shape === 'primitive'`）的 type input — 維持 plain input。
- 本 task **不**改畫布上 DTO note / Remodel 卡片的視覺呈現（dtoDerived 顯示邏輯不變）。

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別 / build
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..
npm run build

# 2. 新檔存在 + export
test -f src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export const TypeOrDtoPicker' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export type TypeOrDtoEntry' src/components/shared/TypeOrDtoPicker.tsx

# 3. DtoPicker 完全消失（檔 + 所有 import）
! test -f src/components/DetailPanel/DtoPicker.tsx
! grep -rn 'DtoPicker' src/

# 4. Consumer 引用 shared（且不再 import 舊 picker）
grep -q "shared/TypeOrDtoPicker" src/components/DetailPanel/ReturnTypeEditor.tsx
grep -q "shared/TypeOrDtoPicker" src/components/DetailPanel/DtoFieldsEditor.tsx

# 5. ReturnTypeEditor 不再 import 舊 DtoPicker；DtoFieldsEditor 不再 import TypeDropdown
! grep -n "from './DtoPicker'" src/components/DetailPanel/ReturnTypeEditor.tsx
! grep -n "from './DtoPicker'" src/components/DetailPanel/DtoFieldsEditor.tsx
! grep -n "shared/TypeDropdown" src/components/DetailPanel/DtoFieldsEditor.tsx

# 6. Header 不再出現 "Ref" 欄位（限定元件 body）
awk '/^export const ReturnTypeEditor/,/^\};$/' src/components/DetailPanel/ReturnTypeEditor.tsx | grep -vq '>Ref<'
awk '/^export const DtoFieldsEditor/,/^\};$/' src/components/DetailPanel/DtoFieldsEditor.tsx | grep -vq '>Ref<'

# 7. Shared 元件不反向耦合 store（cross-store 防呆）
! grep -n 'useBoardStore' src/components/shared/TypeOrDtoPicker.tsx
! grep -n 'useUIStore' src/components/shared/TypeOrDtoPicker.tsx

# 8. Picker 支援 light theme（驗 light theme code path 存在）
grep -q "theme.*'light'" src/components/shared/TypeOrDtoPicker.tsx
grep -q 'theme="light"' src/components/DetailPanel/ReturnTypeEditor.tsx

# 9. Picker 內含三段 group header 字樣（語意鎖）
grep -q 'DTOs on this board' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'Custom Types' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'Built-in' src/components/shared/TypeOrDtoPicker.tsx

# 10. 共用 BUILT_IN_TYPES（避免重複常數）
grep -q "from './TypeDropdown'" src/components/shared/TypeOrDtoPicker.tsx

# 11. excludeDtoId 在 DtoFieldsEditor 必傳
grep -q 'excludeDtoId={selfId}' src/components/DetailPanel/DtoFieldsEditor.tsx
```

### Human 補做（需要人類介入）

- [ ] 開 Remodel block，Return Type shape 切到 `array` 或 `object`；fields 列的 Type 欄是新的合併 dropdown（trigger 標準淺色 light theme，與卡片背景協調）
- [ ] dropdown 開啟看到三段：DTOs on this board / Custom Types / Built-in，順序正確；DTO 段每筆有 `📄` icon
- [ ] 點某個 DTO row → field 的 type 字串自動填成 DTO 顯示名（label 第一行）；trigger 顯示 DTO 名；canvas 上 Remodel return type 區塊顯示也跟著更新
- [ ] 點某個 Built-in（如 String）→ field type 變 String，dtoSpecRef 自動清掉；canvas 顯示 String
- [ ] Return Type 不再有 Ref 欄位（header 也少一欄）
- [ ] 開 DTO note，Fields 列同樣有合併 dropdown（dark theme）；點該 DTO 自己的名字應該不在 picker 列表（excludeDtoId 生效）
- [ ] dropdown 頂端有 search 框，輸入 "Order" 三段同時 filter，清空 query 三段恢復
- [ ] 點「+ Add Custom Type...」inline 輸入新 type 名 + Enter，type 加進 customTypes 並寫入該 field
- [ ] 既有 dtoSpecRef 指向被刪 DTO 的 field：trigger 顯示 `"<type> (deleted)"` 紅字；點開 picker 可重選正常 DTO 或選 Built-in 清 ref
- [ ] AddCommandModal、DetailPanel 內 Command information / DomainEvent Event Output、AggregatePanel 內 State 的 Type 欄繼續用舊版 TypeDropdown（沒被波及）
- [ ] Remodel 內 Linked DTOs chip 區（RemodelPanel 下方）行為不變：picker 選 DTO **不**會自動把該 DTO 加進 chip 列表
- [ ] Click outside picker / Esc 都能關閉；trigger 重新點開狀態回到初始
- [ ] DevTools console 全程無 warning / `Cannot find module DtoPicker` 等錯誤
- [ ] 跨 tab 同步行為不變：Tab A 改 field type 經 SSE broadcast Tab B 看到；per-tab 獨立性（v16）維持

---

## 已知限制

- **無自動 linkedDtoIds sync**：picker 在 ReturnType 用 DTO 不會寫進 `Remodel.linkedDtoIds`。若 user 在 returnType 大量引用 DTO 卻沒手動加進 chip 列表，markdown export 與 jsonExport 對 linked DTOs 的描述會不完整。Future follow-up：RemodelPanel 加「Sync from fields」按鈕（一行 collect returnType.fields[].dtoSpecRef 並 set diff into linkedDtoIds）。
- **schema 雙欄冗餘**：`type` + `dtoSpecRef` 仍是兩個欄位，picker 同寫，理論上不一致仍可能（透過 BE / MCP tools 直接 patch 而繞過 picker）。寄望 dtoDerived invariant（dtoSpecRef 優先）做最終一致性兜底。
- **跨 board DTO ref 不支援**：picker 列表只有 active board 的 DTO；舊資料若有跨 board ref 視為 stale。
- **同名 DTO + customType**：picker 同時顯示兩筆（DTO group + Custom Types group），user 看名字無法區分；hover tooltip 區分（DTO 段加「📄 DTO ref」、Custom 段加「Plain type string」）— 此細節在元件內部實作。
- **無 keyboard arrow-key navigation**：與既有 TypeDropdown / DtoPicker 一致，本 task 維持。a11y baseline 同 Cosmogony 既定水準。
- **依賴關係**：無前置 task；依賴的 shared/TypeDropdown（含 BUILT_IN_TYPES export）已在 commit `5030476` 上線。
- **與 Phase 1 / 其他正在進行的 task 正交**，不阻塞。
