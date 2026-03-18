import { useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { BoardStore } from '../types/board';

export function useApiSync() {
  const store = useBoardStore();
  const project = store.project;

  // Sync project state to MCP server whenever it changes
  useEffect(() => {
    fetch('/api/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).catch(() => {
      // Silent fail — MCP server not running doesn't affect normal app use
    });
  }, [project]);

  // Subscribe to SSE events from MCP server
  useEffect(() => {
    const es = new EventSource('/api/events');

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
  }
}
