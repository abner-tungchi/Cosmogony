import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CoachSessionStore } from '../sessionStore.js';
import { createCoachRouter, createDegradedCoachRouter } from '../router.js';
import type {
  LLMAdapter,
  LLMAdapterMessage,
  LLMReply,
  FunctionCallRequest,
  ToolDeclaration,
  ToolConfig,
  ToolResponseMessage,
} from '../llm/adapter.js';
import { EventStormingSkill } from '../skills/eventStormingSkill.js';
import {
  createInMemoryPendingActionStore,
  type PendingActionStore,
  type ProjectSnapshot,
} from '../agent/pendingActions.js';
import type { AuditLog, AuditLogEntry } from '../audit/auditLog.js';
import type { CommitDeps } from '../tools/mcpAdapter.js';
import type { BoardSnapshot, ProposedAction } from '../types.js';

const NOW = '2026-05-11T12:00:00.000Z';

function mkSnapshot(): BoardSnapshot {
  return {
    activeBoardId: 'b-1',
    activeBoardName: 'Default',
    aggregates: [],
    domainEvents: [{ id: 'evt-1', name: 'OrderPlaced' }],
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

class MockLLM implements LLMAdapter {
  readonly modelName = 'mock-llm';
  readonly availableModels = ['mock-llm', 'mock-llm-fast'] as const;
  // toggleable behaviour
  abortDuringChat = false;
  failWith: Error | null = null;
  lastMessages: LLMAdapterMessage[] = [];
  lastModel: string | null = null;
  /**
   * If non-null, the *next* chat() call returns these functionCalls and a
   * non-finished reply. Consumed on use so subsequent calls go back to the
   * default text reply.
   */
  replyFunctionCalls: FunctionCallRequest[] | null = null;

  async chat(opts: {
    systemPrompt: string;
    messages: LLMAdapterMessage[];
    signal?: AbortSignal;
    model?: string;
    tools?: ToolDeclaration[];
    toolConfig?: ToolConfig;
    toolResponses?: ToolResponseMessage[];
  }): Promise<LLMReply> {
    this.lastMessages = opts.messages;
    const modelToUse = opts.model && (this.availableModels as readonly string[]).includes(opts.model) ? opts.model : this.modelName;
    this.lastModel = modelToUse;
    if (this.abortDuringChat) {
      await new Promise<void>((resolve, reject) => {
        if (opts.signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        opts.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
        setTimeout(resolve, 50);
      });
    }
    if (this.failWith) throw this.failWith;
    if (this.replyFunctionCalls) {
      const calls = this.replyFunctionCalls;
      this.replyFunctionCalls = null; // consume once
      return {
        content: 'mock reply (proposing)',
        modelUsed: modelToUse,
        tokenUsage: { input: 10, output: 5 },
        functionCalls: calls,
        isFinished: false,
      };
    }
    return {
      content: `mock reply for: ${opts.messages[opts.messages.length - 1]?.content ?? ''}`,
      modelUsed: modelToUse,
      tokenUsage: { input: 10, output: 5 },
      isFinished: true,
    };
  }
}

interface MutableProject {
  id: string;
  name: string;
  activeBoardId: string;
  updatedAt: string;
  createdAt: string;
  boards: Array<{
    id: string;
    name: string;
    notes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
      size: { width: number; height: number };
      zIndex: number;
      paths: string[];
      createdAt: string;
      updatedAt: string;
      commandId?: string;
      entityId?: string;
      eventProperties?: unknown[];
      dtoFields?: unknown[];
      invariants?: unknown[];
    }>;
    remodels: unknown[];
    links: unknown[];
    flowPaths: unknown[];
    createdAt: string;
    updatedAt: string;
  }>;
}

function makeProject(): MutableProject {
  return {
    id: 'p-1',
    name: 'Test',
    activeBoardId: 'b-1',
    updatedAt: NOW,
    createdAt: NOW,
    boards: [
      {
        id: 'b-1',
        name: 'Default',
        notes: [
          {
            id: 'evt-1',
            type: 'DomainEvent',
            label: 'OrderPlaced',
            position: { x: 0, y: 0 },
            size: { width: 160, height: 80 },
            zIndex: 1,
            paths: [],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        remodels: [],
        links: [],
        flowPaths: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  };
}

interface TestServer {
  app: express.Express;
  server: Server;
  url: string;
  store: CoachSessionStore;
  llm: MockLLM;
  dataDir: string;
  pendingStore: PendingActionStore;
  project: MutableProject;
  auditEntries: AuditLogEntry[];
  commitCalls: { save: number; sync: number; broadcasts: Array<{ action: string }> };
}

async function makeServer(degraded: boolean): Promise<TestServer> {
  const dataDir = mkdtempSync(join(tmpdir(), 'coach-router-test-'));
  const store = new CoachSessionStore({ dataDir });
  const llm = new MockLLM();
  const project = makeProject();
  const pendingStore = createInMemoryPendingActionStore();
  const auditEntries: AuditLogEntry[] = [];
  const auditLog: AuditLog = {
    async append(entry) {
      auditEntries.push(entry);
    },
  };
  const commitCalls = { save: 0, sync: 0, broadcasts: [] as Array<{ action: string }> };
  const commitDeps: CommitDeps = {
    saveProject: () => {
      commitCalls.save += 1;
    },
    syncProjectToRelay: async () => {
      commitCalls.sync += 1;
    },
    broadcast: async (action) => {
      commitCalls.broadcasts.push({ action });
    },
  };
  const app = express();
  app.use(express.json());
  if (degraded) {
    app.use('/api/coach', createDegradedCoachRouter());
  } else {
    app.use(
      '/api/coach',
      createCoachRouter({
        sessionStore: store,
        llm,
        baseDddGuide: '# DDD',
        userDraft: null,
        skill: new EventStormingSkill(),
        pendingStore,
        auditLog,
        loadProject: () => project as unknown as ProjectSnapshot,
        getFullProjectState: () => project,
        commitDeps,
        toolVersion: '0.0.0-test',
      }),
    );
  }
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    app,
    server,
    url: `http://127.0.0.1:${port}`,
    store,
    llm,
    dataDir,
    pendingStore,
    project,
    auditEntries,
    commitCalls,
  };
}

async function teardown(t: TestServer) {
  await new Promise<void>((r) => t.server.close(() => r()));
  try {
    rmSync(t.dataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

interface MessageResponse {
  sessionId: string;
  userMessage: { id: string; clientMessageId?: string; content: string };
  assistantMessage: {
    content: string;
    metadata?: { proposedActions?: ProposedAction[] };
  };
}

describe('Coach router', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await makeServer(false);
  });
  afterEach(() => teardown(t));

  it('缺 X-Coach-User-Id 回 401', async () => {
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', clientMessageId: 'c1' }),
    });
    expect(r.status).toBe(401);
  });

  it('缺 clientMessageId 回 400', async () => {
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(r.status).toBe(400);
  });

  it('正常路徑：clientMessageId 回到 userMessage', async () => {
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ text: 'hello', clientMessageId: 'cli-123', sessionId: null }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as MessageResponse;
    expect(body.userMessage.clientMessageId).toBe('cli-123');
    expect(body.userMessage.id).not.toBe('cli-123');
    expect(body.assistantMessage.content).toContain('mock reply');
    expect(body.sessionId).toBeTruthy();
  });

  it('跨 user 取 session 回 404', async () => {
    // u1 創建 session
    const r1 = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ text: 'a', clientMessageId: 'c1' }),
    });
    const { sessionId } = await r1.json() as { sessionId: string };
    // u2 嘗試讀
    const r2 = await fetch(`${t.url}/api/coach/sessions/${sessionId}`, {
      headers: { 'X-Coach-User-Id': 'u2' },
    });
    expect(r2.status).toBe(404);
  });

  it('LLM 失敗回 502', async () => {
    t.llm.failWith = new Error('boom');
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ text: 'hi', clientMessageId: 'c1' }),
    });
    expect(r.status).toBe(502);
  });

  it('GET /sessions 回該 user 列表', async () => {
    await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ text: 'a', clientMessageId: 'c1' }),
    });
    const r = await fetch(`${t.url}/api/coach/sessions`, {
      headers: { 'X-Coach-User-Id': 'u1' },
    });
    expect(r.status).toBe(200);
    const list = await r.json() as Array<{ id: string }>;
    expect(list.length).toBe(1);
  });
});

