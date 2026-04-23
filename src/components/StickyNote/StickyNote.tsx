import React, { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { StickyNote as StickyNoteType, FlowPath, TextFormat } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { PathDots } from '../PathBar/PathDots';
import { deriveDtoContent } from '../../utils/dtoDerived';

// ─── Dto Note Body ────────────────────────────────────────────────────────────

const DTO_MONO_FONT = '"Menlo", "Monaco", "Courier New", monospace';

interface DtoNoteBodyProps {
  label: string;
  textColor: string;
  /**
   * Field lines derived from structured `dtoFields`. When provided, this is
   * rendered as the authoritative field list. When null/undefined, we fall
   * back to any legacy content embedded in `label` (lines after the first).
   */
  derivedContent?: string | null;
}

const DtoNoteBody: React.FC<DtoNoteBodyProps> = ({ label, textColor, derivedContent }) => {
  const lines = label.split('\n');
  const nameLine = lines[0] ?? '';
  const legacyFieldLines = lines.slice(1).join('\n');
  // Prefer structured dtoFields output over legacy inline label content.
  const fieldLines = derivedContent ?? legacyFieldLines;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* DTO name */}
      <div style={{
        fontSize: '13px',
        fontWeight: 700,
        color: textColor,
        borderBottom: '1px solid rgba(0,0,0,0.12)',
        paddingBottom: 4,
        marginBottom: 4,
        flexShrink: 0,
        wordBreak: 'break-word',
      }}>
        {nameLine || <span style={{ opacity: 0.4, fontWeight: 400 }}>DtoName</span>}
      </div>

      {/* Field list */}
      <div style={{
        flex: 1,
        fontFamily: DTO_MONO_FONT,
        fontSize: '10px',
        lineHeight: 1.5,
        color: 'rgba(0,0,0,0.7)',
        whiteSpace: 'pre-wrap',
        overflowY: 'auto',
        wordBreak: 'break-all',
      }}>
        {fieldLines || (
          <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Double-click to add fields</span>
        )}
      </div>
    </div>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  note: StickyNoteType;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onLinkClick?: (id: string, type: 'note') => void;
  onDetailClick?: (id: string) => void;
  activePath?: string | null;
  allPaths?: FlowPath[];
  onAddCommand?: (eventNoteId: string) => void;
  onSetEntity?: (eventNoteId: string) => void;
  onHoverChange?: (id: string | null) => void;
  allNotes?: StickyNoteType[];
  /** When true, this note is a ghost/mirror instance and cannot be dragged or interacted with */
  isDragDisabled?: boolean;
}

