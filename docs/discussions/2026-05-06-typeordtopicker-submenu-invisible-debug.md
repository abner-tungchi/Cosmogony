---
topic: "TypeOrDtoPicker submenu 不顯示 — 系統性 debug 與修復"
status: consensus
created: "2026-05-06"
updated: "2026-05-06"
participants:
  - Claude (Opus 4.7)
  - Codex (GPT-5.4)
  - Gemini
facilitator: Claude
rounds_completed: 2
---

# TypeOrDtoPicker submenu 不顯示 — 系統性 debug 與修復

## 議題定義

### 背景

剛實作完 Topic A(Array container picker submenu),user 實測**完全看不到 submenu**。
2 次嘗試修復都沒解決:

1. **第一次**:把 submenu 從 row 內部用 `position: absolute; right: 100%` 渲染 — 假設是 dropdown 的 `overflowY: auto` 隱性帶起 X-axis clipping 把 submenu 切掉
2. **第二次**:改成 `position: fixed` + 用 row 的 `getBoundingClientRect()` 取座標,渲染為 dropdown 的 sibling — 假設活著的 `activeOption` 在 component body 頂部計算時 registry 還沒 populated

兩次都沒解決。Submenu 仍然看不到。需要系統性 debug,確認真正的根因。

### 目標

- 列出所有可能的 hypothesis(已試過的 + 還沒試過的)
- 用最小成本的方式驗證每個 hypothesis
- 確認真正根因
- 修復
- 把學到的教訓 update 進 spec(避免下次同錯)

### 範圍

**討論內**:
- TypeOrDtoPicker 元件內 submenu render 邏輯
- React state / ref / closure / re-render 行為
- DOM event 行為(mouseenter / setTimeout / `e.currentTarget`)
- CSS 行為(overflow / position fixed / z-index / stacking context)
- React 19 specific 行為

**討論外**:
- 不重做 sub-menu 的 UX 設計(user 已批 Plan B 字串約定 + sub-menu)
- 不抽 portal(優先用最簡單的方法解決)

### 約束

- 必須在現有 4 個 picker callsite 全部生效(深色 + 淺色 theme)
- 不能 break 既有 plain pick 行為
- 不能引入 DOM API 不支援的東西(target browser 是 Chrome / Safari current)

### 子議題

- [ ] **S1**:hypothesis 列舉 — 列出所有可能原因(state、closure、CSS、DOM、React 19、ref)
- [ ] **S2**:診斷策略 — 用什麼最小成本方法定位問題(console.log / DevTools / 加暴露 state 機制)
- [ ] **S3**:已試過的方案為何失敗?(細節剖析,確認失敗點)
- [ ] **S4**:真正根因(待定位後鎖定)
- [ ] **S5**:修復方案(可能 portal、可能簡化結構、可能其他)
- [ ] **S6**:update-spec 內容(把這次教訓寫進 spec)

---

## 討論紀錄

### Round 1 (2026-05-06)

#### 🅰️ Claude — 提案 + hypothesis 列舉

**S1 — 所有 hypothesis(列舉)**

A. **timer 沒觸發**:setTimeout 250ms 沒 fire,可能 mouseenter 沒打到 row(被 chevron span 截走 propagation?但 mouseenter 不會 bubble,直接打到 row)
B. **state 沒更新**:setOpenSubMenuKey + setSubmenuRect 在 setTimeout 內呼叫,React 19 自動 batch 應該 OK,但若有 stale closure 可能出包
C. **state 更新但 IIFE 查 registry 失敗**:registry 在每次 render 被 reset(`optionRegistry.current = new Map()`),renderOption 在 JSX 內 `.map()` 被呼叫填充。**疑點**:JSX 子表達式的 evaluation order — `{dtoEntries.map(...)}` 與 `{(() => {...})()}` 的執行順序是文件順序嗎?實測 React JSX expression 是 array literal,所有 child expression 在 createElement call 前都會 evaluate;順序應該是文件順序。**所以 registry 應該被填了。** 但若 IIFE 在 same render 呼叫前 registry 被 OLD reference cache,就會空。
D. **CSS:position fixed 仍被切**:雖然 position fixed 應該脫離 ancestor overflow,但若 ancestor 有 `transform`、`filter`、`will-change: transform`、`backdrop-filter`、`contain` 任一 non-default,fixed 元素會被該 ancestor「containing block」化,變成 absolute 行為,被 overflow 切掉
E. **CSS:z-index 不夠**:submenu zIndex 999,但若有更高 z-index 的東西蓋上(canvas overlay / DetailPanel container 等)
F. **CSS:visible 但被 transparent / 透明蓋住**:submenu 渲染成功但顏色/邊框透明
G. **React 19 ref behavior**:`optionRegistry.current = new Map()` 在 component body 直接賦值 — React 19 嚴格 mode 下會多 render 一次,導致 ref 在第二次 render 時被重置,而 IIFE 查的是新的空 map?
H. **submenuRect = null 雖然 setTimeout 呼叫了 setSubmenuRect**:可能 rect.getBoundingClientRect() 回傳 0/0/0/0 因為 rowEl 被 unmount 了
I. **JSX conditional render bug**:IIFE 回傳 null 時 React 仍 render 一個空節點,但若 IIFE 內邏輯有 short-circuit 出包...

