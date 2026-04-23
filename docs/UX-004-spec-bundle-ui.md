# UX-004 — Spec Bundle UI 規格

**狀態**：Proposed（待 user 確認方向後進入 Accepted）
**日期**：2026-04-21
**作者**：ui-ux-designer

---

## 設計前提

### 既有 Design Token（從程式碼擷取）

```
背景層
  Panel BG:       #1e293b
  Border:         rgba(255,255,255,0.08)

文字層
  TEXT_MAIN:      rgba(255,255,255,0.9)
  TEXT_DIM:       rgba(255,255,255,0.6)
  TEXT_MUTED:     rgba(255,255,255,0.4)

元素色
  DomainEvent:    橘     rgba(255,140,0,0.1) / border rgba(255,140,0,0.25)
  Aggregate:      金     rgba(184,134,11,0.12) / border rgba(184,134,11,0.35)
  Command:        藍     rgba(30,136,229,0.1)
  Remodel:
    parameter bg: #bbf7d0 (mint green)  text: #1e293b
    query bg:     #bfdbfe (blue-gray)   text: #1e293b
    returnType bg:#bbf7d0 (mint green)  text: #1e293b
    collapsed:    #7c3aed (purple)

行動按鈕
  Dashed btn:     border: 1px dashed rgba(255,255,255,0.2)  color: TEXT_DIM
  Danger:         #ef4444

字型規格
  SectionLabel:  10px, weight 600, uppercase, letterSpacing 0.08em
  Sub-label:     9px,  weight 600, uppercase, letterSpacing 0.06em
  Body:          12px
  Name input:    13px, weight 600
  Helper text:   11px, italic
```

### 既有可複用元件（不需新建）

| 元件 | 所在位置 | 用途 |
|------|---------|------|
| `SectionLabel` | DetailPanel.tsx | 區塊標題（10px uppercase） |
| `InlineField` | DetailPanel.tsx | label + input/textarea |
| `PropertyTable` | DetailPanel.tsx | name/type 兩欄 + 刪除按鈕列表（已用於 Command Information / Event Output）|
| dashed button style | GroupPanel | 「+ Add」行動按鈕 |
| dropdown pattern | GroupPanel (Aggregate picker) | 帶搜尋的 overlay 下拉 |
| `EditableColorBlock` | RemodelPanel | 彩色區塊（標題 + 文字輸入）|

---

## 1. Aggregate Detail Panel

### 1.1 Layout 總覽

```
┌─────────────────────────────────────────┐
│ [AR] Aggregate                          │  ← 金色 badge + 名稱 input（nameInput 樣式）
│                                         │
│ ─────────────────────────────────────── │
│ BEHAVIOR                                │  ← SectionLabel
│ [________________________]              │  ← 單行 input（比照 DomainEvent Behavior）
│                                         │
│ ─────────────────────────────────────── │
│ IDENTITY                                │  ← SectionLabel
│  Name   [________________]             │
│  Type   OrderId  (suggested)           │  ← derived，helper text 呈現，不可直接編輯
│  Field  orderId  (suggested)           │  ← derived，helper text 呈現
│                                         │
│ ─────────────────────────────────────── │
│ STATE                                   │  ← SectionLabel
│  ATTR         TYPE              ×       │
│  [status    ] [OrderStatus    ] [×]    │
│  [totalAmount] [Money         ] [×]    │
│  [+ Add State Field]                   │  ← dashed btn
│                                         │
│ ─────────────────────────────────────── │
│ INVARIANTS                              │  ← SectionLabel
│  [+ Add Invariant]  [Analyze with AI ▸]│  ← 兩個按鈕並排
│                                         │
│  ┌── CONFIRMED ─────────────────────┐  │  ← Band 1（無底色，實線）
│  │ InvariantCard（confirmed）       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌╌╌ NEEDS REVIEW · AI-inferred ╌╌╌┐  │  ← Band 2（虛線，淡黃底）
│  │ InvariantCard（needs_review）    │  │
│  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘  │
│                                         │
│  ▸ Rejected (2)                         │  ← Band 3（可摺疊，預設收起）
│                                         │
│ ─────────────────────────────────────── │
│ NOTES                                   │  ← SectionLabel（既有 textarea）
│ [_______________________________]       │
└─────────────────────────────────────────┘
```

