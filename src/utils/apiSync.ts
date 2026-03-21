import { useEffect, useMemo, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { BoardStore, Project } from '../types/board';

// Stable clientId for this browser tab (survives refreshes, new tab = new ID)
const clientId = (() => {
  const key = 'es-client-id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
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

  // On first mount: load state from server (so all browsers see the same board)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch('/api/board')
      .then((r) => r.json())
      .then((serverProject: Project) => {
        // Only replace local state if server has richer data
        const serverTotal = serverProject.boards?.reduce(
          (acc, b) => acc + b.notes.length + b.bundles.length, 0
        ) ?? 0;
        const localTotal = project.boards?.reduce(
          (acc, b) => acc + b.notes.length + b.bundles.length, 0
        ) ?? 0;
        if (serverTotal > localTotal) {
          store.loadProject(serverProject);
        }
      })
      .catch(() => {
        // Silent fail — MCP server not running
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced POST — waits 500ms after last change before sending
  const debouncedPost = useMemo(
    () =>
      debounce((proj: Project) => {
        fetch('/api/board', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId,
          },
          body: JSON.stringify(proj),
        }).catch(() => {
          // Silent fail — MCP server not running doesn't affect normal app use
        });
      }, 500),
    []
  );

  // Sync project state to MCP server whenever it changes
  useEffect(() => {
    if (!initialized.current) return;
    debouncedPost(project);
  }, [project, debouncedPost]);

  // Subscribe to SSE events from MCP server
  useEffect(() => {
    const es = new EventSource(`/api/events?clientId=${clientId}`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const { action, payload } = JSON.parse(e.data as string) as { action: string; payload: unknown };
        dispatch(action, payload, store);
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

function dispatch(action: string, payload: unknown, store: BoardStore) {
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'add_note':
      store.addNote(p as unknown as Parameters<BoardStore['addNote']>[0]);
      break;
    case 'update_note':
      store.updateNote(p.id as string, p as unknown as Parameters<BoardStore['updateNote']>[1]);
      break;
    case 'delete_note':
      store.deleteNote(p.id as string);
      break;
    case 'add_bundle':
      store.addBundle(p as unknown as Parameters<BoardStore['addBundle']>[0]);
      break;
    case 'update_bundle':
      store.updateBundle(p.id as string, p as unknown as Parameters<BoardStore['updateBundle']>[1]);
      break;
    case 'delete_bundle':
      store.deleteBundle(p.id as string);
      break;
    case 'add_link':
      store.addLink(p as unknown as Parameters<BoardStore['addLink']>[0]);
      break;
    case 'delete_link':
      store.deleteLink(p.id as string);
      break;
    case 'set_board_name':
      store.setProjectName(p.name as string);
      break;
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
    case 'close_board':
      store.closeBoard(p.id as string);
      break;
    case 'open_board':
      store.openBoard(p.id as string);
      break;
    case 'set_active_board':
      store.setActiveBoard(p.id as string);
      break;
    case 'rename_board':
      store.renameBoard(p.id as string, p.name as string);
      break;
    case 'sync_project':
      store.loadProject(payload as Project);
      break;
  }
}
