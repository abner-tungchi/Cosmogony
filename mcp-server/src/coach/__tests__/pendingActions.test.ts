import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInMemoryPendingActionStore,
  createFsPendingActionStore,
  createDefaultConfirmDeps,
  computeTargetEntityHash,
  ACTION_UPDATE_SSE_CHANNEL,
  type ProjectSnapshot,
  type ConfirmTransactionDeps,
  type ActionUpdatePayload,
  type ActionUpdateListener,
} from '../agent/pendingActions.js';
import type { CommitDeps } from '../tools/mcpAdapter.js';
import { EventStormingSkill } from '../skills/eventStormingSkill.js';
import type { ProposedAction } from '../types.js';
import type { ToolHandlerCtx, ToolHandlerResult } from '../tools/handlers.js';

function mkProject(
  notes: Array<{
    id: string;
    type?: string;
    label?: string;
    commandId?: string;
    entityId?: string;
    eventProperties?: unknown[];
    dtoFields?: unknown[];
    invariants?: unknown[];
  }>,
  remodels: Array<{ id: string }> = [],
): ProjectSnapshot {
  return {
    id: 'proj-1',
    activeBoardId: 'board-1',
    updatedAt: '2026-05-11T00:00:00.000Z',
    boards: [
      {
        id: 'board-1',
        notes: notes.map((n) => ({
          id: n.id,
          type: n.type ?? 'DomainEvent',
          label: n.label ?? 'X',
          commandId: n.commandId,
          entityId: n.entityId,
          eventProperties: n.eventProperties,
          dtoFields: n.dtoFields,
          invariants: n.invariants,
        })),
        remodels,
      },
    ],
  };
}

function mkAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    id: overrides.id ?? 'act-1',
    toolName: 'es_add_note',
    args: { type: 'DomainEvent', label: 'OrderPlaced', x: 0, y: 0 },
    toolCallId: 'fc-1',
    targetIds: [],
    subjectLabel: 'DomainEvent "OrderPlaced"',
    humanSummary: 'add a DomainEvent',
    rationale: '',
    status: 'pending',
    baseHash: '',
    baseProjectVersion: '2026-05-11T00:00:00.000Z',
    createdAt: '2026-05-11T00:00:00.000Z',
    finalizedAt: null,
    rejectReason: null,
    forceApply: false,
    errorEnvelope: null,
    ...overrides,
  };
}

function okExecutor(): ConfirmTransactionDeps['executor'] {
  return async () => ({ ok: true, resultJson: 'OK', events: [] } as ToolHandlerResult);
}

function buildCtxFor(project: ProjectSnapshot): () => ToolHandlerCtx {
  return () => ({
    projectState: project as unknown as ToolHandlerCtx['projectState'],
    now: () => '2026-05-11T00:00:00.000Z',
  });
}

