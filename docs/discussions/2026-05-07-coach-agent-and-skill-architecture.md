---
topic: "Cosmogony Coach Agent + Skill 規劃審查"
status: consensus
created: "2026-05-07"
updated: "2026-05-09"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini (2.5 Pro)
facilitator: Claude
rounds_completed: 3
---

# Cosmogony Coach Agent + Skill 規劃審查

## 議題定義

### 背景
P1（已完成）讓 Coach 能讀 board snapshot、用文字建議。Plan 檔 `/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md` 已覆寫為新規劃：升級成「Agent + Skill」架構，讓 Coach 透過 Gemini function calling 呼叫 27 個 MCP tool subset 動畫布，但 mutating 操作必須使用者確認。

User 已決策：
- 27 tools 暴露範圍（read 3 + additive 10 + mutate 13 + destructive 1）
- 兩份 spec 切分（先 refactor 再 agent）

### 目標
找出 plan 中的盲區、矛盾、過度樂觀的假設、忽略的風險。最終產出「需修改項目」與「保留原方案」清單，方便回填到 plan 檔。

### 範圍
討論 `/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md`（剛覆寫）。User 已決策的兩個項目（tool subset 範圍 / spec 切分）不再爭議，但其副作用可挑戰。

### 約束
- 至多 3 輪收斂
- 每輪 Claude + Codex + Gemini 三方
- 結束時產出「需修改項目」與「保留原方案」清單

### 子議題

- [ ] 1. Spec A/B 切分合理性
- [ ] 2. 27 tools subset 副作用（switch_context / 全 destructive 排除）
- [ ] 3. Read-only auto-exec 風險（context window / maxSteps）
- [ ] 4. Pending action 跨輪設計（user-role context block）
- [ ] 5. Action Card UX（inline vs panel；scroll 推爆）
- [ ] 6. boardSnapshotHash collision（FNV-1a 簡化 hash）
- [ ] 7. Audit log 不做 undo 是否埋雷
- [ ] 8. system_prompt tone 改寫風險

---

## 討論紀錄

### Round 1 — 2026-05-07

#### Claude 立場

| # | 子議題 | 立場 | 重點 |
|---|--------|------|------|
| 1 | Spec A/B | agree-with-conditions | spec A 多預留 hooks plug-in 位置；spec B 接管時明示「extends but does not break」 |
| 2 | 27 tools | agree | system prompt 明示「只能改 active board」+ 偵測跨 context 主動引導切換 |
| 3 | Read-only | agree-with-conditions | 同名 tool 重複 ≥2 次拒（resilience guard）|
| 4 | Pending injection | disagree user-role | 改 functionResponse 形式對齊 SDK semantic |
| 5 | Action Card UX | agree-with-conditions | inline + sticky banner（scroll always 看得到）；超過 3 張 collapse |
| 6 | Hash collision | should-improve | 升級 SHA-256 截 64 bit |
| 7 | Undo 不做 | agree-with-conditions | audit log 加 boardHashBefore，加「audit replay」工具當未來延伸點 |
| 8 | system_prompt tone | agree-with-conditions | 加守則「即使可 call tool，advisory 仍是 default」 |

#### Codex 立場（GPT-5.4 effort high，78K tokens）

**Plan readiness：7/10**

| # | 子議題 | 立場 | 關鍵論點 |
|---|--------|------|---------|
| 1 | Spec A/B | with-conditions | **真正交付物應是 `toolDefinitions.ts` 共享 registry**，含 `commitPolicy`/`broadcastPolicy`/`risk` metadata。Plan 預設「load → handler → save → sync → broadcast」單一節奏不成立 — `es_add_flow` (L1144) 和 `es_add_command_for_event` (L947) 中途就 broadcast。需 golden test 防 regression |
| 2 | 27 tools | with-conditions | 跳 switch_context 對；但所有 mutating tools 吃 `getActiveBoard()`（L636/793/1086/1868），跨 context 改不到。**修法二選一**：(a) 所有 exposed tool 加可選 `contextId` (b) prompt 明示「先請 user 切」+ UX 文案說「無法自動 cleanup」 |
| 3 | Read-only | agree-with-conditions | snapshot 已含 `rawActiveBoard` 還連 call get_board 浪費 token。**加 per-turn dedup guard**（同 tool+args+hash 回 cached），`maxReadCalls=2~3` |
| 4 | Pending injection | **disagree** | router L103 過濾 system role；硬塞 user role 會把「server status」偽裝成「user 發言」、污染 intent。**用 systemEvent 或 synthetic assistant event** |
| 5 | Action Card UX | with-conditions | CoachPanel 是單一長 scroll；pending 多會擠壓最新對話。**inline + sticky pending tray**（>2 件），舊 message 內 card 改摘要列 |
| 6 | Hash collision | **disagree（升級到 correctness 級）** | P1 FNV-1a 註解原本就只敢用在「unchanged hint」。confirm 不該主信任 client hash。**server 端從 live projectState 重算 strong hash**，client 的 currentBoardHash 只當 UI 提示 |
| 7 | Undo | with-conditions | 高後悔成本不只 delete_link，多個 overwrite 型 mutate 也是。**audit/pending 至少多存 `inversePatch`**，UI 先不做 undo 但 `revert-last-action` 列為 MVP extension point |
| 8 | system_prompt tone | with-conditions | 補 **decision ladder**（預設只分析/提問 → 模糊先澄清 → 明確要求才 propose）；更進一步**後端只在偵測到 mutation intent 才附 tool declarations**（conditional tool exposure） |

**Hidden assumptions Codex 抓到的**：
- (HA1) PendingActionStore mutex / audit single-writer 假設單一 process
- (HA2) Spec A 假設 38 tool 統一 adapter，但 broadcast 時序不一致（已列 #1）
- (HA3) 不補 contextId 隱含「user 要改的就是 active context」
- (HA4) X-Coach-User-Id 不是 auth；confirm endpoint 後信任邊界比 P1 更重要
- (HA5) confirm 後不回 LLM 在 Apply All 場景不一定成立

#### Gemini 立場（2.5 Pro，55K tokens）

**Plan readiness：7/10**

| # | 子議題 | 立場 | 關鍵論點 |
|---|--------|------|---------|
| 1 | Spec A/B | agree | 加 integration tests（refactor 前後 deep-compare boardState） |
| 2 | 27 tools | with-conditions（user-locked，採納部分） | switch_context 排除對；其他被排除的（如 set_event_phase）「過度保守」，但已 user-locked |
| 3 | Read-only | **agree（自承會犯）** | 「我的本能反應是再 call get_board」— 自己舉手承認；強約束系統 prompt：「除非快照過時，禁止 re-call」 |
| 4 | Pending injection | **STRONG disagree** | 「對我 role:user 是最高指令權重，會解讀為使用者追問，**嚴重干擾思考流程**」— Gemini 親自反對。**MUST functionResponse / tool role**：`{ role: "tool", tool_call_id, content: { status: "pending", actionId, humanReadableSummary } }` |
| 5 | Action Card UX | with-conditions | inline (新提案) + global banner (legacy) 互補；多 pending 包 group 容器；Apply All 嚴格按提議順序（actions 間可能有依賴） |
| 6 | Hash collision | **upgrade to 64-bit** | 32-bit 在生日問題下數萬次編輯後可能碰撞；**FNV-1a 64-bit 仍極快**，性價比高 |
| 7 | Undo | **strongest concern in plan** | 「es_delete_link 用 add_link 復原預設了記得 fromId/toId」；對 update_dto_fields 這種 batch-replace 手動復原幾乎不可能。**強烈建議 MVP 至少一步撤銷** |
| 8 | system_prompt | **disagree just-tone-change** | 「我的核心驅動力是 to be helpful；給強 tool 會傾向直接動手」。**負向約束**：「未釐清 user 真實意圖前絕不主動 mutate」+ **結構化指令**：1.總結 → 2.提問 → 3.提出 |

**Gemini 自我反省抓到的盲點**：
- (G1) 對隱式依賴理解差 — propose 「先 add_note 再 link_entity_to_event」user 只批准後者 → noteId 不存在 fail。**Orchestrator 必須處理部分批准與依賴失敗**
- (G2) 複雜參數生成 — `es_update_dto_fields` / `es_update_state_properties` 等 batch-replace 工具，**LLM 必須先看到當前 fields 才能正確生成**；如果 snapshot 不夠精細會 hallucinate

#### Round 1 收斂結果

**三方一致 agreed**（共識看板上會 mark agreed）：
- #1 Spec A/B 切分本身對，但**必須補 toolDefinitions registry + commitPolicy/broadcastPolicy** 才能 cover 既有 broadcast 時序差異（Codex 觀察）
- #3 Read-only 加 dedup guard + budget 收緊
- #5 Action Card inline + sticky banner 互補
- #4 Pending injection **必須改 functionResponse**（最強 must-fix；Gemini 親自反對 + Codex 補強原因）
- #8 system_prompt 補 decision ladder + 負向約束 + 結構化指令

**majority agreed（程度差異）**：
- #6 Hash collision — 三方都同意升級；**但 Codex 多一層**（server 重算 strong hash，不信 client）→ user 決策題
- #7 Undo — 三方都認為 plan 過度樂觀；**程度從「audit + inversePatch」到「one-step UI undo」**→ user 決策題

**保留 user-locked**：
- #2 27 tools 範圍維持；但**補 prompt 守則處理跨 context 引導**

**新增的 hidden risks**（Round 1 帶出來的）：
- N1 — **batch-replace 工具的 current-state injection**（Gemini G2）：`update_dto_fields` / `update_state_properties` / `update_command_information` / `update_event_properties` / `update_remodel_parameters` / `update_remodel_return_type` 等「整段替換」工具，propose 前 orchestrator 必須 inject 該 note 當前 fields，否則 LLM hallucinate 整段
- N2 — **依賴鏈處理**（Gemini G1）：Apply All 嚴格按順序、失敗中止；單一批准但有依賴未批准 → fail 處理
- N3 — **es_add_flow / es_add_command_for_event 中途 broadcast 不符單一節奏**（Codex #1）：Spec A 不能假設統一 adapter，需 commitPolicy/broadcastPolicy 標記
- N4 — **Confirm endpoint 信任邊界**（Codex HA4）：X-Coach-User-Id 不是真 auth，需文件警語

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| 1 | Spec A/B 切分 + tool registry | ✓ + hooks | ✓ + commitPolicy registry | ✓ + integration test | **agreed** — 補 toolDefinitions registry |
| 2 | 27 tools 範圍 (user-locked) | active board only | + contextId 或 prompt 守則 | (queried but locked) | **agreed** — prompt 守則處理跨 context |
| 3 | Read-only auto-exec | dedup ≥2 | dedup + maxReadCalls 2-3 | 自承會犯，需強約束 | **agreed** — dedup guard + budget 收緊 |
| 4 | Pending injection | functionResponse | systemEvent or assistant event | **STRONG**: tool role functionResponse | **agreed** — MUST functionResponse |
| 5 | Action Card UX | inline + sticky banner + collapse | sticky pending tray | inline + global banner + group | **agreed** — inline + sticky tray |
| 6 | Hash collision | 升 SHA-256 64-bit | server 重算 strong hash, 不信 client | 升 FNV-1a 64-bit | **majority** — 升 bit 全同意；server 重算待 user 決策 |
| 7 | Undo 不做 | audit replay 工具延伸 | inversePatch in audit + revert-last 延伸 | 至少一步 UI undo | **majority** — 比 plan 多做但程度待 user 決策 |
| 8 | system_prompt tone | advisory default 守則 | decision ladder + conditional tool exposure | 負向約束 + 結構化指令 | **agreed** — 三項合併 |

