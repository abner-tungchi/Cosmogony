# Move activeBoardId / openBoardIds from Project to uiStore

> **STATUS: SUPERSEDED — 2026-04-30**
>
> 此 spec 在外部審查（Codex + Gemini 一致）後判定為 **draft / not implementable as written**。Audit 揭露兩個本人未抓到的 HIGH risk 與多個 MEDIUM risk（詳見下方「外部審查發現」）。
>
> User 決定改走 wire-strip 方案（原討論 MD 的 Option A），實作於 commit 後續：在 `src/utils/apiSync.ts` debouncedPost 剝除 activeBoardId/openBoardIds、`sync_project` dispatch 保留 local 值；BE `mcp-server/src/index.ts` 在 `POST /api/board` 跨呼叫保留 `prevActiveBoardId`。實作量約 20 行，無 store 重構、無 migration、無 React 訂閱面風險。
>
> 本檔保留作為「為何不走 Option B」的歷史佐證。**請勿用此 spec 進入 /pickup**。

## 外部審查發現（2026-04-30）

兩位審查者（Codex GPT-5.4 + Gemini 3.1-pro）獨立找出同樣的 2 個 HIGH risk：

### HIGH risks

1. **Cross-store reactivity loss**（Codex + Gemini 一致）
   - 10 個 components 用 `useBoardStore(selectActiveBoard)` 訂閱（DetailPanel / Remodel / LinkLayer / ExportModal / TabBar / PathBar / App / Board / BoardCanvas / SidebarPalette）
   - spec 把 `selectActiveBoard` 內部改用 `useUIStore.getState()`，但 Zustand 訂閱仍綁在 boardStore
   - 切換 tab 時 uiStore 變了，10 個元件不會 re-render → UI 卡死

2. **MCP server activeBoardId 被洗掉**（Codex + Gemini 一致）
   - spec 要 `migrateProject` 載入時刪 activeBoardId
   - 但 server 大量依賴 `projectState.activeBoardId`（es_switch_context / es_list_contexts / es_add_note 等）
   - FE POST 不含此欄位 → BE migrateProject 把它刪 → AI 切完 context 馬上被洗掉

### MEDIUM risks

- v15 migration edge cases（空字串 / 空陣列 / boards 為空 / fallback 用 `initialBoard.id` 不對）
- Persist hydration race（async storage 風險）
- `addActorBoard` 不該 push actor sub-board 到 openBoardIds
- Verification 指令多處 false negative
- Step 4 location 描述錯（`applyBatchFieldUpdate` 內，不是 relay sync）

完整討論：`docs/discussions/2026-04-30-active-board-uistore-migration.md` Round 2 與下方原 spec body。

---

## 來源

討論：`docs/discussions/2026-04-30-active-board-uistore-migration.md`

## 目標

把 `activeBoardId` 和 `openBoardIds` 兩個欄位從 `Project` schema 搬到 `useUIStore`，讓每個 browser tab 持有自己的 active context tab 與 open tabs 狀態，**不再因 `sync_project` 廣播被其他 tab 覆蓋**。Phase 0 跨 tab 同步上線後出現「Tab A 切 Bounded Context tab 時 Tab B 也跟著切」的副作用，根因是這兩個 per-user UI state 被誤放在 shared `Project` schema 裡並隨整份 project state 廣播；本任務徹底修正欄位歸屬，讓「per-user UI state 走 uiStore、shared content 走 boardStore」的分界乾淨。

---

## 介面合約（Interface Contract）

### 1. `Project` interface（移除欄位）

`src/types/board.ts` 中的 `Project` interface 移除以下欄位：

- `activeBoardId: string` — 整個欄位刪除
- `openBoardIds: string[]` — 整個欄位刪除