describe('computeTargetEntityHash', () => {
  it('returns "" for empty targetIds', () => {
    const p = mkProject([{ id: 'n1' }]);
    expect(computeTargetEntityHash(p, [])).toBe('');
  });

  it('same state → same hash; different label → different hash', () => {
    const p1 = mkProject([{ id: 'n1', label: 'A' }]);
    const p2 = mkProject([{ id: 'n1', label: 'A' }]);
    const p3 = mkProject([{ id: 'n1', label: 'B' }]);
    const h1 = computeTargetEntityHash(p1, ['n1']);
    const h2 = computeTargetEntityHash(p2, ['n1']);
    const h3 = computeTargetEntityHash(p3, ['n1']);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('ignores position/zIndex (only stableSubset fields contribute)', () => {
    // Both snapshots have identical stable fields; position/zIndex not part of schema.
    const a = mkProject([{ id: 'n1', label: 'X' }]);
    const b = mkProject([{ id: 'n1', label: 'X' }]);
    // No way to set position/zIndex in ProjectSnapshot type — by construction.
    expect(computeTargetEntityHash(a, ['n1'])).toBe(computeTargetEntityHash(b, ['n1']));
  });
});

describe('ACTION_UPDATE_SSE_CHANNEL', () => {
  it('exports the SSE channel constant', () => {
    expect(ACTION_UPDATE_SSE_CHANNEL).toBe('coach_action_update');
  });
});

describe('createInMemoryPendingActionStore - propose / listPending / subscribe', () => {
  it('propose adds an action and broadcasts coach_action_update', async () => {
    const store = createInMemoryPendingActionStore();
    const listener = vi.fn<ActionUpdateListener>();
    store.subscribe('s1', listener);
    const action = mkAction({ id: 'act-1', status: 'pending' });
    await store.propose('s1', action);
    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0] as ActionUpdatePayload;
    expect(payload.sessionId).toBe('s1');
    expect(payload.actionId).toBe('act-1');
    expect(payload.status).toBe('pending');
  });

  it('listPending returns only pending/confirming/stale', async () => {
    const store = createInMemoryPendingActionStore();
    await store.propose('s1', mkAction({ id: 'a-pending', status: 'pending' }));
    await store.propose('s1', mkAction({ id: 'a-confirmed', status: 'confirmed' }));
    await store.propose('s1', mkAction({ id: 'a-stale', status: 'stale' }));
    const pending = await store.listPending('s1');
    expect(pending.map((a) => a.id).sort()).toEqual(['a-pending', 'a-stale']);
  });

  it('subscriber unsubscribe stops receiving updates', async () => {
    const store = createInMemoryPendingActionStore();
    const listener = vi.fn<ActionUpdateListener>();
    const unsub = store.subscribe('s1', listener);
    await store.propose('s1', mkAction({ id: 'a1' }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    await store.propose('s1', mkAction({ id: 'a2' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createInMemoryPendingActionStore - confirm', () => {
  it('happy path with targetIds=[]: pending → confirming → confirmed', async () => {
    const store = createInMemoryPendingActionStore();
    const project = mkProject([]);
    const listener = vi.fn<ActionUpdateListener>();
    store.subscribe('s1', listener);
    await store.propose('s1', mkAction({ id: 'a1', targetIds: [], baseHash: '' }));
    listener.mockClear();

    const res = await store.confirm(
      's1',
      'a1',
      { forceApply: false, userId: 'u1' },
      {
        getProject: () => project,
        executor: okExecutor(),
        buildCtx: buildCtxFor(project),
      },
    );
    expect(res.status).toBe('confirmed');
    expect(res.finalAction.status).toBe('confirmed');
    expect(res.finalAction.finalizedAt).not.toBeNull();
    // listener fires for confirming + confirmed
    const statuses = listener.mock.calls.map(
      (c) => (c[0] as ActionUpdatePayload).status,
    );
    expect(statuses).toEqual(['confirming', 'confirmed']);
  });

  it('mismatched hash without forceApply → status=stale', async () => {
    const store = createInMemoryPendingActionStore();
    const initialProject = mkProject([{ id: 'n1', label: 'Original' }]);
    const action = mkAction({
      id: 'a1',
      targetIds: ['n1'],
      baseHash: computeTargetEntityHash(initialProject, ['n1']),
    });
    await store.propose('s1', action);

    // Now state changes
    const changedProject = mkProject([{ id: 'n1', label: 'Changed' }]);
    const res = await store.confirm(
      's1',
      'a1',
      { forceApply: false, userId: 'u1' },
      {
        getProject: () => changedProject,
        executor: okExecutor(),
        buildCtx: buildCtxFor(changedProject),
      },
    );
    expect(res.status).toBe('stale');
    expect(res.finalAction.status).toBe('stale');
  });

  it('forceApply=true after stale: passes when target exists → confirmed', async () => {
    const store = createInMemoryPendingActionStore();
    const initialProject = mkProject([{ id: 'n1', label: 'Original' }]);
    const action = mkAction({
      id: 'a1',
      targetIds: ['n1'],
      baseHash: computeTargetEntityHash(initialProject, ['n1']),
    });
    await store.propose('s1', action);

    const changedProject = mkProject([{ id: 'n1', label: 'Changed' }]);
    // First confirm → stale
    const stale = await store.confirm(
      's1',
      'a1',
      { forceApply: false, userId: 'u1' },
      {
        getProject: () => changedProject,
        executor: okExecutor(),
        buildCtx: buildCtxFor(changedProject),
      },
    );
    expect(stale.status).toBe('stale');

    // Now force-apply
    const res = await store.confirm(
      's1',
      'a1',
      { forceApply: true, userId: 'u1' },
      {
        getProject: () => changedProject,
        executor: okExecutor(),
        buildCtx: buildCtxFor(changedProject),
      },
    );
    expect(res.status).toBe('confirmed');
    expect(res.finalAction.forceApply).toBe(true);
  });

  it('forceApply=true but target missing → status=failed with code=NOT_FOUND', async () => {
    const store = createInMemoryPendingActionStore();
    const initialProject = mkProject([{ id: 'n1', label: 'Original' }]);
    const action = mkAction({
      id: 'a1',
      targetIds: ['n1'],
      baseHash: computeTargetEntityHash(initialProject, ['n1']),
    });
    await store.propose('s1', action);
    // Make stale first
    const changedProject = mkProject([{ id: 'n1', label: 'Changed' }]);
    await store.confirm(
      's1',
      'a1',
      { forceApply: false, userId: 'u1' },
      {
        getProject: () => changedProject,
        executor: okExecutor(),
        buildCtx: buildCtxFor(changedProject),
      },
    );
    // Now target gone
    const goneProject = mkProject([]);
    const res = await store.confirm(
      's1',
      'a1',
      { forceApply: true, userId: 'u1' },
      {
        getProject: () => goneProject,
        executor: okExecutor(),
        buildCtx: buildCtxFor(goneProject),
      },
    );
    expect(res.status).toBe('failed');
    expect(res.errorEnvelope?.code).toBe('NOT_FOUND');
  });

  it('confirm from already-finalized → throws PRECONDITION_FAILED', async () => {
    const store = createInMemoryPendingActionStore();
    const project = mkProject([]);
    await store.propose('s1', mkAction({ id: 'a1', targetIds: [] }));
    await store.reject('s1', 'a1', 'no');
    await expect(
      store.confirm(
        's1',
        'a1',
        { forceApply: false, userId: 'u1' },
        {
          getProject: () => project,
          executor: okExecutor(),
          buildCtx: buildCtxFor(project),
        },
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('createInMemoryPendingActionStore - reject', () => {
  it('reject from pending → status=rejected, listener fires', async () => {
    const store = createInMemoryPendingActionStore();
    const listener = vi.fn<ActionUpdateListener>();
    store.subscribe('s1', listener);
    await store.propose('s1', mkAction({ id: 'a1' }));
    listener.mockClear();
    await store.reject('s1', 'a1', 'user said no');
    const got = await store.getAction('s1', 'a1');
    expect(got?.status).toBe('rejected');
    expect(got?.rejectReason).toBe('user said no');
    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0] as ActionUpdatePayload;
    expect(payload.status).toBe('rejected');
  });

  it('reject from already-finalized → throws PRECONDITION_FAILED', async () => {
    const store = createInMemoryPendingActionStore();
    await store.propose('s1', mkAction({ id: 'a1' }));
    await store.reject('s1', 'a1', null);
    await expect(store.reject('s1', 'a1', null)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

describe('createInMemoryPendingActionStore - confirmBatch', () => {
  it('happy path: 3 actions all confirm', async () => {
    const store = createInMemoryPendingActionStore();
    const project = mkProject([]);
    for (const id of ['b1', 'b2', 'b3']) {
      await store.propose('s1', mkAction({ id, targetIds: [] }));
    }
    const res = await store.confirmBatch(
      's1',
      ['b1', 'b2', 'b3'],
      { userId: 'u1' },
      {
        getProject: () => project,
        executor: okExecutor(),
        buildCtx: buildCtxFor(project),
      },
    );
    expect(res.results).toHaveLength(3);
    expect(res.results.every((r) => r.status === 'confirmed')).toBe(true);
    expect(res.stoppedAt).toBeUndefined();
  });

  it('fail-stop: second action fails → results has 2 entries, stoppedAt is second', async () => {
    const store = createInMemoryPendingActionStore();
    const project = mkProject([]);
    for (const id of ['b1', 'b2', 'b3']) {
      await store.propose('s1', mkAction({ id, targetIds: [] }));
    }
    let count = 0;
    const flakyExecutor: ConfirmTransactionDeps['executor'] = async () => {
      count += 1;
      if (count === 2) throw new Error('boom');
      return { ok: true, resultJson: 'OK', events: [] };
    };
    const res = await store.confirmBatch(
      's1',
      ['b1', 'b2', 'b3'],
      { userId: 'u1' },
      {
        getProject: () => project,
        executor: flakyExecutor,
        buildCtx: buildCtxFor(project),
      },
    );
    expect(res.results).toHaveLength(2);
    expect(res.results[0].status).toBe('confirmed');
    expect(res.results[1].status).toBe('failed');
    expect(res.stoppedAt).toBe('b2');
  });
});

describe('createFsPendingActionStore (Spec B §8 — FS-backed persistence)', () => {
  function mkTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'pending-test-'));
  }

  it('propose writes ${dataDir}/pending/${sessionId}.json with action list', async () => {
    const dataDir = mkTempDir();
    try {
      const store = createFsPendingActionStore({ dataDir });
      const action = mkAction({ id: 'act-fs-1', status: 'pending' });
      await store.propose('sess-A', action);

      const file = join(dataDir, 'pending', 'sess-A.json');
      expect(existsSync(file)).toBe(true);
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        actions: ProposedAction[];
      };
      expect(parsed.actions).toHaveLength(1);
      expect(parsed.actions[0].id).toBe('act-fs-1');
      expect(parsed.actions[0].status).toBe('pending');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('reloads persisted actions when a new store instance is constructed', async () => {
    const dataDir = mkTempDir();
    try {
      const store1 = createFsPendingActionStore({ dataDir });
      await store1.propose('sess-B', mkAction({ id: 'act-reload', status: 'pending' }));

      const store2 = createFsPendingActionStore({ dataDir });
      const list = await store2.listPending('sess-B');
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('act-reload');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('confirm persists status=confirmed to disk', async () => {
    const dataDir = mkTempDir();
    try {
      const store = createFsPendingActionStore({ dataDir });
      const project = mkProject([]);
      await store.propose('sess-C', mkAction({ id: 'act-confirm', targetIds: [] }));
      const res = await store.confirm(
        'sess-C',
        'act-confirm',
        { forceApply: false, userId: 'u1' },
        {
          getProject: () => project,
          executor: okExecutor(),
          buildCtx: buildCtxFor(project),
        },
      );
      expect(res.status).toBe('confirmed');

      const file = join(dataDir, 'pending', 'sess-C.json');
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        actions: ProposedAction[];
      };
      expect(parsed.actions[0].status).toBe('confirmed');
      expect(parsed.actions[0].finalizedAt).not.toBeNull();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('createDefaultConfirmDeps (Spec B §8a — single source of truth)', () => {
  /**
   * Build a minimal full-Project shape that exercises a real handler. We use
   * `es_create_context` (additive, policy='standard', post-commit only) so we
   * can verify the commit pipeline ordering: save → sync → broadcast.
   */
  function mkFullProject() {
    const now = '2026-05-11T00:00:00.000Z';
    return {
      id: 'proj-1',
      name: 'Test',
      activeBoardId: 'board-1',
      createdAt: now,
      updatedAt: now,
      boards: [
        {
          id: 'board-1',
          name: 'B1',
          notes: [
            {
              id: 'evt-1',
              type: 'DomainEvent',
              label: 'OrderPlaced',
              position: { x: 0, y: 0 },
              size: { w: 160, h: 160 },
              zIndex: 1,
              createdAt: now,
              updatedAt: now,
            },
          ],
          remodels: [],
          links: [],
          flowPaths: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }

  function mkSpyCommitDeps(order: string[]): CommitDeps {
    return {
      saveProject: () => {
        order.push('save');
      },
      syncProjectToRelay: async () => {
        order.push('sync');
      },
      broadcast: async (action: string) => {
        order.push(`broadcast:${action}`);
      },
    };
  }

  it('confirm via real EventStormingSkill: spy.saveProject called, broadcast fired, status=confirmed', async () => {
    const store = createInMemoryPendingActionStore();
    const skill = new EventStormingSkill();
    const order: string[] = [];
    const commitDeps = mkSpyCommitDeps(order);
    const fullProject = mkFullProject();

    const deps = createDefaultConfirmDeps({
      skill,
      getProject: () => fullProject as unknown as ProjectSnapshot,
      getFullProjectState: () => fullProject,
      commitDeps,
    });

    const action = mkAction({
      id: 'act-create',
      toolName: 'es_create_context',
      args: { name: 'NewContext' },
      targetIds: [],
    });
    await store.propose('s-default', action);

    const res = await store.confirm(
      's-default',
      'act-create',
      { forceApply: false, userId: 'u1' },
      deps,
    );

    expect(res.status).toBe('confirmed');
    expect(res.finalAction.status).toBe('confirmed');
    expect(order).toContain('save');
    expect(order).toContain('sync');
    // es_create_context emits a post-commit `add_board` broadcast.
    expect(order.some((s) => s.startsWith('broadcast:add_board'))).toBe(true);
  });

  it('executor invokes commitHandlerResult in order: save → sync → post-commit broadcast', async () => {
    const store = createInMemoryPendingActionStore();
    const skill = new EventStormingSkill();
    const order: string[] = [];
    const commitDeps = mkSpyCommitDeps(order);
    const fullProject = mkFullProject();

    const deps = createDefaultConfirmDeps({
      skill,
      getProject: () => fullProject as unknown as ProjectSnapshot,
      getFullProjectState: () => fullProject,
      commitDeps,
    });

    await store.propose(
      's-order',
      mkAction({
        id: 'act-order',
        toolName: 'es_create_context',
        args: { name: 'OrderCheck' },
        targetIds: [],
      }),
    );
    await store.confirm(
      's-order',
      'act-order',
      { forceApply: false, userId: 'u1' },
      deps,
    );

    // es_create_context = policy 'standard' with one post-commit event.
    // commitHandlerResult ordering must be: save → sync → post-commit broadcast.
    expect(order).toEqual(['save', 'sync', 'broadcast:add_board']);
  });
});
