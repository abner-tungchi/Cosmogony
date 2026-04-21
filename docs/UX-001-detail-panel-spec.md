# UX-001 — Detail Panel 設計規格

> 版本：1.0 | 狀態：Ready for Implementation
> 對象：Frontend Engineer, QA
> 對應資料模型：`src/types/elements.ts`（`Bundle`, `StickyNote`, `Policy`, `FlowPath`）

---

## 一、需求理解與設計決策

### 核心問題
使用者點選畫布上的 Bundle 或 StickyNote 後，目前沒有地方可以瀏覽或編輯**補充結構化資料**（`policies`、`trigger`、`uiDescription`、`readModels`、`paths`、`phase`、`notes`）。這些欄位已在 `elements.ts` 中定義，但 UI 沒有對應的呈現介面。

### 主要設計決策

#### 決策 1：Canvas 縮窄，而非面板覆蓋
面板開啟時，畫布區域的 `right` 邊界縮進 360px，讓面板「推擠」畫布而非浮蓋其上。

**理由**：Bundle 展開寬度為 528px（160×3 + 8×2）。若面板浮蓋，使用者選取右側 Bundle 後整張卡片會被遮住，無法在查看詳情的同時觀察畫布上的位置關係。

**技術實作**：Board 容器設 `transition: margin-right 300ms cubic-bezier(0,0,0.2,1)`，面板開啟時設 `margin-right: 360px`。

#### 決策 2：面板寬度定為 360px
左側 Sidebar 展開為 240px，1280px 螢幕下剩餘畫布寬度 = 1280 - 240 - 360 = **680px**，足以顯示一個完整展開的 Bundle（528px）並留有餘裕。

#### 決策 3：Bundle 核心欄位不在面板內 inline 編輯
`infoNote`、`entityNote`、`commandNote`、`eventNote` 的 `label` / `content` 已有**畫布上雙擊編輯**入口，在面板裡重複提供會造成入口混亂。面板內僅開放補充欄位（`notes`、`phase`、`trigger`、`uiDescription`）的 inline 編輯。

#### 決策 4：Bundle 面板內的色塊群組為唯讀摘要（Read-only Summary）
色塊群組的目的是讓使用者在面板裡快速確認「這個 Bundle 代表什麼」，不是第二個編輯入口。

---

## 二、觸發條件與狀態機

```
使用者點選 Bundle 或 StickyNote（非 linking mode）
  → uiStore 新增 selectedDetailId: string | null
  → selectedDetailType: 'bundle' | 'note' | null
  → 面板滑入（translateX: 100% → 0）

使用者點選空白畫布
  → selectedDetailId = null
  → 面板滑出（translateX: 0 → 100%）

使用者按 Escape 鍵
  → 同上

使用者點選面板關閉按鈕 (×)
  → 同上

使用者切換 Board Tab（切換 Context）
  → selectedDetailId = null（自動關閉）
```

### uiStore 新增欄位（需 FE 實作）
```typescript
selectedDetailId: string | null;
selectedDetailType: 'bundle' | 'note' | null;
setSelectedDetail: (id: string | null, type: 'bundle' | 'note' | null) => void;
```

---

## 三、面板整體規格

### 佈局結構

```
┌──────────────────────────────────────────────────────┐  ← position: fixed
│  [DETAIL PANEL]                                      │
│  width: 360px                                        │
│  top: 0 / right: 0 / bottom: 0                       │
│  z-index: 50                                         │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ HEADER (flex-shrink: 0)                      │    │
│  │ padding: 20px 20px 16px                      │    │
│  │ border-bottom: 1px solid #334155             │    │
│  ├──────────────────────────────────────────────┤    │
│  │ BODY (flex: 1, overflow-y: auto)             │    │
│  │ padding: 16px 20px 24px                      │    │
│  │ gap between sections: 16px                   │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### CSS 規格

| 屬性 | 值 |
|------|-----|
| `position` | `fixed` |
| `right` | `0` |
| `top` | `0` |
| `bottom` | `0` |
| `width` | `360px` |
| `background` | `#1e293b`（與 Sidebar 同色，深色主題） |
| `border-left` | `1px solid #334155` |
| `box-shadow` | `-4px 0 24px rgba(0,0,0,0.15)` |
| `z-index` | `50` |
| `display` | `flex` |
| `flex-direction` | `column` |
| `overflow` | `hidden` |

