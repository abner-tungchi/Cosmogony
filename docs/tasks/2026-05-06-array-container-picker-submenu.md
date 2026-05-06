# TypeOrDtoPicker 加入容器型別子選單(Array / Set / List)

## 來源

討論:`docs/discussions/2026-05-06-array-container-picker-submenu.md`(Round 1 三方 agreed)

## 目標

`TypeOrDtoPicker`(2026-05-05 完成)目前只支援單一型別,無法表示 `Array<OrderDto>` 之類容器包裝。User 偏好「字串約定」方案 — schema 不動,type 字串直接含 `Array[OrderDto]` 格式。本 task 為 picker 每個 entry 加 `▸` icon 與側邊 sub-menu(列出 plain / Array / Set / List 變體);改寫 `dtoDerived.resolveFieldType` 識別 wrapper 並套用 dtoSpecRef invariant;4 個 consumer 用新增的 `wrapType` helper 寫入 type。線上既有資料無 returnType / Property dtoSpecRef 含 wrapper 紀錄,zero migration。

---

## 介面合約(Interface Contract)

### 1. `src/components/shared/TypeOrDtoPicker.tsx` 新增 export

```ts
export type ContainerWrapper = 'Array' | 'Set' | 'List';

export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'custom'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'dto'; dtoNoteId: string; type: string; wrapper?: ContainerWrapper };

/**
 * Wrap a base type with a container. Returns plain base when wrapper is
 * undefined. The format `Wrapper[Base]` is the canonical wire / display
 * representation. Nesting is NOT supported (e.g. Array[Set[X]] is undefined
 * behavior; the picker UI cannot produce nested wrappers).
 */
export function wrapType(base: string, wrapper?: ContainerWrapper): string;
```

**所有權明示**:
- TypeOrDtoEntry 的 `type` 一律是 **base type**(無 wrapper);wrapper 是分離欄位。consumer 用 `wrapType(entry.type, entry.wrapper)` 翻譯成最終 wire 格式寫入 `field.type`。
- `dtoSpecRef`(在 dto entry 中由 `dtoNoteId` 決定)永遠指向 base DTO,wrapper 不影響 ref。

**Framework 備註**:無。

### 2. Sub-menu 行為合約

- 每個 entry row 右側顯示 `▸` icon(plain pick 仍可點 row 主體)
- Hover row 250ms 後 OR 點擊 `▸` icon → 在 row 左側展開 sub-menu(因 dropdown 已 right-anchored,sub-menu 只能往左)
- Sub-menu 內容(固定 4 列):
  ```
  <type>           ← 等同 row 主點擊,wrapper=undefined
  Array[<type>]
  Set[<type>]
  List[<type>]
  ```
- 點任一列 → `onPick({ kind, type, wrapper, ... })`,**子選單與主 dropdown 都關閉**
- 開啟 sub-menu 時其他 entry 的 sub-menu 全收起(同時間最多一個 sub-menu)
- Esc:**只**收 sub-menu(不收主 dropdown);若 sub-menu 已收,Esc 才關主 dropdown
- Click outside picker container:全部關閉(沿用既有 click outside)
- z-index:sub-menu 與主 dropdown 同層(同 zIndex 50);sub-menu 寬 ≤ 200px

### 3. dtoDerived invariant(formalize,本 task 改寫)

> 對任意 `DtoField` / `ReturnTypeField` / `Property`,顯示型別決定如下:
> 1. 解析 `field.type` 是否符合 `^(Array|Set|List)\[(.+)\]$`,取出 `wrapper` 與 `inner`(無匹配時 `wrapper=undefined`、`inner=field.type`)
> 2. **若 `field.dtoSpecRef` 已設且 resolves 到 `n.type === 'Dto'` 的 note**:`innerDisplay = note.label.split('\n')[0].trim() || '(Unnamed DTO)'`
> 3. **若 `field.dtoSpecRef` 已設但 stale**:`innerDisplay = inner ? \`${inner} (?)\` : '(missing DTO)'`
> 4. **若 `field.dtoSpecRef` 未設**:`innerDisplay = inner.trim() || '?'`
> 5. **最終顯示**:`wrapper ? \`${wrapper}[${innerDisplay}]\` : innerDisplay`

註:此 invariant 是 picker trigger、canvas DTO note 顯示、markdown export、json export 共同遵守的**單一 source of truth**。新元件需呼叫同一個 helper(避免漂移)。

### 4. consumer onPick 翻譯合約

