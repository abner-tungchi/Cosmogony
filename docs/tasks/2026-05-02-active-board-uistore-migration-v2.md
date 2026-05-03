# Move activeBoardId / openBoardIds from Project to uiStore (v2 — audit-informed)

> **Audit-fix Round 2 (2026-05-02)** — Codex 外審找出 2 HIGH + 2 MEDIUM，本次修正：
>
> 1. **H1**：BE `POST /api/board` 仍**保留** `prevActiveBoardId` restore（Round 2 commit `7fd7ff2` 的這段不還原），否則 server-local activeBoardId 會被 FE payload 洗成 undefined → MCP 工具壞掉。Step 8 + 介面合約 #10 + 改動檔案表已重新校準。
> 2. **H2**：TypeScript type 不會 runtime strip wire payload。FE `loadProject` 在 set 之前**顯式 delete** `activeBoardId` / `openBoardIds`（哪怕 BE 還在送）；server 端 `migrateProject` 也加 delete。完整阻斷 wire-leak。
> 3. **M3**：移除 uiStore `onRehydrateStorage` 內回讀 `useBoardStore.getState()` 的設計（同步 hydration 期間踩 TDZ 風險）。改用 App 層級 reconcile effect。
> 4. **M4**：新增 `useReconcileUIState()` hook，掛在 App，watch `boards` 變化時 prune 失效的 `openBoardIds`、`activeBoardId` 失效時 fallback 至 `boards[0]`。同時解 M3 + M4 兩項。

## 來源

討論：`docs/discussions/2026-04-30-active-board-uistore-migration.md`（Round 3）

## 目標

把 `activeBoardId` 和 `openBoardIds` 兩個欄位從 `Project` schema 搬到 `useUIStore`，徹底解決「per-tab UI state 被當共享 state」造成的整類 bug —— 不只本次的「Tab A 切 context Tab B 跟著切」，也消除這幾天累積的多個 wire-strip workaround commit（`7fd7ff2` / `5db71a5` / `b85f0d6`）。本版（v2）整合 2026-04-30 Codex+Gemini audit 找到的兩個 HIGH risk 解法：H1 寫 `useActiveBoard()` 組合 hook 同時訂閱 boardStore 與 uiStore，避免 cross-store reactivity loss；H2 明確區分「FE per-tab activeBoard」（uiStore）與「server-local activeBoard」（BE projectState 自己持有）為兩個獨立概念，**不再同步** —— MCP `es_switch_context` 不再 broadcast。

---

## 介面合約（Interface Contract）

### 1. `Project` interface（移除欄位）

`src/types/board.ts` 中的 `Project` interface 移除：

- `activeBoardId: string`
- `openBoardIds: string[]`

```ts
// After
export interface Project {
  id: string;
  name: string;
  boards: Board[];
  customTypes?: string[];
  createdAt: string;
  updatedAt: string;
}
```

`Project` 是 sync wire 的 schema —— 型別目標移除後，TypeScript 不會再把這兩欄當作 valid。**但 runtime 仍須保留 wire-strip**：BE-local Project 仍宣告 `activeBoardId`，`GET /api/board` 與舊 client 的 POST 仍可能帶這兩欄。三層 strip（FE `loadProject` 入口、FE `debouncedPost` 出口、BE `migrateProject`）都不可省，直到日後 BE 也搬掉相同欄位、wire 全面收斂為止（不在本 task 範圍）。

### 2. `UIState` / `UIStore` interface（新增欄位）

`src/types/board.ts` 中的 `UIState` interface 新增：

```ts
export interface UIState {
  // ...既有欄位（zoom / panX / panY / selectedNoteIds / activeToolType /
  //   isDraggingCanvas / isLinkingMode / linkFromId / linkFromType）
  activeBoardId: string;
  openBoardIds: string[];
}
```

### 3. `BoardStore` interface 不變

`BoardStore` 對外暴露的 actions（`setActiveBoard` / `openBoard` / `closeBoard` / `addBoard` / `addActorBoard` / `deleteBoard`）**簽名與名稱不變**。內部實作改為跨 store 寫入 uiStore。

### 4. `useActiveBoard()` 組合 hook（新增）

新增 `src/store/selectors.ts`：

```ts
import { useMemo } from 'react';
import { useBoardStore } from './boardStore';
import { useUIStore } from './uiStore';
import type { Board } from '../types/board';

/**
 * 同時訂閱 boardStore.project.boards 與 uiStore.activeBoardId。
 * 任一改變都觸發 re-render（解 Codex+Gemini audit H1：
 * cross-store reactivity loss）。
 */
export function useActiveBoard(): Board {
  const boards = useBoardStore((s) => s.project.boards);
  const activeBoardId = useUIStore((s) => s.activeBoardId);
  return useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? boards[0],
    [boards, activeBoardId]
  );
}
```

**所有權明示**：
- `activeBoardId` / `openBoardIds` **唯一**讀寫者：`useUIStore`
- 元件**禁止**直接 `useBoardStore((s) => s.project.activeBoardId)`，必須走 `useActiveBoard()` 或 `useUIStore`
- BE `projectState.activeBoardId` 是**獨立的 server-local state**，與 FE per-tab activeBoardId **完全脫鉤**

### 5. uiStore persist 設定

`src/store/uiStore.ts` 加 `persist` middleware：

- **key**: `event-storming-ui`
- **version**: 1
- **partialize**: 只持久化 `activeBoardId` + `openBoardIds`，**不**持久化 `zoom` / `panX` / `panY` / `selectedNoteIds` / `activeToolType` / `isDraggingCanvas` / `isLinkingMode` / `linkFromId` / `linkFromType` / `currentView` / `activePath` / `activeActorFilter` / `selectedElementId` / `selectedElementType`
- **不**設 `onRehydrateStorage` —— 不在 hydration 階段做跨 store 操作（Codex M3：`uiStore` module init 中讀 `useBoardStore.getState()` 容易踩 TDZ / circular init）。初始 fallback 由 Step 5b 的 `useReconcileUIState()` hook 處理

**Framework 備註（Zustand persist）**：localStorage 是 sync API，hydration 在 store create 後同步完成。即便如此，hydration 期間禁止反向存取 boardStore（避免 module init 順序耦合）。所有「初始化 + 失效偵測」都由 React effect 層處理，不在 store hydration 階段。

