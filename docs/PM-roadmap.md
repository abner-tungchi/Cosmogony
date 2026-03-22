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
| FE-004 | 實作 Phase Lane（階段泳道） | frontend-engineer | BE-001 | ✅ 完成 |

### Phase 3 — AI 協作強化（Should Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| BE-002 | MCP 工具擴充（Path/Phase/Policy 管理） | backend-engineer | BE-001 | ✅ 完成 |

### Phase 4 — Polish（Could Have）

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| FE-006 | 拖曳微旋轉動畫效果 | frontend-engineer | — | ✅ 完成 |
| FE-007 | 鍵盤快捷鍵與底部提示列 | frontend-engineer | — | ✅ 完成 |
| FE-008 | Event 計數統計顯示 | frontend-engineer | — | ✅ 完成 |

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

### Phase 5 — Remodel & Actor 篩選（Must Have）

> 產出時間：2026-03-22
> 背景：Event Storming 需要同時表達 Write-side（Bundle）和 Read-side（Remodel）。Remodel 是 Bundle 的鏡像結構，用於定義 Event Sourcing 架構下的 Read Model 投影。同時新增 Actor 篩選功能，讓使用者可以按角色切換 FlowPath 視角。

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| FE-009 | Remodel 核心功能（資料模型 + 元件 + 畫布整合） | frontend-engineer | — | ✅ 完成 |
| FE-010 | Remodel Detail Panel + Bundle 連動 | frontend-engineer | FE-009 | ✅ 完成 |
| FE-011 | Actor PathBar 篩選器 | frontend-engineer | — | ✅ 完成 |
| BE-003 | MCP 工具擴充（Remodel CRUD） | backend-engineer | FE-009 | ✅ 完成 |

---

### FE-009：Remodel 核心功能（資料模型 + 元件 + 畫布整合）

**依賴**：無
**負責**：frontend-engineer
**目的**：在畫布上新增 Remodel 元素，作為 Read-side 的四格卡片（與 Bundle 平行），讓 Domain Expert 可以在 Event Storming 中定義 Read Model 投影。

#### 1. 資料模型變更

**1-1. 新增 `Remodel` interface — `src/types/elements.ts`**

```typescript
export interface Remodel {
  id: string;
  position: { x: number; y: number };

  // 四格便條紙（複用 BundleSubNote，各格語意不同）
  aggregateNote: BundleSubNote;     // 上方：Aggregate（讀取視角）
  parameterNote: BundleSubNote;     // 左下：查詢參數
  queryNote: BundleSubNote;         // 中下：Query 名稱（慣例 "Get" + 名稱）
  sourceEventNote: BundleSubNote;   // 右下：Event Source 描述

  // Bundle 連動
  linkedBundleIds: string[];        // 連結到哪些 Bundle（by bundle.id）

  // 元資料（與 Bundle 一致）
  zIndex: number;
  collapsed?: boolean;
  paths?: string[];                 // FlowPath 歸屬
  phase?: string;                   // Phase Lane 歸屬
  notes?: string;                   // 自由筆記
  createdAt: string;
  updatedAt: string;
}
```

**設計決策：`isUniverse` 不存在資料中，由 UI 層即時計算。**
原因：Universe 狀態取決於 linkedBundleIds 對應的 Bundle 的 infoNote.label（Aggregate Root 名稱）。如果使用者修改了 Bundle 的 Aggregate 名稱，Remodel 的 Universe 狀態必須自動跟著變。存成 stored flag 需要額外的同步邏輯，computed property 更簡潔且不會不一致。

**1-2. `Board` interface 加 `remodels` — `src/types/board.ts`**

```typescript
export interface Board {
  id: string;
  name: string;
  notes: StickyNote[];
  bundles: Bundle[];
  remodels: Remodel[];    // ← 新增
  links: Link[];
  flowPaths: FlowPath[];
  createdAt: string;
  updatedAt: string;
}
```

**1-3. `Link` interface 擴充 fromType / toType — `src/types/elements.ts`**

```typescript
export interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'bundle' | 'remodel';   // ← 加 'remodel'
  toType: 'note' | 'bundle' | 'remodel';      // ← 加 'remodel'
  label?: string;
  createdAt: string;
}
```

**1-4. `BoardStore` interface 加 Remodel actions — `src/types/board.ts`**

在 `BoardStore` 的 active board operations 區塊加：

```typescript
addRemodel: (remodel: Remodel) => void;
updateRemodel: (id: string, updates: Partial<Remodel>) => void;
deleteRemodel: (id: string) => void;
```

