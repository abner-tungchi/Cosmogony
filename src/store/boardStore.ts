import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type { Board, Project, BoardStore } from '../types/board';
import type { StickyNote, Bundle, Link, FlowPath, Remodel } from '../types/elements';

function createBoard(name: string): Board {
  return {
    id: uuidv4(),
    name,
    notes: [],
    bundles: [],
    remodels: [],
    links: [],
    flowPaths: [],
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

      loadProject: (project) =>
        set((state) => {
          state.project = project;
        }),

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
            board.remodels = [];
            board.links = [];
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      collapseAllBundles: () =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const now = new Date().toISOString();
          for (const bundle of board.bundles) {
            bundle.collapsed = true;
            bundle.updatedAt = now;
          }
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      expandAllBundles: () =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const now = new Date().toISOString();
          for (const bundle of board.bundles) {
            bundle.collapsed = false;
            bundle.updatedAt = now;
          }
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      expandNoteToBundle: (noteId) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || note.type !== 'DomainEvent') return;
          const now = new Date().toISOString();
          const bundle: Bundle = {
            id: uuidv4(),
            position: { x: note.position.x, y: note.position.y },
            infoNote: { label: '', content: '' },
            entityNote: { label: 'Params', content: '' },
            commandNote: { label: '', content: '' },
            eventNote: { label: note.label, content: '' },
            zIndex: note.zIndex,
            collapsed: false,
            createdAt: now,
            updatedAt: now,
          };
          board.bundles.push(bundle);
          // Migrate links from note → bundle
          for (const link of board.links) {
            if (link.fromId === noteId) { link.fromId = bundle.id; link.fromType = 'bundle'; }
            if (link.toId === noteId) { link.toId = bundle.id; link.toType = 'bundle'; }
          }
          board.notes = board.notes.filter((n: StickyNote) => n.id !== noteId);
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      addRemodel: (remodel) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.remodels.push(remodel);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateRemodel: (id, updates) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const remodel = board.remodels.find((r: Remodel) => r.id === id);
          if (remodel) {
            Object.assign(remodel, updates);
            remodel.updatedAt = new Date().toISOString();
            board.updatedAt = remodel.updatedAt;
            state.project.updatedAt = remodel.updatedAt;
          }
        }),

      deleteRemodel: (id) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          board.remodels = board.remodels.filter((r: Remodel) => r.id !== id);
          board.links = board.links.filter((l: Link) => l.fromId !== id && l.toId !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addFlowPath: (flowPath) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (board) {
            board.flowPaths.push(flowPath);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateFlowPath: (id, updates) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const flowPath = board.flowPaths.find((fp: FlowPath) => fp.id === id);
          if (flowPath) {
            Object.assign(flowPath, updates);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      deleteFlowPath: (id) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          board.flowPaths = board.flowPaths.filter((fp: FlowPath) => fp.id !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),
    })),
    {
      name: 'event-storming-board',
      version: 7,
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
            remodels: [],
            links: (oldBoard.links ?? []) as Link[],
            flowPaths: [],
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
            remodels: [],
            links: [],
            flowPaths: [],
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
          // fall through to v4 migration
        }

        if (version <= 4) {
          // v4 → v5: add flowPaths to boards, paths to bundles/notes
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              const b = board as Board & { flowPaths?: FlowPath[] };
              if (!b.flowPaths) b.flowPaths = [];
              for (const bundle of board.bundles) {
                const bun = bundle as Bundle & { paths?: string[]; policies?: [] };
                if (!bun.paths) bun.paths = [];
                if (!bun.policies) bun.policies = [];
              }
              for (const note of board.notes) {
                const n = note as StickyNote & { paths?: string[] };
                if (!n.paths) n.paths = [];
              }
            }
          }
          // fall through to v5 → v6
        }

        if (version <= 5) {
          // v5 → v6: add remodels to boards
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              const b = board as Board & { remodels?: Remodel[] };
              if (!b.remodels) b.remodels = [];
            }
          }
          // fall through to v7 migration
        }

        if (version < 7) {
          // v6 → v7: rename sourceEventNote → returnTypeNote, add linkedDtoIds, add sourceEventsExpanded
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              if (!board.remodels) board.remodels = [];
              for (const remodel of board.remodels) {
                // Rename sourceEventNote → returnTypeNote (preserve content)
                const r = remodel as unknown as Record<string, unknown>;
                if ('sourceEventNote' in r && !('returnTypeNote' in r)) {
                  r['returnTypeNote'] = r['sourceEventNote'];
                  delete r['sourceEventNote'];
                }
                // Add linkedDtoIds if missing
                if (!remodel.linkedDtoIds) {
                  remodel.linkedDtoIds = [];
                }
                // sourceEventsExpanded is optional — undefined === true by convention, no need to set
              }
            }
          }
          return persistedState as BoardStore;
        }

        return persistedState as BoardStore;
      },
    }
  )
);
