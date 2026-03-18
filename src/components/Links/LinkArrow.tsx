import React from 'react';

interface Props {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  label?: string;
  id?: string;
  onDelete?: (id: string) => void;
  isPreview?: boolean;
}

export const LinkArrow: React.FC<Props> = ({ fx, fy, tx, ty, label, id, onDelete, isPreview }) => {
  const dx = tx - fx;
  const dy = ty - fy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const cpOffset = Math.min(dist * 0.4, 120);

  // Control points for bezier curve
  const cp1x = fx + (dx > 0 ? cpOffset : -cpOffset) * (Math.abs(dx) > Math.abs(dy) ? 1 : 0.3);
  const cp1y = fy + (dy > 0 ? cpOffset : -cpOffset) * (Math.abs(dx) > Math.abs(dy) ? 0.3 : 1);
  const cp2x = tx - (dx > 0 ? cpOffset : -cpOffset) * (Math.abs(dx) > Math.abs(dy) ? 1 : 0.3);
  const cp2y = ty - (dy > 0 ? cpOffset : -cpOffset) * (Math.abs(dx) > Math.abs(dy) ? 0.3 : 1);

  const pathD = `M ${fx} ${fy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`;
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;

  const markerId = `arrowhead-${id || 'preview'}`;

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill={isPreview ? '#94a3b8' : '#475569'}
          />
        </marker>
      </defs>

      <path
        d={pathD}
        fill="none"
        stroke={isPreview ? '#94a3b8' : '#475569'}
        strokeWidth="2"
        strokeDasharray={isPreview ? '6 3' : undefined}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: 'none' }}
      />

      {label && (
        <text
          x={midX}
          y={midY - 6}
          textAnchor="middle"
          fontSize="12"
          fill="#475569"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {label}
        </text>
      )}

      {id && onDelete && (
        <g
          style={{ cursor: 'pointer', pointerEvents: 'all' }}
          onClick={() => onDelete(id)}
        >
          <circle cx={midX} cy={midY} r={8} fill="white" stroke="#ef4444" strokeWidth="1.5" opacity="0" className="link-delete-btn" />
          <text x={midX} y={midY + 4} textAnchor="middle" fontSize="12" fill="#ef4444" opacity="0" className="link-delete-btn">
            ×
          </text>
        </g>
      )}
    </g>
  );
};