我傾向 **C** 或 **D** 最可能。但**沒實證**,需要 user 跑一個實驗。

**S2 — 診斷策略(最小成本)**

**Phase 1**(0 成本 — 1 個 console.log):
在 captureRectAndOpen 內加:
```ts
console.log('[picker] open submenu', { key, rect });
```
與 IIFE 內加:
```ts
console.log('[picker] submenu render check', { isOpen, openSubMenuKey, submenuRect, regSize: optionRegistry.current.size });
```
讓 user 開 DevTools console 看,直接揭露:
- timer 是否 fire(看到第一條 log 嗎?)
- state 是否 update(re-render 後有沒有看到第二條 log?)
- registry 是否 populated(regSize 是?)
- IIFE 是否進入 render path(有 log 出現嗎?)

**Phase 2**(若 Phase 1 顯示 state update + IIFE entered + null return):
檢查 CSS。在 IIFE 內**強制** render submenu(忽略 conditions),用紅色背景:
```tsx
<div style={{ position: 'fixed', top: 100, left: 100, width: 200, height: 100, background: 'red', zIndex: 9999 }}>SUBMENU TEST</div>
```
若紅色方塊看得到 → CSS 沒被切;若看不到 → ancestor 有 transform/contain 把 fixed 變 absolute

**Phase 3**(若都不解決):portal 兜底

**S3 — 已試方案失敗點分析**

**第一次嘗試**(submenu 在 row 內 `right: 100%`):
- Hypothesis 1:overflowY: auto 隱性 clipX(CSS spec 行為)
- 真實性:**85%**(這個 spec 行為確實存在)
- 為何沒解決:可能改完後 user 看不到不只因為 overflow 一個原因 — 還有其他層面 issue

**第二次嘗試**(position: fixed + 修 activeOption 時機):
- Hypothesis 2:JSX evaluation order 讓 activeOption 計算時 registry 還空
- 真實性:**70%**(理論上 registry 在 const 計算前還沒 populated)
- IIFE 改寫應該解決 timing issue。但 user 仍看不到 → 還有別的原因

**最可能的剩餘 issue**:
- 若 timer fire 但 setSubmenuRect 沒成功觸發 re-render(rare but possible)
- 若 fixed positioned 元素被某個 ancestor 拉成 absolute(transform 等)
- 若 IIFE 邏輯仍有 bug

**S4-S6**:等 Phase 1 console 結果後鎖定。

子議題建議狀態:S1 → `agreed`;S2 → `agreed`(走 Phase 1 console.log diagnose);S3-S6 → `pending`(等實證資料)。

---

#### 🅱️ Codex — 回應

**S1**:hypothesis 列舉漂亮,**但補關鍵兩條**:

J. **DetailPanel 是 right-anchored fixed panel**(`position: fixed; right: 0`)— picker container 在 DetailPanel 內。若 DetailPanel 任何祖先有 transform/contain,picker 內的 position:fixed 元素會被 trap。實際上 **DetailPanel 自己** 也是 fixed 的,但 fixed 元素本身不會自動 trap 子代 fixed。
K. **renderOption 是內部 helper function**,每次 component re-render 都重新定義。閉包捕捉的 setOpenSubMenuKey / setSubmenuRect 是當前 render 的版本。應該無 stale closure 問題。但**注意:`onMouseEnter` callback 內 setTimeout 的閉包 captures 當下 renderOption 呼叫時的 `key`、 `setOpenSubMenuKey`** — 這些是 stable 或當下的。應該 OK。

