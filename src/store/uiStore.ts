import { create } from 'zustand';
import type { UIState } from '../types/board';

interface UIStore extends UIState {
  currentView: 'home' | 'board';
  setCurrentView: (view: 'home' | 'board') => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setSelectedNoteIds: (ids: string[]) => void;
  toggleNoteSelection: (id: string) => void;
  setActiveToolType: (type: string | null) => void;
  setIsDraggingCanvas: (dragging: boolean) => void;
  resetView: () => void;
  setLinkingMode: (enabled: boolean) => void;
  setLinkFrom: (id: string | null, type: 'note' | 'bundle' | null) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  currentView: 'board',
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedNoteIds: [],
  activeToolType: 'DomainEvent',
  isDraggingCanvas: false,
  isLinkingMode: false,
  linkFromId: null,
  linkFromType: null,

  setCurrentView: (view) => set({ currentView: view }),
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
  setLinkingMode: (enabled) => set({ isLinkingMode: enabled, linkFromId: null, linkFromType: null }),
  setLinkFrom: (id, type) => set({ linkFromId: id, linkFromType: type }),
}));
