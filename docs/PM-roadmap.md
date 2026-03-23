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

### Phase 6 — Remodel 進階功能：資料模型修訂 + Source Events + Dto（Must Have）

> 產出時間：2026-03-22
> 背景：Phase 5 完成了 Remodel 基礎功能。Phase 6 針對 Remodel 進行三項增強：(1) 右下格從 Source Events 描述改為 Return Type，並用綠色系區分輸入/輸出；(2) Source Events 改為卡片下方的可收合附屬區域，內容自動從 linked Bundles 的 eventNote 生成；(3) 新增 Dto StickyNote 類型，描述 Remodel 回傳型別中的物件結構。

| 任務 ID | 標題 | 負責 Agent | 依賴 | 狀態 |
|---------|------|-----------|------|------|
| FE-012 | Remodel 資料模型修訂（returnTypeNote + linkedDtoIds + 收合狀態） | frontend-engineer | FE-009 | ✅ 完成 |
| FE-013 | Remodel 視覺更新（配色 + 收合功能） | frontend-engineer | FE-012 | 待開發 |
| FE-014 | Source Events 附屬區域 | frontend-engineer | FE-012 | 待開發 |
| FE-015 | Dto StickyNote 元素 + Remodel 連動 | frontend-engineer | FE-012 | 待開發 |

---

### FE-012：Remodel 資料模型修訂（returnTypeNote + linkedDtoIds + 收合狀態）

**依賴**：FE-009（Remodel 基礎功能已完成）
**負責**：frontend-engineer
**目的**：調整 Remodel 的資料模型以支援 Phase 6 的三項增強。此任務只做資料層變更和 migration，不涉及 UI 渲染變更。

#### 1. Remodel interface 修改 — `src/types/elements.ts`

```typescript
export interface Remodel {
  id: string;
  position: { x: number; y: number };

  // 四格便條紙
  aggregateNote: BundleSubNote;      // 上方：Aggregate（讀取視角）
  parameterNote: BundleSubNote;      // 左下：輸入參數
  queryNote: BundleSubNote;          // 中下：Query 名稱（Get+名稱）
  returnTypeNote: BundleSubNote;     // 右下：回傳型別（原 sourceEventNote，重命名）

  // 連動
  linkedBundleIds: string[];         // 連結到哪些 Bundle
  linkedDtoIds: string[];            // 新增：連結到哪些 Dto StickyNote

  // 收合狀態
  collapsed?: boolean;               // 已有欄位，四格卡片本體收合
  sourceEventsExpanded?: boolean;    // 新增：Source Events 區域展開狀態（預設 true）

  // 元資料（不變）
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

**變更摘要：**
- `sourceEventNote` → `returnTypeNote`（重命名）
- 新增 `linkedDtoIds: string[]`
- 新增 `sourceEventsExpanded?: boolean`

#### 2. ElementType 擴充 — `src/types/elements.ts`

```typescript
export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot'
  | 'Diamond' | 'Dto';   // ← 新增 'Dto'
