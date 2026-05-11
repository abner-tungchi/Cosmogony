import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type OrchestratorDeps } from '../agent/orchestrator.js';
import {
  createInMemoryPendingActionStore,
  type ProjectSnapshot,
} from '../agent/pendingActions.js';
import { EventStormingSkill } from '../skills/eventStormingSkill.js';
import { createAuditLog } from '../audit/auditLog.js';
import type {
  LLMAdapter,
  FunctionCallRequest,
  LLMReply,
} from '../llm/adapter.js';
import type { BoardSnapshot } from '../types.js';

const FIXED_NOW = '2026-05-11T12:00:00.000Z';

function makeMockLLM(
  replies: Array<
    Partial<{ content: string; functionCalls: FunctionCallRequest[]; isFinished: boolean }>
  >,
): LLMAdapter & { callCount: () => number } {
  let idx = 0;
  let callCount = 0;
  return {
    modelName: 'mock',
    availableModels: ['mock'],
    async chat(_opts): Promise<LLMReply> {
      callCount += 1;
      const r = replies[idx++] ?? { content: '', isFinished: true };
      return {
        content: r.content ?? '',
        modelUsed: 'mock',
        tokenUsage: { input: 1, output: 1 },
        functionCalls: r.functionCalls,
        isFinished: r.isFinished ?? true,
      };
    },
    callCount: () => callCount,
  };
}

function mkProject(): ProjectSnapshot {
  // Cast through unknown so handlers that expect richer Board shape
  // (links / flowPaths) can still operate against the snapshot.
  return {
    id: 'proj-1',
    activeBoardId: 'board-1',
    updatedAt: '2026-05-11T00:00:00.000Z',
    boards: [
      {
        id: 'board-1',
        notes: [{ id: 'n-de1', type: 'DomainEvent', label: 'OrderPlaced' }],
        remodels: [],
        // Below fields are present in the real Project type — needed by handlers like es_get_project.
        ...{ name: 'Order', links: [], flowPaths: [], createdAt: '2026-05-11T00:00:00.000Z', updatedAt: '2026-05-11T00:00:00.000Z' },
      } as ProjectSnapshot['boards'][number],
    ],
    ...{ name: 'Test', createdAt: '2026-05-11T00:00:00.000Z' },
  } as ProjectSnapshot;
}

function mkSnapshot(): BoardSnapshot {
  return {
    activeBoardId: 'board-1',
    activeBoardName: 'Order',
    aggregates: [],
    domainEvents: [{ id: 'n-de1', name: 'OrderPlaced' }],
    commands: [],
    policies: [],
    readModelsCount: 0,
    dtosCount: 0,
    hotspots: [],
    adjacentContexts: [],
    driftSignals: [],
    rawActiveBoard: {},
    hash: 'snap-h1',
  };
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'orch-test-'));
});

afterEach(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function buildDeps(
  llm: LLMAdapter,
  project: ProjectSnapshot = mkProject(),
): OrchestratorDeps & { pendingStore: ReturnType<typeof createInMemoryPendingActionStore> } {
  const pendingStore = createInMemoryPendingActionStore();
  const auditLog = createAuditLog({ dataDir });
  return {
    llm,
    skill: new EventStormingSkill(),
    pendingStore,
    auditLog,
    loadProject: () => project,
    buildSystemPrompt: () => 'test prompt',
    toolVersion: '0.0.0-test',
    now: () => FIXED_NOW,
  };
}

function readAuditEntries(): Array<Record<string, unknown>> {
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) return [];
  const all: Array<Record<string, unknown>> = [];
  for (const f of files) {
    const content = readFileSync(join(dataDir, f), 'utf8').trim();
    if (!content) continue;
    for (const line of content.split('\n')) {
      all.push(JSON.parse(line));
    }
  }
  return all;
}

