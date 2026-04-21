# UX-002 — Path 篩選列與卡片徽章設計規格

> 產出時間：2026-03-21
> 任務：UX-002 | 負責：ui-ux-designer

---

## 設計決策記錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Path bar 位置 | Board header 獨立行 | 工具和篩選職責分離；避免浮動層遮擋畫布 |
| "All" tab 樣式 | 灰色填充 | 與彩色 active path 形成對比，同時傳遞「選中」語意 |
| Dim 效果參數 | opacity 0.15 + scale 0.97 + saturate 0.3 | 參考 Toutou；scale 強化空間退場感；saturate 讓彩色筆記更突出 |
| 色點上限 | 3 個 + "+N" | 超過 3 個後小空間爆炸；數字指示讓使用者知道還有更多 |
| Path CRUD 入口 | 右鍵 tab = 編輯/刪除；"+" = 新增 | Progressive disclosure 原則 |
| 刪除需要確認 | 是（inline modal） | 刪除 path 會批次修改所有卡片，破壞性操作需確認 |
| Path bar 只在 board view | 是 | Home view 沒有 canvas 內容可篩選 |
| Link dim 邏輯 | 跟隨源頭卡片 | 簡化實作，避免需要計算 link 的兩端歸屬 |

---

## 一、整體位置佈局

```
┌──────────────────────────────────────────────────────┐
│ Sidebar (240px)   │  Board Header Area               │
│                   │  ┌────────────────────────────┐  │
│                   │  │ [Tab: Context A] [Tab: B]  │  │ ← TabBar（現有）
│                   │  └────────────────────────────┘  │
│                   │  ┌────────────────────────────┐  │
│                   │  │ PATH  [All 14] [●Path1 6]  │  │ ← PathBar（新增）
│                   │  │       [●Path2 4]      [+]  │  │
│                   │  └────────────────────────────┘  │
│                   │  ┌────────────────────────────┐  │
│                   │  │        Canvas               │  │
│                   │  └────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 二、PathBar 容器規格

```
height: 44px
background: '#ffffff'
borderBottom: '1px solid rgba(0,0,0,0.08)'
display: flex, alignItems: center, gap: 6
padding: '0 16px'
overflowX: auto
flexShrink: 0
zIndex: 10
```

**"PATH" 標籤（最左側）：**
```
font-size: 10px, fontWeight: 700
color: '#94a3b8'
textTransform: uppercase, letterSpacing: '0.08em'
marginRight: 8
flex-shrink: 0
```

---

## 三、Path Tab 三種狀態

### All Tab（選中）
```
height: 28px, padding: '0 12px', borderRadius: 14
fontSize: 11, fontWeight: 500
background: 'rgba(0,0,0,0.08)', color: '#1e293b'
border: '1px solid transparent'
cursor: pointer, transition: 'all 150ms ease'
```

### Path Tab（Active）
```
background: {path.color}
color: '#ffffff', fontWeight: 600
border: '1px solid transparent'
```

色點在 active 狀態：
```
background: 'rgba(255,255,255,0.5)'
border: '1px solid rgba(255,255,255,0.3)'
```

### Path Tab（Inactive）
```
background: transparent, color: '#64748b'
border: '1px solid rgba(0,0,0,0.08)'
```

Hover（inactive 時）：
```
background: rgba({path.color}, 0.12)
border: rgba({path.color}, 0.4)
color: '#1e293b'
```

### "+" 新增按鈕
```
height: 28px, padding: '0 10px', borderRadius: 14
border: '1px dashed rgba(0,0,0,0.15)'
background: transparent, color: '#94a3b8'
hover: borderColor '#3b82f6', color '#3b82f6', background 'rgba(59,130,246,0.06)'
```

---

## 四、卡片徽章（PathDots）

**容器（position absolute）：**
```
top: 5px, right: 5px
display: flex, flexDirection: row, gap: 2
pointerEvents: none, zIndex: 5
```

**單個色點：**
```
width: 6px, height: 6px, borderRadius: '50%'
background: {path.color}
border: '1px solid rgba(0,0,0,0.15)'
```

**顯示上限：** 最多 3 個，超過顯示 "+N"
```
font-size: 8px, color: 'rgba(0,0,0,0.45)', fontWeight: 600
```

---

## 五、Dim 效果

非目標 path 的卡片：
```
opacity: 0.15
pointerEvents: 'none'
transform: {existing} + ' scale(0.97)'
filter: 'saturate(0.3)'
```

Transition（加到所有卡片基礎樣式）：
```
transition: 'opacity 200ms ease, transform 200ms ease, filter 200ms ease'
```

---

## 六、Path CRUD 互動

### 新增（Create）
點擊 "+" → Create Path Modal：
- 欄位：名稱（required）、顏色（8 preset）、說明（optional）
- Preset 色票：`#FF8C42, #C678DD, #56B6C2, #E06C75, #43A047, #1E88E5, #F59E0B, #EC4899`
- 名稱為空時建立按鈕 disabled

### 編輯/刪除（Update/Delete）
右鍵點擊 path tab → context menu：
- 「編輯名稱與顏色」→ Edit Path Modal（預填現有值）
- 「刪除此 Path」→ inline confirm dialog，刪除後若此 path 正在篩選中自動切回 All

---

## 七、Empty State

篩選某 path 後 0 個卡片屬於此 path：
```
Canvas 中央 overlay（pointer-events: none）
- 色點：{path.color}，24px
- 標題：font-size 14px, font-weight 600, color #475569
- 說明：font-size 12px, color #94a3b8, max-width 240px
```

---

## 八、Props 介面建議

### PathBar
```tsx
interface PathBarProps {
  paths: FlowPath[];
  activePath: string | null;
  onPathChange: (id: string | null) => void;
  onPathCreate: (path: Omit<FlowPath, 'id'>) => void;
  onPathUpdate: (id: string, updates: Partial<FlowPath>) => void;
  onPathDelete: (id: string) => void;
  pathCounts: Record<string, number>;
  totalCount: number;
}
```

### PathDots
```tsx
interface PathDotsProps {
  pathIds: string[];
  paths: FlowPath[];
  maxVisible?: number; // 預設 3
}
```

---

## 九、State Matrix

### PathBar

| State | 視覺表現 |
|-------|---------|
| Empty（no paths） | 只顯示 All tab + "+" 按鈕 |
| 1+ paths, All selected | All 灰填充，其餘 transparent |
| 1+ paths, path selected | All transparent，target 彩色 fill，其餘 transparent |
| Hover on inactive tab | 12% path color 背景 |
| Right-click on tab | Context menu 出現 |

### Card Dim

| State | opacity | pointer-events | transform | filter |
|-------|---------|----------------|-----------|--------|
| All selected | 1 | auto | scale(1) | none |
| Filtered, card matches | 1 | auto | scale(1) | none |
| Filtered, card not match | 0.15 | none | scale(0.97) | saturate(0.3) |

---

## 十、驗收標準（QA 對照）

- PathBar 高度 = 44px ± 0px
- All tab 計數 = 所有卡片總數
- 點擊 path tab → 非該 path 卡片 opacity = 0.15，動畫完成時間 ≤ 200ms
- StickyNote 屬於 5 個 path → 顯示 3 個色點 + "+2"
- 名稱為空時建立按鈕 disabled
- 刪除正在篩選的 path → 自動切回 All
- 篩選後 0 個卡片 → canvas 中央顯示 empty state overlay