### 開關動畫

```css
/* 初始（關閉）狀態 */
transform: translateX(100%);
transition: transform 300ms cubic-bezier(0, 0, 0.2, 1);

/* 開啟狀態（加上 class "open" 或透過 inline style） */
transform: translateX(0);
```

### 畫布響應

```css
/* BoardCanvas 或其 wrapper */
transition: margin-right 300ms cubic-bezier(0, 0, 0.2, 1);

/* 面板關閉時 */
margin-right: 0;

/* 面板開啟時 */
margin-right: 360px;
```

---

## 四、Bundle 選取狀態的面板佈局

### 完整線框圖

```
┌─────────────────────────────────────────┐
│ HEADER                                  │
│                                         │
│  Bundle                    [× 關閉]     │
│  ─ 元素名稱（eventNote.label）           │
│  bundle · #a1b2c3                       │
│                                         │
├─────────────────────────────────────────┤
│ BODY (scroll)                           │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ AGGREGATE (yellow, full width)  │    │
│  │  aggregate · ENTITY / AR        │    │
│  │  [infoNote.label]               │    │
│  │  [infoNote.content]             │    │
│  └─────────────────────────────────┘    │
│  ┌───────────────┐ ┌───────────────┐    │
│  │ COMMAND (blue)│ │ DOMAIN EVENT  │    │
│  │  command      │ │  (orange)     │    │
│  │  [command     │ │  domain event │    │
│  │  Note.label]  │ │  [eventNote   │    │
│  │  [content]    │ │  .label]      │    │
│  └───────────────┘ └───────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ INFORMATION (green, full width) │    │
│  │  information · CMD PARAMS       │    │
│  │  [entityNote.label]             │    │
│  │  [entityNote.content (list)]    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  PATHS ──────────────────────────────   │
│  [● Happy Path] [● 集團案件]            │
│  (彩色 pill badges)                     │
│                                         │
│  META ───────────────────────────────   │
│  Trigger   [trigger text — editable]    │
│  UI        [uiDescription — editable]  │
│  Phase     [phase — editable]           │
│                                         │
│  POLICIES ───────────────────────────   │
│  🛡 [rule text]               [block]   │
│  ⚠  [rule text]               [warn]    │
│                                         │
│  READ MODELS ────────────────────────   │
│  [KanbanBoard] [QuotationPDF]           │
│                                         │
│  NOTES ──────────────────────────────   │
│  │ [notes text — editable]             │
│  └─ (left border accent)               │
│                                         │
└─────────────────────────────────────────┘
```

---

### 4.1 Header

**結構：**
```
flex row, align-items: flex-start, padding: 20px 20px 16px
border-bottom: 1px solid #334155
position: relative
```

**元素：**

| 元素 | 規格 |
|------|------|
| 標題（元素名稱） | `eventNote.label` 或 `"Unnamed Bundle"` — font-size: 17px, font-weight: 700, color: `#f1f5f9`, max-width: calc(100% - 40px), overflow: hidden, word-break: break-word |
| 副標題（型別 + ID） | `"bundle · #" + bundle.id.slice(0,8)` — font-size: 11px, color: `#94a3b8`, font-family: monospace, margin-top: 4px |
| 關閉按鈕 | `position: absolute; top: 16px; right: 16px` — 24×24px touch target, background: transparent, border: none, color: `#94a3b8`, font-size: 18px, border-radius: 4px |
| 關閉按鈕 hover | background: `rgba(255,255,255,0.06)`, color: `#f1f5f9` |

---

