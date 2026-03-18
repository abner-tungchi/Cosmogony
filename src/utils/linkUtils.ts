import type { StickyNote, Bundle } from '../types/elements';

// Bundle sub-note layout constants
const SUB_NOTE_W = 160;
const SUB_NOTE_H = 120;
const GAP = 8;
const BUNDLE_W = SUB_NOTE_W * 3 + GAP * 2; // 496
const BUNDLE_H = SUB_NOTE_H * 2 + GAP;     // 248

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
  return {
    left: bundle.position.x,
    top: bundle.position.y,
    right: bundle.position.x + BUNDLE_W,
    bottom: bundle.position.y + BUNDLE_H,
    cx: bundle.position.x + BUNDLE_W / 2,
    cy: bundle.position.y + BUNDLE_H / 2,
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

export function getAnchorPoints(
  fromId: string,
  fromType: 'note' | 'bundle',
  toId: string,
  toType: 'note' | 'bundle',
  notes: StickyNote[],
  bundles: Bundle[]
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
  return getBestAnchor(fromBounds, toBounds);
}
