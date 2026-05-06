import type { StickyNote } from '../types/elements';
import type { DtoField } from '../types/specs';

/**
 * Matches a single-level container wrapper around a base type, e.g.
 * `Array[OrderDto]` / `Set[String]` / `List[Email]`. Capture group 1 is the
 * wrapper name; capture group 2 is the inner base type. Nesting is NOT
 * supported by design — the picker UI cannot produce nested wrappers, and
 * downstream codegen is documented to treat nested forms as undefined.
 */
const WRAPPER_PATTERN = /^(Array|Set|List)\[(.+)\]$/;

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
 * Resolve the display string for a DTO field's type.
 *
 * Invariant (formalized; shared by picker trigger, canvas DTO note, and any
 * future export):
 *   1. Parse `field.type` against WRAPPER_PATTERN to extract `wrapper` and
 *      `inner` (when no match, wrapper=undefined, inner=field.type).
 *   2. If `dtoSpecRef` is set and resolves to a Dto note → innerDisplay is
 *      that DTO's label first-line (trimmed).
 *   3. If `dtoSpecRef` is set but stale → innerDisplay is `<inner> (?)` (or a
 *      placeholder when inner is empty).
 *   4. If `dtoSpecRef` is unset → innerDisplay is the raw `inner` (or `?`
 *      when empty, mirroring `remodelDerived.ts`).
 *   5. Final return wraps innerDisplay in `<wrapper>[innerDisplay]` when a
 *      wrapper was parsed, else returns innerDisplay unchanged.
 */
function resolveFieldType(field: DtoField, allNotes: StickyNote[]): string {
  const rawType = field.type ?? '';
  const m = rawType.match(WRAPPER_PATTERN);
  const wrapper = m?.[1];
  const inner = m?.[2] ?? rawType;

  let innerDisplay: string;
  if (field.dtoSpecRef) {
    const target = allNotes.find((n) => n.id === field.dtoSpecRef && n.type === 'Dto');
    if (target) {
      const refName = (target.label.split('\n')[0] ?? '').trim();
      innerDisplay = refName || '(Unnamed DTO)';
    } else {
      innerDisplay = inner.trim() ? `${inner} (?)` : '(missing DTO)';
    }
  } else {
    innerDisplay = inner.trim() || '?';
  }

  return wrapper ? `${wrapper}[${innerDisplay}]` : innerDisplay;
}