### 4.2 色塊群組（FigJam 風格 Sticky Group）

**容器：**
```css
display: grid;
grid-template-columns: 1fr 1fr;
gap: 8px;
```

**四個色塊規格：**

#### Aggregate（黃）— `infoNote`
```css
grid-column: 1 / -1;        /* 橫跨全寬 */
background: #FFD600;
color: #333333;
border-radius: 8px;
padding: 12px;
```

| 子元素 | 規格 |
|--------|------|
| type label | `"aggregate · ENTITY / AR"` — font-size: 9px, font-weight: 500, text-transform: uppercase, letter-spacing: 0.6px, opacity: 0.5 |
| title | `infoNote.label` 或空值提示 — font-size: 14px, font-weight: 600, margin-top: 4px |
| content | `infoNote.content` — font-size: 11px, line-height: 1.6, margin-top: 4px, opacity: 0.75 |

#### Command（藍）— `commandNote`
```css
background: #1E88E5;
color: #ffffff;
border-radius: 8px;
padding: 12px;
```

| 子元素 | 規格 |
|--------|------|
| type label | `"command"` — 同上樣式 |
| title | `commandNote.label` — 14px, font-weight: 600 |
| content | `commandNote.content` — 11px, line-height: 1.6, opacity: 0.75 |

#### Domain Event（橘）— `eventNote`
```css
background: #FF8C00;
color: #ffffff;
border-radius: 8px;
padding: 12px;
```

| 子元素 | 規格 |
|--------|------|
| type label | `"domain event"` |
| title | `eventNote.label` |
| content | `eventNote.content` |

#### Information / CMD Params（綠）— `entityNote`
```css
grid-column: 1 / -1;        /* 橫跨全寬 */
background: #43A047;
color: #ffffff;
border-radius: 8px;
padding: 12px;
```

| 子元素 | 規格 |
|--------|------|
| type label | `"information · CMD PARAMS"` |
| title | `entityNote.label` |
| content | `entityNote.content` — 若內容為逗號或換行分隔的參數列表，以 `font-family: monospace` 顯示，每行前加 `·` 前綴（純顯示用） |

**空值狀態：**
若 `label` 為空字串，title 顯示 `"—"` with `opacity: 0.4`。
若 `content` 為空字串，不顯示 content row。

---

### 4.3 Paths 區塊

**Section 標題：**
```css
font-size: 10px;
font-weight: 600;
color: #94a3b8;
text-transform: uppercase;
letter-spacing: 1px;
```

**Path pill badges：**
```css
display: inline-flex;
align-items: center;
gap: 6px;
padding: 2px 10px;
border-radius: 10px;
background: {flowPath.color};    /* FlowPath.color 欄位 */
color: #ffffff;
font-size: 10px;
font-weight: 500;
```

**前置圓點：**
```css
width: 7px;
height: 7px;
border-radius: 50%;
background: rgba(255,255,255,0.5);
flex-shrink: 0;
```

**badges 容器：**
```css
display: flex;
flex-wrap: wrap;
gap: 6px;
margin-top: 6px;
```

**空值狀態：**
若 `bundle.paths` 為空陣列或 undefined，整個 Paths 區塊**不顯示**（不留空殼）。

---

### 4.4 Meta 區塊

**容器：**
```css
padding: 10px 12px;
background: rgba(255,255,255,0.03);
border-radius: 8px;
font-size: 12px;
line-height: 1.7;
```

**每行結構：** `flex row, gap: 8px`

| 子元素 | 規格 |
|--------|------|
| label | `"Trigger"` / `"UI"` / `"Phase"` — color: `#94a3b8`, min-width: 56px, flex-shrink: 0, font-size: 11px |
| value | color: `#f1f5f9`, font-size: 12px |

**可 inline 編輯：** `trigger`、`uiDescription`、`phase`