```ts
// Before
export interface Project {
  id: string;
  name: string;
  boards: Board[];
  activeBoardId: string;
  openBoardIds: string[];
  customTypes?: string[];
  createdAt: string;
  updatedAt: string;
}

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

`Project` 是 sync wire 的合約 —— 移除後，POST `/api/board` 與 SSE `sync_project` 的 payload 自然不含這兩個欄位（不再需要在 wire 層做 strip）。

### 2. `UIState` / `UIStore` interface（新增欄位 + actions）

`src/types/board.ts` 中的 `UIState` 新增：

```ts
export interface UIState {
  // ... 既有欄位
  activeBoardId: string;
  openBoardIds: string[];
}
```

`src/store/uiStore.ts` 中的 `UIStore` 新增 setter（內部用）：

```ts
interface UIStore extends UIState {
  // ... 既有欄位
  setActiveBoardIdInternal: (id: string) => void;
  setOpenBoardIdsInternal: (ids: string[]) => void;
}
```

**所有權明示**：
- `activeBoardId` 與 `openBoardIds` 由 `useUIStore` 持有與持久化
- `useBoardStore` 對外暴露的 `setActiveBoard` / `openBoard` / `closeBoard` 等 actions **內部呼叫 useUIStore** 來讀寫這兩個欄位
- React 元件若要讀 `activeBoardId` / `openBoardIds`，**必須**透過 `useUIStore`，不可從 `useBoardStore` 的 `project` 讀取（type 上也擋住）

### 3. `BoardStore` 既有 actions（行為不變、實作改用 uiStore）

`src/types/board.ts` 中的 `BoardStore` interface 不變，以下 actions 對外簽名保留，但 boardStore 內部實作改為讀寫 uiStore：

- `setActiveBoard(id: string): void`
- `openBoard(id: string): void`
- `closeBoard(id: string): void`
- `addBoard(name: string): string` — 內部呼叫 uiStore 把新 board id push 到 openBoardIds 並設為 active
- `addActorBoard(contextId: string, name: string): string` — 同上
- `deleteBoard(id: string): void` — 從 uiStore openBoardIds 中移除被刪 board，若 active 被刪則 fallback
- `loadProject(project: Project): void` — Project 不再含這兩欄位，loadProject 不動 uiStore（保留本地 active state）

### 4. boardStore 內部 helper 改寫

```ts
// Before
const getActiveBoard = (state: BoardStore): Board =>
  state.project.boards.find((b) => b.id === state.project.activeBoardId) ?? state.project.boards[0];