**狀態說明**：
- `agreed` — 三方達成共識
- `majority` — 兩方同意，一方保留意見
- `disputed` — 有根本分歧
- `pending` — 尚未充分討論
- `deferred` — 延後到後續議題

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|
| D1 | Spec A 多交付 `toolDefinitions.ts` 共享 registry，含 commitPolicy/broadcastPolicy/risk metadata | 2026-05-07 | R1 | Codex #1 + N3 — 不然會破壞既有 broadcast 時序 |
| D2 | Pending action 用 functionResponse / tool role 注入，不用 user-role context block | 2026-05-07 | R1 | Codex + Gemini 強烈反對；Gemini 親自舉手「會干擾思考」 |
| D3 | Read-only 加 per-turn dedup guard（同 tool+args+hash 回 cached），maxReadCalls=3 | 2026-05-07 | R1 | 三方一致 |
| D4 | Hash 32-bit FNV-1a → 64-bit FNV-1a（升 bit 部分） | 2026-05-07 | R1 | 三方一致；升 bit 成本近零 |
| D5 | Action Card UX：inline + sticky pending tray (>2 件)；舊 message 內 card 改摘要列；Apply All 嚴格按順序 | 2026-05-07 | R1 | 三方一致 |
| D6 | system_prompt 補：decision ladder + 負向約束（未釐清意圖前不主動 mutate） + 結構化 1.總結 → 2.提問 → 3.提出 + 跨 context 引導守則 | 2026-05-07 | R1 | 三方一致 |
| D7 | spec B 必含「batch-replace 工具的 current-state injection」邏輯（update_dto_fields 等 6 個 tool） | 2026-05-07 | R1 | Gemini G2 — plan 沒提 |
| D8 | spec B 必含「依賴鏈處理」邏輯（Apply All 嚴格按順序失敗中止；部分批准 + 依賴未批准的 NOT_FOUND 處理） | 2026-05-07 | R1 | Gemini G1 |
| D9 | 27 tools 維持 user-locked；prompt 加跨 context 引導守則「無法跨 board 改，請先切換」 | 2026-05-07 | R1 | Codex #2 妥協方案 |
| D10 | Confirm 流程改 server-side CAS（compare-and-swap）：pending 攜 baseBoardVersion + strongHash，confirm 時 server 比對當下狀態，失敗回 409 stale | 2026-05-07 | R2 | Codex Q1 補強 — Q1=(b) 升級到 correctness 級 |
| D11 | InversePatch 採 per tool invocation / per note mutation 粒度（不存整 board），用 `fast-json-patch` lib + entity-level snapshot 自動 compare | 2026-05-07 | R2 | Codex + Gemini 共識 |
| D12 | Spec A 邊界：交付 `commitPolicy / broadcastPolicy`；`risk metadata` 推 spec B（spec A 留 type placeholder 不被 runtime 讀） | 2026-05-07 | R2 | Codex 拆分；保 spec A「零功能變化」承諾 |
| D13 | Hash Domino 應對：parallel mutate 的 confirm 改 **TargetEntityHash 降級驗證**（只比對 target entity，不看全 board）+ Apply All 嚴格按順序依賴鏈 rebase | 2026-05-07 | R2 | Gemini 抓到致命傷；Q1=(b) 反加劇問題 |
| D14 | 6 個 batch-replace tool（update_dto_fields / update_state_properties / update_command_information / update_event_properties / update_remodel_parameters / update_remodel_return_type）schema description 加「**CRITICAL: REPLACES ENTIRELY, NOT a patch. Output FULL list, omitted items DELETED.**」 | 2026-05-07 | R2 | Gemini 自承偷懶 |
| D15 | LLMAdapter LLMReply 擴充為 `{ text, pendingActions[], modelUsed, tokenUsage, isFinished }`；adapter chat opts 加 tools? + toolConfig? | 2026-05-07 | R2 | Gemini 介面阻抗 |
| D16 | Audit log schema 加 `schemaVersion / toolVersion / inversePatchVersion / errorEnvelope` 欄位；用 `async-mutex` 嚴格序列化（cover 多 tab） | 2026-05-07 | R2 | Codex + Gemini 共識 |
| D17 | system_prompt 補：(a) Pending 行為禁令（pending 立即停 + 引導 click；rejected 必須詢問原因，嚴禁自動重試）(b) Anti-anchoring 聲明（user 明確要求重構時鼓勵大膽覆寫，不受 inject 的 current state 限制） (c) Mutating call 後強制中斷 loop 控制權回前端 | 2026-05-07 | R2 | Gemini 自承陷阱 |

---

## 開放問題

需要 user 決策（Round 1 三方對程度有分歧）：

### Q1 — Hash 升級到哪個程度？

兩個方案：
- **(a)**：只升 client-side hash 從 32-bit FNV-1a 到 64-bit FNV-1a。Confirm 時仍信任 client 傳的 currentBoardHash（fast path 比對）。成本近零，碰撞風險降到實務上消失
- **(b)**：a + 後端 confirm 時用 live projectState 重算 strong hash（SHA-256 截 64 bit），不信任 client hash。Codex 主張這是 correctness 級的差別 — 防 client 偽造或 stale。成本：每次 confirm 多一次 hash 計算（~ms 級）

### Q2 — Undo / 後悔機制做到哪個程度？

三個方案：
- **(a) plan 原案**：完全不做，只 audit log（無 inverse 資訊）
- **(b) Codex 折衷**：audit / pending 紀錄含 `inversePatch`（before-snapshot of mutated note 區段）；UI 不做 undo button，但留延伸點 `revert-last-action` for spec C
- **(c) Gemini 強烈建議**：(b) + UI 加「最近一次套用」undo button（spec B 內就做）

### Q3 — Round 2 是否要跑？

選項：
- **跑 Round 2**：focus on Q1/Q2 trade-off + 任何 user 想加的議題
- **跳 Round 2，由 user 直接回答 Q1/Q2**：把 Round 1 結論回填 plan，直接進入 spec A write-spec

User 答：Q1=(b)、Q2=(b)、Q3=跑 Round 2 focus 虛心審查。

### Round 2 — 2026-05-07

#### Codex 立場（GPT-5.4 effort medium，10K tokens）— readiness 7→**8/10**

**Q1+Q2 整合互動**：confirm 流程需 server-side **CAS（compare-and-swap）**，不能只重算 hash。pending 攜帶 `baseBoardVersion/strongHash`，confirm 時 server 比對當下狀態，失敗 fail stale。inversePatch 粒度：**per tool invocation / per note mutation**，不存整 board。

**新 hidden risks（4 個）**：
1. Gemini SDK 錯誤面 — args invalid JSON / enum 不符 / tool 拋例外 → 必須標準化 error envelope
2. Audit schema migration — 缺 `schemaVersion / toolVersion / inversePatchVersion / errorEnvelope` 欄位
3. Frontend stale 時機 — SSE 進來時就要標 stale/superseded，不等 confirm click
4. Parallel calls 共用 hash — 同輪多 mutate 共用 baseline、commit 順序未定，後寫者踩前寫者

**D1-D9 內部矛盾（3 處需收斂）**：
- D2 + D3：跨輪 pending 注入要用 **synthetic id namespace**，不能共用 Gemini 原生 functionCall id
- D4 + Q1=(b)：client 64-bit hash **退化**為 UI hint / dedup key，一致性看 server strong hash
- D7 + Q2=(b)：current-state injection（前向提示）vs inversePatch（回滾資料）**不可共用同一表示**

**Spec A/B 邊界 ambiguity**：
- `commitPolicy / broadcastPolicy` 在 spec A **OK**（描述既有行為）
- `risk metadata` 不該進 spec A runtime → spec B 加；spec A 可留 type placeholder（不被 runtime 讀）

#### Gemini 立場（2.5 Pro，自評 7→**9/10**）

**Gemini 自承的新行為陷阱**：
- (a) `functionResponse.status: pending` 解讀錯誤 — 我會誤以為「失敗」並重試；遇 `rejected` 我會「自作主張改參數重發」。**對策**：system prompt 強規則「pending 立即停止對話 + 引導點擊；rejected 必須詢問拒絕原因，嚴禁自動重試」
- (b) Decision ladder 與 dedup guard 衝突 — 同 turn 內 Ask + Propose 並行可能導致邏輯死胡同。**對策**：orchestrator 偵測到 mutating call **強制中斷迴圈**、控制權交回前端，不允許在同 loop 內再對話
- (c) Batch-replace inject 的「定錨效應」— 看到當前 fields 我會過度保守地補 patch、喪失重構勇氣。**對策**：注入 prompt 旁加聲明「你有絕對權力大膽覆寫，不需受限於現有結構」

**Round 1 漏題（4 個重大風險）**：
1. **Hash Domino 骨牌效應**（**最致命**）— 一輪 propose 5 個 mutate，全共用 `Hash_A`。User confirm #1 後 board → `Hash_B`，#2 必然 stale 409。**Q1=(b) 反而加劇此問題**。**解法**：limit Apply All 原子化、或改 **TargetEntityHash 降級驗證**（只比對該目標 entity 的 hash 是否被污染，不看全 board）
2. **LLMReply 介面阻抗** — 既有 single-shot reply 與 Agent loop 6 步迴圈不匹配。**解法**：擴充為 `{ text, pendingActions[], isFinished }`
3. **跨 Session Audit 並發** — 多 tab 寫入交錯。**解法**：`p-queue` / `async-mutex` 嚴格序列化
4. **functionResponse Schema 缺定義** → 我會幻覺。**解法**：強型別 `{ status: 'pending', uiContext: 'Requires user click Apply', actionId: string }`

**D7 LLM 視角（patch vs rebuild）**：
- LLM 偷懶傾向只輸出新增欄位（`Array.push` 心智），但 batch-replace 是**整段替換**
- **必須**在 6 個 update_* tool 的 schema description 加：「**CRITICAL: This tool completely REPLACES the existing array/object. It is NOT a patch. You MUST output the FULL list. Omitted items will be DELETED permanently.**」