### 5b. `useReconcileUIState()` hook（新增）— 解 Codex M3 + M4

新增 `src/hooks/useReconcileUIState.ts`：

```ts
import { useEffect, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useUIStore } from '../store/uiStore';
import type { UIState } from '../types/board';

/**
 * 將 uiStore 的 per-tab UI state 與 boardStore.project.boards 對齊：
 *  - 啟動時補 activeBoardId / openBoardIds 初始值（取代 onRehydrateStorage 模式）
 *  - boards 集合變化（add / delete board）時 prune 失效的 openBoardIds、heal 失效的 activeBoardId
 *
 * 必須掛在 App.tsx 頂層（每個瀏覽器 tab 只跑一次）。
 *
 * 注意：依賴用「board id signature」而非 boards 陣列本身。zustand + immer 的
 * boards 陣列在子物件（notes / links / remodels）變更時也可能換 reference，
 * 用 boards 直接當 dep 會讓 effect 在每筆 note 編輯都跑（無害但雜訊大）。
 * 用 id signature 只在「boards 集合本身改變」時觸發。
 */
export function useReconcileUIState(): void {
  const boards = useBoardStore((s) => s.project.boards);
  const boardIdSignature = useMemo(
    () => boards.map((b) => b.id).join(','),
    [boards]
  );
  useEffect(() => {
    const validIds = new Set(boards.map((b) => b.id));
    const fallback = boards[0]?.id ?? '';
    const ui = useUIStore.getState();

    const next: Partial<UIState> = {};
    let changed = false;

    // Heal activeBoardId
    if (!ui.activeBoardId || !validIds.has(ui.activeBoardId)) {
      if (fallback) {
        next.activeBoardId = fallback;
        changed = true;
      }
    }

    // Prune openBoardIds（過濾失效的；空 array 時 fallback 至 [activeBoardId]）
    const currentOpen = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
    const filteredOpen = currentOpen.filter((id) => validIds.has(id));
    const newOpen = filteredOpen.length > 0
      ? filteredOpen
      : (next.activeBoardId ?? ui.activeBoardId)
        ? [next.activeBoardId ?? ui.activeBoardId]
        : (fallback ? [fallback] : []);
    if (newOpen.length !== currentOpen.length || !newOpen.every((id, i) => id === currentOpen[i])) {
      next.openBoardIds = newOpen;
      changed = true;
    }

    if (changed) useUIStore.setState(next);
    // 最終以 closure 分析為準：deps 只放 boardIdSignature；boards 內部 ref
    // 在 effect body 直接讀，由 zustand 保證 getState 拿到最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIdSignature]);
}
```

**所有權**：這個 hook 是 boardStore.boards → uiStore 的「物件參考完整性 (referential integrity)」守門員。boards 集合變化（addBoard / deleteBoard、remote sync_project 改變 boards 數量或 ids）才會觸發。

**為什麼放在 React effect 而非 store subscribe**：避免 store 互相依賴造成的 init / circular 風險；effect 在 React render cycle 內跑，timing 明確、可預測。

### 6. boardStore migration v15 → v16

`src/store/boardStore.ts` persist version `15` → `16`，新增 v16 migration：

```ts
if (version <= 15) {
  // v15 → v16: per-tab UI state 搬到 uiStore
  const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
  if (s.project) {
    const validIds = new Set(s.project.boards.map((b) => b.id));
    const fallback = s.project.boards[0]?.id ?? '';
    const activeBoardId =
      s.project.activeBoardId && validIds.has(s.project.activeBoardId)
        ? s.project.activeBoardId
        : fallback;
    const open = Array.isArray(s.project.openBoardIds)
      ? s.project.openBoardIds.filter((id) => validIds.has(id))
      : [];
    const openBoardIds = open.length > 0 ? open : (fallback ? [fallback] : []);

    // Direct localStorage write — useUIStore 還沒 create 完，setState 不可靠
    const uiPayload = { state: { activeBoardId, openBoardIds }, version: 1 };
    try {
      localStorage.setItem('event-storming-ui', JSON.stringify(uiPayload));
    } catch {
      // localStorage 滿或被禁用 → 下次 uiStore rehydrate 走預設空 state，
      // useReconcileUIState() effect 會在 React 第一次 render 後 fallback 至 boards[0]
    }

    delete s.project.activeBoardId;
    delete s.project.openBoardIds;
  }
  return persistedState as BoardStore;
}
```

理由：boardStore migration 在 uiStore create 之前執行，不能直接呼叫 `useUIStore.setState()`（store 還不存在）。直接寫 localStorage 讓 uiStore 之後 rehydrate 時讀到。

### 7. boardStore actions 跨 store 寫入

actions 內部需操作 `activeBoardId` / `openBoardIds` 的，改為從 `useUIStore.getState()` 讀寫：

```ts
// 範例：setActiveBoard
setActiveBoard: (id) => {
  const state = useBoardStore.getState();
  if (state.project.boards.some((b) => b.id === id)) {
    useUIStore.setState({ activeBoardId: id });
  }
},

// addBoard：建立 board（boardStore）+ 設為 active 並 push 到 openBoardIds（uiStore）
addBoard: (name) => {
  const newBoard = createBoard(name);
  set((state) => {
    state.project.boards.push(newBoard);
    state.project.updatedAt = new Date().toISOString();
  });
  const ui = useUIStore.getState();
  useUIStore.setState({
    activeBoardId: newBoard.id,
    openBoardIds: [...(ui.openBoardIds ?? []), newBoard.id],
  });
  return newBoard.id;
},
```

**所有權明示**：boardStore 負責 `project.boards` / `notes` / `links` 等 shared content；uiStore 負責 `activeBoardId` / `openBoardIds` per-tab UI。actions 的 contract 是「user 意圖層」，內部跨 store 寫入是實作細節，對 caller 透明。

### 8. `selectActiveBoard` selector 廢除

`src/store/boardStore.ts` 中既有的 `selectActiveBoard` 函式刪除。10 個 consumer 改用 `useActiveBoard()`：