**1-5. `boardStore.ts` 實作 + persist migration v5 → v6**

- 實作 `addRemodel`、`updateRemodel`、`deleteRemodel`，邏輯與 addBundle/updateBundle/deleteBundle 完全對稱（操作 `activeBoard().remodels`）
- persist version 改為 `6`
- migrate function 新增 `if (version < 6)` 區塊：為所有 board 補 `remodels: []`（與 v4→v5 補 flowPaths 同理）

**1-6. `UIState` / `UIStore` 擴充 — `src/types/board.ts` + `src/store/uiStore.ts`**

```typescript
// UIStore 的 selectedElementType 擴充
selectedElementType: 'bundle' | 'note' | 'remodel' | null;  // ← 加 'remodel'

// setSelectedElement 的 type 參數同步擴充
setSelectedElement: (id: string | null, type: 'bundle' | 'note' | 'remodel' | null) => void;

// linkFromType 擴充
linkFromType: 'note' | 'bundle' | 'remodel' | null;  // ← 加 'remodel'
setLinkFrom: (id: string | null, type: 'note' | 'bundle' | 'remodel' | null) => void;
```

#### 2. isUniverseRemodel helper function

**位置**：`src/utils/remodelUtils.ts`（新檔案）

```typescript
import type { Remodel, Bundle } from '../types/elements';

/**
 * 判斷一個 Remodel 是否為 Universe 類型。
 * 規則：linkedBundleIds 對應的 Bundle 中，若涉及 > 1 個不同的 Aggregate Root
 *       （以 bundle.infoNote.label 去空白後轉小寫比對），則為 Universe。
 *
 * 邊界情況：
 * - linkedBundleIds 為空 → false
 * - linkedBundleIds 中有 ID 找不到對應 Bundle（已刪除）→ 忽略該 ID
 * - 所有連結 Bundle 的 infoNote.label 都是空字串 → 視為同一個（false）
 */
export function isUniverseRemodel(remodel: Remodel, bundles: Bundle[]): boolean {
  const linkedBundles = bundles.filter(b => remodel.linkedBundleIds.includes(b.id));
  const uniqueAggregates = new Set(
    linkedBundles
      .map(b => b.infoNote.label.trim().toLowerCase())
      .filter(label => label.length > 0)
  );
  return uniqueAggregates.size > 1;
}
```

#### 3. Remodel 畫布元件

**位置**：`src/components/Remodel/Remodel.tsx`（新檔案）

**結構**：與 `src/components/Bundle/Bundle.tsx` 完全對稱。複製 Bundle.tsx 並修改以下部分：

**3-1. 配色常數**

| 格子 | Bundle 配色 | Remodel 配色 | CSS 色碼 |
|------|-----------|-------------|---------|
| 上方（Aggregate） | 黃 #fef9c3 | 淺紫 | `#e9d5ff` |
| 左下（Parameter） | 綠 #dcfce7 | 淡青 | `#cffafe` |
| 中下（Query） | 藍 #dbeafe | 灰藍 | `#bfdbfe` |
| 右下（Source Event） | 橘 #fed7aa | 薰衣草 | `#ede9fe` |

文字色全部用 `#1e293b`（與 Bundle 一致）。

**3-2. 欄位對應**

| SubNote 位置 | Bundle 讀取欄位 | Remodel 讀取欄位 |
|-------------|---------------|-----------------|
| 上方 | `infoNote` | `aggregateNote` |
| 左下 | `entityNote` | `parameterNote` |
| 中下 | `commandNote` | `queryNote` |
| 右下 | `eventNote` | `sourceEventNote` |

**3-3. Universe badge**

在卡片右上角（與 collapsed/expand icon 同排），根據 `isUniverseRemodel(remodel, activeBoard.bundles)` 的結果，conditionally 渲染一個 badge：

```
樣式：
  背景: #7c3aed（紫色）
  文字: white, bold, 10px
  內容: "∪"
  圓角: 50%
  大小: 20x20px, flex center
  position: absolute, top: 4px, right: 4px（若有 collapsed icon 則往左偏移）
  title（tooltip）: "Universe Remodel — crosses multiple Aggregates"
```

僅在 `isUniverseRemodel()` 回傳 `true` 時顯示。

**3-4. dnd-kit 整合**

- `useDraggable` 的 id prefix 用 `remodel-`（類比 Bundle 用 `bundle-`）
- 確保 `handleDragEnd`（Board.tsx）支援 `remodel-` prefix（見下方第 6 點）

