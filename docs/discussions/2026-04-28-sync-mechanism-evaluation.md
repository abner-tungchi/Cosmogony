---
topic: "多人協作同步機制評估與設計"
status: in-progress
created: "2026-04-28"
updated: "2026-04-28"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 1
---

# 多人協作同步機制評估與設計

## 議題定義

### 背景

User 從 Host A 連線到 Host B 的 Docker 部署環境，多人同時在同一畫布操作時發現「**有些操作會沒有確實完成，回到初始狀態**」。

初步分析現有同步機制（`src/utils/apiSync.ts`）：

**架構：**
```
React 改變 state
  → debouncedPost (500ms) 送整份 project 到 /api/board (state-based)
  → MCP server 收到後 broadcast 給其他 clients
     但 broadcast 是「單一 action + payload」(action-based)
```

**已知 bug**：`dispatch` 函式 switch 只涵蓋舊 v11 / v12 的 actions，新功能（Remodel / Invariant / Spec Bundle 相關等）的 broadcast action 完全沒處理。

**症狀推論：**
```
1. User A 改 invariant
2. server 廣播 'update_invariant' 給 User B
3. User B 的 dispatch 收到但沒對應 case → state 沒變
4. 500ms 後 User B 的 debouncedPost 送出「沒有 A 改動」的整份 project
5. server 替換 → A 的改動被洗掉
6. server 廣播給 A → A 看到自己剛改的東西「回到初始狀態」
```

### 目標

評估現有同步機制的根本問題並決定：

1. 短期修補方式（補齊 dispatch case，能否解決 80% 場景？）
2. 長期同步模型（state-based / action-based / CRDT 的 trade-off）
3. 傳輸層是否要升級（SSE → WebSocket）
4. 遷移路徑（從現況到目標方案的步驟）

### 範圍

**討論內：**
- 同步協議設計（協議層而非實作細節）
- 衝突解決策略
- SSE vs WebSocket vs CRDT
- 多人協作的 UX 容忍度（last-write-wins 是否能接受）

**討論外：**
- 具體的 OT/CRDT 演算法實作
- Authentication / Authorization
- 跨 Bounded Context 的協作隔離
- 離線編輯 / 同步衝突 UI

### 約束

- 現有架構：React + Zustand + Express + SSE
- 部署目標：Docker Compose（前端 nginx + 後端 mcp-server）
- 目前無 user authentication，無 access control
- User 是工程師背景但對 CRDT / OT 等概念不熟，討論結論要能被 user 拍板
- 維持 MCP stdio 路徑（單機 Claude Code 操作畫布）不破壞

### 子議題

- [ ] **子議題 1**：補齊 dispatch case 能解決多少現有問題？是否值得作為 baseline 短期 fix？
- [ ] **子議題 2**：同步模型選擇 — state-based snapshot / action-based events / CRDT，三者在本專案 context 的 trade-off
- [ ] **子議題 3**：傳輸層 — SSE 是否夠用？升級到 WebSocket 的必要性與成本
- [ ] **子議題 4**：遷移路徑 — 從現況推進到目標方案的具體步驟（含暫時並存策略）

---

## 討論紀錄

### Round 1 — Claude (Opus 4.7)

#### 子議題 1：補齊 dispatch 能解多少

**立場**：與 Codex/Gemini 一致 — 必要但不充分的 P0 hotfix。**真正的根因不是 dispatch case 缺漏，而是 echo loop。**

**論點**：
1. Gemini 的 grep 結果是權威：真正缺的 case 只有 **7 個**（add/update/delete_remodel、add/delete_flow_path、set_event_paths、set_event_phase）。我先前估「14+ 個」是錯的。
2. **更隱藏的 bug**：spec bundle 的 11 個 actions（addInvariant、approveInvariant、updateDtoFields 等）server 都 broadcast 成 `update_note` / `update_remodel`，dispatch 用 shallow merge 套到 store —— 看似正確，**但繞過了 store 的特殊邏輯**（如 approve 時 provenance 自動升 'ui'、setEntityAsAggregateRoot 的 cascade 等）。
3. **echo loop 的精確流程**（這是最痛的點）：
   ```
   T=0    User A 改 note X
   T=0    React state 變 → useEffect → debouncedPost 起算 (500ms)
   T=500  POST /api/board 到 server，整份 project (含 X)
   T=500  server 收到後 broadcastExcept('sync_project', ..., excludeClientId=A)
   T=510  User B 收到 sync_project → store.loadProject(整份)
   T=510  User B 此時若有 inflight 編輯 (尚未 POST) → 全被洗掉
   ```
   即使 dispatch case 都正確，這個 echo 仍存在。