// After
const getActiveBoard = (state: BoardStore): Board => {
  const activeBoardId = useUIStore.getState().activeBoardId;
  return state.project.boards.find((b) => b.id === activeBoardId) ?? state.project.boards[0];
};
```

### 5. boardStore persist v15 migration

```ts
// 第 15 個版本，從 v14 的 project.activeBoardId / project.openBoardIds 把資料搬到 uiStore
if (version <= 14) {
  const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
  if (s.project) {
    const activeBoardId = s.project.activeBoardId;
    const openBoardIds = s.project.openBoardIds;
    // 寫入 uiStore（不覆蓋使用者後續可能已存在的選擇）
    const uiState = useUIStore.getState();
    if (!uiState.activeBoardId && activeBoardId) {
      useUIStore.setState({ activeBoardId, openBoardIds: openBoardIds ?? [activeBoardId] });
    }
    // 從 boardStore 持久狀態裡刪掉這兩個欄位
    delete s.project.activeBoardId;
    delete s.project.openBoardIds;
  }
}
```

### 6. uiStore persist 設定

uiStore 加 `persist` middleware：

- **key**: `event-storming-ui`
- **partialize**: 只持久化 `activeBoardId` 與 `openBoardIds`，**不**持久化 `zoom` / `panX` / `panY` / `selectedNoteIds` / `activeToolType` / `isDraggingCanvas` / `isLinkingMode` / `linkFromId` / `linkFromType` / `selectedElementId` / `selectedElementType` / `currentView` / `activePath` / `activeActorFilter`
- **version**: 1（uiStore 第一次有 persist）

### 7. MCP server 載入時 strip 殘留欄位

`mcp-server/src/index.ts` 的 `migrateProject` 函式（或 `loadProject`）讀檔後 delete 殘留的 `activeBoardId` 與 `openBoardIds`：

```ts
function migrateProject(p: Project & { activeBoardId?: string; openBoardIds?: string[] }): Project {
  // ... 既有 migration
  delete p.activeBoardId;
  delete p.openBoardIds;
  return p;
}
```

之後 saveProject 自然不會再寫進 `project.json`。

### 8. MCP `set_active_board` broadcast 行為（決策 a：保留）

server 端 `es_switch_context` MCP tool 仍呼叫 `broadcast('set_active_board', { id })`。FE 端 dispatch 收到後仍呼叫 `boardStore.setActiveBoard(id)` —— 該 action 內部會寫入 uiStore，所以**所有 connected client 的 active tab 都會跟著切**。

理由：AI 透過 MCP 切 context 是「明確、有意圖的全域動作」，與 user 滑鼠誤點切 tab 性質不同；保留 broadcast 維持 AI 工作流。若未來要區分「per-user」vs「broadcast」可加 scope 旗標，本任務不做。

---

## 改動檔案

| 檔案路徑 | 改動描述 |
|---|---|
| `src/types/board.ts` | 從 `Project` 移除 `activeBoardId` 與 `openBoardIds`；在 `UIState` 新增同名欄位 |
| `src/store/uiStore.ts` | 新增 `activeBoardId` / `openBoardIds` 初始值與 setter；加 `persist` middleware（key `event-storming-ui`，partialize 只含這兩個欄位）|
| `src/store/boardStore.ts` | 28+ 處 `state.project.activeBoardId` / `state.project.openBoardIds` 改用 `useUIStore.getState()`；`setActiveBoard` / `openBoard` / `closeBoard` 等 actions 內部改寫入 uiStore；`addBoard` / `addActorBoard` / `deleteBoard` 內部對 openBoardIds 與 activeBoardId 的維護改透過 uiStore；persist v14→v15 migration 把舊欄位搬到 uiStore 並從 project 刪除 |
| `src/utils/apiSync.ts` | relay 同步的 `getActiveBoard` 查詢（`store.project.boards.find((b) => b.id === store.project.activeBoardId)`）改用 `useUIStore.getState().activeBoardId` |
| `src/components/Homepage/Homepage.tsx` | board 列表的 `isOpen` 計算（`project.openBoardIds.includes(board.id)`）改用 `useUIStore` |
| `src/components/TabBar/TabBar.tsx` | tabbar 渲染與 close 邏輯中的 `project.openBoardIds` 兩處引用改用 `useUIStore`；close / activate 動作仍呼叫 `useBoardStore` 的 actions（簽名不變，只是內部走 uiStore）|
| `src/components/PathBar/PathBar.tsx` | `useMemo` 取 active board、context dot 的 `isSelected` / `background` / `color` / `fontWeight` 與 hover handler 對 `project.activeBoardId` 的所有引用改用 `useUIStore` |
| `mcp-server/src/index.ts` | `migrateProject` 載入時 delete 殘留 `activeBoardId` 與 `openBoardIds`，避免舊 `project.json` 造成 type 雜訊 |

---

## 實作步驟

### Step 1 — `src/types/board.ts`

1. 從 `Project` interface 刪除 `activeBoardId: string` 與 `openBoardIds: string[]` 兩行
2. 在 `UIState` interface 末尾新增：
   - `activeBoardId: string`
   - `openBoardIds: string[]`
3. **不**修改 `BoardStore` interface（actions 對外簽名保留）

### Step 2 — `src/store/uiStore.ts`

1. import `persist` from `zustand/middleware`
2. 在 `UIStore` interface（既有 `extends UIState`）內已自動帶入新欄位，不需另外加；只需確認新增的 internal setter：
   - `setActiveBoardIdInternal: (id: string) => void`
   - `setOpenBoardIdsInternal: (ids: string[]) => void`
3. 在 `useUIStore` 的初始 state 新增：
   - `activeBoardId: ''`（空字串，由 boardStore 第一次載入時或 v15 migration 寫入）
   - `openBoardIds: []`
4. 新增 setter 實作：
   - `setActiveBoardIdInternal: (id) => set({ activeBoardId: id })`
   - `setOpenBoardIdsInternal: (ids) => set({ openBoardIds: ids })`
5. 在 `create<UIStore>(...)` 外層套 `persist`：
   ```ts
   export const useUIStore = create<UIStore>()(
     persist(
       (set, get) => ({ /* 既有 store body */ }),
       {
         name: 'event-storming-ui',
         version: 1,
         partialize: (state) => ({
           activeBoardId: state.activeBoardId,
           openBoardIds: state.openBoardIds,
         }),
       }
     )
   );
   ```

### Step 3 — `src/store/boardStore.ts`（行為不變，實作改）

1. **import**：在頂部加 `import { useUIStore } from './uiStore'`（注意：避免循環 import；uiStore 不該 import boardStore）
2. **boardStore 初始 state**（既有 `initialBoard` 建立後的 `project` 物件）：
   - 從 `project` 物件移除 `activeBoardId` 與 `openBoardIds` 兩個 key
   - 新增模組級初始化：在 `useBoardStore` create 之後、export 之前，檢查 `useUIStore.getState().activeBoardId === ''`，若是則 `useUIStore.setState({ activeBoardId: initialBoard.id, openBoardIds: [initialBoard.id] })`
3. **`getActiveBoard` helper**（既有 `state.project.boards.find((b) => b.id === state.project.activeBoardId) ?? state.project.boards[0]`）：改為先 `const activeBoardId = useUIStore.getState().activeBoardId`，再 `state.project.boards.find((b) => b.id === activeBoardId) ?? state.project.boards[0]`
4. **`setActiveBoard` action**：改為 `useUIStore.setState({ activeBoardId: id })`，不動 boardStore 自身 state
5. **`openBoard` action**：
   - 取 `useUIStore.getState().openBoardIds`，若不含 `id` 則 `useUIStore.setState({ openBoardIds: [...prev, id], activeBoardId: id })`
   - 不動 boardStore project state
6. **`closeBoard` action**：
   - 從 uiStore 的 `openBoardIds` 過濾掉 `id`
   - 若被關的是 active，計算 fallback（取剩餘 openBoardIds 第一個 → boards 第一個）
   - 同步寫入 uiStore
7. **`deleteBoard` action（cascade openBoardIds + activeBoardId）**：
   - 從 boardStore 的 `state.project.boards` 刪除 board（既有邏輯保留）
   - 從 uiStore 的 `openBoardIds` 過濾掉被刪的 ids
   - 若被刪的包含 active，計算 fallback 並 `useUIStore.setState`
8. **`addBoard` action**：
   - 仍 push board 到 `state.project.boards`
   - 但「自動把新 board push 到 openBoardIds + 設為 active」改成 `useUIStore.setState({ openBoardIds: [...prev, newBoard.id], activeBoardId: newBoard.id })`
9. **`addActorBoard` action**：同 `addBoard`，新 sub-board push 進 uiStore.openBoardIds 並 active
10. **約 50 處 `state.project.boards.find((b) => b.id === state.project.activeBoardId)` 散在多個 store actions（如 `addNote`、`updateNote`、`deleteNote`、`addLink`、`addRemodel` 等）**：
    - 改為 helper 函式：在 boardStore 模組頂部宣告 `const findActiveBoard = (state: BoardStore) => { const id = useUIStore.getState().activeBoardId; return state.project.boards.find((b) => b.id === id); }`
    - 替換所有 call site（用 sed 或手動 search-replace）
11. **persist init defaults**（既有 v0→v3 大型 migration 的 return value 內含 `activeBoardId: defaultBoard.id` 與 `openBoardIds: boards.map(...)`）：
    - 從 return value 中移除這兩個 key（不再屬於 project）
    - 改為在該 migration 內呼叫 `useUIStore.setState({ activeBoardId: defaultBoard.id, openBoardIds: boards.map((b) => b.id) })`
12. **既有 `version === 3` migration 的 `openBoardIds` fallback**（補上 v3 之前的 `openBoardIds` 預設值）：保留，但加註解說明 v15 之後此欄位會被 v15 搬走、v3 fallback 變成 transient
13. **新增 v15 migration**：
    ```ts
    if (version <= 14) {
      const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
      if (s.project) {
        const activeBoardId = s.project.activeBoardId;
        const openBoardIds = s.project.openBoardIds;
        const uiState = useUIStore.getState();
        if (!uiState.activeBoardId && activeBoardId) {
          useUIStore.setState({
            activeBoardId,
            openBoardIds: openBoardIds ?? [activeBoardId],
          });
        }
        delete s.project.activeBoardId;
        delete s.project.openBoardIds;
      }
    }
    ```
14. **`version: 14` → `version: 15`**

### Step 4 — `src/utils/apiSync.ts`

1. 找到 relay sync 區塊內的 `getActiveBoard` 查詢：`const board = store.project.boards.find((b) => b.id === store.project.activeBoardId);`
2. 改為：
   ```ts
   const activeBoardId = useUIStore.getState().activeBoardId;
   const board = store.project.boards.find((b) => b.id === activeBoardId);
   ```
3. 加 `import { useUIStore } from '../store/uiStore'` 在頂部

### Step 5 — `src/components/Homepage/Homepage.tsx`

1. 找到 board 列表渲染中的 `const isOpen = project.openBoardIds.includes(board.id);`
2. 改為：
   ```ts
   // 在 Homepage component body 頂部宣告
   const openBoardIds = useUIStore((s) => s.openBoardIds);
   // 在原 isOpen 計算處
   const isOpen = openBoardIds.includes(board.id);
   ```
3. 加 `import { useUIStore } from '../../store/uiStore'`

### Step 6 — `src/components/TabBar/TabBar.tsx`

1. 找到 tabbar 渲染的 filter：`(b) => project.openBoardIds.includes(b.id) && !b.parentContextId`
2. 改為先在 component body 頂部 `const openBoardIds = useUIStore((s) => s.openBoardIds);`，再用 `openBoardIds.includes(b.id)`
3. 找到 close handler 內的 `const remaining = project.openBoardIds.filter((i) => i !== id);` 同改用 `openBoardIds`
4. close / activate 動作仍呼叫 `useBoardStore().setActiveBoard()` / `closeBoard()`，**不需直接寫 uiStore**（boardStore 內部會處理）
5. 加 `import { useUIStore } from '../../store/uiStore'`

### Step 7 — `src/components/PathBar/PathBar.tsx`

1. 全檔 8 處 `project.activeBoardId`（含 `useMemo` 內查詢、context dot 的 `isSelected` / `background` / `color` / `fontWeight` 比較、hover handler）：在 component body 頂部宣告 `const activeBoardId = useUIStore((s) => s.activeBoardId);`
2. 將原本 `useMemo` 的 dependency `[project.boards, project.activeBoardId]` 改為 `[project.boards, activeBoardId]`
   - **注意（最終以 closure 分析為準）**：dependency 須包含 useMemo body 內所有 closure-captured 識別字；依當前 useMemo 程式碼僅引用 `project.boards` 與 `activeBoardId` 兩者，若實作時發現有其他引用必須一併加入
3. 將所有 inline `project.activeBoardId === currentContextId` 比較改為 `activeBoardId === currentContextId`
4. 將 hover handler 內 `project.activeBoardId !== currentContextId` 比較同上改用 `activeBoardId`
5. 加 `import { useUIStore } from '../../store/uiStore'`

### Step 8 — `mcp-server/src/index.ts`

1. 找到 `migrateProject` 函式
2. 在函式 body 最後（return 之前）新增：
   ```ts
   delete (p as { activeBoardId?: string }).activeBoardId;
   delete (p as { openBoardIds?: string[] }).openBoardIds;
   ```
3. 不需要刪 `project.json` 已存在的舊資料（下次 saveProject 自然會去掉）

---

## 失敗路徑

- **v15 migration 找不到 `project.activeBoardId`**（資料殘破或非預期版本）：fallback 為 boards[0].id，並寫 `console.warn('[boardStore v15] missing activeBoardId, falling back to first board')`，不擋啟動
- **uiStore localStorage 損毀或 schema 不符**：zustand persist 會丟掉舊資料、用初始 state（空字串），boardStore 第一次操作會寫入第一個 board id
- **`useUIStore.getState().activeBoardId === ''` 時 `getActiveBoard` 找不到 board**：fallback 為 `boards[0]`（既有 `getActiveBoard` helper 已是這個 fallback）
- **server `project.json` 含舊 `activeBoardId` / `openBoardIds`**：`migrateProject` strip 後不再出現在 React 收到的 sync_project payload，無感
- **跨 store 循環 import**：禁止 uiStore 反向 import boardStore；若必要請改為事件驅動（uiStore 發出 event，boardStore 訂閱）

---

## 不改動的部分

- `src/store/uiStore.ts` 既有的 `zoom` / `panX` / `panY` / `selectedNoteIds` / `activeToolType` / `isDraggingCanvas` / `isLinkingMode` / `linkFromId` / `linkFromType` / `selectedElementId` / `selectedElementType` / `currentView` / `activePath` / `activeActorFilter` 欄位與 actions 不動
- `BoardStore` interface 對外簽名（actions 名字、參數、回傳型別）完全不變
- `mcp-server` 的 MCP tool definitions、`broadcast()` 行為不變（含 `set_active_board` 仍 broadcast）
- React 元件對「點 tab → 切 active」的行為不變（仍呼叫 `useBoardStore().setActiveBoard()`）
- BE 的 `POST /api/board` handler、SSE 推播、relay mode 邏輯不動
- localStorage `event-storming-board` 的整體 schema 不變（只是少兩個欄位）

### Non-goals（行為層）

- 本 task 不包含跨 tab 同步 active board 的功能（兩 tab 各自獨立 active；MCP 切 context 仍會廣播是既有行為，本 task 保留）
- 本 task 不包含把 zoom / pan / activePath 等其他 UI state 也加進 persist
- 本 task 不包含 Phase 1 的 per-entity `_rev` versioning
- 本 task 不包含改變 TabBar / PathBar / Homepage 的視覺樣式或互動行為
- 本 task 不包含 MCP tool interface 變更（不新增 scope flag、不拆 set_active_board）

---

## 驗收標準

### Agent 必做（可機器執行）

```bash
# 1. 型別檢查
npx tsc --noEmit
cd mcp-server && npx tsc --noEmit && cd ..

