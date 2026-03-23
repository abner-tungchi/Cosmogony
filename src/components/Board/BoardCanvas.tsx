import React, { useCallback, useEffect, useRef } from 'react';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import { CanvasBackground } from '../Canvas/CanvasBackground';
import { StickyNote } from '../StickyNote/StickyNote';
import { Remodel } from '../Remodel/Remodel';
import { LinkLayer } from '../Links/LinkLayer';
import type { FlowPath } from '../../types/elements';
import { PhaseLane } from './PhaseLane';

interface Props {
  selectedNoteIds: string[];
  onNoteSelect: (id: string, multi: boolean) => void;
  onLinkTarget: (id: string, type: 'note' | 'remodel') => void;
  onDetailClick: (id: string, type: 'note' | 'remodel') => void;
  onAddCommand?: (eventNoteId: string) => void;
  onSetEntity?: (eventNoteId: string) => void;
}

export const BoardCanvas: React.FC<Props> = ({
  selectedNoteIds,
  onNoteSelect,
  onLinkTarget,
  onDetailClick,
  onAddCommand,
  onSetEntity,
}) => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const { zoom, panX, panY, setZoom, setPan, activePath, fitAll } = useUIStore();
  const allPaths: FlowPath[] = activeBoard.flowPaths;

  const isPathFilterActive = activePath !== null;
  const filteredNoteCount = isPathFilterActive
    ? activeBoard.notes.filter((n) => n.paths?.includes(activePath)).length
    : activeBoard.notes.length;
  const filteredRemodelCount = isPathFilterActive
    ? activeBoard.remodels.filter((r) => r.paths?.includes(activePath)).length
    : activeBoard.remodels.length;
  const isEmptyState = isPathFilterActive && filteredNoteCount === 0 && filteredRemodelCount === 0;
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

        {/* Sticky Notes */}
        {activeBoard.notes.map((note) => (
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
            allNotes={activeBoard.notes}
          />
        ))}

        {/* Link SVG Layer */}
        <LinkLayer />
      </div>

      {/* Empty state overlay */}
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