4. **P0 必須三件套同時做**（Gemini 列得最完整）：
   - 補齊 7 個 dispatch case + 路由 spec actions
   - 加 `isApplyingRemoteRef` guard
   - 移除 `/api/board` POST 後的 echo broadcast

#### 子議題 2：同步模型選擇

**立場**：**action-based + server-authoritative**，與兩位完全一致。CRDT **明確不選**。

**論點**（不重複兩位已詳述的論證，補幾個策略視角）：

1. **Dogfood 自家概念的策略價值**：這個工具本身就是教 DDD 的。內部協議卻是 state snapshot，等於自家招牌不練。Action-based 與工具的 Command → DomainEvent 概念完全同構，**未來行銷 / 教學 / 維護人員都比較好理解**。
2. **AI-Human 協作的特殊性**：這個工具未來不只人類間協作，還有 AI agents（MCP）參與。Action-based 對 AI 的價值：
   - **可解釋性**：user 看得到「Claude 改了什麼」（一條條 command vs 一份 state snapshot）
   - **可審計**：哪個 agent 在哪個時間做了什麼，天然有 log
   - **可撤回**：AI 操作錯了能 undo
   - **可重放**：開發新功能時用真實 command log 測試
3. **CRDT 不選的最強理由**：這個工具的元素間有強引用（`groupEventId`、`commandId`、`entityId`、`linkedAggregateNoteId`），CRDT 的 weakly consistent 特性無法保證 referential integrity。會造成「孤兒 satellite」這類 bug，需要額外 GC layer。Gemini 已詳述，我同意。

#### 子議題 3：SSE / WebSocket

**立場**：**保留 SSE**。WebSocket 不是 must-have。

**論點**：
1. 兩位都對。我補一個容易忽略的點：**SSE 原生有 `Last-Event-ID` 機制**，重連時瀏覽器自動帶上，server 可從那個 ID 之後 replay。這是補洞的關鍵原語。
2. 實作 `Last-Event-ID` 的 server 端最小成本：給每個 broadcast 一個 monotonic ID（可以是 `projectVersion` 或自增 counter），SSE 推送時用 `id: <N>\n` 格式。重連時讀 `req.headers['last-event-id']`，從那個 ID 之後重 broadcast 即可。**這是 Phase 1 versioning 的天然附帶福利**。
3. user 跨主機 HTTP 部署的 nginx config（`/Users/abnertsai/JiaBao/Mendesky/EventStormingTool/nginx.conf`）我之前就有設 `proxy_buffering off` 與 `proxy_read_timeout 24h`，這部分穩。Gemini 提的 HTTP/2 啟用建議可考慮，但 short-term 不阻塞。

#### 子議題 4：遷移路徑

**立場**：**接受 Gemini 三 Phase 規劃**，但 Phase 0 的優先序有微調。

**Phase 0 優先序**：

```
P0.1 (1-3 行 code)：移除 /api/board POST 後的 echo broadcast
                    — 這個一改完，其他 client 收到自己 echo 的問題立刻消失

P0.2 (10 行 code)：加 isApplyingRemoteRef guard
                    — 即使有殘留 echo 場景也能擋住

P0.3 (~30 行 code)：補齊 7 個 dispatch case + 路由 spec actions
                    — 把無聲 desync 也修掉
```

P0.1 + P0.2 是「治標」最直接的修法，先做完馬上能解 user 的「畫面回到初始」症狀。P0.3 才需要實際接觸 store action，工作量較大但收益對應「Remodel / FlowPath 等 desync 場景」。