```

#### 3. boardStore persist migration v6 → v7

**檔案**：`src/store/boardStore.ts`

persist version 改為 `7`。migrate function 新增 `if (version < 7)` 區塊：

```typescript
if (version < 7) {
  // v6 → v7: Remodel 欄位重命名 + 新增欄位
  const state = persistedState as { project: Project };
  for (const board of state.project.boards) {
    if (!board.remodels) board.remodels = [];
    for (const remodel of board.remodels) {
      // 重命名 sourceEventNote → returnTypeNote
      if ('sourceEventNote' in remodel && !('returnTypeNote' in remodel)) {
        (remodel as any).returnTypeNote = (remodel as any).sourceEventNote;
        delete (remodel as any).sourceEventNote;
      }
      // 補 linkedDtoIds
      if (!remodel.linkedDtoIds) {
        remodel.linkedDtoIds = [];
      }
      // sourceEventsExpanded 是 optional，不需要補（undefined 等同 true）
    }
  }
}
```

**邊界情況：**
- 沒有 Remodel 的 board：`board.remodels = []`，迴圈不執行，安全
- 已經有 `returnTypeNote`（不會發生，但 defensive）：`'sourceEventNote' in remodel` 為 false，跳過
- `sourceEventNote` 的 label/content 內容保留不變，只是搬到新欄位

#### 4. boardStore actions 更新

`addRemodel` 的預設值需反映新結構：

- 新建 Remodel 時，`linkedDtoIds` 預設 `[]`
- `sourceEventsExpanded` 不設預設值（undefined = true by convention）
- 所有 `sourceEventNote` 引用改為 `returnTypeNote`

新增一個 action（或擴充現有 `updateRemodel`）：

```typescript
// 不需要新 action——updateRemodel 的 Partial<Remodel> 已經支援
// 更新 linkedDtoIds: updateRemodel(id, { linkedDtoIds: [...] })
// 更新 sourceEventsExpanded: updateRemodel(id, { sourceEventsExpanded: false })
```

#### 5. MCP server 同步更新

**檔案**：`mcp-server/src/index.ts`

**5-1. Remodel interface 同步**

MCP server 的 Remodel 型別定義同步更新（`sourceEventNote` → `returnTypeNote`、加 `linkedDtoIds`、加 `sourceEventsExpanded`）。

**5-2. `es_add_remodel` 參數修改**

```
移除:
  - sourceEventLabel
  - sourceEventContent

新增:
  - returnTypeLabel (string, required): Return type name
  - returnTypeContent (string, optional): Return type description
  - linkedDtoIds (string[], optional): IDs of Dto StickyNotes (default: [])
```

**5-3. `es_update_remodel` 參數修改**

```
移除:
  - sourceEventLabel
  - sourceEventContent

新增:
  - returnTypeLabel (string, optional)
  - returnTypeContent (string, optional)
  - linkedDtoIds (string[], optional): 完整替換
  - sourceEventsExpanded (boolean, optional)
```

**5-4. `es_get_board` 回傳更新**

Remodel 物件中的欄位名稱自動跟著更新。新增 computed 欄位：

```
_sourceEvents: string[]   // 從 linkedBundleIds 解析出的 event 名稱列表
                          // 即 linkedBundleIds.map(id => findBundle(id).eventNote.label).filter(Boolean)
```

**5-5. project.json 載入容錯**

載入時若 Remodel 有 `sourceEventNote` 但無 `returnTypeNote`，自動轉換（與前端 migration 邏輯一致）。

#### 6. isUniverseRemodel helper 無需修改

`isUniverseRemodel` 只讀 `linkedBundleIds` 和 `bundle.infoNote.label`，與此次變更無關。

#### 7. Detail Panel 引用修正

**檔案**：`src/components/DetailPanel/DetailPanel.tsx`

FE-010 已實作的 Remodel Detail Panel 中，所有 `sourceEventNote` 引用改為 `returnTypeNote`。

具體位置：
- InlineField 的 label 從 "SOURCE EVENTS" 改為 "RETURN TYPE"
- placeholder 從 "Which events compose this read model..." 改為 "Return type description..."
- `updateRemodel(id, { sourceEventNote: ... })` 改為 `updateRemodel(id, { returnTypeNote: ... })`

#### 驗收標準

1. `src/types/elements.ts` 中 Remodel interface 有 `returnTypeNote`、`linkedDtoIds`、`sourceEventsExpanded` 欄位，無 `sourceEventNote`
2. `ElementType` 包含 `'Dto'`
3. persist migration v6→v7 正確執行：舊 Remodel 的 `sourceEventNote` 被遷移到 `returnTypeNote`，`linkedDtoIds` 補 `[]`
4. MCP server 的 `es_add_remodel` / `es_update_remodel` 使用 `returnTypeLabel`/`returnTypeContent`
5. MCP server 的 `es_get_board` Remodel 物件包含 `_sourceEvents` computed 欄位
6. Detail Panel 中 Remodel 的第四格標題顯示 "RETURN TYPE"
7. TypeScript 編譯零錯誤（所有 `sourceEventNote` 引用已更新）

---

### FE-013：Remodel 視覺更新（配色 + 收合功能）

**依賴**：FE-012
**負責**：frontend-engineer
**目的**：更新 Remodel 四格卡片的配色以區分輸入/輸出參數，並實作 Remodel 收合功能。

#### 1. 配色更新

**檔案**：`src/components/Remodel/Remodel.tsx`

更新 SubNote 渲染時的 `bgColor` 參數：

| 格子位置 | 語意 | 原配色（FE-009） | 新配色 | 文字色 |
|---------|------|----------------|--------|--------|
| 上方 | Aggregate | 淺紫 `#e9d5ff` | **不變** `#e9d5ff` | `#1e293b` |
| 左下 | Parameter（輸入） | 淡青 `#cffafe` | **深綠** `#86efac` | `#1e293b` |
| 中下 | Query Name | 灰藍 `#bfdbfe` | **不變** `#bfdbfe` | `#1e293b` |
| 右下 | Return Type（輸出） | 薰衣草 `#ede9fe` | **淺綠** `#bbf7d0` | `#1e293b` |

