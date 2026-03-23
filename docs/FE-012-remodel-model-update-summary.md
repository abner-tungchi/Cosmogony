# FE-012 Remodel 資料模型修訂 — 完成摘要

完成日期：2026-03-23
負責：frontend-engineer

---

## 變更內容

### 1. `src/types/elements.ts`

- `ElementType` 新增 `'Dto'`
- `Remodel` interface 修改：
  - `sourceEventNote` → `returnTypeNote`（重命名，語意改為「回傳型別」）
  - 新增 `linkedDtoIds: string[]`（關聯的 Dto StickyNote ID 列表）
  - 新增 `sourceEventsExpanded?: boolean`（Source Events 區域展開狀態，undefined 等同 true）
  - `collapsed?: boolean` 已存在，無需新增

### 2. `src/store/boardStore.ts`

- persist version `6` → `7`
- 新增 `version < 7` migration 區塊：
  - 舊 Remodel 的 `sourceEventNote` 欄位遷移到 `returnTypeNote`（內容保留）
  - 補 `linkedDtoIds: []`（若缺少）
  - `sourceEventsExpanded` 為 optional，undefined === true by convention，不需補值

### 3. `src/components/Board/Board.tsx`

- Remodel 建立時：`sourceEventNote` 改為 `returnTypeNote`，補 `linkedDtoIds: []`
- DragOverlay 中 Remodel 預覽：`sourceEventNote.label` 改為 `returnTypeNote.label`

### 4. `src/components/Remodel/Remodel.tsx`

- `saveSub` 的 key union type 更新：`'sourceEventNote'` → `'returnTypeNote'`
- 第四格 SubNote 的 `label`/`content`/`onSave` 引用改為 `returnTypeNote`
- 注解更新：`Source Event` → `Return Type`

### 5. `src/components/DetailPanel/DetailPanel.tsx`

- `RemodelPanel` 中所有 `sourceEvent*` 狀態變數改為 `returnType*`
- `useEffect` sync 邏輯更新
- `saveSourceEventNote` callback 改為 `saveReturnTypeNote`
- JSX section 標題從 "SOURCE EVENTS" 改為 "RETURN TYPE"
- placeholder 文字更新

### 6. `src/utils/markdownExporter.ts`

- Remodel markdown 輸出：`Source Events` → `Return Type`，引用欄位改為 `returnTypeNote`

### 7. `mcp-server/src/index.ts`

- `Remodel` interface：`sourceEventNote` → `returnTypeNote`，新增 `linkedDtoIds`、`sourceEventsExpanded`
- `migrateProject`：加入 `sourceEventNote` → `returnTypeNote` 轉換 + `linkedDtoIds` 補值
- `es_add_remodel` schema：`sourceEventLabel`/`sourceEventContent` → `returnTypeLabel`/`returnTypeContent`，新增 `linkedDtoIds`
- `es_update_remodel` schema：同上，新增 `linkedDtoIds`、`sourceEventsExpanded`
- `es_get_board` 回傳：Remodel 物件新增 `_sourceEvents` computed 欄位（從 `linkedBundleIds` 解析出 event label 列表）

---

## 注意事項

- `sourceEventNote` 字串仍出現在 migration 邏輯中（作為舊欄位名稱的字串判斷），這是正確的行為
- `mcp-server/data/project.json` 中的既有 Remodel 資料會在下次 MCP server 啟動時透過 `migrateProject` 自動轉換
- FE-013（視覺更新）、FE-014（Source Events 區域）、FE-015（Dto 元素）可基於此修訂繼續開發
