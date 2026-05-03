import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import { useUIStore } from '../../store/uiStore';
import { CanvasBackground } from '../Canvas/CanvasBackground';
import { StickyNote } from '../StickyNote/StickyNote';
import { Remodel } from '../Remodel/Remodel';
import { LinkLayer } from '../Links/LinkLayer';
import { CollapsedChip } from './CollapsedChip';
import type { GroupBox } from './CollapsedChip';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import type { FlowPath, StickyNote as StickyNoteType } from '../../types/elements';
import { PhaseLane } from './PhaseLane';

const NOTE_WIDTH = 160;
const NOTE_HEIGHT = 80;
const GROUP_BG_PADDING = 16;

// Compute the virtual position of a shared Aggregate note when rendered inside a non-original group
function computeAggregateVirtualPosition(
  domainEvent: StickyNoteType,
  allNotes: StickyNoteType[]
): { x: number; y: number } {
  // Find all satellite notes for this event to compute group x-center (same logic as addEntityForEvent)
  const groupNotes = allNotes.filter(
    (n) => n.groupEventId === domainEvent.id || n.id === domainEvent.id
  );
  const minX = Math.min(...groupNotes.map((n) => n.position.x));
  const maxX = Math.max(...groupNotes.map((n) => n.position.x));
  const groupCenterX = (minX + maxX + NOTE_WIDTH) / 2;

  return {
    x: groupCenterX - NOTE_WIDTH / 2,
    y: domainEvent.position.y - 104, // 80px height + 24px gap above
  };
}

function computeGroupBoundingBoxes(notes: StickyNoteType[]): GroupBox[] {
  // Group notes by groupEventId
  const groups = new Map<string, StickyNoteType[]>();

  for (const note of notes) {
    if (note.groupEventId) {
      const existing = groups.get(note.groupEventId) ?? [];
      existing.push(note);
      groups.set(note.groupEventId, existing);
    }
  }

  const boxes: GroupBox[] = [];

  for (const [groupEventId, satellites] of groups) {
    // Include the anchor DomainEvent itself
    const anchor = notes.find((n) => n.id === groupEventId) ?? null;
    const collapsed = anchor?.groupCollapsed ?? false;
    // When collapsed, only use the anchor for bounding box
    const groupMembers = collapsed
      ? (anchor ? [anchor] : [])
      : (anchor ? [...satellites, anchor] : satellites);

    if (groupMembers.length === 0) continue;

    // Also include virtual positions for shared Aggregate notes referenced by this DomainEvent
    // but NOT originating from this group
    const virtualPositions: Array<{ x: number; y: number; width: number; height: number }> = [];
    if (anchor && !collapsed && anchor.entityId) {
      const aggNote = notes.find((n) => n.id === anchor.entityId && n.type === 'Aggregate');
      if (aggNote && aggNote.groupEventId !== groupEventId) {
        // This is a shared Aggregate — compute its virtual position for this group
        const vPos = computeAggregateVirtualPosition(anchor, notes);
        virtualPositions.push({ ...vPos, width: NOTE_WIDTH, height: NOTE_HEIGHT });
      }
    }

    const allPositions = [
      ...groupMembers.map((n) => ({
        x: n.position.x, y: n.position.y,
        width: n.size?.width ?? NOTE_WIDTH, height: n.size?.height ?? NOTE_HEIGHT,
      })),
      ...virtualPositions,
    ];

    const minX = Math.min(...allPositions.map((p) => p.x));
    const minY = Math.min(...allPositions.map((p) => p.y));
    const maxX = Math.max(...allPositions.map((p) => p.x + p.width));
    const maxY = Math.max(...allPositions.map((p) => p.y + p.height));

    boxes.push({
      x: minX - GROUP_BG_PADDING,
      y: minY - GROUP_BG_PADDING,
      width: maxX - minX + GROUP_BG_PADDING * 2,
      height: maxY - minY + GROUP_BG_PADDING * 2,
      groupEventId,
      anchorLabel: anchor?.label ?? '',
      collapsed,
      anchorNote: anchor,
    });
  }

  return boxes;
}


interface Props {
  selectedNoteIds: string[];
  activeDragId: string | null;
  onNoteSelect: (id: string, multi: boolean) => void;
  onLinkTarget: (id: string, type: 'note' | 'remodel') => void;
  onDetailClick: (id: string, type: 'note' | 'remodel') => void;
  onAddCommand?: (eventNoteId: string) => void;
  onSetEntity?: (eventNoteId: string) => void;
}

