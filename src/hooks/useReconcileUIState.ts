import { useEffect, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useUIStore } from '../store/uiStore';
import type { UIState } from '../types/board';

// Aligns uiStore per-tab UI state with boardStore.project.boards:
//   - on first mount, supplies an initial activeBoardId / openBoardIds when
//     uiStore was hydrated empty (replaces the older onRehydrateStorage hook
//     which read across stores during hydration and could trip TDZ);
//   - when the boards collection changes (add/delete), prunes stale
//     openBoardIds and heals an activeBoardId that no longer points to a
//     real board.
//
// Mount once at the App.tsx top level (one tick per browser tab).
export function useReconcileUIState(): void {
  const boards = useBoardStore((s) => s.project.boards);
  // Use an id-list signature instead of `boards` so the effect only runs
  // when the *collection* changes. zustand+immer rebuilds boards on any
  // child mutation (note edit, link add), and using boards directly would
  // re-fire reconcile on every keystroke — harmless but noisy.
  const boardIdSignature = useMemo(
    () => boards.map((b) => b.id).join(','),
    [boards]
  );
  useEffect(() => {
    const validIds = new Set(boards.map((b) => b.id));
    const fallback = boards[0]?.id ?? '';
    const ui = useUIStore.getState();

    const next: Partial<UIState> = {};
    let changed = false;

    if (!ui.activeBoardId || !validIds.has(ui.activeBoardId)) {
      if (fallback) {
        next.activeBoardId = fallback;
        changed = true;
      }
    }

    const currentOpen = Array.isArray(ui.openBoardIds) ? ui.openBoardIds : [];
    const filteredOpen = currentOpen.filter((id) => validIds.has(id));
    const resolvedActive = next.activeBoardId ?? ui.activeBoardId;
    const newOpen =
      filteredOpen.length > 0
        ? filteredOpen
        : resolvedActive
          ? [resolvedActive]
          : fallback
            ? [fallback]
            : [];
    if (
      newOpen.length !== currentOpen.length ||
      !newOpen.every((id, i) => id === currentOpen[i])
    ) {
      next.openBoardIds = newOpen;
      changed = true;
    }

    if (changed) useUIStore.setState(next);
    // deps tracked via boardIdSignature; boards itself is read inside via
    // closure — getState() guarantees the freshest reference, so we don't
    // need to widen deps and re-fire on intra-board edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIdSignature]);
}