| 檔案 | 變更 |
|---|---|
| `src/App.tsx` | `useBoardStore(selectActiveBoard)` → `useActiveBoard()` |
| `src/components/Sidebar/SidebarPalette.tsx` | 同上 |
| `src/components/Modals/ExportModal.tsx` | 同上 |
| `src/components/Board/Board.tsx` | 同上 |
| `src/components/Board/BoardCanvas.tsx` | 同上 |
| `src/components/TabBar/TabBar.tsx` | 同上 |
| `src/components/PathBar/PathBar.tsx` | 同上 |
| `src/components/Remodel/Remodel.tsx` | 同上 |
| `src/components/Links/LinkLayer.tsx` | 同上 |
| `src/components/DetailPanel/DetailPanel.tsx` | 同上 |

### 9. MCP `es_switch_context` 不再 broadcast

`mcp-server/src/index.ts` 的 `es_switch_context` tool handler 移除 `await broadcast('set_active_board', { id })` 那行。仍保留 `projectState.activeBoardId = id` 與 `saveProject()` —— server-local activeBoard 仍維持，但不會推給 FE 任何 tab。

對應 FE `src/utils/apiSync.ts` 的 `dispatch` switch 中的 `'set_active_board'` case 刪除（server 不再廣播此 action，留著屬於死碼）。

**對 AI 工作流的影響**：AI 透過 `es_switch_context` 切完 context 後，後續 `es_add_note` / `es_get_board` 等 MCP tool 仍依 `projectState.activeBoardId` 操作正確的 board。這條 chain 不變。FE 端的 React UI 不會跟著切 —— 屬於正確行為（per-user UI state 不該被 AI 動）。

### 10. Round 2 wire-strip workaround 的去留（修正版 — 解 Codex H1 + H2）

⚠️ **不是全部還原**。TypeScript type 移除欄位**不會** runtime strip JSON payload —— BE `GET /api/board` 仍會回傳 `activeBoardId`（BE-local Project type 仍持有），FE 收到也仍是 raw 物件。若全部還原會讓 wire-leak 復活。

| Commit | 程式碼 | 動作 | 理由 |
|---|---|---|---|
| `7fd7ff2` | FE debouncedPost 的 `{ activeBoardId: _a, openBoardIds: _o, ...sharedProject }` 解構 | **保留**（rename 為更明顯的「strip server-managed UI fields」註解） | runtime 必要：`proj` 物件實際仍含 BE 來的這兩欄 |
| `7fd7ff2` | FE `sync_project` dispatch 的 preserve 邏輯（包含 self-heal） | **簡化**：dispatch 直接 `store.loadProject(payload)`；strip 由 `loadProject` action 本體執行（Step 3 #10）；preserve / heal 由 `useReconcileUIState()` 接手 | wire 端 strip 收斂到 store 入口；preserve / heal 由 effect 處理 |
| `7fd7ff2` | BE `POST /api/board` 的 `prevActiveBoardId` restore | **保留** | Codex H1：FE payload 不含 activeBoardId 時，`projectState = migrateProject(req.body)` 仍會把 server-local 洗成 `undefined`。restore 不可省 |
| `5db71a5` | `loadProject` 的 self-heal | **改寫**：移除「找 boards[0] fallback」邏輯（由 `useReconcileUIState()` 統一處理）；**保留並強化** `delete project.activeBoardId; delete project.openBoardIds` 為 store 入口的單一防線（Codex H2 + 第二輪審：strip 收斂至 loadProject 本體，覆蓋初始 GET / sync_project / relay 等所有 call site）|
| `5db71a5` | TabBar / Homepage `?? []` 防禦 | **保留** | 仍是好實踐（uiStore 初始 `openBoardIds: []` 也不會 undef，但防禦多一層無傷）|
| `b85f0d6` | persist v15 migration | **保留** | 已執行的 user 不能 revert |
| `b85f0d6` | actions `Array.isArray` 防禦 | **保留** | 仍是好實踐 |

額外新增：
- BE `migrateProject` 函式內，return 之前明確 `delete (p as { activeBoardId?: string }).activeBoardId; delete (p as { openBoardIds?: string[] }).openBoardIds;`（Codex H2：BE 也要主動 strip 收到的 payload，不是只在 POST handler 用 prevActiveBoardId 救回；雙保險）—— 但**注意**：BE-local Project type 仍宣告 `activeBoardId: string`，這個 delete 的對象是 incoming `req.body` 的轉型物件，不影響 BE 自己的 projectState

```ts
// mcp-server/src/index.ts migrateProject (示意)
function migrateProject(p: Project): Project {
  // ... 既有 v0 → vN migration ...
  delete (p as { activeBoardId?: string }).activeBoardId;  // strip wire payload
  delete (p as { openBoardIds?: string[] }).openBoardIds;
  return p;
}
```