**3-5. Path 篩選 dim 效果**

與 Bundle 完全一致：當 `activePath !== null` 且 `!remodel.paths?.includes(activePath)` 時，整個 Remodel 卡片套用 `opacity: 0.12`。

**3-6. 點擊選取**

點擊 Remodel 卡片時呼叫 `setSelectedElement(remodel.id, 'remodel')`，讓 Detail Panel 可以偵測並顯示 Remodel 詳情（FE-010 處理 Detail Panel 渲染）。

**3-7. Link Mode 支援**

在 Link Mode 下點擊 Remodel 卡片時，呼叫 `handleLinkTarget(remodel.id, 'remodel')`（與 Bundle/Note 的行為一致）。

#### 4. Sidebar 調整

**檔案**：`src/components/Sidebar/SidebarPalette.tsx`

**4-1. 新增 Remodel 放置工具**

在 Bundle 按鈕下方，新增一個 "Remodel (4-in-1)" 按鈕，行為與 Bundle 按鈕對稱：
- 點擊後 `setActiveToolType('Remodel')`
- 畫布點擊時根據 `activeToolType === 'Remodel'` 建立新的 Remodel（見下方第 6 點）

```
樣式：
  border: 2px solid #334155（與 Bundle 一致）
  icon: "⊟"（區別於 Bundle 的 "⊞"）
  label: "Remodel (4-in-1)"
  active 狀態: border #3b82f6, bg rgba(59,130,246,0.15)
```

**4-2. 移除 ReadModel StickyNote 新建入口**

從 `ELEMENT_TYPE_LIST` 渲染的按鈕中移除 `ReadModel` 類型。有兩種做法，選較不侵入的：

- **方案 A（推薦）**：在 SidebarPalette 的 map 中 filter 掉 `ReadModel`：
  ```typescript
  {ELEMENT_TYPE_LIST.filter(t => t !== 'ReadModel').map((type: ElementType) => { ... })}
  ```
- 不修改 `ELEMENT_TYPE_LIST` 本身和 `ElementType`，保持向後相容。已存在的 ReadModel StickyNote 仍可正常顯示和編輯。

#### 5. BoardCanvas 整合

**檔案**：`src/components/Board/BoardCanvas.tsx`

在 BoardCanvas 中渲染 Remodel 元件列表（與 bundles 的渲染方式對稱）：

```tsx
{activeBoard.remodels.map((remodel) => (
  <RemodelComponent
    key={remodel.id}
    remodel={remodel}
    flowPaths={activeBoard.flowPaths}
    onLinkTarget={handleLinkTarget}
  />
))}
```

確保 Remodel 的 zIndex 和 Bundle/Note 在同一個空間中排序（不需要特殊處理，現有機制已經用 zIndex 值排序）。

#### 6. Board.tsx 拖動邏輯整合

**檔案**：`src/components/Board/Board.tsx`

**6-1. handleDragStart 擴充**

新增 `draggedRemodelStart` ref（與 `draggedBundleStart` 對稱）：

```typescript
const draggedRemodelStart = useRef<{ id: string; x: number; y: number } | null>(null);
```

在 `handleDragStart` 中加入 `remodel-` prefix 判斷：

```typescript
if (id.startsWith('remodel-')) {
  const remodelId = id.replace('remodel-', '');
  const remodel = activeBoard.remodels.find(r => r.id === remodelId);
  if (remodel) {
    draggedRemodelStart.current = { id: remodelId, x: remodel.position.x, y: remodel.position.y };
  }
}
```

**6-2. handleDragEnd 擴充**

在 `bundle-` 判斷之後、note 處理之前，加入 `remodel-` 判斷：

```typescript
if (id.startsWith('remodel-')) {
  const start = draggedRemodelStart.current;
  if (start) {
    updateRemodel(start.id, {
      position: { x: start.x + scaledDx, y: start.y + scaledDy },
    });
    draggedRemodelStart.current = null;
  }
  return;
}
```

**6-3. 畫布點擊建立 Remodel**

在 `handleCanvasMouseDown` 的 `activeToolType` 判斷中，加入 `Remodel` case：

```typescript
if (activeToolType === 'Remodel') {
  const newRemodel: Remodel = {
    id: uuidv4(),
    position: { x: worldX - (SUB_W * 3 + GAP * 2) / 2, y: worldY - (SUB_H * 2 + GAP) / 2 },
    aggregateNote: { label: '', content: '' },
    parameterNote: { label: '', content: '' },
    queryNote: { label: '', content: '' },
    sourceEventNote: { label: '', content: '' },
    linkedBundleIds: [],
    zIndex: 10 + activeBoard.remodels.length + activeBoard.bundles.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addRemodel(newRemodel);
  setActiveToolType(null);
  return;
}
```