### 1.2 Identity Section 細節

```
IDENTITY
  Name   [orderId____________]   ← input，可編輯，onBlur 寫回 aggregateIdentity.name
         ┌────────────────────────────────┐
         │ Suggested Type:  OrderId       │  ← 淡灰 helper row（11px TEXT_MUTED）
         │ Suggested Field: orderId       │  ← 同上，不可點擊
         └────────────────────────────────┘
```

**計算規則**（前端邏輯，設計層定義）：
- `_suggested_type` = `${AggregateName}Id`（e.g. Aggregate 叫 Order → OrderId）
- `_suggested_field` = 與 `identity.name` 一致（如 name 填 orderId，則 field 顯示 orderId）
- 兩個 suggested 欄位為 display-only，不在 Panel 提供輸入框

**空狀態**：name 為空時，suggested 欄位不顯示（避免顯示空字串）。

### 1.3 State Section 細節

複用既有 `PropertyTable`，但欄位語義對應如下：

| PropertyTable 欄位 | Aggregate State 對應 |
|-------------------|---------------------|
| `attrName` | `stateProperties[i].attrName` |
| `type` | `stateProperties[i].type` |

行為：
- 空狀態：只顯示 `+ Add State Field` dashed btn
- `onBlur` 寫回 `updateNote(id, { stateProperties: [...] })`
- 無 required / notes 欄位（MVP 省略，這兩欄在 spec 有但 UI 先不暴露）

### 1.4 Invariants Section 細節

#### 1.4.1 三個 Band 的視覺規格

```
CONFIRMED band（實線，無底色）
┌─────────────────────────────────────────┐
│  border: 1px solid rgba(255,255,255,0.12)
│  borderRadius: 6
│  padding: 10 12
│  background: rgba(255,255,255,0.03)
└─────────────────────────────────────────┘

NEEDS REVIEW · AI-inferred band（虛線，淡黃底）
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
│  border: 1px dashed rgba(234,179,8,0.4)
│  borderRadius: 6
│  padding: 10 12
│  background: rgba(234,179,8,0.06)
╘╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╛

REJECTED band（摺疊列，灰色刪除線）
▸ Rejected (N)                           ← 展開按鈕（accordion）
  （展開後）InvariantCard，opacity: 0.45，刪除線文字
```

Band 標題行（每個 Band 的 header）：

```
CONFIRMED (2)                      ← 10px uppercase SectionLabel 樣式
```

```
⚠ NEEDS REVIEW · AI-inferred (1)  ← 黃色警告色 rgba(234,179,8,0.8)
```

#### 1.4.2 InvariantCard Layout

**CONFIRMED 卡片（provenance: "ui", status: "confirmed"）：**

```
┌─────────────────────────────────────────┐
│ checkTotalAmount                  [: ⋯] │  ← name（camelCase，bold 12px）+ 展開選單
│ 總金額不得為負                           │  ← title（14px TEXT_MAIN）
│                                          │
│ RULES                                    │  ← 9px uppercase，TEXT_MUTED
│  [always          ] [totalAmount >= 0 ] │  ← when / rule row（見 1.4.3）
│  [+ Add Rule]                            │  ← dashed btn
│                                          │
│ Error Code  [invalidTotalAmount       ]  │  ← input，12px
│ State Refs  [totalAmount       ] [×]     │  ← tag list（見 1.4.4）
└─────────────────────────────────────────┘
```

**NEEDS REVIEW 卡片（provenance: "assumption", status: "needs_review"）：**

