---
topic: "Move activeBoardId / openBoardIds from Project to uiStore"
status: decided
created: "2026-04-30"
participants:
  - User (product owner)
  - Claude (Opus 4.7)
facilitator: Claude
rounds_completed: 1
---

# Move activeBoardId / openBoardIds from Project to uiStore

## 議題定義

### 背景

Phase 0 跨 tab 同步修好之後，發現一個衍生問題：**Tab A 切換 Bounded Context tab，Tab B 也跟著切換**。

trace 後確認根因：
- `activeBoardId` 和 `openBoardIds` 是 `Project` interface 的欄位（`src/types/board.ts:25-26`）
- React UI 切換 tab → `store.setActiveBoard(id)` → `state.project.activeBoardId` 改變
- `apiSync` 的 `[project]` useEffect → `POST /api/board`（整份 project）
- BE `broadcastExcept('sync_project', ...)` → Tab B 收到
- Tab B 套用 `loadProject(state)` → 自己的 `activeBoardId` 被 Tab A 的選擇覆蓋

這是「per-user UI state 被當共享 state 處理」的典型 bug。`activeBoardId` 和 `openBoardIds` 概念上跟 `uiStore` 已經放的 `zoom` / `pan` / `activePath` 同類，當初放錯位置而已。

### 目標

把 `activeBoardId` 和 `openBoardIds` 從 `boardStore.project` 搬到 `uiStore`，讓每個 tab / 瀏覽器有自己獨立的 active board 狀態，**不再被跨 tab 廣播覆蓋**。

### 範圍

**討論內：**
- 兩個欄位的位置遷移
- `setActiveBoard` / `openBoard` / `closeBoard` 三個 action 的歸屬
- localStorage migration（boardStore 目前 v14，需要 v15）
- MCP server (`project.json`) 上殘留欄位的處理策略
- TypeScript 型別調整

**討論外：**
- Phase 1 versioning / per-entity `_rev`（獨立任務）
- 未來其他 UI state 是否要也搬到 uiStore（沒就先不動）
- 跨 tab 的 active board 同步功能（如果要做，是另一個 feature，本任務先讓兩 tab 獨立）

### 約束

- 不可中斷既有 user 的 localStorage（migration 必須無痛）
- 不可改變 MCP tool 對 AI 端的 interface
- 不破壞 React UI 切換 tab 的行為（單 tab 內運作如常）
- TypeScript 型別保持嚴格（不可 `any` 過關）

---

## 設計決策

### 決策 1：採用 Option B（搬到 uiStore），不採用 Option A（wire-level strip）

**Option A**：在 `apiSync.ts` POST 時剝掉這兩個欄位、收到 `sync_project` 時保留本地值。10 行 code。

**Option B**：把欄位從 `Project` 移到 `uiStore`，28+ 處引用點改為跨 store 存取。半天工。

選 **B** 的理由：
1. **語義正確**：這兩個欄位本來就是 per-user UI state
2. **消除整類 bug**：未來再有 UI-local 欄位被加到 `Project` 也不會 leak（因為 schema 把它擋在外面）
3. **Phase 1 友善**：per-entity `_rev` 設計時，UI state 有獨立 store 比較好處理
4. **A 留下技術債**：「為什麼 POST 要 strip 兩個欄位」是個未來會被質疑的 wire-level workaround

### 決策 2：actions 留在 boardStore，但內部呼叫 uiStore

`setActiveBoard` / `openBoard` / `closeBoard` 三個 action **仍由 boardStore 暴露**，但實作改為：
- 讀取 / 寫入 `activeBoardId` / `openBoardIds` 都改走 `useUiStore.getState()` / `useUiStore.setState()`
- 仍可讀取 `state.project.boards` 做驗證（例如刪除 board 時要更新 active）

理由：
- React 元件呼叫 `useBoardStore().setActiveBoard()` 的習慣不變，外部 API 穩定
- 真要把 action 也搬到 uiStore，會需要 uiStore 引用 boardStore（雙向依賴），更糟

替代方案被否決：
- **把 actions 也搬到 uiStore**：會造成 uiStore 反向依賴 boardStore（為了讀 `boards` 做驗證），耦合度更差
- **拆 action 為兩半**（uiStore 處理 ID、boardStore 處理 board CRUD）：呼叫端得記住順序，容易出錯

### 決策 3：Migration v15 策略

boardStore 目前是 v14。新增 v15 migration：
- 從舊 persisted state 讀 `state.project.activeBoardId` 和 `state.project.openBoardIds`
- 寫入新的 `event-storming-ui` localStorage key（uiStore 的 persist）
- boardStore persisted state 中 **delete** 這兩個欄位（不留 undefined，徹底刪掉）
- 如果 uiStore 已有資料（user 之前手動建過），不覆蓋（first-run 才搬）

uiStore 也加 persist middleware（之前沒有）：
- key: `event-storming-ui`
- partialize 只持久化 `activeBoardId` + `openBoardIds`（不持久化 `zoom` / `pan` 等 ephemeral 狀態）

### 決策 4：MCP server `project.json` 的處理

