import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type { Board, Project, BoardStore } from '../types/board';
import type { StickyNote, Bundle, Link } from '../types/elements';

function createBoard(name: string): Board {
  return {
    id: uuidv4(),
    name,
    notes: [],
    bundles: [],
    links: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const initialBoard = createBoard('Default Context');

const initialProject: Project = {
  id: uuidv4(),
  name: 'My Event Storming Board',
  boards: [initialBoard],
  activeBoardId: initialBoard.id,
  openBoardIds: [initialBoard.id],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const selectActiveBoard = (state: BoardStore): Board =>
  state.project.boards.find((b) => b.id === state.project.activeBoardId) ?? state.project.boards[0];

export const useBoardStore = create<BoardStore>()(
  persist(
    immer((set) => ({
      project: initialProject,

      setProjectName: (name) =>
        set((state) => {
          state.project.name = name;
          state.project.updatedAt = new Date().toISOString();
        }),

      setBoardName: (name) =>
        set((state) => {
          state.project.name = name;
          state.project.updatedAt = new Date().toISOString();
        }),

      addBoard: (name) => {
        const newBoard = createBoard(name);
        set((state) => {
          state.project.boards.push(newBoard);
          state.project.openBoardIds.push(newBoard.id);
          state.project.activeBoardId = newBoard.id;
          state.project.updatedAt = new Date().toISOString();
        });
        return newBoard.id;
      },

      deleteBoard: (id) =>
        set((state) => {
          if (state.project.boards.length <= 1) return;
          state.project.boards = state.project.boards.filter((b: Board) => b.id !== id);
          state.project.openBoardIds = state.project.openBoardIds.filter((i: string) => i !== id);
          if (state.project.activeBoardId === id) {
            state.project.activeBoardId = state.project.openBoardIds[0] ?? state.project.boards[0].id;
          }
          state.project.updatedAt = new Date().toISOString();
        }),

      closeBoard: (id) =>
        set((state) => {
          state.project.openBoardIds = state.project.openBoardIds.filter((i: string) => i !== id);
          if (state.project.activeBoardId === id) {
            state.project.activeBoardId = state.project.openBoardIds[0] ?? state.project.boards[0].id;
          }
          state.project.updatedAt = new Date().toISOString();
        }),

      openBoard: (id) =>
        set((state) => {
          if (!state.project.openBoardIds.includes(id)) {
            state.project.openBoardIds.push(id);
          }
          state.project.activeBoardId = id;
          state.project.updatedAt = new Date().toISOString();
        }),

      setActiveBoard: (id) =>
        set((state) => {
          if (state.project.boards.some((b: Board) => b.id === id)) {
            state.project.activeBoardId = id;
            state.project.updatedAt = new Date().toISOString();
          }
        }),

      renameBoard: (id, name) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === id);
          if (board) {
            board.name = name;
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = new Date().toISOString();
          }
        }),

      addNote: (note) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.notes.push(note);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateNote: (id, updates) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === id);
          if (note) {
            Object.assign(note, updates);
            note.updatedAt = new Date().toISOString();
            board.updatedAt = note.updatedAt;
            state.project.updatedAt = note.updatedAt;
          }
        }),

      deleteNote: (id) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          board.notes = board.notes.filter((n: StickyNote) => n.id !== id);
          board.links = board.links.filter((l: Link) => l.fromId !== id && l.toId !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addBundle: (bundle) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.bundles.push(bundle);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateBundle: (id, updates) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const bundle = board.bundles.find((b: Bundle) => b.id === id);
          if (bundle) {
            Object.assign(bundle, updates);
            bundle.updatedAt = new Date().toISOString();
            board.updatedAt = bundle.updatedAt;
            state.project.updatedAt = bundle.updatedAt;
          }
        }),

      deleteBundle: (id) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          board.bundles = board.bundles.filter((b: Bundle) => b.id !== id);
          board.links = board.links.filter((l: Link) => l.fromId !== id && l.toId !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addLink: (link) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.links.push(link);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      deleteLink: (id) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          board.links = board.links.filter((l: Link) => l.id !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      clearBoard: () =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.notes = [];
            board.bundles = [];
            board.links = [];
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),
    })),
    {
      name: 'event-storming-board',
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        const now = new Date().toISOString();

        if (version < 3) {
          // v2 → v4: Convert board with optional clusters to project with boards
          const old = persistedState as {
            board?: {
              id?: string;
              name?: string;
              notes?: Array<{ clusterId?: string | null; [key: string]: unknown }>;
              bundles?: Array<{ clusterId?: string | null; [key: string]: unknown }>;
              clusters?: Array<{ id: string; name: string }>;
              links?: unknown[];
              createdAt?: string;
              updatedAt?: string;
            };
          };

          const oldBoard = old.board ?? {};
          const clusters = oldBoard.clusters ?? [];

          const defaultBoard: Board = {
            id: oldBoard.id ?? uuidv4(),
            name: oldBoard.name ?? 'Default Context',
            notes: (oldBoard.notes ?? [])
              .filter((n) => !n.clusterId)
              .map(({ clusterId: _c, ...n }) => n as unknown as StickyNote),
            bundles: (oldBoard.bundles ?? [])
              .filter((b) => !b.clusterId)
              .map(({ clusterId: _c, ...b }) => b as unknown as Bundle),
            links: (oldBoard.links ?? []) as Link[],
            createdAt: oldBoard.createdAt ?? now,
            updatedAt: now,
          };

          const clusterBoards: Board[] = clusters.map((cluster) => ({
            id: uuidv4(),
            name: cluster.name,
            notes: (oldBoard.notes ?? [])
              .filter((n) => n.clusterId === cluster.id)
              .map(({ clusterId: _c, ...n }) => n as unknown as StickyNote),
            bundles: (oldBoard.bundles ?? [])
              .filter((b) => b.clusterId === cluster.id)
              .map(({ clusterId: _c, ...b }) => b as unknown as Bundle),
            links: [],
            createdAt: now,
            updatedAt: now,
          }));

          const boards = [defaultBoard, ...clusterBoards];
          return {
            project: {
              id: uuidv4(),
              name: oldBoard.name ?? 'My Event Storming Board',
              boards,
              activeBoardId: defaultBoard.id,
              openBoardIds: boards.map((b) => b.id),
              createdAt: oldBoard.createdAt ?? now,
              updatedAt: now,
            },
          };
        }

        if (version === 3) {
          // v3 → v4: add openBoardIds if missing
          const s = persistedState as { project?: Project & { openBoardIds?: string[] } };
          if (s.project && !s.project.openBoardIds) {
            s.project.openBoardIds = s.project.boards.map((b) => b.id);
          }
          return persistedState as BoardStore;
        }

        return persistedState as BoardStore;
      },
    }
  )
);
