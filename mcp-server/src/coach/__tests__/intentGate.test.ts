import { describe, it, expect } from 'vitest';
import {
  detectMutationIntent,
  checkProposalBudget,
  DEFAULT_PROPOSAL_BUDGET_PER_TURN,
} from '../agent/intentGate.js';

describe('detectMutationIntent', () => {
  it('empty string → false', () => {
    expect(detectMutationIntent('')).toBe(false);
  });

  it('whitespace-only → false', () => {
    expect(detectMutationIntent('   \n\t  ')).toBe(false);
  });

  it('Chinese keyword "幫我建一個 OrderPlaced" → true', () => {
    expect(detectMutationIntent('幫我建一個 OrderPlaced')).toBe(true);
  });

  it('Chinese keyword "請建立" → true', () => {
    expect(detectMutationIntent('請建立一個新的 context')).toBe(true);
  });

  it('English keyword "add an OrderPlaced event" → true', () => {
    expect(detectMutationIntent('add an OrderPlaced event')).toBe(true);
  });

  it('English keyword "Create the aggregate" → true (case-insensitive)', () => {
    expect(detectMutationIntent('Create the aggregate')).toBe(true);
  });

  it('boundary: "adapter" should NOT match "add"', () => {
    expect(detectMutationIntent('adapter pattern')).toBe(false);
  });

  it('pure short question "建議嗎?" → false', () => {
    expect(detectMutationIntent('建議嗎?')).toBe(false);
  });

  it('pure short question "好嗎？" → false', () => {
    expect(detectMutationIntent('好嗎？')).toBe(false);
  });

  it('longer question with keyword → true (>= 10 chars; short-question rule does not apply)', () => {
    expect(detectMutationIntent('請建一個 OrderPlaced 並連到 Order，可以嗎？')).toBe(true);
  });
});

describe('checkProposalBudget', () => {
  it('DEFAULT_PROPOSAL_BUDGET_PER_TURN === 2', () => {
    expect(DEFAULT_PROPOSAL_BUDGET_PER_TURN).toBe(2);
  });

  it('countAlreadyProposed=0, limit=2 → allowed', () => {
    expect(checkProposalBudget(0, 2)).toEqual({ allowMutating: true });
  });

  it('countAlreadyProposed=2, limit=2 → blocked (budget_exceeded)', () => {
    expect(checkProposalBudget(2, 2)).toEqual({
      allowMutating: false,
      reason: 'budget_exceeded',
    });
  });

  it('countAlreadyProposed=3, limit=2 → blocked (budget_exceeded)', () => {
    expect(checkProposalBudget(3, 2)).toEqual({
      allowMutating: false,
      reason: 'budget_exceeded',
    });
  });
});
