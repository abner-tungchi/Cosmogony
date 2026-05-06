---
topic: "TypeOrDtoPicker 加入容器型別子選單(Array / Set / List)"
status: consensus
created: "2026-05-06"
updated: "2026-05-06"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 1
---

# TypeOrDtoPicker 加入容器型別子選單(Array / Set / List)

## 議題定義

### 背景

TypeOrDtoPicker(2026-05-05 完成)目前列表只支援單一型別(`String`、`OrderDto`、customType)。User 想要 `Array<OrderDto>` / `Set<X>` / `List<X>` 等容器包裝型別,但展平到主列表會造成 N×3 entries 的爆炸感。

User 偏好 **Option B**(schema 不動,純 type 字串約定 + UI):每個 entry hover/click 時展開一個側邊子選單列出容器變體:

```
String       ›   ─→  String
                     Array[String]
                     Set[String]
                     List[String]
```

### 目標

收斂出可一次寫成 spec 的實作方案:
- Schema 維持不動(type 字串直接含 wrapper:`"Array[OrderDto]"`)
- TypeOrDtoPicker 加 sub-menu UI,選 entry → 用 sub-menu 決定包不包容器
- dtoDerived / canvas 顯示能正確 resolve `Container[InnerType]` 並套用 dtoSpecRef

### 範圍

**討論內**:
- 容器型別清單(Array / Set / List?其他?)
- Sub-menu 觸發方式(hover / click / 混合)
- onPick callback 介面變更
- type 字串 wrapper 格式約定(`Array[X]` vs `X[]` vs `Array<X>`)
- dtoDerived parse 規則
- search filter 同步行為(filter 主列表時要不要也匹配 wrapped?)
- 「+ Add Custom Type」是否支援 wrapper(or 永遠 plain)

**討論外**:
- schema 改動(維持 Option B 純字串約定)
- `Map<K,V>`(雙型別,延後)
- `Optional<T>` / `Maybe<T>`(已有 nullable,不重複)
- 既有 returnType.shape='array' 邏輯不動(那是 outer,本 task 是 inner field 的 array)

### 約束

- 既有 4 個 consumer(ReturnTypeEditor / DtoFieldsEditor / Command information / Remodel parameters)的 picker callsite 改動最小
- type 字串 wrapper 格式須與 codegen / markdown export 約定相容
- 不能 break 既有 dtoSpecRef 行為
- a11y baseline:sub-menu 要支援鍵盤(目前 picker 沒 arrow-key,允許 sub-menu 也沒)或至少 Esc 收合

### 子議題

- [ ] **S1**:容器清單(Array / Set / List?Map?)+ wrapper 字串格式(`Array[X]` / `X[]` / `Array<X>`)
- [ ] **S2**:Sub-menu 觸發機制(hover / click / 混合)+ 視覺指示(`›` icon)
- [ ] **S3**:onPick 介面變更 — 是否新增 `wrapper?: 'Array' | 'Set' | 'List'` 欄位到 TypeOrDtoEntry?
- [ ] **S4**:dtoDerived 顯示邏輯 — regex parse `Container[Inner]`,resolve dtoSpecRef 後重新組裝;stale 顯示
- [ ] **S5**:search filter 同步 — query 命中 inner 也要顯示 wrapped 版本嗎?
- [ ] **S6**:「+ Add Custom Type」是否提供 wrapper sub-menu?(預設 plain)
- [ ] **S7**:實作 step、改動檔案、verification grep

---

## 討論紀錄

### Round 1 (2026-05-06)

#### 🅰️ Claude — 提案

**S1 — 容器清單 + wrapper 字串格式**

立場:**容器三選 `Array / Set / List`;字串格式用 `Array[X]`**(中括號)。

論點:
1. Map 需要兩個型別、UX 複雜度跳階,延後 follow-up
2. Optional 已被 nullable 取代,不重複
3. 字串格式三個候選:`Array[X]` / `X[]` / `Array<X>`。**選 `Array[X]`**:
   - `X[]` 後綴在 codegen 時容易誤判 array literal,且不能擴展到 Set/List
   - `Array<X>` 看起來像 TypeScript 但 `<` `>` 在純文字環境(markdown table、grep)是特殊字元
   - `Array[X]` 跟 user 截圖範例一致、可擴展(`Set[X]` `List[X]` `Map[K,V]` 未來),codegen parse 用簡單 `^(\w+)\[(.+)\]$` regex
4. 三個 wrapper 都用同樣語法,維護一致性

**S2 — Sub-menu 觸發機制**

立場:**混合 — entry 永遠顯示 `›` icon(暗示有子選單);hover entry 200ms 後 OR 點擊 `›` icon 展開;點 row 主體 = 預設 plain pick**。