**設計意圖：**
- 左下（深綠 `#86efac`）= 輸入參數，右下（淺綠 `#bbf7d0`）= 回傳型別
- 深淺綠色的配對讓使用者一眼看出「輸入」和「輸出」是同一維度的不同方向
- 上方（紫）和中下（藍）保持不變，提供足夠的視覺錨點

**欄位對應更新（SubNote 渲染）：**

右下格的 SubNote 現在讀 `remodel.returnTypeNote`（原 `sourceEventNote`）。

#### 2. 收合功能

與 Bundle 的收合機制完全對稱，參考 `src/components/Bundle/Bundle.tsx` 的 collapsed view 實作。

**2-1. 收合狀態**

使用 `remodel.collapsed` 欄位（已在 Remodel interface 中定義為 `collapsed?: boolean`）。

**2-2. 收合後的視覺呈現**

收合後的 Remodel 是一個小卡片，尺寸與 Bundle collapsed 相同：

```
寬: COLLAPSED_BUNDLE_W (200px)
高: COLLAPSED_BUNDLE_H (64px)
```

卡片內容（由上到下）：

```
┌──────────────────────────────────────┐
│  Order              (aggregateNote)  │  ← 10px, opacity 0.75, 單行 ellipsis
│  GetOrderList       (queryNote)      │  ← 12px, bold, 單行 ellipsis，主標題
│                              [▼]     │  ← 展開按鈕
└──────────────────────────────────────┘
```

- **背景色**：`#a78bfa`（紫色，與 Remodel 冷色調一致）
- **文字色**：`white`
- **副標題**（第一行）：`remodel.aggregateNote.label`，10px，opacity 0.75
  - 如果 label 為空，不渲染此行
- **主標題**（第二行）：`remodel.queryNote.label`，12px，bold
  - 如果 label 為空，顯示 placeholder "Query Name"
- **展開按鈕**：position absolute, right 6px, vertically centered
  - 與 Bundle collapsed 的展開按鈕樣式一致
  - 背景: `rgba(255,255,255,0.25)`
  - 文字: "▼"
  - 點擊: `updateRemodel(remodel.id, { collapsed: false })`
- **刪除按鈕**：與 Bundle 一致，右上角紅色圓形 ×
- **PathDots**：與 Bundle collapsed 一致

**2-3. 展開狀態的收合按鈕**

在 Remodel 展開視圖（四格卡片）的左上角（與 Bundle 一致的位置），新增收合按鈕：

```
樣式: 與 Bundle 的 BTN_STYLE 一致
  position: absolute, left: -8, top: -8
  width: 20, height: 20, border-radius: 50%
  背景: #a78bfa（紫色，區別 Bundle 的橘色 #FF8C00）
  文字: "▲"
  點擊: updateRemodel(remodel.id, { collapsed: true })
```

**2-4. Universe badge 在收合狀態**

