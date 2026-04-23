# FE — Spec Bundle UI 實作摘要

**狀態**：已完成
**對應 UX 規格**：`docs/UX-004-spec-bundle-ui.md`
**對應 Spec**：`docs/spec-design.md`

---

## 範圍

實作 Spec Bundle（AggregateSpec / UseCaseSpec / ReadModelSpec / DtoSpec）在 Detail Panel
端的編輯 UI，以及 Remodel 彩色區塊改為結構化資料驅動。

### 涵蓋的 3 個 UI 範圍

1. **Aggregate Detail Panel**（新元件 `AggregatePanel`）
   - 編輯 `aggregateIdentity.name`
   - State properties（attr / type）table
   - Invariants 三 Band（CONFIRMED / NEEDS REVIEW / Rejected accordion）
   - Identity 的 `_suggested_type` / `_suggested_field` 為 display-only helper text（不可覆蓋，
     依 UX-004 Decision C；render-time 從 aggregate name / identity.name 推導）

2. **Dto Detail Panel**（新元件 `DtoPanel`）
   - 編輯 `dtoFields[]`：name / type / nullable / dtoSpecRef
   - DTO picker：列出 board 上所有 Dto notes，**排除自身**（防循環引用）
   - 支援 `(deleted)` 狀態（ref 指向已刪除 Dto）

3. **Remodel Detail Panel 重整**
   - Parameters：由 `PropertyTable` 結構化編輯（彩色區塊 light-theme 樣式）
   - Return Type：`ReturnTypeEditor` — shape selector（object/array/primitive）+ fields
   - Behavior：新增的單行 input
   - **畫布 sub-note 顯示改為從結構化資料 derive**
     （`parameters` / `returnType.fields`；空時顯示「請補欄位」placeholder，
     **不 fallback 舊 parameterNote.content**，依 user confirmation #3）

### 4 個 user 確認細節（皆已套用）

| # | 細節 | 狀態 |
|---|------|------|
| 1 | Invariant 維持三 Band，不改 Tab | ✅ 三 Band（CONFIRMED / NEEDS REVIEW / Rejected accordion）|
| 2 | `_suggested_type` / `_suggested_field` 為 display-only helper | ✅ render-time derive；store 只存 `name` |
| 3 | Remodel 不 fallback 舊 `parameterNote.content` | ✅ 空時顯示 "請補欄位" placeholder |
| 4 | 「Analyze with AI」按鈕暫不放 | ✅ 未放按鈕入口 |

---

## 新增檔案

### DetailPanel 子元件（`src/components/DetailPanel/`）

- `panelStyles.ts` — 共用 style tokens（band 顏色、文字色、DTO badge）
- `InvariantCard.tsx` — 單一 invariant 卡片（含 rename / rules / errorCode / state refs / Approve-Reject）
- `InvariantBand.tsx` — 按 status 分組的 band 容器（含 Rejected accordion）
- `RulesEditor.tsx` — `rules[]` 表格（when / rule）
- `DtoFieldsEditor.tsx` — DTO fields 表格（name / type / nullable checkbox / DTO picker）
- `DtoPicker.tsx` — DTO 下拉選擇器（自動排除自身，支援 light/dark theme）
- `ReturnTypeEditor.tsx` — Remodel returnType 編輯器（shape + fields）
- `AggregatePanel.tsx` — Aggregate note 的完整 Detail Panel
- `DtoPanel.tsx` — Dto note 的完整 Detail Panel

### Utils

- `src/utils/remodelDerived.ts` — 從 `parameters` / `returnType` 生成 sub-note 顯示文字

---

## 修改檔案

- `src/store/boardStore.ts` — 新增 13 個 actions（Aggregate / Invariant / Dto / Remodel spec）
- `src/types/board.ts` — `BoardStore` interface 擴充新 actions
- `src/components/DetailPanel/DetailPanel.tsx`
  - Import 新 panels + `ReturnTypeEditor`
  - 新增 `ColoredStructuredBlock` / `ColoredPropertyTable` helper
  - `RemodelPanel` refactor：plain textarea → 結構化 UI + Behavior input
  - Main dispatcher 加入 `Aggregate` / `Dto` type 分流
- `src/components/Remodel/Remodel.tsx`
  - `SubNote` 支援 `readOnly` / `emptyPlaceholder` / `monospace` props
  - Parameters / Return Type sub-notes 改為 readOnly + 從結構化資料 derive

---

## 新增 Store Actions

