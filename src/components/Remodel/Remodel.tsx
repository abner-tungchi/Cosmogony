import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Remodel as RemodelType, BundleSubNote, FlowPath } from '../../types/elements';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import { isUniverseRemodel } from '../../utils/remodelUtils';
import { PathDots } from '../PathBar/PathDots';

const SUB_W = 160;
const SUB_H = 120;
const GAP = 8;

// Sub-note offsets (same layout as Bundle)
const INFO_X = SUB_W + GAP;
const INFO_Y = 0;
const ENTITY_X = 0;
const ENTITY_Y = SUB_H + GAP;
const COMMAND_X = SUB_W + GAP;
const COMMAND_Y = SUB_H + GAP;
const EVENT_X = (SUB_W + GAP) * 2;
const EVENT_Y = SUB_H + GAP;

// Remodel color palette (cool tones — distinct from Bundle's warm palette)
const COLORS = {
  aggregate: '#e9d5ff',   // top: light purple (Aggregate read perspective)
  parameter: '#cffafe',   // bottom-left: cyan (Query parameters)
  query: '#bfdbfe',       // bottom-center: blue-gray (Query name)
  sourceEvent: '#ede9fe', // bottom-right: lavender (Source events)
  text: '#1e293b',
} as const;

interface SubNoteProps {
  label: string;
  content: string;
  bgColor: string;
  textColor: string;
  offsetX: number;
  offsetY: number;
  onSave: (label: string, content: string) => void;
  zoom: number;
}

const SubNote: React.FC<SubNoteProps> = ({
  label, content, bgColor, textColor, offsetX, offsetY, onSave, zoom,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [editContent, setEditContent] = useState(content);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLabel(label);
    setEditContent(content);
    setIsEditing(true);
  };

  const handleContainerBlur = (e: React.FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsEditing(false);
    onSave(editLabel, editContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditLabel(label);
      setEditContent(content);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: offsetX,
        top: offsetY,
        width: SUB_W,
        height: SUB_H,
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: 6,
        padding: 8,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: `${13 / zoom}px`,
        cursor: 'default',
        overflow: 'hidden',
      }}
      onDoubleClick={handleDoubleClick}
      onBlur={handleContainerBlur}
    >
      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
          <input
            autoFocus
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(255,255,255,0.4)',
              border: 'none',
              outline: 'none',
              color: textColor,
              fontSize: `${12 / zoom}px`,
              fontWeight: 700,
              padding: '2px 4px',
              borderRadius: 3,
              width: '100%',
            }}
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.3)',
              border: 'none',
              outline: 'none',
              color: textColor,
              fontSize: `${11 / zoom}px`,
              resize: 'none',
              padding: '2px 4px',
              borderRadius: 3,
              fontFamily: 'inherit',
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ fontSize: `${11 / zoom}px`, fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>
            {label || <span style={{ opacity: 0.5 }}>Label</span>}
          </div>
          <div style={{ fontSize: `${11 / zoom}px`, lineHeight: 1.4, opacity: 0.85, overflow: 'hidden', wordBreak: 'break-word' }}>
            {content || <span style={{ opacity: 0.4 }}>Double-click to edit</span>}
          </div>
        </>
      )}
    </div>
  );
};

interface Props {
  remodel: RemodelType;
  onLinkTarget?: (id: string, type: 'note' | 'bundle' | 'remodel') => void;
  onDetailClick?: (id: string) => void;
  activePath?: string | null;
  allPaths?: FlowPath[];
}

const BTN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: -8,
  width: 20,
  height: 20,
  borderRadius: '50%',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 'bold',
  zIndex: 10000,
  lineHeight: 1,
};

