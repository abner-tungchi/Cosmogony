import type { Property } from '../types/elements';
import type { ReturnTypeSpec } from '../types/specs';

/**
 * Derive the textual content shown in the parameters sub-note on the canvas.
 *
 * Per the T-001 task (user confirmation #3): when `parameters` is empty,
 * do NOT fall back to the legacy `parameterNote.content`. Return null so the
 * caller can render an explicit empty-state placeholder.
 */
export function deriveParametersContent(parameters: Property[] | undefined): string | null {
  if (!parameters || parameters.length === 0) return null;
  return parameters
    .map((p) => `${p.attrName || '_'}: ${p.type || '?'}`)
    .join('\n');
}

/**
 * Derive the textual content shown in the returnType sub-note on the canvas.
 *
 * - `primitive`: shows the single type.
 * - `object` / `array`: joins fields as "name: type"; truncates to 3 rows with "..." suffix.
 *
 * Returns null when no structured data exists.
 */
export function deriveReturnTypeContent(returnType: ReturnTypeSpec | undefined): string | null {
  if (!returnType) return null;

  if (returnType.shape === 'primitive') {
    const f = returnType.fields[0];
    if (!f || !f.type) return null;
    return f.type;
  }

  if (!returnType.fields || returnType.fields.length === 0) return null;

  const lines = returnType.fields.map((f) => `${f.name || '_'}: ${f.type || '?'}`);
  if (lines.length > 3) {
    return lines.slice(0, 3).join('\n') + '\n...';
  }
  return lines.join('\n');
}
