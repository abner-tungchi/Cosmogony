import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Remodel as RemodelType, Bundle, BundleSubNote, FlowPath } from '../../types/elements';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import { isUniverseRemodel } from '../../utils/remodelUtils';
import { COLLAPSED_REMODEL_W, COLLAPSED_REMODEL_H } from '../../utils/linkUtils';
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
  returnType: '#bbf7d0',  // bottom-right: mint green (Return type — distinct from input cyan)
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

// --- Source Events Panel ---

interface SourceEventItem {
  bundleId: string;
  eventLabel: string;
  aggregateLabel: string;
  isDeleted: boolean;
}

interface SourceEventsPanelProps {
  linkedBundleIds: string[];
  sourceEventsExpanded: boolean;
  bundles: Bundle[];
  zoom: number;
  onToggle: () => void;
}

const PANEL_TOP_OFFSET = 4; // gap between 4-in-1 card bottom and Source Events panel
const REMODEL_CARD_H = SUB_H * 2 + GAP;
const REMODEL_CARD_W = SUB_W * 3 + GAP * 2;

const SourceEventsPanel: React.FC<SourceEventsPanelProps> = ({
  linkedBundleIds,
  sourceEventsExpanded,
  bundles,
  zoom,
  onToggle,
}) => {
  const sourceEvents: SourceEventItem[] = linkedBundleIds.map((bundleId) => {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) {
      return { bundleId, eventLabel: '', aggregateLabel: '', isDeleted: true };
    }
    return {
      bundleId,
      eventLabel: bundle.eventNote.label,
      aggregateLabel: bundle.infoNote.label,
      isDeleted: false,
    };
  });

  const count = linkedBundleIds.length;

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
          <span style={{ fontSize: `${11 / zoom}px`, color: '#94a3b8' }}>
            {count} Source Event{count !== 1 ? 's' : ''}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: `${12 / zoom}px`,
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
          fontSize: `${10 / zoom}px`,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#64748b',
        }}>
          Source Events{count > 0 ? ` (${count})` : ''}
        </span>
        {count > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: `${12 / zoom}px`,
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
        <div style={{ fontSize: `${11 / zoom}px`, color: '#64748b', fontStyle: 'italic', lineHeight: 1.5 }}>
          No linked bundles.<br />
          Use Link Mode or Detail Panel to add bundles.
        </div>
      )}

      {/* Event list */}
      {count > 0 && (
        <div>
          {sourceEvents.map((item) => (
            <div
              key={item.bundleId}
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
              <span style={{ fontSize: `${11 / zoom}px`, flexShrink: 0 }}>&#9889;</span>
              {item.isDeleted ? (
                <span style={{
                  fontSize: `${12 / zoom}px`,
                  color: '#94a3b8',
                  fontStyle: 'italic',
                  textDecoration: 'line-through',
                }}>
                  (Deleted Bundle)
                </span>
              ) : (
                <>
                  <span style={{
                    fontSize: `${12 / zoom}px`,
                    color: '#e2e8f0',
                    fontWeight: 500,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.eventLabel || (
                      <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Unnamed Event</span>
                    )}
                  </span>
                  {item.aggregateLabel && (
                    <span style={{
                      fontSize: `${10 / zoom}px`,
                      color: '#94a3b8',
                      whiteSpace: 'nowrap',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}>
                      ({item.aggregateLabel})
                    </span>
                  )}
                </>
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
  bundles: Bundle[];
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
  bundles,
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
  const REMODEL_H = SUB_H * 2 + GAP;

  const saveSub = (key: keyof Pick<RemodelType, 'aggregateNote' | 'parameterNote' | 'queryNote' | 'returnTypeNote'>) =>
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
          backgroundColor: COLORS.collapsed,
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
        {/* Aggregate — subtitle row */}
        {remodel.aggregateNote.label && (
          <div style={{
            fontSize: `${10 / zoom}px`,
            opacity: 0.75,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 2,
          }}>
            {remodel.aggregateNote.label}
          </div>
        )}

        {/* Query — main title row */}
        <div style={{
          fontSize: `${12 / zoom}px`,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {remodel.queryNote.label || 'Remodel'}
        </div>

        {/* Universe badge */}
        {isUniverse && (
          <div
            title="Universe Remodel — crosses multiple Aggregates"
            style={{
              position: 'absolute',
              top: 4,
              left: 8,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: '#7c3aed',
              color: 'white',
              fontSize: 9,
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

        {/* Expand button */}
        <button
          onClick={(e) => { e.stopPropagation(); updateRemodel(remodel.id, { collapsed: false }); }}
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
          title="展開 Remodel"
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

      {/* Return Type (mint green) — bottom right */}
      <SubNote
        label={remodel.returnTypeNote.label}
        content={remodel.returnTypeNote.content}
        bgColor={COLORS.returnType}
        textColor={COLORS.text}
        offsetX={EVENT_X}
        offsetY={EVENT_Y}
        onSave={saveSub('returnTypeNote')}
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

      {/* Collapse button — top left */}
      <button
        onClick={(e) => { e.stopPropagation(); updateRemodel(remodel.id, { collapsed: true }); }}
        style={{ ...BTN_STYLE, left: -8, background: COLORS.collapsed }}
        title="收起 Remodel"
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
        linkedBundleIds={remodel.linkedBundleIds}
        sourceEventsExpanded={sourceEventsExpanded}
        bundles={bundles}
        zoom={zoom}
        onToggle={handleToggleSourceEvents}
      />
    </div>
  );
};