```
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
│ checkCancellable                  [: ⋯] │
│ 已出貨不可取消                    ★ AI  │  ← ★ AI badge：10px 黃色
│                                          │
│  Inferred by claude-opus-4.7            │  ← 11px TEXT_MUTED
│  CancelOrder 未標 precondition，但與     │  ← rationale（縮排，斜體 11px，可展開）
│  ShipOrder 操作同一 status 欄位  [⋯]    │
│                                          │
│ RULES                                    │
│  [status == .shipped] [不允許 cancel]   │
│  [status != .shipped] [允許 cancel]     │
│  [+ Add Rule]                            │
│                                          │
│ Error Code  [orderAlreadyShipped      ]  │
│ State Refs  [status] [×]                 │
│                                          │
│  [✓ Approve]   [✎ Edit]   [✗ Reject]   │  ← 三個行動按鈕（只在 needs_review 顯示）
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

**REJECTED 卡片（status: "rejected"）：**

```
  checkOldRule                       [: ⋯]
  ~~舊業務規則（已廢棄）~~             ← title 文字有刪除線，opacity: 0.45
  [Restore]                           ← 還原到 needs_review 的按鈕
```

#### 1.4.3 Rules 陣列編輯

每個 rule 是一列，left 欄 = `when`，right 欄 = `rule`：

```
RULES
┌─────────────────────┬──────────────────────────┐
│ when                │ rule                      │
├─────────────────────┼──────────────────────────┤
│ WHEN                │ RULE                      │  ← 9px header
│ [always           ] │ [totalAmount >= 0       ] │  ← input 各佔約 45%，中間 gap 8
│ [+ Add Rule]                                    │  ← dashed btn，跨全寬
└─────────────────────┴──────────────────────────┘
```

WHEN input 特殊處理：
- Placeholder：`"always" / "never" / "<field> <op> <value>"`
- 不做下拉選單（保持自由文字，避免過度複雜）

刪除一條 rule：每列右邊有 `×` 小按鈕（同 PropertyTable 刪除按鈕樣式）

#### 1.4.4 State Refs（relatedState）

以 tag 形式呈現，可輸入新增：

```
STATE REFS
  [status ×]  [totalAmount ×]  [+ add...]
```
- `+` 觸發 text input（inline，enter 確認）
- 可選擇現有 stateProperties 的 attrName（建議清單），也可自由輸入
- tag 樣式：`background: rgba(255,255,255,0.08)` `border-radius: 10px` `padding: 2px 8px` `font-size: 11px`

#### 1.4.5 Applicability 欄位

選擇性（非 MVP 必填），放在 title 下方：

```
  Applicability  [customerStatus == .established]   ← 可選輸入
```

空時不顯示 label，hover card 時顯示「+ Applicability」ghost 按鈕。

#### 1.4.6 卡片選單（[: ⋯]）

右上角 overflow 選單，點開後：
```
  ┌──────────────────┐
  │ Rename           │  ← 修改 name（camelCase id）
  │ Edit title       │  ← 修改 title（human-readable）
  │ ──────────────── │
  │ Move to Rejected │  ← (只在 confirmed / needs_review 顯示)
  │ Restore          │  ← (只在 rejected 顯示)
  │ Delete           │  ← 刪除（紅色）
  └──────────────────┘
```

### 1.5 「+ Add Invariant」流程

```
點擊「+ Add Invariant」
  → 在 CONFIRMED band 最底部插入新 InvariantCard
  → 卡片為 editing 狀態，title input 取得 focus
  → 預設值：
      id: uuid()
      name: ""（需填）
      title: ""（需填）
      rules: [{ when: "always", rule: "" }]
      errorCode: ""
      relatedState: []
      provenance: "ui"
      status: "confirmed"
      source: null
