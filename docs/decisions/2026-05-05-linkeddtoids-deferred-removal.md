---
date: 2026-05-05
status: deferred
decided_by: user (with Claude/Codex/Gemini analysis)
related_discussion: docs/discussions/2026-05-05-merge-type-and-dto-ref-into-unified-picker.md
related_task: docs/tasks/2026-05-05-merge-type-and-dto-ref-into-unified-picker.md
---

# Decision: `Remodel.linkedDtoIds` 暫不移除（deferred removal）

## 結論

`Remodel.linkedDtoIds` 欄位、UI chip 列表、markdown / json export 對它的引用、MCP tool 的 input parameter **暫時保留**。**不**做 schema 移除、**不**改 export 邏輯、**不**動 MCP API。

當前狀態:**已喪失唯一性價值,但未啟動移除工作**。

## 為什麼還在?(背景)

歷史上 `linkedDtoIds` 解決了三個問題:

1. **Parameters 用 DTO 當 input**:`Remodel.parameters: Property[]` 的 `Property` 型別只有 `attrName + type`,沒有結構性 DTO ref 欄位。linkedDtoIds 是當時唯一能標記「這個 read model 用 OrderFilterDto 當 query 輸入」的位置。
2. **Behavior / 隱性依賴**:`remodel.behavior` 是自由文字,可能提到某 DTO 但不在 returnType。linkedDtoIds 提供結構性備案。
3. **Export 依賴清單**:markdown / jsonExporter 直接讀 linkedDtoIds 做 spec bundle 的「dependent DTO schemas」段落。

## 為什麼現在沒理由存在?

2026-05-05 完成兩個改動讓 #1 失效:

- `ReturnTypeField` 與 `DtoField` 已有 `dtoSpecRef`(2026-05-04 之前既有設計)
- **`Property` 也補上 `dtoSpecRef`**(2026-05-05 與本決定同 commit 完成),讓 Command information、Remodel parameters 都能結構化指向 DTO

加上 ReturnTypeEditor / DtoFieldsEditor / Command information / Remodel parameters 全部已用 `TypeOrDtoPicker` — DTO ref 在 4 個 input/output 入口都有結構性管道。

**剩下的兩個次要 use case**:

- #2 Behavior 文字依賴:可改成 behavior 文字明寫 DTO 名,或將來補一個 derive helper
- #3 Export 依賴清單:可改成從 `returnType.fields ∪ parameters` derive(union dedupe by dtoSpecRef)

這兩條都有替代方案,但沒立刻動的價值。

## 為什麼選擇 deferred 而不是立刻移除?

User 評估後決定:

- **MCP API breaking change 成本**:`es_add_remodel` / `es_update_remodel` 移除 `linkedDtoIds` 參數會 break 既有 AI 工作流(若有 prompt template 帶入此欄位,會報錯)
- **Markdown / JSON export 行為變化**:當前 export 把 linkedDtoIds 對應的 DTO 內容**整段**塞進 spec bundle;改成 derive 會讓 export 內容變化(只剩 returnType / parameters 用到的 DTO,其他被 user 手動 chip 進去的會消失)。若有現存的 spec bundle export 流程依賴 chip 內容,會出問題
- **線上資料風險低,但非零**:user 表示沒在用策展功能、Remodel returnType 也還沒寫太多,但不能保證 BE-local `mcp-server/data/project.json` 完全沒有 linkedDtoIds 殘留
- **改動複雜度與當下優先級不匹配**:陽動 schema 移除 + UI 移除 + export 改寫 + MCP 改 + migration code,複雜度比 Property.dtoSpecRef 多出一倍

## 觸發未來移除的條件

當以下任一發生時,重新評估移除:

- AI 工作流明確不再使用 `linkedDtoIds` 參數
- spec bundle export 流程改設計,不依賴 chip 內容
- 維護成本(雙寫 chip + Property.dtoSpecRef)成為 user 困擾
- 有 follow-up task 把 export 邏輯重構

## 預期移除路徑(供未來參考)

當條件滿足時的移除步驟:

1. **Markdown / JSON export 改成 derive**:union of `returnType.fields[].dtoSpecRef ∪ parameters[].dtoSpecRef`(after Property.dtoSpecRef 已上線),dedupe 後當作 dependent DTO 清單
2. **UI 移除**:RemodelPanel 內 chip 列表整段刪(含 + button、sync arrow、search dropdown),約 -200 行
3. **MCP tool 移除參數**:`es_add_remodel` / `es_update_remodel` 從 zod schema 拔掉 `linkedDtoIds`(breaking change,需公告)
4. **Schema 移除**:`Remodel.linkedDtoIds` 從 FE `src/types/elements.ts` 與 BE `mcp-server/src/index.ts` 拔掉
5. **Migration**:BE `migrateProject` 末尾 `delete (r as { linkedDtoIds?: string[] }).linkedDtoIds;`(類似 wire-strip 處理過 activeBoardId 的 pattern)。FE persist version bump 順手刪 `state.project.boards[].remodels[].linkedDtoIds`
6. **Verification**:grep `! grep -rn linkedDtoIds src/ mcp-server/src/`

## 與本決定同 commit 完成的工作

- `Property` interface 補 `dtoSpecRef?: string`(FE + BE 鏡像)
- `AddCommandModal` 的 Command information 編輯器 → `TypeOrDtoPicker`
- `DetailPanel` 的 `PropertyTable` 加 `enableDtoRef` prop;Command information callsite 開啟 picker(Event Output 維持 TypeDropdown,不改)
- `DetailPanel` 的 `ColoredPropertyTable` 加 `enableDtoRef` prop;Remodel parameters callsite 開啟 picker(light theme)
- 決策文件本身

## 維護注意事項

- 不要新增 `linkedDtoIds` 的 caller。若有需求,先回頭審視這個 deferred 決定
- export 邏輯維持原狀 — 不要為了「順手」改成 derive(會偷偷改變 export 行為,不應該在無對應 task 的情況下發生)
- MCP tool 的 `linkedDtoIds` zod schema 維持。AI 工作流可繼續傳此參數,但 FE 不再產生新的 chip 寫入(由用戶手動 chip 才會寫;新加的欄位 DTO ref 走 Property.dtoSpecRef 管道)
