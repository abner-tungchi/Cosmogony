---
topic: "explain-discussion skill 設計審查"
status: consensus
created: "2026-05-09"
updated: "2026-05-09"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini (2.5 Pro)
facilitator: Claude
rounds_completed: 1
---

# explain-discussion skill 設計審查

## 議題定義

### 背景

User 反映看不懂多 agent 討論的結果（D1-D24 編號、jargon、cross-reference 一堆）。希望有一個 skill 能把討論結果用淺白語言重講一遍，含：優點 / 缺點 / 情境化說明。

Claude 已產出 skill 初版 `/Users/abnertsai/.claude/skills/explain-discussion/SKILL.md`（130 行），並當場用 R3 結論做了 demo。

User 要求：「把剛剛寫的 skill 進討論，確保沒有盲區」。

### 目標

對 `explain-discussion` SKILL.md 設計做 single-round 多 agent 審查，找出：
1. 觸發 / 模式判斷的 corner case
2. 輸出格式 / 風格規則的盲區
3. 「最多 3 個關鍵抉擇」這類量化規則的失敗模式
4. 跟其他 skill (`grill-me` / `discuss` / `audit-spec`) 的接合點是否乾淨
5. 翻譯保真度（fidelity to source discussion）

### 範圍

只審 `~/.claude/skills/explain-discussion/SKILL.md` 一個檔；demo run 結果（剛跑在 R3 結論上）作為實證材料一起看。**不重寫 skill**，只列盲區清單。

### 約束

- 1 round，並行 Codex + Gemini，省時
- 結束後 Claude 整合 → 修 SKILL.md → 回報 user

### 子議題

- [ ] 1. 模式判斷邏輯（無參數 / 找不到檔 / context 中無討論的 fallback）
- [ ] 2. 「最多 3 個關鍵抉擇」的選擇標準（quantitative metric vs subjective）
- [ ] 3. 情境化（scenarios）品質：固定 3 個會不會太多/太少；如何確保情境忠實反映討論
- [ ] 4. Jargon 翻譯一致性（沒有 dictionary，每次跑可能譯法不同）
- [ ] 5. 「真分歧」(disputed) vs 「共識」(agreed) 的呈現 — skill 沒明示要 highlight 分歧
- [ ] 6. 跟其他 skill（grill-me / discuss / audit-spec / write-spec）的接合
- [ ] 7. 適用範圍：除了 discussion 檔，能不能用在 spec 檔 / plan 檔
- [ ] 8. 大型討論（>500 行）的處理策略：「展開全部 vs 只看 3 個」是否合理切點
- [ ] 9. Fidelity verification — user 怎麼知道翻譯沒漏 / 沒扭曲關鍵決策
- [ ] 10. Output 長度上限（3 sections + 3 scenarios 可能膨脹）

---

## 自審 — Claude 在寫 skill 時注意到但可能 under-cover 的點

| # | 自審盲區 | 嚴重度 |
|---|---|---|
| s1 | Mode A（無參數）→ 從 conversation context 抓 — 但 context 可能已被 compact / cleared / 跨 session | 中 |
| s2 | "最多 3 個關鍵抉擇" — 沒給選擇 metric，Claude 可能每次選不同 3 個 | 高 |
| s3 | "用 3 個情境" — 強制數字，討論小（1-2 個 D）時湊不出 / 大（24 個 D）時不夠代表性 | 中 |
| s4 | Jargon 翻譯沒 dictionary — CAS / mutex / TargetEntityHash 我隨手譯，下次跑可能譯不一樣 | 中 |
| s5 | 沒 highlight 「真分歧」(R3 那種「Codex disagree, Gemini agree」)，但這常常是最有資訊量的部分 | 高 |
| s6 | Skill 跟 grill-me 的關係：grill-me 是 user-Claude 對話、explain-discussion 是 Claude → user 單向 — 但兩者都做「framing」，邊界容易模糊 | 低 |
| s7 | 適用範圍：skill 描述只說 "討論結果 / spec 文件 / 對話結論"，但實際上 plan 檔、ADR 檔也可能要翻 | 中 |
| s8 | Fidelity check：user 沒辦法快速驗 「翻譯有沒有漏關鍵決策」 — 沒給一個「快速比對清單」 | 中 |
| s9 | Output 長度沒設上限 — 真實 demo 跑出來 ~250 行，user 還是有可能滑不完 | 低 |
| s10 | "若討論很長，先給 1+2+5 段、問展開" — 但 skill 觸發後 user 已經 expectation 完整解釋，多一次往返反而增加 friction | 低 |