收合狀態下不顯示 Universe badge（空間不夠，且收合的目的就是省空間）。

**2-5. linkUtils 更新**

**檔案**：`src/utils/linkUtils.ts`

`getBundleBounds` 或同等計算函式需支援 Remodel 的 collapsed 狀態。如果 Remodel 的連線錨點計算複用了 Bundle 的尺寸邏輯，需確認 collapsed Remodel 使用 `COLLAPSED_BUNDLE_W` / `COLLAPSED_BUNDLE_H`。

新增（或擴充）：

```typescript
export function getRemodelBounds(remodel: Remodel) {
  const w = remodel.collapsed ? COLLAPSED_BUNDLE_W : BUNDLE_W;
  const h = remodel.collapsed ? COLLAPSED_BUNDLE_H : BUNDLE_H;
  return {
    left: remodel.position.x,
    top: remodel.position.y,
    right: remodel.position.x + w,
    bottom: remodel.position.y + h,
    cx: remodel.position.x + w / 2,
    cy: remodel.position.y + h / 2,
  };
}
```

**2-6. Minimap 更新**

Minimap 中 Remodel 的尺寸需反映 collapsed 狀態。

**2-7. collapseAll / expandAll 擴充**

boardStore 中現有的 `collapseAllBundles` / `expandAllBundles` actions 應該同步操作 Remodel：

```typescript
collapseAllBundles: () => set(produce((state) => {
  const board = activeBoard(state);
  board.bundles.forEach(b => { b.collapsed = true; });
  board.remodels.forEach(r => { r.collapsed = true; });  // ← 新增
  board.updatedAt = new Date().toISOString();
})),

expandAllBundles: () => set(produce((state) => {
  const board = activeBoard(state);
  board.bundles.forEach(b => { b.collapsed = false; });
  board.remodels.forEach(r => { r.collapsed = false; });  // ← 新增
  board.updatedAt = new Date().toISOString();
})),
```

或者，考慮重新命名這些 actions 為 `collapseAll` / `expandAll`（同時操作 Bundle 和 Remodel）。但為了避免影響現有呼叫端，建議保持原名並擴充行為。

#### 驗收標準

1. Remodel 左下格（Parameter）為深綠 `#86efac`，右下格（Return Type）為淺綠 `#bbf7d0`
2. 右下格內容來自 `returnTypeNote`（非舊的 sourceEventNote）
3. Remodel 展開時左上角有紫色收合按鈕（▲），點擊後收合
4. 收合後顯示 200x64 紫色卡片，主標題為 queryNote.label，副標題為 aggregateNote.label
5. 收合後有展開按鈕（▼）和刪除按鈕（×）
6. collapseAll / expandAll 同時操作 Bundle 和 Remodel
7. Minimap 正確反映 Remodel 的 collapsed 尺寸
8. Link 連線錨點正確計算 collapsed Remodel 的位置

---

### FE-014：Source Events 附屬區域

**依賴**：FE-012
**負責**：frontend-engineer
**目的**：在 Remodel 卡片下方顯示一個可收合的 Source Events 區域，內容自動從 linked Bundles 的 eventNote 生成。

#### 1. Source Events 的資料來源

**純 computed，不存資料。** Source Events 列表完全由以下邏輯即時生成：

```typescript
const sourceEvents = remodel.linkedBundleIds
  .map(bundleId => {
    const bundle = activeBoard.bundles.find(b => b.id === bundleId);
    if (!bundle) return null;
    return {
      bundleId: bundle.id,
      eventLabel: bundle.eventNote.label,
      aggregateLabel: bundle.infoNote.label,
    };
  })
  .filter(Boolean);
```

**即時反映變更**：如果使用者修改了某個 Bundle 的 `eventNote.label`，Source Events 區域會自動更新（因為是 computed，每次 render 重算）。

#### 2. UI 結構

Source Events 區域渲染在 Remodel 四格卡片的**正下方**，作為同一個 DOM 節點的子元素（不是獨立定位的畫布元素）。

**2-1. 展開狀態**