```ts
// mcp-server/src/index.ts POST /api/board (示意)
app.post('/api/board', (req, res) => {
  const senderClientId = req.headers['x-client-id'] as string | undefined;
  const prevActiveBoardId = projectState.activeBoardId;  // 救回 server-local
  projectState = migrateProject(req.body as Project);
  projectState.activeBoardId = prevActiveBoardId;
  saveProject();
  broadcastExcept('sync_project', projectState, senderClientId);
  res.json({ ok: true });
});
```

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/types/board.ts` | 從 `Project` 移除 `activeBoardId` 與 `openBoardIds`；在 `UIState` 新增同名欄位 |
| `src/store/uiStore.ts` | 新增 `activeBoardId` / `openBoardIds` 初始值；加 `persist` middleware（key `event-storming-ui`、version 1、partialize 只含這兩欄）。**不**設 `onRehydrateStorage`（Codex M3）|
| `src/store/boardStore.ts` | 移除 `project.activeBoardId` / `project.openBoardIds` 初始值與所有 `state.project.activeBoardId` / `state.project.openBoardIds` 引用；actions 改寫入 uiStore；移除 `selectActiveBoard` export；新增 v16 migration 直接寫 localStorage 把舊欄位搬到 `event-storming-ui` |
| `src/store/selectors.ts`（新增）| 新增 `useActiveBoard()` 組合 hook |
| `src/hooks/useReconcileUIState.ts`（新增）| 新增 reconcile hook：watch `boards` 變化、prune 失效 `openBoardIds` / heal 失效 `activeBoardId`（Codex M3 + M4 統一解法）|
| `src/utils/apiSync.ts` | **保留** Round 2 debouncedPost strip（runtime 必要，TS type 不會自動 strip）；簡化 `sync_project` dispatch（保留 strip + delete incoming 的這兩欄，preserve / heal 由 `useReconcileUIState` 處理）；relay sync 區段內的 active board 查詢改用 `useUIStore.getState().activeBoardId`；dispatch 移除 `set_active_board` case |
| `src/App.tsx` | `useBoardStore(selectActiveBoard)` → `useActiveBoard()`；新增 `useReconcileUIState()` hook 呼叫（在 component body 頂部）|
| `src/components/Sidebar/SidebarPalette.tsx` | 同 App.tsx |
| `src/components/Modals/ExportModal.tsx` | 同 |
| `src/components/Board/Board.tsx` | 同 |
| `src/components/Board/BoardCanvas.tsx` | 同 |
| `src/components/TabBar/TabBar.tsx` | `useBoardStore(selectActiveBoard)` → `useActiveBoard()`；`project.openBoardIds` 改用 `useUIStore((s) => s.openBoardIds)` |
| `src/components/PathBar/PathBar.tsx` | `useBoardStore(selectActiveBoard)` → `useActiveBoard()`；所有 `project.activeBoardId` 改用 `useUIStore((s) => s.activeBoardId)` |
| `src/components/Remodel/Remodel.tsx` | `useBoardStore(selectActiveBoard)` → `useActiveBoard()` |
| `src/components/Links/LinkLayer.tsx` | 同 |
| `src/components/DetailPanel/DetailPanel.tsx` | 同 |
| `src/components/Homepage/Homepage.tsx` | `project.openBoardIds` 改用 `useUIStore((s) => s.openBoardIds)` |
| `mcp-server/src/index.ts` | **保留** Round 2 `prevActiveBoardId` restore（Codex H1：FE 不送該欄時 server-local 會被洗成 undefined）；`migrateProject` 末尾新增 `delete activeBoardId; delete openBoardIds`（Codex H2：明確 strip wire payload）；`es_switch_context` 移除 `broadcast('set_active_board', ...)` |

---

## 實作步驟

### Step 1 — `src/types/board.ts`

1. 從 `Project` interface 刪除 `activeBoardId: string` 與 `openBoardIds: string[]`
2. 在 `UIState` interface 末尾新增：
   - `activeBoardId: string`
   - `openBoardIds: string[]`
3. **不**修改 `BoardStore` interface

### Step 2 — `src/store/uiStore.ts`

1. import `persist` from `'zustand/middleware'`
2. `useUIStore` 的初始 state 新增：
   - `activeBoardId: ''`
   - `openBoardIds: []`
3. `create<UIStore>(...)` 改為 `create<UIStore>()(persist((set, get) => ({ ... }), { ... }))`
4. persist 設定（**禁止**任何 `onRehydrateStorage` 跨 store 邏輯 — Codex M3）：
   ```ts
   {
     name: 'event-storming-ui',
     version: 1,
     partialize: (state) => ({
       activeBoardId: state.activeBoardId,
       openBoardIds: state.openBoardIds,
     }),
     // 不設 onRehydrateStorage — 初始化 / heal 統一交給 useReconcileUIState 處理
   }
   ```
5. **不**反向 import `useBoardStore`（避免循環 init / TDZ 風險）。所有跨 store 邏輯走 React effect 層（`useReconcileUIState` hook）

### Step 3 — `src/store/boardStore.ts`

1. 從 `useBoardStore` 初始 state 的 `project` 物件移除 `activeBoardId` 與 `openBoardIds`
2. 刪除既有的 `selectActiveBoard` export
3. 移除所有 actions 內部對 `state.project.activeBoardId` 的讀取，改用 helper：
   ```ts
   const findActiveBoard = (state: BoardStore) => {
     const id = useUIStore.getState().activeBoardId;
     return state.project.boards.find((b) => b.id === id);
   };
   ```
   約 50 處 `state.project.boards.find((b) => b.id === state.project.activeBoardId)` 全替換為 `findActiveBoard(state)`
4. **`setActiveBoard` action**：
   ```ts
   setActiveBoard: (id) => {
     if (useBoardStore.getState().project.boards.some((b) => b.id === id)) {
       useUIStore.setState({ activeBoardId: id });
     }
   }
   ```
5. **`openBoard` action**：
   ```ts
   openBoard: (id) => {
     const ui = useUIStore.getState();
     const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
     useUIStore.setState({
       openBoardIds: open.includes(id) ? open : [...open, id],
       activeBoardId: id,
     });
   }
   ```
6. **`closeBoard` action**：
   ```ts
   closeBoard: (id) => {
     const ui = useUIStore.getState();
     const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
     const remaining = open.filter((i) => i !== id);
     const next: Partial<UIState> = { openBoardIds: remaining };
     if (ui.activeBoardId === id) {
       const state = useBoardStore.getState();
       const closingBoard = state.project.boards.find((b) => b.id === id);
       const fallback =
         closingBoard?.parentContextId ??
         remaining[0] ??
         state.project.boards.find((b) => !b.parentContextId)?.id ??
         state.project.boards[0]?.id ??
         '';
       next.activeBoardId = fallback;
     }
     useUIStore.setState(next);
   }
   ```
7. **`addBoard` action**：set 內 push 到 `state.project.boards`，set 外 setState uiStore：
   ```ts
   addBoard: (name) => {
     const newBoard = createBoard(name);
     set((state) => {
       state.project.boards.push(newBoard);
       state.project.updatedAt = new Date().toISOString();
     });
     const ui = useUIStore.getState();
     const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
     useUIStore.setState({
       activeBoardId: newBoard.id,
       openBoardIds: [...open, newBoard.id],
     });
     return newBoard.id;
   }
   ```
8. **`addActorBoard` action**：與 `addBoard` 同樣 pattern，但 actor sub-board 自身**不**進 `openBoardIds`（保持「actor sub-board 不是 tab，parent context 才是」的既有語義 —— Codex audit Round 2 H5）。改成：
   ```ts
   addActorBoard: (contextId, name) => {
     const newBoard = createBoard(name, contextId);
     set((state) => {
       state.project.boards.push(newBoard);
       state.project.updatedAt = new Date().toISOString();
     });
     const ui = useUIStore.getState();
     const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
     useUIStore.setState({
       activeBoardId: newBoard.id, // active 仍是 actor sub-board（user 馬上看到它）
       openBoardIds: open.includes(contextId) ? open : [...open, contextId], // tab list 加 parent context
     });
     return newBoard.id;
   }
   ```
9. **`deleteBoard` action**：set 內刪 boards，set 外 setState uiStore：
   ```ts
   deleteBoard: (id) =>
     set((state) => {
       const toDelete = new Set(
         state.project.boards
           .filter((b) => b.id === id || b.parentContextId === id)
           .map((b) => b.id)
       );
       const remainingContextBoards = state.project.boards.filter(
         (b) => !toDelete.has(b.id) && !b.parentContextId
       );
       if (remainingContextBoards.length === 0) return;
       state.project.boards = state.project.boards.filter((b) => !toDelete.has(b.id));
       state.project.updatedAt = new Date().toISOString();
       // 同步 uiStore（在 immer producer 外執行較安全，但 zustand 允許在 set callback 末尾 schedule）
       queueMicrotask(() => {
         const ui = useUIStore.getState();
         const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
         const filteredOpen = open.filter((i) => !toDelete.has(i));
         const next: Partial<UIState> = { openBoardIds: filteredOpen };
         if (toDelete.has(ui.activeBoardId)) {
           next.activeBoardId = filteredOpen[0] ?? remainingContextBoards[0].id;
         }
         useUIStore.setState(next);
       });
     })
   ```
10. **`loadProject` action（Codex H1 修正：FE 端 strip 收斂到本體）**：所有 **FE 端**的 `store.loadProject(...)` call site（initial `GET /api/board` → `apiSync` 的 `useEffect`、`sync_project` SSE dispatch、未來其他 FE 路徑）都會經過這裡，這是 FE 入口的單一防線。**BE 的 relay rehydrate**（`mcp-server/src/index.ts` 的 `loadProjectFromRelay()` → `migrateProject()`）走 BE-side 自己的路徑，不經過 FE store；由 Step 8 #3 的 `migrateProject` strip 負責那條路徑。實作為：
    ```ts
    loadProject: (project) =>
      set((state) => {
        // 三層 strip 中的 store-side 防線。runtime 仍可能收到含這兩欄的 incoming
        // （BE Project type 仍保留 activeBoardId、舊 client、init GET response 等）。
        // 在這裡 delete 是最後一道閘，不依賴 dispatch case 或 fetch handler 各自記得 strip。
        const { activeBoardId: _a, openBoardIds: _o, ...sharedProject } =
          project as Project & { activeBoardId?: string; openBoardIds?: string[] };
        state.project = sharedProject as Project;
      }),
    ```
    上層的 `sync_project` dispatch 仍可保留 delete（防呆 / 文件化），但**真正的 enforcement 在 loadProject 本體**。Step 5 #2 的 `case 'sync_project'` 因此可改為直接 `store.loadProject(payload as Project)`，loadProject 內部會自動 strip。
    Initial `GET /api/board` 路徑（`apiSync` 的 `useEffect` 中的 `fetch('/api/board')` 收到 response 後 `store.loadProject(serverProject)`）天然走 loadProject，不需額外處理。
11. **persist version**：`15` → `16`
12. **新增 v16 migration**（取代 commit `b85f0d6` 的 v15 migration —— v15 仍保留以服務尚未升到 v16 的 user）：
    ```ts
    if (version <= 15) {
      // v15 → v16: 把 per-tab UI state 搬到 event-storming-ui localStorage
      const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
      if (s.project) {
        const validIds = new Set(s.project.boards.map((b) => b.id));
        const fallback = s.project.boards[0]?.id ?? '';
        const activeBoardId =
          s.project.activeBoardId && validIds.has(s.project.activeBoardId)
            ? s.project.activeBoardId
            : fallback;
        const open = Array.isArray(s.project.openBoardIds)
          ? s.project.openBoardIds.filter((id) => validIds.has(id))
          : [];
        const openBoardIds = open.length > 0 ? open : (fallback ? [fallback] : []);

        const uiPayload = { state: { activeBoardId, openBoardIds }, version: 1 };
        try {
          localStorage.setItem('event-storming-ui', JSON.stringify(uiPayload));
        } catch {
          // 忽略：uiStore rehydrate 時走預設空 state，由 useReconcileUIState() effect 補值
        }
        delete s.project.activeBoardId;
        delete s.project.openBoardIds;
      }
      return persistedState as BoardStore;
    }
    ```

### Step 4 — `src/store/selectors.ts`（新增）

1. 建立檔案，內容如「介面合約 #4」所示
2. export `useActiveBoard`

### Step 4b — `src/hooks/useReconcileUIState.ts`（新增 — 解 Codex M3 + M4）

1. 建立目錄 `src/hooks/`（若不存在）
2. 建立檔案，內容如「介面合約 #5b」所示
3. export `useReconcileUIState`

### Step 5 — `src/utils/apiSync.ts`（修正版 — 解 Codex H2）

1. **保留 debouncedPost 的解構 strip**（runtime 必要，TS type 不會 strip JSON）：
   ```ts
   debounce((proj: Project) => {
     // Strip server-managed UI fields. proj.activeBoardId / openBoardIds
     // may still exist at runtime when the BE Project shape carries them
     // (BE-local Project type retains activeBoardId; GET /api/board returns
     // it as a real key). Removing them prevents wire-leak.
     const { activeBoardId: _a, openBoardIds: _o, ...sharedProject } =
       proj as Project & { activeBoardId?: string; openBoardIds?: string[] };
     fetch('/api/board', { ..., body: JSON.stringify(sharedProject) });
   }, 500)
   ```
2. **`sync_project` dispatch 簡化**：
   - 移除 commit `5db71a5` 的 self-heal preserve 邏輯（fallback 由 `useReconcileUIState` 統一處理）
   - 直接 `store.loadProject(payload as Project)` —— loadProject 本體已內建 strip（Step 3 #10 修正）
   ```ts
   case 'sync_project':
     store.loadProject(payload as Project);
     break;
   ```
3. **移除 `case 'set_active_board'`**：server 不再 broadcast 此 action（見 Step 8），dispatch 對應 case 屬於死碼
4. **`applyBatchFieldUpdate` 內的 active board 查詢**：把 `store.project.boards.find((b) => b.id === store.project.activeBoardId)` 改為 `store.project.boards.find((b) => b.id === useUIStore.getState().activeBoardId)`
5. import `useUIStore` 在頂部

### Step 6 — React 元件全替換 selectActiveBoard

對 10 個檔案各自：
1. import 從 `import { useBoardStore, selectActiveBoard } from '...'` 改為 `import { useActiveBoard } from '../../store/selectors'`（或對應相對路徑）
2. `const activeBoard = useBoardStore(selectActiveBoard);` 改為 `const activeBoard = useActiveBoard();`
3. 若該檔案還用 `useBoardStore` 取其他東西（actions、project），保留該 import line（移除 `selectActiveBoard` named import 即可）

### Step 7 — `src/components/TabBar/TabBar.tsx` / `Homepage.tsx` / `PathBar.tsx`

額外處理對 `project.openBoardIds` / `project.activeBoardId` 的引用（不只 `selectActiveBoard`）：

1. **TabBar.tsx**：
   - `project.openBoardIds` 兩處（filter + close handler）改為從 `useUIStore((s) => s.openBoardIds)` 讀
   - 既有的 `?? []` 防禦保留（commit `5db71a5`）
2. **Homepage.tsx**：`project.openBoardIds.includes(board.id)` 改為 `useUIStore((s) => s.openBoardIds).includes(board.id)`
3. **PathBar.tsx**：所有 `project.activeBoardId` 引用改為 `useUIStore((s) => s.activeBoardId)`；既有 useMemo dependency `[project.boards, project.activeBoardId]` 改為 `[project.boards, activeBoardId]`
   - **注意（最終以 closure 分析為準）**：實作時必須對照 PathBar 內 useMemo body 的所有 closure-captured 識別字確認 deps 完整

### Step 7b — `src/App.tsx` 掛上 reconcile hook

`App.tsx` 內 component body 頂部（在其他 hook 之前或之後皆可，但需與其他 hook 處於相同 render 階段）：

```tsx
import { useReconcileUIState } from './hooks/useReconcileUIState';
// ... 其他 import

