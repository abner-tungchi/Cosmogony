/**
 * Build-time feature flags.
 *
 * Vite reads `VITE_*` env vars at build time and inlines them via
 * `import.meta.env`. To override defaults at build time, set the env var
 * before `npm run build` (locally) or pass as a Docker build arg.
 *
 * Examples:
 *   VITE_ENABLE_COACH=false npm run build
 *   docker compose build --build-arg VITE_ENABLE_COACH=false frontend
 *
 * Defaults are chosen so a stock build keeps current behavior.
 */

function readBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  return fallback;
}

/**
 * Whether the AI Coach UI is rendered (CoachPanel + Coach tab).
 * When false, RightColumn renders only DetailPanel.
 * Default: true (preserve current dogfood behavior).
 */
export const COACH_ENABLED: boolean = readBool(
  import.meta.env.VITE_ENABLE_COACH,
  true,
);