**Aggregate：**
- `updateAggregateIdentity(noteId, identity)`
- `updateStateProperties(noteId, stateProperties)`
- `addInvariant(noteId, invariant)`
- `updateInvariant(noteId, invariantId, updates)`
- `deleteInvariant(noteId, invariantId)`
- `approveInvariant(noteId, invariantId)` — 設 `status='confirmed'` + `provenance='ui'`
- `rejectInvariant(noteId, invariantId)` — 設 `status='rejected'`
- `restoreInvariant(noteId, invariantId)` — 還原至 `needs_review`（AI）或 `confirmed`（UI）

**Dto：**
- `updateDtoFields(noteId, fields)`

**Remodel：**
- `updateRemodelBehavior(remodelId, behavior)`
- `updateRemodelParameters(remodelId, parameters)`
- `updateRemodelReturnType(remodelId, returnType)`

---

## 驗證

- `tsc --noEmit` ✅ 無錯誤
- `npm run build` ✅ 建置成功（431 kB / 117 kB gzip）
- `npm run lint` ✅ 錯誤數與 baseline 相同（27，皆為 pre-existing 的 set-state-in-effect pattern）
- Dev server 啟動 ✅ 5176 port，所有新 module 載入 HTTP 200

---

## 不在本任務範圍

- **Bundle Exporter**：jsonExporter.ts 產出 bundle JSON 的功能待另案處理
- **MCP Tools**：新欄位尚未對外暴露
- **AI 推斷（T2 Analyze）**：按鈕入口暫不放，後端尚未實作
- **Legacy label 遷移**：舊 Dto label 內嵌 schema（`Name\n---\nfield: Type`）不自動遷移至 `dtoFields[]`，user 需手動補欄位

---

## 已知限制與 Tech Debt

1. **Eslint `set-state-in-effect` 警告**：新 panels（AggregatePanel / DtoPanel）的 `useEffect(() => setLocal(note.xxx), [note.id])` 模式與既有 panels 一致，是專案已接受的 convention。未來可統一重構為 `useRef` + `useLayoutEffect` 或 `key={note.id}` 模式。
2. **Invariant stateRef 建議**：目前用 `<datalist>` 提供建議，不支援精確的 inline dropdown UX；如 user 反映不夠好，可升級為下拉選單。
3. **Remodel legacy `parameterNote.content` / `returnTypeNote.content`**：畫布上不再顯示舊資料（依 user confirmation #3），但 store 中仍保留這些欄位（backward compat）；Remodel 匯出時如需移除需另行處理。
4. **ReturnType primitive mode**：目前用 `fields[0]` 暫存 primitive type 字串；若未來規格要求獨立欄位可拆開。

---

## 手動測試建議

開 dev server（`npm run dev`），於畫布上：

1. **Aggregate Panel**
   - 建一個 Aggregate note（Mark as AggregateRoot from Entity）→ 點擊進 Detail Panel
   - 在 Identity 輸入 `orderId` → 下方自動顯示 `Suggested Type: <Name>Id` / `Suggested Field: orderId`
   - 清空 Name → suggested 區塊消失
   - 新增 State field → 右上 `+ Add Invariant` → 填 title / rules / errorCode
   - 新 invariant 出現在 CONFIRMED band
   - 若 store 中手動塞 `provenance: 'assumption'` invariant，會顯示在 NEEDS REVIEW band，並顯示 Approve/Reject 按鈕
   - 按 Reject → 卡片收入 Rejected accordion
   - 按 Restore → 回到 needs_review band

2. **Dto Panel**
   - 建一個 Dto note → 點擊進 Detail Panel
   - 新增 Field：name / type / nullable 勾選 / REF picker
   - REF picker dropdown 不列出當前 Dto 自身
   - 若其他 Dto 存在可選擇，選後 REF 欄顯示縮短名稱
   - 選 `(none)` 可清除 ref

3. **Remodel Panel**
   - 建一個 Remodel → 點擊進 Detail Panel
   - Parameters 區塊（mint green）內新增 attr / type
   - Return Type 區塊選 `object`，新增 field，指定 dtoSpecRef
   - 觀察畫布上 Remodel sub-note 即時更新顯示「orders: OrderSummaryDto[]」類文字
   - Parameters / ReturnType 留空時，畫布顯示「請補欄位」placeholder
   - 新增 Behavior 欄位
   - Shape 切 `primitive` → Return Type 收為單一 Type input
   - Shape 切 `array` → 顯示 "(Array of the following fields)" 提示