function App() {
  useReconcileUIState();  // 必須掛在最頂層 component；watch boards、heal uiStore
  // ... 既有 hooks 與 JSX
}
```

### Step 8 — `mcp-server/src/index.ts`（修正版 — 解 Codex H1 + H2）

1. **`es_switch_context` tool handler**：移除 `await broadcast('set_active_board', { id });` 這一行。其他邏輯（更新 `projectState.activeBoardId`、`saveProject()`、回傳 success message）不變
2. **`POST /api/board` handler 保留 `prevActiveBoardId` restore**（Codex H1 — 不可省）：
   ```ts
   app.post('/api/board', (req, res) => {
     const senderClientId = req.headers['x-client-id'] as string | undefined;
     const prevActiveBoardId = projectState.activeBoardId;  // ← 保留
     projectState = migrateProject(req.body as Project);
     projectState.activeBoardId = prevActiveBoardId;  // ← 救回 server-local
     saveProject();
     broadcastExcept('sync_project', projectState, senderClientId);
     res.json({ ok: true });
   });
   ```
   理由：FE strip 後 payload 不含 activeBoardId，但 `migrateProject(req.body)` 仍會把 server-local 整顆覆蓋成 `undefined`，會壞 `es_switch_context` 等 MCP 工具
3. **`migrateProject` 函式末尾新增 strip**（Codex H2 — 防舊 client / 防 BE 自己又把欄位寫進 wire format）：
   ```ts
   function migrateProject(p: Project): Project {
     // ...既有 v0 → vN migration...
     delete (p as { activeBoardId?: string }).activeBoardId;
     delete (p as { openBoardIds?: string[] }).openBoardIds;
     return p;
   }
   ```
   注意：BE-local Project type 宣告仍含 `activeBoardId: string`，這個 delete 對 incoming payload 進行；不影響 BE 自己於 `POST handler` 之後 restore 上去的 `projectState.activeBoardId`
4. **不**動 BE-local 的 `interface Project` 宣告（含 `activeBoardId: string` 欄位的那份；它與 FE `src/types/board.ts` 的 Project 是兩份獨立 type）—— BE 自己的 Project type 仍保留 `activeBoardId`，是 server-local state

---

## 失敗路徑

- **uiStore localStorage 損毀或 schema 不符**：zustand persist 會丟棄、用初始 state（`activeBoardId: ''`）。`useReconcileUIState()` 在 React 第一次 render 後（`boards` 已 hydrate）偵測 `activeBoardId === ''`，自動 fallback 至 `boards[0]?.id`。元件用 `useActiveBoard()` 內建 `?? boards[0]` 作 render-time 雙保險
- **localStorage 寫入失敗（quota / 隱私模式）**：v16 migration `try/catch` 不擋啟動；下次 uiStore rehydrate 走預設空 state，由 `useReconcileUIState()` 補值
- **boardStore v16 migration 跑了但 uiStore 還沒 create**：直接 `localStorage.setItem` 寫入，不依賴 `useUIStore.setState()`
- **uiStore activeBoardId 指向已刪除 board**（remote sync_project / MCP delete context 後）：`useReconcileUIState()` watch `boards`，validIds 不含目前 activeBoardId 時自動切 fallback；`openBoardIds` 同步 prune。`useActiveBoard()` 的 `?? boards[0]` 是 render-time 兜底，避免 reconcile effect 還沒 commit 前的 1 frame UI flicker
- **MCP `es_switch_context` 後 FE 不切 tab**：刻意設計（per-tab UI state 不該被 AI 動）。AI 仍可正確新增 note 到指定 context（`projectState.activeBoardId` 在 server 端維持正確 — `POST /api/board` handler 的 `prevActiveBoardId` restore 守護這點）
- **FE strip 失靈導致 wire-leak 復活**（Codex H2 場景）：spec 強制三層 strip 防護 —— FE `debouncedPost` 解構 strip、FE `sync_project` dispatch delete incoming、BE `migrateProject` delete 收到的 payload。任一層即可阻斷，三層同時失效才會 leak
- **BE server-local activeBoardId 被 FE POST 洗掉**（Codex H1 場景）：spec 強制 `POST /api/board` 內 `prevActiveBoardId` restore；同時 `migrateProject` strip 不影響 restore（因為 restore 的是 BE 自己的 `projectState.activeBoardId`，不是 incoming payload）
- **跨 store 循環 import**：boardStore → uiStore（單向 OK）；selectors.ts → boardStore + uiStore（leaf，OK）；hooks/useReconcileUIState.ts → boardStore + uiStore（leaf，OK）；uiStore **不**反向 import boardStore（無 onRehydrateStorage hack）
- **immer producer 內 setState 跨 store**：`deleteBoard` 用 `queueMicrotask` 把 uiStore.setState 推到 producer 之外，避免 immer draft 不一致

---

## 不改動的部分

- `src/store/uiStore.ts` 既有的 `zoom` / `panX` / `panY` / `selectedNoteIds` / `activeToolType` / `isDraggingCanvas` / `isLinkingMode` / `linkFromId` / `linkFromType` / `selectedElementId` / `selectedElementType` / `currentView` / `activePath` / `activeActorFilter` 欄位與 actions 不動，**也不**加進 partialize（仍是 ephemeral）
- `BoardStore` interface 對外簽名（actions 名字、參數、回傳型別）完全不變
- `mcp-server/src/index.ts` 的 BE-local `Project` type、`projectState.activeBoardId`、`getActiveBoard` helper、其他 MCP tool handlers 不動
- BE `POST /api/board` 收到的 payload 不再含這兩欄是合約變更但對 BE 行為無影響（BE 維持自己的 activeBoard）
- React 元件的 UI 視覺、互動、style 完全不變
- `src/utils/apiSync.ts` 的 `isApplyingRemoteRef` guard、SSE handler、debounce 行為不動
- 既有 v3 → v15 的 migration chain 全部保留（v15 commit `b85f0d6` 的 sanitize 仍服務 v15 user）

### Non-goals（行為層）

- 本 task 不包含跨 tab 同步 active board 的功能（每個 tab 各自獨立 active）
- 本 task 不包含把 zoom / pan / activePath 等其他 UI state 加進 persist
- 本 task 不包含 Phase 1 的 per-entity `_rev` versioning
- 本 task 不包含改變 TabBar / PathBar / Homepage / SidebarPalette 的視覺樣式或互動行為
- 本 task 不包含新增 MCP tool 或 broadcast scope flag
- 本 task 不改 BE-local activeBoardId 的語義 —— MCP 切 context 行為對 AI 端零變更，僅 broadcast 拿掉

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別檢查
npx tsc --noEmit
cd mcp-server && npx tsc --noEmit && cd ..

# 2. Lint（只看 diff 內檔案，避免 pre-existing issue 干擾）
npx eslint src/types/board.ts src/store/boardStore.ts src/store/uiStore.ts src/store/selectors.ts src/hooks/useReconcileUIState.ts src/utils/apiSync.ts src/App.tsx src/components/Sidebar/SidebarPalette.tsx src/components/Modals/ExportModal.tsx src/components/Board/Board.tsx src/components/Board/BoardCanvas.tsx src/components/TabBar/TabBar.tsx src/components/PathBar/PathBar.tsx src/components/Remodel/Remodel.tsx src/components/Links/LinkLayer.tsx src/components/DetailPanel/DetailPanel.tsx src/components/Homepage/Homepage.tsx

# 3. Build
npm run build
cd mcp-server && npm run build && cd ..

# 4. Project schema 不再含這兩欄（鎖定 Project block）
awk '/^export interface Project \{/,/^\}/' src/types/board.ts | grep -q "activeBoardId" && exit 1 || true
awk '/^export interface Project \{/,/^\}/' src/types/board.ts | grep -q "openBoardIds" && exit 1 || true

# 5. UIState 已新增這兩欄
awk '/^export interface UIState \{/,/^\}/' src/types/board.ts | grep -q "activeBoardId: string"
awk '/^export interface UIState \{/,/^\}/' src/types/board.ts | grep -q "openBoardIds: string\[\]"

# 6. boardStore 不再寫 state.project.activeBoardId / openBoardIds（migration 內合法引用以 awk 排除）
awk '!/^[[:space:]]*\/\//' src/store/boardStore.ts | grep -E "state\.project\.(activeBoardId|openBoardIds)" | grep -vE "(version <=|migrate|persistedState)" && exit 1 || true

# 7. boardStore 已 import useUIStore
grep -q "from './uiStore'" src/store/boardStore.ts

# 8. boardStore version bumped to 16
grep -q "version: 16" src/store/boardStore.ts

# 9. uiStore 已加 persist + key
grep -q "persist" src/store/uiStore.ts
grep -q "event-storming-ui" src/store/uiStore.ts

# 10. selectors.ts 存在且 export useActiveBoard
test -f src/store/selectors.ts
grep -q "export function useActiveBoard" src/store/selectors.ts

# 11. selectActiveBoard 完全消失
! grep -rn "selectActiveBoard" src/

# 12. React 元件全部改用 useActiveBoard
! grep -rn "useBoardStore(selectActiveBoard)" src/

# 13. MCP es_switch_context 不再 broadcast set_active_board
awk '/server\.tool\(/,/^\);$/' mcp-server/src/index.ts | grep -B1 "es_switch_context" -A30 | grep -v "//" | grep "broadcast.*set_active_board" && exit 1 || true

# 14. FE dispatch 不再有 set_active_board case
! grep -n "case 'set_active_board'" src/utils/apiSync.ts

# 15. FE debouncedPost 仍保留 wire-strip（runtime 必要 — Codex H2）
grep -q "activeBoardId: _a" src/utils/apiSync.ts
grep -q "openBoardIds: _o" src/utils/apiSync.ts

# 16. BE migrateProject 加 strip（Codex H2 BE 端）
awk '/^function migrateProject/,/^\}/' mcp-server/src/index.ts | grep -q "delete.*activeBoardId"
awk '/^function migrateProject/,/^\}/' mcp-server/src/index.ts | grep -q "delete.*openBoardIds"

# 17. BE POST handler 仍保留 prevActiveBoardId restore（Codex H1）
awk '/app\.post\(.\/api\/board./,/^\}\);$/' mcp-server/src/index.ts | grep -q "prevActiveBoardId"

# 18. useReconcileUIState 已建立並在 App 掛上
test -f src/hooks/useReconcileUIState.ts
grep -q "export function useReconcileUIState" src/hooks/useReconcileUIState.ts
grep -q "useReconcileUIState" src/App.tsx

# 19. uiStore **不**設 onRehydrateStorage（Codex M3）
! grep -n "onRehydrateStorage" src/store/uiStore.ts

# 20. boardStore loadProject action 內含 strip（Codex 第二輪審 H1：覆蓋所有 FE call site — init GET / sync_project SSE。BE relay rehydrate 走 migrateProject 路徑由 #16 驗證）
awk '/loadProject:/,/^      \),$/' src/store/boardStore.ts | grep -q "activeBoardId: _a"
awk '/loadProject:/,/^      \),$/' src/store/boardStore.ts | grep -q "openBoardIds: _o"
```