```

### 1.6 「Analyze with AI」按鈕

- 位置：INVARIANTS SectionLabel 右側
- 樣式：outline button，黃色系（`border: 1px solid rgba(234,179,8,0.4)` `color: rgba(234,179,8,0.8)`）
- 點擊後：loading spinner（button 內），完成後新 invariants 出現在 NEEDS REVIEW band
- 目前 T2 後端尚未實作：**按鈕 disable + tooltip「Coming soon」**
- **不在本 UX spec 範圍內實作 AI 呼叫邏輯**

### 1.7 Approve / Edit / Reject 流程

**Approve（needs_review → confirmed）：**
```
點擊 [✓ Approve]
  → status 改為 "confirmed"
  → source 保留（供匯出時標記 provenance 來源）
  → 卡片移入 CONFIRMED band（帶 200ms transition）
```

**Edit（needs_review → 直接編輯）：**
```
點擊 [✎ Edit]
  → 卡片進入 editing 模式（欄位解除 read-only）
  → status 保持 "needs_review"（user 需明確 Approve 才確認）
```

**Reject（needs_review → rejected）：**
```
點擊 [✗ Reject]
  → status 改為 "rejected"
  → 卡片移入 REJECTED band（摺疊，不顯示）
```

### 1.8 狀態覆蓋

| 狀態 | 呈現 |
|------|------|
| Aggregate note 空狀態（無任何欄位填寫）| 全部 section 顯示 empty state placeholder / dashed btn |
| invariants 全空 | INVARIANTS section 只顯示「+ Add Invariant」和「Analyze with AI」，三個 Band 不顯示 |
| invariants 只有 rejected | NEEDS REVIEW / CONFIRMED band 隱藏，REJECTED 折疊列顯示 |
| identity.name 空 | suggested type / field 不顯示 |
| Analyze loading | 按鈕 spinner，其他互動 disable |

---

## 2. Dto Detail Panel

### 2.1 Layout 總覽

```
┌─────────────────────────────────────────┐
│ [DTO] OrderSummaryDto                   │  ← badge + 名稱（label）input
│                                          │
│ ─────────────────────────────────────── │
│ DESCRIPTION                             │  ← SectionLabel
│ [Optional description...          ]     │  ← textarea（複用 notes 樣式）
│                                          │
│ ─────────────────────────────────────── │
│ FIELDS                                  │  ← SectionLabel
│  NAME          TYPE         NULL  REF   │  ← 欄位 header
│  [orderId    ] [String    ]  [ ]  [—]  │  ← 每列（nullable checkbox + dtoSpecRef picker）
│  [status     ] [OrderStat]  [ ]  [—]  │
│  [cancelledAt] [DateTime? ]  [✓]  [—]  │
│  [+ Add Field]                          │  ← dashed btn
│                                          │
│ ─────────────────────────────────────── │
│ NOTES                                   │  ← SectionLabel（既有 textarea）
│ [_______________________________]       │
└─────────────────────────────────────────┘
```

### 2.2 Fields 列表細節

**欄位寬度分配（Panel 總寬 360px，padding 各 16px，內容寬 328px）：**

```
NAME:  input flex 2    ≈ 140px
TYPE:  input flex 2    ≈ 120px
NULL:  checkbox 24px
REF:   picker btn 36px
×:     delete  18px
gap:   6px × 4
```

**每列 ASCII：**
```
[orderId           ] [String         ] □ [DTO▾] [×]
```

**REF picker（dtoSpecRef）：**

```
[DTO▾]
  ↓ 點擊展開
  ┌──────────────────────────────┐
  │ 🔍 [Search Dto...           ] │
  │  OrderSummaryDto              │
  │  OrderLineDto                 │
  │  ─────────────────────────── │
  │  (none)                       │  ← 清除 ref
  └──────────────────────────────┘
