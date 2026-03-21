# Event Storming Tool — PM Roadmap

> 產出時間：2026-03-21
> 參考來源：`/Users/abnertsai/JiaBao/Mendesky/Toutou/docs/event-storming.html` 和 `event-storming-quoting.html`

---

## 分析背景

參考 Toutou/docs 下兩個 Event Storming HTML 實作，對照現有 EventStormingTool 找出 Gap 並規劃改善路線。

---

## 參考檔案分析摘要

### event-storming.html — 自由畫布模式
- Phase Lane（垂直虛線分隔階段）、卡片自由定位
- Path 篩選器（Happy Path / 例外流程），點選後非該 path 卡片 dim（opacity 0.12）
- Detail Panel（右側 400px 滑入）：FigJam 風格色塊群組 + Policies + ReadModels + Notes
- Minimap（右下角 180x110px）
- Value Object Panel（底部滑入）
- Fit All、JSON Export、鍵盤快捷鍵提示列

### event-storming-quoting.html — 結構化欄位模式（深色主題）
- Phase Column 佈局（每個 phase 是一欄，卡片垂直堆疊）
- Context Map（底部顯示跨 Bounded Context 事件映射）
- Path tab 含事件計數
- Header 統計徽章（N/M events）

---

## Gap 清單（現有工具缺少的功能）

| # | 功能 | 優先級 |
|---|------|--------|
| G1 | Path / Flow 篩選與標記 | Must |
| G2 | Detail Panel（側邊詳情面板） | Must |
| G3 | Phase / 階段分組 | Should |
| G4 | Policy 資料結構（block/warn） | Must |
| G5 | Context Map（跨 Context 關係） | Should |
| G6 | Minimap（小地圖） | Should |
| G7 | Value Object Panel | Could |
| G8 | 深色 / 淺色主題切換 | Could |
| G9 | 卡片徽章系統（Path Dots、Policy Shield） | Should |
| G10 | 事件中英文雙語命名 | Should |
| G11 | 拖曳時微旋轉動畫 | Could |
| G12 | Fit All（自適應縮放） | Must |
| G13 | JSON Export（含位置） | Could |
| G14 | 鍵盤快捷鍵提示列 | Could |
| G15 | Event 計數統計 | Could |

---

## 任務清單

### Phase 1 — 核心資訊承載能力（Must Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| BE-001 | 擴充資料模型（Policy、FlowPath、metadata 欄位） | backend-engineer | — | ✅ 完成 |
| UX-001 | Detail Panel 設計規格 | ui-ux-designer | — | ✅ 完成 |
| UX-002 | Path 篩選列與卡片徽章設計規格 | ui-ux-designer | — | ✅ 完成 |
| FE-001 | 實作 Detail Panel 元件 | frontend-engineer | UX-001, BE-001 | ✅ 完成 |
| FE-002 | 實作 Path/Flow 篩選系統 | frontend-engineer | BE-001, UX-002 | ✅ 完成 |

### Phase 2 — 導航體驗（Should Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| FE-003 | 實作 Fit All（自適應縮放） | frontend-engineer | — | ✅ 完成 |
| FE-005 | 實作 Minimap（小地圖導航） | frontend-engineer | — | ✅ 完成 |
| FE-004 | 實作 Phase Lane（階段泳道） | frontend-engineer | BE-001 | 待開始 |

### Phase 3 — AI 協作強化（Should Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| BE-002 | MCP 工具擴充（Path/Phase/Policy 管理） | backend-engineer | BE-001 | ✅ 完成 |

### Phase 4 — Polish（Could Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| FE-006 | 拖曳微旋轉動畫效果 | frontend-engineer | — | 待開始 |
| FE-007 | 鍵盤快捷鍵與底部提示列 | frontend-engineer | — | 待開始 |
| FE-008 | Event 計數統計顯示 | frontend-engineer | — | 待開始 |

---

## 任務規格

### BE-001（✅ 完成）
擴充 `src/types/elements.ts`、`src/types/board.ts`、`src/store/boardStore.ts`、`mcp-server/src/index.ts`：
- 新增 `Policy`（rule + severity: block/warn）和 `FlowPath`（id/name/color/description）interface
- `StickyNote` 加 paths、phase、notes；`Bundle` 加 policies、paths、phase、trigger、uiDescription、readModels、notes
- `Board` 加 `flowPaths: FlowPath[]`；BoardStore 加 addFlowPath / updateFlowPath / deleteFlowPath
- Zustand persist v4 → v5，migrate 補齊舊資料
- MCP 新增 `es_add_flow_path` / `es_delete_flow_path`；擴充 `es_add_bundle` / `es_update_bundle` / `es_add_note` / `es_update_note`

### FE-003
實作 Fit All 功能，計算所有元素 bounding box 並調整 zoom/pan 至全部可見，加 `F` 快捷鍵與 Sidebar 按鈕。

### FE-004
Phase Lane：在畫布底層繪製垂直虛線 + 頂部 label，根據元素 phase 欄位動態計算，不限制卡片拖拉自由度（方案 A）。

### FE-005
Minimap（180x110px）：位於右下角，顯示所有元素位置的色點 + 當前 viewport 框（1.5px 藍色邊框），即時同步 pan/zoom。

### BE-002
MCP 工具新增：`es_add_flow_path`（已實作於 BE-001）、`es_set_event_paths`、`es_set_event_phase`。
驗證 `es_add_bundle` / `es_update_bundle` 支援 policies、paths、phase、trigger、readModels、notes（已於 BE-001 完成，BE-002 可驗證並補充缺漏）。

### FE-006
拖曳時 `transform: scale(1.05) rotate(1.5deg)` + enhanced box-shadow，放下時平滑回復。

### FE-007
快捷鍵：`F`（Fit All）、`Esc`（關閉 Detail Panel）、`Delete/Backspace`（刪除選取元素）。
底部 hint bar（fixed 定位，小字顯示快捷鍵列表，input focus 時不觸發）。

### FE-008
Board header 顯示 `{visible} / {total} events | {bundles} bundles`，切換 path 篩選時即時更新。

---

## 依賴關係圖

```
BE-001 (完成)
  ├── FE-001 (完成) ← UX-001 (完成)
  ├── FE-002 (完成) ← UX-002 (完成)
  ├── FE-004
  └── BE-002

獨立可並行：
  FE-003
  FE-005
  FE-006
  FE-007
  FE-008
```
