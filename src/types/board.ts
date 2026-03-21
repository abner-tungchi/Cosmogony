import type { StickyNote, Bundle, Link, FlowPath } from './elements';

export interface Board {
  id: string;
  name: string;
  notes: StickyNote[];
  bundles: Bundle[];
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
  linkFromType: 'note' | 'bundle' | null;
}

export interface BoardStore {
  project: Project;

  // Load entire project (e.g. from server on first connect)
  loadProject: (project: Project) => void;

  // Project management
  setProjectName: (name: string) => void;
  setBoardName: (name: string) => void; // legacy alias
  addBoard: (name: string) => string;   // creates + opens, returns new board id
  deleteBoard: (id: string) => void;    // permanent delete from project
  closeBoard: (id: string) => void;     // remove from openBoardIds, keep in project
  openBoard: (id: string) => void;      // add to openBoardIds, set active
  setActiveBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;

  // Active board operations
  addNote: (note: StickyNote) => void;
  updateNote: (id: string, updates: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  addBundle: (bundle: Bundle) => void;
  updateBundle: (id: string, updates: Partial<Bundle>) => void;
  deleteBundle: (id: string) => void;
  addLink: (link: Link) => void;
  deleteLink: (id: string) => void;
  clearBoard: () => void;
  expandNoteToBundle: (noteId: string) => void;
  collapseAllBundles: () => void;
  expandAllBundles: () => void;

  // FlowPath management (active board)
  addFlowPath: (flowPath: FlowPath) => void;
  updateFlowPath: (id: string, updates: Partial<FlowPath>) => void;
  deleteFlowPath: (id: string) => void;
}
