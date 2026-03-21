import React from 'react';
import type { FlowPath } from '../../types/elements';

const MAX_VISIBLE_DOTS = 3;

interface PathDotsProps {
  pathIds: string[];
  allPaths: FlowPath[];
}

export const PathDots: React.FC<PathDotsProps> = ({ pathIds, allPaths }) => {
  if (pathIds.length === 0) return null;

  const matchedPaths = pathIds
    .map((id) => allPaths.find((p) => p.id === id))
    .filter((p): p is FlowPath => p !== undefined);

  if (matchedPaths.length === 0) return null;

  const visible = matchedPaths.slice(0, MAX_VISIBLE_DOTS);
  const overflow = matchedPaths.length - MAX_VISIBLE_DOTS;

  return (
    <div
      style={{
        position: 'absolute',
        top: 5,
        right: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {visible.map((path) => (
        <div
          key={path.id}
          title={path.name}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: path.color,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}
        />
      ))}
      {overflow > 0 && (
        <span
          style={{
            fontSize: 8,
            color: 'rgba(0,0,0,0.45)',
            lineHeight: 1,
            fontWeight: 600,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