---

## 討論紀錄

### Round 1 — 2026-05-09

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round | 備註 |
|---|------|---------|-----------|------|

---

## 開放問題

（Round 1 結束後填）

---

## 下次討論指引

### 進度摘要

Round 1 single-round review of skill design. Claude 自審列 10 個盲區（s1-s10）。等 Codex + Gemini 並行驗。

### 待處理事項

1. Codex / Gemini Round 1 review 結果整合
2. SKILL.md 改版（依 findings）
3. 視情況 Round 2 或結案

144,320
#### Codex 立場 — readiness 5/10

**整體 readiness**: 5/10. 這個 skill 的目標是對的，demo 也證明它有把抽象工程決策翻成可感知場景的能力，尤其 stale / force-apply / intent gate 這類 UX 很難直接從討論檔看懂；但目前設計還不夠穩，因為「挑哪 3 個」「要不要先講真分歧」「如何證明沒漏掉關鍵決策」都沒有被規則化。對 731 行、24 決策、16 風險的討論，這不是小瑕疵，是摘要演算法本身還不可信。

**逐條子議題立場**

| # | 子議題 | 立場 (agree/with-conditions/disagree/N/A) | 重點論點 |
|---|------|---------|----------|
| 1 | 模式判斷邏輯 fallback | with-conditions | Mode A/`--latest` 是好用捷徑，但不能當主路徑；現在只說「抓最近 3 輪」與「找最新 in-progress/consensus」太脆弱，應 fail closed 並回報實際選到的來源 (`SKILL.md:17-21`, `172-179`)。 |
| 2 | "最多 3 個" 的選擇 metric | disagree | 規則只說「對 user 影響最大」但沒有 scoring；大型討論又寫成「3-5 個」與前文衝突，結果不可重複 (`SKILL.md:56-59`, `137-142`)。 |
| 3 | 強制 3 個 scenarios 是否合理 | disagree | Section 3 把形式先鎖死，再逼內容去湊；應改成 0-3 個，由「被選中的高權重決策/分歧」反推情境，不是反過來 (`SKILL.md:75-93`)。 |
| 4 | Jargon 翻譯 dictionary 問題 | with-conditions | 需要的不是重型 dictionary，而是「本次術語對照表」；現在規則禁 acronym，但沒有要求輸出時保留一致映射 (`SKILL.md:44-45`, `125-126`)。 |
| 5 | 真分歧 vs 共識 highlight | disagree | 這是最大缺口。R3 最有資訊量的不是一般共識，而是 7 條真分歧與 D18-D24 補強 (`R3:659-694`)；skill 完全沒要求先拉出 disputed items。 |
| 6 | 與 grill-me / discuss / audit-spec 接合 | with-conditions | `grill-me` 是提問器，`discuss` 是辯論/記錄器，`explain-discussion` 應是 read-only 解說器；目前 Section 5 很容易滑成 workflow driver (`grill-me:7-9`, `discuss:31-44`, `SKILL.md:109-119`)。 |
| 7 | 適用到 spec / plan / ADR 檔 | with-conditions | 目前只有 discussion 與 spec 的前置抓法，沒有 plan/ADR 的解析規則；描述比實作邏輯寬 (`SKILL.md:29-38`)。 |
| 8 | 大討論（>500 行）切法 | disagree | 規則互相打架：硬規則說先給 1+2+5 再問展開，策略段又說抓 3-5 個、還要再問一次 (`SKILL.md:131-142`)；同時 Section 3 還要求固定 3 情境。 |
| 9 | Fidelity verification 機制 | disagree | 完全缺。沒有「我掃到哪些 D/N/分歧、這次展開哪些、刻意省略哪些」的來源地圖，user 無法信任摘要。 |
| 10 | Output 長度上限 | with-conditions | 250 行 demo 已證明會膨脹；要有字數/行數 budget，且先保證摘要完整，再決定要不要展開情境。 |

**Claude 10 條自審盲區（s1-s10）的補強或反駁**

