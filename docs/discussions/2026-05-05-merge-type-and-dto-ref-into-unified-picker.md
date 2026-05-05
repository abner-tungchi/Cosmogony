---
topic: "ReturnTypeField / DtoField 的 type + dtoSpecRef 合併為單一 picker"
status: consensus
created: "2026-05-05"
updated: "2026-05-05"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 2
---

# ReturnTypeField / DtoField 的 type + dtoSpecRef 合併為單一 picker

## 議題定義

### 背景

目前 `ReturnTypeField` 與 `DtoField` 兩個型別在 schema 上各有兩個欄位:

```ts
{
  name: string,
  type: string,            // BUILT_IN_TYPES / customType / 任意字串
  nullable?: boolean,
  dtoSpecRef?: string,     // 指向 board 上某個 DTO note id
}
```

UI 上分成 `Type` 欄(plain input)+ `Ref` 欄(DtoPicker)兩個 picker,user 引用 DTO 時必須兩邊都填。容易不一致(type="OrderDto" 但 dtoSpecRef 指向另一張卡)、且 user 重複工。

User 偏好 **Option C** — 合併成一個綜合 picker:列表顯示 BUILT_IN_TYPES + customTypes + board DTO notes,挑 DTO 自動寫入兩邊。並要求附 migration code 讓線上版本沿用。

另外有一個**獨立但相關**的概念 `Remodel.linkedDtoIds: string[]`,是 Remodel 卡片層級的 DTO 關聯 chip 列表,**與欄位層 dtoSpecRef 無關**(用於 markdown / json export 的文件視角)。本議題不動 linkedDtoIds 概念,但需釐清三者關係。

### 目標

收斂出可一次寫成 spec 的實作方案,涵蓋:
1. UI 合併策略(picker 行為、視覺、light/dark theme)
2. Schema 取捨(維持 type+dtoSpecRef 雙欄?還是 schema 變更?)
3. Migration 計畫(尤其線上 user localStorage 與 BE project.json)
4. type / dtoSpecRef / linkedDtoIds 三者語意與留存關係

### 範圍

**討論內**:
- `ReturnTypeField`(Remodel `returnType.fields[]`)的 picker 合併
- `DtoField`(DTO note `dtoFields[]`)的 picker 合併
- 上述對應的 migration 與 wire 影響
- TypeDropdown 的 light theme 支援(因為 ReturnTypeEditor 在淺色 Remodel 卡內)

**討論外**:
- `Property`(Aggregate stateProperties / Command information / DomainEvent eventProperties)目前 schema 沒 dtoSpecRef 欄位 — **本 task 不擴**,維持純 type 字串
- `Remodel.linkedDtoIds` 文件層級關聯 — 不動,UI 不改,但需在 spec 釐清「為何不一起合併」
- 其他 Spec Bundle 內容(Invariants、AggregateIdentity)不動

### 約束

- v16 uiStore migration / persist v16 / 三層 wire-strip 不能被破壞
- BE 端 `mcp-server/src/index.ts` 也有獨立 Project / DtoField / ReturnTypeField 型別宣告(line 68, 75),需同步處理
- MCP tools `es_update_dto_fields` / `es_update_remodel_return_type` 的 input schema 對外宣告不能 breaking
- 既有 wire payload 含 type + dtoSpecRef 雙欄,任何 schema 變更需有對應 migration 路徑

### 子議題

- [ ] **S1**:Schema 取捨 — 維持「type + dtoSpecRef 雙欄」純 UI 合併,還是改 schema(C-2 typeRef 區分 / C-3 純 type 由名字推導)?
- [ ] **S2**:合併 picker UI 方案 — 一個下拉?分組(BUILT_IN / customTypes / DTOs)?搜尋框?light theme 支援?
- [ ] **S3**:Migration 路徑 — FE persist version、BE migrateProject、舊 client wire payload 的處理
- [ ] **S4**:邊角案例 — 同名衝突(customType="OrderDto" + 板上有 OrderDto note)、DTO 刪除後欄位殘留、跨 board DTO 引用、相同 DTO 名跨 context
- [ ] **S5**:Linked DTOs(`Remodel.linkedDtoIds`)的留存與文件 — 是否同時 sync(欄位用了 DTO 自動加進 chip list)?還是維持完全獨立?
- [ ] **S6**:實作 step、檔案改動、verification grep(給 spec 用)

---

## 討論紀錄

### Round 1 (2026-05-05)

#### 🅰️ Claude (facilitator) — 提案

**S1 — Schema 取捨**

**立場**:選 **C-1 純 UI 合併,schema 不動**(維持 type + dtoSpecRef 雙欄)。

