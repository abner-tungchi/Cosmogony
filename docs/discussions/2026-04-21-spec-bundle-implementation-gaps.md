---
topic: "Spec Bundle 實作 — 畫布資料結構與 UI 擴充"
status: in-progress
created: "2026-04-21"
updated: "2026-04-21"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4) — Round 1 未回應
  - Gemini (2.5 Pro fallback)
  - ui-ux-designer（視需要諮詢）
facilitator: Claude
rounds_completed: 1
---

# Spec Bundle 實作 — 畫布資料結構與 UI 擴充

## 議題定義

### 背景

先前的討論（`docs/discussions/2026-04-20-usecase-spec-and-readmodel-extension.md`）已定義了 Spec Bundle 格式（見 `docs/spec-design.md`）。但要把 Bundle 從畫布產出，現有的 `StickyNote` / `Remodel` / `Dto` 資料結構有多處缺口。

### 目標

為三個主要缺口設計**資料結構擴充**與**對應的 UI 輸入入口**，讓 user 在畫布上能完整定義 Aggregate / Remodel / Dto 的所有 spec 欄位。

### 範圍

**討論內：**
- Aggregate note 的 identity / state / invariants / behavior 擴充
- Remodel 的 parameters / returnType 從 plain text 改為結構化
- Dto note 的 fields[] 結構
- Store migration 策略（v13 → v14）
- UI 入口設計（Detail Panel / Modal / 其他）

**討論外：**
- Invariant 的 AI 推斷流程（T2 Analyze 動作）— 另議
- Bundle exporter 改寫細節 — 資料結構定案後再派 frontend-engineer
- 後端 MCP tools 擴充 — 前端確定後再派 backend-engineer

### 約束

- 維持 Event Storming 工具的輕量精神：新欄位盡量 optional，不強制 user 填
- 保持 backward compat：舊資料 migration 要無痛升級
- User 是工程師背景但對 UI/UX 不熟，需有視覺化輔助

### 子議題

- [ ] **子議題 1**：Aggregate note 的資料結構擴充（identity / state / invariants / behavior）與 UI 入口
- [ ] **子議題 2**：Remodel 的 parameters / returnType 結構化與 UI 入口
- [ ] **子議題 3**：Dto note 的 fields[] 結構與 UI 入口
- [ ] **子議題 4**：Store migration 與 backward compat 策略

---

## 討論紀錄

### Round 1 — Claude (Opus 4.7)

#### 子議題 1：Aggregate 資料擴充

**立場**：選 **A（扁平擴充）**

**論點**：
1. **一致性優先**：現有慣例是把 type-specific 欄位扁平掛在 `StickyNote`（`information` for Command、`eventProperties` for DomainEvent、`linkedAggregateNoteId` for Entity）。若 Aggregate 走巢狀或獨立 store，會造成兩套訪問模式並存，後續維護者容易搞混。
2. **Migration 便宜**：扁平欄位的 migration 只需 `if (note.type === 'Aggregate') { ... }`，巢狀或獨立 store 要動 store shape，牽動 selector、persist、MCP tools、apiSync。
3. **Store 獨立 collection（選項 C）誘惑力大但風險高**：DDD 上最乾淨，但 Event Storming Tool 的 `notes[]` 已綁死太多東西（cascade delete、link target、group 連動）。除非有強壓力（例如要支援多版本 spec 共存），不該為純結構潔癖做大重構。

**TypeScript type**：
```typescript
// src/types/elements.ts

export interface InvariantRule {
  when: string;       // "always" / "never" / "<field> <op> <value>"
  rule: string;       // natural language or expression
}

export interface Invariant {
  id: string;
  name: string;              // camelCase semantic id
  title: string;             // human-readable label
  applicability?: string;
  rules: InvariantRule[];
  errorCode: string;
  relatedState?: string[];   // references state Property.attrName
  provenance: 'ui' | 'assumption';
  status: 'confirmed' | 'needs_review' | 'rejected';
  source?: {
    agent: string;
    derivedFrom: string[];
    inferredAt: string;
    rationale: string;
  } | null;
}

export interface AggregateIdentity {
  name: string;              // e.g. "orderId"
  _suggestedType?: string;   // e.g. "OrderId"
  _suggestedField?: string;  // e.g. "orderId"
}

export interface StickyNote {
  // ... existing fields

  // --- Aggregate-specific (sub-topic 1) ---
  aggregateIdentity?: AggregateIdentity;
  stateProperties?: Property[];
  invariants?: Invariant[];
  // behavior 已經在前次 commit 加過
}
```

