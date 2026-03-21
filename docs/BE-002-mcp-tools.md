# BE-002 — MCP 工具擴充（es_set_event_paths / es_set_event_phase）

> 完成時間：2026-03-21
> 負責 Agent：backend-engineer

---

## 完成項目

### 1. 新增 `es_set_event_paths` 工具

**位置：** `mcp-server/src/index.ts`（FlowPath tools 區段上方）

**輸入 schema（Zod）：**
```typescript
{
  ids:   z.array(z.string())  // Bundle 或 Note ID 列表（可混合）
  paths: z.array(z.string())  // FlowPath ID 列表（覆蓋，非 append）
}
```

**回傳：**
```json
{ "updated": ["id-1", "id-2"], "notFound": ["id-x"] }
```

**行為：**
- 對 `ids` 每個元素，依序在 `board.bundles[]` 查找，找不到再查 `board.notes[]`
- 命中即設定 `element.paths = paths`、更新 `element.updatedAt`
- 有更新時執行 `saveProject()` → `syncProjectToRelay()` → `broadcast('set_event_paths', { ids: updated, paths })`
- 若 `ids` 全部找不到，不呼叫 save/broadcast（避免無效寫入）

---

### 2. 新增 `es_set_event_phase` 工具

**輸入 schema（Zod）：**
```typescript
{
  ids:   z.array(z.string())  // Bundle 或 Note ID 列表（可混合）
  phase: z.string()           // Phase 標籤（覆蓋）
}
```

**回傳：**
```json
{ "updated": ["id-1", "id-2"], "notFound": ["id-x"] }
```

**行為：**
- 對 `ids` 每個元素，依序查 `board.bundles[]` 再查 `board.notes[]`
- 命中即設定 `element.phase = phase`、更新 `element.updatedAt`
- 有更新時執行 `saveProject()` → `syncProjectToRelay()` → `broadcast('set_event_phase', { ids: updated, phase })`

---

### 3. Code Review — es_update_bundle

驗證結果：**通過**

| 欄位 | Schema 定義 | 寫入邏輯 | broadcast payload |
|------|------------|---------|-------------------|
| `policies` | `z.array(z.object({ rule, severity })).optional()` | `if (policies !== undefined) bundle.policies = policies` | 含 |
| `paths` | `z.array(z.string()).optional()` | `if (paths !== undefined) bundle.paths = paths` | 含 |
| `phase` | `z.string().optional()` | `if (phase !== undefined) bundle.phase = phase` | 含 |
| `trigger` | `z.string().optional()` | `if (trigger !== undefined) bundle.trigger = trigger` | 含 |
| `readModels` | `z.array(z.string()).optional()` | `if (readModels !== undefined) bundle.readModels = readModels` | 含 |
| `notes` | `z.string().optional()` | `if (notes !== undefined) bundle.notes = notes` | 含 |

所有欄位均使用 `if (x !== undefined)` guard，不會誤覆蓋未傳入欄位。broadcast 傳送完整 payload（含 undefined 欄位）給前端做 partial merge。

---

### 4. Code Review — es_update_note

驗證結果：**通過**

| 欄位 | Schema 定義 | 寫入邏輯 | broadcast payload |
|------|------------|---------|-------------------|
| `paths` | `z.array(z.string()).optional()` | `if (paths !== undefined) note.paths = paths` | 含 |
| `phase` | `z.string().optional()` | `if (phase !== undefined) note.phase = phase` | 含 |
| `notes` | `z.string().optional()` | `if (notes !== undefined) note.notes = notes` | 含 |

同樣使用 `if (x !== undefined)` guard，行為一致。

---

## 構建驗證

```
cd mcp-server && npm run build
# 輸出：（無錯誤，無警告）
```

TypeScript 編譯零錯誤。

---

## 影響範圍

- **修改檔案：** `mcp-server/src/index.ts`（新增兩個 `server.tool(...)` 區塊）
- **重建檔案：** `mcp-server/dist/index.js`（tsc 重新編譯）
- **無前端異動**（MCP 工具為 AI-facing，前端透過 SSE action 名稱 `set_event_paths` / `set_event_phase` 接收更新，前端 `apiSync.ts` 的現有 sync 邏輯已可處理任意 SSE action 帶入的 project state 變化）

---

## 後續注意事項

- 前端若需針對 `set_event_paths` / `set_event_phase` SSE action 做精細更新（而非整個 project reload），需在 `src/utils/apiSync.ts` 加入對應 handler — 目前前端走全量 sync，已可正確顯示。
- `es_set_event_paths` 的 `paths` 是覆蓋語意；若需 append，應使用 `es_update_bundle` / `es_update_note` 先 read 再 write。
