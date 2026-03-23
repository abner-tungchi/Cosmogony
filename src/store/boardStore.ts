import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type { Board, Project, BoardStore } from '../types/board';
import type { StickyNote, Link, FlowPath, Remodel } from '../types/elements';

function createBoard(name: string, parentContextId?: string): Board {
  return {
    id: uuidv4(),
    name,
    parentContextId,
    notes: [],
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

      addActorBoard: (contextId, name) => {
        const newBoard = createBoard(name, contextId);
        set((state) => {
          state.project.boards.push(newBoard);
          if (!state.project.openBoardIds.includes(contextId)) {
            state.project.openBoardIds.push(contextId);
          }
          state.project.activeBoardId = newBoard.id;
          state.project.updatedAt = new Date().toISOString();
        });
        return newBoard.id;
      },

      deleteBoard: (id) =>
        set((state) => {
          const toDelete = new Set(
            state.project.boards
              .filter((b: Board) => b.id === id || b.parentContextId === id)
              .map((b: Board) => b.id)
          );
          const remainingContextBoards = state.project.boards.filter(
            (b: Board) => !toDelete.has(b.id) && !b.parentContextId
          );
          if (remainingContextBoards.length === 0) return;

          state.project.boards = state.project.boards.filter((b: Board) => !toDelete.has(b.id));
          state.project.openBoardIds = state.project.openBoardIds.filter((i: string) => !toDelete.has(i));
          if (toDelete.has(state.project.activeBoardId)) {
            state.project.activeBoardId =
              state.project.openBoardIds[0] ?? remainingContextBoards[0].id;
          }
          state.project.updatedAt = new Date().toISOString();
        }),

      closeBoard: (id) =>
        set((state) => {
          state.project.openBoardIds = state.project.openBoardIds.filter((i: string) => i !== id);
          if (state.project.activeBoardId === id) {
            const closingBoard = state.project.boards.find((b: Board) => b.id === id);
            const fallbackId =
              closingBoard?.parentContextId ??
              state.project.openBoardIds[0] ??
              state.project.boards.find((b: Board) => !b.parentContextId)?.id;
            state.project.activeBoardId = fallbackId ?? state.project.boards[0].id;
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
          // Clear commandId references on DomainEvent notes that point to this note
          for (const note of board.notes) {
            if (note.commandId === id) {
              note.commandId = undefined;
            }
            if (note.entityId === id) {
              note.entityId = undefined;
            }
          }
          board.notes = board.notes.filter((n: StickyNote) => n.id !== id);
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
            board.remodels = [];
            board.links = [];
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      addCommandForEvent: (eventNoteId, commandLabel, information) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const eventNote = board.notes.find((n: StickyNote) => n.id === eventNoteId);
          if (!eventNote || eventNote.type !== 'DomainEvent') return;

          const now = new Date().toISOString();
          const commandNote: StickyNote = {
            id: uuidv4(),
            type: 'Command',
            label: commandLabel,
            position: {
              x: eventNote.position.x - 200,
              y: eventNote.position.y,
            },
            size: { width: 160, height: 80 },
            zIndex: eventNote.zIndex,
            information,
            createdAt: now,
            updatedAt: now,
          };

          board.notes.push(commandNote);

          // Link Command → DomainEvent
          const link: Link = {
            id: uuidv4(),
            fromId: commandNote.id,
            toId: eventNoteId,
            fromType: 'note',
            toType: 'note',
            createdAt: now,
          };
          board.links.push(link);

          // Update DomainEvent's commandId backref
          eventNote.commandId = commandNote.id;
          eventNote.updatedAt = now;

          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      updateCommandInformation: (commandId, information) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === commandId);
          if (!note) return;
          note.information = information;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      updateEventProperties: (eventId, eventProperties) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === eventId);
          if (!note) return;
          note.eventProperties = eventProperties;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      linkEntityToEvent: (eventId, entityId) =>
        set((state) => {
          const board = state.project.boards.find((b: Board) => b.id === state.project.activeBoardId);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === eventId);
          if (!note) return;
          note.entityId = entityId;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
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
      version: 9,
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
          const s = persistedState as { project?: Project & { openBoardIds?: string[] } };
          if (s.project && !s.project.openBoardIds) {
            s.project.openBoardIds = s.project.boards.map((b) => b.id);
          }
        }

        if (version <= 4) {
          // v4 → v5: add flowPaths to boards, paths to notes
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              const b = board as Board & { flowPaths?: FlowPath[] };
              if (!b.flowPaths) b.flowPaths = [];
              for (const note of board.notes) {
                const n = note as StickyNote & { paths?: string[] };
                if (!n.paths) n.paths = [];
              }
            }
          }
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
        }

        if (version < 7) {
          // v6 → v7: rename sourceEventNote → returnTypeNote, add linkedDtoIds
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              if (!board.remodels) board.remodels = [];
              for (const remodel of board.remodels) {
                const r = remodel as unknown as Record<string, unknown>;
                if ('sourceEventNote' in r && !('returnTypeNote' in r)) {
                  r['returnTypeNote'] = r['sourceEventNote'];
                  delete r['sourceEventNote'];
                }
                if (!remodel.linkedDtoIds) {
                  remodel.linkedDtoIds = [];
                }
              }
            }
          }
        }

        if (version < 8) {
          // v7 → v8: add parentContextId field
          return persistedState as BoardStore;
        }

        if (version < 9) {
          // v8 → v9: Convert Bundle 4-in-1 cards to Command + DomainEvent StickyNotes + Links
          const s = persistedState as {
            project?: {
              boards?: Array<{
                notes?: unknown[];
                bundles?: Array<{
                  id: string;
                  position: { x: number; y: number };
                  infoNote: { label: string; content: string };
                  entityNote: { label: string; content: string };
                  commandNote: { label: string; content: string };
                  eventNote: { label: string; content: string };
                  zIndex: number;
                  paths?: string[];
                  phase?: string;
                  notes?: string;
                  createdAt: string;
                  updatedAt: string;
                }>;
                remodels?: unknown[];
                links?: Array<{
                  id: string;
                  fromId: string;
                  toId: string;
                  fromType: string;
                  toType: string;
                  label?: string;
                  createdAt: string;
                }>;
                flowPaths?: unknown[];
                [key: string]: unknown;
              }>;
              [key: string]: unknown;
            };
          };

          if (s.project) {
            for (const board of s.project.boards ?? []) {
              const bundles = board.bundles ?? [];
              const newNotes: unknown[] = [];
              const newLinks: unknown[] = [];

              // Build a mapping from bundle id to new note IDs for link migration
              const bundleToEventNoteId = new Map<string, string>();

              for (const bundle of bundles) {
                const commandNoteId = uuidv4();
                const eventNoteId = uuidv4();

                // Command note (blue) — offset left of where the event will be
                const commandNote = {
                  id: commandNoteId,
                  type: 'Command',
                  label: bundle.commandNote.label || 'Command',
                  position: { x: bundle.position.x + 168, y: bundle.position.y + 128 },
                  size: { width: 160, height: 80 },
                  zIndex: bundle.zIndex,
                  paths: bundle.paths ?? [],
                  phase: bundle.phase,
                  notes: bundle.notes,
                  // Map entityNote content as information (name-only properties)
                  information: bundle.entityNote.content
                    ? bundle.entityNote.content.split(',').map((s: string) => ({
                        attrName: s.trim(),
                        type: 'String',
                      }))
                    : [],
                  createdAt: bundle.createdAt,
                  updatedAt: now,
                };

                // DomainEvent note (orange) — to the right of Command
                const eventNote = {
                  id: eventNoteId,
                  type: 'DomainEvent',
                  label: bundle.eventNote.label || 'DomainEvent',
                  position: { x: bundle.position.x + 328, y: bundle.position.y + 128 },
                  size: { width: 160, height: 80 },
                  zIndex: bundle.zIndex,
                  paths: bundle.paths ?? [],
                  phase: bundle.phase,
                  notes: bundle.notes,
                  commandId: commandNoteId,
                  createdAt: bundle.createdAt,
                  updatedAt: now,
                };

                newNotes.push(commandNote);
                newNotes.push(eventNote);
                bundleToEventNoteId.set(bundle.id, eventNoteId);

                // Link Command → DomainEvent
                newLinks.push({
                  id: uuidv4(),
                  fromId: commandNoteId,
                  toId: eventNoteId,
                  fromType: 'note',
                  toType: 'note',
                  createdAt: now,
                });
              }

              // Merge new notes with existing notes
              board.notes = [...(board.notes ?? []), ...newNotes];

              // Migrate existing links: bundle type → note type, bundle id → event note id
              const existingLinks = (board.links ?? []) as Link[];
              const migratedLinks = existingLinks.map((link) => {
                const migrated: Link = { ...link };
                if ((link.fromType as string) === 'bundle') {
                  migrated.fromType = 'note';
                  migrated.fromId = bundleToEventNoteId.get(link.fromId) ?? link.fromId;
                }
                if ((link.toType as string) === 'bundle') {
                  migrated.toType = 'note';
                  migrated.toId = bundleToEventNoteId.get(link.toId) ?? link.toId;
                }
                return migrated;
              });

              (board as { links: Link[] }).links = [...migratedLinks, ...(newLinks as Link[])];
              board.bundles = undefined;
            }
          }
          return s as unknown as BoardStore;
        }

        return persistedState as BoardStore;
      },
    }
  )
);
