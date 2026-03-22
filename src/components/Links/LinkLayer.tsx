import React, { useState } from 'react';
import { useDndMonitor } from '@dnd-kit/core';
import { LinkArrow } from './LinkArrow';
import { getAnchorPoints } from '../../utils/linkUtils';
import type { DragOffset } from '../../utils/linkUtils';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { Link } from '../../types/elements';

export const LinkLayer: React.FC = () => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const { deleteLink } = useBoardStore();
  const { zoom, selectedNoteIds } = useUIStore();
  const [drag, setDrag] = useState<DragOffset | null>(null);

  useDndMonitor({
    onDragMove({ active, delta }) {
      const id = String(active.id);
      const dx = delta.x / zoom;
      const dy = delta.y / zoom;
      if (id.startsWith('bundle-')) {
        setDrag({ noteIds: [], bundleIds: [id.replace('bundle-', '')], remodelIds: [], dx, dy });
      } else if (id.startsWith('remodel-')) {
        setDrag({ noteIds: [], bundleIds: [], remodelIds: [id.replace('remodel-', '')], dx, dy });
      } else {
        // if dragged note is selected, all selected notes move together
        const ids = selectedNoteIds.includes(id) ? selectedNoteIds : [id];
        setDrag({ noteIds: ids, bundleIds: [], remodelIds: [], dx, dy });
      }
    },
    onDragEnd()    { setDrag(null); },
    onDragCancel() { setDrag(null); },
  });

  return (
    <svg
      style={{
        position: 'absolute',
        width: 10000,
        height: 10000,
        top: 0,
        left: 0,
        zIndex: 5,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {activeBoard.links.map((link: Link) => {
        const anchors = getAnchorPoints(
          link.fromId, link.fromType,
          link.toId, link.toType,
          activeBoard.notes, activeBoard.bundles,
          drag,
          activeBoard.remodels
        );
        if (!anchors) return null;
        return (
          <LinkArrow
            key={link.id}
            id={link.id}
            fx={anchors.fx}
            fy={anchors.fy}
            tx={anchors.tx}
            ty={anchors.ty}
            label={link.label}
            onDelete={deleteLink}
          />
        );
      })}
    </svg>
  );
};