**Phase 1 / Phase 2 同意 Gemini 的設計**，包括 versioning + per-entity `_rev` + ClientCommand 統一通道。MCP 整合 in Phase 2 是必要的（不然 MCP 直寫 in-memory state vs 走 ClientCommand 仍會競態）。

#### 對其他 Agent 的回應

- **Codex**：你指出「dispatch case 中有 7 個是死碼」（dispatch 有但 server 不發）這個觀察精準。可同步在 P0.3 把死碼移除，避免維護混亂。
- **Gemini**：grep 證據完整，特別是把所有 broadcast call site 列出對齊 dispatch case，建立了 ground truth。Phase 0 三件套的要素列得完整，我只是把實作優先序明確排出而已。
- **共識**：三方對「P0 = 補 dispatch + guard + 移除 echo」、「目標 = action-based」、「不要 CRDT」、「保留 SSE 加 Last-Event-ID」完全一致，**不需要再 Round 2**，可進入 user 確認後直接實作。

---

### Round 1 — Codex (GPT-5.4)

#### 子議題 1：補齊 dispatch 能解多少

**立場**：值得做，但只應視為 baseline hardening，不是根治。它能修掉一批「server 明明有 broadcast，但 client 完全沒套用」的 deterministic bug；對真正的多人競態只治標不治本。

**論點**：
- 依目前程式，真正有 broadcast、但 `dispatch` 沒處理的 live actions 主要是 7 個：`add_remodel`、`update_remodel`、`delete_remodel`、`add_flow_path`、`delete_flow_path`、`set_event_paths`、`set_event_phase`。
- 這代表「Remodel / FlowPath / phase / paths 類操作在其他 client 看不到」這種症狀，補齊後會明顯改善。
- 但討論文裡提到的 Invariant / DTO / AggregateIdentity 類更新，**在目前 server 實作裡多半不是獨立 action**，而是走 `update_note`，所以「補 dispatch case」對這些問題的幫助其實有限。
- 工作量本身不大。如果只補齊上述 7 個 action，屬於低到中工作量，值得做；但若要讓它真的可當 baseline，至少還要一起補「remote apply 不要再觸發整份 POST」與「action 必須能定位到正確 board」，否則很快又會被其他 race 抵消。

**剩餘問題清單**：
- `sync_project` 會 `loadProject`，而 `project` 一變又會觸發 debounced `POST /api/board`；這會造成 remote apply 後的 echo / ping-pong，同步風暴風險比缺 case 更根本。
- 現在是 whole-project last-write-wins replace；兩人同時改不同欄位、不同 note，仍可能互相洗掉。
- action payload 幾乎都沒有 `boardId`；client store 多數 action 又是對 `activeBoardId` 操作。多 board 情境下，即使補齊 case，仍可能套到錯 board 或直接找不到目標。
- 沒有 `opId` / `revision` / `baseVersion`，無法做 idempotency、去重、或 stale write 防護。
- SSE 斷線重連沒有 replay；漏事件後只能靠後續 snapshot 碰運氣補回。
- server 與 client 的 mutation semantics 已有漂移。例如 `delete_note` 在 server 端不做 client store 那些 cascade 清理，長期會造成狀態模型不一致。
- 初始載入只用 note 數量判斷「server 是否比較新」，會漏掉 remodel / flowPath / invariant 等非 note-count 型差異。

#### 子議題 2：同步模型選擇

**立場**：`hybrid`，以 **action-based 為主、snapshot 為輔**。不建議繼續把 whole-project snapshot 當主要同步模型；也不建議此時直接跳 CRDT。