#### 子議題 2：Remodel parameters / returnType 結構化

**立場**：**頂層提升 + sub-note 改為 display-only（選項 C 的變體）**

**論點**：
1. **職責分離**：`parameterNote` / `returnTypeNote` 原本是 4-in-1 卡片的**視覺元素**（讓用戶在畫布看到文字），不是資料容器。把結構化資料硬塞回 `sub-note.content` 會混淆顯示與資料職責。
2. **頂層提升的好處**：`Remodel.parameters` 與 `Remodel.returnType` 直接是結構化資料，exporter 不用解析文字。sub-note.content 可改為「從結構化資料自動產生的顯示文字」，變成 derived 欄位。
3. **Migration 處理舊 plain text**：**不強制解析**。舊資料的 `parameterNote.content` 保留原文字，新欄位預設為空陣列。UI 上顯示「尚未結構化，請補欄位」提示；user 手動填，AI 可在 T2 Analyze 動作協助推導。
4. **反對選項 A（破壞性改 content）**：舊資料會瞬間失去內容，使用者體驗差。
5. **反對選項 B（兩套並存在 sub-note 上）**：sub-note 承載雙重職責（顯示 + 結構化資料）會很亂。

**TypeScript type**：
```typescript
// src/types/elements.ts

export interface ReturnTypeSpec {
  shape: 'object' | 'array' | 'primitive';
  fields: Array<{
    name: string;
    type: string;
    nullable?: boolean;
    dtoSpecRef?: string;    // reference to DtoSpec id
  }>;
}

export interface Remodel {
  // ... existing fields (parameterNote, queryNote, returnTypeNote 都保留)

  // --- Structured data (sub-topic 2) ---
  parameters?: Property[];
  returnType?: ReturnTypeSpec;
  behavior?: string;          // 補上缺口
}
```

#### 子議題 3：Dto note 的 fields 結構

**立場**：選 **A（扁平擴充）**，理由同子議題 1。

**TypeScript type**：
```typescript
// src/types/elements.ts

export interface DtoField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;  // for nested DTO references
}

export interface StickyNote {
  // ... existing
  dtoFields?: DtoField[];
  // notes 欄位已存在，可作為 DTO description
}
```

**不建議做的事**：對 Dto 的 `label` 做 regex heuristic 解析（Gemini 提議）。理由：Dto label 通常是 human-readable name（`OrderSummaryDto`），而不是欄位定義。強行解析產生垃圾資料，user 還得手動清理。**留白讓 user 填**是更乾淨的作法。

#### 子議題 4：Store migration v13 → v14

**立場**：全部新欄位 **optional**；**不做 heuristic 解析**；`behavior` 欄位補到 Aggregate 與 Remodel。

**Migration 原則**：
1. 所有新欄位 optional，舊資料不需 migration 就能正常運作
2. 提供預設空陣列（避免 selector `note.invariants.map()` 崩潰）— 但這其實可以靠 `?.map()` 或 `?? []` 處理，不一定要 migration 時賦值
3. **不做 content 文字解析**：Remodel 的 `parameterNote.content` / `returnTypeNote.content` 舊文字保留，user 手動結構化
4. Store version 13 → 14

**Migration 偽代碼**：
```typescript
// src/store/boardStore.ts

{
  name: 'event-storming-board',
  version: 14,
  migrate: (persistedState: unknown, version: number) => {
    const s = persistedState as any;

    // ... v1~v13 保留 ...

    if (version < 14) {
      if (s.project?.boards) {
        for (const board of s.project.boards) {
          // notes: Aggregate / Dto 加預設 optional 欄位（其實可省略，undefined 即可）
          for (const note of (board.notes || [])) {
            if (note.type === 'Aggregate') {
              note.aggregateIdentity ??= undefined;
              note.stateProperties ??= [];
              note.invariants ??= [];
            }
            if (note.type === 'Dto') {
              note.dtoFields ??= [];
            }
          }
          // remodels: 補結構化欄位
          for (const remodel of (board.remodels || [])) {
            remodel.parameters ??= [];
            remodel.returnType ??= { shape: 'object', fields: [] };
            remodel.behavior ??= undefined;
          }
        }
      }
    }

    return s;
  },
}
```

