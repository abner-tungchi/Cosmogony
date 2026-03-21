# FE-008 — Event 計數統計顯示 任務摘要

> 完成時間：2026-03-21

## 實作概述

在 TabBar 右側加入統計 chip，顯示當前 board 的 DomainEvent notes 數量與 bundles 數量，切換 path 篩選時即時更新。

## 變更檔案

| 檔案 | 說明 |
|------|------|
| `src/components/TabBar/TabBar.tsx` | 加入統計計算邏輯與統計 chip UI |

## 技術決策

### 放置位置：TabBar 右側

TabBar 已是固定高度 40px 的 flex container，在右側加 `marginLeft: auto` 的統計 chip 是最不干擾現有 tab 操作的方案。另考慮放在 Board header 獨立條，但 TabBar 右側更簡潔且不增加新元件。

### events 計算定義

根據 task spec，"events" 指 `StickyNote` 中 `type === 'DomainEvent'` 的項目，不計算 bundles 內部的 eventNote（因為 bundles 已單獨計數）。

### Reactive 更新

直接從 `useBoardStore(selectActiveBoard)` 和 `useUIStore` 訂閱，Zustand selector 保證 activePath 切換或元素新增/刪除時 chip 即時更新，無需額外 effect。

### 視覺設計

- 無 path 篩選：灰色小字（`#64748b`, fontSize 11），低調
- path 篩選啟用：藍色文字（`#93c5fd`）+ 藍色背景 chip，明確提示目前是篩選狀態
- 僅在 `currentView === 'board'` 時顯示，Home 頁不顯示

## 統計格式

```
{visibleEvents} / {totalEvents} events | {visibleBundles} / {totalBundles} bundles
```

- `total` = activeBoard 所有元素數量
- `visible` = activePath 篩選後可見數量（無篩選時 visible = total）

## 驗收項目確認

- [x] Board header 區域顯示統計資訊（TabBar 右側）
- [x] 格式符合規格：`{visible} / {total} events | {visible} / {total} bundles`
- [x] total = activeBoard 所有數量
- [x] visible = activePath 篩選後數量（無篩選 visible = total）
- [x] events = DomainEvent type 的 StickyNote
- [x] 切換 path 篩選即時更新（reactive）
- [x] 視覺小字不喧賓奪主（fontSize 11, 灰色）
- [x] PM-roadmap.md FE-008 標記為完成
