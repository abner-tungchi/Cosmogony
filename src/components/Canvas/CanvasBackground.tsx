import React from 'react';

interface Props {
  zoom: number;
  panX: number;
  panY: number;
}

export const CanvasBackground: React.FC<Props> = ({ zoom, panX, panY }) => {
  const dotSpacing = 30 * zoom;
  const offsetX = panX % dotSpacing;
  const offsetY = panY % dotSpacing;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    >
      <defs>
        <pattern
          id="dot-pattern"
          x={offsetX}
          y={offsetY}
          width={dotSpacing}
          height={dotSpacing}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={dotSpacing / 2} cy={dotSpacing / 2} r={1.5} fill="#d1d5db" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-pattern)" />
    </svg>
  );
};
