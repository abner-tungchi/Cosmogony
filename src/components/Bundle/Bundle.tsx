import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Bundle as BundleType, BundleSubNote, FlowPath } from '../../types/elements';
import { useBoardStore } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import { COLLAPSED_BUNDLE_W, COLLAPSED_BUNDLE_H } from '../../utils/linkUtils';
import { PathDots } from '../PathBar/PathDots';

const SUB_W = 160;
const SUB_H = 120;
const GAP = 8;

// Sub-note offsets relative to bundle position
// Info (yellow) top-center
const INFO_X = SUB_W + GAP;
const INFO_Y = 0;
// Entity (green) left
const ENTITY_X = 0;
const ENTITY_Y = SUB_H + GAP;
// Command (blue) center
const COMMAND_X = SUB_W + GAP;
const COMMAND_Y = SUB_H + GAP;
// Event (orange) right
const EVENT_X = (SUB_W + GAP) * 2;
const EVENT_Y = SUB_H + GAP;

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

const SubNote: React.FC<SubNoteProps> = ({ label, content, bgColor, textColor, offsetX, offsetY, onSave, zoom }) => {
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
    // Only close editor if focus leaves the entire sub-note container
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
              background: 'rgba(255,255,255,0.3)',
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
              background: 'rgba(255,255,255,0.2)',
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
  bundle: BundleType;
  onLinkClick?: (id: string, type: 'bundle') => void;
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

export const Bundle: React.FC<Props> = ({
  bundle,
  onLinkClick,
  onDetailClick,
  activePath = null,
  allPaths = [],
}) => {
  const { updateBundle, deleteBundle } = useBoardStore();
  const { zoom, isLinkingMode } = useUIStore();

  const isDimmed =
    activePath !== null &&
    !(bundle.paths ?? []).includes(activePath);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bundle-${bundle.id}`,
    data: { type: 'bundle', bundleId: bundle.id },
  });

  const dragProps = isLinkingMode ? {} : { ...listeners, ...attributes };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLinkingMode) {
      onLinkClick?.(bundle.id, 'bundle');
    } else {
      onDetailClick?.(bundle.id);
    }
  };

  const dimTransform = isDimmed ? ' scale(0.97)' : '';
  const bundleTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)${dimTransform}`
    : isDimmed
    ? 'scale(0.97)'
    : undefined;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: bundle.position.x,
    top: bundle.position.y,
    zIndex: isDragging ? 9999 : bundle.zIndex,
    opacity: isDragging ? 0 : isDimmed ? 0.15 : 1,
    filter: isDimmed ? 'saturate(0.3)' : undefined,
    transform: bundleTransform,
    cursor: isDimmed ? 'default' : isLinkingMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
    pointerEvents: isDimmed ? 'none' : 'auto',
    transition: isDragging ? 'none' : 'opacity 200ms ease, transform 200ms ease, filter 200ms ease',
  };

  // ── Collapsed view ──────────────────────────────────────────────────────────
  if (bundle.collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...baseStyle,
          width: COLLAPSED_BUNDLE_W,
          height: COLLAPSED_BUNDLE_H,
          backgroundColor: '#FF8C00',
          color: 'white',
          borderRadius: 6,
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `6px 36px 6px 12px`,
          overflow: 'hidden',
        }}
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
        {...dragProps}
      >
        {/* Entity / AR — top row */}
        {bundle.infoNote.label && (
          <div style={{
            fontSize: `${10 / zoom}px`,
            opacity: 0.75,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 2,
          }}>
            {bundle.infoNote.label}
          </div>
        )}

        {/* Command — middle row, blue pill */}
        {bundle.commandNote.label && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: '#1E88E5',
            borderRadius: 3,
            padding: `1px 5px`,
            fontSize: `${10 / zoom}px`,
            fontWeight: 600,
            marginBottom: 3,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}>
            {bundle.commandNote.label}
          </div>
        )}

        {/* Domain Event — main row */}
        <div style={{
          fontSize: `${12 / zoom}px`,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {bundle.eventNote.label || 'Domain Event'}
        </div>

        {/* Expand button */}
        <button
          onClick={(e) => { e.stopPropagation(); updateBundle(bundle.id, { collapsed: false }); }}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.25)',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            padding: '3px 6px',
            fontSize: `${11 / zoom}px`,
            lineHeight: 1,
          }}
          title="展開 Bundle"
        >
          ▼
        </button>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); deleteBundle(bundle.id); }}
          style={{ ...BTN_STYLE, right: -8, background: '#ef4444' }}
        >
          ×
        </button>

        <PathDots pathIds={bundle.paths ?? []} allPaths={allPaths} />
      </div>
    );
  }

  // ── Expanded view ───────────────────────────────────────────────────────────
  const BUNDLE_W = SUB_W * 3 + GAP * 2;
  const BUNDLE_H = SUB_H * 2 + GAP;

  const saveSub = (key: keyof Pick<BundleType, 'infoNote' | 'entityNote' | 'commandNote' | 'eventNote'>) =>
    (label: string, content: string) => {
      updateBundle(bundle.id, { [key]: { label, content } as BundleSubNote });
    };

  return (
    <div
      ref={setNodeRef}
      style={{ ...baseStyle, width: BUNDLE_W, height: BUNDLE_H }}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...dragProps}
    >
      {/* Info (yellow/Entity → Aggregate Root) - top center */}
      <SubNote
        label={bundle.infoNote.label}
        content={bundle.infoNote.content}
        bgColor="#FFD600"
        textColor="#333333"
        offsetX={INFO_X}
        offsetY={INFO_Y}
        onSave={saveSub('infoNote')}
        zoom={zoom}
      />

      {/* Params (green/Command Parameters) - bottom left */}
      <SubNote
        label={bundle.entityNote.label}
        content={bundle.entityNote.content}
        bgColor="#43A047"
        textColor="#ffffff"
        offsetX={ENTITY_X}
        offsetY={ENTITY_Y}
        onSave={saveSub('entityNote')}
        zoom={zoom}
      />

      {/* Command (blue) - bottom center */}
      <SubNote
        label={bundle.commandNote.label}
        content={bundle.commandNote.content}
        bgColor="#1E88E5"
        textColor="#ffffff"
        offsetX={COMMAND_X}
        offsetY={COMMAND_Y}
        onSave={saveSub('commandNote')}
        zoom={zoom}
      />

      {/* Event (orange) - bottom right */}
      <SubNote
        label={bundle.eventNote.label}
        content={bundle.eventNote.content}
        bgColor="#FF8C00"
        textColor="#ffffff"
        offsetX={EVENT_X}
        offsetY={EVENT_Y}
        onSave={saveSub('eventNote')}
        zoom={zoom}
      />

      {/* Collapse button — top left */}
      <button
        onClick={(e) => { e.stopPropagation(); updateBundle(bundle.id, { collapsed: true }); }}
        style={{ ...BTN_STYLE, left: -8, background: '#FF8C00' }}
        title="收起 Bundle"
      >
        ▲
      </button>

      {/* Delete button — top right */}
      <button
        onClick={(e) => { e.stopPropagation(); deleteBundle(bundle.id); }}
        style={{ ...BTN_STYLE, right: -8, background: '#ef4444' }}
      >
        ×
      </button>

      <PathDots pathIds={bundle.paths ?? []} allPaths={allPaths} />
    </div>
  );
};