### Human 補做（需要人類介入）

- [ ] **跨 tab 獨立性**：開兩 tab `http://localhost:5173`，Tab A 切到 context X、Tab B 切到 context Y，**Tab B 不被 Tab A 操作影響**（最重要的回歸驗證）
- [ ] **Tab content 同步仍正常**：Tab A 加 note / Remodel / FlowPath → Tab B 同步看到
- [ ] **單 tab refresh 持久化**：Tab A 切到 context X，refresh 後仍停在 X
- [ ] **兩 tab 各自 refresh 持久化**：Tab A active X、Tab B active Y，各自 refresh 後維持原選擇
- [ ] **v15 → v16 migration**：清空 localStorage 後刻意手動塞入 v15 格式（含 `project.activeBoardId`）的 `event-storming-board`，refresh，檢查：(1) `event-storming-ui` 出現且含正確值 (2) `event-storming-board` 內 `project.activeBoardId` 已被 delete (3) UI 正常進入原 active context
- [ ] **deleteBoard 行為**：刪除目前 active 的 context，UI 切到 fallback context
- [ ] **closeBoard 行為**：點 TabBar X 關閉某個 tab，從 openBoardIds 移除；若被關是 active，切到 remaining[0] 或 fallback
- [ ] **addBoard 行為**：新增 Bounded Context，新 board 自動進 openBoardIds 且成為 active
- [ ] **addActorBoard 行為**：在某個 context 內新增 actor sub-board，**parent context** 仍在 openBoardIds（沒新加 actor sub-board 進 tab list），active 切到 actor sub-board
- [ ] **MCP `es_switch_context` 不影響 FE**：透過 Claude Code 跑 `es_switch_context`，**所有開啟的 browser tab 都不切換**（這是刻意改變的行為）
- [ ] **MCP 操作正確 context**：`es_switch_context` 後跑 `es_add_note`，note 加在 server-local activeBoard 上（從 GET /api/board 確認）
- [ ] **Homepage 開關 board**：Homepage 點 board「開啟」/「關閉」，TabBar 對應出現/消失
- [ ] **PathBar context dot active 樣式**：active context 的 dot 仍有 highlight 樣式
- [ ] **無 console error / `Cannot read properties of undefined`**：完整跑一遍上述場景，DevTools console 必須 clean
- [ ] **stale activeBoardId reconcile**：DevTools console 跑 `useUIStore.setState({ activeBoardId: 'fake-deleted-id' });`，再做一次 board 集合異動（例如 addBoard 或 deleteBoard，觸發 useReconcileUIState 的 effect），檢查 `useUIStore.getState().activeBoardId` 應該被 heal 至有效 id（不是 fake id）。注意：reconcile 只在 boards 集合（id 列表）變化時觸發，單純 note 編輯不會 heal — 由 `useActiveBoard` 的 render-time `?? boards[0]` fallback 兜底
- [ ] **wire-leak 三層防線**：DevTools Network → 攔截一筆 `POST /api/board`，檢查 request body 不含 `activeBoardId` / `openBoardIds`；攔截 `sync_project` SSE frame，FE 若收到含這兩欄的 incoming，store 內 `state.project` 也不應出現這兩欄（dispatch 已 delete）

