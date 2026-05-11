import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { nanoid } from 'nanoid';
import type { CoachSessionStore } from './sessionStore.js';
import type { LLMAdapter } from './llm/adapter.js';
import type { BoardSnapshot, CoachMessage } from './types.js';
import { snapshotToMarkdown } from './snapshotBuilder.js';
import { buildSystemPrompt } from './prompts/system.js';
import { runAgentTurn, type OrchestratorDeps } from './agent/orchestrator.js';
import {
  createDefaultConfirmDeps,
  type PendingActionStore,
  type ProjectSnapshot,
} from './agent/pendingActions.js';
import type { EventStormingSkill } from './skills/eventStormingSkill.js';
import type { AuditLog } from './audit/auditLog.js';
import type { CommitDeps } from './tools/mcpAdapter.js';

export interface CoachRouterDeps {
  sessionStore: CoachSessionStore;
  llm: LLMAdapter;
  baseDddGuide: string;
  userDraft: string | null;
  /** Spec B: function-calling agent loop. */
  skill: EventStormingSkill;
  pendingStore: PendingActionStore;
  auditLog: AuditLog;
  /** Snapshot used for CAS reverify (subset of Project). */
  loadProject: () => ProjectSnapshot;
  /** Full project state — fed to handler ctx during confirm. */
  getFullProjectState: () => unknown;
  commitDeps: CommitDeps;
  toolVersion: string;
  /**
   * Optional hook the host wires to bridge `pendingStore.subscribe(sessionId, …)`
   * into a global SSE broadcast. Router calls this at the top of every
   * session-touching handler so cross-cutting hooks fire lazily.
   */
  subscribeIfNeeded?: (sessionId: string) => void;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getCoachUserId(req: Request): string {
  const id = req.headers['x-coach-user-id'];
  if (typeof id !== 'string' || !id) {
    throw new HttpError(401, 'X-Coach-User-Id header required');
  }
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapPreconditionToHttp(err: unknown, next: NextFunction): void {
  if (
    err && typeof err === 'object' && 'code' in (err as object)
    && (err as { code?: string }).code === 'PRECONDITION_FAILED'
  ) {
    next(new HttpError(409, (err as Error).message));
    return;
  }
  next(err as Error);
}

interface PostMessageBody {
  sessionId?: string | null;
  clientMessageId?: string;
  text?: string;
  attachSnapshot?: boolean;
  boardSnapshot?: BoardSnapshot | null;
  model?: string;       // optional per-call override；不在 adapter.availableModels 裡的會 fallback default
}

export function createCoachRouter(deps: CoachRouterDeps): Router {
  const router = express.Router();

  router.get('/models', (_req: Request, res: Response) => {
    res.json({
      defaultModel: deps.llm.modelName,
      availableModels: deps.llm.availableModels,
    });
  });

  router.post('/message', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const body = (req.body ?? {}) as PostMessageBody;

      const { clientMessageId, text } = body;
      if (typeof clientMessageId !== 'string' || !clientMessageId) {
        throw new HttpError(400, 'clientMessageId required');
      }
      if (typeof text !== 'string' || !text.trim()) {
        throw new HttpError(400, 'text required');
      }
      const attachSnapshot = body.attachSnapshot !== false;
      const snapshot = body.boardSnapshot ?? null;
      const modelOverride = typeof body.model === 'string' ? body.model : undefined;

      let session = body.sessionId
        ? await deps.sessionStore.getSession(userId, body.sessionId)
        : null;
      if (body.sessionId && !session) {
        // 不洩漏 ownership — 統一 404
        throw new HttpError(404, 'session not found');
      }
      if (!session) {
        session = await deps.sessionStore.createSession(userId);
      }
      deps.subscribeIfNeeded?.(session.id);

      const userMsg: CoachMessage = {
        id: nanoid(),
        clientMessageId,
        role: 'user',
        content: text,
        metadata: {
          boardSnapshotHash: snapshot?.hash,
          activeBoardId: snapshot?.activeBoardId,
          attachedSnapshot: attachSnapshot,
        },
        createdAt: nowIso(),
      };

      const orchestratorDeps: OrchestratorDeps = {
        llm: deps.llm,
        skill: deps.skill,
        pendingStore: deps.pendingStore,
        auditLog: deps.auditLog,
        loadProject: deps.loadProject,
        buildSystemPrompt: ({ attachSnapshot: a, snapshot: s }) =>
          buildSystemPrompt({
            baseDddGuide: deps.baseDddGuide,
            userDraft: deps.userDraft,
            attachSnapshot: a,
            snapshotMarkdown: a && s ? snapshotToMarkdown(s) : null,
          }),
        toolVersion: deps.toolVersion,
      };

      let assistantMsg: CoachMessage;
      try {
        const turn = await runAgentTurn(
          {
            sessionId: session.id,
            userId,
            userMessage: text,
            attachSnapshot,
            boardSnapshot: snapshot,
            modelOverride,
          },
          orchestratorDeps,
        );
        assistantMsg = turn.assistantMessage;
        // Decorate with snapshot hash so FE can pair message with snapshot used.
        if (snapshot?.hash) {
          assistantMsg = {
            ...assistantMsg,
            metadata: { ...assistantMsg.metadata, boardSnapshotHash: snapshot.hash },
          };
        }
      } catch (err) {
        await deps.sessionStore.appendMessages(userId, session.id, [userMsg]).catch(() => undefined);
        const errMsg = err instanceof Error ? err.message : 'LLM call failed';
        throw new HttpError(502, errMsg);
      }

      await deps.sessionStore.appendMessages(userId, session.id, [userMsg, assistantMsg]);

      res.json({
        sessionId: session.id,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const metas = await deps.sessionStore.listSessions(userId);
      res.json(metas);
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const session = await deps.sessionStore.getSession(userId, req.params.id);
      if (!session) throw new HttpError(404, 'session not found');
      res.json({ id: session.id, messages: session.messages });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sessions/:id/clear', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      await deps.sessionStore.archiveSession(userId, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ─── Pending action lifecycle (Spec B Step 2b) ────────────────────────────

  router.post('/actions/:actionId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const { actionId } = req.params;
      const body = (req.body ?? {}) as { sessionId?: string; forceApply?: boolean };
      if (typeof body.sessionId !== 'string' || !body.sessionId) {
        throw new HttpError(400, 'sessionId required');
      }
      const session = await deps.sessionStore.getSession(userId, body.sessionId);
      if (!session) throw new HttpError(404, 'session not found');
      deps.subscribeIfNeeded?.(session.id);

      const forceApply = body.forceApply === true;

      const confirmDeps = createDefaultConfirmDeps({
        skill: deps.skill,
        getProject: deps.loadProject,
        getFullProjectState: deps.getFullProjectState,
        commitDeps: deps.commitDeps,
      });

      let result;
      try {
        result = await deps.pendingStore.confirm(
          body.sessionId,
          actionId,
          { forceApply, userId },
          confirmDeps,
        );
      } catch (err) {
        return mapPreconditionToHttp(err, next);
      }

      const eventType = forceApply
        ? 'force_apply'
        : result.status === 'confirmed'
          ? 'confirm'
          : result.status === 'stale'
            ? 'reject'
            : 'failed';

      await deps.auditLog.append({
        schemaVersion: 1,
        toolVersion: deps.toolVersion,
        eventType,
        timestamp: nowIso(),
        sessionId: body.sessionId,
        messageId: null,
        actionId,
        toolName: result.finalAction.toolName,
        args: result.finalAction.args,
        status: result.status,
        baseHash: result.finalAction.baseHash,
        baseProjectVersion: result.finalAction.baseProjectVersion,
        forceApply,
        errorEnvelope: result.errorEnvelope ?? null,
        resultJson: null,
      });

      if (result.status === 'stale') {
        res.status(409).json(result);
      } else {
        res.status(200).json(result);
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/actions/confirm-batch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const body = (req.body ?? {}) as { sessionId?: string; actionIds?: string[] };
      if (typeof body.sessionId !== 'string' || !body.sessionId) {
        throw new HttpError(400, 'sessionId required');
      }
      if (!Array.isArray(body.actionIds) || body.actionIds.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, 'actionIds must be string[]');
      }
      const session = await deps.sessionStore.getSession(userId, body.sessionId);
      if (!session) throw new HttpError(404, 'session not found');
      deps.subscribeIfNeeded?.(session.id);

      // Pre-validate all actions are 'pending' (audit MED-2). Stale rejected
      // up-front with a dedicated message so FE can prompt force-apply.
      for (const id of body.actionIds) {
        const a = await deps.pendingStore.getAction(body.sessionId, id);
        if (!a) {
          throw new HttpError(400, `Action ${id} not found.`);
        }
        if (a.status === 'stale') {
          throw new HttpError(400, 'Stale actions cannot be batch-applied; force-apply individually.');
        }
        if (a.status !== 'pending') {
          throw new HttpError(400, `Action ${id} already finalized (status: ${a.status}).`);
        }
      }

      const confirmDeps = createDefaultConfirmDeps({
        skill: deps.skill,
        getProject: deps.loadProject,
        getFullProjectState: deps.getFullProjectState,
        commitDeps: deps.commitDeps,
      });

      try {
        const result = await deps.pendingStore.confirmBatch(
          body.sessionId,
          body.actionIds,
          { userId },
          confirmDeps,
        );
        res.status(200).json(result);
      } catch (err) {
        return mapPreconditionToHttp(err, next);
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/actions/:actionId/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const { actionId } = req.params;
      const body = (req.body ?? {}) as { sessionId?: string; reason?: string | null };
      if (typeof body.sessionId !== 'string' || !body.sessionId) {
        throw new HttpError(400, 'sessionId required');
      }
      const session = await deps.sessionStore.getSession(userId, body.sessionId);
      if (!session) throw new HttpError(404, 'session not found');
      deps.subscribeIfNeeded?.(session.id);

      const reason = typeof body.reason === 'string' ? body.reason : null;
      try {
        await deps.pendingStore.reject(body.sessionId, actionId, reason);
      } catch (err) {
        return mapPreconditionToHttp(err, next);
      }

      await deps.auditLog.append({
        schemaVersion: 1,
        toolVersion: deps.toolVersion,
        eventType: 'reject',
        timestamp: nowIso(),
        sessionId: body.sessionId,
        messageId: null,
        actionId,
        toolName: '',
        args: {},
        status: 'rejected',
        baseHash: '',
        baseProjectVersion: deps.loadProject().updatedAt,
        forceApply: null,
        errorEnvelope: null,
        resultJson: null,
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions/:sessionId/pending', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getCoachUserId(req);
      const { sessionId } = req.params;
      const session = await deps.sessionStore.getSession(userId, sessionId);
      if (!session) throw new HttpError(404, 'session not found');
      deps.subscribeIfNeeded?.(sessionId);
      const pending = await deps.pendingStore.listPending(sessionId);
      res.status(200).json(pending);
    } catch (err) {
      next(err);
    }
  });

  // error middleware (router-scoped)
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(500).json({ error: msg });
  });

  return router;
}

/**
 * 當 GEMINI_API_KEY 缺時 mount 此降級 router；所有 method 一致回 503。
 */
export function createDegradedCoachRouter(): Router {
  const router = express.Router();
  const respond = (_req: Request, res: Response) => {
    res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  };
  router.post('/message', respond);
  router.get('/sessions', respond);
  router.get('/sessions/:id', respond);
  router.post('/sessions/:id/clear', respond);
  router.get('/models', respond);
  // Pending lifecycle (Spec B Step 2b)
  router.post('/actions/:actionId/confirm', respond);
  router.post('/actions/confirm-batch', respond);
  router.post('/actions/:actionId/reject', respond);
  router.get('/sessions/:sessionId/pending', respond);
  return router;
}