當 `remodel.sourceEventsExpanded !== false`（預設 true，undefined 也算 true）：

```
┌──────────────────────────────────────────────────┐
│  Remodel 4-in-1 卡片（496 x 248）               │
│  ┌─Aggregate─┐                                   │
│  ├Parameter┤├Query┤├ReturnType┤                   │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐  ← Source Events 區域
│  SOURCE EVENTS (3)                     [▲ 收合]  │
│  ┌──────────────────────────────────────────┐    │
│  │  ⚡ OrderCreated         (Order)         │    │
│  ├──────────────────────────────────────────┤    │
│  │  ⚡ PaymentReceived      (Payment)       │    │
│  ├──────────────────────────────────────────┤    │
│  │  ⚡ ShippingInitiated    (Shipping)      │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Source Events 區域樣式：**

```
容器:
  position: absolute
  top: BUNDLE_H + 4 （四格卡片高度 + 4px 間距）
  left: 0
  width: BUNDLE_W （與四格卡片等寬，496px）
  background: rgba(124, 58, 237, 0.06)（極淡紫色背景）
  border: 1px solid rgba(124, 58, 237, 0.15)
  border-radius: 6px
  padding: 8px

標題列:
  display: flex, justify-content: space-between, align-items: center
  "SOURCE EVENTS (N)": font-size 10px, font-weight 700, uppercase, letter-spacing 0.08em, color #64748b
  收合按鈕: background transparent, border none, color #94a3b8, font-size 12px, cursor pointer, "▲"

Event 列表:
  margin-top: 6px
  每個 event item:
    display: flex, align-items: center, gap: 6px
    padding: 4px 8px
    border-radius: 4px
    background: rgba(255,255,255,0.04)
    margin-bottom: 2px

    左側 icon: "⚡" (font-size 11px)
    Event 名稱: font-size 12px, color #e2e8f0, font-weight 500
    Aggregate 來源: font-size 10px, color #94a3b8, margin-left auto, "(Order)" 格式
```

**2-2. 收合狀態**

當 `remodel.sourceEventsExpanded === false`：

```
┌──────────────────────────────────────────────────┐
│  Remodel 4-in-1 卡片                             │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  3 Source Events                        [▼ 展開] │
└──────────────────────────────────────────────────┘
```

收合後的 Source Events 區域：

```
容器:
  同展開狀態的容器樣式，但 padding 減少為 6px 8px
  高度固定（不展開 event 列表）

內容:
  單行: "{N} Source Events"
  font-size: 11px, color: #94a3b8
  展開按鈕: "▼"（替換 "▲"）
```

**2-3. 空狀態**

當 `remodel.linkedBundleIds.length === 0` 時，Source Events 區域仍然顯示，但內容為：

```
┌──────────────────────────────────────────────────┐
│  SOURCE EVENTS                                   │
│  No linked bundles.                              │
│  Use Link Mode or Detail Panel to add bundles.   │
└──────────────────────────────────────────────────┘
```

- 文字色: `#64748b`，font-size 11px，font-style italic
- 不顯示收合按鈕（沒東西可以收合）

**2-4. Deleted Bundle 容錯**

如果 `linkedBundleIds` 中某個 ID 在 `activeBoard.bundles` 中找不到（Bundle 已被刪除），該 event item 顯示為：

```
  ⚡ (Deleted Bundle)          灰色斜體, opacity 0.5
```

不自動移除——使用者需要在 Detail Panel 手動清理（FE-010 已有此功能）。

#### 3. 收合按鈕互動

**點擊收合**：`updateRemodel(remodel.id, { sourceEventsExpanded: false })`
**點擊展開**：`updateRemodel(remodel.id, { sourceEventsExpanded: true })`

收合/展開動畫：可選。如果要做，用 CSS `max-height` transition（200ms ease）。不做也可以，Phase 6 不強制。

#### 4. 與 Remodel 收合的互動

**當 Remodel 本體收合（collapsed = true）時，Source Events 區域完全不渲染。**

邏輯：