論點:
1. Schema 改動會 cascade 到 BE-local Project type、wire payload、MCP tools input schema、舊 client 相容,範圍極大。C-1 只動 UI 與 sync 邏輯,規模可控。
2. 既有 `dtoDerived.ts:resolveFieldType` 已建立「dtoSpecRef 為主、type 為 fallback」的 invariant — 沿用即可。
3. Migration 變得**極簡**:不需動既有 localStorage / project.json 任何欄位;只需要在 picker 顯示時做「依 dtoSpecRef 解析顯示名」與「pick DTO 時同步寫 type」。
4. 用 C-2 重構 typeRef discriminated union 看似乾淨,但實際會把所有 callsite(codegen export、markdown 顯示、jsonExport)全部改寫,且難以漸進部署。
5. C-3(只留 type、靠名字推導)會因為「DTO 重新命名」與「跨 board 同名 DTO」變脆弱,反而引入更多邊角。

**風險**:user 心智上的「兩個欄位」不再對應 UI 兩個 picker,可能困惑 — 但這正是 user 想要的(C 想合併)。實際 schema 隱藏不會看到。

**S2 — 合併 picker UI**

**立場**:**單一 dropdown,分組顯示**:
```
[Trigger]: 顯示目前選中的 type 名稱(若 dtoSpecRef 有值,顯示 DTO 顯示名;否則顯示 type 字串;空則 "Select type...")
[Dropdown panel]:
  ┌─────────────────────────────┐
  │ [Search...]                 │  ← 可選,先做最簡版可省略
  │ ─── DTOs on this board ───  │  ← 來自 board.notes.filter(type==='Dto')
  │   📄 OrderSummaryDto        │  ← icon 區分 DTO entries
  │   📄 InvoiceLineDto         │
  │ ─── Custom Types ───        │
  │   Email                     │
  │   Money                     │
  │ ─── Built-in ───            │
  │   String                    │
  │   Int                       │
  │   ...                       │
  │ ─── ─── ─── ─── ─── ───     │
  │ + Add Custom Type...        │
  └─────────────────────────────┘
```

論點:
1. 三個 section 順序 DTO → Custom → Built-in:DTO 最常被選(語意最豐富),且引用 DTO 是 UI 合併的主要動機。
2. icon `📄` 視覺區分 DTO entries,避免名字同 customType 看不出來。
3. 點 DTO entry → 設 `type = dtoNote.label`(取第一行 trim)+ `dtoSpecRef = dtoNote.id`。
4. 點 Custom / Built-in entry → 設 `type = entry`,**清掉** `dtoSpecRef`。
5. 「+ Add Custom Type」沿用既有行為,加進 customTypes,**不**設 dtoSpecRef。
6. 元件名稱:`TypeOrDtoPicker`(避免跟既有 `TypeDropdown` / `DtoPicker` 衝突)。新元件,**保留** TypeDropdown 與 DtoPicker 不刪(其他地方還在用)。
7. **Light theme 支援**:加 `theme?: 'dark' | 'light'` prop,風格參照 DtoPicker 的 light theme 配色。

**S3 — Migration 路徑**

**立場**:**因為選 C-1,migration 邏輯極簡到「幾乎不需要 schema migration」**。但仍需要兩件事:

1. **FE persist version 不需 bump**:既有 type / dtoSpecRef 欄位完全沿用,localStorage 直接讀就 OK。
2. **「同步補完」一次性 normalize**(可選,放在 v17 migration 或 lazy 進行):
   - 對所有 ReturnTypeField / DtoField,若 `dtoSpecRef` 已設且能解析到實際 DTO note,把 `type` 同步成 DTO 顯示名(讓兩個欄位一致,後續 UI 顯示更穩)。
   - 對 `dtoSpecRef` 已設但解析不到 DTO 的 stale ref,保留(顯示時 dtoDerived 會加 `(?)` marker)— **不**自動清掉,避免靜默資料損失。
3. **BE migrateProject 同樣的 normalize**(對稱)。
4. **MCP tools input schema 不變**:`es_update_dto_fields` 與 `es_update_remodel_return_type` 仍接收 type + dtoSpecRef 兩欄,使用者寫法不變。

論點:
1. C-1 schema 不動 → 真正意義的「migration」幾乎沒有,只是同步補完老資料的小 cleanup。
2. 同步補完可以放在 picker 內部「點 DTO 時自動寫 type」邏輯本身,不需要強制 migration — **建議走 lazy 補完**,降低風險。
3. 線上既有資料的 dtoSpecRef + type 不一致會被新 picker 的「pick 時兩欄同寫」自動修好。

**風險**:既有不一致資料(type="A" 但 dtoSpecRef 指向 B)在 user 不重新選之前仍維持不一致。Mitigate:dtoDerived 與 markdown export 已有「dtoSpecRef 優先、type 為 fallback」邏輯,顯示層自然以 ref 為主。

**S4 — 邊角案例**