**Q2=(b) inversePatch 設計建議**：
- **強烈建議用 `fast-json-patch` 庫 + Entity-Level Snapshot**
- 26+ 工具手寫 inverse 易產 bug
- 用 RFC 6902 patch 格式 + `compare(oldEntity, newEntity)` 自動產生
- Spec C 做 undo 時 `applyPatch(currentEntity, invertPatch)` 即可，與工具邏輯解耦

#### Round 2 收斂結果

**新增 8 條決策 D10-D17**（見「決策紀錄」）

**Q2=(b) 的具體實作方向已釐清**：
- Per tool invocation 粒度（不存整 board）
- 用 `fast-json-patch` lib + entity-level snapshot 自動 compare
- spec B 加 audit interceptor 攔截每個 mutating handler

**Q1=(b) 的補強已明確**：
- 不只「重算」，要 server-side **CAS** with versioning
- pending 攜帶 `baseBoardVersion + strongHash`
- confirm 失敗回 409 stale + UI 顯示 reset

**Hash Domino 問題的應對**：
- spec B 採 **TargetEntityHash 降級驗證**（不看全 board hash，只比對 target entity hash）
- Apply All 嚴格按順序、依賴鏈 rebase
- 補配套：parallel mutate proposals 的 entity 重疊偵測

**Spec A/B 邊界釐清**：
- D1 拆：`commitPolicy / broadcastPolicy` 進 spec A；`risk metadata` 進 spec B
- spec A 維持「零功能變化」承諾不破

**新增 8 個 hidden risks N5-N12**（對 Round 1 N1-N4 的補強）：
- N5：Gemini error envelope 標準化（args invalid / tool throw）
- N6：Audit schemaVersion / toolVersion 欄位
- N7：SSE-driven stale marking（前端不等 confirm click）
- N8：Synthetic functionResponse id namespace
- N9：functionResponse status schema 強型別
- N10：6 個 batch-replace tool description 加「REBUILD NOT PATCH」警告
- N11：Anti-anchoring 聲明（鼓勵 LLM 在 user 明確要求重構時大膽覆寫）
- N12：Pending 行為禁令（不重試 / 引導 click / 拒絕後問原因）

---

## 下次討論指引

### 進度摘要
Round 1 + Round 2 完成（共 2 輪）。Plan readiness：7/10 → 8/10（Codex）/ 7/10 → 9/10（Gemini）。共識看板 8 議題：6 agreed、2 majority。User 已決 Q1=(b) Q2=(b)。Round 2 補了 8 條 D10-D17 + 8 個 N5-N12 hidden risks。**討論結束、可進 write-spec**。

### 待處理事項
1. User 回答 Q1（Hash 升級程度）+ Q2（Undo 機制程度）
2. 決定是否跑 Round 2（focus 在 Q1/Q2）或跳過
3. 把 Round 1 結論 + Q1/Q2 答案回填到 plan 檔
4. 進入 spec A write-spec

### 閱讀建議
- `/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md`（plan 全文）
- 本檔案 Round 1 紀錄（含 D1-D9 決策 + Q1/Q2/Q3 開放問題）

### 注意事項
- 3 個 hidden risks 已升級為 spec B 必含項（D7、D8、D9）
- Pending injection 改 functionResponse 是 R1 最強共識，spec B 必須先做 LLMAdapter message model 擴展

---

### Round 3 — 2026-05-09（Spec B framing 三方驗證）

**前置**：Spec A（38 tool handler refactor + toolDefinitions registry，risk='unset' placeholder）已 ship。User 透過 `/grill-me` pre-flight 釐清了 Spec B 範圍，此 round 的目的是讓 Codex + Gemini 驗 grill 結論是否合理、有沒有盲區。

#### Grill 結論（待 R3 驗證）

**範圍 (F + D)**

| # | 決定 | 理由摘要 |
|---|------|---------|
| F1 | **Spec B = MVP-mid**：read 3 tools auto-exec + additive 10 tools propose-confirm | mutate/destructive/inversePatch/batch-replace 都推 Spec C；先驗 Apply All / stale / pending tray 的整套架構 |
| D1 | mutate 13 + destructive 1 + D7 batch-replace current-state injection + D14 schema warnings + inversePatch + UI undo 全推 Spec C | additive-only 的「undo = delete」自動屬於 destructive 範圍，Spec B 沒有 mutate/destructive 也用不到 inversePatch |
| D2 | **Lightweight audit 留在 Spec B**：events propose/confirm/reject/auto_exec_read，無 inversePatch | dogfood 階段 trace 必備；schemaVersion=1，Spec C 擴 v2 加 inversePatch |

**Action Card (A)**

| # | 決定 | 理由 |
|---|------|------|
| A1 | State machine 6 個：`pending / confirming / confirmed / rejected / stale / failed` | 去掉 superseded（additive 不互覆）+ expired（推 Spec C）|
| A2 | Reject 選填 textarea | (i) 強制必填擋 UX；(iii) LLM 主動問破壞 D17(c) 中斷 loop；(iv) 違反 D17(a)。reason 透過 functionResponse 餵 LLM 下輪 |
| A3 | Card 內容 (γ)：自然語言摘要 + collapsible raw args | additive 沒 before-state；prose 比結構化 diff 直接 |
| A4 | 已處理 card 縮成摘要列（Spec B 內就做）| 否則 sticky tray 永遠塞滿已處理 cards |
| A5 | Apply All 顯示 per-card 進度（每 card 自己 confirming → confirmed）| 重用既有 state，不需 progress bar 元件 |

**Pending lifecycle (B)**

| # | 決定 | 理由 |
|---|------|------|
| B1 | TargetEntityHash CAS 只對 4 個碰現有 entity 的 additive tool 做：`es_add_command_for_event`、`es_add_entity_for_event`、`es_add_invariant`、`es_link_entity_to_aggregate_root` | 6 個純新增無 target entity，handler NOT_FOUND 偵測足夠 |
| B2 | Stale 後可 force-apply（explicit `forceApply: true` flag + audit log）| additive 不破壞性，force 風險低 |
| B3 | Spec B 不設 pending timeout | 個人專案、單 user，timeout 是過度工程 |
| B4 | Multi-tab sync 重用既有 SSE，廣播 `coach_action_update` 事件 | 不增加 polling 負擔；既有 SSE 機制成熟 |
| B5 | async-mutex on PendingActionStore（D16 範圍從 audit 擴至 store）| FS-backed 場景下 status compare 不 atomic，mutex 一條 lock 解所有 race |
| B6 | FE store：actions 嵌 messages[].metadata.proposedActions[]（既有 schema），selector 派生 pending list | message 是 single source；D17(c) mutating call 後中斷 loop 表示 card lifecycle 不可離 message |

**Tool exposure (C + H)**

| # | 決定 | 理由 |
|---|------|------|
| C1 | **永遠附 13 tools schema**（不 conditional expose）| token cost ~2-3K negligible vs Gemini 2M context；false negative 成本高（Coach 沒幫 user 做事）；D6+D17 system_prompt 已是 R2 三方共識的安全機制；Spec C 若 dogfood 看到問題再加 |
| H1 | D7 + D14 + H 在 Spec B 寫一行 Non-goal 推 Spec C | MVP-mid 沒 batch-replace tool，自動消解 |

**Tech (G + E)**

| # | 決定 | 理由 |
|---|------|------|
| G1 | `zod-to-json-schema` lib 產生 Gemini FunctionDeclaration，啟動時 cache | zod ecosystem 事實標準；preserve `.describe()`；Spec A schema 變更不需手動同步 |
| G2 | Spec B 填全 27 risk metadata（read 3 / additive 10 / mutate 13 / destructive 1）；剩 11 個 unset | EventStormingSkill `buildDeclarations()` filter `risk in ['read','additive']`；Spec C 改 filter 即可，不用回頭補 metadata |
| E1 | Audit log：`mcp-server/data/coach/audit/audit-YYYY-MM-DD.jsonl` jsonl 日檔 + 跨日切檔（每次寫前檢查日期） | per-plan；不需 cron |
| E2 | gzip / 30 天輪轉推 Spec C 或手動 script | MVP 個人用幾 MB 不痛 |
| E3 | Audit event schema schemaVersion=1（lightweight，無 inversePatch）；Spec C 用 schemaVersion=2 擴 | 介面合約寫死，向前相容 |

#### R3 給 Codex / Gemini 的問題

