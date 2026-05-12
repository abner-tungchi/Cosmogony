import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type { CoachMessage, ProposedAction, ProposedActionStatus } from '../types/coach';
import type { BoardSnapshot } from '../utils/coachSnapshot';
import { buildBoardSnapshot } from '../utils/coachSnapshot';
import type { SessionMeta } from '../utils/coachApi';
import {
  postMessage,
  getSession,
  listSessions as apiListSessions,
  clearSession as apiClearSession,
  getModels as apiGetModels,
  confirmAction,
  rejectAction as apiRejectAction,
  confirmBatchActions,
  listPendingActions,
  CoachApiError,
} from '../utils/coachApi';
import { useBoardStore } from './boardStore';
import { useUIStore } from './uiStore';

const ATTACH_KEY = 'es-coach-attach-snapshot';
const SESSION_ID_KEY = 'es-coach-current-session-id';
const MODEL_KEY = 'es-coach-model';

function readStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

function readAttachToggle(): boolean {
  try {
    const raw = localStorage.getItem(ATTACH_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

interface CoachState {
  panelOpen: boolean;
  attachSnapshot: boolean;
  currentSessionId: string | null;
  messages: CoachMessage[];
  isStreaming: boolean;
  error: string | null;
  abortController: AbortController | null;
  loadingPromise: Promise<void> | null;
  loaded: boolean;
  sessionList: SessionMeta[];
  sessionListLoading: boolean;
  /** null = 用 server default；string = 使用者明確指定的 model（必須在 availableModels 內） */
  selectedModel: string | null;
  defaultModel: string | null;
  availableModels: string[];
  modelsLoaded: boolean;

  // Spec B: pending actions normalized cache (derived from messages[].metadata.proposedActions[])
  pendingActionsById: Record<string, ProposedAction>;
  pendingActionIds: string[];

  setPanelOpen: (open: boolean) => void;
  setAttachSnapshot: (on: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
  loadCurrentSession: () => Promise<void>;
  startNewSession: () => void;
  archiveCurrentSession: () => Promise<void>;
  switchToSession: (sessionId: string) => Promise<void>;
  loadSessionList: () => Promise<void>;
  loadAvailableModels: () => Promise<void>;
  setSelectedModel: (model: string | null) => void;
  cancel: () => void;

  // Spec B: action lifecycle
  applyAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string, reason: string | null) => Promise<void>;
  forceApplyAction: (actionId: string) => Promise<void>;
  applyAllPending: () => Promise<void>;
  rejectAllPending: () => Promise<void>;
  applyActionUpdate: (payload: {
    sessionId: string;
    actionId: string;
    status: ProposedActionStatus;
    delta?: Partial<ProposedAction>;
  }) => void;
  reconcilePending: () => Promise<void>;
}

/**
 * Rebuild the pending-action normalized index from messages[].
 * Pending UI surfaces show only actions in 'pending' / 'confirming' / 'stale'
 * states, sorted by createdAt ascending (FIFO).
 */
function rebuildPendingIndex(messages: CoachMessage[]): {
  byId: Record<string, ProposedAction>;
  ids: string[];
} {
  const byId: Record<string, ProposedAction> = {};
  const all: ProposedAction[] = [];
  for (const m of messages) {
    const list = m.metadata?.proposedActions;
    if (list) {
      for (const a of list) {
        byId[a.id] = a;
        all.push(a);
      }
    }
  }
  const ids = all
    .filter((a) => a.status === 'pending' || a.status === 'confirming' || a.status === 'stale')
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    .map((a) => a.id);
  return { byId, ids };
}

export const useCoachStore = create<CoachState>()(
  immer((set, get) => ({
    panelOpen: true,
    attachSnapshot: readAttachToggle(),
    currentSessionId: typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_ID_KEY) : null,
    messages: [],
    isStreaming: false,
    error: null,
    abortController: null,
    loadingPromise: null,
    loaded: false,
    sessionList: [],
    sessionListLoading: false,
    selectedModel: readStoredModel(),
    defaultModel: null,
    availableModels: [],
    modelsLoaded: false,
    pendingActionsById: {},
    pendingActionIds: [],

    setPanelOpen: (open) =>
      set((s) => {
        s.panelOpen = open;
      }),

    setAttachSnapshot: (on) => {
      try {
        localStorage.setItem(ATTACH_KEY, on ? '1' : '0');
      } catch {
        // ignore — privacy mode
      }
      set((s) => {
        s.attachSnapshot = on;
      });
    },

    cancel: () => {
      const ac = get().abortController;
      if (ac) ac.abort();
    },

    sendMessage: async (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().isStreaming) return;

      const clientMessageId = nanoid();
      const optimisticUser: CoachMessage = {
        id: clientMessageId,
        clientMessageId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const ac = new AbortController();
      set((s) => {
        s.messages.push(optimisticUser);
        s.isStreaming = true;
        s.error = null;
        s.abortController = ac;
      });

      let snapshot: BoardSnapshot | null = null;
      const attach = get().attachSnapshot;
      if (attach) {
        try {
          const project = useBoardStore.getState().project;
          const activeBoardId = useUIStore.getState().activeBoardId;
          if (project && activeBoardId) {
            snapshot = buildBoardSnapshot(project, activeBoardId);
          }
        } catch (e) {
          // snapshot 失敗不阻擋對話
          // eslint-disable-next-line no-console
          console.warn('Failed to build board snapshot', e);
        }
      }

      try {
        const res = await postMessage(
          {
            sessionId: get().currentSessionId,
            clientMessageId,
            text: trimmed,
            attachSnapshot: attach,
            boardSnapshot: snapshot,
            model: get().selectedModel ?? undefined,
          },
          ac.signal,
        );

        set((s) => {
          const idx = s.messages.findIndex((m) => m.clientMessageId === clientMessageId);
          if (idx >= 0) {
            s.messages[idx] = res.userMessage;
          } else {
            s.messages.push(res.userMessage);
          }
          s.messages.push(res.assistantMessage);
          s.currentSessionId = res.sessionId;
          const { byId, ids } = rebuildPendingIndex(s.messages);
          s.pendingActionsById = byId;
          s.pendingActionIds = ids;
        });
        try {
          localStorage.setItem(SESSION_ID_KEY, res.sessionId);
        } catch {
          // ignore
        }
      } catch (err) {
        const isAbort = err instanceof Error && (err.name === 'AbortError' || ac.signal.aborted);
        if (isAbort) {
          set((s) => {
            s.messages.push({
              id: nanoid(),
              role: 'assistant',
              content: '(已取消)',
              metadata: { aborted: true },
              createdAt: new Date().toISOString(),
            });
          });
        } else {
          const msg =
            err instanceof CoachApiError
              ? `${err.status ?? ''} ${err.message}`.trim()
              : err instanceof Error
              ? err.message
              : 'Unknown error';
          set((s) => {
            s.error = msg;
          });
        }
      } finally {
        set((s) => {
          s.isStreaming = false;
          s.abortController = null;
        });
      }
    },

    loadCurrentSession: async () => {
      // StrictMode-safe: serialize concurrent calls via in-memory promise
      const existing = get().loadingPromise;
      if (existing) return existing;
      if (get().loaded) return;

      const sid = get().currentSessionId;
      if (!sid) {
        set((s) => {
          s.loaded = true;
        });
        return;
      }

      const p = (async () => {
        try {
          const res = await getSession(sid);
          set((s) => {
            s.messages = res.messages;
            s.loaded = true;
            const { byId, ids } = rebuildPendingIndex(s.messages);
            s.pendingActionsById = byId;
            s.pendingActionIds = ids;
          });
        } catch (err) {
          // 404 / 401 → clear local session id, treat as empty
          if (err instanceof CoachApiError && (err.status === 404 || err.status === 401)) {
            try {
              localStorage.removeItem(SESSION_ID_KEY);
            } catch {
              // ignore
            }
            set((s) => {
              s.currentSessionId = null;
              s.messages = [];
              s.loaded = true;
            });
          } else {
            set((s) => {
              s.error = err instanceof Error ? err.message : 'Load session failed';
              s.loaded = true;
            });
          }
        } finally {
          set((s) => {
            s.loadingPromise = null;
          });
        }
      })();

      set((s) => {
        s.loadingPromise = p;
      });
      return p;
    },

    /**
     * 「開新對話」：純粹清 local pointer 開新 session，不動後端 — 舊 session
     * 仍會保留在 sessions 列表裡，使用者可以隨時切回。
     */
    startNewSession: () => {
      try {
        localStorage.removeItem(SESSION_ID_KEY);
      } catch {
        // ignore
      }
      set((s) => {
        s.currentSessionId = null;
        s.messages = [];
        s.error = null;
        s.pendingActionsById = {};
        s.pendingActionIds = [];
      });
    },

    /** 主動封存當前 session（從歷史列表移除）。「開新對話」**不會**自動 archive。 */
    archiveCurrentSession: async () => {
      const sid = get().currentSessionId;
      if (!sid) return;
      try {
        await apiClearSession(sid);
      } catch {
        // best-effort
      }
      try {
        localStorage.removeItem(SESSION_ID_KEY);
      } catch {
        // ignore
      }
      set((s) => {
        s.currentSessionId = null;
        s.messages = [];
        s.error = null;
        s.sessionList = s.sessionList.filter((meta) => meta.id !== sid);
        s.pendingActionsById = {};
        s.pendingActionIds = [];
      });
    },

    switchToSession: async (sessionId) => {
      if (get().currentSessionId === sessionId) return;
      try {
        const res = await getSession(sessionId);
        set((s) => {
          s.currentSessionId = sessionId;
          s.messages = res.messages;
          s.error = null;
          const { byId, ids } = rebuildPendingIndex(s.messages);
          s.pendingActionsById = byId;
          s.pendingActionIds = ids;
        });
        try {
          localStorage.setItem(SESSION_ID_KEY, sessionId);
        } catch {
          // ignore
        }
      } catch (err) {
        set((s) => {
          s.error = err instanceof Error ? err.message : 'Switch session failed';
        });
      }
    },

    loadSessionList: async () => {
      if (get().sessionListLoading) return;
      set((s) => {
        s.sessionListLoading = true;
      });
      try {
        const list = await apiListSessions();
        set((s) => {
          s.sessionList = list;
        });
      } catch (err) {
        set((s) => {
          s.error = err instanceof Error ? err.message : 'Load session list failed';
        });
      } finally {
        set((s) => {
          s.sessionListLoading = false;
        });
      }
    },

    loadAvailableModels: async () => {
      if (get().modelsLoaded) return;
      try {
        const info = await apiGetModels();
        set((s) => {
          s.defaultModel = info.defaultModel;
          s.availableModels = info.availableModels;
          s.modelsLoaded = true;
          // 如果 stored selection 不在新的 allowlist 裡，清掉避免 backend fallback 默默發生
          if (s.selectedModel && !info.availableModels.includes(s.selectedModel)) {
            s.selectedModel = null;
            try {
              localStorage.removeItem(MODEL_KEY);
            } catch {
              // ignore
            }
          }
        });
      } catch (err) {
        set((s) => {
          s.error = err instanceof Error ? err.message : 'Load models failed';
        });
      }
    },

    setSelectedModel: (model) => {
      try {
        if (model) localStorage.setItem(MODEL_KEY, model);
        else localStorage.removeItem(MODEL_KEY);
      } catch {
        // ignore
      }
      set((s) => {
        s.selectedModel = model;
      });
    },

    applyAction: async (actionId) => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      const action = get().pendingActionsById[actionId];
      if (!action) return;
      // Optimistic: set status to 'confirming'
      set((s) => {
        const existing = s.pendingActionsById[actionId];
        if (existing) {
          s.pendingActionsById[actionId] = { ...existing, status: 'confirming' };
        }
        for (const m of s.messages) {
          const list = m.metadata?.proposedActions;
          if (list) {
            const idx = list.findIndex((a) => a.id === actionId);
            if (idx >= 0) list[idx] = { ...list[idx], status: 'confirming' };
          }
        }
        if (s.pendingActionIds.indexOf(actionId) < 0) s.pendingActionIds.push(actionId);
      });
      try {
        const result = await confirmAction(actionId, sessionId, false);
        // SSE will broadcast the final status; locally also apply optimistically if SSE hasn't arrived.
        get().applyActionUpdate({
          sessionId,
          actionId,
          status: result.status,
          delta: {
            errorEnvelope: result.errorEnvelope ?? null,
            finalizedAt: result.finalAction.finalizedAt,
          },
        });
      } catch (err) {
        // Revert to pending on network error
        set((s) => {
          const a = s.pendingActionsById[actionId];
          if (a && a.status === 'confirming') a.status = 'pending';
          for (const m of s.messages) {
            const list = m.metadata?.proposedActions;
            if (list) {
              const idx = list.findIndex((x) => x.id === actionId);
              if (idx >= 0 && list[idx].status === 'confirming') {
                list[idx] = { ...list[idx], status: 'pending' };
              }
            }
          }
          s.error = err instanceof Error ? err.message : 'apply failed';
        });
      }
    },

    rejectAction: async (actionId, reason) => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      const action = get().pendingActionsById[actionId];
      if (!action) return;
      // Optimistic: set status to 'confirming' to disable buttons during the request.
      set((s) => {
        const existing = s.pendingActionsById[actionId];
        if (existing) {
          s.pendingActionsById[actionId] = { ...existing, status: 'confirming' };
        }
        for (const m of s.messages) {
          const list = m.metadata?.proposedActions;
          if (list) {
            const idx = list.findIndex((a) => a.id === actionId);
            if (idx >= 0) list[idx] = { ...list[idx], status: 'confirming' };
          }
        }
      });
      try {
        await apiRejectAction(actionId, sessionId, reason);
        // Local optimistic finalize; SSE broadcast will also arrive and idempotently re-apply.
        get().applyActionUpdate({
          sessionId,
          actionId,
          status: 'rejected',
          delta: { rejectReason: reason, finalizedAt: new Date().toISOString() },
        });
      } catch (err) {
        set((s) => {
          const a = s.pendingActionsById[actionId];
          if (a && a.status === 'confirming') a.status = 'pending';
          for (const m of s.messages) {
            const list = m.metadata?.proposedActions;
            if (list) {
              const idx = list.findIndex((x) => x.id === actionId);
              if (idx >= 0 && list[idx].status === 'confirming') {
                list[idx] = { ...list[idx], status: 'pending' };
              }
            }
          }
          s.error = err instanceof Error ? err.message : 'reject failed';
        });
      }
    },

    forceApplyAction: async (actionId) => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      const action = get().pendingActionsById[actionId];
      if (!action) return;
      // Optimistic: mark as confirming (same UI treatment as normal apply).
      set((s) => {
        const existing = s.pendingActionsById[actionId];
        if (existing) {
          s.pendingActionsById[actionId] = { ...existing, status: 'confirming', forceApply: true };
        }
        for (const m of s.messages) {
          const list = m.metadata?.proposedActions;
          if (list) {
            const idx = list.findIndex((a) => a.id === actionId);
            if (idx >= 0) list[idx] = { ...list[idx], status: 'confirming', forceApply: true };
          }
        }
      });
      try {
        const result = await confirmAction(actionId, sessionId, true);
        get().applyActionUpdate({
          sessionId,
          actionId,
          status: result.status,
          delta: {
            errorEnvelope: result.errorEnvelope ?? null,
            finalizedAt: result.finalAction.finalizedAt,
            forceApply: true,
          },
        });
      } catch (err) {
        set((s) => {
          const a = s.pendingActionsById[actionId];
          // Revert to stale (force-apply was triggered specifically because state was stale).
          if (a && a.status === 'confirming') a.status = 'stale';
          for (const m of s.messages) {
            const list = m.metadata?.proposedActions;
            if (list) {
              const idx = list.findIndex((x) => x.id === actionId);
              if (idx >= 0 && list[idx].status === 'confirming') {
                list[idx] = { ...list[idx], status: 'stale' };
              }
            }
          }
          s.error = err instanceof Error ? err.message : 'force-apply failed';
        });
      }
    },

    applyAllPending: async () => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      const byId = get().pendingActionsById;
      const ids = get().pendingActionIds.filter((id) => byId[id]?.status === 'pending');
      if (ids.length === 0) return;
      // Optimistic confirming for each
      set((s) => {
        for (const id of ids) {
          const existing = s.pendingActionsById[id];
          if (existing) s.pendingActionsById[id] = { ...existing, status: 'confirming' };
          for (const m of s.messages) {
            const list = m.metadata?.proposedActions;
            if (list) {
              const idx = list.findIndex((a) => a.id === id);
              if (idx >= 0) list[idx] = { ...list[idx], status: 'confirming' };
            }
          }
        }
      });
      try {
        const result = await confirmBatchActions(sessionId, ids);
        for (const r of result.results) {
          get().applyActionUpdate({
            sessionId,
            actionId: r.actionId,
            status: r.status,
            delta: {
              errorEnvelope: r.errorEnvelope ?? null,
              finalizedAt: new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        // Revert all back to pending
        set((s) => {
          for (const id of ids) {
            const a = s.pendingActionsById[id];
            if (a && a.status === 'confirming') a.status = 'pending';
            for (const m of s.messages) {
              const list = m.metadata?.proposedActions;
              if (list) {
                const idx = list.findIndex((x) => x.id === id);
                if (idx >= 0 && list[idx].status === 'confirming') {
                  list[idx] = { ...list[idx], status: 'pending' };
                }
              }
            }
          }
          s.error = err instanceof Error ? err.message : 'apply all failed';
        });
      }
    },

    rejectAllPending: async () => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      const byId = get().pendingActionsById;
      const ids = get().pendingActionIds.filter((id) => byId[id]?.status === 'pending');
      if (ids.length === 0) return;
      // No batch reject endpoint — fan out individually, tolerate per-item failure.
      await Promise.allSettled(ids.map((id) => get().rejectAction(id, null)));
    },

    applyActionUpdate: (payload) => {
      set((s) => {
        if (s.currentSessionId && payload.sessionId !== s.currentSessionId) return;
        let updated = false;
        for (const m of s.messages) {
          const list = m.metadata?.proposedActions;
          if (!list) continue;
          const idx = list.findIndex((a) => a.id === payload.actionId);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              status: payload.status,
              ...(payload.delta ?? {}),
            };
            updated = true;
            break;
          }
        }
        if (updated) {
          const { byId, ids } = rebuildPendingIndex(s.messages);
          s.pendingActionsById = byId;
          s.pendingActionIds = ids;
        }
      });
    },

    reconcilePending: async () => {
      const sessionId = get().currentSessionId;
      if (!sessionId) return;
      try {
        const serverPending = await listPendingActions(sessionId);
        set((s) => {
          // For each server-pending action, sync local store status if different.
          for (const sp of serverPending) {
            for (const m of s.messages) {
              const list = m.metadata?.proposedActions;
              if (!list) continue;
              const idx = list.findIndex((a) => a.id === sp.id);
              if (idx >= 0 && list[idx].status !== sp.status) {
                list[idx] = sp;
              }
            }
          }
          const { byId, ids } = rebuildPendingIndex(s.messages);
          s.pendingActionsById = byId;
          s.pendingActionIds = ids;
        });
      } catch {
        // ignore — non-fatal
      }
    },
  })),
);