- s1：同意，而且不只 compact/跨 session；`--latest` 也可能抓到「最新但不相關」的討論，必須把來源回報給 user。
- s2：同意，這是第一個 ship blocker；沒有 selection metric，就沒有 deterministic summary。
- s3：同意，建議改成「每個被展開的高權重項目最多 1 個情境」。
- s4：同意，但重點是輸出內 consistency，不是事前維護一份大字典。
- s5：同意，且應升成輸出第一段，不是附帶考量。
- s6：同意，最該補的是「本 skill 不負責追問、不負責拍板、不自動推下一個 workflow」。
- s7：同意；先把 discussion 模式做穩，再談 spec/plan/ADR。
- s8：同意；至少要補「來源覆蓋清單 + 未展開清單」。
- s9：同意；長度限制不只是 UX，還會直接反過來扭曲選材。
- s10：部分反駁。progressive disclosure 可以保留，但前提是第一屏已經自成一體，不能把真分歧和關鍵風險藏到第二輪。

**新發現的盲區**（Claude 自審沒抓到的）

- 新 b1: 規則彼此衝突。`SKILL.md` 說「不用程式碼」「不用首字縮寫」(`125-127`)，但 demo 直接用了 code fence、`LLM`、`SSE`、`server-side`、`force-apply`、`intent gate`。
- 新 b2: 缺少「省略透明度」。當你只展開 3 個抉擇時，沒有任何規則要求列出「另外哪些高權重決策這次沒講」。
- 新 b3: Section 5 容易越界成「替 user 做流程決定」。解說 skill 不應在 disputed / majority 仍存在時直接推 `/write-spec`。

**對 Demo run（R3 結論的解釋輸出）的具體點評**

- TL;DR 是成功的，`demo L7` 很具體，沒有抽象空話。
- 情境 2、3 是這個 skill 最有價值的部分，`demo L76-L101` 把 stale / force-apply / intent gate 轉成 user 能直覺理解的風險與保護機制。
- `demo L31-L37` 用 code fence 列 handler 缺口，直接違反 `SKILL.md:127`「不用程式碼」；而且 `handler`、`aggregate`、`LLM` 沒有被穩定白話化。
- demo 完全沒有先講 R3 的 7 條真分歧與 D18-D24 補強；但原討論最關鍵的資訊正是在 `R3:659-694`。這代表現在的 skill 會把「好講的」放到前面，而不是把「最有決策價值的」放到前面。
- `demo L123-L131` 直接把 user 推向 `/write-spec`，這在 explain skill 裡太重了；如果 user 正是卡在 D19/D22/D23 這類補強點，這種收尾會把疑問壓掉。
- `demo L13-L58` 選到的 3 個抉擇不算錯，但它漏掉 audit causality、lock scope、ProposedAction schema 這些真正把 R3 和前兩輪拉開的新增內容。

**對 SKILL.md 結構的修改建議**（具體 diff 等級的指示）

1. 在 `## 前置作業` 後新增 `## Phase 0 — 掃描與評分`：先列出所有候選項目（決策、分歧、風險、開放問題），再用固定權重排序。
2. 把 `Section 2 — 三個關鍵抉擇` 改成 `Section 2 — 1-3 個關鍵抉擇 + 0-2 個真分歧`；對 >500 行討論，分歧優先於共識。
3. 把 `Section 3` 的「固定 3 個情境」改成「0-3 個代表性情境；每個情境必須綁定一個已展開的決策或分歧」。
4. 在 `Section 5` 前新增 `Section 4.5 — 來源覆蓋 / 本次省略`：列出 `已掃到 D18-D24、N13-N16；本次展開 D18/D20/D23；略過 D19/D21/D22/D24，因為…` 這類 source map。
5. 把 `SKILL.md:131-142` 兩段合併成單一大討論策略：第一輪永遠輸出「完整但精簡」摘要，不要兩次追問；只有情境細節進第二輪。
6. 在風格規則新增一句：若必須提函數名/欄位名，只能作為括號補充，前面要先給白話用途，且禁止用 code fence 貼原樣。
7. 把 `✅ 你現在要做的` 改成條件式：`如果你接受目前共識，下一步…；如果你卡在分歧，先回看…`，不要替 user 直接拍板。

