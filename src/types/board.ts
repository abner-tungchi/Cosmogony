import type { StickyNote, Link, FlowPath, Remodel, Property } from './elements';

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

  // Remodel management (active board)
  addRemodel: (remodel: Remodel) => void;
  updateRemodel: (id: string, updates: Partial<Remodel>) => void;
  deleteRemodel: (id: string) => void;

  // FlowPath management (active board)
  addFlowPath: (flowPath: FlowPath) => void;
  updateFlowPath: (id: string, updates: Partial<FlowPath>) => void;
  deleteFlowPath: (id: string) => void;
}