export const Remodel: React.FC<Props> = ({
  remodel,
  onLinkTarget,
  onDetailClick,
  activePath = null,
  allPaths = [],
}) => {
  const { updateRemodel, deleteRemodel } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);
  const { zoom, isLinkingMode } = useUIStore();

  const isDimmed =
    activePath !== null &&
    !(remodel.paths ?? []).includes(activePath);

  const isUniverse = isUniverseRemodel(remodel, activeBoard.bundles);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `remodel-${remodel.id}`,
    data: { type: 'remodel', remodelId: remodel.id },
  });

  const dragProps = isLinkingMode ? {} : { ...listeners, ...attributes };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLinkingMode) {
      onLinkTarget?.(remodel.id, 'remodel');
    } else {
      onDetailClick?.(remodel.id);
    }
  };

  const dimTransform = isDimmed ? ' scale(0.97)' : '';
  const remodelTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)${dimTransform}`
    : isDimmed
    ? 'scale(0.97)'
    : undefined;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: remodel.position.x,
    top: remodel.position.y,
    zIndex: isDragging ? 9999 : remodel.zIndex,
    opacity: isDragging ? 0 : isDimmed ? 0.15 : 1,
    filter: isDimmed ? 'saturate(0.3)' : undefined,
    transform: remodelTransform,
    cursor: isDimmed ? 'default' : isLinkingMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
    pointerEvents: isDimmed ? 'none' : 'auto',
    transition: isDragging ? 'none' : 'opacity 200ms ease, transform 200ms ease, filter 200ms ease',
  };

  const REMODEL_W = SUB_W * 3 + GAP * 2;
  const REMODEL_H = SUB_H * 2 + GAP;

  const saveSub = (key: keyof Pick<RemodelType, 'aggregateNote' | 'parameterNote' | 'queryNote' | 'sourceEventNote'>) =>
    (label: string, content: string) => {
      updateRemodel(remodel.id, { [key]: { label, content } as BundleSubNote });
    };

  return (
    <div
      ref={setNodeRef}
      style={{ ...baseStyle, width: REMODEL_W, height: REMODEL_H }}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...dragProps}
    >
      {/* Aggregate (light purple) — top center */}
      <SubNote
        label={remodel.aggregateNote.label}
        content={remodel.aggregateNote.content}
        bgColor={COLORS.aggregate}
        textColor={COLORS.text}
        offsetX={INFO_X}
        offsetY={INFO_Y}
        onSave={saveSub('aggregateNote')}
        zoom={zoom}
      />

      {/* Parameters (cyan) — bottom left */}
      <SubNote
        label={remodel.parameterNote.label}
        content={remodel.parameterNote.content}
        bgColor={COLORS.parameter}
        textColor={COLORS.text}
        offsetX={ENTITY_X}
        offsetY={ENTITY_Y}
        onSave={saveSub('parameterNote')}
        zoom={zoom}
      />

      {/* Query (blue-gray) — bottom center */}
      <SubNote
        label={remodel.queryNote.label}
        content={remodel.queryNote.content}
        bgColor={COLORS.query}
        textColor={COLORS.text}
        offsetX={COMMAND_X}
        offsetY={COMMAND_Y}
        onSave={saveSub('queryNote')}
        zoom={zoom}
      />

      {/* Source Event (lavender) — bottom right */}
      <SubNote
        label={remodel.sourceEventNote.label}
        content={remodel.sourceEventNote.content}
        bgColor={COLORS.sourceEvent}
        textColor={COLORS.text}
        offsetX={EVENT_X}
        offsetY={EVENT_Y}
        onSave={saveSub('sourceEventNote')}
        zoom={zoom}
      />

      {/* Universe badge — shown when linkedBundleIds spans > 1 distinct Aggregate */}
      {isUniverse && (
        <div
          title="Universe Remodel — crosses multiple Aggregates"
          style={{
            position: 'absolute',
            top: 4,
            right: 28, // offset left of the delete button
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: '#7c3aed',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            pointerEvents: 'none',
          }}
        >
          ∪
        </div>
      )}

      {/* Delete button — top right */}
      <button
        onClick={(e) => { e.stopPropagation(); deleteRemodel(remodel.id); }}
        style={{ ...BTN_STYLE, right: -8, background: '#ef4444' }}
      >
        ×
      </button>

      <PathDots pathIds={remodel.paths ?? []} allPaths={allPaths} />
    </div>
  );
};