其中 `SUB_W`、`SUB_H`、`GAP` 使用和 Bundle 相同的常數（160、120、8）。

**6-4. activeDragId overlay（DragOverlay）**

新增 activeRemodel 的判斷（與 activeBundle 對稱），在 `<DragOverlay>` 中渲染 Remodel 的半透明拖動預覽。

**6-5. useBoardStore 解構**

從 `useBoardStore` 追加解構 `addRemodel`、`updateRemodel`。

#### 7. 其他整合點

**7-1. Minimap**（`src/components/Board/Minimap.tsx`）

Minimap 渲染 bundles 的位置，需同步渲染 remodels。Remodel 在 Minimap 上的顏色用 `#a78bfa`（紫色系，區別於 Bundle）。

**7-2. Fit All**（`src/store/uiStore.ts`）

`fitAll` 的 params 需包含 remodels，bounding box 計算要涵蓋 Remodel 的位置。由於 Remodel 和 Bundle 的尺寸相同（496x248），可以共用 `BUNDLE_WIDTH`/`BUNDLE_HEIGHT` 常數。

```typescript
interface FitAllParams {
  notes: StickyNote[];
  bundles: Bundle[];
  remodels: Remodel[];  // ← 新增
  viewportWidth: number;
  viewportHeight: number;
}
```

所有呼叫 `fitAll` 的地方需傳入 `remodels: activeBoard.remodels`。

**7-3. Markdown Export**（`src/utils/markdownExporter.ts`）

Export 需包含 Remodel 區塊，格式：

```markdown
### Remodels

#### GetOrderList
- **Aggregate**: Order
- **Parameters**: orderId, dateRange
- **Query**: GetOrderList
- **Source Events**: OrderCreated, OrderUpdated
- **Linked Bundles**: CreateOrder, UpdateOrder
- **Universe**: Yes / No
```

**7-4. apiSync**（`src/utils/apiSync.ts`）

POST `/api/board` 的 payload 已經是整個 project state，自動包含 remodels，不需額外修改。但需確認 SSE 接收端能正確處理 remodels 欄位。

#### 驗收標準

1. 畫布上可以透過 Sidebar 新增 Remodel 卡片，呈現四格冷色系配色
2. Remodel 可以拖動、double-click 編輯各格文字
3. Path 篩選生效時，Remodel 和 Bundle/Note 一樣被 dim
4. Sidebar 不再顯示 ReadModel StickyNote 新建按鈕，改為 Remodel (4-in-1)
5. 已存在的 ReadModel StickyNote 仍可正常顯示和操作
6. persist migration v5→v6 正確執行：舊資料載入時所有 board 補 `remodels: []`
7. Minimap 顯示 Remodel 位置（紫色點）
8. Fit All 計算包含 Remodel
9. Markdown Export 包含 Remodel 資訊

---

### FE-010：Remodel Detail Panel + Bundle 連動

**依賴**：FE-009
**負責**：frontend-engineer
**目的**：讓使用者可以在 Detail Panel 中編輯 Remodel 詳情，並透過兩種方式建立 Remodel 與 Bundle 的連動關係。

#### 1. Detail Panel 支援 Remodel

**檔案**：`src/components/DetailPanel/DetailPanel.tsx`

當 `selectedElementType === 'remodel'` 時，Detail Panel 渲染 Remodel 編輯介面。

**1-1. 面板結構**

```
┌──────────────────────────────────┐
│ REMODEL                          │  ← SectionLabel
│                                  │
│ AGGREGATE                        │  ← InlineField (label + content)
│ [________________________]       │
│ [________________________]       │
│                                  │
│ PARAMETERS                       │
│ [________________________]       │
│ [________________________]       │
│                                  │
│ QUERY NAME                       │
│ [________________________]       │
│ [________________________]       │
│                                  │
│ SOURCE EVENTS                    │
│ [________________________]       │
│ [________________________]       │
│                                  │
│ ─────────────────────────────── │
│ LINKED BUNDLES                   │  ← SectionLabel
│                                  │
│  ┌─ Order ──────────── [×] ─┐   │  ← 已連結的 Bundle chip
│  └──────────────────────────┘   │
│  ┌─ Payment ────────── [×] ─┐   │
│  └──────────────────────────┘   │
│                                  │
│  [+ Add Bundle ▾]               │  ← 下拉搜尋
│                                  │
│ ─────────────────────────────── │
│ UNIVERSE STATUS                  │  ← 條件渲染
│  🟣 Universe Remodel             │  ← 當 isUniverse 為 true
│  Crosses: Order, Payment         │  ← 列出涉及的 Aggregate 名稱
│                                  │
│ ─────────────────────────────── │
│ PATH                             │  ← 複用現有 Path 編輯 UI
│ PHASE                            │
│ NOTES                            │
└──────────────────────────────────┘
```