export const BoardCanvas: React.FC<Props> = ({
  selectedNoteIds,
  activeDragId,
  onNoteSelect,
  onLinkTarget,
  onDetailClick,
  onAddCommand,
  onSetEntity,
}) => {
  const activeBoard = useActiveBoard();
  const { updateNote, addNote } = useBoardStore();
  const { zoom, panX, panY, setZoom, setPan, activePath, fitAll, setSelectedNoteIds, setSelectedElement, isLinkingMode } = useUIStore();
  const allPaths: FlowPath[] = activeBoard.flowPaths;
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

  const isPathFilterActive = activePath !== null;
  const filteredNoteCount = isPathFilterActive
    ? activeBoard.notes.filter((n) => n.paths?.includes(activePath)).length
    : activeBoard.notes.length;
  const filteredRemodelCount = isPathFilterActive
    ? activeBoard.remodels.filter((r) => r.paths?.includes(activePath)).length
    : activeBoard.remodels.length;
  const isEmptyState = isPathFilterActive && filteredNoteCount === 0 && filteredRemodelCount === 0;
  const isBoardEmpty = !isPathFilterActive && activeBoard.notes.length === 0 && activeBoard.remodels.length === 0;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey) {
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const newZoom = Math.min(3, Math.max(0.25, zoom + delta));

        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newPanX = mouseX - (mouseX - panX) * (newZoom / zoom);
        const newPanY = mouseY - (mouseY - panY) * (newZoom / zoom);

        setZoom(newZoom);
        setPan(newPanX, newPanY);
      } else {
        setPan(panX - e.deltaX, panY - e.deltaY);
      }
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  const handleWheelRef = useRef(handleWheel);
  useEffect(() => { handleWheelRef.current = handleWheel; }, [handleWheel]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => handleWheelRef.current(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // F key shortcut: Fit All
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const viewport = containerRef.current;
      if (!viewport) return;
      const { width, height } = viewport.getBoundingClientRect();

      fitAll({
        notes: activeBoard.notes,
        remodels: activeBoard.remodels,
        viewportWidth: width,
        viewportHeight: height,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitAll, activeBoard.notes, activeBoard.remodels]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <CanvasBackground zoom={zoom} panX={panX} panY={panY} />

      <div
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          width: 10000,
          height: 10000,
          top: 0,
          left: 0,
        }}
      >
        {/* Phase Lanes */}
        <PhaseLane notes={activeBoard.notes} />

        {/* Group Background Containers / Collapsed Chips */}
        {computeGroupBoundingBoxes(activeBoard.notes).map((box) => {
          // ── Collapsed: render a draggable Chip ───────────────────────────
          if (box.collapsed && box.anchorNote) {
            const isSelected = selectedNoteIds.includes(box.groupEventId);
            const isDimmedChip = activePath !== null &&
              !(box.anchorNote?.paths ?? []).includes(activePath);
            return (
              <CollapsedChip
                key={box.groupEventId}
                box={box}
                notes={activeBoard.notes}
                isSelected={isSelected}
                isDimmed={isDimmedChip}
                onExpand={() => updateNote(box.groupEventId, { groupCollapsed: false })}
                onSelect={onNoteSelect}
                onDetailClick={onDetailClick}
                onLinkClick={isLinkingMode ? (id) => onLinkTarget(id, 'note') : undefined}
              />
            );
          }

          // ── Expanded: render group background box ─────────────────────────
          return (
            <div
              key={box.groupEventId}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNoteSelect(box.groupEventId, false);
                onDetailClick(box.groupEventId, 'note');
              }}
              style={{
                position: 'absolute',
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                background: 'rgba(99,102,241,0.06)',
                border: '1.5px solid rgba(99,102,241,0.25)',
                borderLeft: '3px solid rgba(99,102,241,0.4)',
                borderRadius: 12,
                pointerEvents: 'auto',
                zIndex: 1,
                cursor: 'pointer',
              }}
            >
              {/* Collapse toggle button — top-left corner */}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateNote(box.groupEventId, { groupCollapsed: true });
                }}
                title="Collapse group"
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 9,
                  color: 'rgba(99,102,241,0.8)',
                  padding: 0,
                  lineHeight: 1,
                  fontFamily: 'inherit',
                  zIndex: 2,
                }}
              >
                ▼
              </button>

              {box.anchorLabel && (
                <div
                  style={{
                    position: 'absolute',
                    top: -20,
                    left: GROUP_BG_PADDING,
                    fontSize: 10,
                    color: 'rgba(99,102,241,0.7)',
                    fontWeight: 500,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    maxWidth: 160,
                    textOverflow: 'ellipsis',
                  }}
                >
                  {box.anchorLabel}
                </div>
              )}
            </div>
          );
        })}

        {/* Remodels */}
        {activeBoard.remodels.map((remodel) => (
          <Remodel
            key={remodel.id}
            remodel={remodel}
            onLinkTarget={onLinkTarget}
            onDetailClick={(id) => onDetailClick(id, 'remodel')}
            activePath={activePath}
            allPaths={allPaths}
          />
        ))}

        {/* Set Entity canvas overlay — rendered above group backgrounds, below notes */}
        {/* Only shown when entity is NOT yet set (!domainEvent.entityId) */}
        {activeBoard.notes
          .filter((note) => {
            if (note.type !== 'DomainEvent' || note.id === activeDragId) return false;
            if (note.groupCollapsed) return false;
            // Hide when entity is already set
            if (note.entityId) return false;
            // Show when DomainEvent itself is hovered/selected, OR any group member is hovered/selected
            const groupMemberHoveredOrSelected = activeBoard.notes.some(
              (n) => n.groupEventId === note.id &&
                (n.id === hoveredNoteId || selectedNoteIds.includes(n.id))
            );
            return note.id === hoveredNoteId || selectedNoteIds.includes(note.id) || groupMemberHoveredOrSelected;
          })
          .map((domainEvent) => {
            const commandNote = domainEvent.commandId
              ? activeBoard.notes.find((n) => n.id === domainEvent.commandId)
              : undefined;

            // Position above Command note if present, otherwise above DomainEvent
            const buttonAnchor = commandNote ?? (domainEvent as StickyNoteType);
            const buttonX = buttonAnchor.position.x + (buttonAnchor.size?.width ?? NOTE_WIDTH) / 2;
            const buttonY = buttonAnchor.position.y;

            return (
              <div
                key={`set-entity-${domainEvent.id}`}
                style={{
                  position: 'absolute',
                  left: buttonX,
                  top: buttonY,
                  transform: 'translateX(-50%) translateY(-100%) translateY(-8px)',
                  zIndex: 10002,
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetEntity?.(domainEvent.id);
                  }}
                  title="Set Entity"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    background: 'rgba(100,116,139,0.85)',
                    border: '1px solid rgba(100,116,139,0.85)',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                    backdropFilter: 'blur(4px)',
                    height: 26,
                    lineHeight: 1,
                  }}
                >
                  + Set Entity
                </button>
              </div>
            );
          })
        }

        {/* Sticky Notes */}
        {(() => {
          // Collect shared Aggregate render instances:
          // For each DomainEvent that references an Aggregate via entityId,
          // check if that Aggregate belongs to a different group (non-original).
          // If so, we need to render a ghost copy of the Aggregate note at a virtual position.
          const sharedAggregateInstances: Array<{
            note: StickyNoteType;
            ownerEventId: string;
            virtualPosition: { x: number; y: number };
          }> = [];

          for (const note of activeBoard.notes) {
            if (note.type === 'DomainEvent' && note.entityId) {
              const aggNote = activeBoard.notes.find(
                (n) => n.id === note.entityId && n.type === 'Aggregate'
              );
              if (aggNote && aggNote.groupEventId !== note.id) {
                // This Aggregate is shared — render a ghost at the computed position
                const virtualPosition = computeAggregateVirtualPosition(note, activeBoard.notes);
                sharedAggregateInstances.push({
                  note: aggNote,
                  ownerEventId: note.id,
                  virtualPosition,
                });
              }
            }
          }

          // Build set of anchor IDs for collapsed groups — these are replaced by Chips
          const collapsedAnchorIds = new Set(
            computeGroupBoundingBoxes(activeBoard.notes)
              .filter((box) => box.collapsed)
              .map((box) => box.anchorNote?.id)
              .filter((id): id is string => id !== undefined)
          );

          const filteredNotes = activeBoard.notes.filter((note) => {
            // Hide anchor DomainEvent when its group is collapsed (Chip replaces it)
            if (collapsedAnchorIds.has(note.id)) return false;
            // Hide satellite notes when their parent DomainEvent is collapsed
            if (!note.groupEventId) return true;
            const parent = activeBoard.notes.find((n) => n.id === note.groupEventId);
            return !parent?.groupCollapsed;
          });

          return (
            <>
              {filteredNotes.map((note) => (
                <StickyNote
                  key={note.id}
                  note={note}
                  isSelected={selectedNoteIds.includes(note.id)}
                  onSelect={onNoteSelect}
                  onLinkClick={onLinkTarget}
                  onDetailClick={(id) => onDetailClick(id, 'note')}
                  activePath={activePath}
                  allPaths={allPaths}
                  onAddCommand={onAddCommand}
                  onSetEntity={onSetEntity}
                  onHoverChange={setHoveredNoteId}
                  allNotes={activeBoard.notes}
                />
              ))}
              {sharedAggregateInstances.map(({ note, ownerEventId, virtualPosition }) => {
                // Check if the owner DomainEvent is collapsed — if so, hide the ghost too
                const ownerEvent = activeBoard.notes.find((n) => n.id === ownerEventId);
                if (ownerEvent?.groupCollapsed) return null;

                // Render a non-interactive ghost copy of the Aggregate note
                const ghostNote: StickyNoteType = {
                  ...note,
                  position: virtualPosition,
                };
                return (
                  <StickyNote
                    key={`${note.id}-ghost-${ownerEventId}`}
                    note={ghostNote}
                    isSelected={selectedNoteIds.includes(note.id)}
                    onSelect={onNoteSelect}
                    onLinkClick={onLinkTarget}
                    onDetailClick={(id) => onDetailClick(id, 'note')}
                    activePath={activePath}
                    allPaths={allPaths}
                    onAddCommand={onAddCommand}
                    onSetEntity={onSetEntity}
                    onHoverChange={setHoveredNoteId}
                    allNotes={activeBoard.notes}
                    isDragDisabled
                  />
                );
              })}
            </>
          );
        })()}

        {/* Link SVG Layer */}
        <LinkLayer />
      </div>

      {/* Onboarding overlay — board is genuinely empty (no path filter active) */}
      {isBoardEmpty && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 480,
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 16,
              padding: '32px 40px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 20 }}>
              Start your Event Storming
            </div>

            {/* Color legend row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 20,
            }}>
              <span style={{
                background: '#FF8C00',
                color: '#fff',
                borderRadius: 100,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                Domain Event
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>→</span>
              <span style={{
                background: '#1E88E5',
                color: '#fff',
                borderRadius: 100,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                Command
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>→</span>
              <span style={{
                background: '#FFD600',
                color: '#333',
                borderRadius: 100,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                Entity
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Place a Domain Event on the canvas to begin
            </div>

            <button
              style={{
                pointerEvents: 'auto',
                background: '#FF8C00',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onClick={() => {
                const config = ELEMENT_CONFIGS['DomainEvent'];
                const viewport = containerRef.current;
                const rect = viewport?.getBoundingClientRect();
                const vpWidth = rect?.width ?? window.innerWidth;
                const vpHeight = rect?.height ?? window.innerHeight;
                const centerX = (vpWidth / 2 - panX) / zoom;
                const centerY = (vpHeight / 2 - panY) / zoom;
                const newNote: StickyNoteType = {
                  id: uuidv4(),
                  type: 'DomainEvent',
                  label: config.label,
                  position: {
                    x: centerX - config.defaultSize.width / 2,
                    y: centerY - config.defaultSize.height / 2,
                  },
                  size: config.defaultSize,
                  zIndex: 10 + activeBoard.notes.length,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                addNote(newNote);
                setSelectedNoteIds([newNote.id]);
                setSelectedElement(newNote.id, 'note');
              }}
            >
              Place Domain Event
            </button>
          </div>
        </div>
      )}

      {/* Empty state overlay — path filter active with zero results */}
      {isEmptyState && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 16,
              padding: '24px 32px',
              textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
              No cards in this path
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Select cards and assign them to this path via the detail panel.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