論點:
1. 純 hover 對 mobile / 鍵盤不友善,且 200ms delay 會抖動
2. 純 click 失去快速操作體驗(每次都要兩次點擊)
3. 混合最佳:有 hover 暗示但點擊也行
4. `›` icon 永遠顯示讓 affordance 明確
5. Sub-menu 顯示在 entry 左側(picker dropdown 已經 right-anchored,sub-menu 只能往左展)

**S3 — onPick 介面變更**

立場:**TypeOrDtoEntry 加 `wrapper?: 'Array' | 'Set' | 'List'`**:

```ts
export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'custom'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'dto'; dtoNoteId: string; type: string; wrapper?: ContainerWrapper };

export type ContainerWrapper = 'Array' | 'Set' | 'List';
```

Consumer 翻譯成 type 字串:
```ts
const wrappedType = entry.wrapper ? `${entry.wrapper}[${entry.type}]` : entry.type;
// dtoSpecRef 不變,仍指向 base DTO
```

論點:
1. 把 wrapper 跟 base type 分開 — consumer code 清楚決定怎麼合併
2. `kind` + `wrapper` 都是 optional,既有 plain pick 行為不變(undefined wrapper)
3. type 字串維持 `Array[OrderDto]` 格式

**S4 — dtoDerived parse 規則**

立場:**`resolveFieldType` 加 wrapper 解析,然後對 inner 走既有 dtoSpecRef 邏輯**:

```ts
// pseudo-code
const m = field.type?.match(/^(\w+)\[(.+)\]$/);
const wrapper = m?.[1];           // "Array" | "Set" | "List" | undefined
const inner = m?.[2] ?? field.type;

const resolved = field.dtoSpecRef
  ? allNotes.find((n) => n.id === field.dtoSpecRef && n.type === 'Dto')
  : undefined;
const innerDisplay = resolved
  ? (resolved.label.split('\n')[0].trim() || '(Unnamed DTO)')
  : (inner || '?');

return wrapper ? `${wrapper}[${innerDisplay}]` : innerDisplay;
```

stale ref 處理:wrapper 仍套,inner 顯示 `<old type> (?)`。

**S5 — Search filter 同步**

立場:**主列表 filter 用 inner 比對(忽略可能的 wrapper),sub-menu 顯示時不另外 filter**。

論點:
1. user 打 "Order" 應該命中 OrderDto entry,然後展開看到 Array/Set/List 變體
2. Sub-menu 永遠顯示三個變體 + plain,不需要再 filter(只有 4 筆,filter 沒意義)
3. 若 type 字串本身有 wrapper(罕見:user 已經有 `"Array[OrderDto]"` 的舊資料 — 本案沒線上資料免問),search 仍只看 inner

**S6 — 「+ Add Custom Type」是否提供 wrapper sub-menu**

立場:**不提供。新增 customType 永遠是 plain string;要 wrap 從新列表挑**。

論點:
1. 新增是 customTypes 寫入 project.customTypes,寫的就是 base type 名稱
2. 若 inline 加完馬上 wrap,user 認知混淆(到底加了 `Email` 還是 `Array[Email]`?)
3. 加完 base 後,sub-menu 自然能展開 wrap

**S7 — 實作 step / 改動檔案 / grep**

Steps:
1. `src/components/shared/TypeOrDtoPicker.tsx`:
   - export `ContainerWrapper` type
   - 改 `TypeOrDtoEntry` 加 `wrapper?: ContainerWrapper`
   - render entry 加 `›` icon + hover/click → 觸發子選單 popout(右側 picker dropdown 的 left popout,positioned absolutely)
   - 子選單列出 plain + 三個 wrapper 變體,點哪個就 `onPick({ ..., wrapper })`
   - 子選單 close on click outside / Esc
2. `src/utils/dtoDerived.ts`:`resolveFieldType` 加 wrapper parse 邏輯
3. 4 個 consumer:`onPick` callback 改寫 type 字串(用 `entry.wrapper ? \`${wrapper}[${type}]\` : type`),dtoSpecRef 邏輯不變
4. (可選)`src/utils/markdownExporter.ts` / `jsonExporter.ts`:確認 type 字串原樣輸出(應已 OK,不需特別改)

驗收 grep:
```
grep -q 'export type ContainerWrapper' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'wrapper?:' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'Array\\[' src/utils/dtoDerived.ts  # parse regex
grep -q 'role="menu"\\|role="listbox"' src/components/shared/TypeOrDtoPicker.tsx  # sub-menu a11y
npx tsc --build
npm run build
```

子議題建議狀態:S1-S7 全部 `pending`,等他方覆審。

---

#### 🅱️ Codex — 回應

