import React, { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Remodel as RemodelType, BundleSubNote, FlowPath } from '../../types/elements';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import { useUIStore } from '../../store/uiStore';
import { COLLAPSED_REMODEL_W, COLLAPSED_REMODEL_H } from '../../utils/linkUtils';
import { deriveParametersContent, deriveReturnTypeContent } from '../../utils/remodelDerived';
import { PathDots } from '../PathBar/PathDots';

const SUB_W = 160;
const SUB_H = 120;
const GAP = 8;

// Sub-note offsets — single row layout
const ENTITY_X = 0;
const ENTITY_Y = 0;
const COMMAND_X = SUB_W + GAP;
const COMMAND_Y = 0;
const EVENT_X = (SUB_W + GAP) * 2;
const EVENT_Y = 0;

// Remodel color palette (cool tones — distinct from Bundle's warm palette)
const COLORS = {
  aggregate: '#e9d5ff',   // (data model only — not rendered on canvas)
  parameter: '#bbf7d0',   // left: mint green (Query parameters)
  query: '#bfdbfe',       // center: blue-gray (Query name)
  returnType: '#bbf7d0',  // right: mint green (Return type)
  text: '#1e293b',
  collapsed: '#a78bfa',   // collapsed card background: purple
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
  title: string;
  labelPlaceholder?: string;
  /** If true, double-click does not enter inline edit (structured data is managed in the Detail Panel). */
  readOnly?: boolean;
  emptyPlaceholder?: string;
  /** When true, render content with monospace to emphasize code-like text. */
  monospace?: boolean;
}