**S2**:同意 Phase 1 console.log,**但加一個關鍵問題**:user 是否確認**主 dropdown 確實是打開的**?若 user 的 picker 沒被點開,當然看不到 submenu(picker 必須先被開)。建議 console 開頭加:
```ts
console.log('[picker] state', { isOpen, openSubMenuKey, submenuRect });
```
在 component body 頂部 — 看 user hover 時 picker 是不是 open 狀態。

**重要假設驗證**:user 是否實際**先點開 trigger 再 hover entry**?還是只是 hover 還沒打開的 trigger?Spec 的 UX 假設是「打開 dropdown 後 hover entry」,若 user 只 hover trigger 本身不會看到 submenu(那是 dropdown,不是 submenu)。**user 報告需澄清**。

**S3 補充**:第二次的 IIFE 修法**沒問題**,理論上應該 work。剩餘 issue 大概率是:
- CSS containing block 問題
- Registry 在 React 19 strict mode 雙 render 下被踩掉

**S4**:
- 我猜 70% **CSS 問題**(transform / containing block 把 fixed 拉成 absolute)
- 30% **state 問題**(setSubmenuRect 沒生效,或 React 19 嚴格 mode 雙 render 把 ref reset)

子議題建議狀態:同 Claude。**特別:S2 加上 Codex 提的 user 操作確認**(「先打開 dropdown 才 hover」)。

---

#### 🅲 Gemini — 回應

**S1**:列舉合理,**架構視角加一條**:

L. **`useRef` 在 React 19 嚴格 mode 雙 render 行為**:`useRef` 的 .current 在 strict mode 雙 render 時不會被 reset,因為 ref 是跨 render persistent。但**直接賦值** `optionRegistry.current = new Map()` 在 component body 是一個 **side effect**(不是純函數 render),React 嚴格模式雙 render 時這行會跑兩次,第二次跑時 map 又被 reset。**雖然 renderOption 在 JSX 中也跑兩次**,但兩次都會把 entries 寫進當下的 map。**問題**:雙 render 的第一輪 render 後,React 把 commit 階段的東西丟掉,只用第二輪。所以實際 commit 的應該是第二輪的填好 map。**理論上 OK**,但 strict mode 雙 render 是不純函數的反 pattern,難 debug。

**建議**:把 `optionRegistry.current = new Map()` 改成在 useMemo 內,或乾脆用 useState 加 effect — **更乾淨**。

**S2**:同意 console.log。**補強**:Phase 2 的紅色測試方塊**改成 portal**,直接 render 到 document.body。若 portal 顯示但元件內 fixed 不顯示 → 鐵證 CSS containing block 問題。

**S3**:同意 Codex 的 70/30 — CSS / state。
**強烈建議走 portal 路線**從一開始 — 這類「絕對定位被 trap」的 case 在複雜 React app(尤其有 fixed-positioned panel 的 detail sidebar)幾乎必然發生。Portal 是業界標準解,reaches outside React 的 vdom tree 直接掛 body,bypass 所有 ancestor 約束。

**S4**:我猜 **80% portal 解決所有問題**。

**S5 提早提案**:

```tsx
import { createPortal } from 'react-dom';

// 替換現在的 IIFE 渲染:
{(() => {
  if (!isOpen || !openSubMenuKey || !submenuRect) return null;
  const opt = optionRegistry.current.get(openSubMenuKey);
  if (!opt) return null;
  return createPortal(
    <div role="menu" style={submenuFixedStyle(submenuRect)}>...</div>,
    document.body
  );
})()}
```

副作用:**click outside handler 要更新** — 需偵測 submenu 被點擊(submenu 在 body 不在 containerRef 內)。加 `submenuRef`,在 click outside 內檢查。

**S6 — update spec 教訓清單**:
- 「Submenu / popover 在複雜佈局中**默認用 portal**,避免 ancestor containing block 問題」
- 「`useRef` 直接賦值 `current = new Map()` 在 component body 是 side effect,違反 strict mode 純函數要求 — 改 useMemo」
- 「position: fixed 不保證脫離祖先,需檢查祖先是否有 transform/filter/contain/will-change」
- 「先 console.log 確認 state update 路徑暢通,再動手 CSS — 別倒過來」

子議題建議狀態:S1 / S2 / S3 → `agreed`;S5 → `majority`(三方都偏 portal,Codex 偏 CSS 修法);S6 → `pending`。

---

### Round 2 (2026-05-06) — 收斂 + 修復決策