```typescript
// 在 Remodel 元件中
if (remodel.collapsed) {
  return <CollapsedRemodelView ... />;  // 不含 Source Events
}

return (
  <div>
    <ExpandedRemodelView ... />         {/* 四格卡片 */}
    <SourceEventsPanel ... />           {/* Source Events 區域 */}
  </div>
);
```

#### 5. Remodel 整體高度計算影響

Source Events 區域改變了 Remodel 的「有效高度」。這影響：

**5-1. Minimap**

Minimap 渲染 Remodel 時，如果 Source Events 展開，Remodel 的有效高度 = `BUNDLE_H + 4 + sourceEventsHeight`。但 Minimap 是概略渲染（色點），**不需要精確反映 Source Events 區域**。Minimap 仍使用四格卡片的尺寸即可。

**5-2. Fit All**

`fitAll` 計算 bounding box 時，同樣**只計算四格卡片的尺寸**，不含 Source Events。原因：Source Events 是附屬資訊，不應該影響使用者的「全部可見」預期。

**5-3. Link 連線錨點**

Link 的連線起終點基於四格卡片的 bounds，**不含 Source Events 區域**。Source Events 不是 Link 的可連接目標。

**5-4. 拖動**

拖動 Remodel 時，Source Events 區域跟著移動（因為是同一個 DOM 容器的子元素）。

**5-5. Path 篩選 dim**

Remodel 被 dim 時（activePath 不匹配），Source Events 區域一起被 dim（繼承父容器的 opacity）。

#### 驗收標準

1. Remodel 展開時，下方顯示 Source Events 區域，列出所有 linked Bundles 的 eventNote.label
2. 修改某個 linked Bundle 的 eventNote.label 後，Source Events 區域即時更新
3. 點擊收合按鈕後，Source Events 區域收合為「N Source Events ▼」摘要行
4. 點擊展開按鈕後，恢復完整 event 列表
5. linkedBundleIds 為空時顯示空狀態提示
6. 已刪除的 Bundle 顯示為 "(Deleted Bundle)" 灰色斜體
7. Remodel 本體收合時，Source Events 區域不渲染
8. 拖動 Remodel 時，Source Events 區域跟著移動
9. Path 篩選 dim 效果覆蓋 Source Events 區域

---

### FE-015：Dto StickyNote 元素 + Remodel 連動

**依賴**：FE-012
**負責**：frontend-engineer
**目的**：新增 Dto（Data Transfer Object）StickyNote 類型，用於描述 Remodel 回傳型別中的物件結構（例如 `OrderItem` 的欄位定義）。Dto 卡片可以與 Remodel 建立關聯。

#### 1. Dto 的使用場景

當一個 Remodel 的回傳型別是物件陣列時（例如 `OrderItem[]`），使用者需要一個地方描述那個物件的結構。Dto 卡片就是這個用途——一張大卡片，寫明物件名稱和欄位。

例如：
- Remodel "GetOrderList" 的回傳型別是 `Order[]`
- 使用者建立一張 Dto 卡片 "Order"，內容寫：`orderId: string / customerName: string / totalAmount: number / status: OrderStatus`
- 這張 Dto 卡片與 Remodel 建立關聯

#### 2. Dto StickyNote 的視覺樣式

Dto 使用現有的 StickyNote 元件，但有特定的配色和較大的預設尺寸。

**2-1. 在 ELEMENT_CONFIGS 中新增 Dto 配置**

**檔案**：`src/constants/elementTypes.ts`

```typescript
Dto: {
  label: 'Dto',
  color: '#4ade80',   // 綠色（與 Remodel 的 Parameter/ReturnType 綠色系一致）
}
```

在 `ELEMENT_TYPE_LIST` 中加入 `'Dto'`。

在 `SidebarPalette.tsx` 的 `iconMap` 中新增：

```typescript
Dto: '{ }',   // 用大括號符號，表示物件結構
```

**2-2. Dto 的預設尺寸**

```
width: 200（比一般 StickyNote 的 160 更寬）
height: 160（比一般 StickyNote 的 80 更高）
```