**Inline 編輯互動：**
- 預設：純文字顯示
- 點擊 value 區域 → 變為 `<input>` 或 `<textarea>`（多行）
- Blur 或 Enter → 儲存到 store（`updateBundle`）
- Escape → 取消，還原原始值
- 編輯中：border-bottom: 1px solid #1E88E5，background: rgba(30,136,229,0.05)

**空值顯示：**
若欄位為空，顯示灰色 placeholder `"—"` with `opacity: 0.4`，點擊後進入編輯模式。

**哪些行顯示：**
- `trigger`：永遠顯示（可編輯，空時 placeholder）
- `uiDescription`：永遠顯示
- `phase`：永遠顯示
- 若三個欄位都為空且不在編輯模式，仍顯示 Meta 區塊（含所有行 + placeholder）

---

### 4.5 Policies 區塊

**Section 標題 + Add 按鈕（Phase 2）：**
```
POLICIES ───────────────────── [+ Add]
```
注意：`[+ Add]` 為 Phase 2，MVP 不實作。

**Policy 列規格：**

```css
/* block */
.policy-block {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(224,108,117,0.12);
  border: 1px solid rgba(224,108,117,0.2);
  color: #E06C75;
  font-size: 12px;
  line-height: 1.4;
}

/* warn */
.policy-warn {
  background: rgba(255,179,71,0.10);
  border: 1px solid rgba(255,179,71,0.2);
  color: #FFB347;
}
```

**Policy 列子元素：**

| 元素 | 規格 |
|------|------|
| severity icon | `🛡`（block）/ `⚠`（warn）— font-size: 12px, flex-shrink: 0 |
| rule text | flex: 1, line-height: 1.4 |
| severity badge | `"BLOCK"` / `"WARN"` — font-size: 8px, font-weight: 600, padding: 1px 5px, border-radius: 3px, background: rgba(same color, 0.2), color: inherit, text-transform: uppercase, margin-left: auto, flex-shrink: 0 |

**空值狀態：**
若 `bundle.policies` 為空陣列或 undefined，整個 Policies 區塊**不顯示**。

**列間距：** `gap: 6px`

---

### 4.6 Read Models 區塊

**ReadModel badge 規格：**
```css
display: inline-flex;
padding: 4px 10px;
border-radius: 4px;
background: rgba(152,195,121,0.12);
border: 1px solid rgba(152,195,121,0.2);
color: #98C379;
font-size: 11px;
font-family: 'Roboto Mono', ui-monospace, monospace;
margin-right: 4px;
margin-bottom: 4px;
```

**badges 容器：** `display: flex; flex-wrap: wrap;`

**空值狀態：**
若 `bundle.readModels` 為空陣列或 undefined，整個 Read Models 區塊**不顯示**。

---

### 4.7 Notes 區塊

**容器：**
```css
padding: 10px 12px;
background: rgba(171,178,191,0.06);
border-left: 3px solid #ABB2BF;
border-radius: 0 4px 4px 0;
font-size: 12px;
line-height: 1.5;
color: #f1f5f9;
```

**可 inline 編輯：** 點擊文字區域進入 `<textarea>` 編輯模式（同 Meta 欄位規則）

**空值狀態：**
若 `bundle.notes` 為空，顯示 placeholder `"新增備注..."` with `color: #94a3b8`，點擊後進入編輯模式。
整個 Notes 區塊**永遠顯示**（作為補充說明的常駐入口）。

---

## 五、StickyNote 選取狀態的面板佈局

StickyNote 是單一語意元件，不具備 Bundle 的多欄位結構。面板設計更輕量。

### 線框圖

```
┌─────────────────────────────────────────┐
│ HEADER                                  │
│                                         │
│  [type badge — 有色背景]    [× 關閉]    │
│  note.label（主標題）                   │
│  note · #a1b2c3                         │
│                                         │
├─────────────────────────────────────────┤
│ BODY                                    │
│                                         │
│  META ───────────────────────────────   │
│  Phase     [phase — editable]           │
│                                         │
│  PATHS ──────────────────────────────   │
│  [● path badge] [● path badge]          │
│                                         │
│  NOTES ──────────────────────────────   │
│  │ [notes text — editable]             │
│                                         │
└─────────────────────────────────────────┘
```