1. **Spec B = MVP-mid 切點合理嗎？** 漏了什麼必要功能？或者過度切割導致 dogfood 不能驗到關鍵架構？
2. **Lightweight audit（無 inversePatch）有什麼盲區？** 例如 dogfood debug 真的夠嗎？
3. **State machine 6 個夠用嗎？** 有沒有真的會在 additive-only 場景觸發的狀態被遺漏（不是 superseded，是其他）？
4. **永遠附 tools schema 在 D6+D17 system_prompt 約束下，會不會 dogfood 看到 LLM 過度衝動？** 有沒有比 conditional exposure 更便宜的緩解？
5. **TargetEntityHash 範圍只對 4 個 tool 檢查**，這 4 個是否齊全？有沒有遺漏的 mutate 點？
6. **B6 FE store 嵌在 messages.metadata 的方案**，sticky tray 跨 message 查找的 selector 會不會有效能 / cache invalidation 問題？
7. **G2 Spec B 填全 27 risk** 但只 export 13 個 — 是否該改成 Spec B 只填 13 個（read+additive），其餘 14 個 risk 留 'unset'，spec C 補？哪個對 Spec B/C 邊界更乾淨？
8. **Async-mutex on PendingActionStore** 是否 cover 所有 race？例如 SSE broadcast 跟 confirm 的 ordering、Apply All 內部依賴鏈 rebase 的 lock granularity

  1068	  const notFound: string[] = [];
  1069	
  1070	  for (const id of ids) {
  1071	    const note = board.notes.find((n) => n.id === id);
  1072	    if (note) {
  1073	      note.phase = phase;
  1074	      note.updatedAt = now;
  1075	      updated.push(id);
  1076	      continue;
  1077	    }
  1078	    const remodel = board.remodels.find((r) => r.id === id);
  1079	    if (remodel) {
  1080	      remodel.phase = phase;
  1081	      remodel.updatedAt = now;
  1082	      updated.push(id);
  1083	      continue;
  1084	    }
  1085	    notFound.push(id);

codex
#### Codex 立場（GPT-5.4 effort high，~22K tokens）— readiness 7/10

**整體 readiness 評分**: 7/10。R3 把 Spec B 切成「agent shell + additive-only dogfood」這個方向是對的，因為它仍能驗證最核心的四件事：tool calling loop、pending lifecycle、confirm/apply UX、跨 tab/state drift；但幾個結論把「additive-only = 低風險」講得太滿。現在的 exposed handlers 裡，至少 `es_link_entity_to_aggregate_root` 與 `es_add_link` 仍可寫出 dangling/invalid references，而且 `messages[].metadata.proposedActions[]` 若直接當 runtime store，會把歷史訊息容器和高頻狀態更新耦死。換句話說，MVP-mid 可做，但 B1/B5/B6/C1 需要收斂成更精確的工程邊界。

**逐條結論驗證**

| # | grill 結論 | 立場 (agree / with-conditions / disagree) | 重點論點 |
|---|------|---------|----------|
| F1 | Spec B = MVP-mid | with-conditions | 切點合理，因為仍能驗證 orchestrator、pending、Apply All、SSE、audit 這幾個真正的新架構；但 acceptance 必須刻意包含一條「命中既有 entity 的 additive tool」路徑，不然驗不到 stale/CAS 真價值。參考目前單輪 `/message` 仍是純 chat，尚未有任何 action lifecycle：`mcp-server/src/coach/router.ts:56-157`。 |
| D1 | mutate/destructive/inversePatch 推 Spec C | with-conditions | 原則對，但要先把「偽 additive」關掉。`es_link_entity_to_aggregate_root` 允許 `aggregateRootNoteId=""` 做 unlink，這其實已是 mutate/destructive 語義；handler 還不驗 target 是否存在。`mcp-server/src/coach/tools/toolDefinitions.ts:560-568`、`mcp-server/src/coach/tools/handlers.ts:1283-1315`。 |
| D2 | Lightweight audit 留 Spec B | with-conditions | 同意。沒有 audit，dogfood 幾乎無法 debug「為何卡 stale / force / failed」。但 v1 至少要記 `sessionId`、`messageId`、`actionId`、`toolName`、`args`、`status transition`、`base hash/version`、`forceApply`、`errorEnvelope`；否則只會知道「發生過」，不知道「為何發生」。 |
| A1 | State machine 6 個 (no superseded/expired) | with-conditions | 6 個狀態夠，但前提是把 transition table 寫死，特別是 `stale -> confirming -> confirmed/failed` 與 batch stop-on-first-failure。若只列 enum、不列轉移規則，之後 FE/SSE/store 很容易各自實作不同。原 plan 的 8-state 在 `~/.claude/plans/fizzy-snuggling-donut.md:103-106`，R3 縮成 6-state 可以，但要補 formal transitions。 |
| A2 | Reject 選填 textarea | agree | 這和 D17(c) 一致。強制必填會把「拒絕」從一個 low-friction safety valve 變成 UX 阻力。reason 可作為下一輪 functionResponse 附帶欄位，不需要在拒絕當下觸發新對話。 |
| A3 | Card 內容 (γ) 摘要+raw args | with-conditions | 方向對，但只放 prose + raw args 不夠。還要有最少 machine-readable target 摘要，例如 `targetIds[]` / `subjectLabel`，不然 stale/force 時使用者很難判斷是在套哪個既有 event/aggregate。現有 `ProposedAction` 只有 `{ id, toolName, args }`，資訊太薄：`src/types/coach.ts:35-38`、`mcp-server/src/coach/types.ts:34-38`。 |
| A4 | 已處理 card 縮成摘要列 | agree | 應該在 Spec B 就做。現在 `CoachPanel` 是單一長 scroll，所有 message 都直接 render，若已處理 card 不收斂，對話可讀性會快速崩掉。`src/components/Coach/CoachPanel.tsx:250-290`。 |
| A5 | Apply All per-card 進度 | agree | 這是最便宜且足夠的 UX。比起全域 progress bar，逐卡 `confirming -> confirmed/failed` 更能對齊實際 failure point，也更容易和 SSE 更新對上。前提是 batch 一旦中途失敗，後續卡必須停在 `pending`，不能自動跳 `failed`。 |
| B1 | TargetEntityHash 4 個 tool | disagree | 這 4 個不齊。`es_link_entity_to_aggregate_root` 不只碰既有 `Entity`，還寫入 `aggregateRootId`，但 handler 完全不驗 aggregate root 是否存在/型別正確：`mcp-server/src/coach/tools/handlers.ts:1283-1315`。`es_add_link` 更嚴重，連 `fromId/toId` 是否存在都不驗：`mcp-server/src/coach/tools/handlers.ts:1162-1181`。只靠 NOT_FOUND 不夠，因為這兩個 handler 今天根本不一定回 NOT_FOUND。 |
| B2 | Stale 後可 force-apply | with-conditions | 可做，但不能把 force 當「略過 CAS」。force 只能在 server 重新確認 target 仍存在後放行，且 UI 要明示 target 已變更。尤其對 `add_command_for_event` / `add_invariant`，force 其實是在覆蓋語義判斷風險，不只是佈局風險。 |
| B3 | 不設 timeout | with-conditions | 對單人專案可接受，但要承認代價是 zombie pending 永久存在。若沒有 timeout，就至少要有 deterministic 排序、可重載、可手動 reject，並定義 archive/session clear 對 pending 的語義。否則只是在把清理責任推給未來。 |
| B4 | Multi-tab 重用 SSE | with-conditions | 同意重用 SSE，不要再開 polling；但 SSE 只能做「通知」，不能當 source of truth。reload / reconnect / missed events 仍要靠 cold-load pending endpoint 補回。現有 router 只有 sessions/message API，沒有 pending rehydrate 流程。`mcp-server/src/coach/router.ts:46-205`。 |
| B5 | async-mutex on PendingActionStore | disagree | `async-mutex` 有幫助，但「一條 lock 解所有 race」不成立。它只能保護單 process 內的 store mutation，保不了 `store compare -> handler execute -> audit append -> SSE emit` 的跨元件交易，也保不了多 process。若要成立，lock scope 至少要包住 confirm transaction，而不是只包 store。 |
| B6 | FE store 嵌 messages.metadata | with-conditions | 持久化格式嵌在 message 裡可以；runtime store 不該只靠每次掃 `messages[]` 做 selector。現在 `CoachPanel` 每次 render 都 map 全部訊息，store 也沒有 normalized action index。`src/components/Coach/CoachPanel.tsx:265-267`、`src/store/coachStore.ts:41-69`。建議 persistence 保持嵌 message，但 store 另建 `actionsById` / `pendingIds` 快取。 |
| C1 | 永遠附 13 tools schema | with-conditions | 我不反對在 Spec B dogfood 先常駐暴露，但不能只靠 prompt 自律。更便宜的保護是 server-side intent gate：若 user turn 不是明確請求「新增/建立/連結」，就拒收 mutating function call、要求 model 改回純文字回答。這比 conditional expose 簡單，也比全信 prompt 穩。現有 adapter 甚至還沒有 function-call 介面。`mcp-server/src/coach/llm/adapter.ts:5-24`。 |
| H1 | D7/D14/H 推 Spec C | agree | 既然 Spec B 不暴露 13 mutate tools，D7 current-state injection 與 D14 batch-replace schema warning 確實可先 defer；現有 6 個 batch-replace tool 也都還在 `risk='unset'` 階段。`mcp-server/src/coach/tools/toolDefinitions.ts:589-605`、`729-814`。 |
| G1 | zod-to-json-schema lib | with-conditions | 方向對，因為 `toolDefinitions.ts` 已是 zod single source。`mcp-server/src/coach/tools/toolDefinitions.ts:61-68`。但要補 golden tests，驗 `optional/default/describe` 在 13 個 exposed tools 上不失真，尤其 `z.default([])`、nested object、enum。 |
| G2 | Spec B 填全 27 risk metadata | agree | 這比只填 13 個更乾淨。`risk` 在 Spec A 已是 placeholder，B 把 27 個都分類完，C 只改 exposure filter，不用再回頭補 taxonomy。`mcp-server/src/coach/tools/toolDefinitions.ts:59-67`。真正的邊界是「是否 export」，不是「是否分類」。 |
| E1 | Audit jsonl 日檔 | agree | 夠用，且符合 MVP。日檔 + append-only 很容易人工查、也便於之後做 script/replay。 |
| E2 | gzip/30 天輪轉推 Spec C | agree | 對個人 dogfood 完全合理。先把 correctness、可追蹤性做對，比存量優化重要。 |
| E3 | schemaVersion=1 lightweight | with-conditions | 同意先做 v1，但 v1 不能只剩 `schemaVersion`。至少保留 `toolVersion`、`errorEnvelope`、`forceApply` 這些將來也不會反悔的欄位；只把 `inversePatch*` 延後即可。 |

**對 8 個 R3 開放問題的回答**

1. (Spec B 切點漏什麼) 漏的不是功能，而是兩條 guardrail。
   一條是 exposed additive tools 的參照驗證，不然 `es_add_link` / `es_link_entity_to_aggregate_root` 會讓「additive-only」失去安全敘事基礎。另一條是 runtime normalization，不然 B6 會讓 FE 狀態管理從第一版就背歷史包袱。

2. (Lightweight audit 盲區) 最大盲區是無法回答「為什麼這次 stale/failed」。如果只記 propose/confirm/reject 事件名，不記 `baseBoardVersion`、target hash、server compare 結果、error envelope，audit 對 debug 幾乎沒用。無 inversePatch 沒關係，無 causality 才是問題。

3. (State machine 6 個夠不夠) 夠。真正缺的不是第 7 個 state，而是 transition contract。Spec B 若把允許轉移寫清楚，6 個足夠支撐 additive-only；若不寫清楚，8 個也一樣會亂。

4. (永遠附 tools 是否導致過度衝動) 會，有機率。最便宜緩解不是 conditional exposure，而是 server-side intent gate + proposal budget。
   例如單輪最多 2 個 additive proposals；若 user turn 沒有明確操作意圖，任何 mutating function call 都回 synthetic rejection，要求模型改用文字回覆。

5. (TargetEntityHash 4 個範圍齊全嗎) 不齊全。
   至少要補 `es_link_entity_to_aggregate_root`。我也傾向把 `es_add_link` 納入更強的 server validation，即使不走 TargetEntityHash，也至少要做 endpoint existence/type check，否則 today-one bug 就能寫髒資料。

6. (FE store 嵌 messages.metadata 的 selector 問題) 直接掃 `messages[]` 可跑，但不是好 runtime shape。
   建議 persistence schema 維持嵌 message，避免脫鉤；store 層另維護 `actionsById`, `messageActionIds`, `pendingIds`。這樣 sticky tray、message row、SSE patch 各自都有 O(1)/O(k) 更新路徑，不用每次全訊息重掃。

7. (Spec B 填全 27 risk vs 只填 13) 我支持填全 27。
   `risk metadata` 是 taxonomy，不是 exposure policy。若只填 13，未來 Spec C 會分不清「尚未分類」與「已分類但暫不暴露」，邊界反而更髒。

8. (async-mutex 是否 cover Apply All / SSE race) 不夠。
   它只能 cover 一段 code path 內的互斥，cover 不了 SSE delivery ordering，也 cover 不了 confirm transaction 若拆成多個 async step。正確做法是：
   1. confirm/apply-all 在 server 端有 per-session critical section；
   2. audit append 與 status transition 在同一 transaction scope；
   3. SSE 僅作通知，client 收到後必要時以 pending endpoint 對帳。

**自我反省 — 你作為 LLM 在 MVP-mid additive-only 場景會犯什麼新陷阱**

- 我會因為「反正只是 additive」而過度提案，尤其在 user 只是問分析建議時，傾向順手建立 note/link。
- 我會拿目前 snapshot 的 label 做語義匹配，忽略 id-level ambiguity，導致提案連到「看起來像對的」event/aggregate。
- 我會把 add tool 當成 mutate 的替代品，例如不更新既有 invariant，而是再加一條語義重複的新 invariant。
- 我會在 stale 後高估 force-apply 的可接受性，因為對模型來說「東西還在」很容易被誤判成「語義仍成立」。

**新發現的盲區 / hidden risks**（grill 與 R1+R2 都未抓到）

- N13: `es_link_entity_to_aggregate_root` 被歸為 additive，但實際上同時有 unlink 語義，且 handler 不驗 `aggregateRootNoteId` 是否存在/型別正確，會把 invalid `aggregateRootId` 寫進 board。`mcp-server/src/coach/tools/toolDefinitions.ts:560-568`、`mcp-server/src/coach/tools/handlers.ts:1283-1315`。
- N14: `es_add_link` 完全不驗 `fromId/toId` 與 `fromType/toType` 是否對應到真實節點，可建立 orphan link、duplicate link，這讓「force-apply additive 低風險」前提不成立。`mcp-server/src/coach/tools/handlers.ts:1162-1181`。

**Spec B 的「最小 happy path demo flow」建議**（acceptance criteria）

1. 準備一個 active board，已有一張 `DomainEvent` note。
2. User 問「幫我替這個 event 補一個 command 與 entity」。
3. Orchestrator 最多 auto-exec 必要 read tools，assistant 回文字說明，並在同一則 assistant message 下產生 2 張 cards：
   `es_add_command_for_event`
   `es_add_entity_for_event`
4. User 按 `Apply All`，兩張 cards 依序進入 `confirming -> confirmed`；若第 1 張失敗，第 2 張保留 `pending`。
5. Sticky tray 計數同步下降；已完成 cards 縮成摘要列，不再佔滿訊息區。
6. 同 session 第二個 tab 能透過 SSE 看到狀態變化；reload 後可由 pending endpoint 正確補回。
7. Audit v1 可查到 propose/confirm 兩筆以上完整紀錄，含 actionId、toolName、args、status、server compare context。
8. 下一輪 user 問「剛剛你做了什麼？」assistant 能描述已確認動作，而不是重提同一批 cards。

**對 Spec C 的影響預判**（哪些 Spec B 決定會限制或推進 Spec C 設計空間？）

- `risk metadata` 若在 Spec B 就補滿 27 個，會直接推進 Spec C，只需改 exposure policy。
- 6-state 若寫死到 API/FE enum，但不預留擴充，Spec C 要加 `expired/superseded/undone` 時會有相容性成本。
- 若 B6 把 runtime store 完全綁死在 `messages[].metadata`，Spec C 做 undo、grouping、history compaction 會變難。
- v1 audit 若保留 `toolVersion/errorEnvelope/forceApply`，Spec C 升 v2 很順；若 v1 過瘦，之後只會補不回因果資料。
- 若 Spec B 放任 `es_add_link` / `es_link_entity_to_aggregate_root` 的驗證缺口，Spec C 會在更高風險工具上放大同一類資料一致性問題。
tokens used
90,917
#### Codex 立場（GPT-5.4 effort high，~22K tokens）— readiness 7/10

**整體 readiness 評分**: 7/10。R3 把 Spec B 切成「agent shell + additive-only dogfood」這個方向是對的，因為它仍能驗證最核心的四件事：tool calling loop、pending lifecycle、confirm/apply UX、跨 tab/state drift；但幾個結論把「additive-only = 低風險」講得太滿。現在的 exposed handlers 裡，至少 `es_link_entity_to_aggregate_root` 與 `es_add_link` 仍可寫出 dangling/invalid references，而且 `messages[].metadata.proposedActions[]` 若直接當 runtime store，會把歷史訊息容器和高頻狀態更新耦死。換句話說，MVP-mid 可做，但 B1/B5/B6/C1 需要收斂成更精確的工程邊界。

**逐條結論驗證**

| # | grill 結論 | 立場 (agree / with-conditions / disagree) | 重點論點 |
|---|------|---------|----------|
| F1 | Spec B = MVP-mid | with-conditions | 切點合理，因為仍能驗證 orchestrator、pending、Apply All、SSE、audit 這幾個真正的新架構；但 acceptance 必須刻意包含一條「命中既有 entity 的 additive tool」路徑，不然驗不到 stale/CAS 真價值。參考目前單輪 `/message` 仍是純 chat，尚未有任何 action lifecycle：`mcp-server/src/coach/router.ts:56-157`。 |
| D1 | mutate/destructive/inversePatch 推 Spec C | with-conditions | 原則對，但要先把「偽 additive」關掉。`es_link_entity_to_aggregate_root` 允許 `aggregateRootNoteId=""` 做 unlink，這其實已是 mutate/destructive 語義；handler 還不驗 target 是否存在。`mcp-server/src/coach/tools/toolDefinitions.ts:560-568`、`mcp-server/src/coach/tools/handlers.ts:1283-1315`。 |
| D2 | Lightweight audit 留 Spec B | with-conditions | 同意。沒有 audit，dogfood 幾乎無法 debug「為何卡 stale / force / failed」。但 v1 至少要記 `sessionId`、`messageId`、`actionId`、`toolName`、`args`、`status transition`、`base hash/version`、`forceApply`、`errorEnvelope`；否則只會知道「發生過」，不知道「為何發生」。 |
| A1 | State machine 6 個 (no superseded/expired) | with-conditions | 6 個狀態夠，但前提是把 transition table 寫死，特別是 `stale -> confirming -> confirmed/failed` 與 batch stop-on-first-failure。若只列 enum、不列轉移規則，之後 FE/SSE/store 很容易各自實作不同。原 plan 的 8-state 在 `~/.claude/plans/fizzy-snuggling-donut.md:103-106`，R3 縮成 6-state 可以，但要補 formal transitions。 |
| A2 | Reject 選填 textarea | agree | 這和 D17(c) 一致。強制必填會把「拒絕」從一個 low-friction safety valve 變成 UX 阻力。reason 可作為下一輪 functionResponse 附帶欄位，不需要在拒絕當下觸發新對話。 |
| A3 | Card 內容 (γ) 摘要+raw args | with-conditions | 方向對，但只放 prose + raw args 不夠。還要有最少 machine-readable target 摘要，例如 `targetIds[]` / `subjectLabel`，不然 stale/force 時使用者很難判斷是在套哪個既有 event/aggregate。現有 `ProposedAction` 只有 `{ id, toolName, args }`，資訊太薄：`src/types/coach.ts:35-38`、`mcp-server/src/coach/types.ts:34-38`。 |
| A4 | 已處理 card 縮成摘要列 | agree | 應該在 Spec B 就做。現在 `CoachPanel` 是單一長 scroll，所有 message 都直接 render，若已處理 card 不收斂，對話可讀性會快速崩掉。`src/components/Coach/CoachPanel.tsx:250-290`。 |
| A5 | Apply All per-card 進度 | agree | 這是最便宜且足夠的 UX。比起全域 progress bar，逐卡 `confirming -> confirmed/failed` 更能對齊實際 failure point，也更容易和 SSE 更新對上。前提是 batch 一旦中途失敗，後續卡必須停在 `pending`，不能自動跳 `failed`。 |
| B1 | TargetEntityHash 4 個 tool | disagree | 這 4 個不齊。`es_link_entity_to_aggregate_root` 不只碰既有 `Entity`，還寫入 `aggregateRootId`，但 handler 完全不驗 aggregate root 是否存在/型別正確：`mcp-server/src/coach/tools/handlers.ts:1283-1315`。`es_add_link` 更嚴重，連 `fromId/toId` 是否存在都不驗：`mcp-server/src/coach/tools/handlers.ts:1162-1181`。只靠 NOT_FOUND 不夠，因為這兩個 handler 今天根本不一定回 NOT_FOUND。 |
| B2 | Stale 後可 force-apply | with-conditions | 可做，但不能把 force 當「略過 CAS」。force 只能在 server 重新確認 target 仍存在後放行，且 UI 要明示 target 已變更。尤其對 `add_command_for_event` / `add_invariant`，force 其實是在覆蓋語義判斷風險，不只是佈局風險。 |
| B3 | 不設 timeout | with-conditions | 對單人專案可接受，但要承認代價是 zombie pending 永久存在。若沒有 timeout，就至少要有 deterministic 排序、可重載、可手動 reject，並定義 archive/session clear 對 pending 的語義。否則只是在把清理責任推給未來。 |
| B4 | Multi-tab 重用 SSE | with-conditions | 同意重用 SSE，不要再開 polling；但 SSE 只能做「通知」，不能當 source of truth。reload / reconnect / missed events 仍要靠 cold-load pending endpoint 補回。現有 router 只有 sessions/message API，沒有 pending rehydrate 流程。`mcp-server/src/coach/router.ts:46-205`。 |
| B5 | async-mutex on PendingActionStore | disagree | `async-mutex` 有幫助，但「一條 lock 解所有 race」不成立。它只能保護單 process 內的 store mutation，保不了 `store compare -> handler execute -> audit append -> SSE emit` 的跨元件交易，也保不了多 process。若要成立，lock scope 至少要包住 confirm transaction，而不是只包 store。 |
| B6 | FE store 嵌 messages.metadata | with-conditions | 持久化格式嵌在 message 裡可以；runtime store 不該只靠每次掃 `messages[]` 做 selector。現在 `CoachPanel` 每次 render 都 map 全部訊息，store 也沒有 normalized action index。`src/components/Coach/CoachPanel.tsx:265-267`、`src/store/coachStore.ts:41-69`。建議 persistence 保持嵌 message，但 store 另建 `actionsById` / `pendingIds` 快取。 |
| C1 | 永遠附 13 tools schema | with-conditions | 我不反對在 Spec B dogfood 先常駐暴露，但不能只靠 prompt 自律。更便宜的保護是 server-side intent gate：若 user turn 不是明確請求「新增/建立/連結」，就拒收 mutating function call、要求 model 改回純文字回答。這比 conditional expose 簡單，也比全信 prompt 穩。現有 adapter 甚至還沒有 function-call 介面。`mcp-server/src/coach/llm/adapter.ts:5-24`。 |
| H1 | D7/D14/H 推 Spec C | agree | 既然 Spec B 不暴露 13 mutate tools，D7 current-state injection 與 D14 batch-replace schema warning 確實可先 defer；現有 6 個 batch-replace tool 也都還在 `risk='unset'` 階段。`mcp-server/src/coach/tools/toolDefinitions.ts:589-605`、`729-814`。 |
| G1 | zod-to-json-schema lib | with-conditions | 方向對，因為 `toolDefinitions.ts` 已是 zod single source。`mcp-server/src/coach/tools/toolDefinitions.ts:61-68`。但要補 golden tests，驗 `optional/default/describe` 在 13 個 exposed tools 上不失真，尤其 `z.default([])`、nested object、enum。 |
| G2 | Spec B 填全 27 risk metadata | agree | 這比只填 13 個更乾淨。`risk` 在 Spec A 已是 placeholder，B 把 27 個都分類完，C 只改 exposure filter，不用再回頭補 taxonomy。`mcp-server/src/coach/tools/toolDefinitions.ts:59-67`。真正的邊界是「是否 export」，不是「是否分類」。 |
| E1 | Audit jsonl 日檔 | agree | 夠用，且符合 MVP。日檔 + append-only 很容易人工查、也便於之後做 script/replay。 |
| E2 | gzip/30 天輪轉推 Spec C | agree | 對個人 dogfood 完全合理。先把 correctness、可追蹤性做對，比存量優化重要。 |
| E3 | schemaVersion=1 lightweight | with-conditions | 同意先做 v1，但 v1 不能只剩 `schemaVersion`。至少保留 `toolVersion`、`errorEnvelope`、`forceApply` 這些將來也不會反悔的欄位；只把 `inversePatch*` 延後即可。 |

**對 8 個 R3 開放問題的回答**

1. (Spec B 切點漏什麼) 漏的不是功能，而是兩條 guardrail。
   一條是 exposed additive tools 的參照驗證，不然 `es_add_link` / `es_link_entity_to_aggregate_root` 會讓「additive-only」失去安全敘事基礎。另一條是 runtime normalization，不然 B6 會讓 FE 狀態管理從第一版就背歷史包袱。

2. (Lightweight audit 盲區) 最大盲區是無法回答「為什麼這次 stale/failed」。如果只記 propose/confirm/reject 事件名，不記 `baseBoardVersion`、target hash、server compare 結果、error envelope，audit 對 debug 幾乎沒用。無 inversePatch 沒關係，無 causality 才是問題。

3. (State machine 6 個夠不夠) 夠。真正缺的不是第 7 個 state，而是 transition contract。Spec B 若把允許轉移寫清楚，6 個足夠支撐 additive-only；若不寫清楚，8 個也一樣會亂。

4. (永遠附 tools 是否導致過度衝動) 會，有機率。最便宜緩解不是 conditional exposure，而是 server-side intent gate + proposal budget。
   例如單輪最多 2 個 additive proposals；若 user turn 沒有明確操作意圖，任何 mutating function call 都回 synthetic rejection，要求模型改用文字回覆。

5. (TargetEntityHash 4 個範圍齊全嗎) 不齊全。
   至少要補 `es_link_entity_to_aggregate_root`。我也傾向把 `es_add_link` 納入更強的 server validation，即使不走 TargetEntityHash，也至少要做 endpoint existence/type check，否則 today-one bug 就能寫髒資料。

6. (FE store 嵌 messages.metadata 的 selector 問題) 直接掃 `messages[]` 可跑，但不是好 runtime shape。
   建議 persistence schema 維持嵌 message，避免脫鉤；store 層另維護 `actionsById`, `messageActionIds`, `pendingIds`。這樣 sticky tray、message row、SSE patch 各自都有 O(1)/O(k) 更新路徑，不用每次全訊息重掃。

7. (Spec B 填全 27 risk vs 只填 13) 我支持填全 27。
   `risk metadata` 是 taxonomy，不是 exposure policy。若只填 13，未來 Spec C 會分不清「尚未分類」與「已分類但暫不暴露」，邊界反而更髒。

8. (async-mutex 是否 cover Apply All / SSE race) 不夠。
   它只能 cover 一段 code path 內的互斥，cover 不了 SSE delivery ordering，也 cover 不了 confirm transaction 若拆成多個 async step。正確做法是：
   1. confirm/apply-all 在 server 端有 per-session critical section；
   2. audit append 與 status transition 在同一 transaction scope；
   3. SSE 僅作通知，client 收到後必要時以 pending endpoint 對帳。

**自我反省 — 你作為 LLM 在 MVP-mid additive-only 場景會犯什麼新陷阱**

- 我會因為「反正只是 additive」而過度提案，尤其在 user 只是問分析建議時，傾向順手建立 note/link。
- 我會拿目前 snapshot 的 label 做語義匹配，忽略 id-level ambiguity，導致提案連到「看起來像對的」event/aggregate。
- 我會把 add tool 當成 mutate 的替代品，例如不更新既有 invariant，而是再加一條語義重複的新 invariant。
- 我會在 stale 後高估 force-apply 的可接受性，因為對模型來說「東西還在」很容易被誤判成「語義仍成立」。

**新發現的盲區 / hidden risks**（grill 與 R1+R2 都未抓到）

- N13: `es_link_entity_to_aggregate_root` 被歸為 additive，但實際上同時有 unlink 語義，且 handler 不驗 `aggregateRootNoteId` 是否存在/型別正確，會把 invalid `aggregateRootId` 寫進 board。`mcp-server/src/coach/tools/toolDefinitions.ts:560-568`、`mcp-server/src/coach/tools/handlers.ts:1283-1315`。
- N14: `es_add_link` 完全不驗 `fromId/toId` 與 `fromType/toType` 是否對應到真實節點，可建立 orphan link、duplicate link，這讓「force-apply additive 低風險」前提不成立。`mcp-server/src/coach/tools/handlers.ts:1162-1181`。

**Spec B 的「最小 happy path demo flow」建議**（acceptance criteria）

1. 準備一個 active board，已有一張 `DomainEvent` note。
2. User 問「幫我替這個 event 補一個 command 與 entity」。
3. Orchestrator 最多 auto-exec 必要 read tools，assistant 回文字說明，並在同一則 assistant message 下產生 2 張 cards：
   `es_add_command_for_event`
   `es_add_entity_for_event`
4. User 按 `Apply All`，兩張 cards 依序進入 `confirming -> confirmed`；若第 1 張失敗，第 2 張保留 `pending`。
5. Sticky tray 計數同步下降；已完成 cards 縮成摘要列，不再佔滿訊息區。
6. 同 session 第二個 tab 能透過 SSE 看到狀態變化；reload 後可由 pending endpoint 正確補回。
7. Audit v1 可查到 propose/confirm 兩筆以上完整紀錄，含 actionId、toolName、args、status、server compare context。
8. 下一輪 user 問「剛剛你做了什麼？」assistant 能描述已確認動作，而不是重提同一批 cards。

**對 Spec C 的影響預判**（哪些 Spec B 決定會限制或推進 Spec C 設計空間？）

- `risk metadata` 若在 Spec B 就補滿 27 個，會直接推進 Spec C，只需改 exposure policy。
- 6-state 若寫死到 API/FE enum，但不預留擴充，Spec C 要加 `expired/superseded/undone` 時會有相容性成本。
- 若 B6 把 runtime store 完全綁死在 `messages[].metadata`，Spec C 做 undo、grouping、history compaction 會變難。
- v1 audit 若保留 `toolVersion/errorEnvelope/forceApply`，Spec C 升 v2 很順；若 v1 過瘦，之後只會補不回因果資料。
- 若 Spec B 放任 `es_add_link` / `es_link_entity_to_aggregate_root` 的驗證缺口，Spec C 會在更高風險工具上放大同一類資料一致性問題。
---
YOLO mode is enabled. All tool calls will be automatically approved.
YOLO mode is enabled. All tool calls will be automatically approved.
Error executing tool read_file: Path not in workspace: Attempted path "/Users/abnertsai/.claude/plans/fizzy-snuggling-donut.md" resolves outside the allowed workspace directories: /Users/abnertsai/JiaBao/Mendesky/EventStormingTool or the project temp directory: /Users/abnertsai/.gemini/tmp/eventstormingtool
#### Gemini 立場（2.5 Pro，~95K tokens）— readiness 8/10

**整體 readiness 評分**: 8/10. Spec B (MVP-mid) 的切點相當清晰且務實。透過 `/grill-me` 的壓力測試，user 已將最具爭議的 `mutate`/`destructive` 操作、`inversePatch`、以及 `batch-replace` 的注入（D7/D14）等複雜議題推遲到 Spec C，極大降低了 Spec B 的實作風險。目前聚焦於 `additive` 工具的 `propose-confirm` 流程、`stale` 狀態處理、以及 Action Card UI 的基礎設施，這個範圍很適合用於 dogfooding 驗證核心 agent-FE 互動架構。主要風險在於 `TargetEntityHash` 的實作細節與 `async-mutex` 是否能完全覆蓋所有 race condition，但整體來看，決策點（F1-E3）都經過了充分的理由陳述，具備很高的可執行性。

**逐條結論驗證**

| # | grill 結論 | 立場 (agree / with-conditions / disagree) | 重點論點 |
|---|---|---|---|
| F1 | Spec B = MVP-mid | agree | 合理。延後 `mutate` 和 `destructive` tools，先專注於 `additive` tools 的 `propose-confirm` UI 循環是明智的。這能讓核心的 `Action Card` 狀態機 (`A1`) 和 `PendingActionStore` (`B5`) 先被驗證。 |
| D1 | mutate/destructive/inversePatch 推 Spec C | agree | 完全同意。這些操作引入了複雜的 `undo` 和 `current-state injection` (D7) 需求，如 R1/R2 所述。在 Spec B 將其排除，可以讓 `TargetEntityHash` (B1) 和 `stale` (B2) 的邏輯專注於較簡單的 `additive` 場景。 |
| D2 | Lightweight audit 留 Spec B | agree | 必要之舉。即使沒有 `inversePatch`，能夠追蹤 `propose`/`confirm`/`reject` 事件對於 dogfooding 階段的 debug 至關重要。`schemaVersion=1` (E3) 的設計也為 Spec C 的擴充預留了空間。 |
| A1 | State machine 6 個 (no superseded/expired) | agree | `pending / confirming / confirmed / rejected / stale / failed` 這六個狀態已涵蓋 Spec B `additive-only` 的所有主要場景。`superseded` 確實不適用（因無 `mutate` 覆蓋），`expired` 推遲也合理 (B3)。 |
| A2 | Reject 選填 textarea | agree | 同意。R2 決策 D17(a) 指出 LLM 在 `rejected` 後應「必須詢問原因，嚴禁自動重試」。讓 user 點擊 reject 後，LLM 再自然地於下一輪對話中提問，是更符合 D17(a) 和 D17(c)（中斷 loop）精神的 UX。 |
| A3 | Card 內容 (γ) 摘要+raw args | agree | `additive` 操作沒有 `before-state`，所以 diff 無意義。自然語言摘要對 user 最直觀，`collapsible raw args` 則滿足了技術 debug 需求。 |
| A4 | 已處理 card 縮成摘要列 | agree | 關鍵的 UX 優化。否則如 Codex 在 R1 所述，sticky tray 會被已處理 (confirmed/rejected) 的卡片佔滿，影響 `CoachPanel.tsx` 的可用性。 |
| A5 | Apply All per-card 進度 | agree | 務實的作法。重用 `confirming` → `confirmed` 的既有狀態，避免了引入新的 `progress bar` UI 元件，降低了 Spec B 的前端工作量。 |
| B1 | TargetEntityHash 4 個 tool | agree-with-conditions | 範圍合理。這 4 個 tool (`add_command_for_event`, `add_entity_for_event`, `add_invariant`, `link_entity_to_aggregate_root`) 明顯是附加到現有 note 上的。但需確保 handler (`handlers.ts`) 內對 target entity 的查找夠嚴格，才能讓 hash 比對有意義。 |
| B2 | Stale 後可 force-apply | agree | `additive` 操作的破壞性低，`force-apply` 風險可控。例如 `es_add_note`，即使 board 變了，在新的空白處加 note 通常是安全的。這給了 user 逃生口，避免因微小 board 變動卡住流程。 |
| B3 | 不設 pending timeout | agree | 對於單一使用者的個人專案，timeout 確實是過度設計。簡化了 `PendingActionStore` 的複雜度。 |
| B4 | Multi-tab 重用 SSE | agree | 這是最經濟的作法。利用既有的 SSE channel (`mcp-server/src/index.ts` 的 `subscribers` 機制) 廣播 `coach_action_update` 事件，避免了額外的 polling 或 websocket 連線。 |
| B5 | async-mutex on PendingActionStore | agree | D16 的結論擴展至此是正確的。考慮到 `PendingActionStore` 可能會基於檔案系統，操作 (如讀取、寫入、更新狀態) 並非原子，`async-mutex` 可以有效防止多個並發請求 (如 Apply All + SSE stale 更新) 造成的 race condition。 |
| B6 | FE store 嵌 messages.metadata | agree-with-conditions | 將 `proposedActions` 放在 `messages` 陣列的 `metadata` 內，確保了 state 的 co-location，是 `zustand` 的好實踐。Selector 派生 pending list 雖然會跨 message 查找，但只要 `messages` 陣列本身是 immutable 更新，`zustand` 的 selector 就能有效 memoize，效能不成問題。 |
| C1 | 永遠附 13 tools schema | agree | R2 三方已達成共識 (D6+D17)，system prompt 的約束是比 `conditional exposure` 更務實的第一道防線。在 Gemini 2M context window 下，幾千個 token 的 schema 成本可忽略不計，但避免了 Coach「該幫忙卻沒幫」的 false negative。 |
| H1 | D7/D14/H 推 Spec C | agree | 這是 F1 和 D1 決策的直接結果。MVP-mid 不包含 `batch-replace` tool，所以 D7 (`current-state injection`) 和 D14 (schema 警告) 自然就沒有實作的必要。 |
| G1 | zod-to-json-schema lib | agree | 這是最佳實踐。`toolDefinitions.ts` 內的 zod schema 是 single source of truth，用此 lib 可確保 Gemini FunctionDeclaration 與之完全同步，避免手動維護的錯誤。 |
| G2 | Spec B 填全 27 risk metadata | agree | 這是更乾淨的邊界。在 Spec B 完成所有 `risk` 標記，即使 runtime 只用 read/additive，能讓 Spec C 直接 filter `mutate`/`destructive`，無需回頭修改 `toolDefinitions.ts`。這讓 Spec A → B → C 的演進更平滑。 |
| E1 | Audit jsonl 日檔 | agree | `jsonl` 格式易於 stream processing 和 append，是 log 的標準選擇。按日切分 (`YYYY-MM-DD.jsonl`) 也是簡單有效的管理方式。 |
| E2 | gzip/30 天輪轉推 Spec C | agree | 對於 MVP 和 dogfooding 階段，log 大小不成問題，手動清理即可。推遲是合理的。 |
| E3 | schemaVersion=1 lightweight | agree | 明確的版本號是未來 schema migration (如 Spec C 加 `inversePatch`) 的基礎。現在定義 `v1` 是為未來做準備。 |

**對 8 個 R3 開放問題的回答**

1.  **（Spec B 切點漏什麼）**
    切點非常合理，幾乎沒漏掉「必要」功能。但若吹毛求疵，缺少一個 `destructive` 的 `delete_proposed_action` 工具可能會讓 dogfooding 稍嫌不便。例如，若我不小心 propose 了一個完全錯誤的 action，user 目前只能 `reject` 它，而無法將其從 pending tray 徹底移除。但這只是 UI 清爽度問題，不影響核心架構驗證，推遲可接受。

2.  **（Lightweight audit 盲區）**
    主要盲區在於「無法回答『what-if』和『why-stale』的問題」。當一個 action 變 `stale` 時，log 只會記錄 `stale` 這個事實，但無法提供是哪個 entity 的哪個 property 變動導致的 hash 不匹配。在 debug `TargetEntityHash` (B1) 的相關問題時，這會讓除錯變得困難，只能依賴猜測和重現。

3.  **（State machine 6 個夠不夠）**
    夠用。`pending / confirming / confirmed / rejected / stale / failed` 已形成閉環。在 `additive-only` 場景下，我想不出還有其他必要狀態。`confirming` 涵蓋了從 user點擊 Apply 到後端回傳成功/失敗之間的過程，`failed` 則捕獲了 tool handler 執行出錯的意外情況。

4.  **（永遠附 tools 是否導致過度衝動）**
    有可能，但風險可控。R2 的 D6+D17 system prompt 約束（如 decision ladder, 負向約束）是關鍵。身為 LLM，我的行為高度依賴 prompt。只要 prompt 明確指示「優先提問、分析，僅在 user 明確要求時才 propose」，我就會遵守。`conditional exposure` 是更強的物理約束，但實作複雜，先靠 prompt 軟約束是務實的第一步。

5.  **（TargetEntityHash 4 個範圍齊全嗎）**
    基本齊全。這 4 個 `additive` tool (`es_add_command_for_event`, `es_add_entity_for_event`, `es_add_invariant`, `es_link_entity_to_aggregate_root`) 都需要一個已存在的 `noteId` 作為目標。其他 6 個純新增 tool（如 `es_add_note`, `es_add_remodel`）沒有 target entity，所以不需 `TargetEntityHash`。此範圍劃分是正確的。

6.  **（FE store 嵌 messages.metadata 的 selector 問題）**
    效能不是問題。`zustand` 的 `shallow` 比較機制意味著只要 `messages` 陣列的頂層 reference 改變，selector 就會重算。當新訊息或 action 提議進來時，你會創建一個新的 `messages` 陣列，這會觸發 selector。Selector 的邏輯是遍歷 `messages` 陣列並從 `metadata` 收集 `proposedActions`。對於幾百條訊息，這個操作的成本是微不足道的。只要遵循 immutable 原則更新 store，就不會有 cache invalidation 的問題。

7.  **（Spec B 填全 27 risk vs 只填 13 — 哪個邊界乾淨）**
    **填全 27 risk** 的邊界更乾淨。這將 `risk` 元數據的填充視為一個完整的、一次性的任務。Spec B 完成後，`toolDefinitions.ts` 在 `risk` 這個維度上就是完備的。Spec C 可以直接基於這個完備的元數據開發 `mutate`/`destructive` 邏輯，而不需要回頭去 "完成" Spec B 留下的 `unset`。這讓 Spec C 的前置依賴更少。

8.  **（async-mutex 是否 cover Apply All / SSE race）**
    `async-mutex` 能 cover 對 `PendingActionStore` 的**寫入 race condition**，但無法單獨解決所有邏輯層面的 race。例如，user 點擊 "Apply All" 時，`PendingActionStore` 會被 lock，順序執行 action。如果在第一個 action 執行完畢、釋放 lock 之前，一個 SSE `coach_action_update` 事件進來想把第二個 action 標為 `stale`，它會等待 lock。等它拿到 lock 時，第二個 action 可能已經被執行了。所以，後端還需要 `TargetEntityHash` CAS (Compare-and-Swap) 作為最後一道防線，在 handler 執行前再次驗證 `baseVersion`，確保 SSE 事件和 Apply 執行的順序無關，最終的狀態一致性由 CAS 保證。Mutex 解決了 store 的原子性，CAS 解決了業務邏輯的一致性。

**自我反省 — 你作為 LLM 在 MVP-mid additive-only 場景會犯什麼新陷阱**

-   **過度建議 `es_add_note`**：由於 `mutate` 工具被禁用，當 user 想「修改」一個 note 的標籤時，我可能會傾向於建議「用 `es_add_note` 在旁邊加一個新的，然後手動刪掉舊的」，這會是個很差的 UX。我需要被 prompt 明確引導去告知 user「修改標籤的功能將在未來版本提供」。
-   **對 `stale` 狀態的誤解**：如果一個 `propose` 變 `stale`，我可能會直覺地認為我的建議「錯了」，並嘗試提出一個全新的、不同的建議。但我應該被引導去理解 `stale` 只是代表目標實體被修改，原建議可能仍然有效，並提示 user 可以 `force-apply` (B2)。
-   **忽略依賴關係的 subtle cases**：在 `additive-only` 場景下，我可能 propose 一個 `es_add_link`，其 `fromId` 和 `toId` 來自 user 之前的對話，但 user 在我 propose 之後手動刪除了其中一個 note。如果沒有 `TargetEntityHash`，我的 `propose` 看起來有效，但執行時會 `fail`。

**新發現的盲區 / hidden risks**（grill 與 R1+R2 都未抓到）

-   **N13: Client-Side ID 的信任問題**：前端在 `optimisticUser` message 中生成 `clientMessageId` (`coachStore.ts:135`)。後端 router (`router.ts:74`) 依賴它來查找並更新 message。如果網路斷開重連，或 user 在多個 tab 中操作，`clientMessageId` 的唯一性和順序性可能無法保證，儘管 `nanoid` 碰撞率極低，但依賴 client 生成的 ID 進行後端狀態更新始終是個風險點。
-   **N14: `attachSnapshot` 的 UX 模糊地帶**：`CoachPanel.tsx` 的 checkbox 讓 user 可以決定是否附帶 snapshot。如果 user 取消勾選，我的上下文會嚴重受限。當 user 提出需要 board context 的問題時，我可能會無法回答，或給出通用、無用的建議。我應該被 prompt 引導去檢測這種情況，並主動提示 user「請勾選 '附帶 board snapshot' 以獲得更準確的建議」。

**Spec B 的「最小 happy path demo flow」建議**（acceptance criteria）

1.  **啟動**：啟動 app，打開 AI Coach panel。
2.  **提問**：User 輸入 "為 OrderPlaced 事件新增一個 Aggregate"。
3.  **Propose**：Coach 回覆分析，並 message metadata 中包含一個 `proposedAction` 卡片，內容是 `es_add_note`，`type: 'Aggregate'`, `label: 'Order'`，並處於 `pending` 狀態。
4.  **Confirm**：User 點擊卡片上的 "Apply" 按鈕。卡片狀態變為 `confirming`。
5.  **Execute & Feedback**：後端執行 `es_add_note` handler，透過 SSE 廣播 `add_note` 事件。前端 boardStore 收到事件，在畫布上繪製出新的 "Order" Aggregate note。同時，後端也廣播 `coach_action_update` 事件，將 action 狀態更新為 `confirmed`。
6.  **UI Update**：前端 coachStore 收到更新，將 Action Card 狀態變為 `confirmed`，然後卡片收縮為一行摘要 (A4)。整個流程無刷新、即時反饋。

**對 Spec C 的影響預判**（哪些 Spec B 決定會限制或推進 Spec C 設計空間？）

-   **推進**:
    -   `PendingActionStore` 和 `Action Card` 的 state machine (A1) 為 Spec C 的 `mutate`/`destructive` 工具提供了一個現成的、經過驗證的 UI 互動框架。Spec C 只是在卡片內容 (A3) 中增加 `diff` 視圖，並啟用 `undo` 按鈕。
    -   `Lightweight audit` (D2) 和 `schemaVersion=1` (E3) 的基礎建設，讓 Spec C 可以平滑地引入 `schemaVersion=2` 並加入 `inversePatch` 資訊，而無需從零開始設計 audit 系統。
    -   `TargetEntityHash` (B1) 的實作，為 Spec C 中更複雜的 `inversePatch` 前置校驗和 `multi-entity mutation` 提供了基礎模式。
-   **限制**:
    -   `force-apply` (B2) 的存在可能會讓 user 養成 "強行應用" 的習慣。在 Spec C 中，對 `mutate`/`destructive` 操作濫用 `force-apply` 的風險會高很多，屆時需要重新審視或增加更強的警告機制。
    -   FE store 將 actions 嵌在 `messages.metadata` (B6) 的設計，雖然在 Spec B 中高效，但在 Spec C 如果出現需要跨 message 聚合 action（例如，「顯示所有被拒絕的 mutate 操作」）的複雜查詢，selector 的邏輯會變得更加複雜，可能會需要考慮將 `pendingActions` 獨立成一個頂層 store slice。

#### Round 3 收斂結果

**Readiness 變化**：R2 後 Codex 8/10 + Gemini 9/10 → R3 對 Spec B framing Codex 7/10 + Gemini 8/10。下修原因：grill 把 P1 的 16 條結論拋給三方，Codex 抓出 N13/N14 兩個既有 handler 的安全缺口（讓「additive = 安全」前提部分崩塌），Gemini 抓 client-id / attachSnapshot UX 問題。

**Codex vs Gemini 對 16 條結論的分歧**：

| # | Gemini | Codex | 真分歧 |
|---|--------|-------|--------|
| F1 | agree | with-conditions | 否 — Codex 補「acceptance 必含命中既有 entity 路徑」，與 Gemini 不衝突 |
| D1 | agree | with-conditions | **真分歧** — Codex 抓「偽 additive」(N13)，要求先修 handler 再 ship |
| D2 | agree | with-conditions | **真分歧** — Codex 要求 audit v1 必含 causality（baseHash / forceApply / errorEnvelope），不能只記事件名 |
| A1 | agree | with-conditions | 否 — Codex 補「formal transition table」 |
| A2-A5 | agree | agree (A3 with-conditions) | A3 Codex 補「targetIds[] / subjectLabel」machine-readable 欄位 |
| B1 | agree-with-conditions | **disagree** | **真分歧** — Codex 認為 4 個不齊，N14 顯示 `es_add_link` 完全不驗，必須補 server-side existence check |
| B2 | agree | with-conditions | **真分歧** — Codex 要求 force 不能略過 CAS，server 仍要 reverify target 存在 |
| B3 | agree | with-conditions | 否 — Codex 補「archive/session-clear 對 pending 的語義」要寫 |
| B4 | agree | with-conditions | 否 — Codex 補「cold-load pending endpoint」（plan 既有 `GET /pending` 已涵蓋，但要明示 reload 路徑） |
| B5 | agree | **disagree** | **真分歧** — Codex 要求 `confirm transaction scope` 包覆 (store mutate + audit append + status transition)，不只 store 互斥 |
| B6 | agree-with-conditions | with-conditions | 否 — 兩家都同意 persistence 嵌 message + runtime store 加 normalized index |
| C1 | agree | with-conditions | **真分歧** — Codex 提 server-side intent gate + per-turn proposal budget（最多 2 個），比 prompt 更便宜 |
| H1 | agree | agree | 一致 |
| G1 | agree | with-conditions | 否 — Codex 補「golden tests verify zod conversion」 |
| G2 | agree | agree | 一致 |
| E1 | agree | agree | 一致 |
| E2 | agree | agree | 一致 |
| E3 | agree | with-conditions | **真分歧** — Codex 要求 v1 至少含 `toolVersion / errorEnvelope / forceApply` 欄位 |

**真分歧 7 條 → 用 Codex 看法**（理由：Codex 每條都引 file:line 證據抓到具體缺口；Gemini 是高層次 agree 但未檢視這些 corner case）。

#### 新增決策 D18-D24（R3 補強，全納入 Spec B）

| # | 決定 | 來源 | 理由 |
|---|------|------|------|
| **D18** | Spec B 必須先**補 handler validation**（L1 修正）：`es_add_link` 在 handler 內驗 `fromId / toId` 對應 note/remodel 真實存在；`es_link_entity_to_aggregate_root` 驗 `aggregateRootNoteId` 是 Aggregate 型別（非空時）。**這 2 個 handler 修正同時補進 Spec A handlers 或 Spec B step 0**，是 D1「additive = 安全」前提的必要條件 | R3 Codex N13+N14 + B1 disagree | 不修 → additive 仍可寫髒資料 → MVP-mid「低風險」前提崩 |
| **D19** | Audit v1 schema 必含 `sessionId / messageId / actionId / toolName / args / status transition / baseHash / baseVersion / forceApply / errorEnvelope / toolVersion`；只把 `inversePatch / inversePatchVersion` 推 Spec C | R3 Codex D2+E3 with-conditions | 否則 dogfood 無法回答「為何 stale / failed / forced」，audit 只能告訴你「發生了」不能告訴你「為何」 |
| **D20** | A1 6-state 必須附 **formal transition table** 寫進 spec：合法轉移 only `pending → confirming → (confirmed \| failed \| stale)`、`stale → confirming → ...`、`pending → rejected`、`confirming → ...` 不允許自轉、Apply All 失敗後續 cards 留 `pending`（不自動跳 `failed`）| R3 Codex A1+A5 | 6 個 enum 不夠，FE/SSE/store 各自會走不同 transition |
| **D21** | A3 ProposedAction schema 擴充：`{ id, toolName, args, targetIds: string[], subjectLabel: string, humanSummary: string, rationale: string, status, createdAt }`。`targetIds` 給 stale/force 場景 UI 標示「在改哪個 entity」；`subjectLabel` 給 sticky tray 顯示 | R3 Codex A3 + 既有 `ProposedAction` 過薄 (`src/types/coach.ts:35-38`) | 純 prose 摘要在 stale 時 user 看不出在套哪個既有 entity |
| **D22** | B5 Lock scope 擴大：confirm endpoint 內 mutex 範圍 = `[store compare → handler execute → audit append → status transition → SSE emit]` 整段；單一 sessionId per critical section。Apply All 用 outer-lock (per session) + per-card 內部 transition | R3 Codex B5 disagree | async-mutex 只 cover store mutation 不夠；race surface 在跨元件而非單檔 |
| **D23** | C1 補 **server-side intent gate**：orchestrator 偵測 user turn 內若無明確 mutation intent（regex/heuristic：`建/加/新增/做/連/Add/Create/Link` 等），任何 model 回的 mutating functionCall 自動返 synthetic rejection `{ status: 'rejected', reason: 'no mutation intent in user turn' }`；同時 per-turn proposal budget=2（superseding R3 之前單純 prompt 約束）| R3 Codex C1 | 比 conditional tool exposure 簡單；prompt 軟約束有時不可靠；budget 防 LLM 一次塞 5 張 cards |
| **D24** | B2 force-apply 不可略過 server-side reverification：force 只表示「忽略 hash 不符」，server 仍須驗 target entity 存在 + 型別正確 + 必填欄位齊全；任一失敗 → `failed` 狀態 + audit envelope 記原因 | R3 Codex B2 | 否則 force 變成「LLM 寫什麼都生效」漏洞 |

**Spec B step 0（pre-flight handler fix）**：

R3 之前 plan 寫 4 step（read auto-exec → additive propose → mutate/destructive → polish）；R3 加 step 0：

```
Step 0 — Handler validation hardening (D18)
  - handlers.ts es_add_link 加 fromId/toId 對應 note/remodel 存在驗證
  - handlers.ts es_link_entity_to_aggregate_root 加 aggregateRootNoteId 為 Aggregate type 驗證
  - 寫對應 unit test
  - 走 spec A 同樣的 audit-spec → pickup pipeline（這部分技術上是 spec A 補丁）
```

**真正進 Spec B 的 step 拆**（修正 plan）：

```
Step 1 — Skill + Orchestrator 骨架 (read-only auto-exec) + audit v1
Step 2 — Pending lifecycle + Action Card UI + 4 endpoints
Step 3 — Apply All + stale/CAS + force-apply + intent gate
Step 4 — system_prompt 改寫 + dogfood polish
```

#### 新增 hidden risks N13-N16

| # | 風險 | 對策 |
|---|------|------|
| **N13** | `es_link_entity_to_aggregate_root` 可 `aggregateRootNoteId=""` unlink，且不驗 target 型別 — additive 暗藏 mutate/destructive 語義 | D18 補 handler validation；Spec B 內 spec 文件列為 step 0 |
| **N14** | `es_add_link` 完全不驗 `fromId / toId / fromType / toType` 對應節點存在 — 可寫 orphan link / duplicate link | D18 同上 |
| **N15** | `clientMessageId` 由 FE `nanoid` 生成（`src/store/coachStore.ts:135`），多 tab + 重連場景下唯一性與 ordering 不保證 | spec B 文件警語 + server 端用 `(userId, sessionId, clientMessageId)` 作 idempotency key |
| **N16** | `attachSnapshot` user 可關掉（`CoachPanel.tsx`），關掉後 LLM 無 board context 但仍會收到 mutation 請求 → hallucinate 嚴重 | system_prompt 加守則「`attachSnapshot=false` 時拒絕 propose mutating actions」+ FE UI 提示 |

#### Round 3 結論

**討論結束、可進 Spec B write-spec**。

R3 透過 grill + 三方驗證把 17 條 D 擴成 24 條 D + 12 條 N → 16 條 N，並加一條 step 0（handler hardening）。Spec B 範圍維持 MVP-mid 但**前置必修兩個 handler validation 缺口**（D18），audit v1 schema 顯著加重（D19），lock scope 上升到 transaction 級（D22），新增 intent gate（D23）+ force reverify（D24）。

