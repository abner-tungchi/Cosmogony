import type { StickyNote, Bundle } from '../types/elements';

export interface DragOffset {
  noteIds: string[];   // note IDs currently being dragged
  bundleIds: string[]; // bundle IDs currently being dragged
  dx: number;          // canvas-coordinate offset (screen px / zoom)
  dy: number;
}

// Bundle sub-note layout constants
const SUB_NOTE_W = 160;
const SUB_NOTE_H = 120;
const GAP = 8;
const BUNDLE_W = SUB_NOTE_W * 3 + GAP * 2; // 496
const BUNDLE_H = SUB_NOTE_H * 2 + GAP;     // 248

export const COLLAPSED_BUNDLE_W = 200;
export const COLLAPSED_BUNDLE_H = 64;

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

function getBundleBounds(bundle: Bundle) {
  const w = bundle.collapsed ? COLLAPSED_BUNDLE_W : BUNDLE_W;
  const h = bundle.collapsed ? COLLAPSED_BUNDLE_H : BUNDLE_H;
  return {
    left: bundle.position.x,
    top: bundle.position.y,
    right: bundle.position.x + w,
    bottom: bundle.position.y + h,
    cx: bundle.position.x + w / 2,
    cy: bundle.position.y + h / 2,
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
    // Horizontal connection
    if (dx > 0) {
      return { fx: from.right, fy: from.cy, tx: to.left, ty: to.cy };
    } else {
      return { fx: from.left, fy: from.cy, tx: to.right, ty: to.cy };
    }
  } else {
    // Vertical connection
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
  fromType: 'note' | 'bundle',
  toId: string,
  toType: 'note' | 'bundle',
  notes: StickyNote[],
  bundles: Bundle[],
  drag?: DragOffset | null
): { fx: number; fy: number; tx: number; ty: number } | null {
  let fromBounds: Bounds | null = null;
  let toBounds: Bounds | null = null;

  if (fromType === 'note') {
    const note = notes.find((n) => n.id === fromId);
    if (note) fromBounds = getNoteBounds(note);
  } else {
    const bundle = bundles.find((b) => b.id === fromId);
    if (bundle) fromBounds = getBundleBounds(bundle);
  }

  if (toType === 'note') {
    const note = notes.find((n) => n.id === toId);
    if (note) toBounds = getNoteBounds(note);
  } else {
    const bundle = bundles.find((b) => b.id === toId);
    if (bundle) toBounds = getBundleBounds(bundle);
  }

  if (!fromBounds || !toBounds) return null;

  // Apply live drag offset so links track the element while dragging
  if (drag) {
    const fromIds = fromType === 'note' ? drag.noteIds : drag.bundleIds;
    const toIds   = toType   === 'note' ? drag.noteIds : drag.bundleIds;
    if (fromIds.includes(fromId)) fromBounds = shiftBounds(fromBounds, drag.dx, drag.dy);
    if (toIds.includes(toId))     toBounds   = shiftBounds(toBounds,   drag.dx, drag.dy);
  }

  return getBestAnchor(fromBounds, toBounds);
}