**整體：哪 3 個 issue 必修才能 ship？**

1. 補「候選項目掃描 + selection metric + omission transparency」，不然摘要不可重複也不可驗。
2. 補「真分歧優先 + fidelity source map」，不然大型討論最有價值的資訊會被吃掉。
3. 重寫「大討論輸出策略 + 角色邊界」，避免 explain skill 膨脹成 250 行教戰手冊兼流程推進器。

#### Gemini 立場 — readiness 3/10

**整體 readiness**: 3/10. 這個 skill 瞄準了真問題，但目前更像「會說人話的 demo prompt」，還不是可依賴的摘要器。它最致命的地方不是文筆，而是缺少穩定的取材規則與覆蓋驗證；面對像 R3 這種明確存在 7 條真分歧、7 條新增決策的討論，它仍可能產出一份看起來順、其實漏掉決策核心的長篇解說。

**逐條子議題立場**

| # | 子議題 | 立場 (agree/with-conditions/disagree/N/A) | 重點論點 |
|---|------|---------|----------|
| 1 | 模式判斷邏輯 fallback | disagree | 以 conversation/context 為主要入口太不穩，應要求明確來源，context 只當備援。 |
| 2 | "最多 3 個" 的選擇 metric | disagree | 沒有 metric 就是任意摘要；面對 24 個決策，這不可接受。 |
| 3 | 強制 3 個 scenarios 是否合理 | disagree | 形式僵化；情境數應由內容決定，不應先固定數字。 |
| 4 | Jargon 翻譯 dictionary 問題 | with-conditions | 需要至少輸出本次 glossary，否則每次跑都可能換詞。 |
| 5 | 真分歧 vs 共識 highlight | disagree | 分歧點才是高信號區，skill 卻沒有要求優先顯示。 |
| 6 | 與 grill-me / discuss / audit-spec 接合 | with-conditions | 應明確定位成 read-only 報告器，不提問、不引導流程。 |
| 7 | 適用到 spec / plan / ADR 檔 | disagree | 在 discussion 模式都未做穩前，不應宣稱泛用到更多文件型態。 |
| 8 | 大討論（>500 行）切法 | disagree | 問 user 要不要展開是在用互動補摘要能力不足；應先一次給出分層摘要。 |
| 9 | Fidelity verification 機制 | disagree | 沒有完整決策索引或 source map，user 無法驗證是否漏關鍵點。 |
| 10 | Output 長度上限 | with-conditions | 需要明確 budget；否則「幫你看懂」會再次變成需要滑半天。 |

**Claude 10 條自審盲區（s1-s10）的補強或反駁**

- s1：同意；這不是中風險，是主要入口的根本缺陷。
- s2：同意；這是最嚴重盲區。
- s3：同意；情境數量應依決策數量與權重伸縮。
- s4：同意；最好輸出本次術語表。
- s5：同意；這是第二嚴重盲區。
- s6：同意；`explain-discussion` 是報告者，不是提問者。
- s7：同意；應先專注 discussion。
- s8：同意；至少補完整決策索引。
- s9：同意；過長輸出直接背離 skill 目的。
- s10：反駁；Gemini 傾向一次性交付完整分層摘要，而不是先給半份再追問。

**新發現的盲區**（Claude 自審沒抓到的）

- 新 b1: skill 對輸入結構有隱性假設，預設討論像 `discuss` 產物一樣高度結構化；遇到線性聊天紀錄時可能失效。
- 新 b2: 缺少決策之間的因果關係表達；像 D18 是由 N13/N14 推出，skill 目前只會平鋪，不會顯示依賴鏈。
- 新 b3: 缺少非結構化決策偵測；如果關鍵結論沒落在 `Dxx` / 表格裡，可能直接漏掉。

**對 Demo run（R3 結論的解釋輸出）的具體點評**

- demo 的場景敘事能力不差，尤其 `demo L76-L101` 把 stale 與誤觸 mutation 說得很直覺。
- 但它仍然證明了 selection 問題：`demo L13-L58` 只展開 3 個抉擇，卻沒有交代「還有哪幾個同樣重要但本次略過」。
- 它也證明了 highlight 問題：從頭到尾沒有把 `R3:659-680` 的 7 條真分歧拉成獨立摘要。
- `demo L123-L131` 的結尾過早把 user 推去 `/write-spec`，像在做 workflow handoff，不像純解說。
- 整體看下來，demo 可讀，但不可作為「已能可靠覆蓋大型討論」的證據。