```

REF picker 觸發條件：
- 按鈕預設顯示「—」（無 ref）
- 已選後顯示 DTO 名稱縮短版（最多 8 字元 + `…`）例如 `OrderSu…`
- 下拉清單從當前 board 所有 Dto notes 列出（排除自身，避免循環引用）

### 2.3 Nullable Checkbox

- `[ ]` 未選 → `nullable: false`（或 undefined）
- `[✓]` 已選 → `nullable: true`
- 勾選後 TYPE 欄位不自動加 `?`（user 自行決定 type string）

### 2.4 Badge 樣式

```
[DTO]  ← background: rgba(74,222,128,0.2)（淡綠）
        color: #4ade80
        borderRadius: 4
        fontSize: 11
        fontWeight: 600
        padding: 3px 8px
```

（沿用 StickyNote type badge 模式，顏色對應 Dto 的淡綠色）

### 2.5 狀態覆蓋

| 狀態 | 呈現 |
|------|------|
| 空 Dto note（無 fields）| 只顯示 `+ Add Field` dashed btn |
| dtoSpecRef 指向已刪除的 Dto | REF 顯示 `(deleted)` 紅色文字，保留 dtoSpecRef 值 |
| 同一 Dto 被多個 field 引用 | 允許（複用 DTO 合法） |
| 循環引用自身 | dtoSpecRef picker 不列出自身 |

---

## 3. Remodel Detail Panel 重整

### 3.1 整體策略

現有 RemodelPanel 的三個 `EditableColorBlock`（PARAMETERS / FUNC NAME / RETURN TYPE）改為：

| 現在 | 改後 |
|------|------|
| PARAMETERS：單一 textarea（plain text）| PARAMETERS：結構化 `PropertyTable` |
| FUNC NAME：單一 textarea（plain text）| FUNC NAME：不變（保留，由 queryNote 驅動）|
| RETURN TYPE：單一 textarea（plain text）| RETURN TYPE：結構化 `ReturnTypeEditor` |

**新增**：BEHAVIOR 欄位（單行 input）

**Sub-note 畫布顯示規則（顯示邏輯，非 Panel 設計）：**
- `parameterNote.content` 改為 derived：由 `parameters[]` 自動生成文字
  - 格式：`customerId: CustomerId\nstatus: OrderStatus`（每行一個 property）
  - 若 `parameters` 為空或 undefined，保留舊 `parameterNote.content`（backward compat）
- `returnTypeNote.content` 改為 derived：由 `returnType.fields[]` 自動生成
  - 格式：`orders: OrderSummaryDto[]\ncount: Int`
  - 若超過 3 行，畫布截斷並加 `...` suffix
- `queryNote.content` 不變，保持 user 直接輸入

### 3.2 新 RemodelPanel Layout

```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐│
│  │ PARAMETERS                          ││  ← mint green bg（#bbf7d0）保留
│  │  ATTR           TYPE           ×    ││
│  │  [customerId  ] [CustomerId  ] [×] ││
│  │  [status      ] [OrderStatus ] [×] ││
│  │  [+ Add Parameter]                  ││  ← dashed，dark text on light bg
│  └─────────────────────────────────────┘│
│                                          │
│  ┌─────────────────────────────────────┐│
│  │ FUNC NAME                           ││  ← blue-gray bg（#bfdbfe）保留
│  │  [GetOrderList                     ]││  ← 單行 input（不變）
│  └─────────────────────────────────────┘│
│                                          │
│  ┌─────────────────────────────────────┐│
│  │ RETURN TYPE                         ││  ← mint green bg（#bbf7d0）保留
│  │  Shape  [object ▾]                  ││  ← shape selector（3 選項）
│  │                                      ││
│  │  NAME         TYPE       NULL  REF  ││  ← fields header
│  │  [orders    ] [OrderS… ] □   [DTO▾]││
│  │  [count     ] [Int     ] □   [—  ]││
│  │  [+ Add Field]                      ││  ← dashed btn，dark text
│  └─────────────────────────────────────┘│
│                                          │
│ ─────────────────────────────────────── │
│ BEHAVIOR                                │  ← SectionLabel
│ [Retrieve orders for customer service  ]│  ← 單行 input
│                                          │
│ ─────────────────────────────────────── │
│ SOURCE EVENTS                           │  ← 既有，不變
│ ...（略）                                │
│                                          │
│ ─────────────────────────────────────── │
│ LINKED DTOs                             │  ← 既有，不變
│ ...                                     │
└─────────────────────────────────────────┘
```

### 3.3 彩色區塊內的元件樣式調整

由於 Parameters / Return Type 區塊背景為淡色（mint green），其中的 input / button 需調整：

```
PARAMETERS 區塊內的 input（深色文字 on 淡色背景）
  background: rgba(0,0,0,0.08)
  border: 1px solid rgba(0,0,0,0.12)
  color: #1e293b
  borderRadius: 3

