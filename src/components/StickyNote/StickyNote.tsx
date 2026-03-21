import React, { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { StickyNote as StickyNoteType, FlowPath } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { PathDots } from '../PathBar/PathDots';

interface Props {
  note: StickyNoteType;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onLinkClick?: (id: string, type: 'note') => void;
  onDetailClick?: (id: string) => void;
  activePath?: string | null;
  allPaths?: FlowPath[];
}

export const StickyNote: React.FC<Props> = ({
  note,
  isSelected,
  onSelect,
  onLinkClick,
  onDetailClick,
  activePath = null,
  allPaths = [],
}) => {
  const { zoom, isLinkingMode } = useUIStore();

  const isDimmed =
    activePath !== null &&
    !(note.paths ?? []).includes(activePath);
  const { updateNote, deleteNote, expandNoteToBundle } = useBoardStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.label);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const config = ELEMENT_CONFIGS[note.type];
  const isDiamond = note.type === 'Diamond';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: note.id,
    data: { type: 'note', note },
    disabled: isLinkingMode || isEditing,
  });

  const dimTransform = isDimmed ? ' scale(0.97)' : '';
  const baseTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)${dimTransform}`
    : isDimmed
    ? `scale(0.97)`
    : undefined;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: note.position.x,
    top: note.position.y,
    width: note.size.width,
    height: note.size.height,
    zIndex: isDragging ? 9999 : note.zIndex,
    // Hide original while dragging — DragOverlay shows the moving copy
    opacity: isDragging ? 0 : isDimmed ? 0.15 : 1,
    filter: isDimmed ? 'saturate(0.3)' : undefined,
    transform: baseTransform,
    cursor: isDimmed ? 'default' : isLinkingMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
    pointerEvents: isDimmed ? 'none' : 'auto',
    userSelect: 'none',
    transition: isDragging ? 'none' : 'opacity 200ms ease, transform 200ms ease, filter 200ms ease, box-shadow 0.15s',
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isLinkingMode) return;
    e.stopPropagation();
    setIsEditing(true);
    setEditText(note.label);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateNote(note.id, { label: editText });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setIsEditing(false);
      updateNote(note.id, { label: editText });
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(note.label);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLinkingMode) {
      onLinkClick?.(note.id, 'note');
    } else {
      onSelect(note.id, e.shiftKey);
      onDetailClick?.(note.id);
    }
  };

  // Resize handle — bottom-right corner grip
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: note.size.width,
      startH: note.size.height,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = (ev.clientX - resizeRef.current.startX) / zoom;
      const dy = (ev.clientY - resizeRef.current.startY) / zoom;
      updateNote(note.id, {
        size: {
          width: Math.max(80, resizeRef.current.startW + dx),
          height: Math.max(50, resizeRef.current.startH + dy),
        },
      });
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const resizeHandle = !isLinkingMode && (
    <div
      onMouseDown={handleResizeMouseDown}
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 14,
        height: 14,
        cursor: 'se-resize',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 2,
        zIndex: 10,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M8 0 L8 8 L0 8" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
        <path d="M8 4 L8 8 L4 8" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
      </svg>
    </div>
  );

  const actionBtnStyle: React.CSSProperties = {
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

  const deleteBtn = isSelected && (
    <button
      onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
      style={{ ...actionBtnStyle, right: -8, background: '#ef4444' }}
    >
      ×
    </button>
  );

  const expandBtn = isSelected && note.type === 'DomainEvent' && !isLinkingMode && (
    <button
      onClick={(e) => { e.stopPropagation(); expandNoteToBundle(note.id); }}
      style={{ ...actionBtnStyle, left: -8, background: '#FF8C00' }}
      title="展開為 Bundle"
    >
      ⊞
    </button>
  );

  if (isDiamond) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={(e) => e.stopPropagation()}
        {...(isEditing || isLinkingMode ? {} : { ...listeners, ...attributes })}
      >
        <div
          style={{
            width: note.size.width,
            height: note.size.height,
            transform: 'rotate(45deg)',
            backgroundColor: config.color,
            borderRadius: 8,
            boxShadow: isSelected
              ? '0 0 0 3px #3b82f6, 0 4px 12px rgba(0,0,0,0.3)'
              : '0 2px 8px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              transform: 'rotate(-45deg)',
              color: config.textColor,
              fontSize: `${12 / zoom}px`,
              textAlign: 'center',
              padding: 8,
              width: '80%',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: config.textColor,
                  fontSize: `${12 / zoom}px`,
                  resize: 'none',
                  cursor: 'text',
                  fontFamily: 'inherit',
                  textAlign: 'center',
                  width: '100%',
                }}
              />
            ) : (
              note.label || <span style={{ opacity: 0.5 }}>◆</span>
            )}
          </div>
        </div>
        {deleteBtn}
        {expandBtn}
        <PathDots pathIds={note.paths ?? []} allPaths={allPaths} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: config.color,
        color: config.textColor,
        boxShadow: isSelected
          ? '0 0 0 3px #3b82f6, 0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.2)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        fontSize: `${14 / zoom}px`,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...(isEditing || isLinkingMode ? {} : { ...listeners, ...attributes })}
    >
      <div
        style={{
          fontSize: `${10 / zoom}px`,
          fontWeight: 600,
          opacity: 0.8,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
          flexShrink: 0,
        }}
      >
        {config.label}
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: config.textColor,
            fontSize: `${13 / zoom}px`,
            resize: 'none',
            cursor: 'text',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <div
          style={{
            flex: 1,
            fontSize: `${13 / zoom}px`,
            lineHeight: 1.4,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {note.label || <span style={{ opacity: 0.5 }}>Double-click to edit</span>}
        </div>
      )}

      <PathDots pathIds={note.paths ?? []} allPaths={allPaths} />
      {resizeHandle}
      {deleteBtn}
      {expandBtn}
    </div>
  );
};