### 與 Bundle 面板的差異點

| 區塊 | Bundle | StickyNote |
|------|--------|-----------|
| 色塊群組 | 顯示（4 色塊） | 不顯示 |
| Meta | Trigger + UI + Phase | Phase 僅 |
| Policies | 顯示（若有） | 不顯示（StickyNote 無 policies 欄位） |
| Read Models | 顯示（若有） | 不顯示（StickyNote 無此欄位） |
| Paths | 顯示（若有） | 顯示（若有） |
| Notes | 顯示 | 顯示 |

### Header Type Badge

```css
display: inline-flex;
align-items: center;
padding: 2px 8px;
border-radius: 4px;
font-size: 9px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.6px;
margin-bottom: 8px;
```

Type badge 背景色對應現有 ELEMENT_CONFIGS 的 `color` 欄位，文字色為 `config.textColor`。

---

## 六、完整互動定義

### 6.1 面板觸發

| 動作 | 結果 |
|------|------|
| 單擊 Bundle | 面板滑入，顯示 Bundle 內容 |
| 單擊 StickyNote | 面板滑入，顯示 StickyNote 內容 |
| 單擊畫布空白處 | 面板滑出 |
| 按 Escape | 面板滑出 |
| 點擊面板 × 按鈕 | 面板滑出 |
| 切換 Board Tab | 面板滑出（`selectedDetailId` 清空） |
| 切換到 Linking Mode | 面板保持現狀（不關閉） |

### 6.2 選取時的視覺回饋

當 Bundle 或 StickyNote 被選為 detail 對象時，在既有的 selection ring（`box-shadow: 0 0 0 3px #3b82f6`）基礎上保持不變。不需要額外的高亮樣式，避免與 multi-select 的選取狀態混淆。

設計注意：`selectedDetailId` 與 `selectedNoteIds`（multi-select）是獨立的 store 欄位，彼此不互斥。

### 6.3 Inline 編輯規格（適用 trigger / uiDescription / phase / notes）

**觸發：** 點擊文字值區域
**編輯元件：**
- 單行欄位（trigger, phase）：`<input type="text">`
- 多行欄位（uiDescription, notes）：`<textarea>`

**樣式（editing active state）：**
```css
background: rgba(30,136,229,0.05);
border: none;
border-bottom: 1px solid #1E88E5;
border-radius: 0;
color: #f1f5f9;
font-size: 12px;
font-family: inherit;
outline: none;
width: 100%;
resize: none;           /* textarea only */
padding: 2px 0;
```

**儲存：** `onBlur` 或 `Enter`（單行）→ `updateBundle(id, { [field]: value })` 或 `updateNote(id, { [field]: value })`

**取消：** `Escape` → 還原原始值，退出編輯模式

---

## 七、Tailwind Class 建議

### 面板容器

```tsx
<aside
  className={`
    fixed right-0 top-0 bottom-0 z-50
    w-[360px]
    bg-slate-800 border-l border-slate-700
    shadow-[-4px_0_24px_rgba(0,0,0,0.15)]
    flex flex-col overflow-hidden
    transition-transform duration-300 ease-[cubic-bezier(0,0,0.2,1)]
    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
/>
```

### Section 標題

```tsx
<div className="text-[10px] font-semibold text-slate-400 uppercase tracking-[1px]">
  POLICIES
</div>
```

### Section 間隔容器

```tsx
<div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
```

### Header

```tsx
<div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-slate-700 relative">
  <button className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] rounded text-lg" />
  <h2 className="text-[17px] font-bold text-slate-100 break-words pr-8">
    {title}
  </h2>
  <p className="text-[11px] text-slate-400 font-mono mt-1">
    bundle · #{id.slice(0, 8)}
  </p>