# 2. Lint
npx eslint src/

# 3. Build
npm run build
cd mcp-server && npm run build && cd ..

# 4. 確認 Project schema 不再含 activeBoardId / openBoardIds
! grep -n "activeBoardId" src/types/board.ts
! grep -n "openBoardIds" src/types/board.ts

# 5. 確認 UIState 已新增這兩個欄位
awk '/^export interface UIState \{/,/^\}/' src/types/board.ts | grep -q "activeBoardId: string"
awk '/^export interface UIState \{/,/^\}/' src/types/board.ts | grep -q "openBoardIds: string\[\]"

# 6. 確認 boardStore 不再寫 state.project.activeBoardId / openBoardIds
! grep -n "state.project.activeBoardId" src/store/boardStore.ts
! grep -n "state.project.openBoardIds" src/store/boardStore.ts

# 7. 確認 boardStore 已 import uiStore
grep -q "from './uiStore'" src/store/boardStore.ts

# 8. 確認 boardStore version bumped to 15
grep -q "version: 15" src/store/boardStore.ts

# 9. 確認 uiStore 已加 persist
grep -q "persist" src/store/uiStore.ts
grep -q "event-storming-ui" src/store/uiStore.ts

# 10. 確認 React 元件不再從 project 讀這兩個欄位
! grep -rn "project\.activeBoardId" src/components/
! grep -rn "project\.openBoardIds" src/components/
! grep -n "store\.project\.activeBoardId" src/utils/apiSync.ts

