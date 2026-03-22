# FE-010: Remodel Detail Panel + Bundle 連動 — 完成報告

> 完成時間：2026-03-22

---

## 實作內容

### 1. Detail Panel — RemodelPanel 元件

**檔案**：`src/components/DetailPanel/DetailPanel.tsx`

新增 `RemodelPanel` sub-component（行 687–1187），取代 FE-009 留下的 placeholder。

**功能項目：**

- **四格 InlineField 編輯**：AGGREGATE、PARAMETERS、QUERY NAME、SOURCE EVENTS，每格各有 label（單行）+ content（多行 textarea），`onBlur` 觸發 `updateRemodel`
- **Linked Bundles 管理**：
  - 顯示已連結 Bundle 的 chip 列表，左側顯示 `infoNote.label — commandNote.label`，右側有 × 刪除按鈕
  - 已刪除的 Bundle 以灰色斜體 "(Deleted Bundle)" 顯示，× 按鈕可清理孤兒連結
  - "+ Add Bundle" 按鈕展開下拉選單，包含搜尋框（filter by label）和所有未連結的 Bundle 選項；外部點擊自動關閉
- **Universe 狀態顯示**：
  - `isUniverseRemodel === true`：在頂部顯示 `∪ Universe Remodel` badge（紫色），在 Linked Bundles 下方顯示「∪ Universe Remodel / Crosses: X, Y, ...」紫色方塊
  - `isUniverseRemodel === false && linkedBundleIds.length > 0`：顯示「Single Aggregate: X」
  - `linkedBundleIds` 為空時不渲染 Universe 狀態區塊
- **Path / Phase / Notes**：完整複用現有模式（checkbox path toggle、phase input、notes textarea）

**狀態同步**：`useEffect([remodel.id])` 在切換 Remodel 時 reset 所有 local state，與 BundlePanel 模式一致。

---

### 2. Link Mode 自動連動 linkedBundleIds

**檔案**：`src/components/Board/Board.tsx`

擴充 `handleLinkTarget`（行 76–119）：

```
Link Mode 拉線邏輯：
  Remodel → Bundle: bundleId 加入 remodel.linkedBundleIds
  Bundle → Remodel: bundleId 加入 remodel.linkedBundleIds
  其他組合: 只建立視覺 Link，不修改 linkedBundleIds
```

**刪除 Link 不移除 linkedBundleIds**（設計決策）：linkedBundleIds 是 Remodel 的語意關聯，與視覺連線的生命週期分離，使用者需在 Detail Panel 明確操作。

---

## 驗收對照

| # | 驗收標準 | 狀態 |
|---|---------|------|
| 1 | 選中 Remodel 時，Detail Panel 顯示四格編輯、Linked Bundles 管理、Universe 狀態 | ✅ |
| 2 | Detail Panel 可以新增/移除 Bundle 連結（下拉搜尋 + × 按鈕） | ✅ |
| 3 | Universe 狀態根據 linked bundles 的 Aggregate 名稱即時變化 | ✅ |
| 4 | 畫布上用 Link Mode 從 Remodel 拉線到 Bundle（或反向），自動加入 linkedBundleIds | ✅ |
| 5 | 刪除 Link 不影響 linkedBundleIds | ✅ |
| 6 | 已刪除的 Bundle 在 Linked Bundles 列表中顯示為 "(Deleted Bundle)" 並可清理 | ✅ |

---

## 變更檔案

| 檔案 | 說明 |
|------|------|
| `src/components/DetailPanel/DetailPanel.tsx` | 新增 `RemodelPanel` 元件，取代 FE-009 placeholder；新增 `Remodel` 和 `isUniverseRemodel` import |
| `src/components/Board/Board.tsx` | 擴充 `handleLinkTarget` 加入 Remodel ↔ Bundle linkedBundleIds 自動連動邏輯 |
| `docs/PM-roadmap.md` | FE-010 標記為 ✅ 完成 |
| `docs/FE-010-remodel-detail-panel-summary.md` | 本報告 |

---

## 備注

- `DetailPanel.tsx` 已超過 300 行（目前約 1323 行）。技術債：未來可考慮將 `BundlePanel`、`NotePanel`、`RemodelPanel` 各自拆分為獨立檔案。
- Phase 5 bonus 項目（PhaseLane 加入 Remodel 的 phase 計算）未在此次任務實作，可作為後續 FE 任務追蹤。
