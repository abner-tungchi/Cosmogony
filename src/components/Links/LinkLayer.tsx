import React from 'react';
import { LinkArrow } from './LinkArrow';
import { getAnchorPoints } from '../../utils/linkUtils';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import type { Link } from '../../types/elements';

export const LinkLayer: React.FC = () => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const { deleteLink } = useBoardStore();

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
          activeBoard.notes, activeBoard.bundles
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