立場:
1. **同名衝突(customType="OrderDto" + 板上有 OrderDto note)**:picker 同時顯示兩筆(分別在 DTO group 與 Custom Types group)。User 可選任一筆,結果不同(DTO 那筆會設 dtoSpecRef,Custom 那筆不會)。Tooltip 加說明。
2. **DTO 刪除後欄位殘留**:既有 dtoDerived 已處理(顯示 `type (?)` 或 `(missing DTO)`)。Picker 顯示 trigger 時偵測 stale ref → 顯示 "(deleted DTO)" 紅字,user 點開可重選或清掉。
3. **跨 board DTO 引用**:**禁止**(既有 ReturnTypeEditor / DtoFieldsEditor 都只取 active board 的 DTO notes,維持)。Picker 列表只列 active board 的 DTO。
4. **同 board 重名 DTO**:罕見但可能,picker 顯示時都列出來,以 note id 區分(內部),user 看不到 id 但兩筆都會顯示同名 — 視覺上難區分。Mitigate:hover tooltip 顯示 short id。

**S5 — Linked DTOs 留存**

**立場**:**保留 linkedDtoIds 概念不動,但提供「半自動 sync」**。

論點:
1. linkedDtoIds 是 Remodel 卡片層級的「文件視角」,語意上「這個 read model 跟哪些 DTO 有關」— 不一定都來自 returnType.fields。例如 Remodel 內部用了某 DTO 但只在 behavior 描述提到,沒有結構欄位。
2. 自動把 returnType 用到的 DTO 加入 linkedDtoIds 是合理的(zero-effort 文件補全),但**不**自動移除 — user 可能想保留歷史關聯。
3. **行為**:當 user 透過 picker 在 returnType.fields 選一個 DTO,**自動**把該 dtoSpecRef 加進 `remodel.linkedDtoIds`(若不存在);user 可以手動從 chip list × 移除。**反向不做**(linkedDtoIds 移除不影響 returnType 欄位)。
4. DtoFieldsEditor(DTO 內部 nested DTO 引用)沒有對應的 linkedDtoIds 概念(DTO note 本身沒這欄位),不影響。

**風險**:user 不一定喜歡自動補。可加 setting 或先做最簡版,觀察。

**S6 — 實作 step / 檔案 / grep**

Steps(預估):
1. 新增 `src/components/shared/TypeOrDtoPicker.tsx`:綜合 picker 元件(吃 board notes、customTypes、addCustomType,onChange 回 `(type, dtoSpecRef | undefined)` 兩值)。
2. 加 light theme 支援:TypeOrDtoPicker props `theme?: 'dark' | 'light'`。
3. `ReturnTypeEditor.tsx`:刪除 Ref column 與 DtoPicker,Type column 改用 TypeOrDtoPicker;onChange 同寫 type + dtoSpecRef。Header 改成只剩 Name / Type / Null / Delete 四欄。
4. `DtoFieldsEditor.tsx`:同 step 3,刪除 Ref column。
5. **DtoPicker 不刪**(目前其他地方沒在用,但 keep around 一輪後再 cleanup;或直接刪掉並 grep 確認沒人用)。
6. (可選)Remodel 內 picker DTO 自動 sync 進 linkedDtoIds:`updateRemodel` action 旁新增邏輯,或由元件直接 call。
7. BE:`mcp-server/src/index.ts` 不需要改 input schema;仍接受 type + dtoSpecRef 兩欄。
8. 增加既有 dtoSpecRef stale 偵測測試(顯示 "(deleted DTO)")。

改動檔案:
- `src/components/shared/TypeOrDtoPicker.tsx`(NEW)
- `src/components/DetailPanel/ReturnTypeEditor.tsx`(刪 Ref column、換 picker)
- `src/components/DetailPanel/DtoFieldsEditor.tsx`(刪 Ref column、換 picker)
- `src/components/DetailPanel/DetailPanel.tsx`(若 picker 觸發 linkedDtoIds 自動 sync,可能需小改 RemodelPanel)
- `src/components/DetailPanel/DtoPicker.tsx`(保留 or 刪除 — 兩種 strategy)

驗收 grep:
```
test -f src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export.*TypeOrDtoPicker' src/components/shared/TypeOrDtoPicker.tsx
! grep -n 'DtoPicker' src/components/DetailPanel/ReturnTypeEditor.tsx
! grep -n 'DtoPicker' src/components/DetailPanel/DtoFieldsEditor.tsx
grep -q 'shared/TypeOrDtoPicker' src/components/DetailPanel/ReturnTypeEditor.tsx
grep -q 'shared/TypeOrDtoPicker' src/components/DetailPanel/DtoFieldsEditor.tsx
# Header 沒有 Ref 欄
! grep -q "'Ref'" src/components/DetailPanel/DtoFieldsEditor.tsx (僅看 header div text)
npx tsc --build
npm run build
```

