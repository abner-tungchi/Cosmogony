import type { StickyNote, Link, FlowPath, Remodel, Property } from './elements';
import type {
  AggregateIdentity,
  DtoField,
  Invariant,
  ReturnTypeSpec,
} from './specs';

export interface Board {
  id: string;
  name: string;
  parentContextId?: string;   // if set, this is an actor sub-board inside a context
  notes: StickyNote[];
  remodels: Remodel[];
  links: Link[];
  flowPaths: FlowPath[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  boards: Board[];
  activeBoardId: string;
  openBoardIds: string[];   // boards visible as tabs (subset of boards)
  customTypes?: string[];   // user-defined types, shared across the project
  createdAt: string;
  updatedAt: string;
}

export interface UIState {
  zoom: number;
  panX: number;
  panY: number;
  selectedNoteIds: string[];
  activeToolType: string | null;
  isDraggingCanvas: boolean;
  isLinkingMode: boolean;
  linkFromId: string | null;
  linkFromType: 'note' | 'remodel' | null;
}

export interface BoardStore {
  project: Project;

  // Load entire project (e.g. from server on first connect)
  loadProject: (project: Project) => void;

  // Project management
  setProjectName: (name: string) => void;
  setBoardName: (name: string) => void; // legacy alias
  addBoard: (name: string) => string;   // creates + opens, returns new board id
  addActorBoard: (contextId: string, name: string) => string;
  deleteBoard: (id: string) => void;
  closeBoard: (id: string) => void;
  openBoard: (id: string) => void;
  setActiveBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;

  // Active board operations
  addNote: (note: StickyNote) => void;
  updateNote: (id: string, updates: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  addLink: (link: Link) => void;
  deleteLink: (id: string) => void;
  clearBoard: () => void;

  // DomainEvent-centric actions
  addCommandForEvent: (eventNoteId: string, commandLabel: string, information: Property[]) => void;
  updateCommandInformation: (commandId: string, information: Property[]) => void;
  updateEventProperties: (eventId: string, eventProperties: Property[]) => void;
  linkEntityToEvent: (eventId: string, entityId: string | undefined) => void;
  addEntityForEvent: (eventNoteId: string, entityLabel: string) => void;
  linkEntityToAggregateRoot: (entityNoteId: string, aggregateRootId: string) => void;
  unlinkEntityFromAggregateRoot: (entityNoteId: string) => void;
  setEntityAsAggregateRoot: (entityNoteId: string) => void;
  unsetEntityAsAggregateRoot: (aggregateNoteId: string) => void;
  linkEventToAggregate: (eventId: string, aggregateNoteId: string) => void;

  // Remodel management (active board)
  addRemodel: (remodel: Remodel) => void;
  updateRemodel: (id: string, updates: Partial<Remodel>) => void;
  deleteRemodel: (id: string) => void;

  // FlowPath management (active board)
  addFlowPath: (flowPath: FlowPath) => void;
  updateFlowPath: (id: string, updates: Partial<FlowPath>) => void;
  deleteFlowPath: (id: string) => void;

  // Custom types (project-level)
  addCustomType: (typeName: string) => void;

  // --- Spec Bundle: Aggregate ---
  updateAggregateIdentity: (noteId: string, identity: AggregateIdentity) => void;
  updateStateProperties: (noteId: string, stateProperties: Property[]) => void;
  addInvariant: (noteId: string, invariant: Invariant) => void;
  updateInvariant: (noteId: string, invariantId: string, updates: Partial<Invariant>) => void;
  deleteInvariant: (noteId: string, invariantId: string) => void;
  approveInvariant: (noteId: string, invariantId: string) => void;
  rejectInvariant: (noteId: string, invariantId: string) => void;
  restoreInvariant: (noteId: string, invariantId: string) => void;

  // --- Spec Bundle: Dto ---
  updateDtoFields: (noteId: string, fields: DtoField[]) => void;

  // --- Spec Bundle: Remodel ---
  updateRemodelBehavior: (remodelId: string, behavior: string) => void;
  updateRemodelParameters: (remodelId: string, parameters: Property[]) => void;
  updateRemodelReturnType: (remodelId: string, returnType: ReturnTypeSpec) => void;
}