</div>
```

### Aggregate 色塊

```tsx
<div
  className="col-span-2 rounded-lg p-3"
  style={{ background: '#FFD600', color: '#333333' }}
>
  <div className="text-[9px] font-medium uppercase tracking-[0.6px] opacity-50 mb-1">
    aggregate · ENTITY / AR
  </div>
  <div className="text-[14px] font-semibold">{infoNote.label || '—'}</div>
  {infoNote.content && (
    <div className="text-[11px] leading-relaxed mt-1 opacity-75">
      {infoNote.content}
    </div>
  )}
</div>
```

### Policy row（block）

```tsx
<div className="flex items-start gap-2 px-[10px] py-2 rounded text-[12px] leading-snug"
  style={{
    background: 'rgba(224,108,117,0.12)',
    border: '1px solid rgba(224,108,117,0.2)',
    color: '#E06C75',
  }}
>
  <span className="flex-shrink-0 text-[12px]">🛡</span>
  <span className="flex-1">{policy.rule}</span>
  <span className="flex-shrink-0 text-[8px] font-bold uppercase px-[5px] py-[1px] rounded ml-auto"
    style={{ background: 'rgba(224,108,117,0.2)' }}
  >BLOCK</span>
</div>
```

### ReadModel badge

```tsx
<span className="inline-flex px-[10px] py-1 rounded text-[11px] font-mono mr-1 mb-1"
  style={{
    background: 'rgba(152,195,121,0.12)',
    border: '1px solid rgba(152,195,121,0.2)',
    color: '#98C379',
  }}
>
  {readModel}
</span>
```

### Notes 容器

```tsx
<div className="px-3 py-[10px] text-[12px] leading-relaxed text-slate-100 rounded-r"
  style={{
    background: 'rgba(171,178,191,0.06)',
    borderLeft: '3px solid #ABB2BF',
  }}
>
```

### Canvas wrapper（面板開關時收縮）

```tsx
<div
  className="transition-[margin-right] duration-300 ease-[cubic-bezier(0,0,0.2,1)]"
  style={{ marginRight: isPanelOpen ? '360px' : '0' }}
>
```

---

## 八、所有元件狀態定義

### DetailPanel（面板本體）

| 狀態 | 描述 |
|------|------|
| Default（關閉） | `translateX(100%)`，對使用者不可見 |
| Open（開啟） | `translateX(0)`，滑入動畫 300ms |
| Opening（動畫中） | 過渡狀態，300ms |
| Closing（動畫中） | 過渡狀態，300ms |

### 色塊（Sticky Block）

| 狀態 | 描述 |
|------|------|
| Default | 色塊背景 + 文字 |
| Label empty | title 顯示 `"—"` with `opacity: 0.4` |
| Content empty | content row 不顯示 |

### Inline Editable Field

| 狀態 | 描述 |
|------|------|
| Default（唯讀） | 純文字顯示 |
| Empty | `"—"` placeholder with `opacity: 0.4`，cursor: text |
| Hover | cursor: text，subtle underline hint（可選，border-bottom: 1px dashed #334155） |
| Editing | input/textarea，border-bottom: 1px solid #1E88E5 |
| Saving | Blur 後立即同步到 store，無 loading 狀態 |

### Policy 列

| 狀態 | 描述 |
|------|------|
| block severity | 紅色背景/邊框，🛡 icon，BLOCK badge |
| warn severity | 橘色背景/邊框，⚠ icon，WARN badge |

---

## 九、QA 驗收條件

### 面板開關行為

```
Given 使用者在畫布上有 Bundle
When  使用者單擊該 Bundle
Then  Detail Panel 從右側滑入
      動畫時長應為 280–320ms（容忍 ±20ms）
      面板寬度應為 360px（容忍 ±1px）
      Canvas 右邊距應增加 360px
```

```
Given Detail Panel 已開啟
When  使用者按 Escape 鍵
Then  Detail Panel 滑出
      Canvas 右邊距應恢復為 0