子議題建議狀態:S1 → `pending`(等其他兩方覆審 schema 取捨);S2 / S3 / S4 / S5 / S6 → `pending`。

---

#### 🅱️ Codex (GPT-5.4) — 回應

**S1**:**強烈贊同 C-1**(純 UI 合併,schema 不動)。補充風險點:
1. C-2 改 schema 會影響 `mcp-server/src/index.ts` 的 BE Project type 與 MCP tools 的 input schema,所有 MCP client(包括這個 codebase 的 AI 工作流自身)會 breaking,範圍超出 task。
2. C-3(只留 type)會在 DTO 重命名後 dtoSpecRef 自然失效,但目前 dtoSpecRef 是顯示來源,失效會直接讓畫布上顯示 stale name。維護成本反而增加。
3. C-1 唯一的「壞處」是 schema 看起來「冗餘」(兩欄為一個語意),但這是合理的演化結果(一開始 type 是 free text,後來才加 dtoSpecRef 做 graph linkage)。資料庫設計上常見 normalization 與 denormalized cache 並存,類似這裡的 dtoSpecRef + type cache。

**S2**:基本同意 Claude UI 提案,**補強三點**:
1. **Section ordering 我建議調整**:Built-in → DTOs → Custom Types。理由:Built-in 是最常用的(String/Int 比 customType 高頻);DTO 是次高頻(語意最豐富);Custom Types 通常較少。但 Claude 提案 DTO 在最上也合理(因為這次合併動機是 DTO),**兩種都 OK**,留 user 決定。
2. **Trigger 顯示時的 stale ref 處理**:dtoSpecRef 已設但解析不到 DTO,trigger 顯示要明顯區隔。建議:`Selected: <type> (deleted ref)` 紅字。
3. **Search filter 建議做**(雖然 Claude 標可選):當 board 上 DTO 數量多(>10),搜尋很重要。實作成本低(filter list before render)。

**S3**:同意 lazy 補完不強制 migration。**補強**:
1. **不要 v17 migration**,因為沒 schema 變更。但可以在 picker `onPick(dtoEntry)` 內**順手**做「同步寫 type 到 DTO 顯示名」— 這就是 lazy 補完。已經是 Claude 提案的一部分。
2. **BE migrateProject 不動**。
3. **舊 client wire payload**:現有 BE handler 接收 type + dtoSpecRef 兩欄,新 client POST 也送這兩欄,完全相容。
4. **新 client 收到舊 client 的不一致資料(type="A" + dtoSpecRef→B)**:不主動修,顯示層走 dtoDerived 既有 invariant(ref 優先),user 看到 B 顯示。User 重選會自動修。

**S4**:邊角案例同意 Claude 處理。**補一個**:
1. **dtoSpecRef 指向不同 board 的 DTO note**:目前 codebase 用 `allDtoNotes` 取自 `activeBoard.notes`(Aggregate / Remodel / Dto 都這樣)。若舊資料有跨 board ref(不太可能,因為既有 DtoPicker 不允許),會 stale。Mitigate:同 stale ref 處理。
2. **快速重新指定**:user 點同一個 picker 再選不同 DTO,新 ref 取代舊 ref,舊 dtoSpecRef 不會留下殘留。

**S5**:基本同意,**但對自動 sync 持保留意見**。
1. linkedDtoIds 是「策展(curate)」概念,user 可能想要「Remodel 文件上引用 OrderDto 但 returnType 沒用到」。自動加可能違反 user 意圖。
2. **建議:第一版不自動 sync**,觀察 user 反應。spec 列為 follow-up 候選。
3. 反過來說:**自動加但不自動刪**也是合理的 — Claude 提案。但 onboarding/教學上需要解釋,user 可能困惑為何 DTO 突然出現在 chip 列表。
4. 折衷方案:picker 顯示 DTO entry 時,若該 DTO 還沒在 linkedDtoIds,旁邊加個「+ Also link to Remodel」小 checkbox,讓 user 自己決定。

**S6**:同意 Claude 步驟。**補強**:
1. **DtoPicker 是否刪除**:既有 ReturnTypeEditor / DtoFieldsEditor 是唯二使用者。本 task 都改用 TypeOrDtoPicker 後,DtoPicker 確實沒人用。建議**直接刪**,並加 grep gate `! grep -rn 'DtoPicker' src/` 驗證,避免死碼。
2. **Verification grep 補強**(spec 用):
   ```
   ! grep -rn 'DtoPicker' src/
   awk '/^export const ReturnTypeEditor/,/^const SHAPE_OPTIONS/' src/components/DetailPanel/ReturnTypeEditor.tsx | grep -vq 'Ref'
   ```
3. **Theme prop 設計**:TypeOrDtoPicker 接 `theme?: 'dark' | 'light'`,與 DtoPicker 既有 theme 約定一致。

