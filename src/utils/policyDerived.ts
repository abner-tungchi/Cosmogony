import type { StickyNote } from '../types/elements';

/**
 * Resolve a Policy `name` + optional `noteRef` pair against the board's notes.
 *
 * - `noteRef` resolved → DTO/Event/Command/Aggregate label first-line trim wins
 * - `noteRef` set but stale (note deleted or wrong type) → return `name` (or
 *   '(deleted)' when name is empty) and isStale=true
 * - `noteRef` unset → return `name` (or '?' when empty), isStale=false
 *
 * Used by PolicyPanel display, canvas Policy note derived content, and any
 * future export — single source of truth for resolution.
 */
export function resolveNoteRefDisplay(
  name: string,
  noteRef: string | undefined,
  allNotes: StickyNote[],
  expectedType: 'DomainEvent' | 'Command' | 'Aggregate',
): { display: string; isStale: boolean } {
  if (noteRef) {
    const target = allNotes.find((n) => n.id === noteRef && n.type === expectedType);
    if (target) {
      const label = (target.label.split('\n')[0] ?? '').trim();
      return { display: label || name || '(Unnamed)', isStale: false };
    }
    return { display: name || '(deleted)', isStale: true };
  }
  return { display: name || '?', isStale: false };
}

/**
 * Build a one-line summary for a Policy note's trigger.
 * Format: "◇ on <triggerName>" — '' when no trigger set.
 */
export function derivePolicyTriggerLine(note: StickyNote, allNotes: StickyNote[]): string {
  if (!note.policyTrigger) return '';
  const { name, noteRef } = note.policyTrigger;
  const { display } = resolveNoteRefDisplay(name, noteRef, allNotes, 'DomainEvent');
  return `◇ on ${display}`;
}

/**
 * Build a one-line summary for a Policy note's issues.
 * Truncates after 2 names with "(+N more)" suffix to keep the canvas card compact.
 */
export function derivePolicyIssuesLine(note: StickyNote, allNotes: StickyNote[]): string {
  const issues = note.policyIssues ?? [];
  if (issues.length === 0) return '';
  const names = issues.slice(0, 2).map((iss) => {
    const { display } = resolveNoteRefDisplay(iss.name, iss.noteRef, allNotes, 'Command');
    return display;
  });
  if (issues.length === 1) return `→ ${names[0]}`;
  if (issues.length === 2) return `→ ${names.join(', ')}`;
  return `→ ${names.join(', ')} (+${issues.length - 2} more)`;
}

/**
 * Compose the full derived multi-line content for a Policy note.
 * Returns null when no trigger and no issues (caller falls back to label-only).
 */
export function derivePolicyContent(note: StickyNote, allNotes: StickyNote[]): string | null {
  const trigger = derivePolicyTriggerLine(note, allNotes);
  const issues = derivePolicyIssuesLine(note, allNotes);
  if (!trigger && !issues) return null;
  return [trigger, issues].filter(Boolean).join('\n');
}