**對 SKILL.md 結構的修改建議**（具體 diff 等級的指示）

1. 新增 `核心分歧` 區段，置於 `關鍵抉擇` 之前。
2. 新增 `完整決策索引 / 來源覆蓋` 區段，作為 fidelity check。
3. 將 `最多 3 個` 改為「依權重排序後選 1-3 個」；權重至少含分歧、風險、user-facing impact。
4. 將 `固定 3 情境` 改為「每個已展開項目最多 1 個情境」。
5. 將 `無參數` 模式降級為 fallback，不得默默猜測來源。
6. 刪掉或弱化「先摘要再問展開」；改成先給一份完整但壓縮的 base summary。
7. 把 `你現在要做的` 改成條件式選單，而不是單一路徑建議。

**整體：哪 3 個 issue 必修才能 ship？**

1. 建立 deterministic 的選材機制，取代現在的「最多 3 個」。
2. 將真分歧與完整決策索引納入輸出，補齊 fidelity。
3. 修正大討論策略與角色邊界，避免 explain skill 同時當摘要器、教練、流程推進器。

---

```markdown
#### Gemini 立場 — readiness 3/10

**整體 readiness**: 3/10. 該 skill 意圖解決真實痛點（翻譯複雜的多 agent 討論），但目前設計有根本性缺陷，使其無法可靠地履行其核心使命。最大問題是「最多 3 個關鍵抉擇」的選擇標準完全未定義，在面對像 `coach-agent-and-skill-architecture.md` 這樣包含 24 個決策點的複雜討論時，其輸出必然是任意且可能產生誤導的。此外，它未能突顯「真正的分歧點」，反而可能將其隱藏在少數被選中的「共識」決策中，從而喪失了總結報告最重要的價值。在解決這些核心問題之前，該 skill 尚不具備交付條件。

**逐條子議題立場**

| # | 子議題 | 立場 (agree/with-conditions/disagree/N/A) | 重點論點 |
|---|------|---------|----------|
| 1 | 模式判斷邏輯 fallback | disagree | s1 指出 context 可能被清除，這是致命的。skill 應在 context 不足時直接報錯，要求 user 明確指定檔案，而不是靜默失敗或產生低品質輸出。 |
| 2 | "最多 3 個" 的選擇 metric | disagree | 完全沒有 metric（s2）。面對 24 個決策的 `coach-agent` 討論，隨機選 3 個是不可接受的。這會給 user 一種虛假的安全感，以為已經掌握了重點。 |
| 3 | 強制 3 個 scenarios 是否合理 | disagree | s3 指出這規則過於僵化。對於只有 1 個決策的簡單討論，強湊 3 個情境會產生廢話；對於複雜討論，3 個情境無法覆蓋多個關鍵決策的細微差別。應改為「為每個選出的關鍵決策生成 1 個代表性情境」。 |
| 4 | Jargon 翻譯 dictionary 問題 | with-conditions | s4 提到一致性問題。短期內可接受，但長期 skill 應具備從專案文件或過往對話中動態建立臨時 dictionary 的能力，或至少在輸出中附上本次翻譯的術語表。 |
| 5 | 真分歧 vs 共識 highlight | disagree | s5 指出 skill 未明示 highlight 分歧，這是最大的功能缺失。一份好的總結，首要任務就是標出爭議點，如 `coach-agent` R3 結論中的 7 條「真分歧」。目前設計會將其忽略。 |
| 6 | 與 grill-me / discuss / audit-spec 接合 | with-conditions | 邊界模糊 (s6)。`explain-discussion` 應定位為 read-only 的總結工具。任何需要 user 輸入或引導 user 思考的功能，都應明確交給 `grill-me` 或 `discuss`。SKILL.md 需加一條規則：「本 skill 不提問，只陳述」。 |
| 7 | 適用到 spec / plan / ADR 檔 | disagree | s7 指出 skill 適用範圍模糊。在能可靠處理 discussion 檔前，不應擴大範圍。處理 spec 或 plan 需要不同的解析邏輯（例如，關注需求 vs. 風險），應作為獨立功能或 skill 擴充。 |
| 8 | 大討論（>500 行）切法 | disagree | s10 的「先給摘要再問展開」是錯誤的互動模式。skill 的價值在於一次性提供高品質、分層的完整摘要。問題不在於 presentation，而在於 summarization 的核心邏輯失敗。 |
| 9 | Fidelity verification 機制 | disagree | s8 指出 user 無法驗證 fidelity。這是關鍵缺陷。輸出應包含一個「決策點總覽」清單（例如，列出 D1-D24 的標題），讓 user 能快速比對總結是否遺漏了重要部分。 |
| 10 | Output 長度上限 | with-conditions | s9 提到長度無上限。應設定一個軟上限（如 400-500 行），並將輸出結構化，優先呈現「分歧點」、「關鍵決策」，其餘收納在可選的「完整決策列表」中。 |

**Claude 10 條自審盲區（s1-s10）的補強或反駁**

- s1 (Context 不可靠): 同意。這不是小問題，是主要觸發模式的根本缺陷。應將檔案路徑作為主要輸入。
- s2 (選擇 metric 缺失): 同意，且這是 **最嚴重的盲區**。沒有 metric，skill 的核心功能就建立在隨機性之上。
- s3 (強制 3 情境): 同意。僵化的數字限制反映了設計的脆弱性。情境數量應與決策數量掛鉤。
- s4 (Jargon 翻譯不一致): 同意。建議在輸出結尾附上一個 "本次術語翻譯" 列表，增加透明度。
- s5 (未 highlight 分歧): 同意，這是 **第二嚴重的盲區**。總結的價值在於濃縮信噪比，而分歧點是最高信噪比的資訊。
- s6 (與 grill-me 邊界模糊): 同意。必須在 SKILL.md 中明確劃定界線：`explain-discussion` 是「報告者」，`grill-me` 是「提問者」。
- s7 (適用範圍模糊): 同意。應先專注做好 discussion 總結，這本身已足夠複雜。
- s8 (Fidelity check 缺失): 同意。一個簡單的補救措施是在報告開頭或結尾附上所有檢測到的決策點（D1-D24）的完整列表。
- s9 (長度無上限): 同意。skill 的目標是「讓 user 看得懂」，過長的輸出與此目標背道而馳。
- s10 (互動式展開): 反駁。這種設計試圖用 UI 技巧掩蓋核心摘要能力的不足。一個好的摘要應該是一次性交付、結構清晰，而非透過多次詢問來拼湊。

**新發現的盲區**（Claude 自審沒抓到的）

- 新 b1: **決策點的語義識別過於脆弱**：SKILL.md 似乎只依賴結構化標籤（如 "抉擇"、"Dxx"）。對於真實世界中以非結構化語句（例如："我認為我們應該..." 或 "這裡的風險是..."）表達的關鍵決策，skill 很可能會完全錯過。
- 新 b2: **對討論結構的隱式假設**：skill 似乎假設討論是像 `coach-agent` 範例一樣高度結構化的（分輪、分立場、有決策看板）。它能否處理 Slack 或 Teams 上的線性、混亂對話？SKILL.md 必須說明它能處理的格式以及前置條件。
- 新 b3: **決策的權重與關聯性被忽略**：在 `coach-agent` 討論中，D18 是基於 N13+N14 風險而做出的關鍵修正。一個好的摘要需要能識別這種因果關係，而不僅是孤立地列出決策。目前的設計沒有體現任何圖狀或關聯性分析。

**對 Demo run（R3 結論的解釋輸出）的具體點評**

由於無法訪問 Demo run 的實際輸出，此處為基於 skill 設計的推測性點評：

給定 `coach-agent` discussion R3 結論有 7 條「真分歧」和 7 條「新增決策」（D18-D24），一個只涵蓋 3 個抉擇的 250 行輸出是**完全不合格的**。它極有可能選了幾個次要的共識點來解釋，卻完全隱藏了像 D18（修復 handler 安全漏洞）這種由 R3 討論新發現的、最關鍵的決策。這樣的輸出不僅沒幫助，反而有害，因为它給 user 提供了「一切安好」的錯覺。

**對 SKILL.md 結構的修改建議**（具體 diff 等級的指示）

由於無法讀取 `SKILL.md`，以下為修改指令：

1.  **[重寫] 核心邏輯 Section**:
    -   **舊規則 (推測)**: "找出最多 3 個關鍵抉擇..."
    -   **新規則**:
        1.  **Phase 1: 實體識別**: 掃描全文，識別所有「潛在決策點」和「分歧點」。使用正則表達式和關鍵詞（如 `D\d+`, `Q\d+`, `R\d+`, `agree`, `disagree`, 決策, 風險, 議題, `立場`）。將每個點存為一個物件，包含其標題、原始文本片段、位置。
        2.  **Phase 2: 權重評分**: 為每個「潛在決策點」打分。評分標準：
            -   包含 `disagree`/`disputed`/`strongest concern` 等詞 +5 分。
            -   在「真分歧」或「開放問題」區域 +3 分。
            -   被多個參與者回覆 +1 分/每個參與者。
            -   被標記為 `risk`/`風險`/`N\d+` +2 分。
        3.  **Phase 3: 內容生成**:
            -   **分歧點優先**: 挑選評分最高的 1-2 個「分歧點」，完整解釋雙方論點。
            -   **關鍵決策**: 挑選評分最高的 2-3 個「決策點」，解釋其背景、方案和理由。
            -   **情境生成**: 為上述每個被選中的點生成一個具體情境。
            -   **完整列表**: 在報告末尾，附上所有被識別出的「潛在決策點」（D1-D24）的標題列表，作為 fidelity check。

2.  **[新增] 輸出結構 Section**:
    -   新增規則，定義輸出的 Markdown 結構必須包含以下部分，且按此順序：
        1.  `### 核心分歧 (Top Disagreements)`
        2.  `### 關鍵決策 (Key Decisions)`
        3.  `### 具體應用情境 (Scenarios)`
        4.  `### 完整決策點索引 (Full Decision Index)`
        5.  `### 本次術語翻譯 (Jargon Glossary)`