**1-2. 四格編輯**

複用 Detail Panel 現有的 `InlineField` 元件。每個格子有 label（單行 input）和 content（多行 textarea）。

各格對應的欄位與 placeholder：

| 區塊標題 | 欄位 | label placeholder | content placeholder |
|---------|------|-------------------|---------------------|
| AGGREGATE | `aggregateNote` | "Aggregate name" | "Description..." |
| PARAMETERS | `parameterNote` | "Parameter name" | "Parameter details..." |
| QUERY NAME | `queryNote` | "e.g. GetOrderList" | "Query description..." |
| SOURCE EVENTS | `sourceEventNote` | "Event sources" | "Which events compose this read model..." |

每個 `InlineField` 的 `onBlur` 呼叫 `updateRemodel(id, { [field]: { label, content } })`。

**1-3. Linked Bundles 管理區塊**

**已連結的 Bundle 列表：**

遍歷 `remodel.linkedBundleIds`，對每個 ID 從 `activeBoard.bundles` 找到對應 Bundle，顯示為 chip：

```
樣式：
  背景: rgba(255,255,255,0.06)
  border: 1px solid rgba(255,255,255,0.1)
  border-radius: 6px
  padding: 6px 10px
  display: flex, justify-content: space-between, align-items: center
  左側文字: bundle.infoNote.label || bundle.commandNote.label || "(Unnamed Bundle)"
  右側: × 按鈕（刪除連結）
```

點擊 × 按鈕時：
```typescript
updateRemodel(remodel.id, {
  linkedBundleIds: remodel.linkedBundleIds.filter(id => id !== bundleId)
});
```

如果 `linkedBundleIds` 中的某個 ID 在 `activeBoard.bundles` 中找不到（Bundle 已被刪除），顯示為灰色斜體 "(Deleted Bundle)" 並自動提供清理按鈕。

**新增連結的下拉選單：**

「+ Add Bundle」按鈕，點擊後展開一個下拉選單：
- 列出 `activeBoard.bundles` 中**尚未被連結**的 Bundle（排除已在 `linkedBundleIds` 中的）
- 每個選項顯示格式：`[infoNote.label] — [commandNote.label]`（Aggregate — Command）
- 支援文字搜尋篩選（filter by label）
- 選中後呼叫：
  ```typescript
  updateRemodel(remodel.id, {
    linkedBundleIds: [...remodel.linkedBundleIds, selectedBundleId]
  });
  ```
- 下拉選單外點擊時關閉

```
下拉選單樣式（與 PathModal 風格一致）：
  背景: #1e293b
  border: 1px solid rgba(255,255,255,0.1)
  border-radius: 8px
  box-shadow: 0 8px 24px rgba(0,0,0,0.3)
  max-height: 200px, overflow-y: auto
  搜尋框在頂部: input with placeholder "Search bundles..."
  每個選項: padding 8px 12px, hover background rgba(255,255,255,0.06)
```

**1-4. Universe 狀態顯示**

在 Linked Bundles 區塊下方，conditions 渲染：

```typescript
const universe = isUniverseRemodel(remodel, activeBoard.bundles);
const linkedBundles = activeBoard.bundles.filter(b => remodel.linkedBundleIds.includes(b.id));
const aggregateNames = [...new Set(
  linkedBundles.map(b => b.infoNote.label.trim()).filter(l => l.length > 0)
)];
```

當 `universe === true` 時顯示：

```
樣式：
  背景: rgba(124,58,237,0.1)（紫色半透明）
  border: 1px solid rgba(124,58,237,0.3)
  border-radius: 6px
  padding: 8px 10px
  第一行: "∪ Universe Remodel"（#a78bfa, bold, 12px）
  第二行: "Crosses: Order, Payment, ..."（#94a3b8, 11px）
          — aggregateNames.join(', ')
```

當 `universe === false` 且 `linkedBundleIds.length > 0` 時顯示：