---

## 已知限制

- **MCP `es_switch_context` 不再廣播給 FE 是 behavior change**：先前（Round 1 決策 8 保留廣播）AI 切 context 會把所有 tab 跟著切。本次決定改為 per-user UI state 完全獨立。若未來有「AI 與 user co-pilot 同步看同一個 context」的需求，需另外設計（建議在 MCP tool 加 `scope: 'broadcast' | 'local'` 參數，本 task 不做）
- **uiStore persist 只 partialize 兩個欄位**：`zoom` / `pan` / `activePath` 等仍是 ephemeral，refresh 後重置（既有行為，不變）
- **跨 store 耦合**：boardStore actions 內部呼叫 `useUIStore.getState().setState()`，造成 boardStore 對 uiStore 單向依賴。屬於可接受耦合，符合「per-user UI state 由 uiStore 管理」的分界。uiStore **不**反向 import boardStore（解 Codex M3 TDZ 風險），改由 React effect (`useReconcileUIState`) 統一處理 cross-store reconciliation
- **wire 端三層 strip**：FE debouncedPost / FE sync_project dispatch / BE migrateProject 各自 delete 這兩欄（解 Codex H2）。每一層都 redundant，但任一層失靈時其他兩層仍能阻斷 leak。實作時三層都不能省，audit 將驗證
- **boardStore migration v15 仍保留**：尚未升到 v15 之後的 user 經 v15 sanitize 後再經 v16 搬到 uiStore；已升到 v15 的 user 直接走 v16
- **依賴關係**：無前置 task。實作完成後可清理 commits `7fd7ff2` / `5db71a5` / `b85f0d6` 的 wire-strip workaround（見「介面合約 #10」），但保留 v15 migration 與 actions 的 `Array.isArray` 防禦
- **Phase 1 (versioning + per-entity `_rev`)**：與本 task 正交，不阻塞，可獨立進行