describe('runAgentTurn', () => {
  it('no tool calls → assistantMessage with no proposedActions, no pending', async () => {
    const llm = makeMockLLM([{ content: 'Hello.', isFinished: true }]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: 'Hi',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.assistantMessage.content).toBe('Hello.');
    expect(res.assistantMessage.metadata?.proposedActions).toBeUndefined();
    expect(res.newPendingActions).toHaveLength(0);
    expect(await deps.pendingStore.listPending('s1')).toHaveLength(0);
  });

  it('read auto-exec: skill executes, audit logs auto_exec_read, second turn happens', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [{ id: 'fc-1', name: 'es_get_project', args: {} }],
        isFinished: false,
      },
      { content: 'Done reading.', isFinished: true },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '看一下這個 board',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.assistantMessage.content).toBe('Done reading.');
    expect(await deps.pendingStore.listPending('s1')).toHaveLength(0);
    const entries = readAuditEntries();
    const autoExec = entries.filter((e) => e.eventType === 'auto_exec_read');
    expect(autoExec).toHaveLength(1);
    expect(autoExec[0].toolName).toBe('es_get_project');
  });

  it('single additive propose: 1 pending action, propose audit, loop terminates (D17c)', async () => {
    const llm = makeMockLLM([
      {
        content: '建議加 OrderPlaced',
        functionCalls: [
          {
            id: 'fc-add',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'OrderPlaced', x: 100, y: 200 },
          },
        ],
        isFinished: false,
      },
      // Second reply not expected to be consumed (D17c break) — but make safe
      { content: 'extra', isFinished: true },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '請建一個 OrderPlaced DomainEvent',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(1);
    const pending = await deps.pendingStore.listPending('s1');
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('es_add_note');
    expect(pending[0].status).toBe('pending');
    // assistantMessage.metadata.proposedActions populated
    expect(res.assistantMessage.metadata?.proposedActions).toHaveLength(1);

    const entries = readAuditEntries();
    expect(entries.filter((e) => e.eventType === 'propose')).toHaveLength(1);
    // Only one LLM call before D17c break
    expect(llm.callCount()).toBe(1);
  });

  it('D17c interrupt: 2 additive calls in same step → both processed, loop breaks (1 LLM call total)', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-a',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'EventA', x: 0, y: 0 },
          },
          {
            id: 'fc-b',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'EventB', x: 200, y: 0 },
          },
        ],
        isFinished: false,
      },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '請建 EventA 和 EventB',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(2);
    expect(llm.callCount()).toBe(1);
  });

  it('intent gate block — non-mutation user turn → audit intent_gate_blocked, 0 pending', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-add',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'X', x: 0, y: 0 },
          },
        ],
        isFinished: false,
      },
      { content: 'ok', isFinished: true },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: 'OrderPlaced 是什麼？',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(0);
    expect(await deps.pendingStore.listPending('s1')).toHaveLength(0);
    const entries = readAuditEntries();
    const blocks = entries.filter((e) => e.eventType === 'intent_gate_blocked');
    expect(blocks).toHaveLength(1);
    expect((blocks[0].errorEnvelope as { message?: string }).message).toBe(
      'no_mutation_intent_in_user_turn',
    );
  });

  it('budget block at 3rd call: 2 succeed, 3rd blocked with reason=budget_exceeded', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-1',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'E1', x: 0, y: 0 },
          },
          {
            id: 'fc-2',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'E2', x: 100, y: 0 },
          },
          {
            id: 'fc-3',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'E3', x: 200, y: 0 },
          },
        ],
        isFinished: false,
      },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '請建三個 events',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(2);
    const entries = readAuditEntries();
    const blocks = entries.filter((e) => e.eventType === 'intent_gate_blocked');
    expect(blocks).toHaveLength(1);
    expect((blocks[0].errorEnvelope as { message?: string }).message).toBe('budget_exceeded');
  });

  it('attachSnapshot=false (N16): mutation intent + additive → blocked with no_snapshot_attached', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-1',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'X', x: 0, y: 0 },
          },
        ],
        isFinished: false,
      },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '請建一個 X DomainEvent',
        attachSnapshot: false,
        boardSnapshot: null,
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(0);
    const entries = readAuditEntries();
    const blocks = entries.filter((e) => e.eventType === 'intent_gate_blocked');
    expect(blocks).toHaveLength(1);
    expect((blocks[0].errorEnvelope as { message?: string }).message).toBe(
      'no_snapshot_attached',
    );
  });

  it('toolCallId propagation: ProposedAction.toolCallId === FunctionCall.id', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-123',
            name: 'es_add_note',
            args: { type: 'DomainEvent', label: 'X', x: 0, y: 0 },
          },
        ],
        isFinished: false,
      },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '請建 X',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(1);
    expect(res.newPendingActions[0].toolCallId).toBe('fc-123');
  });

  it('mutate/destructive rejected (Spec B not exposed): es_update_note blocked', async () => {
    const llm = makeMockLLM([
      {
        content: '',
        functionCalls: [
          {
            id: 'fc-up',
            name: 'es_update_note',
            args: { id: 'n-de1', label: 'New Label' },
          },
        ],
        isFinished: false,
      },
      { content: 'rejected upstream', isFinished: true },
    ]);
    const deps = buildDeps(llm);
    const res = await runAgentTurn(
      {
        sessionId: 's1',
        userId: 'u1',
        userMessage: '改一下 label 加上「v2」',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      },
      deps,
    );
    expect(res.newPendingActions).toHaveLength(0);
    expect(await deps.pendingStore.listPending('s1')).toHaveLength(0);
    const entries = readAuditEntries();
    const blocks = entries.filter((e) => e.eventType === 'intent_gate_blocked');
    expect(blocks).toHaveLength(1);
    expect((blocks[0].errorEnvelope as { message?: string }).message).toBe('not_in_mvp_scope');
  });

  it('maxSteps cap: LLM always returns a read call → terminates without infinite loop', async () => {
    const replies = Array.from({ length: 20 }, (_, i) => ({
      content: '',
      functionCalls: [
        { id: `fc-${i}`, name: 'es_get_project', args: { round: i } },
      ] as FunctionCallRequest[],
      isFinished: false,
    }));
    const llm = makeMockLLM(replies);
    const deps = buildDeps(llm);

    // Run with a safety timeout via Promise.race
    const result = await Promise.race([
      runAgentTurn(
        {
          sessionId: 's1',
          userId: 'u1',
          userMessage: '看一下',
          attachSnapshot: true,
          boardSnapshot: mkSnapshot(),
        },
        deps,
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('orchestrator hung')), 4000),
      ),
    ]);
    expect(result).toBeTruthy();
    // MAX_STEPS = 6, so at most 6 LLM calls
    expect(llm.callCount()).toBeLessThanOrEqual(6);
  });
});
