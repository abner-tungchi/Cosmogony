import type { StickyNote, Remodel } from '../types/elements';

export interface DragOffset {
  noteIds: string[];    // note IDs currently being dragged
  remodelIds: string[]; // remodel IDs currently being dragged
  dx: number;           // canvas-coordinate offset (screen px / zoom)
  dy: number;
}

export const COLLAPSED_REMODEL_W = 280;
export const COLLAPSED_REMODEL_H = 48;

// CollapsedChip approximate width (height is computed dynamically based on content)
const COLLAPSED_CHIP_W = 200;

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

/**
 * Resolve a note ID to the canonical group anchor ID (DomainEvent).
 * Satellite notes (Command, Entity, Information, Aggregate) point back to their DomainEvent.
 */
function resolveAnchorId(id: string, notes: StickyNote[]): string {
  const note = notes.find((n) => n.id === id);
  return note?.groupEventId ?? id;
}

/**
 * Compute the bounding box for a note's link endpoint.
 * - DomainEvent (group anchor): returns the full group bounding box (anchor + all satellites).
 *   When the group is collapsed, only the DomainEvent note itself is used.
 * - Satellite note: resolves to its DomainEvent, then returns the group bounding box.
 * - Standalone note (no group): returns the note's own bounds.
 */
function getNoteBoundsForLink(id: string, notes: StickyNote[]): Bounds | null {
  const anchorId = resolveAnchorId(id, notes);
  const anchor = notes.find((n) => n.id === anchorId);
  if (!anchor) return null;

  // If this is a DomainEvent (group anchor), compute group bounding box
  if (anchor.type === 'DomainEvent') {
    // Collapsed group: link connects to the CollapsedChip visual bounds (dynamic height)
    if (anchor.groupCollapsed) {
      const BASE_HEIGHT = 40;
      const COMMAND_ROW_H = 20;
      const PARAM_ROW_H = 18;
      let chipH = BASE_HEIGHT;
      if (anchor.commandId) {
        chipH += COMMAND_ROW_H; // command name row
        const infoNote = notes.find((n) => n.informationForCommandId === anchor.commandId);
        const paramCount = Math.min(infoNote?.information?.length ?? 0, 4);
        chipH += paramCount * PARAM_ROW_H;
      }
      return {
        left: anchor.position.x,
        top: anchor.position.y,
        right: anchor.position.x + COLLAPSED_CHIP_W,
        bottom: anchor.position.y + chipH,
        cx: anchor.position.x + COLLAPSED_CHIP_W / 2,
        cy: anchor.position.y + chipH / 2,
      };
    }

    const satellites = notes.filter((n) => n.groupEventId === anchorId);
    const members = [anchor, ...satellites];

    const minX = Math.min(...members.map((n) => n.position.x));
    const minY = Math.min(...members.map((n) => n.position.y));
    const maxX = Math.max(...members.map((n) => n.position.x + n.size.width));
    const maxY = Math.max(...members.map((n) => n.position.y + n.size.height));

    return {
      left: minX, top: minY, right: maxX, bottom: maxY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    };
  }

  // Standalone note: use its own bounds
  return getNoteBounds(anchor);
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
    fromBounds = getNoteBoundsForLink(fromId, notes);
  } else {
    const remodel = remodels?.find((r) => r.id === fromId);
    if (remodel) fromBounds = getRemodelBounds(remodel);
  }

  if (toType === 'note') {
    toBounds = getNoteBoundsForLink(toId, notes);
  } else {
    const remodel = remodels?.find((r) => r.id === toId);
    if (remodel) toBounds = getRemodelBounds(remodel);
  }

  if (!fromBounds || !toBounds) return null;

  // Apply live drag offset so links track the group while dragging.
  // Resolve to group anchor ID for drag check (dragging DomainEvent moves the whole group).
  if (drag) {
    const fromAnchorId = fromType === 'note' ? resolveAnchorId(fromId, notes) : fromId;
    const toAnchorId   = toType   === 'note' ? resolveAnchorId(toId,   notes) : toId;
    const dragNoteIds  = drag.noteIds;
    const dragRemodels = drag.remodelIds;

    const fromDragged = fromType === 'note' ? dragNoteIds.includes(fromAnchorId) : dragRemodels.includes(fromId);
    const toDragged   = toType   === 'note' ? dragNoteIds.includes(toAnchorId)   : dragRemodels.includes(toId);

    if (fromDragged) fromBounds = shiftBounds(fromBounds, drag.dx, drag.dy);
    if (toDragged)   toBounds   = shiftBounds(toBounds,   drag.dx, drag.dy);
  }

  return getBestAnchor(fromBounds, toBounds);
}
