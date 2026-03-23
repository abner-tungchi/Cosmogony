import React, { useMemo } from 'react';
import type { StickyNote } from '../../types/elements';

const LANE_HEIGHT = 10000;
const LABEL_TOP = 16;
const DIVIDER_COLOR = 'rgba(0,0,0,0.1)';
const LABEL_BG = 'rgba(255,255,255,0.85)';
const LABEL_BORDER = 'rgba(0,0,0,0.08)';
const LABEL_TEXT_COLOR = '#64748b';

interface PhaseRange {
  name: string;
  minX: number;
  maxX: number;
}

interface PhaseLaneProps {
  notes: StickyNote[];
}

function computePhaseRanges(notes: StickyNote[]): PhaseRange[] {
  const phaseMap = new Map<string, { minX: number; maxX: number }>();

  const expandRange = (phase: string, x: number, rightEdge: number) => {
    const existing = phaseMap.get(phase);
    if (!existing) {
      phaseMap.set(phase, { minX: x, maxX: rightEdge });
    } else {
      existing.minX = Math.min(existing.minX, x);
      existing.maxX = Math.max(existing.maxX, rightEdge);
    }
  };

  for (const note of notes) {
    if (!note.phase) continue;
    expandRange(note.phase, note.position.x, note.position.x + note.size.width);
  }

  const ranges: PhaseRange[] = [];
  for (const [name, { minX, maxX }] of phaseMap.entries()) {
    ranges.push({ name, minX, maxX });
  }

  ranges.sort((a, b) => a.minX - b.minX);
  return ranges;
}

export const PhaseLane: React.FC<PhaseLaneProps> = ({ notes }) => {
  const phases = useMemo(() => computePhaseRanges(notes), [notes]);

  if (phases.length === 0) return null;

  const dividerXs: number[] = [];
  for (let i = 0; i < phases.length - 1; i++) {
    const leftMax = phases[i].maxX;
    const rightMin = phases[i + 1].minX;
    const divX = leftMax >= rightMin ? rightMin : (leftMax + rightMin) / 2;
    dividerXs.push(divX);
  }

  return (
    <>
      {phases.map((phase, i) => {
        const leftBound = i === 0
          ? phase.minX - 80
          : (dividerXs[i - 1] ?? phase.minX);
        const rightBound = i === phases.length - 1
          ? phase.maxX + 80
          : (dividerXs[i] ?? phase.maxX);
        const width = rightBound - leftBound;

        return (
          <div
            key={`phase-bg-${phase.name}`}
            style={{
              position: 'absolute',
              left: leftBound,
              top: 0,
              width,
              height: LANE_HEIGHT,
              background: i % 2 === 0 ? 'rgba(0,0,0,0.015)' : 'transparent',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        );
      })}

      {dividerXs.map((x, i) => (
        <div
          key={`phase-divider-${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: LANE_HEIGHT,
            borderLeft: `1px dashed ${DIVIDER_COLOR}`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      ))}

      {phases.map((phase, i) => {
        const leftBound = i === 0
          ? phase.minX - 80
          : (dividerXs[i - 1] ?? phase.minX);
        const rightBound = i === phases.length - 1
          ? phase.maxX + 80
          : (dividerXs[i] ?? phase.maxX);
        const centerX = (leftBound + rightBound) / 2;

        return (
          <div
            key={`phase-label-${phase.name}`}
            style={{
              position: 'absolute',
              top: LABEL_TOP,
              left: centerX,
              transform: 'translateX(-50%)',
              background: LABEL_BG,
              border: `1px solid ${LABEL_BORDER}`,
              borderRadius: 20,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: LABEL_TEXT_COLOR,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 1,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            {phase.name}
          </div>
        );
      })}
    </>
  );
};
