import React, { useRef, useEffect, useCallback } from 'react';
import type { StickyNote, Bundle, Remodel } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';

// ---- constants ----
const MINIMAP_W = 180;
const MINIMAP_H = 110;
const MINIMAP_PADDING = 8; // inner padding within minimap canvas

const BUNDLE_EXPANDED_W = 496; // 160*3 + 8*2
const BUNDLE_EXPANDED_H = 248; // 120*2 + 8
const BUNDLE_COLLAPSED_W = 200;
const BUNDLE_COLLAPSED_H = 64;

const BUNDLE_COLOR = '#FFD600'; // yellow-ish, represents the aggregate (top sub-card)
const REMODEL_COLOR = '#a78bfa'; // purple — distinct from Bundle
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
  bundles: Bundle[];
  remodels: Remodel[];
  zoom: number;
  panX: number;
  panY: number;
  /** width of the canvas viewport container in px */
  viewportWidth: number;
  /** height of the canvas viewport container in px */
  viewportHeight: number;
  activePath: string | null;
}

// Compute the bounding box of all canvas-coordinate elements
function computeWorldBounds(
  notes: StickyNote[],
  bundles: Bundle[],
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

  for (const bundle of bundles) {
    const bw = bundle.collapsed ? BUNDLE_COLLAPSED_W : BUNDLE_EXPANDED_W;
    const bh = bundle.collapsed ? BUNDLE_COLLAPSED_H : BUNDLE_EXPANDED_H;
    minX = Math.min(minX, bundle.position.x);
    minY = Math.min(minY, bundle.position.y);
    maxX = Math.max(maxX, bundle.position.x + bw);
    maxY = Math.max(maxY, bundle.position.y + bh);
  }

  // Remodels are always expanded (same size as expanded Bundle)
  for (const remodel of remodels) {
    minX = Math.min(minX, remodel.position.x);
    minY = Math.min(minY, remodel.position.y);
    maxX = Math.max(maxX, remodel.position.x + BUNDLE_EXPANDED_W);
    maxY = Math.max(maxY, remodel.position.y + BUNDLE_EXPANDED_H);
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export const Minimap: React.FC<MinimapProps> = ({
  notes,
  bundles,
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

    // High-DPI support — resizing canvas resets the context transform automatically
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = MINIMAP_W * dpr;
    canvas.height = MINIMAP_H * dpr;
    // After width/height assignment the context is reset, so scale is safe to call once
    ctx.scale(dpr, dpr);

    // Clear (canvas coords, not device pixels)
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

    // World-space bounds (union of all elements)
    const worldBounds = computeWorldBounds(notes, bundles, remodels);

    // Drawing area within minimap (with padding)
    const drawAreaX = MINIMAP_PADDING;
    const drawAreaY = MINIMAP_PADDING;
    const drawAreaW = MINIMAP_W - MINIMAP_PADDING * 2;
    const drawAreaH = MINIMAP_H - MINIMAP_PADDING * 2;

    // Also include the current viewport in world bounds so the viewport rect always fits
    // Viewport in world coords: top-left = (-panX/zoom, -panY/zoom), size = (viewportWidth/zoom, viewportHeight/zoom)
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

    // Add some margin around the world extents so elements don't touch minimap edges
    const WORLD_MARGIN = 40;
    minX -= WORLD_MARGIN;
    minY -= WORLD_MARGIN;
    maxX += WORLD_MARGIN;
    maxY += WORLD_MARGIN;

    const worldW = maxX - minX;
    const worldH = maxY - minY;

    // Scale keeping aspect ratio (fit inside drawArea)
    const scaleX = drawAreaW / worldW;
    const scaleY = drawAreaH / worldH;
    const scale = Math.min(scaleX, scaleY);

    // Center the scaled world in the draw area
    const scaledW = worldW * scale;
    const scaledH = worldH * scale;
    const offsetX = drawAreaX + (drawAreaW - scaledW) / 2;
    const offsetY = drawAreaY + (drawAreaH - scaledH) / 2;

    // Helper: world coord → minimap coord
    const toMiniX = (wx: number) => offsetX + (wx - minX) * scale;
    const toMiniY = (wy: number) => offsetY + (wy - minY) * scale;

    // ---- Draw elements ----

    // Bundles
    for (const bundle of bundles) {
      const bw = bundle.collapsed ? BUNDLE_COLLAPSED_W : BUNDLE_EXPANDED_W;
      const bh = bundle.collapsed ? BUNDLE_COLLAPSED_H : BUNDLE_EXPANDED_H;

      const isDimmed = activePath !== null && !(bundle.paths ?? []).includes(activePath);
      const bounds: ElementBounds = {
        x: toMiniX(bundle.position.x),
        y: toMiniY(bundle.position.y),
        w: bw * scale,
        h: bh * scale,
      };

      ctx.globalAlpha = isDimmed ? 0.15 : 0.85;
      ctx.fillStyle = BUNDLE_COLOR;
      ctx.fillRect(bounds.x, bounds.y, Math.max(bounds.w, 3), Math.max(bounds.h, 2));
    }

    // Remodels — draw as purple rectangles (always expanded size)
    for (const remodel of remodels) {
      const isDimmed = activePath !== null && !(remodel.paths ?? []).includes(activePath);
      const bounds: ElementBounds = {
        x: toMiniX(remodel.position.x),
        y: toMiniY(remodel.position.y),
        w: BUNDLE_EXPANDED_W * scale,
        h: BUNDLE_EXPANDED_H * scale,
      };

      ctx.globalAlpha = isDimmed ? 0.15 : 0.85;
      ctx.fillStyle = REMODEL_COLOR;
      ctx.fillRect(bounds.x, bounds.y, Math.max(bounds.w, 3), Math.max(bounds.h, 2));
    }

    // Notes — draw as small colored dots/rects
    for (const note of notes) {
      const isDimmed = activePath !== null && !(note.paths ?? []).includes(activePath);
      const config = ELEMENT_CONFIGS[note.type];

      const mx = toMiniX(note.position.x + note.size.width / 2);
      const my = toMiniY(note.position.y + note.size.height / 2);
      const DOT_R = 2.5; // radius for circular dots

      ctx.globalAlpha = isDimmed ? 0.12 : 0.85;
      ctx.fillStyle = config.color;
      ctx.beginPath();
      ctx.arc(mx, my, DOT_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset alpha
    ctx.globalAlpha = 1;

    // ---- Draw viewport rect ----
    const vpMiniX = toMiniX(vpWorldX);
    const vpMiniY = toMiniY(vpWorldY);
    const vpMiniW = vpWorldW * scale;
    const vpMiniH = vpWorldH * scale;

    ctx.strokeStyle = VIEWPORT_STROKE;
    ctx.lineWidth = VIEWPORT_STROKE_WIDTH;
    ctx.strokeRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);

    // Subtle viewport fill
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.fillRect(vpMiniX, vpMiniY, vpMiniW, vpMiniH);
  }, [notes, bundles, remodels, zoom, panX, panY, viewportWidth, viewportHeight, activePath]);

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
        pointerEvents: 'none', // pass-through — no interaction in v1
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
