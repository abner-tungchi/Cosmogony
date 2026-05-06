import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type { Board, Project, BoardStore, UIState } from '../types/board';
import type { StickyNote, Link, FlowPath, Remodel } from '../types/elements';
import { useUIStore } from './uiStore';

// Per-tab UI state (activeBoardId / openBoardIds) lives in uiStore so each
// browser tab keeps its own selection. boardStore actions still need to know
// which board the user is editing — this helper resolves that on demand,
// falling back to boards[0] when uiStore hasn't been seeded yet (e.g. before
// useReconcileUIState has mounted on a fresh tab).
function findActiveBoard(state: BoardStore): Board | undefined {
  const id = useUIStore.getState().activeBoardId;
  return state.project.boards.find((b) => b.id === id) ?? state.project.boards[0];
}

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
  customTypes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useBoardStore = create<BoardStore>()(
  persist(
    immer((set) => ({
      project: initialProject,

      loadProject: (project) =>
        set((state) => {
          // Single FE entry point for all incoming Project payloads (initial
          // GET /api/board, sync_project SSE, future call sites). Project's
          // TS shape no longer declares activeBoardId / openBoardIds, but the
          // BE-local Project still carries them and JSON parse keeps them as
          // real keys — so explicit delete is the runtime strip. This is the
          // last of the three wire-strip layers; relying on TS alone would
          // let per-tab UI state leak across tabs again. Reconciling stale
          // / missing activeBoardId belongs to useReconcileUIState (effect
          // layer), not here.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { activeBoardId: _a, openBoardIds: _o, ...sharedProject } =
            project as Project & { activeBoardId?: string; openBoardIds?: string[] };
          state.project = sharedProject as Project;
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
          state.project.updatedAt = new Date().toISOString();
        });
        const ui = useUIStore.getState();
        const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
        useUIStore.setState({
          activeBoardId: newBoard.id,
          openBoardIds: [...open, newBoard.id],
        });
        return newBoard.id;
      },

      addActorBoard: (contextId, name) => {
        const newBoard = createBoard(name, contextId);
        set((state) => {
          state.project.boards.push(newBoard);
          state.project.updatedAt = new Date().toISOString();
        });
        // Actor sub-board itself is NOT a tab — only its parent context is.
        // The tab list ensures `contextId` is open; activeBoardId switches to
        // the new actor sub-board so the user lands on it immediately.
        const ui = useUIStore.getState();
        const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
        useUIStore.setState({
          activeBoardId: newBoard.id,
          openBoardIds: open.includes(contextId) ? open : [...open, contextId],
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
          state.project.updatedAt = new Date().toISOString();
          // Defer uiStore mutation outside the immer producer to avoid the
          // draft / external-store interleaving footgun.
          queueMicrotask(() => {
            const ui = useUIStore.getState();
            const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
            const filteredOpen = open.filter((i) => !toDelete.has(i));
            const next: Partial<UIState> = { openBoardIds: filteredOpen };
            if (toDelete.has(ui.activeBoardId)) {
              next.activeBoardId = filteredOpen[0] ?? remainingContextBoards[0].id;
            }
            useUIStore.setState(next);
          });
        }),

      closeBoard: (id) => {
        const ui = useUIStore.getState();
        const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
        const remaining = open.filter((i) => i !== id);
        const next: Partial<UIState> = { openBoardIds: remaining };
        if (ui.activeBoardId === id) {
          const state = useBoardStore.getState();
          const closingBoard = state.project.boards.find((b) => b.id === id);
          const fallback =
            closingBoard?.parentContextId ??
            remaining[0] ??
            state.project.boards.find((b) => !b.parentContextId)?.id ??
            state.project.boards[0]?.id ??
            '';
          next.activeBoardId = fallback;
        }
        useUIStore.setState(next);
      },

      openBoard: (id) => {
        const ui = useUIStore.getState();
        const open = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
        useUIStore.setState({
          openBoardIds: open.includes(id) ? open : [...open, id],
          activeBoardId: id,
        });
      },

      setActiveBoard: (id) => {
        if (useBoardStore.getState().project.boards.some((b) => b.id === id)) {
          useUIStore.setState({ activeBoardId: id });
        }
      },

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
          const board = findActiveBoard(state);
          if (board) {
            board.notes.push(note);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateNote: (id, updates) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === id);
          if (note) {
            Object.assign(note, updates);
            note.updatedAt = new Date().toISOString();
            board.updatedAt = note.updatedAt;
            state.project.updatedAt = note.updatedAt;

            // (Legacy) When an Entity with isAggregateRoot updates its label, sync the linked Aggregate note
            // In the new flow, Entity is converted directly to Aggregate, so no separate sync needed
            if (updates.label !== undefined && note.type === 'Entity' && note.isAggregateRoot && note.linkedAggregateNoteId) {
              const aggNote = board.notes.find((n: StickyNote) => n.id === note.linkedAggregateNoteId);
              if (aggNote) {
                aggNote.label = updates.label;
                aggNote.updatedAt = note.updatedAt;
              }
            }
          }
        }),

      deleteNote: (id) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;

          const noteToDelete = board.notes.find((n: StickyNote) => n.id === id);

          // Collect IDs to delete (cascade for DomainEvent)
          const idsToDelete = new Set<string>([id]);
          if (noteToDelete?.type === 'DomainEvent') {
            for (const note of board.notes) {
              if (note.groupEventId === id) {
                idsToDelete.add(note.id);
              }
            }
          }

          // (Legacy) If deleting an Entity with isAggregateRoot, cascade-delete its linked Aggregate note
          if (noteToDelete?.type === 'Entity' && noteToDelete.isAggregateRoot && noteToDelete.linkedAggregateNoteId) {
            idsToDelete.add(noteToDelete.linkedAggregateNoteId);
          }

          // If deleting an Aggregate note, clear entityId on all DomainEvents that reference it
          if (noteToDelete?.type === 'Aggregate') {
            for (const note of board.notes) {
              if (note.type === 'DomainEvent' && note.entityId === id) {
                note.entityId = undefined;
              }
              // (Legacy) clear isAggregateRoot on Entity notes
              if (note.type === 'Entity' && note.linkedAggregateNoteId === id) {
                note.isAggregateRoot = false;
                note.linkedAggregateNoteId = undefined;
              }
            }
          }

          // Clear commandId/entityId references on DomainEvent notes that point to deleted notes
          for (const note of board.notes) {
            if (note.commandId && idsToDelete.has(note.commandId)) {
              note.commandId = undefined;
            }
            if (note.entityId && idsToDelete.has(note.entityId)) {
              note.entityId = undefined;
            }
          }

          board.notes = board.notes.filter((n: StickyNote) => !idsToDelete.has(n.id));
          board.links = board.links.filter((l: Link) => !idsToDelete.has(l.fromId) && !idsToDelete.has(l.toId));
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addLink: (link) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (board) {
            board.links.push(link);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      deleteLink: (id) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          board.links = board.links.filter((l: Link) => l.id !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      clearBoard: () =>
        set((state) => {
          const board = findActiveBoard(state);
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
          const board = findActiveBoard(state);
          if (!board) return;
          const eventNote = board.notes.find((n: StickyNote) => n.id === eventNoteId);
          if (!eventNote || eventNote.type !== 'DomainEvent') return;

          const now = new Date().toISOString();
          const commandNoteId = uuidv4();

          const commandNote: StickyNote = {
            id: commandNoteId,
            type: 'Command',
            label: commandLabel,
            position: {
              x: eventNote.position.x - 176,
              y: eventNote.position.y,
            },
            size: { width: 160, height: 80 },
            zIndex: eventNote.zIndex,
            information,
            groupEventId: eventNoteId,
            createdAt: now,
            updatedAt: now,
          };

          board.notes.push(commandNote);

          // If information is non-empty, also create an Information note
          if (information.length > 0) {
            const infoNote: StickyNote = {
              id: uuidv4(),
              type: 'Information',
              label: commandLabel + ' Info',
              position: {
                x: commandNote.position.x - 176,
                y: commandNote.position.y,
              },
              size: { width: 160, height: 80 },
              zIndex: eventNote.zIndex,
              information: [...information],
              groupEventId: eventNoteId,
              informationForCommandId: commandNoteId,
              createdAt: now,
              updatedAt: now,
            };
            board.notes.push(infoNote);
          }

          // Update DomainEvent's commandId backref (no Link record)
          eventNote.commandId = commandNoteId;
          eventNote.updatedAt = now;

          // Reposition any existing Entity note to the vertical center of the expanded group
          // Group now includes: commandNote (x - 176), eventNote (x), and Entity note
          const existingEntity = board.notes.find(
            (n: StickyNote) => n.groupEventId === eventNoteId && n.type === 'Entity'
          );
          if (existingEntity) {
            const NOTE_WIDTH = 160;
            // Group spans from commandNote.position.x to eventNote.position.x + NOTE_WIDTH
            const groupMinX = commandNote.position.x;
            const groupMaxX = eventNote.position.x + NOTE_WIDTH;
            const groupCenterX = (groupMinX + groupMaxX) / 2;
            existingEntity.position = {
              x: groupCenterX - NOTE_WIDTH / 2,
              y: existingEntity.position.y,
            };
            existingEntity.updatedAt = now;
          }

          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      updateCommandInformation: (commandId, information) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === commandId);
          if (!note) return;
          note.information = information;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;

          // Sync the linked Information note so the green card on canvas stays current
          const infoNote = board.notes.find(
            (n: StickyNote) => n.informationForCommandId === commandId
          );
          if (infoNote) {
            infoNote.information = information;
            infoNote.updatedAt = note.updatedAt;
          }
        }),

      updateEventProperties: (eventId, eventProperties) =>
        set((state) => {
          const board = findActiveBoard(state);
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
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === eventId);
          if (!note) return;
          note.entityId = entityId;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      addEntityForEvent: (eventNoteId, entityLabel) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const eventNote = board.notes.find((n: StickyNote) => n.id === eventNoteId);
          if (!eventNote || eventNote.type !== 'DomainEvent') return;

          const now = new Date().toISOString();

          // Find all satellite notes for this event to compute group bounds
          const groupNotes = board.notes.filter(
            (n: StickyNote) => n.groupEventId === eventNoteId || n.id === eventNoteId
          );

          // Compute group x-center
          const NOTE_WIDTH = 160;
          const minX = Math.min(...groupNotes.map((n: StickyNote) => n.position.x));
          const maxX = Math.max(...groupNotes.map((n: StickyNote) => n.position.x));
          const groupCenterX = (minX + maxX + NOTE_WIDTH) / 2;

          const entityNote: StickyNote = {
            id: uuidv4(),
            type: 'Entity',
            label: entityLabel,
            position: {
              x: groupCenterX - NOTE_WIDTH / 2,
              y: eventNote.position.y - 104, // 80px height + 24px gap above
            },
            size: { width: NOTE_WIDTH, height: 80 },
            zIndex: eventNote.zIndex,
            groupEventId: eventNoteId,
            createdAt: now,
            updatedAt: now,
          };

          board.notes.push(entityNote);

          // Update DomainEvent's entityId backref
          eventNote.entityId = entityNote.id;
          eventNote.updatedAt = now;

          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      linkEntityToAggregateRoot: (entityNoteId, aggregateRootId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === entityNoteId);
          if (!note) return;
          note.aggregateRootId = aggregateRootId;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      unlinkEntityFromAggregateRoot: (entityNoteId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === entityNoteId);
          if (!note) return;
          note.aggregateRootId = undefined;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      setEntityAsAggregateRoot: (entityNoteId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === entityNoteId);
          if (!note || note.type !== 'Entity') return;

          const now = new Date().toISOString();

          // New behavior: convert Entity note type directly to Aggregate
          // The entity keeps its position, groupEventId, and label unchanged
          note.type = 'Aggregate';
          note.isAggregateRoot = undefined;
          note.linkedAggregateNoteId = undefined;
          note.updatedAt = now;
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      unsetEntityAsAggregateRoot: (aggregateNoteId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === aggregateNoteId);
          if (!note || note.type !== 'Aggregate') return;

          const now = new Date().toISOString();

          // Clear entityId references on all other DomainEvents that reference this Aggregate
          // (i.e. groups that linked to this Aggregate but are NOT the original group)
          for (const n of board.notes) {
            if (n.type === 'DomainEvent' && n.entityId === aggregateNoteId && n.id !== note.groupEventId) {
              n.entityId = undefined;
              n.updatedAt = now;
            }
          }

          // Convert this note back to Entity
          note.type = 'Entity';
          note.updatedAt = now;
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      linkEventToAggregate: (eventId, aggregateNoteId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const eventNote = board.notes.find((n: StickyNote) => n.id === eventId);
          if (!eventNote || eventNote.type !== 'DomainEvent') return;

          const now = new Date().toISOString();

          // If this DomainEvent already has an entityId pointing to a satellite Entity note, delete that note
          if (eventNote.entityId) {
            const existingEntityNote = board.notes.find(
              (n: StickyNote) => n.id === eventNote.entityId && n.groupEventId === eventId
            );
            if (existingEntityNote) {
              board.notes = board.notes.filter((n: StickyNote) => n.id !== existingEntityNote.id);
            }
          }

          // Point DomainEvent to the shared Aggregate note
          eventNote.entityId = aggregateNoteId;
          eventNote.updatedAt = now;
          board.updatedAt = now;
          state.project.updatedAt = now;
        }),

      addRemodel: (remodel) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (board) {
            board.remodels.push(remodel);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateRemodel: (id, updates) =>
        set((state) => {
          const board = findActiveBoard(state);
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
          const board = findActiveBoard(state);
          if (!board) return;
          board.remodels = board.remodels.filter((r: Remodel) => r.id !== id);
          board.links = board.links.filter((l: Link) => l.fromId !== id && l.toId !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addFlowPath: (flowPath) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (board) {
            board.flowPaths.push(flowPath);
            board.updatedAt = new Date().toISOString();
            state.project.updatedAt = board.updatedAt;
          }
        }),

      updateFlowPath: (id, updates) =>
        set((state) => {
          const board = findActiveBoard(state);
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
          const board = findActiveBoard(state);
          if (!board) return;
          board.flowPaths = board.flowPaths.filter((fp: FlowPath) => fp.id !== id);
          board.updatedAt = new Date().toISOString();
          state.project.updatedAt = board.updatedAt;
        }),

      addCustomType: (typeName) =>
        set((state) => {
          const trimmed = typeName.trim();
          if (!trimmed) return;
          if (!state.project.customTypes) {
            state.project.customTypes = [];
          }
          if (!state.project.customTypes.includes(trimmed)) {
            state.project.customTypes.push(trimmed);
            state.project.updatedAt = new Date().toISOString();
          }
        }),

      // ──────────────────────────────────────────────────────────────
      // Spec Bundle — Aggregate
      // ──────────────────────────────────────────────────────────────

      updateAggregateIdentity: (noteId, identity) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          note.aggregateIdentity = identity;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      updateStateProperties: (noteId, stateProperties) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          note.stateProperties = stateProperties;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      addInvariant: (noteId, invariant) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          if (!note.invariants) note.invariants = [];
          note.invariants.push(invariant);
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      updateInvariant: (noteId, invariantId, updates) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || !note.invariants) return;
          const inv = note.invariants.find((i) => i.id === invariantId);
          if (!inv) return;
          Object.assign(inv, updates);
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      deleteInvariant: (noteId, invariantId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || !note.invariants) return;
          note.invariants = note.invariants.filter((i) => i.id !== invariantId);
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      approveInvariant: (noteId, invariantId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || !note.invariants) return;
          const inv = note.invariants.find((i) => i.id === invariantId);
          if (!inv) return;
          inv.status = 'confirmed';
          inv.provenance = 'ui';
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      rejectInvariant: (noteId, invariantId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || !note.invariants) return;
          const inv = note.invariants.find((i) => i.id === invariantId);
          if (!inv) return;
          inv.status = 'rejected';
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      restoreInvariant: (noteId, invariantId) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note || !note.invariants) return;
          const inv = note.invariants.find((i) => i.id === invariantId);
          if (!inv) return;
          // Restore from rejected → needs_review if AI-inferred, else confirmed
          inv.status = inv.provenance === 'assumption' ? 'needs_review' : 'confirmed';
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      // ──────────────────────────────────────────────────────────────
      // Spec Bundle — Dto
      // ──────────────────────────────────────────────────────────────

      updateDtoFields: (noteId, fields) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          note.dtoFields = fields;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      // ──────────────────────────────────────────────────────────────
      // Spec Bundle — Remodel
      // ──────────────────────────────────────────────────────────────

      updateRemodelBehavior: (remodelId, behavior) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const remodel = board.remodels.find((r: Remodel) => r.id === remodelId);
          if (!remodel) return;
          remodel.behavior = behavior;
          remodel.updatedAt = new Date().toISOString();
          board.updatedAt = remodel.updatedAt;
          state.project.updatedAt = remodel.updatedAt;
        }),

      updateRemodelParameters: (remodelId, parameters) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const remodel = board.remodels.find((r: Remodel) => r.id === remodelId);
          if (!remodel) return;
          remodel.parameters = parameters;
          remodel.updatedAt = new Date().toISOString();
          board.updatedAt = remodel.updatedAt;
          state.project.updatedAt = remodel.updatedAt;
        }),

      updateRemodelReturnType: (remodelId, returnType) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const remodel = board.remodels.find((r: Remodel) => r.id === remodelId);
          if (!remodel) return;
          remodel.returnType = returnType;
          remodel.updatedAt = new Date().toISOString();
          board.updatedAt = remodel.updatedAt;
          state.project.updatedAt = remodel.updatedAt;
        }),

      // ──────────────────────────────────────────────────────────────
      // Spec Bundle — Policy
      // ──────────────────────────────────────────────────────────────

      updatePolicyTrigger: (noteId, trigger) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          if (trigger === undefined) {
            delete note.policyTrigger;
          } else {
            note.policyTrigger = trigger;
          }
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),

      updatePolicyIssues: (noteId, issues) =>
        set((state) => {
          const board = findActiveBoard(state);
          if (!board) return;
          const note = board.notes.find((n: StickyNote) => n.id === noteId);
          if (!note) return;
          note.policyIssues = issues;
          note.updatedAt = new Date().toISOString();
          board.updatedAt = note.updatedAt;
          state.project.updatedAt = note.updatedAt;
        }),
    })),
    {
      name: 'event-storming-board',
      version: 16,
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

        if (version < 10) {
          // v9 → v10: Add groupEventId to existing DomainEvent satellite notes
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              // For DomainEvent notes with commandId, set groupEventId on the Command note
              for (const note of board.notes) {
                if (note.type === 'DomainEvent' && note.commandId) {
                  const commandNote = board.notes.find((n: StickyNote) => n.id === note.commandId);
                  if (commandNote) {
                    commandNote.groupEventId = note.id;
                  }
                }
                // For DomainEvent notes with entityId, set groupEventId on the Entity/Aggregate note
                if (note.type === 'DomainEvent' && note.entityId) {
                  const entityNote = board.notes.find((n: StickyNote) => n.id === note.entityId);
                  if (entityNote) {
                    entityNote.groupEventId = note.id;
                    // Promote Aggregate to Entity if referenced by a DomainEvent's entityId
                    if (entityNote.type === 'Aggregate') {
                      (entityNote as StickyNote).type = 'Entity';
                    }
                  }
                }
              }
            }
          }
          return persistedState as BoardStore;
        }

        if (version < 11) {
          // v10 → v11: Rename AggregateRoot type → Aggregate; migrate aggregateRootId links to isAggregateRoot/linkedAggregateNoteId
          const s = persistedState as { project?: Project };
          if (s.project) {
            for (const board of s.project.boards) {
              // Rename all AggregateRoot-typed notes to Aggregate
              for (const note of board.notes) {
                if ((note.type as string) === 'AggregateRoot') {
                  (note as StickyNote).type = 'Aggregate';
                }
              }
              // For each Entity with aggregateRootId, migrate to isAggregateRoot + linkedAggregateNoteId
              for (const note of board.notes) {
                if (note.type === 'Entity' && note.aggregateRootId) {
                  const aggNote = board.notes.find((n: StickyNote) => n.id === note.aggregateRootId);
                  if (aggNote) {
                    note.isAggregateRoot = true;
                    note.linkedAggregateNoteId = aggNote.id;
                  }
                  note.aggregateRootId = undefined;
                }
              }
            }
          }
          return persistedState as BoardStore;
        }

        if (version < 12) {
          // v11 → v12: add customTypes to project
          const s = persistedState as { project?: Project };
          if (s.project && !s.project.customTypes) {
            s.project.customTypes = [];
          }
          return persistedState as BoardStore;
        }

        if (version < 13) {
          // v12 → v13: add behavior field to DomainEvent notes (optional, no migration needed)
          return persistedState as BoardStore;
        }

        if (version < 14) {
          // v13 → v14: add Spec Bundle fields
          //   - StickyNote: aggregateIdentity, stateProperties, invariants, dtoFields
          //   - Remodel: behavior, parameters, returnType
          // All fields are optional; legacy data keeps them undefined. No-op migration.
          return persistedState as BoardStore;
        }

        if (version < 15) {
          // v14 → v15: heal corrupted activeBoardId / openBoardIds.
          // Earlier wire-strip work + ad-hoc testing left some users with
          // localStorage where these fields are undefined or reference
          // boards that no longer exist; downstream code (.includes(),
          // .filter(), openBoard mutator) crashes on those values. Normalize
          // here so persisted state is always usable on rehydrate.
          const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
          if (s.project) {
            const validIds = new Set(s.project.boards.map((b) => b.id));
            const fallback = s.project.boards[0]?.id ?? '';
            if (!s.project.activeBoardId || !validIds.has(s.project.activeBoardId)) {
              s.project.activeBoardId = fallback;
            }
            const arr = Array.isArray(s.project.openBoardIds) ? s.project.openBoardIds : [];
            const filtered = arr.filter((id) => validIds.has(id));
            s.project.openBoardIds = filtered.length > 0
              ? filtered
              : (fallback ? [fallback] : []);
          }
          // Fall through into the v15 → v16 migration below so v14 users land
          // on v16 in a single rehydrate.
        }

        if (version <= 15) {
          // v15 → v16: per-tab UI state moves out of project into the new
          // event-storming-ui localStorage entry. Write it directly here —
          // useUIStore hasn't been created yet at migration time, so calling
          // useUIStore.setState() would throw or silently no-op.
          const s = persistedState as { project?: Project & { activeBoardId?: string; openBoardIds?: string[] } };
          if (s.project) {
            const validIds = new Set(s.project.boards.map((b) => b.id));
            const fallback = s.project.boards[0]?.id ?? '';
            const activeBoardId =
              s.project.activeBoardId && validIds.has(s.project.activeBoardId)
                ? s.project.activeBoardId
                : fallback;
            const open = Array.isArray(s.project.openBoardIds)
              ? s.project.openBoardIds.filter((id) => validIds.has(id))
              : [];
            const openBoardIds = open.length > 0 ? open : (fallback ? [fallback] : []);

            const uiPayload = { state: { activeBoardId, openBoardIds }, version: 1 };
            try {
              localStorage.setItem('event-storming-ui', JSON.stringify(uiPayload));
            } catch {
              // localStorage full / private mode — uiStore rehydrate will use
              // the empty initial state, and useReconcileUIState() will fall
              // back to boards[0] on first React render.
            }
            delete s.project.activeBoardId;
            delete s.project.openBoardIds;
          }
          return persistedState as BoardStore;
        }

        return persistedState as BoardStore;
      },
    }
  )
);
