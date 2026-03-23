import type { Remodel } from '../types/elements';

/**
 * Post-migration, Remodel.linkedBundleIds now stores linked note IDs.
 * isUniverseRemodel is kept for backward compatibility but always returns false
 * since Bundles no longer exist. The concept of "universe" was based on multiple
 * distinct Aggregate Roots across linked Bundles.
 */
export function isUniverseRemodel(_remodel: Remodel): boolean {
  return false;
}
