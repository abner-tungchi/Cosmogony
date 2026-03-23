# FE-015: Dto StickyNote + Remodel 連動

> 完成日期：2026-03-23

## 實作摘要

新增 `Dto` StickyNote 元素類型，讓使用者可以描述 DTO（Data Transfer Object）的物件結構，並與 Remodel 建立 `linkedDtoIds` 關聯。

---

## 變更清單

### 新增 / 修改

#### `src/constants/elementTypes.ts`
- 在 `ELEMENT_CONFIGS` 中新增 `Dto` 配置
  - 顏色：`#86efac`（淺綠）、文字色：`#14532d`（深綠）
  - 預設尺寸：`200x160`（比一般 StickyNote 更大，容納多行欄位）
- 在 `ELEMENT_TYPE_LIST` 尾端加入 `'Dto'`

#### `src/components/StickyNote/StickyNote.tsx`
- 新增 `DtoNoteBody` 子元件：解析 `label` 為兩部分
  - 上方：第一行作為 DTO 名稱（粗體，帶底線分隔）
  - 下方：其餘行作為欄位列表（monospace 字型，pre-wrap，可捲動）
- Dto 卡片不顯示類型標籤（"DTO" badge 隱藏）
- Dto 的 `handleKeyDown` 特化：`Enter` 插入換行，`Ctrl+Enter` 儲存，`Escape` 取消

#### `src/components/Sidebar/SidebarPalette.tsx`
- `iconMap` 新增 `Dto: '{}'`
- Dto 按鈕透過 `ELEMENT_TYPE_LIST` 自動出現在 Elements section

#### `src/components/Board/Board.tsx`
- 放置 Dto note 時使用預設 label：`[DtoName]\n----------\nfield: Type`
- `handleLinkTarget` 新增 Remodel ↔ Dto note 自動連動邏輯：
  - `remodel → Dto note` 或 `Dto note → remodel` 時，把 `dtoId` 加入 `remodel.linkedDtoIds`
  - 防重複加入
- `useCallback` 依賴加入 `activeBoard.notes`

#### `src/components/DetailPanel/DetailPanel.tsx`
- `RemodelPanelProps` 新增 `allNotes: StickyNote[]`
- `RemodelPanel` 新增 Linked DTOs 狀態（`showDtoDropdown`、`dtoSearchQuery`、`dtosDropdownRef`）
- 新增 DTO 連結操作：`removeDtoLink`、`addDtoLink`
- 計算可用 DTO 列表：`allDtoNotes`、`availableDtoNotes`、`filteredAvailableDtos`
- 新增「LINKED DTOS」UI 區塊（位於 Universe Status 下方，Paths divider 之前）
  - 已連結 DTO chips（顯示 label 第一行，右側 × 刪除按鈕）
  - 搜尋下拉選單（過濾 board 上所有 type='Dto' 的 StickyNote）
- 主面板 `RemodelPanel` 呼叫加入 `allNotes={activeBoard.notes}`

#### `docs/PM-roadmap.md`
- FE-015 狀態更新為 ✅ 完成

---

## 技術決策

### label-only 模式
Dto 的所有內容（名稱 + 欄位）都存在 `label` 欄位，使用換行符分隔，而非拆分到 `label` + `notes`。
- 原因：`StickyNote` interface 不需要修改；inline 編輯 textarea 直接操作整個 `label`，邏輯簡單。
- `DtoNoteBody` 在渲染時做 client-side 解析，不影響資料層。

### Dto 鍵盤行為
Dto 是多行格式，因此 `Enter` 不觸發儲存（允許輸入換行），改用 `Ctrl+Enter` 儲存。
這與其他 StickyNote 類型（`Enter` 儲存）不同，但符合 Dto 多行編輯的使用需求。

---

## 已知限制

- Dto label 格式（`[Name]\n---\nfield: Type`）為純文字約定，不做結構化驗證
- `SidebarPalette` 中 Dto 按鈕渲染顏色 swatch（而非 `{}` 文字 icon），因為 `toolBtn` 在有 `color` 時優先渲染 swatch。這與其他 element type 一致，視覺效果良好。
