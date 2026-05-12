import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Mutex } from 'async-mutex';
import type { ProposedAction, ProposedActionStatus, ErrorEnvelope } from '../types.js';
import type { ToolHandlerCtx, ToolHandlerResult } from '../tools/handlers.js';
import { commitHandlerResult, type CommitDeps } from '../tools/mcpAdapter.js';
import { TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';

/** SSE action name broadcast to FE on every pending lifecycle transition (B4 + N7). */
export const ACTION_UPDATE_SSE_CHANNEL = 'coach_action_update';

export interface ConfirmOpts {
  forceApply: boolean;
  userId: string;
}

export interface ConfirmResult {
  status: 'confirmed' | 'stale' | 'failed';
  finalAction: ProposedAction;
  errorEnvelope?: ErrorEnvelope;
}

export interface ConfirmBatchOpts {
  userId: string;
}

export interface ConfirmBatchResult {
  results: Array<{
    actionId: string;
    status: 'confirmed' | 'stale' | 'failed';
    errorEnvelope?: ErrorEnvelope;
  }>;
  stoppedAt?: string; // 第一個 fail 的 actionId
}

export interface ActionUpdatePayload {
  sessionId: string;
  actionId: string;
  status: ProposedActionStatus;
  delta?: Partial<ProposedAction>;
}

export type ActionUpdateListener = (payload: ActionUpdatePayload) => void;
export type Unsubscribe = () => void;

/**
 * Snapshot subset of project state needed for confirm-time CAS reverify.
 * Step 2 will adapt the real Project type to this shape; Step 1 tests build it inline.
 */
export interface ProjectSnapshot {
  id?: string;
  activeBoardId: string;
  updatedAt: string;
  boards: Array<{
    id: string;
    notes: Array<{
      id: string;
      type: string;
      label: string;
      commandId?: string;
      entityId?: string;
      eventProperties?: unknown[];
      dtoFields?: unknown[];
      invariants?: unknown[];
      preConditions?: unknown[];
      postConditions?: unknown[];
      // gemini-review-fix: include semantic Command/DomainEvent fields so CAS hash
      // catches information schema and behavior text changes too
      information?: unknown[];
      behavior?: string;
    }>;
    remodels: Array<{ id: string }>;
  }>;
}

/**
 * Caller-supplied executor that runs the handler and (on success) commits via
 * `commitHandlerResult`. Step 2 wires this to the real adapter helper; Step 1
 * tests pass an in-memory executor.
 */
export interface PendingActionExecutor {
  (action: ProposedAction, ctx: ToolHandlerCtx): Promise<ToolHandlerResult>;
}

/**
 * Deps the store needs to actually run a confirm transaction (Step 2 wires
 * the real ones; Step 1 tests pass mocks).
 */
export interface ConfirmTransactionDeps {
  /** Snapshot of latest project state at confirm time (used for CAS reverify). */
  getProject: () => ProjectSnapshot;
  /** Executes the action's handler + commits — Step 1 tests pass an in-memory mock. */
  executor: PendingActionExecutor;
  /** Used to derive the ToolHandlerCtx passed to the executor. */
  buildCtx: () => ToolHandlerCtx;
}

export interface PendingActionStore {
  propose(sessionId: string, action: ProposedAction): Promise<void>;
  confirm(
    sessionId: string,
    actionId: string,
    opts: ConfirmOpts,
    deps: ConfirmTransactionDeps,
  ): Promise<ConfirmResult>;
  reject(sessionId: string, actionId: string, reason: string | null): Promise<void>;
  confirmBatch(
    sessionId: string,
    actionIds: string[],
    opts: ConfirmBatchOpts,
    deps: ConfirmTransactionDeps,
  ): Promise<ConfirmBatchResult>;
  listPending(sessionId: string): Promise<ProposedAction[]>;
  getAction(sessionId: string, actionId: string): Promise<ProposedAction | null>;
  subscribe(sessionId: string, listener: ActionUpdateListener): Unsubscribe;
}

/** Stable subset of an entity used for hash computation. */
function stableSubset(note: ProjectSnapshot['boards'][number]['notes'][number]) {
  return {
    type: note.type,
    label: note.label,
    commandId: note.commandId ?? null,
    entityId: note.entityId ?? null,
    eventProperties: note.eventProperties ?? [],
    dtoFields: note.dtoFields ?? [],
    invariants: note.invariants ?? [],
    // Spec v17: condition arrays affect Command identity; CAS reverify must hash them
    preConditions: note.preConditions ?? [],
    postConditions: note.postConditions ?? [],
    // gemini-review-fix: information schema and behavior text are also semantic
    information: note.information ?? [],
    behavior: note.behavior ?? '',
  };
}

/**
 * TargetEntityHash — 排除 position/zIndex/updatedAt，避免拖動誤判 stale (B1).
 * targetIds=[] → '' (空 hash，confirm 不檢查).
 */
export function computeTargetEntityHash(
  projectState: ProjectSnapshot,
  targetIds: string[],
): string {
  if (targetIds.length === 0) return '';
  const activeBoard = projectState.boards.find((b) => b.id === projectState.activeBoardId);
  if (!activeBoard) return '';
  const subsets = targetIds.map((id) => {
    const note = activeBoard.notes.find((n) => n.id === id);
    return note ? stableSubset(note) : null;
  });
  const json = JSON.stringify(subsets);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// ─── Core store factory shared by in-memory + FS-backed variants ───────────

/**
 * Data layer abstraction. `load(sessionId)` returns the persisted action list
 * (or `null` if the session has not been touched yet); `save(sessionId, list)`
 * persists the list after every mutation. Both are called inside the session
 * mutex, so they can be synchronous (the in-memory variant uses no-op load/save).
 */
interface PendingActionDataLayer {
  load: (sessionId: string) => ProposedAction[] | null;
  save: (sessionId: string, list: ProposedAction[]) => void;
}

function createCoreStore(data: PendingActionDataLayer): PendingActionStore {
  // In-memory cache. Each session's list is loaded from `data.load` on first
  // access, then kept in sync via `data.save` after each mutation.
  const bySession = new Map<string, ProposedAction[]>();
  const listeners = new Map<string, Set<ActionUpdateListener>>();
  const sessionMutexes = new Map<string, Mutex>();

  const mutexFor = (sessionId: string) => {
    let m = sessionMutexes.get(sessionId);
    if (!m) {
      m = new Mutex();
      sessionMutexes.set(sessionId, m);
    }
    return m;
  };

  const broadcast = (payload: ActionUpdatePayload) => {
    const set = listeners.get(payload.sessionId);
    if (!set) return;
    for (const l of set) {
      try {
        l(payload);
      } catch {
        /* listener errors must not break the store */
      }
    }
  };

  /** Lazy-loads the per-session list, falling back to data.load() on first miss. */
  const ensureList = (sessionId: string): ProposedAction[] => {
    let list = bySession.get(sessionId);
    if (!list) {
      const loaded = data.load(sessionId);
      list = loaded ?? [];
      bySession.set(sessionId, list);
    }
    return list;
  };

  const persist = (sessionId: string, list: ProposedAction[]) => {
    data.save(sessionId, list);
  };

  const findIdx = (
    sessionId: string,
    actionId: string,
  ): { list: ProposedAction[]; idx: number } | null => {
    const list = ensureList(sessionId);
    const idx = list.findIndex((a) => a.id === actionId);
    return idx >= 0 ? { list, idx } : null;
  };

  const store: PendingActionStore = {
    async propose(sessionId, action) {
      await mutexFor(sessionId).runExclusive(() => {
        const list = ensureList(sessionId);
        list.push(action);
        persist(sessionId, list);
        broadcast({ sessionId, actionId: action.id, status: action.status });
      });
    },

    async confirm(sessionId, actionId, opts, deps) {
      return mutexFor(sessionId).runExclusive(async () => {
        const found = findIdx(sessionId, actionId);
        if (!found) {
          throw Object.assign(
            new Error(`Action ${actionId} not found in session ${sessionId}.`),
            { code: 'PRECONDITION_FAILED' },
          );
        }
        const action = found.list[found.idx];
        const validFrom =
          action.status === 'pending' || (action.status === 'stale' && opts.forceApply);
        if (!validFrom) {
          throw Object.assign(
            new Error(`Action ${actionId} already finalized (status: ${action.status}).`),
            { code: 'PRECONDITION_FAILED' },
          );
        }

        // Transition: → confirming
        action.status = 'confirming';
        persist(sessionId, found.list);
        broadcast({ sessionId, actionId, status: 'confirming' });

        // CAS reverify
        const project = deps.getProject();
        const currentHash = computeTargetEntityHash(project, action.targetIds);

        if (action.targetIds.length > 0 && currentHash !== action.baseHash && !opts.forceApply) {
          action.status = 'stale';
          persist(sessionId, found.list);
          broadcast({ sessionId, actionId, status: 'stale' });
          return {
            status: 'stale' as const,
            finalAction: action,
          };
        }

        // Force-apply 額外 reverify: 每個 target 必須存在 (D24)
        if (opts.forceApply && action.targetIds.length > 0) {
          const activeBoard = project.boards.find((b) => b.id === project.activeBoardId);
          const missing = action.targetIds.find(
            (id) =>
              !activeBoard?.notes.some((n) => n.id === id) &&
              !activeBoard?.remodels.some((r) => r.id === id),
          );
          if (missing) {
            const envelope: ErrorEnvelope = {
              code: 'NOT_FOUND',
              message: `Target entity ${missing} not found.`,
            };
            action.status = 'failed';
            action.errorEnvelope = envelope;
            action.finalizedAt = new Date().toISOString();
            action.forceApply = true;
            persist(sessionId, found.list);
            broadcast({
              sessionId,
              actionId,
              status: 'failed',
              delta: { errorEnvelope: envelope },
            });
            return {
              status: 'failed' as const,
              finalAction: action,
              errorEnvelope: envelope,
            };
          }
        }

        // Execute via injected executor
        action.forceApply = opts.forceApply;
        let result: ToolHandlerResult;
        try {
          result = await deps.executor(action, deps.buildCtx());
        } catch (err) {
          const envelope: ErrorEnvelope = {
            code: 'TOOL_THREW',
            message: (err as Error).message ?? 'Tool threw',
          };
          action.status = 'failed';
          action.errorEnvelope = envelope;
          action.finalizedAt = new Date().toISOString();
          persist(sessionId, found.list);
          broadcast({
            sessionId,
            actionId,
            status: 'failed',
            delta: { errorEnvelope: envelope },
          });
          return {
            status: 'failed' as const,
            finalAction: action,
            errorEnvelope: envelope,
          };
        }

        if (!result.ok) {
          const handlerErr =
            result.error ?? {
              code: 'PRECONDITION_FAILED' as const,
              message: 'Handler failed',
            };
          const envelope: ErrorEnvelope = {
            code: handlerErr.code,
            message: handlerErr.message,
          };
          action.status = 'failed';
          action.errorEnvelope = envelope;
          action.finalizedAt = new Date().toISOString();
          persist(sessionId, found.list);
          broadcast({
            sessionId,
            actionId,
            status: 'failed',
            delta: { errorEnvelope: envelope },
          });
          return {
            status: 'failed' as const,
            finalAction: action,
            errorEnvelope: envelope,
          };
        }

        action.status = 'confirmed';
        action.finalizedAt = new Date().toISOString();
        persist(sessionId, found.list);
        broadcast({
          sessionId,
          actionId,
          status: 'confirmed',
          delta: { finalizedAt: action.finalizedAt },
        });
        return { status: 'confirmed' as const, finalAction: action };
      });
    },

    async reject(sessionId, actionId, reason) {
      await mutexFor(sessionId).runExclusive(() => {
        const found = findIdx(sessionId, actionId);
        if (!found) {
          throw Object.assign(
            new Error(`Action ${actionId} not found in session ${sessionId}.`),
            { code: 'PRECONDITION_FAILED' },
          );
        }
        const action = found.list[found.idx];
        if (action.status !== 'pending' && action.status !== 'stale') {
          throw Object.assign(
            new Error(`Action ${actionId} already finalized (status: ${action.status}).`),
            { code: 'PRECONDITION_FAILED' },
          );
        }
        action.status = 'rejected';
        action.rejectReason = reason;
        action.finalizedAt = new Date().toISOString();
        persist(sessionId, found.list);
        broadcast({
          sessionId,
          actionId,
          status: 'rejected',
          delta: { rejectReason: reason },
        });
      });
    },

    async confirmBatch(sessionId, actionIds, opts, deps) {
      const results: ConfirmBatchResult['results'] = [];
      let stoppedAt: string | undefined;
      for (const id of actionIds) {
        const res = await store.confirm(
          sessionId,
          id,
          { forceApply: false, userId: opts.userId },
          deps,
        );
        results.push(
          res.errorEnvelope
            ? { actionId: id, status: res.status, errorEnvelope: res.errorEnvelope }
            : { actionId: id, status: res.status },
        );
        if (res.status !== 'confirmed') {
          stoppedAt = id;
          break;
        }
      }
      return stoppedAt ? { results, stoppedAt } : { results };
    },

    async listPending(sessionId) {
      // Run under mutex to make sure any pending mutation has flushed, and
      // to trigger initial load if this is the first access.
      return mutexFor(sessionId).runExclusive(() => {
        const list = ensureList(sessionId);
        return list.filter(
          (a) => a.status === 'pending' || a.status === 'confirming' || a.status === 'stale',
        );
      });
    },

    async getAction(sessionId, actionId) {
      return mutexFor(sessionId).runExclusive(() => {
        const list = ensureList(sessionId);
        return list.find((a) => a.id === actionId) ?? null;
      });
    },

    subscribe(sessionId, listener) {
      let set = listeners.get(sessionId);
      if (!set) {
        set = new Set();
        listeners.set(sessionId, set);
      }
      set.add(listener);
      return () => {
        const current = listeners.get(sessionId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(sessionId);
      };
    },
  };

  return store;
}

/**
 * In-memory store — used by Step 1 tests + ephemeral callers. State lives
 * only in the closure; on process exit everything is lost. Use
 * `createFsPendingActionStore` for production.
 */
export function createInMemoryPendingActionStore(): PendingActionStore {
  return createCoreStore({
    load: () => null,
    save: () => {
      /* no-op */
    },
  });
}

// ─── FS-backed variant (Spec B §8) ──────────────────────────────────────────

export interface FsPendingActionStoreOpts {
  /** Root directory under which `pending/<sessionId>.json` files are written. */
  dataDir: string;
}

interface PersistedFile {
  actions: ProposedAction[];
}

function pendingFilePath(dataDir: string, sessionId: string): string {
  return join(dataDir, 'pending', `${sessionId}.json`);
}

/**
 * FS-backed `PendingActionStore` — per-session JSON file at
 * `${dataDir}/pending/${sessionId}.json`. Save errors are fail-soft (warn but
 * don't crash); missing-file on load is treated as an empty session.
 */
export function createFsPendingActionStore(
  opts: FsPendingActionStoreOpts,
): PendingActionStore {
  const { dataDir } = opts;

  const load = (sessionId: string): ProposedAction[] | null => {
    const file = pendingFilePath(dataDir, sessionId);
    if (!existsSync(file)) return null;
    try {
      const raw = readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedFile;
      return Array.isArray(parsed.actions) ? parsed.actions : [];
    } catch (err) {
      // Corrupted file → fail-soft to empty session and log.
      // eslint-disable-next-line no-console
      console.warn(
        `[pendingActions] failed to read ${file}: ${(err as Error).message}; starting empty.`,
      );
      return [];
    }
  };

  const save = (sessionId: string, list: ProposedAction[]): void => {
    const file = pendingFilePath(dataDir, sessionId);
    try {
      mkdirSync(dirname(file), { recursive: true });
      const payload: PersistedFile = { actions: list };
      writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pendingActions] failed to write ${file}: ${(err as Error).message}; continuing.`,
      );
    }
  };

  return createCoreStore({ load, save });
}

// ─── Default ConfirmTransactionDeps factory ────────────────────────────────

export interface DefaultConfirmDepsOpts {
  skill: {
    execute: (toolName: string, args: unknown, ctx: ToolHandlerCtx) => ToolHandlerResult;
  };
  /** Snapshot getter used for CAS reverify (subset of Project). */
  getProject: () => ProjectSnapshot;
  /**
   * Full Project getter — used as `ctx.projectState` for the handler. Distinct
   * from `getProject` because handlers need the full Project type (with all
   * fields), whereas CAS reverify only needs the snapshot subset.
   */
  getFullProjectState: () => unknown;
  commitDeps: CommitDeps;
  now?: () => string;
}

/**
 * Build a production-ready `ConfirmTransactionDeps` whose `executor` runs the
 * skill's handler then commits via `commitHandlerResult` — the single source
 * of truth for the commit pipeline (audit HIGH-1).
 */
export function createDefaultConfirmDeps(opts: DefaultConfirmDepsOpts): ConfirmTransactionDeps {
  return {
    getProject: opts.getProject,
    buildCtx: () => ({
      projectState: opts.getFullProjectState() as never,
      now: opts.now ?? (() => new Date().toISOString()),
    }),
    executor: async (action, ctx) => {
      const result = opts.skill.execute(action.toolName, action.args, ctx);
      if (!result.ok) return result;
      const def = TOOL_DEFINITIONS.find((d) => d.name === action.toolName);
      if (!def) {
        return {
          ok: false,
          resultJson: null,
          events: [],
          error: {
            code: 'PRECONDITION_FAILED',
            message: `Unknown tool ${action.toolName} in TOOL_DEFINITIONS.`,
          },
        };
      }
      await commitHandlerResult(action.toolName, result, def.policy, opts.commitDeps);
      return result;
    },
  };
}