PARAMETERS 區塊內的 dashed btn
  border: 1px dashed rgba(0,0,0,0.2)
  color: #475569 （slate-600）

刪除按鈕 ×
  color: #475569
  background: none
```

（與現有 `EditableColorBlock` 的 `inputBase` 樣式一致，不新增 token）

### 3.4 Shape Selector

```
Shape  [object ▾]
         ↓
  ┌──────────────┐
  │ object       │  ← 有名稱欄位的物件
  │ array        │  ← 回傳陣列
  │ primitive    │  ← 純值（Int / String 等）
  └──────────────┘
```

- `shape: "primitive"` 時：fields 列表隱藏，顯示單一 TYPE input：
  ```
  Type  [String                           ]
  ```
- `shape: "array"` 時：fields 仍顯示（描述陣列元素的欄位），加一行說明 helper text：
  ```
  (Array of the following fields)
  ```

### 3.5 ReturnType 的 REF Picker

同 Dto Detail Panel 的 REF picker（§2.2），列出當前 board 所有 Dto notes。

### 3.6 畫布 SubNote 顯示更新

**畫布上的 Remodel 卡片（SubNote 元件）不需改 layout**，只改 content 來源：

```
parameterNote 顯示文字生成規則：
  if parameters && parameters.length > 0:
    content = parameters.map(p => `${p.attrName}: ${p.type}`).join('\n')
  else:
    content = parameterNote.content  ← 保留舊資料

returnTypeNote 顯示文字生成規則：
  if returnType && returnType.fields.length > 0:
    lines = returnType.fields.map(f => `${f.name}: ${f.type}`)
    if lines.length > 3:
      content = lines.slice(0,3).join('\n') + '\n...'
    else:
      content = lines.join('\n')
  else:
    content = returnTypeNote.content  ← 保留舊資料
