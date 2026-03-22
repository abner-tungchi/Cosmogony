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
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { StickyNote as StickyNoteType, Bundle, Remodel } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { screenToCanvas } from '../../utils/positionUtils';
import { COLLAPSED_BUNDLE_W, COLLAPSED_BUNDLE_H } from '../../utils/linkUtils';

// Drop animation: DragOverlay shrinks back and fades out in place (no "fly back" effect)
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
  const { addNote, updateNote, addBundle, updateBundle, addRemodel, updateRemodel, addLink, collapseAllBundles, expandAllBundles } = useBoardStore();
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
  const draggedBundleStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggedRemodelStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  // Minimap: track canvas container dimensions via ResizeObserver
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

  const handleLinkTarget = useCallback((targetId: string, targetType: 'note' | 'bundle' | 'remodel') => {
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
      setLinkFrom(null, null);
      setLinkingMode(false);
    }
  }, [linkFromId, linkFromType, addLink, setLinkFrom, setLinkingMode]);

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
      // Close detail panel when clicking empty canvas
      if (!activeToolType) {
        setSelectedElement(null, null);
        return;
      }

      const canvasPos = screenToCanvas(e.clientX, e.clientY, panX, panY, zoom);

      if (activeToolType === 'Bundle') {
        const newBundle: Bundle = {
          id: uuidv4(),
          position: {
            x: canvasPos.x - (160 * 3 + 8 * 2) / 2,
            y: canvasPos.y - (120 * 2 + 8) / 2,
          },
          infoNote: { label: 'Entity', content: '' },
          entityNote: { label: 'Params', content: '' },
          commandNote: { label: 'Command', content: '' },
          eventNote: { label: 'Event', content: '' },
          zIndex: 10 + activeBoard.bundles.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addBundle(newBundle);
        setActiveToolType(null);
        return;
      }

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
          sourceEventNote: { label: '', content: '' },
          linkedBundleIds: [],
          zIndex: 10 + activeBoard.remodels.length + activeBoard.bundles.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addRemodel(newRemodel);
        setActiveToolType(null);
        return;
      }

      const config = ELEMENT_CONFIGS[activeToolType as keyof typeof ELEMENT_CONFIGS];
      if (!config) return;

      const newNote: StickyNoteType = {
        id: uuidv4(),
        type: activeToolType as StickyNoteType['type'],
        label: config.label,
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
  }, [zoom, panX, panY, activeToolType, setActiveToolType, activeBoard, addNote, addBundle, addRemodel, setSelectedNoteIds, isLinkingMode, setLinkFrom, setLinkingMode]);

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

    if (id.startsWith('bundle-')) {
      const bundleId = id.replace('bundle-', '');
      const bundle = activeBoard.bundles.find((b) => b.id === bundleId);
      if (bundle) {
        draggedBundleStart.current = { id: bundleId, x: bundle.position.x, y: bundle.position.y };
      }
      return;
    }

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

    if (id.startsWith('bundle-')) {
      const start = draggedBundleStart.current;
      if (start) {
        updateBundle(start.id, {
          position: { x: start.x + scaledDx, y: start.y + scaledDy },
        });
        draggedBundleStart.current = null;
      }
      return;
    }

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
      const newPosition = {
        x: startPos.x + scaledDx,
        y: startPos.y + scaledDy,
      };
      updateNote(noteId, { position: newPosition });
    }

    draggedNoteStartPositions.current = {};
  };

  const activeNote = activeDragId && !activeDragId.startsWith('bundle-') && !activeDragId.startsWith('remodel-')
    ? activeBoard.notes.find((n) => n.id === activeDragId)
    : null;

  const activeBundle = activeDragId?.startsWith('bundle-')
    ? activeBoard.bundles.find((b) => b.id === activeDragId.replace('bundle-', ''))
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
          cursor: isLinkingMode ? 'crosshair' : (activeToolType ? 'crosshair' : 'default'),
        }}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardCanvas
          selectedNoteIds={selectedNoteIds}
          onNoteSelect={handleNoteSelect}
          onLinkTarget={handleLinkTarget}
          onDetailClick={setSelectedElement}
        />

        {/* Global bundle collapse/expand controls */}
        <div style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          display: 'flex',
          gap: 6,
          zIndex: 100,
        }}>
          {(['collapse', 'expand'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => mode === 'collapse' ? collapseAllBundles() : expandAllBundles()}
              title={mode === 'collapse' ? '全部收起 Bundle' : '全部展開 Bundle'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              {mode === 'collapse' ? '▲' : '▼'}
              {mode === 'collapse' ? ' 全部收起' : ' 全部展開'}
            </button>
          ))}
        </div>
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
        {activeBundle && (() => {
          const DRAG_TRANSFORM = 'scale(1.05) rotate(1.5deg)';
          const DRAG_SHADOW = '0 8px 24px rgba(0,0,0,0.2)';
          if (activeBundle.collapsed) {
            const w = COLLAPSED_BUNDLE_W * zoom;
            const h = COLLAPSED_BUNDLE_H * zoom;
            return (
              <div style={{
                width: w, height: h,
                backgroundColor: '#FF8C00', color: 'white',
                borderRadius: 6, opacity: 0.45,
                boxShadow: DRAG_SHADOW,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: `${6 * zoom}px ${12 * zoom}px`,
                overflow: 'hidden',
                transform: DRAG_TRANSFORM,
              }}>
                {activeBundle.infoNote.label && (
                  <div style={{ fontSize: 10 * zoom, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 * zoom }}>
                    {activeBundle.infoNote.label}
                  </div>
                )}
                {activeBundle.commandNote.label && (
                  <div style={{ display: 'inline-flex', background: '#1E88E5', borderRadius: 3, padding: `${1 * zoom}px ${5 * zoom}px`, fontSize: 10 * zoom, fontWeight: 600, marginBottom: 3 * zoom, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {activeBundle.commandNote.label}
                  </div>
                )}
                <div style={{ fontSize: 12 * zoom, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeBundle.eventNote.label || 'Domain Event'}
                </div>
              </div>
            );
          }

          const SUB_W = 160 * zoom;
          const SUB_H = 120 * zoom;
          const GAP = 8 * zoom;
          const totalW = SUB_W * 3 + GAP * 2;
          const totalH = SUB_H * 2 + GAP;
          const SubCard = ({ bgColor, textColor, label, left, top }: {
            bgColor: string; textColor: string; label: string; left: number; top: number;
          }) => (
            <div style={{
              position: 'absolute', left, top,
              width: SUB_W, height: SUB_H,
              backgroundColor: bgColor, borderRadius: 6,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'flex-start',
              padding: 8 * zoom, boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              <span style={{
                color: textColor,
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
              <SubCard bgColor="#FFD600" textColor="#333" label={activeBundle.infoNote.label}    left={SUB_W + GAP}       top={0} />
              <SubCard bgColor="#43A047" textColor="#fff" label={activeBundle.entityNote.label}  left={0}                 top={SUB_H + GAP} />
              <SubCard bgColor="#1E88E5" textColor="#fff" label={activeBundle.commandNote.label} left={SUB_W + GAP}       top={SUB_H + GAP} />
              <SubCard bgColor="#FF8C00" textColor="#fff" label={activeBundle.eventNote.label}   left={(SUB_W + GAP) * 2} top={SUB_H + GAP} />
            </div>
          );
        })()}
        {activeRemodel && (() => {
          const DRAG_TRANSFORM = 'scale(1.05) rotate(1.5deg)';
          const DRAG_SHADOW = '0 8px 24px rgba(0,0,0,0.2)';
          const SUB_W = 160 * zoom;
          const SUB_H = 120 * zoom;
          const GAP = 8 * zoom;
          const totalW = SUB_W * 3 + GAP * 2;
          const totalH = SUB_H * 2 + GAP;
          const SubCard = ({ bgColor, label, left, top }: {
            bgColor: string; label: string; left: number; top: number;
          }) => (
            <div style={{
              position: 'absolute', left, top,
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
              <SubCard bgColor="#e9d5ff" label={activeRemodel.aggregateNote.label}    left={SUB_W + GAP}       top={0} />
              <SubCard bgColor="#cffafe" label={activeRemodel.parameterNote.label}    left={0}                 top={SUB_H + GAP} />
              <SubCard bgColor="#bfdbfe" label={activeRemodel.queryNote.label}        left={SUB_W + GAP}       top={SUB_H + GAP} />
              <SubCard bgColor="#ede9fe" label={activeRemodel.sourceEventNote.label}  left={(SUB_W + GAP) * 2} top={SUB_H + GAP} />
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
    <Minimap
      notes={activeBoard.notes}
      bundles={activeBoard.bundles}
      remodels={activeBoard.remodels}
      zoom={zoom}
      panX={panX}
      panY={panY}
      viewportWidth={viewportSize.width}
      viewportHeight={viewportSize.height}
      activePath={activePath}
    />
    </>
  );
};