**論點**：
- **純 state-based snapshot** 的優點只有簡單，但你們現在遇到的核心問題正是它的典型缺點：整份 replace 容易 stale overwrite，尤其在多 client + debounce 下更明顯。
- **action-based events** 最符合現況演進路徑。MCP tools 本來就已經是「做一個 domain action」；把 browser 端也收斂到同一條 action pipeline，成本最低、收益最大。
- 對 Event Storming 這種畫布工具，多數操作其實是「物件級 mutation」：新增 note、移動 note、更新欄位、改 phase、改 remodel 結構。這類衝突用 server sequencing + LWW + per-op idempotency，通常就夠實用。
- **CRDT 不是必需品**。只有在你們明確要追求以下能力時，CRDT 投資才開始合理：多人同時編輯同一段長文字且不接受最後寫入者覆蓋、離線編輯後再合併、更細粒度 presence / cursor / shared text semantics。
- 本專案資料結構不只單一白板物件，還有 multi-board、spec bundle、Remodel 4-in-1、nested arrays。直接 CRDT 化不是不能做，但導入面遠大於「畫面同步」本身。

**Trade-off 表**：

| 方案 | 優點 | 主要問題 | 我建議 |
|---|---|---|---|
| state-based snapshot | 最簡單、容易 debug | stale overwrite、整份 replace 太粗 | 不適合當主模型 |
| action-based events | 最符合現況、可漸進演進 | 要補 `opId` / `revision` / `boardId` | 最適合 |
| CRDT | 衝突處理最強 | 投資大、模型重寫、MCP 整合更複雜 | 先不要 |

#### 子議題 3：SSE / WebSocket

**立場**：**現階段不必為了同步正確性而升級 WebSocket**。先把協議層修正，`SSE + POST` 仍可成立；更精確地說，是 `SSE + action POST` 夠用。

**論點**：
- 你們現在的痛點不是 transport 不雙向，而是 protocol 沒有 revision、idempotency、board targeting，且 snapshot / action 混雜。
- WebSocket 不會自動解決 race condition。若協議不改，只是把同樣的錯誤搬到另一條線上。
- SSE 很適合「server authoritative push」：簡單、天然 ordered、proxy 友善、瀏覽器端成本低。
- client → server 用 HTTP POST action 也沒問題，重點是 POST 的內容要從「整份 project」改成「單一 action + metadata」。
- 只有當你們之後要做即時 presence / cursor / typing indicator、ack / nack / backpressure、或單連線承載雙向所有事件時，WebSocket 才明顯更值得。

#### 子議題 4：遷移路徑

**立場**：長期目標應該是 **server-authoritative action log + snapshot bootstrap**。可以漸進遷移，且能維持舊版相容一段時間。

**步驟建議**：
1. 短期 baseline：補齊 7 個缺失的 dispatch actions，並加上 unknown action logging。
2. 同一輪一起做：remote apply 不再觸發整份 repost；否則 dispatch 補齊後仍會被 echo / overwrite 問題干擾。
3. 為 action envelope 補上最少 metadata：`opId`、`clientId`、`boardId`、`serverRevision`。
4. 抽一個單一路徑 `applyAction()` 在 server 端統一執行；MCP stdio、HTTP client、未來任何入口都走同一套 domain mutation。
5. browser 新版改成 `POST /api/actions`，不再每次 state change 都 `POST /api/board`；`GET /api/board` 只保留 bootstrap / full resync。
6. SSE 改推 `action_applied` 事件，帶 revision；client 依序套用，缺 revision 時要求 full snapshot。
7. 舊版相容：暫時保留 `POST /api/board`。server 可把它視為 legacy snapshot write，廣播 `sync_project`；新版 client 同時支援 `sync_project` 與 `action_applied`。
8. 等新版 client 普及後，再把 `sync_project` 降為 fallback / recovery，不再當主路徑。
9. 若未來確認需要多人同編長文字、離線合併，再評估把特定欄位或特定子模型 CRDT 化，而不是一開始 whole-project CRDT。

**MCP stdio 路徑整合**：
- 不應讓 MCP 走另一套私有同步模型。
- 最乾淨的方式是：MCP tool 不直接改 `projectState`，而是呼叫與 HTTP `/api/actions` 相同的 `applyAction()`。
- 在 relay / stdio 場景下，只是 action 的來源不同；同步協議本身不該不同。這樣 Claude Code、瀏覽器、未來其他 agent 才會共享同一個一致性模型。

---

### Round 1 — Gemini (with grep ground truth)