describe('Coach router — pending lifecycle', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await makeServer(false);
  });
  afterEach(() => teardown(t));

  // Helper: propose 1 additive action and return ids.
  async function proposeOneHotspot(
    userId: string,
    args: Record<string, unknown> = { type: 'Hotspot', label: 'Q1', x: 0, y: 200 },
  ): Promise<{ sessionId: string; actionId: string }> {
    t.llm.replyFunctionCalls = [{ id: 'fc-1', name: 'es_add_note', args }];
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': userId },
      body: JSON.stringify({
        text: '請建一個 hotspot',
        clientMessageId: `cli-${Math.random()}`,
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as MessageResponse;
    const proposed = body.assistantMessage.metadata?.proposedActions ?? [];
    expect(proposed.length).toBe(1);
    return { sessionId: body.sessionId, actionId: proposed[0].id };
  }

  it('confirm happy path → 200, status=confirmed, commit invoked', async () => {
    const { sessionId, actionId } = await proposeOneHotspot('u1');
    const r = await fetch(`${t.url}/api/coach/actions/${actionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId, forceApply: false }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { status: string };
    expect(body.status).toBe('confirmed');
    expect(t.commitCalls.save).toBeGreaterThan(0);
    expect(t.auditEntries.some((e) => e.eventType === 'confirm')).toBe(true);
  });

  it('confirm 缺 sessionId → 400', async () => {
    const r = await fetch(`${t.url}/api/coach/actions/anything/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it('confirm stale → 409', async () => {
    // Propose an action with targetIds=['evt-1'] (uses es_add_command_for_event).
    t.llm.replyFunctionCalls = [
      {
        id: 'fc-1',
        name: 'es_add_command_for_event',
        args: { eventNoteId: 'evt-1', commandLabel: 'PlaceOrder' },
      },
    ];
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({
        text: '請加 PlaceOrder command',
        clientMessageId: 'cli-stale',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as MessageResponse;
    const action = body.assistantMessage.metadata?.proposedActions?.[0];
    expect(action).toBeTruthy();
    expect(action!.targetIds).toContain('evt-1');

    // Mutate evt-1 label after propose → hash mismatch.
    t.project.boards[0].notes[0].label = 'OrderPlacedV2';

    const r2 = await fetch(`${t.url}/api/coach/actions/${action!.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId: body.sessionId, forceApply: false }),
    });
    expect(r2.status).toBe(409);
    const stale = await r2.json() as { status: string };
    expect(stale.status).toBe('stale');
  });

  it('reject happy → 200 ok:true + audit reject', async () => {
    const { sessionId, actionId } = await proposeOneHotspot('u1');
    const r = await fetch(`${t.url}/api/coach/actions/${actionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId, reason: 'not useful' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(t.auditEntries.some((e) => e.eventType === 'reject')).toBe(true);
  });

  it('reject already-finalized → 409 (PRECONDITION_FAILED mapped)', async () => {
    const { sessionId, actionId } = await proposeOneHotspot('u1');
    // First reject → ok
    await fetch(`${t.url}/api/coach/actions/${actionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId, reason: null }),
    });
    // Second reject on same action → already finalized
    const r2 = await fetch(`${t.url}/api/coach/actions/${actionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId, reason: null }),
    });
    expect(r2.status).toBe(409);
  });

  it('confirm-batch happy: 2 actions → 200, both confirmed', async () => {
    // Propose 2 actions in a single LLM turn.
    t.llm.replyFunctionCalls = [
      { id: 'fc-a', name: 'es_add_note', args: { type: 'Hotspot', label: 'A', x: 0, y: 200 } },
      { id: 'fc-b', name: 'es_add_note', args: { type: 'Hotspot', label: 'B', x: 200, y: 200 } },
    ];
    const r = await fetch(`${t.url}/api/coach/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({
        text: '請加 A 和 B 兩個 hotspot',
        clientMessageId: 'cli-batch',
        attachSnapshot: true,
        boardSnapshot: mkSnapshot(),
      }),
    });
    const body = await r.json() as MessageResponse;
    const ids = (body.assistantMessage.metadata?.proposedActions ?? []).map((a) => a.id);
    expect(ids.length).toBe(2);

    const r2 = await fetch(`${t.url}/api/coach/actions/confirm-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId: body.sessionId, actionIds: ids }),
    });
    expect(r2.status).toBe(200);
    const result = await r2.json() as { results: Array<{ status: string }>; stoppedAt?: string };
    expect(result.results.length).toBe(2);
    expect(result.results.every((r3) => r3.status === 'confirmed')).toBe(true);
    expect(result.stoppedAt).toBeUndefined();
  });

  it('confirm-batch with stale action → 400 with stale message', async () => {
    const { sessionId, actionId } = await proposeOneHotspot('u1');
    // Force the action into 'stale' via direct store access.
    const stored = await t.pendingStore.getAction(sessionId, actionId);
    expect(stored).toBeTruthy();
    stored!.status = 'stale';

    const r = await fetch(`${t.url}/api/coach/actions/confirm-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-User-Id': 'u1' },
      body: JSON.stringify({ sessionId, actionIds: [actionId] }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: string };
    expect(body.error).toContain('Stale actions cannot be batch-applied');
  });

  it('GET /pending happy: returns array of pending actions', async () => {
    const { sessionId } = await proposeOneHotspot('u1');
    const r = await fetch(`${t.url}/api/coach/sessions/${sessionId}/pending`, {
      headers: { 'X-Coach-User-Id': 'u1' },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as ProposedAction[];
    expect(body.length).toBe(1);
    expect(body[0].status).toBe('pending');
  });

  it('GET /pending cross-user → 404', async () => {
    const { sessionId } = await proposeOneHotspot('u1');
    const r = await fetch(`${t.url}/api/coach/sessions/${sessionId}/pending`, {
      headers: { 'X-Coach-User-Id': 'u2' },
    });
    expect(r.status).toBe(404);
  });
});

describe('Degraded coach router (no GEMINI_API_KEY)', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await makeServer(true);
  });
  afterEach(() => teardown(t));

  it.each([
    ['POST', '/api/coach/message', { text: 'hi', clientMessageId: 'x' }],
    ['GET', '/api/coach/sessions', null],
    ['GET', '/api/coach/sessions/abc', null],
    ['POST', '/api/coach/sessions/abc/clear', null],
    ['POST', '/api/coach/actions/some-action/confirm', { sessionId: 's1' }],
    ['POST', '/api/coach/actions/confirm-batch', { sessionId: 's1', actionIds: [] }],
    ['POST', '/api/coach/actions/some-action/reject', { sessionId: 's1' }],
    ['GET', '/api/coach/sessions/abc/pending', null],
  ])('%s %s 回 503', async (method, path, body) => {
    const r = await fetch(`${t.url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Coach-User-Id': 'u1',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(r.status).toBe(503);
    const data = await r.json() as { error: string };
    expect(data.error).toContain('GEMINI_API_KEY');
  });
});