#### 對其他 Agent 的回應

- **與 Gemini 在子議題 1/3/4 的方向大致一致**。主要差異：我反對 Gemini 提的 **Dto label regex 解析**（產垃圾資料風險 > 省工價值）
- **在子議題 2 我更激進**：Gemini 說「legacy 保留不動，UI 雙寫過渡期」— 我進一步提議把 sub-note.content 視為 display-only（從結構化資料自動產生），徹底解決資料與顯示分離的問題
- **Codex 本 Round 沒拿到實質分析**（codex-rescue agent 只回了一句 forwarded 訊息），可下 Round 再補

---

### Round 1 — Gemini (2.5 Pro，3 Pro 額度耗盡降級)

> **註**：原訂使用 Gemini 3 Pro，因 429 MODEL_CAPACITY_EXHAUSTED 降級。若需 3 Pro 視角可下輪重跑。

#### 子議題 1：Aggregate 資料擴充

**立場**：選 **A（扁平擴充）**

**論點**：
- Option A 符合既有慣例（`information` for Command、`eventProperties` for DomainEvent 都扁平掛在上面）
- Option B 巢狀內聚性高，但與現有扁平慣例不一致，所有 selector / migration / MCP tool 都要重新設計存取路徑
- Option C 符合 DDD 的 Model/Projection 分離原則，但 `boardStore` 裡 notes 陣列綁死 CRUD、Group 連動、cascade delete、畫布渲染、linkLayer ID 解析，重構成本極高

**TypeScript type**：見 Claude 分析（方向一致）

#### 子議題 2：Remodel 結構化

**立場**：**頂層提升**（`Remodel.parameters` 與 `Remodel.returnTypeStruct`）

**論點**：
- ReadModel 是 Query Contract，輸入輸出需嚴謹定義，純文字無法餵 AI code-gen
- 原 `parameterNote` / `returnTypeNote` 保留作純文字描述 / UI 顯示，達成平滑過渡
- 在 `BundleSubNote` 加欄位會讓它職責過重；頂層提升最乾淨

#### 子議題 3：Dto fields 結構

**立場**：選 **A（扁平擴充）**。擴充 `StickyNote.dtoFields?: DtoField[]`。

**額外建議**：對舊資料的 Dto label 做 regex heuristic 解析（如 `^fieldName: Type` 格式），預先填入 `dtoFields`。

#### 子議題 4：Migration v13 → v14

**立場**：
- Zustand persist `version` 升到 14
- 遍歷 `project.boards[].notes[]`、`project.boards[].remodels[]`，為新欄位賦預設值
- Heuristic 解析：Dto legacy label 可 regex 解析為 `dtoFields`；Remodel 純文字不強制解析（避免誤判）
- 全部新欄位設 optional

**Migration 偽代碼**：略（與 Claude 方向一致，差別在 Dto regex parsing）

#### 對其他 Agent 的回應

（第一輪略過，指出 Gemini 3 Pro capacity 問題）

---

### Round 1 — Codex (未完成)

Codex rescue agent 本 Round 只回傳 "I'll forward this rescue request to Codex"，未產出實質分析。下 Round 可重試或由 Claude + Gemini 主導收斂。