子議題建議狀態:S1 / S2 / S3 / S4 / S6 → `agreed`;S5 → `disputed`(自動 sync 是否做),建議走 Codex 折衷方案(opt-in checkbox)或不做(let user 手動)。

---

#### 🅲 Gemini — 回應

**S1**:**贊同 C-1**。視角補強:
1. 從 evolution / extensibility 看,保留兩欄 schema 比 C-2 重構靈活 — 未來若要支援「跨 board DTO ref」、「外部 type registry」、「type alias」等場景,雙欄結構都能容納;C-2 discriminated union 會綁死分類。
2. C-1 對外契約零變更,這對於有 MCP 客戶的環境(這個專案)是強門檻 — Codex 已點到。
3. **但**有一個 Claude / Codex 都沒提的問題:**雙欄帶來「what's the source of truth?」的疑問**。spec 必須**明確宣告 invariant**:`dtoSpecRef` 已設且 resolves → 顯示名與 codegen type 來源都用 DTO 名;`dtoSpecRef` 未設或 stale → 用 raw `type`。這個 invariant 已在 dtoDerived 實作,但 spec 要正式列出,避免未來 codegen 改寫時誤用 type 字串。

**S2**:基本同意。**補強架構視角**:
1. **元件 reuse**:TypeOrDtoPicker 內部可以重用既有 TypeDropdown 的「+ Add Custom Type...」inline 行為(已驗證可用)。不要重新發明。
2. **Section ordering**:依使用頻率,我建議 **Built-in → Custom → DTOs**。理由:user 寫一個 fields 列表時,大部分欄位是 primitive(id/name/timestamp 等),DTO ref 是少數但重要的。但這是 cosmetic,不堅持。
3. **Light theme 支援**:同意,但建議**抽出 theme 樣式 token 到一個 `pickerThemes.ts`** 檔(若 future 還有其他 dropdown 要 light theme,共用)。本 task 範圍可不做,只在元件內 inline 配色 — YAGNI 原則。
4. **Search filter**:同意 Codex 應該做。短列表搜尋成本低,長列表(board 上 DTO 多)必要。

**S3**:同意 lazy 補完。**補強 invariant 視角**:
1. **lazy normalization vs explicit migration**:lazy 比較安全(不需動既有 localStorage / project.json,不需 bump version),但有「資料永遠不一致直到 user 重新點選」的副作用。對 codegen 場景影響:codegen 工具讀取 type 字串時可能拿到 stale 名(因為 dtoSpecRef 不一致)。
2. **建議補一個 helper**:`normalizeFieldType(field, allNotes): { type, dtoSpecRef }`,在 codegen / export 時呼叫,確保拿到一致的 type+ref。這是 zero-cost 補丁。
3. **BE 端**:`mcp-server/src/index.ts` 既有 migrateProject 可以**順手**加同樣的 normalize 邏輯(讓 BE 寫進 project.json 的資料更一致)— 但這是 cleanup,不是 task 必做。

**S4**:同意 Claude / Codex 處理。**強烈建議**:
1. **Stale ref 視覺要明顯**:trigger 文字加紅色 + tooltip "(deleted DTO)",讓 user 看到 picker 就知道有問題。
2. **同名衝突的 hover hint**:picker 顯示同名 DTO + customType 時,hover 顯示「📄 Pick this to set DTO ref」vs「Pick this for plain type string」。

**S5**:**支持 Codex 的折衷方案**(opt-in checkbox)。
1. 自動 sync 違反 user 意圖風險高(如 Codex 提的「策展」考量)。
2. 不 sync 又會讓 linkedDtoIds 與 returnType 失去連結。
3. opt-in:user pick DTO 時,picker 旁顯示「Also link to Remodel」checkbox(預設打勾,user 可取消)— 兼顧 zero-effort 與 user 控制。
4. 但這增加 UI 複雜度。**alternative 簡化**:預設不 sync,但 RemodelPanel 的 linkedDtoIds chip list 加一個按鈕「Sync from fields」一次補齊。
5. 我傾向後者(更簡單),但 Codex 的 opt-in checkbox 也合理。**user 偏好決定**。

**S6**:同意 Codex 的 grep 補強。**追加架構建議**:
1. TypeOrDtoPicker 應該 export TypeScript type `TypeOrDtoEntry`(discriminated union),讓 consumer 在 onPick callback 寫起來型別安全:
   ```ts
   type TypeOrDtoEntry =
     | { kind: 'builtin' | 'custom'; type: string }
     | { kind: 'dto'; dtoNoteId: string; type: string };
   onPick: (entry: TypeOrDtoEntry) => void;
   ```
   consumer 自己 dispatch 寫入 `{ type, dtoSpecRef? }` 兩欄。
