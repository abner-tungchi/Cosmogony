import { useMemo } from 'react';
import { useBoardStore } from './boardStore';
import { useUIStore } from './uiStore';
import type { Board } from '../types/board';

// Subscribes to both boardStore.project.boards and uiStore.activeBoardId so
// either change triggers a re-render. Without this combined selector, a
// component that reads activeBoardId off boardStore would miss uiStore
// updates (cross-store reactivity loss flagged in 2026-04-30 audit, H1).
export function useActiveBoard(): Board {
  const boards = useBoardStore((s) => s.project.boards);
  const activeBoardId = useUIStore((s) => s.activeBoardId);
  return useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? boards[0],
    [boards, activeBoardId]
  );
}
