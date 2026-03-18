import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Bundle as BundleType, BundleSubNote } from '../../types/elements';
import { useBoardStore } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';

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
}

export const Bundle: React.FC<Props> = ({ bundle, onLinkClick }) => {
  const { updateBundle, deleteBundle } = useBoardStore();
  const { zoom, isLinkingMode } = useUIStore();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bundle-${bundle.id}`,
    data: { type: 'bundle', bundleId: bundle.id },
  });

  const BUNDLE_W = SUB_W * 3 + GAP * 2;
  const BUNDLE_H = SUB_H * 2 + GAP;

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: bundle.position.x,
    top: bundle.position.y,
    width: BUNDLE_W,
    height: BUNDLE_H,
    zIndex: isDragging ? 9999 : bundle.zIndex,
    opacity: isDragging ? 0 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    cursor: isLinkingMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLinkingMode) {
      e.stopPropagation();
      onLinkClick?.(bundle.id, 'bundle');
    }
  };

  const saveSub = (key: keyof Pick<BundleType, 'infoNote' | 'entityNote' | 'commandNote' | 'eventNote'>) =>
    (label: string, content: string) => {
      updateBundle(bundle.id, { [key]: { label, content } as BundleSubNote });
    };

  return (
    <div
      ref={setNodeRef}
      style={wrapperStyle}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...(isLinkingMode ? {} : { ...listeners, ...attributes })}
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

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          deleteBundle(bundle.id);
        }}
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#ef4444',
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
        }}
      >
        ×
      </button>
    </div>
  );
};