```

```
Given Detail Panel 已開啟
When  使用者單擊畫布空白處
Then  Detail Panel 滑出
```

```
Given Detail Panel 已開啟（顯示 Bundle A）
When  使用者單擊 Bundle B
Then  面板內容替換為 Bundle B 的資料（無關閉動畫，直接替換）
```

### Bundle 面板內容

```
Given 一個 Bundle，infoNote.label = "QuotingCase"，infoNote.content = ""
When  面板開啟
Then  Aggregate 色塊應顯示 label "QuotingCase"
      content row 不顯示
```

```
Given 一個 Bundle，policies = [{ rule: "帳務類型開案後不可變更", severity: "block" }]
When  面板開啟
Then  Policies 區塊可見
      policy 列顯示 🛡 icon
      policy 列背景為 rgba(224,108,117,0.12)
      右側顯示 "BLOCK" badge
```

```
Given 一個 Bundle，policies = [] 或 undefined
When  面板開啟
Then  Policies 區塊不顯示
```

```
Given 一個 Bundle，paths = [] 或 undefined
When  面板開啟
Then  Paths 區塊不顯示
```

```
Given 一個 Bundle，readModels = ["KanbanBoard", "QuotationPDF"]
When  面板開啟
Then  Read Models 區塊可見
      "KanbanBoard" 和 "QuotationPDF" 各顯示一個綠色 badge
      badge color 為 #98C379（容忍 ±視覺目視）
```

### Inline 編輯

```
Given 面板開啟，trigger 欄位目前值為 "Wizard 完成"
When  使用者點擊 trigger 的文字區域
Then  文字變為可編輯 <input>
      input 顯示 border-bottom: 1px solid #1E88E5
```

```
Given 使用者正在編輯 trigger，輸入 "新觸發條件"
When  使用者按 Escape
Then  trigger 恢復為 "Wizard 完成"
      編輯模式退出
```

```
Given 使用者正在編輯 trigger，輸入 "新觸發條件"
When  使用者點擊其他區域（blur）
Then  trigger 儲存為 "新觸發條件"
      調用 updateBundle(id, { trigger: "新觸發條件" })
```

### StickyNote 面板

```
Given 使用者點擊一個 type = "Policy" 的 StickyNote
When  面板開啟
Then  Header type badge 顯示 "POLICY"
      badge 背景色為 ELEMENT_CONFIGS['Policy'].color
      色塊群組不顯示
      Policies 區塊不顯示
      Read Models 區塊不顯示
      Phase、Paths、Notes 依資料顯示
```

---

## 十、需 FE 確認的技術問題

1. **uiStore 擴充**：`selectedDetailId` 和 `selectedDetailType` 需加入 `uiStore.ts`，請確認 persist 設定（這兩個欄位不需要持久化到 localStorage）。

2. **Bundle 單擊衝突**：目前 Bundle.tsx 的 `handleClick` 只在 `isLinkingMode` 時有邏輯。非 linking mode 的單擊要觸發 detail panel，需要在 Bundle component 中加入 `onDetailClick?: (id: string) => void` prop，由 BoardCanvas 傳入。

3. **Canvas marginRight**：BoardCanvas 的外層 div 需要接收 `detailPanelOpen: boolean` prop，或直接從 uiStore 讀取。建議直接讀 uiStore 避免 prop drilling。

4. **z-index 衝突檢查**：目前 Sidebar 的 z-index 為 100，Detail Panel 建議設 z-index: 50，確認不會被 Sidebar 覆蓋（Sidebar 在左，Panel 在右，不重疊，應無問題）。

---

## 十一、Phase 2 延後項目（MVP 不實作）

- Policy 的面板內新增 / 刪除（需要獨立的 Policy 管理 UI）
- ReadModel badge 點擊跳轉到關聯元件
- Paths 的面板內勾選（需要 FlowPath 全域資料來源）
- 面板寬度拖拉調整 handle
- 面板內容的鍵盤導覽（Tab 在可編輯欄位間跳轉）