```
  "Single Aggregate: {aggregateNames[0]}"（#94a3b8, 11px）
```

當 `linkedBundleIds.length === 0` 時不渲染此區塊。

**1-5. Path / Phase / Notes**

複用 Detail Panel 現有的 Path 多選、Phase 下拉、Notes textarea 邏輯。
操作對象從 Bundle/Note 改為 Remodel（呼叫 `updateRemodel` 而非 `updateBundle`/`updateNote`）。

#### 2. Link Mode 支援：Remodel ↔ Bundle 自動連動

**檔案**：`src/components/Board/Board.tsx`

**2-1. handleLinkTarget 擴充邏輯**

在現有的 `handleLinkTarget` 回呼中，增加特殊判斷：

**當 Link Mode 連線的兩端分別是 Remodel 和 Bundle 時，除了建立普通 Link 之外，還要自動更新 `linkedBundleIds`。**

具體邏輯：

```typescript
const handleLinkTarget = useCallback((targetId: string, targetType: 'note' | 'bundle' | 'remodel') => {
  if (!linkFromId || !linkFromType) {
    setLinkFrom(targetId, targetType);
  } else {
    if (targetId === linkFromId) {
      setLinkFrom(null, null);
      return;
    }

    // 建立普通 Link（所有情況都做）
    addLink({
      id: uuidv4(),
      fromId: linkFromId,
      toId: targetId,
      fromType: linkFromType,
      toType: targetType,
      createdAt: new Date().toISOString(),
    });

    // 特殊處理：Remodel ↔ Bundle 自動連動 linkedBundleIds
    let remodelId: string | null = null;
    let bundleId: string | null = null;

    if (linkFromType === 'remodel' && targetType === 'bundle') {
      remodelId = linkFromId;
      bundleId = targetId;
    } else if (linkFromType === 'bundle' && targetType === 'remodel') {
      remodelId = targetId;
      bundleId = linkFromId;
    }

    if (remodelId && bundleId) {
      const remodel = activeBoard.remodels.find(r => r.id === remodelId);
      if (remodel && !remodel.linkedBundleIds.includes(bundleId)) {
        updateRemodel(remodelId, {
          linkedBundleIds: [...remodel.linkedBundleIds, bundleId],
        });
      }
    }

    setLinkFrom(null, null);
    setLinkingMode(false);
  }
}, [linkFromId, linkFromType, addLink, setLinkFrom, setLinkingMode, activeBoard.remodels, updateRemodel]);
```

**2-2. 反向清理（刪除 Link 時）**

當使用者刪除一條 Remodel ↔ Bundle 之間的 Link 時，**不自動從 linkedBundleIds 移除**。

原因：linkedBundleIds 是 Remodel 的核心語意（表示「這個 Read Model 需要這些 Aggregate 的資料」），Link 只是視覺連線。使用者可能想刪掉畫布上的箭頭但保留語意關聯。移除 linkedBundleIds 應該在 Detail Panel 中明確操作。

#### 驗收標準

1. 選中 Remodel 時，Detail Panel 顯示四格編輯、Linked Bundles 管理、Universe 狀態
2. Detail Panel 可以新增/移除 Bundle 連結（下拉搜尋 + × 按鈕）
3. Universe 狀態根據 linked bundles 的 Aggregate 名稱即時變化
4. 畫布上用 Link Mode 從 Remodel 拉線到 Bundle（或反向），自動加入 linkedBundleIds
5. 刪除 Link 不影響 linkedBundleIds
6. 已刪除的 Bundle 在 Linked Bundles 列表中顯示為 "(Deleted Bundle)" 並可清理

---

### FE-011：Actor PathBar 篩選器

**依賴**：無（與 FE-009/FE-010 獨立，可平行開發）
**負責**：frontend-engineer
**目的**：讓使用者可以按 Actor 篩選 FlowPath，快速切換「誰的視角」來檢視 Event Storming 圖。

#### 1. 資料模型變更

**1-1. FlowPath 加 `actorId` — `src/types/elements.ts`**

```typescript
export interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
  actorId?: string;      // ← 新增：關聯到哪個 Actor（StickyNote.id where type='Actor'）
}
```

**1-2. PathModal 加 Actor 選擇**

在 `src/components/PathBar/PathModal.tsx` 的新增/編輯表單中，加一個 Actor 下拉選單：

