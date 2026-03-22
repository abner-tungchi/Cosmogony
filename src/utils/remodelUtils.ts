import type { Remodel, Bundle } from '../types/elements';

/**
 * Determines whether a Remodel is a "Universe" type.
 * Rule: if the linked Bundles involve > 1 distinct Aggregate Root
 *       (compared by bundle.infoNote.label, trimmed & lowercased), it is a Universe.
 *
 * Edge cases:
 * - linkedBundleIds is empty → false
 * - A linked Bundle ID has no matching Bundle (already deleted) → ignore that ID
 * - All linked Bundles have empty infoNote.label → treated as the same (false)
 */
export function isUniverseRemodel(remodel: Remodel, bundles: Bundle[]): boolean {
  const linkedBundles = bundles.filter((b) => remodel.linkedBundleIds.includes(b.id));
  const uniqueAggregates = new Set(
    linkedBundles
      .map((b) => b.infoNote.label.trim().toLowerCase())
      .filter((label) => label.length > 0)
  );
  return uniqueAggregates.size > 1;
}