#### 事實查核（grep 結果）

**MCP server 實際 broadcast 的 19 種 action**：
```
add_board, add_flow_path, add_link, add_note, add_remodel,
clear_board, delete_board, delete_flow_path, delete_link,
delete_note, delete_remodel, rename_board,
set_active_board, set_event_paths, set_event_phase,
set_project_name, sync_project,
update_note, update_remodel
```

**`apiSync.ts` dispatch 涵蓋的 19 個 case**：
```
add_note, update_note, delete_note,
add_command_for_event, update_command_information, update_event_properties, link_entity_to_event,
add_link, delete_link,
set_board_name, set_project_name,
clear_board,
add_board, delete_board, close_board, open_board, set_active_board, rename_board,
sync_project
```

**真正的 Gap（server broadcast 但 dispatch 不認識，會被無聲忽略）**：

| 缺漏的 action | 影響範圍 |
|---|---|
| `add_remodel` | Read Model 卡片新增 |
| `update_remodel` | Remodel 4-in-1 全套（含 Spec Bundle behavior / parameters / returnType）|
| `delete_remodel` | Remodel 刪除 |
| `add_flow_path` | FlowPath 新增 |
| `delete_flow_path` | FlowPath 刪除 |
| `set_event_paths` | FlowPath 批次操作 |
| `set_event_phase` | Phase 批次操作 |

**死碼（dispatch 有但 server 不會 broadcast）**：`add_command_for_event`、`update_command_information`、`update_event_properties`、`link_entity_to_event`、`set_board_name`、`close_board`、`open_board` — 共 7 個。

**最關鍵的觀察**：所有 Spec Bundle 的 invariant / dtoFields / aggregateIdentity 等 **11 個 BoardStore actions**，server 全部走 `update_note` / `update_remodel` 通用 broadcast。dispatch 的 `update_note` case 是 `store.updateNote(p.id, p as Partial<StickyNote>)` —— shallow merge，但對應的 spec store actions（如 `approveInvariant` 自動升 provenance）**邏輯都被繞過**。

#### 子議題 1：補齊 dispatch 能解多少

**立場**：補齊是 **必要但不充分的 P0 hotfix**，能消除「無聲 desync」一類最容易讓 user 失去信心的症狀，但**無法解決 user 描述的「回到初始狀態」根因**。

**論點**：
1. 補齊 7 個 case + 11 個 spec routing，工作量 ≤ 1 天
2. 但「回到初始狀態」根因不在這裡，而在 `apiSync.ts:76-79` 的 useEffect **不區分 project state 是「使用者本地操作造成」還是「從 SSE 收到別人改動 dispatch 後造成」**
3. 真正的 echo loop：B 收到 A 的 broadcast → dispatch → state 變 → useEffect → 500ms 後 B 把「合併後的狀態」整份 POST 回去 → server `broadcastExcept('sync_project', ...)` → A 收到 sync_project payload → `loadProject` 把 A 自己 inflight 的編輯洗掉
4. **補齊 dispatch case 反而會放大這個問題**（原本沒處理的 action 不會觸發 React state 改變、不會觸發 echo POST；補齊後會）
5. **必須三件套同時做**：(a) 補齊 dispatch；(b) `isApplyingRemoteRef` flag；(c) 移除 `/api/board` POST 後的 echo broadcast

#### 子議題 2：同步模型選擇

**立場**：**目標方案應為 action-based（command sourcing）+ server-authoritative 序列化**，搭配 per-entity 樂觀鎖。CRDT 在 Event Storming Tool 的 trade-off 上 **ROI 為負**。