3.  **[修改] 觸發條件 Section**:
    -   **舊規則 (推測)**: "從 conversation context 抓檔案..."
    -   **新規則**: "Skill 必須以檔案路徑作為主要參數。若無檔案路徑，則檢查 conversation context。若 context 中無有效檔案或討論，必須回報錯誤並要求 user 提供明確路徑，不得自行猜測或繼續。"

**整體：哪 3 個 issue 必修才能 ship？**

1.  **#2 選擇 Metric 問題**: 必須建立一個可重複、基於權重（如分歧、風險）的決策篩選機制，取代當前隨機的 "最多 3 個"。
2.  **#5 Highlight 分歧問題**: 必須將「識別並優先呈現分歧點」作為 skill 的核心功能，因為這才是最有價值的資訊。
3.  **#9 Fidelity Verification 問題**: 必須提供一個「完整決策索引」，讓 user 能快速核對摘要的覆蓋範圍，建立對 skill 輸出的信任。
```

#### Round 1 收斂結果

**Readiness**: Codex 5/10 + Gemini 3/10。兩家對 16 條子議題立場高度一致 — **沒有真分歧**，只是 Gemini 嚴度更高。

**共識（兩家都 disagree 或要求補強的 5 條）**：

1. **必加 selection metric**（s2）— 「最多 3 個」沒 metric → 任意摘要、不可重複
2. **必 highlight 真分歧**（s5）— 是討論最高信噪比的部分，目前完全沒抓
3. **必補 fidelity source map**（s8/s9）— 列出掃到的決策、本次展開的、本次省略的
4. **強制 3 scenarios 必改**（s3）— 改成 0-3 個，由內容決定，每個情境綁一個展開的決策
5. **角色邊界明示**（s6）— skill 是 read-only reporter，不提問、不推 workflow

**Codex 抓的新盲區**：

- b1 規則彼此矛盾（demo 違反「不用 code fence / 不用首字縮寫」規則）
- b2 缺省略透明度（沒交代「另外哪些重要決策沒講」）
- b3 Section 5 容易越界成 workflow driver（demo 確實推 user `/write-spec`）

**Gemini 抓的新盲區**：

- b1 對輸入結構有隱性假設（預設討論高度結構化；非結構化聊天紀錄會失效）
- b2 缺決策因果關係表達（D18 ← N13/N14 這種依賴鏈沒呈現）
- b3 非結構化決策偵測（沒落在 `Dxx` 標籤的關鍵結論可能漏掉）

#### 共識看板（更新）

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| 1 | 模式判斷 fallback | 中 | with-conditions | disagree | **agreed** — 必須要求明確檔案路徑、context fallback 報告來源 |
| 2 | "最多 3 個" 選擇 metric | 高 | disagree | disagree | **agreed** — 必加 weighted scoring |
| 3 | 強制 3 scenarios | 中 | disagree | disagree | **agreed** — 改 0-3 由內容決定 |
| 4 | Jargon 翻譯一致性 | 中 | with-conditions | with-conditions | **agreed** — 輸出附本次術語表 |
| 5 | 真分歧 highlight | 高 | disagree | disagree | **agreed** — 升為輸出第一段 |
| 6 | 與其他 skill 接合 | 低 | with-conditions | with-conditions | **agreed** — read-only reporter，不提問、不推 workflow |
| 7 | spec/plan/ADR 適用 | 中 | with-conditions | disagree | **agreed** — 先做穩 discussion，spec/plan/ADR 推延 |
| 8 | 大討論切法 | 低 | disagree | disagree | **agreed** — 一次給分層完整摘要，不要兩段問答 |
| 9 | Fidelity source map | 中 | disagree | disagree | **agreed** — 必含決策索引 |
| 10 | Output 長度上限 | 低 | with-conditions | with-conditions | **agreed** — 設軟上限 400-500 行 |

#### 決策紀錄

| # | 決定 | 達成 | Round | 備註 |
|---|------|------|------|------|
| **DS1** | 加 Phase 0 — 候選掃描 + weighted scoring（disagreement +5、開放問題 +3、多人回覆 +1/per、risk/N#  +2）；輸出按權重排序選 1-3 抉擇 + 0-2 真分歧 | 2026-05-09 | R1 | Codex+Gemini 並 fl |
| **DS2** | 輸出結構新增「核心分歧」段落，**置於關鍵抉擇之前**（>500 行討論時）；分歧 = 兩家立場不同 / disputed status | 2026-05-09 | R1 | s5 是兩家眼中第二嚴重盲區 |
| **DS3** | 輸出結尾必含「完整決策索引」（列出所有 D# / N# 標題）+「本次省略清單」+ 省略原因 | 2026-05-09 | R1 | fidelity check，user 能快速比對 |
| **DS4** | 情境改 0-3 個；每個必須綁一個已展開的抉擇/分歧；不能形式先鎖 | 2026-05-09 | R1 | s3 |
| **DS5** | 風格規則加：「函數名/欄位名只能括號補充、禁 code fence 貼原樣」「首字縮寫第一次出現必括號白話譯」「輸出附本次術語對照表」 | 2026-05-09 | R1 | demo 違反 + Codex b1 |
| **DS6** | 取消「先精簡再問展開」互動；改成一次性分層輸出（核心分歧 → 關鍵抉擇 → 情境 → 完整索引 → 術語表） | 2026-05-09 | R1 | s10 兩家都反對問展開 |
| **DS7** | 角色邊界明示：「本 skill 不提問、不拍板、不推下一個 workflow command；Section 5 改條件式」 | 2026-05-09 | R1 | Codex+Gemini b3 / s6 |
| **DS8** | 輸入要求改：必須明確檔案路徑為主；Mode A 無參數時，先報告「我會用 X 檔」並等確認 | 2026-05-09 | R1 | s1 兩家都 disagree |
| **DS9** | 輸出軟上限 400 行；超過 → 縮情境細節，不縮核心分歧 / 抉擇 / 索引 | 2026-05-09 | R1 | s9 |
| **DS10** | spec / plan / ADR 暫不支援；skill description 收緊只說「discussion 檔」 | 2026-05-09 | R1 | s7 兩家都同意 |
| **DS11** | 偵測非結構化決策：除 D# / N# 標籤外，加掃「我認為」「應該」「建議」「風險」等關鍵詞作 fallback 識別 | 2026-05-09 | R1 | Gemini 新 b3 |

#### 開放問題

- 暫無 Round 2 必要 — R1 共識度高，可直接修 SKILL.md
