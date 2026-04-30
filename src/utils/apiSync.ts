import { useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../store/boardStore';
import type { BoardStore, Project } from '../types/board';
import type { FlowPath, Remodel, StickyNote } from '../types/elements';

// Stable clientId for this browser tab (survives refreshes, new tab = new ID)
// Uses uuid package instead of crypto.randomUUID() because the latter is only
// available in secure contexts (HTTPS or localhost) — fails when accessed
// across hosts via plain HTTP.
const clientId = (() => {
  const key = 'es-client-id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(key, id);
  }
  return id;
})();

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function useApiSync() {
  const store = useBoardStore();
  const project = store.project;
  const initialized = useRef(false);

  // Echo-loop guard: when we apply a remote SSE event to local store, the resulting
  // `project` state change must NOT trigger a POST back to the server. Without this,
  // every broadcast we receive bounces back as a full-project POST → server re-broadcasts
  // → we overwrite the originating client's in-flight edits with stale state.
  // useRef is the right tool here: mutating .current does not trigger a re-render.
  const isApplyingRemoteRef = useRef(false);

  // On first mount: load state from server (so all browsers see the same board)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch('/api/board')
      .then((r) => r.json())
      .then((serverProject: Project) => {
        // Only replace local state if server has richer data
        const serverTotal = serverProject.boards?.reduce(
          (acc, b) => acc + b.notes.length, 0
        ) ?? 0;
        const localTotal = project.boards?.reduce(
          (acc, b) => acc + b.notes.length, 0
        ) ?? 0;
        if (serverTotal > localTotal) {
          store.loadProject(serverProject);
        }
      })
      .catch(() => {
        // Silent fail — MCP server not running
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced POST — waits 500ms after last change before sending.
  // activeBoardId and openBoardIds are per-tab UI state and intentionally NOT
  // sent to the server. If they were, the server would broadcast them via
  // sync_project and other tabs would have their tab selection overwritten.
  // (See dispatch sync_project below for the receive-side companion guard.)
  const debouncedPost = useMemo(
    () =>
      debounce((proj: Project) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { activeBoardId: _a, openBoardIds: _o, ...sharedProject } = proj;
        fetch('/api/board', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId,
          },
          body: JSON.stringify(sharedProject),
        }).catch(() => {
          // Silent fail — MCP server not running doesn't affect normal app use
        });
      }, 500),
    []
  );

  // Sync project state to MCP server whenever it changes
  useEffect(() => {
    if (!initialized.current) return;
    // Skip POST when the state change was caused by applying a remote SSE event —
    // otherwise we echo our peers' broadcasts back as full-project POSTs.
    if (isApplyingRemoteRef.current) return;
    debouncedPost(project);
  }, [project, debouncedPost]);

  // Subscribe to SSE events from MCP server
  useEffect(() => {
    const es = new EventSource(`/api/events?clientId=${clientId}`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const { action, payload } = JSON.parse(e.data as string) as { action: string; payload: unknown };
        // Set the guard BEFORE applying remote state, then reset it on the next
        // macrotask. The [project] useEffect runs after React commits the state
        // change from dispatch() — that commit happens within the current task
        // (or via a microtask flush), but in all cases before the next setTimeout
        // callback fires. So setTimeout(reset, 0) guarantees the flag is still
        // true when the POST effect reads it, then cleared for genuine local
        // edits afterwards. try/finally ensures the flag is always cleared even
        // if dispatch throws.
        isApplyingRemoteRef.current = true;
        try {
          dispatch(action, payload, store);
        } finally {
          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 0);
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      // Silent — MCP server not running
    };

    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Apply a server-broadcast action to the local store.
 *
 * This dispatch is kept in 1:1 correspondence with the broadcast() call sites in
 * mcp-server/src/index.ts. The server's broadcast vocabulary is the source of
 * truth — adding a case here without a matching server broadcast is dead code.
 *
 * Spec Bundle routing note:
 *   Server-side spec actions (addInvariant, approveInvariant, updateDtoFields,
 *   updateAggregateIdentity, updateStateProperties, updateRemodelBehavior, etc.)
 *   are all broadcast as `update_note` or `update_remodel` carrying the full new
 *   array (e.g. `{ id, invariants: Invariant[] }`). The store's updateNote /
 *   updateRemodel uses Object.assign for shallow merge, which correctly replaces
 *   array fields wholesale.
 *
 *   Known limitation: applying remote events bypasses helper-action side effects
 *   such as approveInvariant's auto-promotion of `provenance: "assumption"` →
 *   `"ui"`. This is acceptable because the server already performs that
 *   promotion before broadcasting, so the payload arriving here already has the
 *   correct provenance value.
 */
function dispatch(action: string, payload: unknown, store: BoardStore) {
  const p = payload as Record<string, unknown>;
  switch (action) {
    // ── Notes ──────────────────────────────────────────────────────────────
    case 'add_note':
      store.addNote(p as unknown as StickyNote);
      break;
    case 'update_note':
      store.updateNote(p.id as string, p as Partial<StickyNote>);
      break;
    case 'delete_note':
      store.deleteNote(p.id as string);
      break;

    // ── Links ──────────────────────────────────────────────────────────────
    case 'add_link':
      store.addLink(p as unknown as Parameters<BoardStore['addLink']>[0]);
      break;
    case 'delete_link':
      store.deleteLink(p.id as string);
      break;

    // ── Remodels ───────────────────────────────────────────────────────────
    case 'add_remodel':
      store.addRemodel(payload as Remodel);
      break;
    case 'update_remodel':
      // payload is either a full Remodel (es_update_remodel) or a partial
      // patch { id, behavior|parameters|returnType, ... } (spec bundle tools).
      // Either way, shallow-merge into the existing remodel.
      store.updateRemodel(p.id as string, p as Partial<Remodel>);
      break;
    case 'delete_remodel':
      store.deleteRemodel(p.id as string);
      break;

    // ── FlowPaths ──────────────────────────────────────────────────────────
    case 'add_flow_path':
      store.addFlowPath(payload as FlowPath);
      break;
    case 'delete_flow_path':
      store.deleteFlowPath(p.id as string);
      break;

    // ── Batch path / phase assignment (mixed notes + remodels) ────────────
    case 'set_event_paths': {
      const ids = (p.ids ?? []) as string[];
      const paths = (p.paths ?? []) as string[];
      applyBatchFieldUpdate(store, ids, { paths });
      break;
    }
    case 'set_event_phase': {
      const ids = (p.ids ?? []) as string[];
      const phase = p.phase as string;
      applyBatchFieldUpdate(store, ids, { phase });
      break;
    }

    // ── Project / Board lifecycle ─────────────────────────────────────────
    case 'set_project_name':
      store.setProjectName(p.name as string);
      break;
    case 'clear_board':
      store.clearBoard();
      break;
    case 'add_board':
      store.addBoard(p.name as string);
      break;
    case 'delete_board':
      store.deleteBoard(p.id as string);
      break;
    case 'set_active_board':
      store.setActiveBoard(p.id as string);
      break;
    case 'rename_board':
      store.renameBoard(p.id as string, p.name as string);
      break;
    case 'sync_project': {
      // Preserve per-tab UI state (active context tab + open tab list) when
      // applying a remote sync_project. Self-heals if local state is corrupt
      // (e.g. localStorage has undefined activeBoardId from a prior bug):
      // falls back to a valid board id rather than writing undefined back.
      //
      // Read CURRENT local state via getState() — the `store` parameter is a
      // closure-captured snapshot from when the SSE useEffect mounted (deps []).
      const incoming = payload as Project;
      const currentLocal = useBoardStore.getState().project;
      const validIds = new Set(incoming.boards.map((b) => b.id));

      // Resolve preserved activeBoardId: prefer current local if it points to
      // a board that exists in incoming; else fall back to incoming's
      // activeBoardId; else first incoming board.
      const localActive = currentLocal.activeBoardId;
      const incomingActive = (incoming as Project & { activeBoardId?: string }).activeBoardId;
      const preservedActive =
        localActive && validIds.has(localActive)
          ? localActive
          : incomingActive && validIds.has(incomingActive)
            ? incomingActive
            : incoming.boards[0]?.id;

      // Resolve preserved openBoardIds: keep current local entries that still
      // exist in incoming; if none survive, fall back to [activeBoardId].
      const localOpen = currentLocal.openBoardIds ?? [];
      const filteredOpen = localOpen.filter((id) => validIds.has(id));
      const preservedOpen =
        filteredOpen.length > 0
          ? filteredOpen
          : preservedActive
            ? [preservedActive]
            : [];

      store.loadProject({
        ...incoming,
        activeBoardId: preservedActive ?? '',
        openBoardIds: preservedOpen,
      });
      break;
    }

    default:
      // Surface unknown broadcasts so we notice when the server adds a new
      // action without a matching client handler. console.warn (not error) so
      // it doesn't break dev or pollute Sentry-style error reporting.
      console.warn('[apiSync] Unknown broadcast action:', action, payload);
  }
}

/**
 * Apply a single-field update (e.g. paths or phase) to a mixed list of note
 * and remodel IDs. Mirrors the server-side es_set_event_paths / es_set_event_phase
 * tools, which scan both notes[] and remodels[] for each ID.
 *
 * Looks up each ID in the active board to decide the correct store action.
 * IDs that don't match a note or remodel in the active board are silently
 * skipped (matches server-side notFound semantics).
 */
function applyBatchFieldUpdate(
  store: BoardStore,
  ids: string[],
  update: { paths?: string[]; phase?: string }
) {
  const board = store.project.boards.find((b) => b.id === store.project.activeBoardId);
  if (!board) return;
  const noteIds = new Set(board.notes.map((n) => n.id));
  const remodelIds = new Set(board.remodels.map((r) => r.id));
  for (const id of ids) {
    if (noteIds.has(id)) {
      store.updateNote(id, update as Partial<StickyNote>);
    } else if (remodelIds.has(id)) {
      store.updateRemodel(id, update as Partial<Remodel>);
    }
    // else: ID not in active board — skip (matches server notFound)
  }
}