**S1**:贊成 `Array[X]` 格式 + 三個容器。**補強**:`Array[X]` 與 nullable 互動需明示 — `nullable=true` + `type="Array[OrderDto]"` 是「可空的 array」還是「array of nullable items」?**約定:nullable 一律修飾整個欄位**(整個 array 可為 null),array 內元素不可為 null(若需要 inner nullable,future 加 `Array[OrderDto?]` 約定)。

**S2**:同意混合觸發。**補強**:hover 開的 sub-menu 用 250ms delay(MS Office / VS Code 通用值);Esc 收 sub-menu 但不關 main dropdown;`›` icon 用 `▸` 字元更明確指向側邊。

**S3**:同意加 wrapper 欄位。**補強**:consumer 寫入 type 時建議用 helper:
```ts
function wrapType(base: string, wrapper?: ContainerWrapper): string {
  return wrapper ? `${wrapper}[${base}]` : base;
}
```
放在 TypeOrDtoPicker 同檔 export,4 個 consumer 都呼叫,避免格式漂移。

**S4**:同意 dtoDerived parse。**補強風險**:regex `^(\w+)\[(.+)\]$` 只接受單層;若 user 手動寫 `Array[Set[OrderDto]]` 嵌套,parse 失敗。**約定:不支援嵌套**,只解析單層 wrapper。文件 / 註解明示。

**S5**:同意 search 用 inner 比對。**補強**:既有 search 已用 lowercase substring;只要保持 base type 名比對即可,無新邏輯。

**S6**:同意 inline 新增不 wrap。**補強**:UI 提示文字加「(Plain only — wrap by re-selecting from list)」幫助 user 理解。

**S7**:同意 step。**補強**:
- TypeOrDtoEntry 變更會 break 既有 onPick consumer(4 處),所有 consumer 必須同 commit 改
- 加 unit-style grep:`grep -rn 'wrapper' src/components/DetailPanel/ src/components/Modals/AddCommandModal.tsx`(4 個 consumer 都要有 wrap 邏輯)

子議題建議狀態:S1-S7 全 `agreed`(含我的補強)。

---

#### 🅲 Gemini — 回應

**S1**:同意。**架構觀察**:`Array[X]` 字串格式選擇與 Java/Kotlin/Scala 慣例一致(類似 `List<String>` 的 readable form)。Codegen 工具可選擇 generate `Array<X>` / `X[]` / `List<X>` 任一語言慣例,以 wrapper 名稱為 source of truth。

**S2**:贊成混合觸發,但**警告 sub-menu 定位**:picker dropdown 已 right-anchored 避免 overflow;sub-menu 往左展可能撞到主畫布內容,造成 z-index 戰爭。建議 sub-menu 與 dropdown 同層(`zIndex: 50` 在父 dropdown 內),但確認 sub-menu 寬度 < 200px 不會超出視窗左緣。

**S3**:同意 wrapper 欄位設計,**強烈支持** Codex 提的 `wrapType` helper export — 防止 wrapper 字串格式漂移。

**S4**:**重要補強**:dtoDerived 是顯示層的 invariant 中心;改寫後 spec **必須形式化** invariant 以涵蓋:
1. `dtoSpecRef` 已設且 resolves → 顯示用 DTO 名;raw type wrapper 套上 DTO 名
2. `dtoSpecRef` 未設 → 顯示 raw type(可能含 wrapper)
3. `dtoSpecRef` 已設但 stale → 顯示 `Array[<old> (?)]` (wrapper + raw inner + stale marker)

否則未來 codegen 改寫時容易 misuse。

**S5**:同意。**附加觀察**:當 type 含 wrapper 時,picker trigger 顯示要對齊 dtoDerived 邏輯(不能 trigger 顯示一套、canvas note 顯示另一套)。建議 picker 內部呼叫**同一個** helper(從 dtoDerived export `formatType(field, allNotes)`)。

**S6**:同意 inline add 永遠 plain。**附加 UX 細節**:加完 inline 後 picker 應該停在主列表(讓 user 看到新加的 customType 並可選擇 wrap),不是直接 close。但這跟既有 TypeDropdown 的「加完 close」行為不一致 — 兩種都合理,**選簡單的維持 close** 對應既有行為。

**S7**:同意。補:
- spec 須列出 type 字串格式約定 (公開 contract,給 codegen consumer)
- spec 須列出 wrapper 不嵌套規則(回應 Codex S4 警告)

