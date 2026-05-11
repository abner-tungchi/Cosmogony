export interface IntentGateResult {
  allowMutating: boolean;
  reason?: 'no_mutation_intent_in_user_turn' | 'budget_exceeded';
}

/** Spec B 預設 perTurnLimit = 2 (D23). */
export const DEFAULT_PROPOSAL_BUDGET_PER_TURN = 2;

const ZH_KEYWORDS = ['建', '加', '新增', '做', '連', '補', '做出', '建立', '請', '幫我', '麻煩', '補上', '畫出', '接到', '串起'];
const EN_KEYWORDS = ['add', 'create', 'link', 'build', 'make', 'connect', 'append'];

/**
 * 判斷使用者本輪訊息是否含明確 mutation intent。
 * Single source of truth — orchestrator + audit log 都從這裡取。
 *
 * 規則：
 *  - 訊息結尾為「？」「?」或「嗎」且總字數 < 10 → 純問句，回 false（優先於 keyword）。
 *  - 中文 keyword 命中 → true。
 *  - 英文 keyword (word-boundary, case-insensitive) 命中 → true。
 *  - 其餘 → false。
 */
export function detectMutationIntent(userTurnText: string): boolean {
  const text = userTurnText.trim();
  if (!text) return false;

  const last = text[text.length - 1];
  const endsWithQuestion = last === '?' || last === '？';
  const endsWithMa = text.endsWith('嗎') || text.endsWith('嗎?') || text.endsWith('嗎？');
  if ((endsWithQuestion || endsWithMa) && text.length < 10) {
    return false;
  }

  if (ZH_KEYWORDS.some((kw) => text.includes(kw))) return true;

  const lower = text.toLowerCase();
  if (EN_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(lower))) return true;

  return false;
}

export function checkProposalBudget(countAlreadyProposed: number, perTurnLimit: number): IntentGateResult {
  if (countAlreadyProposed >= perTurnLimit) {
    return { allowMutating: false, reason: 'budget_exceeded' };
  }
  return { allowMutating: true };
}