這個尺寸在 Board.tsx 的 `handleCanvasMouseDown` 中設定（與其他 StickyNote 類型的 size 設定在同一處）。

判斷條件：

```typescript
const noteWidth = type === 'Dto' ? 200 : 160;
const noteHeight = type === 'Dto' ? 160 : 80;
```

**2-3. Dto 卡片的內容格式**

Dto 的 `label` 欄位用於物件名稱（例如 "OrderItem"）。
Dto 的 `notes` 欄位用於物件結構描述（multiline 文字）。

StickyNote 元件渲染 Dto 時：
- 上半部：label（粗體，作為物件名稱）
- 下半部：notes 內容（smaller font，monospace 風格，適合欄位列表）

建議的 notes 格式（純文字，使用者自行維護）：

```
orderId: string
customerName: string
totalAmount: number
items: OrderItem[]
status: OrderStatus
```

**不做結構化解析**——notes 就是自由文字。AI 可以透過 MCP 自動產生格式化的內容。

**2-4. Dto 的 StickyNote 渲染特化**

**檔案**：`src/components/StickyNote/StickyNote.tsx`

在 StickyNote 元件中，當 `note.type === 'Dto'` 時，渲染樣式做以下調整：

```
背景色: #4ade80（與 ELEMENT_CONFIGS.Dto.color 一致）
文字色: #1e293b（深色，配合淺綠背景）

上半部（label）:
  font-size: 13px, font-weight: 700
  border-bottom: 1px solid rgba(0,0,0,0.1)
  padding-bottom: 4px
  margin-bottom: 4px

下半部（notes 內容）:
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace
  font-size: 10px
  line-height: 1.5
  white-space: pre-wrap
  overflow-y: auto（超過卡片高度時可捲動）
  color: rgba(0,0,0,0.7)
```

如果 notes 為空，顯示 placeholder："Double-click to add fields"（淺色斜體）。

#### 3. Sidebar 新增 Dto 放置按鈕

**檔案**：`src/components/Sidebar/SidebarPalette.tsx`

Dto 按鈕自動出現在 ELEMENT_TYPE_LIST 的 map 渲染中（因為第 2 步已加入 `ELEMENT_TYPE_LIST`）。

放置順序建議：Dto 排在 ReadModel 的位置（因為 ReadModel 已被移除），或排在列表最後。

#### 4. Remodel Detail Panel — Linked Dtos 管理

**檔案**：`src/components/DetailPanel/DetailPanel.tsx`

在 Remodel 的 Detail Panel 中（FE-010 實作），新增一個 "LINKED DTOS" 區塊，放在 "LINKED BUNDLES" 區塊下方。

**結構與行為完全對稱於 Linked Bundles 區塊。**

**4-1. 已連結的 Dto 列表**

遍歷 `remodel.linkedDtoIds`，對每個 ID 從 `activeBoard.notes` 找到 `type === 'Dto'` 的 StickyNote，顯示為 chip：

```
樣式: 與 Linked Bundles chip 一致
  左側文字: dto.label || "(Unnamed Dto)"
  左側 icon: "{ }"（小字，10px）
  右側: × 按鈕（刪除連結）
```

點擊 × 按鈕：

```typescript
updateRemodel(remodel.id, {
  linkedDtoIds: remodel.linkedDtoIds.filter(id => id !== dtoId)
});
```

**4-2. 新增連結的下拉選單**

「+ Add Dto」按鈕，點擊後展開下拉選單：
- 列出 `activeBoard.notes.filter(n => n.type === 'Dto')` 中**尚未被連結**的 Dto
- 排除已在 `linkedDtoIds` 中的
- 每個選項顯示 Dto 的 label
- 選中後：

```typescript
updateRemodel(remodel.id, {
  linkedDtoIds: [...remodel.linkedDtoIds, selectedDtoId]
});
```

- 下拉選單樣式與 Linked Bundles 的下拉選單一致

**4-3. Deleted Dto 容錯**