# 11. 確認 mcp-server migrateProject 已加 strip
grep -A20 "function migrateProject" mcp-server/src/index.ts | grep -q "delete.*activeBoardId\|delete.*openBoardIds"
```

### Human 補做（需要人類介入）

- [ ] **跨 tab 獨立性**：開兩 tab 連到 dev stack（`http://localhost:5173`），Tab A 切換 Bounded Context tab，**Tab B 不跟著切**（最重要的回歸驗證）
- [ ] **單 tab refresh 持久化**：Tab A 切到 context X，refresh，仍停在 context X
- [ ] **兩 tab refresh 各自持久化**：Tab A active context X、Tab B active context Y，各自 refresh 後仍維持各自選擇
- [ ] **v14 → v15 migration**：清空 localStorage 後刻意手動塞入 v14 格式（含 `project.activeBoardId`），refresh，確認進入後仍開在原本 active 的 context（搬到 uiStore 成功）
- [ ] **deleteBoard 行為**：刪除目前 active 的 context，UI 切到 fallback context（uiStore 的 activeBoardId 對應更新）
- [ ] **closeBoard 行為**：點 TabBar 的 X 關閉某個 tab，該 tab 從 openBoardIds 移除；若被關是 active，切到剩餘第一個
- [ ] **addBoard 行為**：新增 Bounded Context，新 board 自動進 openBoardIds 且成為 active
- [ ] **MCP set_active_board 廣播仍生效**：透過 Claude Code 跑 `es_switch_context`，確認所有開啟的 browser tab 都跟著切（這是刻意保留的行為，見決策 8）
- [ ] **Homepage 開關 board**：在 Homepage 點某個 board 的「開啟」/「關閉」按鈕，TabBar 對應出現/消失
- [ ] **PathBar context dot active 樣式**：active context 的 dot 仍有 highlight 樣式（藍底）

---

## 已知限制

- **uiStore persist 只 partialize 兩個欄位**：`zoom` / `pan` / `activePath` 等仍是 ephemeral，refresh 後重置。若未來要持久化更多 UI state，再擴大 partialize 即可（無 schema 風險）
- **MCP `es_switch_context` 維持 broadcast 行為**：所有 connected client 都會被 AI 切走 active context。若未來想區分 per-user vs broadcast，需擴充 MCP tool 加 scope flag（本 task 不做，理由見決策 8）
- **server `project.json` 在第一次 React POST 後才會去除舊欄位**：load 時 strip 是即時生效，但磁碟檔案要等下次 saveProject 才會被清。對行為無影響，只是檔案上會殘留一段時間
- **跨 store 存取耦合**：boardStore actions 內部呼叫 `useUIStore.getState()`，造成 boardStore 依賴 uiStore（單向）。屬於可接受的耦合，符合「per-user UI state 由 uiStore 管理」的分界
- **依賴關係**：無前置 task，可獨立實作。建議在 Phase 1（versioning + per-entity `_rev`）之前完成，因為 Phase 1 設計需要乾淨的 ownership 分界
