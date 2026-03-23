import type { StickyNote, Remodel } from '../types/elements';

export interface DragOffset {
  noteIds: string[];    // note IDs currently being dragged
  remodelIds: string[]; // remodel IDs currently being dragged
  dx: number;           // canvas-coordinate offset (screen px / zoom)
  dy: number;
}

export const COLLAPSED_REMODEL_W = 400;
export const COLLAPSED_REMODEL_H = 128;

// Remodel expanded dimensions (same as old Bundle constants)
const REMODEL_W = 496;
const REMODEL_H = 248;

function getNoteBounds(note: StickyNote) {
  return {
    left: note.position.x,
    top: note.position.y,
    right: note.position.x + note.size.width,
    bottom: note.position.y + note.size.height,
    cx: note.position.x + note.size.width / 2,
    cy: note.position.y + note.size.height / 2,
  };
}

function getRemodelBounds(remodel: Remodel) {
  const w = remodel.collapsed ? (remodel.collapsedSize?.width ?? COLLAPSED_REMODEL_W) : REMODEL_W;
  const h = remodel.collapsed ? (remodel.collapsedSize?.height ?? COLLAPSED_REMODEL_H) : REMODEL_H;
  return {
    left: remodel.position.x,
    top: remodel.position.y,
    right: remodel.position.x + w,
    bottom: remodel.position.y + h,
    cx: remodel.position.x + w / 2,
    cy: remodel.position.y + h / 2,
  };
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

function getBestAnchor(from: Bounds, to: Bounds): { fx: number; fy: number; tx: number; ty: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) {
      return { fx: from.right, fy: from.cy, tx: to.left, ty: to.cy };
    } else {
      return { fx: from.left, fy: from.cy, tx: to.right, ty: to.cy };
    }
  } else {
    if (dy > 0) {
      return { fx: from.cx, fy: from.bottom, tx: to.cx, ty: to.top };
    } else {
      return { fx: from.cx, fy: from.top, tx: to.cx, ty: to.bottom };
    }
  }
}

function shiftBounds(b: Bounds, dx: number, dy: number): Bounds {
  return { left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy, cx: b.cx + dx, cy: b.cy + dy };
}

export function getAnchorPoints(
  fromId: string,
  fromType: 'note' | 'remodel',
  toId: string,
  toType: 'note' | 'remodel',
  notes: StickyNote[],
  drag?: DragOffset | null,
  remodels?: Remodel[]
): { fx: number; fy: number; tx: number; ty: number } | null {
  let fromBounds: Bounds | null = null;
  let toBounds: Bounds | null = null;

  if (fromType === 'note') {
    const note = notes.find((n) => n.id === fromId);
    if (note) fromBounds = getNoteBounds(note);
  } else {
    const remodel = remodels?.find((r) => r.id === fromId);
    if (remodel) fromBounds = getRemodelBounds(remodel);
  }

  if (toType === 'note') {
    const note = notes.find((n) => n.id === toId);
    if (note) toBounds = getNoteBounds(note);
  } else {
    const remodel = remodels?.find((r) => r.id === toId);
    if (remodel) toBounds = getRemodelBounds(remodel);
  }

  if (!fromBounds || !toBounds) return null;

  // Apply live drag offset so links track the element while dragging
  if (drag) {
    const getDragIds = (type: 'note' | 'remodel') => {
      if (type === 'note') return drag.noteIds;
      return drag.remodelIds;
    };
    if (getDragIds(fromType).includes(fromId)) fromBounds = shiftBounds(fromBounds, drag.dx, drag.dy);
    if (getDragIds(toType).includes(toId))     toBounds   = shiftBounds(toBounds,   drag.dx, drag.dy);
  }

  return getBestAnchor(fromBounds, toBounds);
}
