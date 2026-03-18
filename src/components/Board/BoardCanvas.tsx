import React, { useCallback } from 'react';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import { CanvasBackground } from '../Canvas/CanvasBackground';
import { StickyNote } from '../StickyNote/StickyNote';
import { Bundle } from '../Bundle/Bundle';
import { LinkLayer } from '../Links/LinkLayer';

interface Props {
  selectedNoteIds: string[];
  onNoteSelect: (id: string, multi: boolean) => void;
  onLinkTarget: (id: string, type: 'note' | 'bundle') => void;
}

export const BoardCanvas: React.FC<Props> = ({
  selectedNoteIds,
  onNoteSelect,
  onLinkTarget,
}) => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const { zoom, panX, panY, setZoom, setPan } = useUIStore();

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newZoom = Math.min(3, Math.max(0.25, zoom + delta));

      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newPanX = mouseX - (mouseX - panX) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - panY) * (newZoom / zoom);

      setZoom(newZoom);
      setPan(newPanX, newPanY);
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  return (
    <div
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      onWheel={handleWheel}
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
        {/* Bundles */}
        {activeBoard.bundles.map((bundle) => (
          <Bundle
            key={bundle.id}
            bundle={bundle}
            onLinkClick={onLinkTarget}
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
          />
        ))}

        {/* Link SVG Layer */}
        <LinkLayer />
      </div>
    </div>
  );
};