```

這個 derived content 邏輯放在 Remodel.tsx 的渲染路徑（render-time derived），不寫回 store。

### 3.7 狀態覆蓋

| 狀態 | 呈現 |
|------|------|
| 舊 Remodel（parameters / returnType 未定義）| 彩色區塊 fallback 顯示舊 parameterNote.content / returnTypeNote.content |
| parameters 空陣列 | 只顯示 `+ Add Parameter` |
| returnType.shape == "primitive" | fields 隱藏，顯示 single type input |
| returnType.fields 引用已刪除 Dto | REF 顯示 `(deleted)` 紅色 |
| Remodel collapsed（畫布）| 顯示邏輯不變，queryNote.content 為主標題 |

---

## 4. 新元件清單

下列為本次新增的元件（需 frontend-engineer 建立）：

### 4.1 `InvariantCard`（新元件）

**Props：**
```typescript
interface InvariantCardProps {
  invariant: Invariant;
  onChange: (updated: Invariant) => void;
  onDelete: (id: string) => void;
}
```

**內部狀態：**
- `isExpanded: boolean`（rationale 折疊）
- `isEditing: boolean`（editing 模式，for needs_review Approve 前編輯）

**職責：**
- 根據 `invariant.status` 決定 band 樣式
- 根據 `invariant.provenance` 決定是否顯示 AI badge / Approve/Edit/Reject 按鈕
- 管理 rules 陣列的新增 / 刪除

### 4.2 `InvariantBand`（新元件）

**Props：**
```typescript
interface InvariantBandProps {
  status: 'confirmed' | 'needs_review' | 'rejected';
  invariants: Invariant[];
  onChangeInvariant: (updated: Invariant) => void;
  onDeleteInvariant: (id: string) => void;
}
```

**職責：**
- 根據 status 決定 band header 和邊框樣式
- REJECTED band 預設摺疊（accordion）
- 空 band 不顯示

### 4.3 `DtoFieldTable`（新元件）

類似 `PropertyTable`，但多兩欄：nullable checkbox + dtoSpecRef picker。

**Props：**
```typescript
interface DtoFieldTableProps {
  fields: DtoField[];
  allDtoNotes: StickyNote[];  // 供 REF picker 列出
  selfId: string;              // 排除自身循環引用
  onChange: (updated: DtoField[]) => void;
}
```

### 4.4 `ReturnTypeEditor`（新元件）

整合 shape selector + fields 列表。

**Props：**
```typescript
interface ReturnTypeEditorProps {
  returnType: ReturnTypeSpec;
  allDtoNotes: StickyNote[];
  bgColor: string;   // 繼承彩色區塊的背景色
  textColor: string; // 繼承彩色區塊的文字色
  onChange: (updated: ReturnTypeSpec) => void;
}
```

### 4.5 複用既有元件

| 功能 | 複用元件 |
|------|---------|
| Aggregate state fields | `PropertyTable`（無改動） |
| Remodel parameters | `PropertyTable`（無改動）|
| Behavior input | `InlineField`（無改動）|
| Identity name input | 既有 input style（nameInput）|
| Dto description | 既有 textarea（notes 樣式）|
| Dropdown pattern | 比照 GroupPanel 的 Aggregate dropdown |

---

## 5. 互動流程彙整

### Flow A：新增 Invariant

```
User 點擊「+ Add Invariant」
  → 在 CONFIRMED band 插入空 InvariantCard
  → title input focus
  → User 填寫 title
  → rules 初始一行（when: "always"）
  → User 填寫 rule
  → User 填寫 errorCode（blur 寫回）
  → Card 自動儲存（onBlur 每個欄位）
```

### Flow B：Approve AI Invariant

```
User 看到 NEEDS REVIEW band 的 InvariantCard（AI 推斷）
  → 閱讀 title + rationale
  → 點擊 [✓ Approve]
  → status 改為 "confirmed"
  → 卡片 animate 移入 CONFIRMED band
```

### Flow C：Edit AI Invariant 後 Approve

```
User 點擊 [✎ Edit]
  → 卡片進入 editing 模式（欄位 unlocked）
  → User 修改 title / rules
  → User 點擊 [✓ Approve]
  → status 改為 "confirmed"（修改後確認）
```

### Flow D：新增 Dto Field with REF

```
User 在 Dto Panel 點擊「+ Add Field」
  → 新增空白列（name / type 輸入框 focus）
  → User 填 name: "lines"，type: "OrderLineDto[]"
  → User 點擊 REF picker [—]
  → Dropdown 顯示所有 Dto notes（排除自身）
  → User 選擇「OrderLineDto」
  → REF 欄顯示「OrderLi…」（縮短）
  → dtoSpecRef 寫回 note.dtoFields[i].dtoSpecRef
```

### Flow E：設定 Remodel ReturnType

```
User 點擊 Remodel → Detail Panel 顯示
  → User 看到 RETURN TYPE 區塊（shape 預設 "object"）
  → User 點擊「+ Add Field」
  → 填 name: "orders"，type: "OrderSummaryDto[]"
  → 點擊 REF picker → 選 OrderSummaryDto Dto note
  → 畫布 returnTypeNote 自動更新為 "orders: OrderSummaryDto[]"
