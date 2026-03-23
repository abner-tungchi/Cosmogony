import type { Board } from '../types/board';
import { exportToMarkdown } from './markdownExporter';

export function buildAiHandoffPrompt(board: Board): string {
  const boardJson = JSON.stringify(board, null, 2);
  const markdown = exportToMarkdown(board);

  return `以下是目前「${board.name}」Context 的 Event Storming 狀態。

## Board State (JSON — 供 MCP 工具使用)

\`\`\`json
${boardJson}
\`\`\`

## Readable Summary (Markdown)

${markdown}

---

請根據以上現有的 Event Storming，繼續完善這個 Bounded Context。
你可以使用 MCP 工具（es_add_command_for_event、es_add_note、es_add_link 等）直接在畫布上新增元素，
或提出分析與建議。`;
}