2. **Architecture note**:這次合併不影響 EventStorming domain 三個概念(type vs dtoSpecRef vs linkedDtoIds)的本質,只是 UI 把前兩者合一。spec 須明確記載這個語意分層,避免未來 confused。

子議題建議狀態:S1 / S2 / S3 / S4 / S6 → `agreed`(含我的 invariant 補強);S5 → `pending`(三方對 auto-sync vs manual sync 略有分歧,建議第二輪鎖定)。

---

### Round 2 (2026-05-05) — S5 鎖定 + User input

#### User input
> "我發現線上版本好像都還沒寫到 read model 的部分,那這樣好像可以不用 migration"

意義:線上(production / 既有 user)沒有 Remodel `returnType.fields` 的歷史資料 → 連 Round 1 提的「lazy normalization 補完」都不需要做(沒有舊資料要補)。**S3 可從「lazy 補完」進一步簡化為「完全不做 normalization,新 picker 寫入後永遠是一致的」**。

DtoField(DTO note 內的 `dtoFields`)可能有少量資料,但本 task 的 picker 合併邏輯(pick DTO 時兩欄同寫、pick 非 DTO 時清掉 ref)會在 user 重新編輯時自然修正,無需主動 migration。

#### 🅰️ Claude — S5 收斂提案

考量 user input 與 Round 1 三方意見,**S5 的最終決議:不做自動 sync,連手動 button 都先不做**。理由:
1. 自動 sync(我原提案)有「策展意圖」風險(Codex 點到)
2. opt-in checkbox(Codex 提案)增加 picker UI 複雜度,且這是 cosmetic 方便性,不該綁進 picker 元件本身
3. 「Sync from fields」按鈕(Gemini 提案)是合理 follow-up,但本 task 不做
4. linkedDtoIds 維持 user 手動策展(現況),語意明確不偏移
5. **如果未來 user 反映「應該自動 sync」,作為 follow-up task 加 RemodelPanel 內的「Sync from fields」按鈕**(Gemini 方案)— 一行小改。

**S5 final decision**:本 task 不動 linkedDtoIds 行為。Picker 純粹寫 `{ type, dtoSpecRef }` 兩欄;Remodel 的 linkedDtoIds chip 列表保持手動策展。

#### 🅱️ Codex — Round 2 回應
同意 S5 final decision。**理由補強**:
- 第一版越精簡越好,linkedDtoIds 自動行為等真實使用反饋再加
- opt-in checkbox 的我自己提案,反思下確實侵入 picker UI,不適合 — 撤回
- 同意「未來 follow-up 加 Sync 按鈕」

#### 🅲 Gemini — Round 2 回應
同意 S5 final decision。**架構觀察**:
- 保持 linkedDtoIds 手動 = 保持 type / dtoSpecRef / linkedDtoIds 三層語意完全獨立
- 任何自動 sync 都會引入隱性耦合(layer 之間相互影響),維護負擔大
- 我的「Sync from fields 按鈕」本來就是低優先建議,本 task 不做合理

S5 三方 agreed → `agreed`。

#### Round 2 額外確認(因 user 確認線上無資料,Round 1 的 S3 連帶簡化)

- **S3 final**:不做任何 schema migration、不做 v17 persist version bump、不做 lazy normalization。Picker 的「pick 時兩欄同寫 / pick 非 DTO 清 ref」邏輯就是唯一一致性保證。BE migrateProject 也不需要新邏輯。
- 既有 BE-local 資料(若 mcp-server/data/project.json 存在 returnType.fields with stale dtoSpecRef)會在 user 重新編輯時被新 picker 自動修;不重新編輯就維持原狀,顯示走既有 dtoDerived invariant(dtoSpecRef 優先)。

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| S1 | Schema 取捨 → 選 **C-1**:維持 type + dtoSpecRef 雙欄,純 UI 合併,schema 不動 | ✅ | ✅ | ✅ | `agreed` |
| S2 | 單一 dropdown,分組顯示(DTOs / Custom / Built-in 三段),DTO 用 📄 icon 區分,新元件 `TypeOrDtoPicker`,支援 `theme: 'dark' \| 'light'`,提供搜尋 filter | ✅ | ✅ | ✅ | `agreed` |
| S3 | **不做任何 schema migration**(user 確認線上無 Remodel returnType 資料);picker 的「pick 時兩欄同寫 / pick 非 DTO 清 ref」就是唯一一致性保證;BE migrateProject 不變 | ✅ | ✅ | ✅ | `agreed` |
| S4 | Stale ref 顯示「(deleted DTO)」紅字 + tooltip;同名衝突時 picker 同時顯示兩筆;跨 board DTO ref 視為 stale | ✅ | ✅ | ✅ | `agreed` |
| S5 | **不做 linkedDtoIds 自動 sync**(維持 user 手動策展);未來若需要,以「Sync from fields」按鈕方式做 follow-up,不在本 task 範圍 | ✅ | ✅ | ✅ | `agreed` |
| S6 | 4 個改動檔(NEW shared/TypeOrDtoPicker.tsx;UPDATE ReturnTypeEditor / DtoFieldsEditor;DELETE DtoPicker.tsx);verification grep 含「shared 元件不反向耦合 store / DtoPicker 完全消失 / Ref column header 不再出現」 | ✅ | ✅ | ✅ | `agreed` |