**論點**：
1. **Event Storming Tool 的資料特性決定了模型選擇**：結構化高、元素間有強引用（CRDT 不擅長維護 referential integrity）、衝突真實存在但頻率低、無離線編輯需求
2. **State-based 的根本缺陷**：每次 POST 整份 project，network/serialize/conflict 三輸；無法表達「意圖」；**與自家 DDD 哲學矛盾**（自打嘴巴）
3. **Action-based 的契合度**：與 DDD 概念完全同構（dogfood）、既有 MCP tools 已經是 action-based、衝突可細到 field-level、可做 undo/redo / audit log / AI 可解釋性
4. **CRDT 成本/收益分析**：成本高（schema 重設計、TypeScript 強型別衝突、referential integrity 不保證、Zustand+immer 重構、持久化重做），收益在本專案 context 有限（主要贏在「同欄位同時編輯文字」，但這不是 ES Tool 主場）
5. **參考**：Miro / Excalidraw / tldraw 等同類工具多半也是 server-authoritative + per-element optimistic locking，不走 CRDT

#### 子議題 3：SSE / WebSocket

**立場**：**現階段 SSE 夠用，且應該優先選擇 SSE**。WebSocket 不是 must-have。

**論點**：
1. 痛點不是傳輸層不雙向，而是 application-layer 的 500ms debounce + 整份 Project POST
2. WebSocket 引入 nginx 反代要額外設 `Upgrade` header、處理 sticky session、CDN idle timeout，**部署摩擦增加**
3. **跨主機 HTTP 部署（user 情境）下 SSE 的特殊問題**：
   - `proxy_buffering off` 必設（user 的 nginx.conf 已設 ✅）
   - HTTP/1.1 下單 origin 6 連線限制（建議啟用 HTTP/2）
   - 缺少 reconnect 後補洞機制（這才是真痛點，不是 SSE/WS 差異）
4. **SSE 原生支援 `Last-Event-ID`**，反而比 WebSocket 更好做補洞
5. **何時值得升級**：要做 real-time multi-cursor / presence、voice/video metadata、collaborative drawing 筆畫 stream — **以上都不在當前需求**

#### 子議題 4：遷移路徑

**立場**：**漸進式三階段**，每階段都是可獨立交付的 release，不破壞 MCP stdio 路徑與向後相容。

**Phase 0 — 止血（1-2 天）**

- (1) 補齊 7 個 dispatch case + spec actions 路由
- (2) 加 `isApplyingRemoteRef` guard
- (3) 移除或改寫 `/api/board` POST 後的 `broadcastExcept('sync_project', ...)`
- (4) SSE reconnect 後 snapshot fetch
- (5) 驗證 nginx `proxy_buffering off; proxy_read_timeout 90s;` + HTTP/2

**Phase 1 — Versioning + Per-Entity Optimistic Lock（1-2 週）**

- Project + per-entity `_rev` 版本號
- `POST /api/ops`（diff）取代 `POST /api/board`（full）
- Server stale write 偵測 → 409
- SSE event 加 `version`，gap 觸發 snapshot fetch
- MCP 操作走相同 op 通道

**Phase 2 — Action-based 統一協議（1 個月，可選）**

- React store actions wrap 成 ClientCommand
- Server 單一序列化點 → ServerEvent broadcast
- MCP tools 改 emit ClientCommand（消除 MCP/React 競態）
- 持久化改 event log + snapshot（可選）

**向後相容**：
- Phase 0/1：localStorage / project.json schema 變動最小
- Phase 2：需要 migration script，但 MCP tool interface 對 AI 端零感知

**ROI 排序**：強烈建議至少做 Phase 0（CP 值最高，1-2 天解掉 80% 痛點）