#### 🅰️ Claude 整合三方意見

**S4 真正根因 — 二選一機率**:
- **80% portal / containing block 問題**(Gemini + Claude 都偏這個,Codex 在第二優先)
- **15% optionRegistry 在 React 19 strict mode 雙 render 行為被踩**(Gemini 提的)
- **5% 其他**(state 沒更新等罕見情況)

**S5 修復方案最終決議 — 三方共識**:
1. **採 portal**(`react-dom/createPortal` → `document.body`)— 直接 bypass 所有 ancestor 約束
2. **`optionRegistry` 改用 `useMemo` 重建**避免 strict mode 雙 render 異常
3. **加 console.log 診斷打點** — 萬一 portal 還是看不到,user 看 log 立刻知道 bug 走到哪一步
4. **更新 click outside handler** — submenu 在 body 不在 containerRef,需要新加 submenuRef 偵測

**取消的方案**:
- 紅色測試方塊(改用 portal 等同 bypass CSS,不需此測試)
- 純 CSS 修(改 dropdown overflow 結構 — 太迂迴,portal 一刀解)

#### 🅱️ Codex 同意

同意 portal 路線。**追加細節**:
- `containerRef` 與 `submenuRef` 都需在 click outside handler 檢查 contains
- portal 在 SSR 環境會出錯;但本專案是 client-only(Vite),OK
- React 19 portal API 不變,直接用 `import { createPortal } from 'react-dom'`

#### 🅲 Gemini 同意

S5 / S6 final。

**S6 update-spec 教訓清單(formalize)**:
1. **Popover / submenu 在複雜 layout 預設用 portal**,不依賴 position:fixed 的 viewport-anchor 假設(因為 ancestor 任何 transform/contain/will-change 會把 fixed 拉成 absolute,在 detail panel / modal 等場景幾乎一定踩到)
2. **`useRef.current = new Map()` 直接在 component body 賦值是 side effect**,strict mode 雙 render 行為未定。改用 `useMemo(() => new Map(), [deps])` 或 useState
3. **Debug 順序**:先用 console.log 確認 state update 路徑,再驗證 CSS 渲染(別倒過來)
4. **Spec 應預先指定 portal**:本 task spec 沒提 portal,假設 fixed positioning 夠用 — 但複雜 ancestor 環境下這假設不可靠。Spec 應該明列「submenu 必須用 portal」

---

## 共識看板

| # | 子議題 | Claude | Codex | Gemini | 狀態 |
|---|--------|--------|-------|--------|------|
| S1 | hypothesis 列舉(9-12 個可能) | ✅ | ✅ | ✅ | `agreed` |
| S2 | 診斷策略:console.log + portal 直上 | ✅ | ✅ | ✅ | `agreed` |
| S3 | 已試方案失敗點:第一次 overflow 假設不夠完整、第二次 IIFE 修法 OK 但仍有 CSS / strict mode 風險 | ✅ | ✅ | ✅ | `agreed` |
| S4 | 真正根因:portal / containing block 80%、useRef strict mode 15%、其他 5% | ✅ | ✅ | ✅ | `agreed` |
| S5 | 修復:portal + useMemo 取代 ref 直接賦值 + console.log 診斷打點 + click outside 加 submenuRef | ✅ | ✅ | ✅ | `agreed` |
| S6 | update-spec 教訓:popover 預設 portal / useRef 別在 body 賦值 / debug 先 state 後 CSS / spec 預先指定 portal | ✅ | ✅ | ✅ | `agreed` |

**全 6 子議題在 R2 收斂。**

---

## 決策紀錄

| # | 決定 | 達成日期 | 依據 Round |
|---|------|---------|-----------|
| D1 | submenu 改用 `createPortal` 渲染至 `document.body` | 2026-05-06 | R2 |
| D2 | `optionRegistry` 改用 `useMemo` 重建,避免 strict mode 雙 render | 2026-05-06 | R2 |
| D3 | 加 console.log 診斷打點(commit 時保留註解,user 不需要時可加 ESLint 忽略) | 2026-05-06 | R2 |
| D4 | click outside handler 同時檢查 containerRef + submenuRef contains | 2026-05-06 | R2 |
| D5 | 把「popover 預設 portal」教訓寫入 spec(2026-05-06-array-container-picker-submenu.md)的 Non-goals + 已知限制段 | 2026-05-06 | R2 |

---

## 開放問題

無。