server 的 `project.json` 目前會被 React POST 整份覆蓋，所以也含 `activeBoardId` / `openBoardIds`。FE 改完後 POST 不再帶這兩個欄位，但舊的 `project.json` 還有殘留。

策略：**load 時 strip**
- `mcp-server/src/index.ts` 的 `loadProject` 函式（或 `migrateProject`）讀檔後 delete 這兩個欄位
- 之後 saveProject 時自然不會再寫進去
- 不需要手動 migration script

理由：
- React FE 也不再讀 server 的 `activeBoardId`（不在 `Project` schema 裡）
- 留著只會佔空間 + 誤導後人

### 決策 5：型別調整

- `Project` interface 移除 `activeBoardId` + `openBoardIds`
- `UiState` interface 新增 `activeBoardId: string` + `openBoardIds: string[]`
- `BoardStore` interface 不變（actions 一樣暴露在 boardStore）
- `loadProject(project: Project)` 接受的型別不再含這兩個欄位（migration 時自動 strip 入站舊資料）

---

## 實作步驟（給 /write-spec 用）

1. **Types**：`src/types/board.ts` 移除 `Project.activeBoardId` + `Project.openBoardIds`；`src/store/uiStore.ts` 對應的 `UiState` interface 新增這兩個欄位
2. **uiStore**：新增 `setActiveBoardId(id)` / `setOpenBoardIds(ids)` 簡單 setter；加 persist middleware（key `event-storming-ui`、partialize 只含這兩個欄位）
3. **boardStore actions**：
   - `setActiveBoard(id)` 改為 `useUiStore.setState({ activeBoardId: id })`
   - `openBoard(id)` 改為讀寫 uiStore 的 `openBoardIds`
   - `closeBoard(id)` 同上
   - `addBoard(name)` 內呼叫的「自動 active 新 board」改用 uiStore
   - `deleteBoard(id)` 內的 `openBoardIds.filter(...)` 改用 uiStore
4. **Selectors**：`getActiveBoard` / 所有 `state.project.boards.find(b => b.id === state.project.activeBoardId)` 改用 uiStore（其中 28+ 處）
5. **React 元件**：TabBar、Board.tsx、Homepage.tsx 等讀 `activeBoardId` 的地方改用 `useUiStore`
6. **boardStore migration v15**：在 `persist` 的 `migrate` callback 加 case，把舊 v14 state 裡的 `project.activeBoardId/openBoardIds` 抽到 uiStore，刪除原欄位
7. **MCP server**：`migrateProject` 或 `loadProject` 讀檔後 delete `activeBoardId` + `openBoardIds`
8. **驗證**：
   - tsc / build / eslint 全綠
   - 兩 tab 切換 board 互不干擾
   - refresh 後保留各自 activeBoard（localStorage 還在）
   - MCP `es_switch_context` 仍正常（注意：這個 action 改 active board 在 server 端，但 server 不再持久化此欄位 → 需要決定是否仍 broadcast `set_active_board`）

### Step 8 衍生的開放問題

**MCP `es_switch_context` 的行為**：當 AI 下達切換 context 時，server `set_active_board` 廣播會被 FE 收到 → 應該套用？還是現在被視為 per-user UI state 不該由 AI 跨 tab 切？

待決策方案：
- **a) 仍套用（保留現行行為）**：AI 切 context 時所有 tab 都跟著切。和 user-driven 切 tab 行為不一致，但保留 AI 工作流。
- **b) 廢棄 broadcast**：移除 `set_active_board` 的 broadcast 與 dispatch case，AI 改 active 只影響它自己的 session。
- **c) 加 broadcast scope 旗標**：MCP tool 帶參數決定要不要廣播。

建議 **a)**：保留現行行為。AI 切 context 是「明確、有意圖的全域動作」，跟「user 滑鼠誤點切 tab」性質不同。但這個衍生問題可以在 spec 階段做最終確認。

---

## 驗收標準

1. Tab A 切 Bounded Context tab，Tab B 不跟著切
2. 兩 tab 各自的 activeBoardId 在 refresh 後恢復（localStorage persist）
3. v14 → v15 migration：用舊 localStorage 啟動時，原本 active 的 board 被搬到新位置且仍 active
4. tsc / build / eslint 全綠
5. 既有 store actions 對外 API 不變（外部 React 元件不用改用法）
6. MCP `es_switch_context` 仍能正常工作（依決策 a/b/c 的選擇）

---

## 開放問題（spec 階段需確認）

1. MCP `es_switch_context` 的 broadcast 行為（決策 a/b/c，建議 a）
2. uiStore persist 是否要連 `zoom` / `pan` 都持久化？目前提案只 persist `activeBoardId` + `openBoardIds`
3. v15 migration 失敗時 fallback 行為：是清空回到首頁？還是用第一個 board？建議用第一個 board（保守）

---

## 參考檔案

- `src/types/board.ts:25-26` —— Project schema 中的兩個欄位
- `src/store/boardStore.ts` —— 28+ 處引用，需要逐一改
- `src/store/uiStore.ts` —— 目標位置
- `mcp-server/src/index.ts` —— `migrateProject` / `loadProject` 需要 strip
- `docs/discussions/2026-04-28-sync-mechanism-evaluation.md` —— 上一輪 sync 討論的脈絡