const SubNote: React.FC<SubNoteProps> = ({
  label, content, bgColor, textColor, offsetX, offsetY, onSave,
  title, labelPlaceholder, readOnly, emptyPlaceholder, monospace,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [editContent, setEditContent] = useState(content);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
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
        fontSize: '13px',
        cursor: 'default',
        overflow: 'hidden',
      }}
      onDoubleClick={handleDoubleClick}
      onBlur={handleContainerBlur}
    >
      {/* Section title — read-only */}
      <div style={{ marginBottom: 6 }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            opacity: 0.55,
            userSelect: 'none',
          }}
        >
          {title}
        </div>
      </div>

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
              fontSize: '12px',
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
              fontSize: '11px',
              resize: 'none',
              padding: '2px 4px',
              borderRadius: 3,
              fontFamily: 'inherit',
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>
            {label || <span style={{ opacity: 0.5 }}>{labelPlaceholder ?? 'Label'}</span>}
          </div>
          <div
            style={{
              fontSize: '11px',
              lineHeight: 1.4,
              opacity: 0.85,
              overflow: 'hidden',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              fontFamily: monospace ? '"Courier New", Courier, monospace' : 'inherit',
            }}
          >
            {content || (
              <span style={{ opacity: 0.4, fontStyle: 'italic', fontFamily: 'inherit' }}>
                {emptyPlaceholder ?? (readOnly ? 'Edit in Detail Panel' : 'Double-click to edit')}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// --- Source Events Panel ---
// Post-migration: linkedBundleIds now holds note IDs (DomainEvent notes that this Remodel sources from)

interface SourceEventItem {
  noteId: string;
  eventLabel: string;
  isDeleted: boolean;
}

interface SourceEventsPanelProps {
  linkedNoteIds: string[];
  sourceEventsExpanded: boolean;
  zoom: number;
  onToggle: () => void;
}

const PANEL_TOP_OFFSET = 4;
const REMODEL_CARD_H = SUB_H;
const REMODEL_CARD_W = SUB_W * 3 + GAP * 2;

const SourceEventsPanel: React.FC<SourceEventsPanelProps> = ({
  linkedNoteIds,
  sourceEventsExpanded,
  onToggle,
}) => {
  const activeBoard = useActiveBoard();
  const sourceEvents: SourceEventItem[] = linkedNoteIds.map((noteId) => {
    const note = activeBoard.notes.find((n) => n.id === noteId);
    if (!note) {
      return { noteId, eventLabel: '', isDeleted: true };
    }
    return {
      noteId,
      eventLabel: note.label,
      isDeleted: false,
    };
  });

  const count = linkedNoteIds.length;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: REMODEL_CARD_H + PANEL_TOP_OFFSET,
    left: 0,
    width: REMODEL_CARD_W,
    background: 'rgba(124, 58, 237, 0.06)',
    border: '1px solid rgba(124, 58, 237, 0.15)',
    borderRadius: 6,
    padding: sourceEventsExpanded ? 8 : '6px 8px',
    boxSizing: 'border-box',
    userSelect: 'none',
  };

  // Collapsed summary row
  if (!sourceEventsExpanded) {
    return (
      <div style={containerStyle} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
            {count} Source Event{count !== 1 ? 's' : ''}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              fontSize: '12px',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
            title="Expand Source Events"
          >
            &#9660;
          </button>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: count > 0 ? 6 : 0,
      }}>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#94a3b8',
        }}>
          Source Events{count > 0 ? ` (${count})` : ''}
        </span>
        {count > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              fontSize: '12px',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
            title="Collapse Source Events"
          >
            &#9650;
          </button>
        )}
      </div>

      {/* Empty state */}
      {count === 0 && (
        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
          No linked notes.<br />
          Use Link Mode or Detail Panel to link notes.
        </div>
      )}

      {/* Event list */}
      {count > 0 && (
        <div>
          {sourceEvents.map((item) => (
            <div
              key={item.noteId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.04)',
                marginBottom: 2,
                opacity: item.isDeleted ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '11px', flexShrink: 0 }}>&#9889;</span>
              {item.isDeleted ? (
                <span style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontStyle: 'italic',
                  textDecoration: 'line-through',
                }}>
                  (Deleted Note)
                </span>
              ) : (
                <span style={{
                  fontSize: '12px',
                  color: '#e2e8f0',
                  fontWeight: 500,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.eventLabel || (
                    <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Unnamed Note</span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Remodel Component ---

interface Props {
  remodel: RemodelType;
  onLinkTarget?: (id: string, type: 'note' | 'remodel') => void;
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
  const { zoom, isLinkingMode } = useUIStore();

  const isDimmed =
    activePath !== null &&
    !(remodel.paths ?? []).includes(activePath);

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

  const handleToggleSourceEvents = () => {
    const currentExpanded = remodel.sourceEventsExpanded !== false;
    updateRemodel(remodel.id, { sourceEventsExpanded: !currentExpanded });
  };

  const sourceEventsExpanded = remodel.sourceEventsExpanded !== false;

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
  const REMODEL_H = SUB_H;

  // Collapsed resize — refs must be at top level (Rules of Hooks)
  const collapsedResizeRightRef = useRef<{ startX: number; startW: number; startH: number } | null>(null);

  const collapsedW = remodel.collapsedSize?.width ?? COLLAPSED_REMODEL_W;
  const collapsedH = remodel.collapsedSize?.height ?? COLLAPSED_REMODEL_H;

  const handleCollapsedRightMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    collapsedResizeRightRef.current = { startX: e.clientX, startW: collapsedW, startH: collapsedH };
    const onMove = (ev: MouseEvent) => {
      if (!collapsedResizeRightRef.current) return;
      const newW = Math.max(120, collapsedResizeRightRef.current.startW + (ev.clientX - collapsedResizeRightRef.current.startX) / zoom);
      updateRemodel(remodel.id, { collapsedSize: { width: newW, height: collapsedResizeRightRef.current.startH } });
    };
    const onUp = () => {
      collapsedResizeRightRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const saveSub = (key: keyof Pick<RemodelType, 'parameterNote' | 'queryNote' | 'returnTypeNote'>) =>
    (label: string, content: string) => {
      updateRemodel(remodel.id, { [key]: { label, content } as BundleSubNote });
    };

  // ── Collapsed view ──────────────────────────────────────────────────────────
  if (remodel.collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...baseStyle,
          width: COLLAPSED_REMODEL_W,
          height: COLLAPSED_REMODEL_H,
          backgroundColor: '#7c3aed',
          color: 'white',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 8px 0 12px',
          gap: 8,
          overflow: 'hidden',
        }}
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
        {...dragProps}
      >
        {/* RM badge */}
        <span style={{
          background: 'rgba(255,255,255,0.20)',
          borderRadius: 10,
          padding: '2px 6px',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          flexShrink: 0,
        }}>
          RM
        </span>

        {/* Query name */}
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {remodel.queryNote.content || remodel.queryNote.label || 'Read Model'}
        </span>

        {/* Return type label */}
        {remodel.returnTypeNote.label && (
          <span style={{
            fontSize: '11px',
            opacity: 0.60,
            flexShrink: 0,
            maxWidth: 80,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 4,
          }}>
            {remodel.returnTypeNote.label}
          </span>
        )}

        {/* Expand button */}
        <button
          onClick={(e) => { e.stopPropagation(); updateRemodel(remodel.id, { collapsed: false }); }}
          style={{
            background: 'rgba(255,255,255,0.20)',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '11px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="展開 Read Model"
        >
          ▼
        </button>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); deleteRemodel(remodel.id); }}
          style={{ ...BTN_STYLE, right: -8, background: '#ef4444' }}
        >
          ×
        </button>

        {/* Right-edge resize handle */}
        <div
          onMouseDown={handleCollapsedRightMouseDown}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'ew-resize',
          }}
        />

        <PathDots pathIds={remodel.paths ?? []} allPaths={allPaths} />
      </div>
    );
  }

  // ── Expanded view ───────────────────────────────────────────────────────────
  return (
    <div
      ref={setNodeRef}
      style={{ ...baseStyle, width: REMODEL_W, height: REMODEL_H, overflow: 'visible' }}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...dragProps}
    >
      {/* Parameters (mint green) — left. Content is derived from structured `parameters` (no legacy fallback). */}
      <SubNote
        label={remodel.parameterNote.label}
        content={deriveParametersContent(remodel.parameters) ?? ''}
        bgColor={COLORS.parameter}
        textColor={COLORS.text}
        offsetX={ENTITY_X}
        offsetY={ENTITY_Y}
        onSave={saveSub('parameterNote')}
        zoom={zoom}
        title="Parameters"
        labelPlaceholder="Parameters"
        readOnly
        monospace
        emptyPlaceholder="請補欄位"
      />

      {/* Query (blue-gray) — center. queryNote stays user-editable. */}
      <SubNote
        label={remodel.queryNote.label}
        content={remodel.queryNote.content}
        bgColor={COLORS.query}
        textColor={COLORS.text}
        offsetX={COMMAND_X}
        offsetY={COMMAND_Y}
        onSave={saveSub('queryNote')}
        zoom={zoom}
        title="func name"
        labelPlaceholder="Read Model Name"
      />

      {/* Return Type (mint green) — right. Content is derived from structured `returnType` (no legacy fallback). */}
      <SubNote
        label={remodel.returnTypeNote.label}
        content={deriveReturnTypeContent(remodel.returnType) ?? ''}
        bgColor={COLORS.returnType}
        textColor={COLORS.text}
        offsetX={EVENT_X}
        offsetY={EVENT_Y}
        onSave={saveSub('returnTypeNote')}
        zoom={zoom}
        title="return"
        labelPlaceholder="Return"
        readOnly
        monospace
        emptyPlaceholder="請補欄位"
      />

      {/* Collapse button — top left */}
      <button
        onClick={(e) => { e.stopPropagation(); updateRemodel(remodel.id, { collapsed: true }); }}
        style={{ ...BTN_STYLE, left: -8, background: COLORS.collapsed }}
        title="收起 Read Model"
      >
        ▲
      </button>

      {/* Delete button — top right */}
      <button
        onClick={(e) => { e.stopPropagation(); deleteRemodel(remodel.id); }}
        style={{ ...BTN_STYLE, right: -8, background: '#ef4444' }}
      >
        ×
      </button>

      <PathDots pathIds={remodel.paths ?? []} allPaths={allPaths} />

      {/* Source Events panel — always render when main card is expanded */}
      <SourceEventsPanel
        linkedNoteIds={remodel.linkedBundleIds}
        sourceEventsExpanded={sourceEventsExpanded}
        zoom={zoom}
        onToggle={handleToggleSourceEvents}
      />
    </div>
  );
};
