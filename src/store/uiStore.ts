import { create } from 'zustand';
import type { UIState } from '../types/board';
import type { StickyNote, Remodel } from '../types/elements';

const NOTE_DEFAULT_WIDTH = 160;
const NOTE_DEFAULT_HEIGHT = 80;
const REMODEL_WIDTH = 496;
const REMODEL_HEIGHT = 248;
const FIT_ALL_PADDING = 80;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

interface FitAllParams {
  notes: StickyNote[];
  remodels: Remodel[];
  viewportWidth: number;
  viewportHeight: number;
}

interface UIStore extends UIState {
  currentView: 'home' | 'board';
  activePath: string | null;
  activeActorFilter: string | null;
  // Detail Panel selection — intentionally not persisted
  selectedElementId: string | null;
  selectedElementType: 'note' | 'remodel' | null;

  setCurrentView: (view: 'home' | 'board') => void;
  setActivePath: (id: string | null) => void;
  setActiveActorFilter: (actorId: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setSelectedNoteIds: (ids: string[]) => void;
  toggleNoteSelection: (id: string) => void;
  setActiveToolType: (type: string | null) => void;
  setIsDraggingCanvas: (dragging: boolean) => void;
  resetView: () => void;
  fitAll: (params: FitAllParams) => void;
  setLinkingMode: (enabled: boolean) => void;
  setLinkFrom: (id: string | null, type: 'note' | 'remodel' | null) => void;
  setSelectedElement: (id: string | null, type: 'note' | 'remodel' | null) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  currentView: 'home',
  activePath: null,
  activeActorFilter: null,
  selectedElementId: null,
  selectedElementType: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedNoteIds: [],
  activeToolType: null,
  isDraggingCanvas: false,
  isLinkingMode: false,
  linkFromId: null,
  linkFromType: null,

  setActivePath: (id) => set({ activePath: id }),
  setActiveActorFilter: (actorId) => set({ activeActorFilter: actorId }),
  setSelectedElement: (id, type) => set({ selectedElementId: id, selectedElementType: type }),
  setCurrentView: (view) => set(view === 'board'
    ? { currentView: view, activeToolType: null, isLinkingMode: false }
    : { currentView: view }
  ),
  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.25, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setSelectedNoteIds: (ids) => set({ selectedNoteIds: ids }),
  toggleNoteSelection: (id) => {
    const { selectedNoteIds } = get();
    if (selectedNoteIds.includes(id)) {
      set({ selectedNoteIds: selectedNoteIds.filter((i) => i !== id) });
    } else {
      set({ selectedNoteIds: [...selectedNoteIds, id] });
    }
  },
  setActiveToolType: (type) => set({ activeToolType: type }),
  setIsDraggingCanvas: (dragging) => set({ isDraggingCanvas: dragging }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
  fitAll: ({ notes, remodels, viewportWidth, viewportHeight }) => {
    const isEmpty = notes.length === 0 && remodels.length === 0;
    if (isEmpty) {
      set({ zoom: 1, panX: 0, panY: 0 });
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const note of notes) {
      const w = note.size?.width ?? NOTE_DEFAULT_WIDTH;
      const h = note.size?.height ?? NOTE_DEFAULT_HEIGHT;
      minX = Math.min(minX, note.position.x);
      minY = Math.min(minY, note.position.y);
      maxX = Math.max(maxX, note.position.x + w);
      maxY = Math.max(maxY, note.position.y + h);
    }

    for (const remodel of remodels) {
      minX = Math.min(minX, remodel.position.x);
      minY = Math.min(minY, remodel.position.y);
      maxX = Math.max(maxX, remodel.position.x + REMODEL_WIDTH);
      maxY = Math.max(maxY, remodel.position.y + REMODEL_HEIGHT);
    }

    const bbWidth = maxX - minX + FIT_ALL_PADDING * 2;
    const bbHeight = maxY - minY + FIT_ALL_PADDING * 2;

    const rawZoom = Math.min(viewportWidth / bbWidth, viewportHeight / bbHeight);
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawZoom));

    const bbCenterX = (minX - FIT_ALL_PADDING) * newZoom;
    const bbCenterY = (minY - FIT_ALL_PADDING) * newZoom;
    const newPanX = viewportWidth / 2 - bbCenterX - (bbWidth * newZoom) / 2;
    const newPanY = viewportHeight / 2 - bbCenterY - (bbHeight * newZoom) / 2;

    set({ zoom: newZoom, panX: newPanX, panY: newPanY });
  },
  setLinkingMode: (enabled) => set({ isLinkingMode: enabled, linkFromId: null, linkFromType: null }),
  setLinkFrom: (id, type) => set({ linkFromId: id, linkFromType: type }),
}));
