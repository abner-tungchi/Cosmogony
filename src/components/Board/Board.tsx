import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DropAnimation } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import { BoardCanvas } from './BoardCanvas';
import { CollapsedChip } from './CollapsedChip';
import type { GroupBox } from './CollapsedChip';
import { DetailPanel } from '../DetailPanel/DetailPanel';
import { Minimap } from './Minimap';
import { AddCommandModal } from '../Modals/AddCommandModal';
import { SetEntityModal } from '../Modals/SetEntityModal';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { StickyNote as StickyNoteType, Property } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { COLLAPSED_REMODEL_W, COLLAPSED_REMODEL_H } from '../../utils/linkUtils';

const DRAG_DROP_ANIMATION: DropAnimation = {
  keyframes: ({ transform }) => [
    {
      transform: `translate3d(${transform.initial.x}px, ${transform.initial.y}px, 0) scale(1.05) rotate(1.5deg)`,
      opacity: 0.45,
    },
    {
      transform: `translate3d(${transform.final.x}px, ${transform.final.y}px, 0) scale(1) rotate(0deg)`,
      opacity: 0,
    },
  ],
  duration: 200,
  easing: 'ease',
  sideEffects: null,
};

export const Board: React.FC = () => {
  const { updateNote, updateRemodel, addLink, addCommandForEvent, updateCommandInformation, addEntityForEvent, linkEntityToEvent } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);
  const {
    zoom, panX, panY, setPan,
    selectedNoteIds, setSelectedNoteIds, toggleNoteSelection,
    isLinkingMode, linkFromId, linkFromType, setLinkFrom, setLinkingMode,
    setSelectedElement, activePath,
  } = useUIStore();

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const draggedNoteStartPositions = useRef<Record<string, { x: number; y: number }>>({});
  const draggedRemodelStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  // Modal for adding a Command to a DomainEvent
  const [addCommandForEventId, setAddCommandForEventId] = useState<string | null>(null);

  // Modal for setting an Entity on a DomainEvent
  const [setEntityForEventId, setSetEntityForEventId] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Resolve a note ID to its group anchor (DomainEvent) if it's a satellite
  const resolveGroupAnchor = useCallback((id: string, type: 'note' | 'remodel'): string => {
    if (type !== 'note') return id;
    const note = activeBoard.notes.find((n) => n.id === id);
    return note?.groupEventId ?? id;
  }, [activeBoard.notes]);

  const handleLinkTarget = useCallback((targetId: string, targetType: 'note' | 'remodel') => {
    if (!linkFromId || !linkFromType) {
      const resolvedId = resolveGroupAnchor(targetId, targetType);
      setLinkFrom(resolvedId, targetType);
    } else {
      const resolvedTargetId = resolveGroupAnchor(targetId, targetType);
      const resolvedFromId = resolveGroupAnchor(linkFromId, linkFromType);

      if (resolvedTargetId === resolvedFromId) {
        setLinkFrom(null, null);
        return;
      }

      addLink({
        id: uuidv4(),
        fromId: resolvedFromId,
        toId: resolvedTargetId,
        fromType: linkFromType,
        toType: targetType,
        createdAt: new Date().toISOString(),
      });

      // Special case: Remodel ↔ Note — auto-populate linkedBundleIds (reused for notes post-migration)
      let remodelId: string | null = null;
      let linkedNoteId: string | null = null;

      if (linkFromType === 'remodel' && targetType === 'note') {
        remodelId = resolvedFromId;
        linkedNoteId = resolvedTargetId;
      } else if (linkFromType === 'note' && targetType === 'remodel') {
        remodelId = resolvedTargetId;
        linkedNoteId = resolvedFromId;
      }

      if (remodelId && linkedNoteId) {
        const remodel = activeBoard.remodels.find((r) => r.id === remodelId);
        const linkedNote = activeBoard.notes.find((n) => n.id === linkedNoteId);
        if (remodel && linkedNote) {
          if (linkedNote.type === 'Dto') {
            // Dto notes go to linkedDtoIds
            if (!remodel.linkedDtoIds.includes(linkedNoteId)) {
              updateRemodel(remodelId, {
                linkedDtoIds: [...remodel.linkedDtoIds, linkedNoteId],
              });
            }
          } else {
            // Other notes go to linkedBundleIds (renamed conceptually to linkedNoteIds)
            if (!remodel.linkedBundleIds.includes(linkedNoteId)) {
              updateRemodel(remodelId, {
                linkedBundleIds: [...remodel.linkedBundleIds, linkedNoteId],
              });
            }
          }
        }
      }

      setLinkFrom(null, null);
      setLinkingMode(false);
    }
  }, [linkFromId, linkFromType, addLink, setLinkFrom, setLinkingMode, activeBoard.remodels, activeBoard.notes, updateRemodel]);


  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX, panY };
      return;
    }

    if (e.button === 0) {
      if (isLinkingMode) {
        if ((e.target as HTMLElement) === e.currentTarget) {
          setLinkFrom(null, null);
          setLinkingMode(false);
        }
        return;
      }

      setSelectedNoteIds([]);
      setSelectedElement(null, null);
    }
  }, [panX, panY, setSelectedNoteIds, isLinkingMode, setLinkFrom, setLinkingMode, setSelectedElement]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
    }
  }, [setPan]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  React.useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveDragId(id);

    if (id.startsWith('remodel-')) {
      const remodelId = id.replace('remodel-', '');
      const remodel = activeBoard.remodels.find((r) => r.id === remodelId);
      if (remodel) {
        draggedRemodelStart.current = { id: remodelId, x: remodel.position.x, y: remodel.position.y };
      }
      return;
    }

    const positions: Record<string, { x: number; y: number }> = {};
    const note = activeBoard.notes.find((n) => n.id === id);
    if (note) {
      positions[id] = { ...note.position };

      // Collect group members: if dragging a satellite, include DomainEvent anchor + all siblings
      // If dragging a DomainEvent, include all satellites
      const groupEventId = note.groupEventId ?? (note.type === 'DomainEvent' ? note.id : null);
      if (groupEventId) {
        for (const n of activeBoard.notes) {
          if (n.id !== id && (n.groupEventId === groupEventId || n.id === groupEventId)) {
            positions[n.id] = { ...n.position };
          }
        }
      }

      // Also include manually multi-selected notes
      if (selectedNoteIds.includes(id)) {
        for (const selId of selectedNoteIds) {
          const selNote = activeBoard.notes.find((n) => n.id === selId);
          if (selNote && !positions[selId]) positions[selId] = { ...selNote.position };
        }
      }
    }
    draggedNoteStartPositions.current = positions;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { delta } = event;
    if (!event.active) {
      setActiveDragId(null);
      return;
    }

    const id = String(event.active.id);
    const scaledDx = delta.x / zoom;
    const scaledDy = delta.y / zoom;

    if (id.startsWith('remodel-')) {
      const start = draggedRemodelStart.current;
      if (start) {
        updateRemodel(start.id, {
          position: { x: start.x + scaledDx, y: start.y + scaledDy },
        });
        draggedRemodelStart.current = null;
      }
      // Delay clearing activeDragId so position updates are applied before overlay disappears
      requestAnimationFrame(() => {
        setActiveDragId(null);
      });
      return;
    }

    const startPositions = draggedNoteStartPositions.current;
    // Move all collected positions (group members + multi-selection)
    const allNoteIds = Object.keys(startPositions);

    for (const noteId of allNoteIds) {
      const startPos = startPositions[noteId];
      if (!startPos) continue;
      updateNote(noteId, {
        position: { x: startPos.x + scaledDx, y: startPos.y + scaledDy },
      });
    }

    draggedNoteStartPositions.current = {};

    // Delay clearing activeDragId so position updates are applied before overlay disappears
    requestAnimationFrame(() => {
      setActiveDragId(null);
    });
  };

  const activeNote = activeDragId && !activeDragId.startsWith('remodel-')
    ? activeBoard.notes.find((n) => n.id === activeDragId)
    : null;

  const activeRemodel = activeDragId?.startsWith('remodel-')
    ? activeBoard.remodels.find((r) => r.id === activeDragId.replace('remodel-', ''))
    : null;

  const handleNoteSelect = (id: string, multi: boolean) => {
    if (multi) {
      toggleNoteSelection(id);
    } else {
      setSelectedNoteIds([id]);
    }
  };

  const handleAddCommandForEvent = useCallback((eventNoteId: string) => {
    setAddCommandForEventId(eventNoteId);
  }, []);

  const handleConfirmAddCommand = useCallback((commandLabel: string, information: Property[]) => {
    if (!addCommandForEventId) return;
    const eventNote = activeBoard.notes.find((n) => n.id === addCommandForEventId);
    if (eventNote?.commandId) {
      // Editing an existing command: update label and information in place
      updateNote(eventNote.commandId, { label: commandLabel });
      updateCommandInformation(eventNote.commandId, information);
    } else {
      addCommandForEvent(addCommandForEventId, commandLabel, information);
      // Task 7: copy Information params to DomainEvent's eventProperties as defaults,
      // only if the event has no existing eventProperties set
      if (information.length > 0 && (!eventNote?.eventProperties || eventNote.eventProperties.length === 0)) {
        updateNote(addCommandForEventId, { eventProperties: information });
      }
    }
    setAddCommandForEventId(null);
  }, [addCommandForEventId, activeBoard.notes, addCommandForEvent, updateNote, updateCommandInformation]);

  const handleSetEntityForEvent = useCallback((eventNoteId: string) => {
    setSetEntityForEventId(eventNoteId);
  }, []);

  const handleConfirmSetEntity = useCallback((entityLabel: string) => {
    if (!setEntityForEventId) return;
    addEntityForEvent(setEntityForEventId, entityLabel);
    setSetEntityForEventId(null);
  }, [setEntityForEventId, addEntityForEvent]);

  const handleLinkExistingEntity = useCallback((entityNoteId: string) => {
    if (!setEntityForEventId) return;
    linkEntityToEvent(setEntityForEventId, entityNoteId);
    setSetEntityForEventId(null);
  }, [setEntityForEventId, linkEntityToEvent]);

  const addCommandEventNote = addCommandForEventId
    ? activeBoard.notes.find((n) => n.id === addCommandForEventId)
    : null;

  // When editing an already-linked command, look up its current values for pre-filling
  const existingCommandNote = addCommandEventNote?.commandId
    ? activeBoard.notes.find((n) => n.id === addCommandEventNote.commandId)
    : null;

  const setEntityEventNote = setEntityForEventId
    ? activeBoard.notes.find((n) => n.id === setEntityForEventId)
    : null;

  return (
    <>
    <DetailPanel
      onAddCommand={handleAddCommandForEvent}
      onSetEntity={handleSetEntityForEvent}
    />
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={canvasContainerRef}
        id="board-canvas-viewport"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: '#f8fafc',
          cursor: isLinkingMode ? 'crosshair' : 'default',
        }}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardCanvas
          selectedNoteIds={selectedNoteIds}
          activeDragId={activeDragId}
          onNoteSelect={handleNoteSelect}
          onLinkTarget={handleLinkTarget}
          onDetailClick={setSelectedElement}
          onAddCommand={handleAddCommandForEvent}
          onSetEntity={handleSetEntityForEvent}
        />

      </div>

      <DragOverlay dropAnimation={DRAG_DROP_ANIMATION}>
        {activeNote && (() => {
          const DRAG_TRANSFORM = 'scale(1.05) rotate(1.5deg)';
          const DRAG_SHADOW = '0 8px 24px rgba(0,0,0,0.2)';

          // Check if the dragged note is a collapsed group anchor
          const isCollapsedAnchor = activeNote.groupCollapsed === true;

          if (isCollapsedAnchor) {
            // Build a minimal GroupBox for the CollapsedChip overlay
            const chipBox: GroupBox = {
              x: activeNote.position.x,
              y: activeNote.position.y,
              width: 200,
              height: 40,
              groupEventId: activeNote.id,
              anchorLabel: activeNote.label,
              collapsed: true,
              anchorNote: activeNote,
            };
            return (
              <div style={{
                opacity: 0.45,
                transform: `scale(${zoom}) ${DRAG_TRANSFORM}`,
                transformOrigin: 'top left',
              }}>
                <CollapsedChip
                  box={chipBox}
                  notes={activeBoard.notes}
                  isSelected={false}
                  isDimmed={false}
                  onExpand={() => {}}
                  onSelect={() => {}}
                  onDetailClick={() => {}}
                />
              </div>
            );
          }

          // Collect all notes in the same group for rendering
          const groupEventId = activeNote.groupEventId ?? (activeNote.type === 'DomainEvent' ? activeNote.id : null);
          const groupNotes: StickyNoteType[] = groupEventId
            ? activeBoard.notes.filter(
                (n) => n.id === groupEventId || n.groupEventId === groupEventId
              )
            : [activeNote];

          const renderNote = (note: StickyNoteType, offsetX: number, offsetY: number) => {
            const cfg = ELEMENT_CONFIGS[note.type];
            const w = note.size.width * zoom;
            const h = note.size.height * zoom;

            if (note.type === 'Diamond') {
              return (
                <div
                  key={note.id}
                  style={{
                    position: 'absolute',
                    left: offsetX,
                    top: offsetY,
                    width: w,
                    height: h,
                    filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.2))',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    width: w,
                    height: h,
                    transform: 'rotate(45deg)',
                    backgroundColor: cfg.color,
                    borderRadius: 8 * zoom,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <div style={{
                      transform: 'rotate(-45deg)',
                      color: cfg.textColor,
                      fontSize: 12 * zoom,
                      textAlign: 'center',
                      padding: 8,
                      width: '80%',
                      wordBreak: 'break-word',
                    }}>
                      {note.label}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={note.id}
                style={{
                  position: 'absolute',
                  left: offsetX,
                  top: offsetY,
                  width: w,
                  height: h,
                  backgroundColor: cfg.color,
                  color: cfg.textColor,
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 13 * zoom,
                  boxShadow: DRAG_SHADOW,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                {note.label}
              </div>
            );
          };

          return (
            <div style={{
              position: 'relative',
              opacity: 0.45,
              transform: DRAG_TRANSFORM,
            }}>
              {groupNotes.map((note) => {
                const offsetX = (note.position.x - activeNote.position.x) * zoom;
                const offsetY = (note.position.y - activeNote.position.y) * zoom;
                return renderNote(note, offsetX, offsetY);
              })}
            </div>
          );
        })()}
        {activeRemodel && (() => {
          const DRAG_TRANSFORM = 'scale(1.05) rotate(1.5deg)';
          const DRAG_SHADOW = '0 8px 24px rgba(0,0,0,0.2)';
          if (activeRemodel.collapsed) {
            const w = COLLAPSED_REMODEL_W * zoom;
            const h = COLLAPSED_REMODEL_H * zoom;
            return (
              <div style={{
                width: w, height: h,
                backgroundColor: '#a78bfa', color: 'white',
                borderRadius: 6, opacity: 0.45,
                boxShadow: DRAG_SHADOW,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: `${6 * zoom}px ${12 * zoom}px`,
                overflow: 'hidden',
                transform: DRAG_TRANSFORM,
              }}>
                <div style={{ fontSize: 12 * zoom, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeRemodel.queryNote.label || 'Read Model'}
                </div>
              </div>
            );
          }
          const SUB_W = 160 * zoom;
          const SUB_H = 120 * zoom;
          const GAP = 8 * zoom;
          const totalW = SUB_W * 3 + GAP * 2;
          const totalH = SUB_H;
          const SubCard = ({ bgColor, label, left }: {
            bgColor: string; label: string; left: number;
          }) => (
            <div style={{
              position: 'absolute', left, top: 0,
              width: SUB_W, height: SUB_H,
              backgroundColor: bgColor, borderRadius: 6,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'flex-start',
              padding: 8 * zoom, boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              <span style={{
                color: '#1e293b',
                fontSize: 12 * zoom,
                fontWeight: 700,
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}>
                {label || '—'}
              </span>
            </div>
          );
          return (
            <div style={{
              width: totalW,
              height: totalH,
              position: 'relative',
              opacity: 0.45,
              transform: DRAG_TRANSFORM,
              filter: `drop-shadow(${DRAG_SHADOW})`,
            }}>
              <SubCard bgColor="#bbf7d0" label={activeRemodel.parameterNote.label} left={0} />
              <SubCard bgColor="#bfdbfe" label={activeRemodel.queryNote.label}     left={SUB_W + GAP} />
              <SubCard bgColor="#bbf7d0" label={activeRemodel.returnTypeNote.label} left={(SUB_W + GAP) * 2} />
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
    <Minimap
      notes={activeBoard.notes}
      remodels={activeBoard.remodels}
      zoom={zoom}
      panX={panX}
      panY={panY}
      viewportWidth={viewportSize.width}
      viewportHeight={viewportSize.height}
      activePath={activePath}
    />

    {/* Add Command Modal */}
    <AddCommandModal
      isOpen={addCommandForEventId !== null}
      eventNoteId={addCommandForEventId ?? ''}
      eventNoteLabel={addCommandEventNote?.label ?? ''}
      initialLabel={existingCommandNote?.label}
      initialInformation={existingCommandNote?.information}
      onConfirm={handleConfirmAddCommand}
      onClose={() => setAddCommandForEventId(null)}
    />

    {/* Set Entity Modal */}
    <SetEntityModal
      isOpen={setEntityForEventId !== null}
      eventNoteId={setEntityForEventId ?? ''}
      eventNoteLabel={setEntityEventNote?.label ?? ''}
      existingEntities={activeBoard.notes
        .filter((n) => n.type === 'Entity')
        .map((n) => ({ id: n.id, label: n.label, type: n.type }))}
      onConfirm={handleConfirmSetEntity}
      onLinkExisting={handleLinkExistingEntity}
      onClose={() => setSetEntityForEventId(null)}
    />
    </>
  );
};
