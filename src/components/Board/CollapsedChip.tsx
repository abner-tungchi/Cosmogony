import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { StickyNote as StickyNoteType } from '../../types/elements';

export interface GroupBox {
  x: number;
  y: number;
  width: number;
  height: number;
  groupEventId: string;
  anchorLabel: string;
  collapsed: boolean;
  anchorNote: StickyNoteType | null;
}

interface CollapsedChipProps {
  box: GroupBox;
  notes: StickyNoteType[];
  isSelected: boolean;
  isDimmed?: boolean;
  onExpand: () => void;
  onSelect: (id: string, multi: boolean) => void;
  onDetailClick: (id: string, type: 'note' | 'remodel') => void;
  onLinkClick?: (noteId: string) => void;
}

export const CollapsedChip: React.FC<CollapsedChipProps> = ({
  box,
  notes,
  isSelected,
  isDimmed = false,
  onExpand,
  onSelect,
  onDetailClick,
  onLinkClick,
}) => {
  const anchor = box.anchorNote!;
  const hasEntity = !!anchor.entityId;

  const commandNote = anchor.commandId
    ? notes.find((n) => n.id === anchor.commandId)
    : null;
  // Fix: use informationForCommandId to find the Information note for this Command
  const infoNote = commandNote
    ? notes.find((n) => n.informationForCommandId === commandNote.id)
    : null;
  const infoParams = infoNote?.information ?? [];
  const displayParams = infoParams.slice(0, 4);
  const extraCount = infoParams.length - 4;

  const isLinkMode = !!onLinkClick;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: box.groupEventId,
    disabled: isLinkMode,
  });

  const transformStyle = transform ? CSS.Transform.toString(transform) : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(isLinkMode ? {} : listeners)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (onLinkClick) {
          onLinkClick(box.groupEventId);
          return;
        }
        onSelect(box.groupEventId, false);
        onDetailClick(box.groupEventId, 'note');
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isLinkMode) return;
        onExpand();
      }}
      style={{
        position: 'absolute',
        left: anchor.position.x,
        top: anchor.position.y,
        height: 'auto',
        minHeight: 40,
        minWidth: 200,
        borderRadius: 6,
        background: 'rgba(251,146,60,0.10)',
        border: isSelected
          ? '1px solid rgba(251,146,60,0.50)'
          : isLinkMode
            ? '1.5px solid rgba(59,130,246,0.5)'
            : '1px solid rgba(251,146,60,0.30)',
        boxShadow: isLinkMode
          ? '0 0 0 2px rgba(59,130,246,0.15), 0 1px 4px rgba(0,0,0,0.12)'
          : '0 1px 4px rgba(0,0,0,0.12)',
        cursor: isLinkMode ? 'crosshair' : (isDragging ? 'grabbing' : 'grab'),
        pointerEvents: 'auto',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '6px 10px 6px 14px',
        outline: isSelected ? '3px solid #3b82f6' : 'none',
        transition: 'all 150ms ease',
        transform: transformStyle,
        opacity: isDragging ? 0 : isDimmed ? 0.15 : 1,
      }}
    >
      {/* Left accent line */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        background: '#fb923c',
        borderRadius: '6px 0 0 6px',
      }} />

      {/* Row 1: ▶ icon + Event name + E badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
      }}>
        <span style={{
          fontSize: 12,
          color: '#ea580c',
          marginRight: 6,
          flexShrink: 0,
          lineHeight: 1,
        }}>
          ▶
        </span>

        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1e293b',
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {anchor.label || 'Domain Event'}
        </span>

        {hasEntity && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'rgba(234,88,12,0.75)',
            background: 'rgba(251,146,60,0.15)',
            borderRadius: 10,
            padding: '1px 5px',
            marginLeft: 8,
            flexShrink: 0,
          }}>
            E
          </span>
        )}
      </div>

      {/* Row 2: Command name + Information params (each on its own line) */}
      {commandNote && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 18,
          marginTop: 3,
          width: '100%',
          overflow: 'hidden',
        }}>
          <span style={{
            fontSize: 11,
            color: '#3b82f6',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {commandNote.label || 'Command'}
          </span>

          {displayParams.map((param, idx) => (
            <span key={idx} style={{
              fontSize: 10,
              color: '#64748b',
              paddingLeft: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {`+${param.attrName || ''}${param.type ? `: ${param.type}` : ''}`}
            </span>
          ))}

          {extraCount > 0 && (
            <span style={{
              fontSize: 10,
              color: '#94a3b8',
              paddingLeft: 4,
              fontStyle: 'italic',
            }}>
              {`+${extraCount} more...`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