- 選項來源：`activeBoard.notes.filter(n => n.type === 'Actor')`
- 顯示格式：Actor 的 `label`
- 有一個 "(No Actor)" 選項，選中時 `actorId` 為 `undefined`
- 編輯現有 FlowPath 時，下拉選單預選當前的 `actorId`

#### 2. PathBar UI 變更

**檔案**：`src/components/PathBar/PathBar.tsx`

**2-1. Actor 篩選下拉選單**

在 PathBar 最左側的 "PATH" label 右邊（"All" tab 左邊），新增一個 Actor 下拉選單。

```
PathBar 佈局：
  PATH | [Actor: All ▾] | All | Path1 | Path2 | ... | + New Path
```

下拉選單：
- 選項列表：
  - "All Actors"（預設值）
  - 各個 Actor（從 `activeBoard.notes.filter(n => n.type === 'Actor')` 取得）
- 顯示格式：Actor icon（👤）+ label
- 選中 Actor 後，PathBar 中的 FlowPath tab 只顯示：
  - `actorId === selectedActorId` 的 FlowPath
  - `actorId === undefined` 的 FlowPath（未指定 Actor 的 Path 永遠顯示）
- "All Actors" 選項顯示全部 FlowPath

```
下拉選單樣式：
  height: 28px（與 Path tab 等高）
  padding: 0 10px
  border-radius: 14px（pill 形狀，與 Path tab 一致）
  背景: transparent（未展開時）
  border: 1px solid rgba(0,0,0,0.08)
  font-size: 11px
  icon: 👤
  展開時: 標準 dropdown，max-height 200px, 每個選項 padding 6px 10px
```

**2-2. UIStore 變更**

在 `src/store/uiStore.ts` 新增：

```typescript
activeActorFilter: string | null;  // null = "All Actors"
setActiveActorFilter: (actorId: string | null) => void;
```

**2-3. 篩選邏輯**

PathBar 中渲染 FlowPath tab 時的篩選：

```typescript
const filteredPaths = activeActorFilter
  ? activeBoard.flowPaths.filter(fp => fp.actorId === activeActorFilter || !fp.actorId)
  : activeBoard.flowPaths;
```

**2-4. Actor 被刪除時的處理**

當 Actor（StickyNote type='Actor'）被刪除時，與該 Actor 關聯的 FlowPath 的 `actorId` 不主動清理（orphan tolerance）。此時：
- 那些 FlowPath 在 "All Actors" 視角下仍然顯示
- 下拉選單中該 Actor 不再出現
- 如果目前 filter 選的就是被刪的 Actor，自動 reset 為 "All Actors"

在 PathBar 中加一個 `useEffect` 處理：

```typescript
useEffect(() => {
  if (activeActorFilter && !activeBoard.notes.some(n => n.id === activeActorFilter && n.type === 'Actor')) {
    setActiveActorFilter(null);
  }
}, [activeBoard.notes, activeActorFilter, setActiveActorFilter]);
```

**2-5. Path 計數**

PathBar 的事件計數（path tab 上的數字 badge）行為不變。Actor 篩選只影響「哪些 path tab 被顯示」，不影響計數邏輯。

**2-6. TabBar 統計**

TabBar 右側的統計數字（`{visible} / {total} events | bundles`）不受 Actor 篩選影響，仍只受 `activePath` 影響。

#### 3. persist migration

此功能不需要 persist migration。`FlowPath.actorId` 是 optional（`?`），舊資料沒有此欄位等同 `undefined`，行為正確（視為「未指定 Actor」）。

#### 驗收標準

1. PathBar 左側出現 Actor 下拉選單，列出當前 board 的所有 Actor
2. 選擇特定 Actor 後，PathBar 只顯示該 Actor 的 FlowPath + 未指定 Actor 的 FlowPath
3. 選擇 "All Actors" 時顯示全部 FlowPath
4. 新增/編輯 FlowPath 時可以指定 Actor
5. 刪除 Actor StickyNote 後，篩選器自動 reset 為 "All Actors"
6. 無 Actor StickyNote 時，下拉選單只有 "All Actors" 一個選項（仍顯示，不隱藏）

---

### BE-003：MCP 工具擴充（Remodel CRUD）

**依賴**：FE-009（資料模型定型後）
**負責**：backend-engineer
**目的**：讓 AI（Claude）可以透過 MCP 工具建立、讀取、更新、刪除 Remodel，實現 AI 輔助建構 Read Model 投影。

#### 1. 資料模型同步

MCP server（`mcp-server/src/index.ts`）的 Board/Remodel 型別需與前端 `src/types/elements.ts` 保持一致。