---

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| 1 | 短期 dispatch fix 能解多少 | 必要但不充分；P0 必須三件套 | 必要，但 echo loop 才是根因 | 必要但不充分；解 60% 症狀，需配合 guard + 移除 echo | **agreed** |
| 2 | 同步模型選擇 | action-based + server-authoritative，不要 CRDT | hybrid 以 action-based 為主，先不 CRDT | action-based 為目標，CRDT ROI 為負 | **agreed** |
| 3 | SSE / WebSocket | 保留 SSE + Last-Event-ID 補洞 | 不必為同步正確性升級 WebSocket | SSE 夠用，加 Last-Event-ID + nginx 驗證 | **agreed** |
| 4 | 遷移路徑 | 接受三 Phase，調整 P0 內優先序 | 9 步漸進遷移，MCP 統一 applyAction | 3 Phase（P0 止血 / P1 版本號 / P2 統一協議）| **agreed**（細節對齊）|

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|
| 1 | **Phase 0 / P0 hotfix 三件套** — 補齊 dispatch case (7 個) + 路由 spec actions (11 個) + `isApplyingRemoteRef` guard + 移除 `/api/board` POST 後的 echo broadcast | 2026-04-28 | Round 1 | 三方一致；估時 1-2 天 |
| 2 | **長期目標**：action-based + server-authoritative 序列化，搭配 per-entity 樂觀鎖 | 2026-04-28 | Round 1 | 三方一致 |
| 3 | **不採用 CRDT**：Event Storming Tool 的資料特性（強引用、結構化、無離線需求）與 CRDT trade-off 不匹配。CRDT 是 rich text 協作的 sweet spot，不是結構化白板的 | 2026-04-28 | Round 1 | 三方一致 |
| 4 | **保留 SSE，不升級 WebSocket**：SSE 原生支援 `Last-Event-ID`，配合 versioning 即可解 reconnect 補洞問題。WebSocket 在 Event Storming Tool 場景是過度設計 | 2026-04-28 | Round 1 | 三方一致 |
| 5 | **三階段遷移路徑**：Phase 0（止血，1-2 天）→ Phase 1（versioning + per-entity `_rev`，1-2 週）→ Phase 2（action-based 統一協議，1 個月，可選）。MCP stdio 在 Phase 2 才整合進新協議，前面階段不影響 MCP | 2026-04-28 | Round 1 | 三方一致 |
| 6 | **MCP stdio 整合策略**：MCP tool 不改變對 AI 端的 interface；server 內部統一 `applyAction()` 路徑，MCP 與 React 共用同一序列化點 | 2026-04-28 | Round 1 | Codex/Claude/Gemini 一致 |
| 7 | **Phase 0 實作優先序**：P0.1 移除 echo broadcast → P0.2 加 isApplyingRemoteRef guard → P0.3 補 7 個 dispatch case + 路由 spec actions | 2026-04-28 | User 決策（Q1）| Claude 建議；user 同意 |
| 8 | **Phase 0 完成後立即接 Phase 1**（versioning + per-entity `_rev`）| 2026-04-28 | User 決策（Q2）| 不等觀察期；user 預期會有多人協作 |
| 9 | **刪除 7 個死碼 dispatch case**：`add_command_for_event` / `update_command_information` / `update_event_properties` / `link_entity_to_event` / `set_board_name` / `close_board` / `open_board`（server 從未 broadcast，移除以保持 dispatch 與 server broadcast 1:1）| 2026-04-28 | User 決策（Q3）| Claude 建議；user 同意 |
| 10 | **撤銷決策 #1 中的 P0.1**：BE 的 `broadcastExcept('sync_project', state, senderClientId)` **保留**，不移除。原本三件套設計中的 P0.1 在實測時導致 React UI 跨 tab 同步完全失效（React UI 只透過 full-project POST 與 BE 溝通，不打 per-action endpoint，broadcast 是唯一傳播管道）。P0.2 的 FE guard 已足以中斷 echo loop——B 收到 sync_project 時 guard 為 true，[project] useEffect 跳過 POST，不會再產生 ping-pong。Phase 0 最終定案：**P0.2（FE guard）+ P0.3（dispatch 補齊與死碼清理）**，BE 不動。 | 2026-04-29 | 實測發現 | curl 與兩 tab 瀏覽器驗證皆 PASS |

---

## Round 2 — 2026-04-29 實測修正

### 發現

兩 tab 驗證時（Tab A 加 note → Tab B 預期看到），Tab B 完全收不到。trace 後發現：

1. React UI 編輯**只**透過 `POST /api/board`（整份 project）送到 BE，沒有 per-action endpoint
2. P0.1 移除了 `broadcastExcept('sync_project', ...)` 後，BE 在收到 React UI 的 POST 時不再廣播任何東西
3. 個別 action broadcast（`add_note`、`update_remodel` 等）只在 **MCP tool handler** 裡呼叫，React UI 路徑沒走 MCP
4. 結果：**任何 React UI 編輯都不會到達其他 tab**