子議題建議狀態(Gemini):S1-S7 全 `agreed`(含我的補強)。

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| S1 | 容器三選 Array / Set / List;字串格式 `Array[X]`(中括號);不支援嵌套(`Array[Set[X]]` 等);nullable 修飾整欄(不修飾 inner) | ✅ | ✅ | ✅ | `agreed` |
| S2 | 混合觸發:entry 永遠顯示 `▸` icon;hover 250ms OR 點擊 `▸` 展子選單;點 row 主體 = plain pick;Esc 收子選單不收主 dropdown;sub-menu 往左展、寬 < 200px、與主 dropdown 同 z-index 層 | ✅ | ✅ | ✅ | `agreed` |
| S3 | TypeOrDtoEntry 加 `wrapper?: ContainerWrapper`;export `wrapType(base, wrapper)` helper;4 個 consumer 都用此 helper 寫入 type 字串 | ✅ | ✅ | ✅ | `agreed` |
| S4 | dtoDerived `resolveFieldType` 加 wrapper parse(`^(\w+)\[(.+)\]$`);invariant 形式化 3 case(resolved / 未設 / stale)寫進 spec | ✅ | ✅ | ✅ | `agreed` |
| S5 | search filter 比對 inner(忽略可能的 wrapper);picker trigger 顯示透過共用 `formatType` helper 與 canvas 一致 | ✅ | ✅ | ✅ | `agreed` |
| S6 | 「+ Add Custom Type」永遠 plain,加完關閉 dropdown(沿用既有行為);UI 提示「Plain only — wrap by re-selecting from list」 | ✅ | ✅ | ✅ | `agreed` |
| S7 | 改 5 UPDATE(TypeOrDtoPicker / dtoDerived / 4 consumer)+ verification grep(wrapper / wrapType helper / 4 consumer 都呼叫) | ✅ | ✅ | ✅ | `agreed` |

**全 7 子議題 R1 收斂,無 dispute。**

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round |
|---|------|---------|-----------|
| D1 | 容器型別:`Array` / `Set` / `List`;字串格式 `Wrapper[Inner]`;不嵌套;nullable 修飾整欄;Map 延後 | 2026-05-06 | R1 |
| D2 | TypeOrDtoEntry 加 `wrapper?: ContainerWrapper`;export `wrapType` helper 統一寫入 | 2026-05-06 | R1 |
| D3 | Sub-menu 觸發:hover 250ms OR 點擊 `▸`;Esc 只收 sub-menu;sub-menu 左展、寬 ≤ 200px、同 z-index | 2026-05-06 | R1 |
| D4 | dtoDerived invariant 形式化 3 case;picker trigger 與 canvas 共用 formatType helper | 2026-05-06 | R1 |
| D5 | search 比對 inner;Add Custom Type 永遠 plain 並關 dropdown | 2026-05-06 | R1 |

---

## 開放問題

無。

---

## Spec-Ready Checklist

### 介面變更

```ts
// src/components/shared/TypeOrDtoPicker.tsx
export type ContainerWrapper = 'Array' | 'Set' | 'List';

export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'custom'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'dto'; dtoNoteId: string; type: string; wrapper?: ContainerWrapper };

export function wrapType(base: string, wrapper?: ContainerWrapper): string;
```

### dtoDerived invariant(formalize)

對任意 `DtoField` / `ReturnTypeField` / `Property`:
1. 解析 `type` 字串是否符合 `^(\w+)\[(.+)\]$`,取出 `wrapper` 與 `inner`(無匹配時 `inner = type`)
2. **若 `dtoSpecRef` 已設且 resolves**:`innerDisplay = DTO label 第一行 trim`
3. **若 `dtoSpecRef` 已設但 stale**:`innerDisplay = "<inner> (?)"` 紅色標記
4. **若 `dtoSpecRef` 未設**:`innerDisplay = inner || '?'`
5. 最終顯示:`wrapper ? \`${wrapper}[${innerDisplay}]\` : innerDisplay`

### 改動檔案

| 檔案 | 動作 |
|---|---|
| `src/components/shared/TypeOrDtoPicker.tsx` | 加 `ContainerWrapper` type、`wrapType` helper、TypeOrDtoEntry wrapper 欄位、entry 旁 `▸` icon + sub-menu render |
| `src/utils/dtoDerived.ts` | `resolveFieldType` 加 wrapper parse(invariant 形式化) |
| `src/components/DetailPanel/ReturnTypeEditor.tsx` | onPick 用 `wrapType(entry.type, entry.wrapper)` 寫入 type |
| `src/components/DetailPanel/DtoFieldsEditor.tsx` | 同上 |
| `src/components/Modals/AddCommandModal.tsx` | 同上 |
| `src/components/DetailPanel/DetailPanel.tsx` | PropertyTable + ColoredPropertyTable 內 onPick 同上(2 處) |

### Non-goals(行為層)

- 不支援嵌套 wrapper(`Array[Set[X]]` 等)
- 不支援 `Map[K,V]` / `Pair[X,Y]`(延後)
- nullable 不修飾 inner(`Array[X?]` 不支援)
- 既有 ReturnTypeSpec.shape 不動(那是 outer)
- 不做 keyboard arrow-key navigation
- schema 不動(維持純字串約定)
- 不做 migration