與 Linked Bundles 一致：如果 `linkedDtoIds` 中某個 ID 找不到對應的 Dto StickyNote，顯示為 "(Deleted Dto)" 灰色斜體。

#### 5. Link Mode — Remodel ↔ Dto 自動連動

**檔案**：`src/components/Board/Board.tsx`

擴充 FE-010 實作的 `handleLinkTarget` 邏輯。

在 Remodel ↔ Bundle 的自動連動之後，新增 Remodel ↔ Dto 的判斷：

```typescript
// 特殊處理：Remodel ↔ Dto 自動連動 linkedDtoIds
let remodelIdForDto: string | null = null;
let dtoNoteId: string | null = null;

if (linkFromType === 'remodel' && targetType === 'note') {
  const targetNote = activeBoard.notes.find(n => n.id === targetId);
  if (targetNote?.type === 'Dto') {
    remodelIdForDto = linkFromId;
    dtoNoteId = targetId;
  }
} else if (linkFromType === 'note' && targetType === 'remodel') {
  const fromNote = activeBoard.notes.find(n => n.id === linkFromId);
  if (fromNote?.type === 'Dto') {
    remodelIdForDto = targetId;
    dtoNoteId = linkFromId;
  }
}

if (remodelIdForDto && dtoNoteId) {
  const remodel = activeBoard.remodels.find(r => r.id === remodelIdForDto);
  if (remodel && !remodel.linkedDtoIds.includes(dtoNoteId)) {
    updateRemodel(remodelIdForDto, {
      linkedDtoIds: [...remodel.linkedDtoIds, dtoNoteId],
    });
  }
}
```

**注意**：這段邏輯與 Remodel ↔ Bundle 連動是**並列**的（不是互斥）。一次 Link 操作只會觸發其中一個（因為 target 不可能同時是 Bundle 和 Dto）。

**反向清理規則**：與 Linked Bundles 一致——刪除 Link 不自動從 `linkedDtoIds` 移除。

#### 6. MCP 工具支援

**6-1. 現有 `es_add_note` 已支援**

`es_add_note` 的 `type` 參數接受 `ElementType`，加入 `'Dto'` 後自動支援。

AI 可以這樣建立 Dto：

```
es_add_note(type="Dto", label="OrderItem", notes="orderId: string\ncustomerName: string\ntotalAmount: number")
```

**6-2. `es_update_remodel` 已支援 `linkedDtoIds`**

FE-012 已將 `linkedDtoIds` 加入 `es_update_remodel` 參數。

#### 驗收標準

1. Sidebar 出現 Dto 放置按鈕，可在畫布上新增 Dto 卡片
2. Dto 卡片背景為綠色（`#4ade80`），label 粗體顯示在上方，notes 以 monospace 字體顯示在下方
3. Dto 預設尺寸為 200x160（大於一般 StickyNote）
4. Remodel Detail Panel 出現 "LINKED DTOS" 區塊，可新增/刪除 Dto 連結
5. Link Mode 從 Remodel 拉線到 Dto StickyNote 時，自動加入 `linkedDtoIds`
6. 已刪除的 Dto 在 Detail Panel 顯示為 "(Deleted Dto)"
7. AI 可透過 `es_add_note(type="Dto", ...)` 建立 Dto 卡片
8. AI 可透過 `es_update_remodel(linkedDtoIds=[...])` 管理 Dto 連結

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
  FE-009（獨立，無依賴）── 完成
    └── FE-010（依賴 FE-009）── 完成
    └── BE-003（依賴 FE-009 資料模型）── 完成
  FE-011（獨立，與 FE-009 平行）── 完成

Phase 6（Remodel 進階）：
  FE-012（依賴 FE-009，資料模型修訂）
    ├── FE-013（依賴 FE-012，配色 + 收合）
    ├── FE-014（依賴 FE-012，Source Events 區域）
    └── FE-015（依賴 FE-012，Dto 元素 + 連動）
  FE-013 / FE-014 / FE-015 三者互相獨立，可平行開發
```
