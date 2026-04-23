import type { StickyNote } from '../types/elements';
import type { DtoField } from '../types/specs';

/**
 * Derive the textual content shown on a Dto sticky note's body from its
 * structured `dtoFields` array.
 *
 * Format per line: `name: Type` (or `name?: Type` when `nullable`).
 * When a field has `dtoSpecRef` pointing to another Dto note, the referenced
 * DTO's display name is used instead of the raw `type` string — so the canvas
 * shows the actual DTO name rather than an opaque id.
 *
 * Returns null when there are no structured fields, so callers can fall back
 * to legacy placeholder rendering without confusing the two paths.
 */
export function deriveDtoContent(
  note: Pick<StickyNote, 'dtoFields'>,
  allNotes: StickyNote[] = [],
): string | null {
  const fields = note.dtoFields;
  if (!fields || fields.length === 0) return null;

  return fields.map((f) => formatDtoFieldLine(f, allNotes)).join('\n');
}

function formatDtoFieldLine(field: DtoField, allNotes: StickyNote[]): string {
  const name = field.name?.trim() || '_';
  const suffix = field.nullable ? '?' : '';
  const typeDisplay = resolveFieldType(field, allNotes);
  return `${name}${suffix}: ${typeDisplay}`;
}

/**
 * Resolve the type label for a DTO field.
 * - If `dtoSpecRef` is set and resolves to a Dto note, use that DTO's name
 *   (first line of its label). If the ref is stale, fall back to the raw type
 *   with a `(?)` marker so the user notices the broken ref on the canvas.
 * - Otherwise, use the raw `type` string (or `?` when empty, mirroring
 *   `remodelDerived.ts`).
 */
function resolveFieldType(field: DtoField, allNotes: StickyNote[]): string {
  if (field.dtoSpecRef) {
    const target = allNotes.find((n) => n.id === field.dtoSpecRef && n.type === 'Dto');
    if (target) {
      const refName = (target.label.split('\n')[0] ?? '').trim();
      return refName || '(Unnamed DTO)';
    }
    // Broken ref — show raw type if present, else a clear placeholder
    return field.type?.trim() ? `${field.type} (?)` : '(missing DTO)';
  }
  return field.type?.trim() || '?';
}
