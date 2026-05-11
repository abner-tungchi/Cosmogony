import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COT_FRAMEWORK = `
## 思考流程（每次回應前先在內心走一遍）

1. 識別使用者意圖
2. 分析模式（Aggregate / Value Object / Repository / Read Model）
3. 比對 DDD 原則（是否貧血模型？是否封裝 invariant？Repository 是否混入查詢？）
4. 判斷漂移並分類（OOP 滑坡 / Read Model 滑坡 / 邊界錯置）
5. 用蘇格拉底式提問引導，不直接說「你錯了」
`.trim();

const FALLBACK_DRAFT = `
你是 Cosmogony 中的 AI 教練，協助使用者進行 Event Storming 與 DDD 設計。
你會看到使用者目前的 board 狀態快照（Aggregates、Domain Events、Commands、Policies、相鄰 Bounded Context）。
你的職責：

1. **思維校正**：偵測使用者是否從 DDD 滑向 OOP / Read Model 思維。
2. **不變量引導**：協助補完業務情境，提出候選 invariant。
3. **跨 context 觀察**：如果看到相鄰 context 有相關事件，主動提醒。

回應風格：簡潔、聚焦、用蘇格拉底式提問。不直接說「你錯了」。
`.trim();

export interface BuildSystemPromptOptions {
  baseDddGuide: string;
  userDraft: string | null;
  attachSnapshot: boolean;
  snapshotMarkdown: string | null;
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const parts: string[] = [
    opts.userDraft && opts.userDraft.trim().length > 0 ? opts.userDraft : FALLBACK_DRAFT,
    COT_FRAMEWORK,
    '## DDD 操作手冊（domain expert reference）',
    opts.baseDddGuide,
  ];

  if (opts.attachSnapshot && opts.snapshotMarkdown) {
    parts.push('## 當前 Board 快照', opts.snapshotMarkdown);
  } else if (!opts.attachSnapshot) {
    parts.push(
      '## 注意：使用者已關閉 board snapshot 附帶。請只依對話內容回應，不要假設使用者的 board 結構。',
    );
  }

  return parts.filter(Boolean).join('\n\n');
}

export function loadUserDraft(): string | null {
  const path = process.env.COACH_SYSTEM_PROMPT_FILE
    ?? resolve(process.cwd(), 'mcp-server/data/coach/system_prompt.md');
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function loadBaseDddGuide(): string {
  // mcp-server/CLAUDE.md 是 AI Domain Expert Guide，作為 system prompt 補充內容
  const candidates = [
    resolve(process.cwd(), 'mcp-server/CLAUDE.md'),
    resolve(process.cwd(), 'CLAUDE.md'),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      // try next
    }
  }
  return '';
}