---

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| 1 | Aggregate 資料擴充 | 選 A（扁平擴充） | — | 選 A | **majority**（Claude + Gemini 一致；Codex 未回應）|
| 2 | Remodel 結構化 | 頂層提升 + sub-note 改 display-only | — | 頂層提升，legacy 保留 | **majority**（方向一致，Claude 更激進）|
| 3 | Dto fields 結構 | 選 A（扁平擴充）；不做 regex heuristic | — | 選 A；做 regex heuristic | **majority**（結構方向一致，但 migration heuristic 有分歧）|
| 4 | Migration 策略 | 新欄位全 optional，不解析舊文字 | — | 新欄位全 optional，Dto label 做 regex | **majority**（大方向一致，Dto regex 有分歧）|

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 | 備註 |
|---|------|---------|------|------|
| 1 | Aggregate note 採扁平擴充：StickyNote 新增 `aggregateIdentity?` / `stateProperties?` / `invariants?`（behavior 已有）| 2026-04-21 | Round 1 Claude+Gemini 一致 | 符合 `information` / `eventProperties` 既有模式 |
| 2 | Remodel parameters / returnType 採頂層提升：Remodel 新增 `parameters?: Property[]` / `returnType?: ReturnTypeSpec` / `behavior?`。**Sub-note.content 改為 display-only**，從結構化資料自動產生（single source of truth）| 2026-04-21 | Round 1 + User 決策（Q2）| 因舊資料為測試資料無 backward-compat 負擔 |
| 3 | Dto note 採扁平擴充：StickyNote 新增 `dtoFields?: DtoField[]`。**不做 label regex heuristic** | 2026-04-21 | Round 1 Claude + User 決策（Q1）| 舊資料為測試資料，不需 heuristic 搶救 |
| 4 | Store migration v13 → v14：**所有新欄位 optional，無需資料轉換**。舊資料新欄位為 undefined，不破壞運作 | 2026-04-21 | Round 1 + User 決策 | 最小改動 migration |
| 5 | 新 type 定義放 `src/types/specs.ts`：`Invariant` / `InvariantRule` / `AggregateIdentity` / `DtoField` / `ReturnTypeSpec` 集中 | 2026-04-21 | User 決策（Q4 選 b）| 對應 `docs/spec-design.md` 的 spec 概念，未來擴充（如 Saga spec）有固定放置處 |

---

## 開放問題

### Q1：Dto label 是否做 regex heuristic 解析？
- **Gemini**：做，嘗試 parse `fieldName: Type` 格式自動填 `dtoFields`
- **Claude**：不做，label 通常是 DTO 名稱（如 `OrderSummaryDto`）而非欄位列表，regex 會產垃圾
- **待決**：user 拍板

### Q2：Remodel 的 sub-note.content 未來地位？
- **Claude**：改為 display-only（從結構化資料自動產生）
- **Gemini**：legacy 保留，UI 雙寫過渡
- **待決**：選一個方向，影響 Remodel.tsx 的改動幅度

### Q3：Codex 本 Round 沒分析，要不要重跑？
- 可選擇 Round 2 重新 dispatch，或直接由 Claude + Gemini + user 收斂

### Q4：新增的 `Invariant` / `ReturnTypeSpec` / `DtoField` / `AggregateIdentity` 型別放哪個檔案？
- 選項：`elements.ts` 同檔、新檔 `src/types/specs.ts`、放 `src/types/invariant.ts` / `src/types/dto.ts` 等分檔
- **待決**：影響 import 結構

---

## 下次討論指引

### 進度摘要

Round 1 完成（Claude + Gemini 2.5 Pro；Codex 未回應實質分析）。三個子議題大方向一致：
- 資料結構：Aggregate / Dto 採扁平擴充 StickyNote，Remodel 採頂層提升
- Migration：新欄位全 optional，版本 v13 → v14

主要分歧：
- Dto label 要不要 regex heuristic 解析（Gemini 支持，Claude 反對）
- Remodel sub-note.content 未來地位（Claude: display-only / Gemini: legacy 保留）

### 待處理事項

User 審視 Round 1 後，選擇下一步：
- 針對 Q1-Q4 給方向，Claude 整合為決策記錄
- 或跑 Round 2（可重試 Codex 或聚焦分歧點）
- 或直接產出 TypeScript type 定稿讓 user 審核

### 閱讀建議

- Round 1 Claude 與 Gemini 分析
- `src/types/elements.ts` 現況
- Q1 / Q2 的兩種取向

### 注意事項

- 資料結構定稿後才交給 ui-ux-designer 設計 UI（per 方案 B）
- Codex 的回應缺失不阻礙收斂，但下 Round 可重試取得第三視角