export const StickyNote: React.FC<Props> = ({
  note,
  isSelected,
  onSelect,
  onLinkClick,
  onDetailClick,
  activePath = null,
  allPaths = [],
  onAddCommand,
  onHoverChange,
  allNotes = [],
  isDragDisabled = false,
}) => {
  const { zoom, isLinkingMode, selectedNoteIds: uiSelectedIds } = useUIStore();

  const isDimmed =
    activePath !== null &&
    !(note.paths ?? []).includes(activePath);
  const { updateNote, deleteNote } = useBoardStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.label);
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Group satellite: notes that belong to a DomainEvent group (have groupEventId set)
  const isGroupSatellite = !!note.groupEventId;
  const isGroupDomainEventSelected = isGroupSatellite && uiSelectedIds.includes(note.groupEventId!);

  const config = ELEMENT_CONFIGS[note.type] ?? ELEMENT_CONFIGS['DomainEvent'];
  const isDiamond = note.type === 'Diamond';
  const isDto = note.type === 'Dto';
  const isDomainEvent = note.type === 'DomainEvent';
  const isEntity = note.type === 'Entity';
  const isAggregate = note.type === 'Aggregate';
  const isEntityAggregateRoot = isEntity && note.isAggregateRoot === true;
  const isInformation = note.type === 'Information';

  const format: TextFormat = note.textFormat ?? {};

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: isDragDisabled ? `ghost-${note.id}` : note.id,
    data: { type: 'note', note },
    disabled: isLinkingMode || isEditing || isDragDisabled,
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
    cursor: isDragDisabled ? 'default' : isDimmed ? 'default' : isLinkingMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
    pointerEvents: isDragDisabled ? 'none' : isDimmed ? 'none' : 'auto',
    userSelect: 'none',
    transition: isDragging ? 'none' : 'opacity 200ms ease, transform 200ms ease, filter 200ms ease, box-shadow 0.15s',
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isLinkingMode) return;
    // Group satellites (Command / Information / Entity) edit only via sidebar.
    // Aggregate is a conceptual node — it may share a groupEventId for group-move
    // tracking, but its label is directly editable like any top-level note.
    if (isGroupSatellite && !isAggregate) return;
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
    // Dto notes are multiline — Enter inserts newline; only Escape or Ctrl+Enter saves
    if (isDto) {
      if (e.key === 'Escape') {
        setIsEditing(false);
        setEditText(note.label);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsEditing(false);
        updateNote(note.id, { label: editText });
      }
      return;
    }
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
      return;
    }
    // Aggregate is a conceptual domain node — it may share a groupEventId with a
    // DomainEvent (for move/link tracking), but clicking it should always select
    // itself so the AggregatePanel shows. Aggregates are never "just another
    // group satellite" from the UX perspective.
    if (isAggregate) {
      onSelect(note.id, e.shiftKey);
      onDetailClick?.(note.id);
      return;
    }
    if (isGroupSatellite && !isGroupDomainEventSelected) {
      // First click on satellite: select the group (DomainEvent as representative)
      onSelect(note.groupEventId!, e.shiftKey);
      onDetailClick?.(note.groupEventId!);
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

  // DomainEvent action bar — shown on hover or select, only when not in link mode
  const linkedCommandNote = isDomainEvent && note.commandId
    ? allNotes.find((n) => n.id === note.commandId)
    : undefined;

  const showActionBar = isDomainEvent && !isLinkingMode && !isDimmed && (isHovered || isSelected);

  // Action bar only shows "+ Command" button (when no command linked yet)
  // "Set Entity" is rendered as a canvas overlay in BoardCanvas.tsx
  const domainEventActionBar = showActionBar && !linkedCommandNote && (
    <div
      style={{
        position: 'absolute',
        left: -8,
        top: '50%',
        transform: 'translateX(-100%) translateY(-50%)',
        zIndex: 10001,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Add Command button — only if no commandId */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddCommand?.(note.id);
        }}
        title="Add Command"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          background: 'rgba(30,136,229,0.7)',
          border: '1px solid rgba(30,136,229,0.9)',
          borderRadius: 4,
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          backdropFilter: 'blur(4px)',
        }}
      >
        + Command
      </button>
    </div>
  );

  // Derived textFormat styles for text content
  const textFormatStyles: React.CSSProperties = {
    fontSize: format.fontSize ? `${format.fontSize / zoom}px` : undefined,
    fontWeight: format.bold ? 700 : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
    color: format.color ?? config.textColor,
  };

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
              fontSize: '12px',
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
                  fontSize: '12px',
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
        <PathDots pathIds={note.paths ?? []} allPaths={allPaths} />
      </div>
    );
  }

  // Entity: display label is always the note's own label
  const entityDisplayLabel = note.label;

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          backgroundColor: config.color,
          color: config.textColor,
          boxShadow: isSelected
            ? '0 0 0 3px #3b82f6, 0 4px 12px rgba(0,0,0,0.3)'
            : (isAggregate || isEntityAggregateRoot)
            ? '0 0 0 3px #b8860b, 0 2px 8px rgba(0,0,0,0.2)'
            : '0 2px 8px rgba(0,0,0,0.2)',
          border: (isAggregate || isEntityAggregateRoot) ? '3px solid #b8860b' : undefined,
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => { setIsHovered(true); onHoverChange?.(note.id); }}
        onMouseLeave={() => { setIsHovered(false); onHoverChange?.(null); }}
        {...(isEditing || isLinkingMode ? {} : { ...listeners, ...attributes })}
      >
        {!isDto && !isInformation && (
          <div
            style={{
              fontSize: '10px',
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
        )}

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
              color: textFormatStyles.color,
              fontSize: isDto ? '11px' : (format.fontSize ? `${format.fontSize / zoom}px` : '13px'),
              fontWeight: textFormatStyles.fontWeight,
              fontStyle: textFormatStyles.fontStyle,
              resize: 'none',
              cursor: 'text',
              fontFamily: isDto ? '"Menlo", "Monaco", "Courier New", monospace' : 'inherit',
            }}
          />
        ) : isDto ? (
          <DtoNoteBody
            label={note.label}
            textColor={config.textColor}
            derivedContent={deriveDtoContent(note, allNotes)}
          />
        ) : isInformation ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {/* Information type label */}
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              opacity: 0.8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
              color: config.textColor,
            }}>
              {config.label}
            </div>
            {/* Property list */}
            {(note.information ?? []).length > 0 ? (
              <div style={{
                fontSize: '10px',
                lineHeight: 1.6,
                color: config.textColor,
                overflow: 'hidden',
              }}>
                {(note.information ?? []).map((prop, i) => (
                  <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ opacity: 0.7 }}>{prop.attrName}</span>
                    {prop.type && <span style={{ opacity: 0.5 }}>: {prop.type}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '11px', opacity: 0.5, fontStyle: 'italic' }}>
                {note.label || 'Information'}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              fontSize: format.fontSize ? `${format.fontSize / zoom}px` : '13px',
              fontWeight: textFormatStyles.fontWeight,
              fontStyle: textFormatStyles.fontStyle,
              color: textFormatStyles.color,
              lineHeight: 1.4,
              overflow: 'hidden',
              wordBreak: 'break-word',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span>{entityDisplayLabel || <span style={{ opacity: 0.5 }}>Double-click to edit</span>}</span>
            {isDomainEvent && (note.eventProperties ?? []).length > 0 && (
              <div style={{
                marginTop: 4,
                fontSize: '10px',
                lineHeight: 1.5,
                opacity: 0.75,
                overflow: 'hidden',
              }}>
                {(note.eventProperties ?? []).map((prop, i) => (
                  <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ opacity: 0.85 }}>{prop.attrName}</span>
                    {prop.type && <span style={{ opacity: 0.6 }}>: {prop.type}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isEntityAggregateRoot && (
          <div style={{
            position: 'absolute', top: 4, right: 20,
            background: '#b8860b', color: '#fff',
            fontSize: '8px', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '1px 5px', borderRadius: 3, pointerEvents: 'none',
          }}>AR</div>
        )}
        <PathDots pathIds={note.paths ?? []} allPaths={allPaths} />
        {resizeHandle}
        {deleteBtn}
        {domainEventActionBar}
      </div>
    </>
  );
};
