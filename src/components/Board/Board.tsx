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
import { DetailPanel } from '../DetailPanel/DetailPanel';
import { Minimap } from './Minimap';
import { AddCommandModal } from '../Modals/AddCommandModal';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { StickyNote as StickyNoteType, Remodel, Property } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { screenToCanvas } from '../../utils/positionUtils';
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
  const { addNote, updateNote, addRemodel, updateRemodel, addLink, addCommandForEvent, linkEntityToEvent } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);
  const {
    zoom, panX, panY, setPan, activeToolType, setActiveToolType,
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

  // "Set Entity" click mode: when active, clicking an Aggregate note links it to this event
  const [pendingEntityLinkForEventId, setPendingEntityLinkForEventId] = useState<string | null>(null);

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

  const handleLinkTarget = useCallback((targetId: string, targetType: 'note' | 'remodel') => {
    if (!linkFromId || !linkFromType) {
      setLinkFrom(targetId, targetType);
    } else {
      if (targetId === linkFromId) {
        setLinkFrom(null, null);
        return;
      }

      addLink({
        id: uuidv4(),
        fromId: linkFromId,
        toId: targetId,
        fromType: linkFromType,
        toType: targetType,
        createdAt: new Date().toISOString(),
      });

      // Special case: Remodel ↔ Note — auto-populate linkedBundleIds (reused for notes post-migration)
      let remodelId: string | null = null;
      let linkedNoteId: string | null = null;

      if (linkFromType === 'remodel' && targetType === 'note') {
        remodelId = linkFromId;
        linkedNoteId = targetId;
      } else if (linkFromType === 'note' && targetType === 'remodel') {
        remodelId = targetId;
        linkedNoteId = linkFromId;
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

  // Handle "Set Entity" mode: clicking an Aggregate note links it to the pending event
  const handleNoteClickInEntityMode = useCallback((noteId: string) => {
    if (!pendingEntityLinkForEventId) return;
    const clickedNote = activeBoard.notes.find((n) => n.id === noteId);
    if (!clickedNote || clickedNote.type !== 'Aggregate') return;

    linkEntityToEvent(pendingEntityLinkForEventId, noteId);

    // Create a visual link from Aggregate → DomainEvent
    addLink({
      id: uuidv4(),
      fromId: noteId,
      toId: pendingEntityLinkForEventId,
      fromType: 'note',
      toType: 'note',
      createdAt: new Date().toISOString(),
    });

    setPendingEntityLinkForEventId(null);
  }, [pendingEntityLinkForEventId, activeBoard.notes, linkEntityToEvent, addLink]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX, panY };
      return;
    }

    if (e.button === 0) {
      // Cancel pending entity link mode if clicking empty canvas
      if (pendingEntityLinkForEventId && (e.target as HTMLElement) === e.currentTarget) {
        setPendingEntityLinkForEventId(null);
        return;
      }

      if (isLinkingMode) {
        if ((e.target as HTMLElement) === e.currentTarget) {
          setLinkFrom(null, null);
          setLinkingMode(false);
        }
        return;
      }

      setSelectedNoteIds([]);
      if (!activeToolType) {
        setSelectedElement(null, null);
        return;
      }

      const canvasPos = screenToCanvas(e.clientX, e.clientY, panX, panY, zoom);

      if (activeToolType === 'Remodel') {
        const newRemodel: Remodel = {
          id: uuidv4(),
          position: {
            x: canvasPos.x - (160 * 3 + 8 * 2) / 2,
            y: canvasPos.y - (120 * 2 + 8) / 2,
          },
          aggregateNote: { label: '', content: '' },
          parameterNote: { label: '', content: '' },
          queryNote: { label: '', content: '' },
          returnTypeNote: { label: '', content: '' },
          linkedBundleIds: [],
          linkedDtoIds: [],
          zIndex: 10 + activeBoard.remodels.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addRemodel(newRemodel);
        setActiveToolType(null);
        return;
      }

      const config = ELEMENT_CONFIGS[activeToolType as keyof typeof ELEMENT_CONFIGS];
      if (!config) return;

      const DEFAULT_DTO_LABEL = '[DtoName]\n----------\nfield: Type';
      const noteLabel = activeToolType === 'Dto' ? DEFAULT_DTO_LABEL : config.label;

      const newNote: StickyNoteType = {
        id: uuidv4(),
        type: activeToolType as StickyNoteType['type'],
        label: noteLabel,
        position: {
          x: canvasPos.x - config.defaultSize.width / 2,
          y: canvasPos.y - config.defaultSize.height / 2,
        },
        size: config.defaultSize,
        zIndex: 10 + activeBoard.notes.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      addNote(newNote);
      setActiveToolType(null);
    }
  }, [zoom, panX, panY, activeToolType, setActiveToolType, activeBoard, addNote, addRemodel, setSelectedNoteIds, isLinkingMode, setLinkFrom, setLinkingMode, pendingEntityLinkForEventId]);

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
      if (selectedNoteIds.includes(id)) {
        for (const selId of selectedNoteIds) {
          const selNote = activeBoard.notes.find((n) => n.id === selId);
          if (selNote) positions[selId] = { ...selNote.position };
        }
      }
    }
    draggedNoteStartPositions.current = positions;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { delta } = event;
    if (!event.active) return;

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
      return;
    }

    const startPositions = draggedNoteStartPositions.current;
    const notesToMove = [id, ...selectedNoteIds.filter((s) => s !== id)];

    for (const noteId of notesToMove) {
      const startPos = startPositions[noteId];
      if (!startPos) continue;
      updateNote(noteId, {
        position: { x: startPos.x + scaledDx, y: startPos.y + scaledDy },
      });
    }

    draggedNoteStartPositions.current = {};
  };

  const activeNote = activeDragId && !activeDragId.startsWith('remodel-')
    ? activeBoard.notes.find((n) => n.id === activeDragId)
    : null;

  const activeRemodel = activeDragId?.startsWith('remodel-')
    ? activeBoard.remodels.find((r) => r.id === activeDragId.replace('remodel-', ''))
    : null;

  const handleNoteSelect = (id: string, multi: boolean) => {
    // In "Set Entity" mode, clicking an Aggregate note links it
    if (pendingEntityLinkForEventId) {
      handleNoteClickInEntityMode(id);
      return;
    }
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
    addCommandForEvent(addCommandForEventId, commandLabel, information);
    setAddCommandForEventId(null);
  }, [addCommandForEventId, addCommandForEvent]);

  const handleSetEntityForEvent = useCallback((eventNoteId: string) => {
    setPendingEntityLinkForEventId(eventNoteId);
  }, []);

  const addCommandEventNote = addCommandForEventId
    ? activeBoard.notes.find((n) => n.id === addCommandForEventId)
    : null;

  return (
    <>
    <DetailPanel />
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
          cursor: pendingEntityLinkForEventId
            ? 'crosshair'
            : isLinkingMode
            ? 'crosshair'
            : activeToolType
            ? 'crosshair'
            : 'default',
        }}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardCanvas
          selectedNoteIds={selectedNoteIds}
          onNoteSelect={handleNoteSelect}
          onLinkTarget={handleLinkTarget}
          onDetailClick={setSelectedElement}
          onAddCommand={handleAddCommandForEvent}
          onSetEntity={handleSetEntityForEvent}
        />

        {/* Set Entity mode indicator */}
        {pendingEntityLinkForEventId && (
          <div style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: '#fbbf24',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid rgba(251,191,36,0.3)',
          }}>
            <span>Click an Aggregate note to link as Entity</span>
            <button
              onClick={() => setPendingEntityLinkForEventId(null)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 4,
                color: 'white',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 8px',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={DRAG_DROP_ANIMATION}>
        {activeNote && (() => {
          const cfg = ELEMENT_CONFIGS[activeNote.type];
          const w = activeNote.size.width * zoom;
          const h = activeNote.size.height * zoom;
          const DRAG_TRANSFORM = 'scale(1.05) rotate(1.5deg)';
          const DRAG_SHADOW = '0 8px 24px rgba(0,0,0,0.2)';
          if (activeNote.type === 'Diamond') {
            return (
              <div style={{
                width: w,
                height: h,
                opacity: 0.45,
                position: 'relative',
                transform: DRAG_TRANSFORM,
                filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.2))',
              }}>
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
                    {activeNote.label}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div style={{
              width: w,
              height: h,
              backgroundColor: cfg.color,
              color: cfg.textColor,
              borderRadius: 6,
              padding: 8,
              fontSize: 13 * zoom,
              boxShadow: DRAG_SHADOW,
              opacity: 0.45,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              transform: DRAG_TRANSFORM,
            }}>
              {activeNote.label}
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
      onConfirm={handleConfirmAddCommand}
      onClose={() => setAddCommandForEventId(null)}
    />
    </>
  );
};
