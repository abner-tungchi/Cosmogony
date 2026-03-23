import React, { useRef, useEffect, useCallback } from 'react';
import type { StickyNote, Remodel } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';

// ---- constants ----
const MINIMAP_W = 180;
const MINIMAP_H = 110;
const MINIMAP_PADDING = 8;

const REMODEL_EXPANDED_W = 496;
const REMODEL_EXPANDED_H = 248;

const REMODEL_COLOR = '#a78bfa';
const VIEWPORT_STROKE = '#3b82f6';
const VIEWPORT_STROKE_WIDTH = 1.5;

// ---- types ----
interface ElementBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MinimapProps {
  notes: StickyNote[];
  remodels: Remodel[];
  zoom: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
  activePath: string | null;
}

function computeWorldBounds(
  notes: StickyNote[],
  remodels: Remodel[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const note of notes) {
    minX = Math.min(minX, note.position.x);
    minY = Math.min(minY, note.position.y);
    maxX = Math.max(maxX, note.position.x + note.size.width);
    maxY = Math.max(maxY, note.position.y + note.size.height);
  }

  for (const remodel of remodels) {
    minX = Math.min(minX, remodel.position.x);
    minY = Math.min(minY, remodel.position.y);
    maxX = Math.max(maxX, remodel.position.x + REMODEL_EXPANDED_W);
    maxY = Math.max(maxY, remodel.position.y + REMODEL_EXPANDED_H);
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export const Minimap: React.FC<MinimapProps> = ({
  notes,
  remodels,
  zoom,
  panX,
  panY,
  viewportWidth,
  viewportHeight,
  activePath,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = MINIMAP_W * dpr;
    canvas.height = MINIMAP_H * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

    const worldBounds = computeWorldBounds(notes, remodels);

    const drawAreaX = MINIMAP_PADDING;
    const drawAreaY = MINIMAP_PADDING;
    const drawAreaW = MINIMAP_W - MINIMAP_PADDING * 2;
    const drawAreaH = MINIMAP_H - MINIMAP_PADDING * 2;

    const vpWorldX = -panX / zoom;
    const vpWorldY = -panY / zoom;
    const vpWorldW = viewportWidth / zoom;
    const vpWorldH = viewportHeight / zoom;

    let minX: number;
    let minY: number;
    let maxX: number;
    let maxY: number;

    if (worldBounds) {
      minX = Math.min(worldBounds.minX, vpWorldX);
      minY = Math.min(worldBounds.minY, vpWorldY);
      maxX = Math.max(worldBounds.maxX, vpWorldX + vpWorldW);
      maxY = Math.max(worldBounds.maxY, vpWorldY + vpWorldH);
    } else {
      minX = vpWorldX;
      minY = vpWorldY;
      maxX = vpWorldX + vpWorldW;
      maxY = vpWorldY + vpWorldH;
    }

    const WORLD_MARGIN = 40;
    minX -= WORLD_MARGIN;
    minY -= WORLD_MARGIN;
    maxX += WORLD_MARGIN;
    maxY += WORLD_MARGIN;

    const worldW = maxX - minX;
    const worldH = maxY - minY;

    const scaleX = drawAreaW / worldW;
    const scaleY = drawAreaH / worldH;
    const scale = Math.min(scaleX, scaleY);

    const scaledW = worldW * scale;
    const scaledH = worldH * scale;
    const offsetX = drawAreaX + (drawAreaW - scaledW) / 2;
    const offsetY = drawAreaY + (drawAreaH - scaledH) / 2;

    const toMiniX = (wx: number) => offsetX + (wx - minX) * scale;
    const toMiniY = (wy: number) => offsetY + (wy - minY) * scale;

    // ---- Draw remodels as purple rectangles ----
    for (const remodel of remodels) {
      const isDimmed = activePath !== null && !(remodel.paths ?? []).includes(activePath);
      const bounds: ElementBounds = {
        x: toMiniX(remodel.position.x),
        y: toMiniY(remodel.position.y),
        w: REMODEL_EXPANDED_W * scale,
        h: REMODEL_EXPANDED_H * scale,
      };

      ctx.globalAlpha = isDimmed ? 0.15 : 0.85;
      ctx.fillStyle = REMODEL_COLOR;
      ctx.fillRect(bounds.x, bounds.y, Math.max(bounds.w, 3), Math.max(bounds.h, 2));
    }

    // ---- Draw notes as small colored dots ----
    for (const note of notes) {
      const isDimmed = activePath !== null && !(note.paths ?? []).includes(activePath);
      const config = ELEMENT_CONFIGS[note.type];

      const mx = toMiniX(note.position.x + note.size.width / 2);
      const my = toMiniY(note.position.y + note.size.height / 2);
      const DOT_R = 2.5;

      ctx.globalAlpha = isDimmed ? 0.12 : 0.85;
      ctx.fillStyle = config.color;
      ctx.beginPath();
      ctx.arc(mx, my, DOT_R, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // ---- Draw viewport rect ----
    const vpMiniX = toMiniX(vpWorldX);
    const vpMiniY = toMiniY(vpWorldY);
    const vpMiniW = vpWorldW * scale;
    const vpMiniH = vpWorldH * scale;

    ctx.strokeStyle = VIEWPORT_STROKE;
    ctx.lineWidth = VIEWPORT_STROKE_WIDTH;
    ctx.strokeRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.fillRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);
  }, [notes, remodels, zoom, panX, panY, viewportWidth, viewportHeight, activePath]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: 'rgba(30, 41, 59, 0.85)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        zIndex: 90,
        overflow: 'hidden',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: MINIMAP_W,
          height: MINIMAP_H,
          display: 'block',
        }}
      />
    </div>
  );
};