### Round 1 三方為何沒抓到

回頭審視 Round 1，三方都聚焦於「echo loop」的攻防，**沒人 trace「移除 broadcast 後，React UI 的跨 tab 同步走哪條路」**。隱含假設似乎是「個別 action broadcast 已經涵蓋 React UI」，但這個假設不成立。

Gemini 的 grep ground truth 列出了所有 broadcast call sites，全部都在 MCP tool handler 內，**沒有任何一個來自 React UI POST 路徑**。這件事在 grep 結果裡是看得到的，但討論時沒人在這個 angle 上停下來。

### 修正

撤銷 P0.1。BE 重新加回 `broadcastExcept('sync_project', state, senderClientId)`：
- `excludeClientId` 已經阻止 sender 收到自己的 echo
- P0.2 的 `isApplyingRemoteRef` guard 處理「B 收到後不要再 POST」這條 ping-pong 路徑
- 兩者搭配 = echo loop 斷掉，跨 tab 同步保留

### 教訓

未來討論「移除某個 broadcast / endpoint」時，必須明確列出**每個 client class（React UI / MCP / future agents）的傳播路徑**，確認移除後沒有 client 失去同步管道。

### 共識

Phase 0 定案 = **P0.2 + P0.3**（FE only），BE 不動。

---

## 開放問題

Round 1 三方一致，**沒有實質開放分歧**。剩下的是執行層細節：

### Q1：Phase 0 內部優先序
- Claude 建議：先做 P0.1（移除 echo broadcast，1-3 行 code）→ P0.2（guard，10 行）→ P0.3（補 dispatch，30 行）
- Gemini 列了 6 件事但沒明確排序
- **待 user 決策**：是否同意 Claude 的優先序？

### Q2：Phase 0 完成後是否立即進 Phase 1？
- 完成 Phase 0 後，可決定是否繼續做 Phase 1（versioning + `_rev`）
- Gemini 建議「等真的有 2+ 人同時編輯需求出現再做 Phase 1」
- **待 user 評估**：當前協作頻率是否需要 Phase 1？

### Q3：Phase 0 中是否一併修「死碼 dispatch case」？
- Codex 提到 dispatch 中有 7 個從未被 server broadcast 的 case
- 修 vs 不修的 trade-off：刪除減少維護混亂，但保留可避免未來 server 加 broadcast 時要再回頭加 case
- **待 user 決策**：建議刪除（保持 dispatch 與 server broadcast 1:1 對應）

---

## 下次討論指引

### 進度摘要

Round 1 完成，三方達成完全共識：
- **P0**：補齊 dispatch + isApplyingRemoteRef guard + 移除 echo broadcast（1-2 天）
- **長期**：action-based + server-authoritative + per-entity 樂觀鎖
- **不選**：CRDT（ROI 為負）、WebSocket 升級（過度設計）
- **遷移**：3 Phase 漸進，MCP 在 Phase 2 才整合

### 待處理事項

User 確認後直接進 Phase 0 實作。建議：
1. 確認 Q1（Phase 0 內部優先序）、Q2（是否立即進 Phase 1）、Q3（死碼 case 處理）
2. 派 frontend-engineer + backend-engineer 同時實作（可平行：FE 改 apiSync，BE 改 broadcast 邏輯）

### 閱讀建議

- Round 1 三方分析（特別注意 Gemini 的 grep ground truth）
- `src/utils/apiSync.ts:76-79`（echo loop 的 useEffect 起點）
- `mcp-server/src/index.ts:448`（POST /api/board 後的 echo broadcast）

### 注意事項

- Phase 0 是 user 部署到 production 後就該立刻 ship 的 hotfix
- Phase 1 / 2 等 user 觀察 Phase 0 效果後再評估啟動時間
- MCP 的 stdio 路徑在 Phase 0/1 完全不變，AI 端零感知
- **Phase 0 定案版本 = P0.2 + P0.3 only**（見決策 #10、Round 2）。BE 不要動 `broadcastExcept('sync_project', ...)`。