新增 `Remodel` interface（同 FE-009 定義）到 MCP server 的型別定義中。
Board interface 加 `remodels: Remodel[]`。

#### 2. 新增 MCP 工具

**2-1. `es_add_remodel`**

```
名稱: es_add_remodel
描述: Add a Remodel (4-in-1 read model card) to the active board
參數:
  - aggregateLabel (string, required): Aggregate name for read perspective
  - aggregateContent (string, optional): Aggregate description
  - parameterLabel (string, required): Query parameter name
  - parameterContent (string, optional): Parameter details
  - queryLabel (string, required): Query name (convention: "Get" + name, e.g. "GetOrderList")
  - queryContent (string, optional): Query description
  - sourceEventLabel (string, required): Event source summary
  - sourceEventContent (string, optional): Detailed event source description
  - linkedBundleIds (string[], optional): IDs of Bundles to link (default: [])
  - x (number, optional): X position (default: auto-layout)
  - y (number, optional): Y position (default: auto-layout)
  - paths (string[], optional): FlowPath IDs
  - phase (string, optional): Phase name
  - notes (string, optional): Free-text notes
回傳: 新建的 Remodel 完整 JSON（含 id）
```

自動定位邏輯（x/y 未提供時）：與 `es_add_bundle` 一致，放在現有元素的右側。

**2-2. `es_update_remodel`**

```
名稱: es_update_remodel
描述: Update a Remodel's content or linked bundles
參數:
  - id (string, required): Remodel ID
  - aggregateLabel (string, optional)
  - aggregateContent (string, optional)
  - parameterLabel (string, optional)
  - parameterContent (string, optional)
  - queryLabel (string, optional)
  - queryContent (string, optional)
  - sourceEventLabel (string, optional)
  - sourceEventContent (string, optional)
  - linkedBundleIds (string[], optional): 完整替換（非追加）
  - paths (string[], optional)
  - phase (string, optional)
  - notes (string, optional)
回傳: 更新後的 Remodel 完整 JSON
```

只更新提供的欄位（partial update）。對於 sub-note（如 aggregateNote），如果只提供了 `aggregateLabel` 沒提供 `aggregateContent`，只更新 label 保留 content。

**2-3. `es_delete_remodel`**

```
名稱: es_delete_remodel
描述: Delete a Remodel from the active board
參數:
  - id (string, required): Remodel ID
回傳: { success: true, deletedId: string }
```

刪除 Remodel 時，一併刪除所有 fromId 或 toId 為該 Remodel ID 的 Link。

**2-4. `es_get_board` 擴充**

現有 `es_get_board` 的回傳已包含 `notes`、`bundles`、`links`、`flowPaths`，需追加 `remodels` 欄位。

每個 Remodel 在回傳中額外附帶一個 computed 欄位 `_isUniverse: boolean`（用 isUniverseRemodel 邏輯計算），方便 AI 理解 Remodel 狀態。前綴加底線表示這是 computed 欄位，不是 stored 欄位。

#### 3. SSE 事件

Remodel 的 CRUD 操作和現有的 Bundle/Note 操作一致，透過 SSE 推播整個 project state 給前端。不需要新增 SSE 事件類型。

#### 4. project.json 持久化

`mcp-server/data/project.json` 的 Board 物件自動包含 `remodels` 陣列。載入時若無此欄位（舊資料），預設為 `[]`。

#### 驗收標準

1. `es_add_remodel` 可以成功建立 Remodel，前端畫布即時顯示
2. `es_update_remodel` 可以局部更新 Remodel 內容和 linkedBundleIds
3. `es_delete_remodel` 刪除 Remodel 及相關 Link
4. `es_get_board` 回傳包含 `remodels` 和 `_isUniverse` computed 欄位
5. AI 可以用 MCP 工具完成完整的 Remodel 建構流程（建立 → 連結 Bundle → 更新內容）

---

## 依賴關係圖

```
BE-001 (完成)
  ├── FE-001 (完成) ← UX-001 (完成)
  ├── FE-002 (完成) ← UX-002 (完成)
  ├── FE-004 (完成)
  └── BE-002 (完成)

獨立可並行：
  FE-003 (完成)
  FE-005 (完成)
  FE-006 (完成)
  FE-007 (完成)
  FE-008 (完成)

Phase 5（Remodel & Actor）：
  FE-009（獨立，無依賴）
    └── FE-010（依賴 FE-009）
    └── BE-003（依賴 FE-009 資料模型）
  FE-011（獨立，與 FE-009 平行）
```