**全部子議題在 ≤2 round 收斂,無 dispute。**

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|
| D1 | Schema 不動,純 UI 合併(C-1) | 2026-05-05 | R1 | 對應 type / dtoSpecRef 雙欄保留 |
| D2 | 元件名 `TypeOrDtoPicker`,放 `src/components/shared/`,export `TypeOrDtoPicker` 與 `TypeOrDtoEntry` | 2026-05-05 | R1 | 不重用 TypeDropdown 內部,避免條件分支爆炸;但 light theme 配色參照 DtoPicker |
| D3 | 不做 schema migration、不 bump persist version、不 normalize 老資料 | 2026-05-05 | R2 | user 確認線上無 returnType 資料 |
| D4 | linkedDtoIds 維持手動策展,本 task 不引入自動 sync | 2026-05-05 | R2 | 未來 follow-up 候選:RemodelPanel 加「Sync from fields」按鈕 |
| D5 | 完全刪除 `DtoPicker.tsx`(只有 ReturnTypeEditor / DtoFieldsEditor 在用,本 task 都換掉) | 2026-05-05 | R1 | grep gate 抓死碼 |
| D6 | dtoDerived invariant 不變:`dtoSpecRef` resolved → 用 DTO 顯示名;否則用 raw `type`。spec 須明確列出,避免 codegen 誤用 | 2026-05-05 | R1 | Gemini 提的 invariant 形式化 |

---

## 開放問題

無。

---

## Spec-Ready Checklist(給 `/write-spec` 用)

### 介面合約

**新檔 `src/components/shared/TypeOrDtoPicker.tsx`**
```ts
export type TypeOrDtoEntry =
  | { kind: 'builtin' | 'custom'; type: string }
  | { kind: 'dto'; dtoNoteId: string; type: string };  // type = DTO 顯示名

export interface TypeOrDtoPickerProps {
  /** 目前選中的 type 字串 */
  value: string;
  /** 目前選中的 DTO note id;若 set 且能解析,顯示 DTO 名(取代 value) */
  dtoSpecRef?: string;
  /** Pick 結果以 entry 形式傳出,consumer 自行寫入 type + dtoSpecRef 兩欄 */
  onPick: (entry: TypeOrDtoEntry) => void;
  /** Active board 上所有 DTO notes,作為 picker 列表來源 */
  allDtoNotes: StickyNote[];
  customTypes: string[];
  onAddCustomType: (typeName: string) => void;
  /** 排除自身 DTO note,避免 nested DTO 自我引用(僅 DtoFieldsEditor 用) */
  excludeDtoId?: string;
  /** dark = DetailPanel sidebar 用;light = Remodel light-theme block 用 */
  theme?: 'dark' | 'light';
}

export const TypeOrDtoPicker: React.FC<TypeOrDtoPickerProps>;
```

行為:
- Trigger 顯示優先順序:`dtoSpecRef resolved → DTO label`;`dtoSpecRef stale → "<value> (deleted)"` 紅字;`dtoSpecRef 未設 → value || "Select type..."`
- Dropdown 三段:**DTOs on this board**(若 `allDtoNotes.filter(n=>n.id !== excludeDtoId).length > 0`)→ **Custom Types** → **Built-in**;末尾「+ Add Custom Type...」inline 輸入(沿用 TypeDropdown 既有行為 — 抽 helper 或重做)
- Search input(顯示在 dropdown 頂部),filter 三段同步套用
- Pick DTO entry:`onPick({ kind: 'dto', dtoNoteId, type: dtoLabel })`,consumer 寫入 `{ type: dtoLabel, dtoSpecRef: dtoNoteId }`
- Pick custom/builtin:`onPick({ kind: 'custom'|'builtin', type })`,consumer 寫入 `{ type, dtoSpecRef: undefined }` — **明確清掉** ref
- Click outside / Esc 關 dropdown(沿用既有 patterns)

**所有權**:
- TypeOrDtoPicker 純 controlled,不直接動 store。Consumer(ReturnTypeEditor / DtoFieldsEditor)在 onPick 內 dispatch 寫入。
- type / dtoSpecRef 仍是 wire 上獨立兩欄,只是 UI 同寫。

**dtoDerived invariant(formalize,寫進 spec)**:
> 對任意 `DtoField` 或 `ReturnTypeField`,顯示型別與 codegen 型別來源遵循:`dtoSpecRef` 已設且能解析到 DTO note → 用該 DTO 的顯示名(取自 label 第一行 trim);否則(未設或 stale)用 raw `type` 字串,stale 時顯示 `"<type> (?)"` 標記。