```ts
// 在 4 個 consumer 內統一 pattern:
onPick={(entry) => {
  const wrappedType = wrapType(entry.type, entry.wrapper);
  if (entry.kind === 'dto') {
    onChange(updated => updated.map(... { type: wrappedType, dtoSpecRef: entry.dtoNoteId } ...));
  } else {
    onChange(updated => updated.map(... { type: wrappedType, dtoSpecRef: undefined } ...));
  }
}}
```

`wrapType` 從 shared/TypeOrDtoPicker import,確保 4 處格式一致。

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/components/shared/TypeOrDtoPicker.tsx` | export `ContainerWrapper` type、`wrapType` helper;`TypeOrDtoEntry` 三 variant 都加 optional `wrapper`;render entry 加 `▸` icon、hover/click 觸發 sub-menu(plain + Array + Set + List 4 列);sub-menu 開關行為(Esc 只收子、click outside 收全部、同時間最多一子) |
| `src/utils/dtoDerived.ts` | `resolveFieldType` 改寫加 `^(Array|Set|List)\[(.+)\]$` parse;依 invariant 5 步驟組裝 innerDisplay 與最終 wrapped 顯示 |
| `src/components/DetailPanel/ReturnTypeEditor.tsx` | onPick 用 `wrapType(entry.type, entry.wrapper)` 寫入 type;dtoSpecRef 邏輯不變 |
| `src/components/DetailPanel/DtoFieldsEditor.tsx` | 同上 |
| `src/components/Modals/AddCommandModal.tsx` | 同上(`updatePropertyTypeAndRef` helper 內加 wrapType) |
| `src/components/DetailPanel/DetailPanel.tsx` | `PropertyTable` 與 `ColoredPropertyTable` 內部的 onPick(2 處)同上 |

未改動:

- `src/types/specs.ts`、`src/types/elements.ts`、`mcp-server/src/index.ts`:schema 完全不動。
- `src/utils/markdownExporter.ts`、`src/utils/jsonExporter.ts`:wrapped type 字串原樣輸出,既有邏輯讀 type 字串即可,不需特別改。
- 既有 ReturnTypeSpec.shape 邏輯不動(那是 outer-level array,本 task 是 inner-field array)。
- `src/store/boardStore.ts`:無新 action。
- v16 wire-strip / persist / sync:不影響。

---

## 實作步驟

### Step 1 — `src/components/shared/TypeOrDtoPicker.tsx`

1. 在 export 區塊新增:
   ```ts
   export type ContainerWrapper = 'Array' | 'Set' | 'List';
   export function wrapType(base: string, wrapper?: ContainerWrapper): string {
     return wrapper ? `${wrapper}[${base}]` : base;
   }
   ```
2. 將 `TypeOrDtoEntry` 三個 variant 都加 `wrapper?: ContainerWrapper`(optional)。
3. 新增 file-local 常數 `CONTAINER_WRAPPERS: ContainerWrapper[] = ['Array', 'Set', 'List']`(順序同子選單顯示)。
4. **元件內加狀態**:
   - `openSubMenuKey: string | null`(同時最多一個 sub-menu open;key 用 `${kind}-${id|type}` 確保唯一)
   - `subMenuTimerRef: RefObject<number | null>`(hover 250ms 計時器)
5. **renderOption 改寫**:每個 row 右側多加 `▸` icon(若該 entry 支援 wrapper 都顯示)。
   - row 主體 click → `pick(entry, undefined wrapper)`(plain)
   - row hover 進入 → 啟動 setTimeout(250) 在 timer fire 時設 `openSubMenuKey = key`
   - row hover 離開 → clearTimeout
   - `▸` icon click(stopPropagation)→ 立即設 `openSubMenuKey = key`
6. **Sub-menu render**:當 `openSubMenuKey === key` 時 render absolute-positioned panel:
   - 位置:`right: '100%'`(以 row 為基準,往左展);`top: 0`;寬度約 180–200px
   - 樣式:同 dropdown panel 的 dark/light theme(背景、邊框、字色)
   - 內容:4 列(`undefined`、`'Array'`、`'Set'`、`'List'`),前 3 列文字依序為 `<type>`、`Array[<type>]`、`Set[<type>]`、`List[<type>]`
   - 點任一列 → `pick(entry with wrapper)` + close all
7. **Esc / click outside 整合**:
   - 既有 keydown Esc handler 加邏輯:若 `openSubMenuKey !== null` → 只關 sub-menu(`setOpenSubMenuKey(null)`),return early(不關主 dropdown)
   - 既有 click outside 沿用,自動把主 dropdown + sub-menu 一併關
8. **+ Add Custom Type** 行為不變:加完 trigger `onPick({ kind: 'custom', type: trimmed })`(無 wrapper),並 close。
9. **Search filter 行為**:沿用既有 inner 比對邏輯不動;sub-menu 不另做 filter(只 4 列)。

### Step 2 — `src/utils/dtoDerived.ts`

1. 在檔案頂部加常數:
   ```ts
   const WRAPPER_PATTERN = /^(Array|Set|List)\[(.+)\]$/;
   ```
2. 改寫 `resolveFieldType`(維持 same signature,內部加 wrapper 邏輯):
   ```ts
   function resolveFieldType(field: DtoField, allNotes: StickyNote[]): string {
     const m = (field.type ?? '').match(WRAPPER_PATTERN);
     const wrapper = m?.[1];
     const inner = m?.[2] ?? field.type ?? '';

     let innerDisplay: string;
     if (field.dtoSpecRef) {
       const target = allNotes.find((n) => n.id === field.dtoSpecRef && n.type === 'Dto');
       if (target) {
         innerDisplay = (target.label.split('\n')[0] ?? '').trim() || '(Unnamed DTO)';
       } else {
         innerDisplay = inner.trim() ? `${inner} (?)` : '(missing DTO)';
       }
     } else {
       innerDisplay = inner.trim() || '?';
     }

     return wrapper ? `${wrapper}[${innerDisplay}]` : innerDisplay;
   }
   ```
3. `deriveDtoContent` 不需改動(它呼叫 `resolveFieldType` 取每行,新邏輯自動套用)。
4. **不**重新命名既有函式,維持 import 兼容性。

### Step 3 — `src/components/DetailPanel/ReturnTypeEditor.tsx`

1. import 加 `wrapType`:
   ```ts
   import { TypeOrDtoPicker, wrapType } from '../shared/TypeOrDtoPicker';
   ```
2. 既有 onPick:
   ```ts
   onPick={(entry) => {
     const wrappedType = wrapType(entry.type, entry.wrapper);
     if (entry.kind === 'dto') {
       updateField(i, { type: wrappedType, dtoSpecRef: entry.dtoNoteId });
     } else {
       updateField(i, { type: wrappedType, dtoSpecRef: undefined });
     }
   }}
   ```

### Step 4 — `src/components/DetailPanel/DtoFieldsEditor.tsx`

同 Step 3 模式。

### Step 5 — `src/components/Modals/AddCommandModal.tsx`

import `wrapType`,在 onPick 內套同樣 pattern;`updatePropertyTypeAndRef` helper 在 type 寫入時使用 `wrapType`。

### Step 6 — `src/components/DetailPanel/DetailPanel.tsx`

1. import `wrapType`(若還沒)。
2. `PropertyTable` 內 enableDtoRef 分支的 onPick → 用 wrapType。
3. `ColoredPropertyTable` 內 enableDtoRef 分支的 onPick → 同上。

---

## 失敗路徑

- **type 字串嵌套(`Array[Set[X]]`)**:WRAPPER_PATTERN 是貪婪 `(.+)`,會把 `Set[X]` 當 inner;但 picker UI **不會產出**嵌套(sub-menu 只 1 層 wrap),且 `wrapType` 也不會做嵌套組合。若 user 透過 MCP 或舊資料寫入嵌套字串,顯示層仍能 fallback 但語意未保證(documented in spec、Non-goals 明列)。
- **`field.type` 為 undefined**:`(field.type ?? '').match(...)` 防呆;最終 inner 為空時 `innerDisplay = '?'`。
- **sub-menu 開啟後 dropdown unmount**:既有 click outside 會收;若 React 在 sub-menu open 時 force unmount(罕見),timer cleanup 在元件 unmount effect 裡做 `clearTimeout`。
- **wrapper 字串非合法 enum**(舊資料寫了 `Map[K,V]`):WRAPPER_PATTERN 不匹配 → 整個 type 視為 inner,顯示原樣。Documented in spec。
- **shared 元件耦合 store 風險**:`wrapType` 是 pure function;sub-menu 不引入 store。grep gate 阻擋反向耦合。

---

## 不改動的部分

- `src/types/specs.ts`、`src/types/elements.ts`、`mcp-server/src/index.ts`:schema 不動。
- `src/store/boardStore.ts`:無新 action。
- v16 wire-strip / persist / sync 機制不變。
- markdown / json export 邏輯不變(原樣輸出 wrapped type 字串)。
- 既有 ReturnTypeSpec.shape 邏輯不變。
- 4 個 consumer 的 dtoSpecRef 處理不變(picker 仍同寫 / 清掉)。

### Non-goals(行為層)

- 本 task **不**支援嵌套 wrapper(`Array[Set[X]]`)
- 本 task **不**支援 `Map[K,V]` / `Pair[X,Y]`(延後 follow-up)
- 本 task **不**讓 nullable 修飾 inner(`Array[X?]` 不支援;nullable 永遠修飾整個欄位)
- 本 task **不**改既有 ReturnTypeSpec.shape='array' 邏輯(那是 outer-level)
- 本 task **不**做 keyboard arrow-key navigation
- 本 task **不**改 schema、不 bump persist version、不 normalize 老資料
- 本 task **不**改 markdown / json export 邏輯
- 本 task **不**做 cross-language codegen 自動轉換(消費端自行 parse `Wrapper[X]`)

---

## 驗收標準

### Agent 必做(可機器執行)

```bash
# 1. 型別 / build
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..
npm run build