```

---

## 6. Accessibility

- 所有 input / button 支援 keyboard focus（Tab 順序）
- InvariantCard 展開/收起用 button（不用 div）
- Dropdown 按 Escape 關閉
- Nullable checkbox 有 aria-label
- REF picker button 有 title attribute 說明用途
- AI badge「★ AI」補 aria-label="AI inferred invariant"

---

## 7. 本規格與既有 Panel 的銜接關係

| Panel | 現況 | 本規格改動 |
|-------|------|----------|
| DomainEvent Panel（GroupPanel）| 已有 Behavior、PropertyTable | 不變 |
| Entity Panel | 已有 Mark as AR、Notes | 不變 |
| Aggregate Panel | **無**（用 NotePanel 通用 Panel）| **新增 AggregatePanel（本規格）** |
| Dto Panel | **無**（用 NotePanel 通用 Panel）| **新增 DtoPanel（本規格）** |
| Remodel Panel | 三個 EditableColorBlock（plain text）| **改為結構化（本規格 §3）** |

---

## 8. 設計決策紀錄

```
[Decision ID: UX-004-A]
Status: Proposed
Date: 2026-04-21
Subject: Invariant 三 Band 視覺區分策略
Decision: CONFIRMED 用實線無底色，NEEDS REVIEW 用虛線淡黃底，REJECTED 用 accordion 摺疊
Rationale: 三個 band 需清楚區分 urgency：confirmed = 平靜，needs_review = 待注意（黃），rejected = 次要（摺疊）。虛線比實線「不確定感」更強，與 dashed button 既有語言一致。
Alternatives considered: Tab 切換（CONFIRMED / REVIEW / REJECTED 三個 tab）— 但 tab 隱藏資訊，user 無法一眼看到所有 invariants。
Superseded by: —
Impact scope: InvariantBand 元件
```

```
[Decision ID: UX-004-B]
Status: Proposed
Date: 2026-04-21
Subject: Remodel Parameters 從 plain text 改為 PropertyTable
Decision: 結構化 PropertyTable 取代 EditableColorBlock textarea
Rationale: 與討論決策一致（sub-note.content 改為 display-only，單一 source of truth）。PropertyTable 已在 Command Information / Event Output 驗證過 UX，複用降低學習成本。
Alternatives considered: 保留 textarea 雙軌並存 — 資料職責不清，exporter 需解析文字。
Superseded by: —
Impact scope: RemodelPanel、Remodel.tsx（derived content 生成）
```

```
[Decision ID: UX-004-C]
Status: Proposed
Date: 2026-04-21
Subject: Identity 的 _suggested_ 欄位顯示為 helper text，不可編輯
Decision: _suggested_type / _suggested_field 顯示為非互動的 helper row
Rationale: _suggested_ 前綴的語義是「AI 可改的建議值，程式自動推導」。提供 input 反而誤導 user 以為這是 authored 欄位。Helper text 呈現提示意義，降低混淆。
Alternatives considered: 顯示 input 但 disabled — disabled input 易讓 user 誤解是 bug 或 loading。
Superseded by: —
Impact scope: AggregatePanel identity section
```

---

## 9. Phase 2 / 未來延伸

- **Invariant applicability 欄位**：本規格中設計為 ghost 出現（hover 才顯示入口），若 user 覺得太隱蔽可升為常駐欄位
- **AI Analyze 按鈕啟用**：T2 後端完成後解除 disable 狀態
- **stateProperties 的 required / notes 欄位**：目前 PropertyTable 只有 attrName / type，可擴充為更完整的 Property 表單（4 欄）
- **Invariant 排序**：目前新增在最底，可加拖拉排序（dnd-kit 已在專案中）
- **ReturnType shape: "array" 的元素類型定義**：目前 fields 描述元素欄位，可加一個 outer type name 欄位