### 改動檔案

| 檔案路徑 | 動作 | 描述 |
|---|---|---|
| `src/components/shared/TypeOrDtoPicker.tsx` | NEW | 綜合 picker(dark + light theme)、TypeOrDtoEntry 型別 |
| `src/components/DetailPanel/ReturnTypeEditor.tsx` | UPDATE | 刪 Ref column 與 DtoPicker 引用;Type column 換 TypeOrDtoPicker;header 變成 4 欄(Name / Type / Null / delete) |
| `src/components/DetailPanel/DtoFieldsEditor.tsx` | UPDATE | 同上;`excludeDtoId={selfId}` 避免自我引用 |
| `src/components/DetailPanel/DtoPicker.tsx` | DELETE | 已無 caller |

未動:`src/store/boardStore.ts`(action 不變)、`src/utils/dtoDerived.ts`(invariant 已對)、`mcp-server/src/index.ts`(BE schema 不變)、wire / persist / sync 全部不動。

### Non-goals(行為層)

- 本 task **不**做 schema migration / persist version bump / lazy normalization
- 本 task **不**做 linkedDtoIds 自動 sync(維持手動)
- 本 task **不**改 Property(Aggregate / Command / Event)結構,Property 仍只有 type 字串(沒 dtoSpecRef 概念)
- 本 task **不**改 BE Project 型別、MCP tools input schema、wire payload shape
- 本 task **不**做 keyboard arrow-key navigation(picker 只支援 click + Esc + click outside)
- 本 task **不**做跨 board DTO ref 支援

### 驗收 grep

```bash
# 檔案存在
test -f src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export.*TypeOrDtoPicker' src/components/shared/TypeOrDtoPicker.tsx
grep -q 'export type TypeOrDtoEntry' src/components/shared/TypeOrDtoPicker.tsx

# DtoPicker 完全消失
! test -f src/components/DetailPanel/DtoPicker.tsx
! grep -rn 'DtoPicker' src/

# Consumer 引用 shared
grep -q 'shared/TypeOrDtoPicker' src/components/DetailPanel/ReturnTypeEditor.tsx
grep -q 'shared/TypeOrDtoPicker' src/components/DetailPanel/DtoFieldsEditor.tsx

# Ref column header 不再出現(語意鎖,避免被 import 干擾就 awk 鎖元件 body)
awk '/^export const ReturnTypeEditor/,/^\}/' src/components/DetailPanel/ReturnTypeEditor.tsx | grep -vq ">Ref<"
awk '/^export const DtoFieldsEditor/,/^\}/' src/components/DetailPanel/DtoFieldsEditor.tsx | grep -vq ">Ref<"

# Shared 元件不反向耦合 store
! grep -n 'useBoardStore' src/components/shared/TypeOrDtoPicker.tsx
! grep -n 'useUIStore' src/components/shared/TypeOrDtoPicker.tsx

# Picker 接 light theme(因為 ReturnTypeEditor 在淺色卡內)
grep -q "theme.*'light'" src/components/shared/TypeOrDtoPicker.tsx

# Build & type checks
npx tsc --build
cd mcp-server && npx tsc --noEmit && cd ..
npm run build
```

### 實作 Step(預估 4 step)

1. **新增 `src/components/shared/TypeOrDtoPicker.tsx`** — 完整實作(dark + light theme、三段分組、search、+ Add Custom Type inline)
2. **更新 `ReturnTypeEditor.tsx`** — 刪 Ref column、換 TypeOrDtoPicker、調整 header 欄寬
3. **更新 `DtoFieldsEditor.tsx`** — 同上,picker 帶 `excludeDtoId={selfId}`
4. **刪 `src/components/DetailPanel/DtoPicker.tsx`** — 確認沒有殘留 import

---

## 下次討論指引

### 進度摘要

R1 + R2 收斂完畢,6 個子議題全 agreed,無 dispute。User 補充「線上無 Remodel returnType 資料」進一步簡化,migration 確認不做。Spec checklist 完整輸出。

### 待處理事項

無。下一步:
1. `/write-spec docs/discussions/2026-05-05-merge-type-and-dto-ref-into-unified-picker.md`
2. `/audit-spec`
3. `/pickup`

### 注意事項

- TypeOrDtoPicker 的 light theme 必須驗收測試在 Remodel block 內(canvas 上),配色避免跟綠色 Remodel 背景衝突
- 刪 DtoPicker 後請 grep 全 src/ 確認無 import 殘留(IDE 通常會自動清,但 PR review 時要看)
- `excludeDtoId` 對 ReturnTypeEditor 不傳(Remodel 不會自我 nested);只 DtoFieldsEditor 傳