# 2. shared 元件介面變更
grep -q 'export type ContainerWrapper' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export function wrapType' src/components/shared/TypeOrDtoPicker.tsx
grep -q "wrapper?: ContainerWrapper" src/components/shared/TypeOrDtoPicker.tsx

# 3. dtoDerived parse 加入
grep -q 'WRAPPER_PATTERN' src/utils/dtoDerived.ts
grep -q 'Array|Set|List' src/utils/dtoDerived.ts

# 4. 4 consumer 都 import wrapType 並使用
grep -q 'wrapType' src/components/DetailPanel/ReturnTypeEditor.tsx
grep -q 'wrapType' src/components/DetailPanel/DtoFieldsEditor.tsx
grep -q 'wrapType' src/components/Modals/AddCommandModal.tsx
grep -q 'wrapType' src/components/DetailPanel/DetailPanel.tsx

# 5. shared 元件不反向耦合 store
! grep -n 'useBoardStore' src/components/shared/TypeOrDtoPicker.tsx
! grep -n 'useUIStore' src/components/shared/TypeOrDtoPicker.tsx

# 6. sub-menu 視覺暗示存在(▸ icon)
grep -q '▸' src/components/shared/TypeOrDtoPicker.tsx

# 7. schema 確實未動
git diff HEAD~..HEAD -- src/types/specs.ts | grep -q '^+' && exit 1 || true
git diff HEAD~..HEAD -- src/types/elements.ts | grep -q '^+' && exit 1 || true
git diff HEAD~..HEAD -- mcp-server/src/index.ts | grep -q '^+' && exit 1 || true
```

### Human 補做(需要人類介入)

- [ ] 開 Remodel block return type / DTO 內部 fields / Command information / Remodel parameters 任一 picker,每個 entry 右邊都看到 `▸` icon
- [ ] hover entry 約 1/4 秒看到側邊 sub-menu 浮出,顯示 4 列(plain / Array / Set / List)
- [ ] 點 `▸` icon 立即彈 sub-menu(不需 wait hover)
- [ ] 點 row 主體 = 等同 plain pick(同既有行為)
- [ ] 選 `Array[OrderDto]` 後 trigger 顯示 `Array[OrderDto名]`,canvas note 也跟著顯示
- [ ] 既有的 stale ref 顯示 `Array[<type> (?)]`(wrapper 在外、(?) 標記在 inner)
- [ ] Esc 鍵:若 sub-menu 開著只收 sub-menu;再按 Esc 才收主 dropdown
- [ ] click outside picker → 全部關
- [ ] sub-menu 不會超出視窗左緣(往左展但寬 ≤ 200px)
- [ ] 同時間最多只能一個 sub-menu 開(切到另一個 entry 自動把前一個收起)
- [ ] 「+ Add Custom Type」加新 type 後關 dropdown(不留 sub-menu;新 type 進主列表後可再點 wrap)
- [ ] markdown export 對 wrap 過的 field 輸出 `Array[OrderDto]` 字串
- [ ] DevTools console 全程無錯誤

---

## 已知限制

- **不支援嵌套 wrapper**:user 透過 MCP 寫入 `Array[Set[X]]` 仍能存,但 UI 只能顯示外層 wrapper、不能再 wrap 一層;codegen 端自行處理
- **inner 為 customType 時**:wrapped 顯示 `Array[Email]` 直接套字串,不檢查 Email 是否在 customTypes(視為 free string)
- **stale ref 同名衝突**:若 user 刪了 OrderDto 又另建一個同名 DTO,dtoSpecRef 仍指向舊 id 視為 stale;UI 顯示 `Array[OrderDto (?)]`,user 重選即可
- **依賴關係**:無前置 task。`wrapType` / `ContainerWrapper` / dtoDerived parse 都是 self-contained,從本 task 起 4 個 consumer 開始用
- **Sub-menu accessibility**:無 keyboard arrow-key navigation;Esc / click outside 是唯一 a11y 通道。與既有 picker baseline 一致
- **與 Topic B(Policy card)正交**,不阻塞
