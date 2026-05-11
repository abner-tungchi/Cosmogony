import type { BoardSnapshot } from './types.js';

/**
 * Render a client-built BoardSnapshot to markdown for LLM injection.
 * Server does NOT recompute snapshot — fully trusts client (P1).
 */
export function snapshotToMarkdown(s: BoardSnapshot): string {
  const out: string[] = [];
  out.push(`# Bounded Context: ${s.activeBoardName}`);

  if (s.aggregates.length > 0) {
    out.push('\n## Aggregates');
    for (const a of s.aggregates) {
      out.push(`- ${a.name}${a.identityName ? ` (identity: ${a.identityName})` : ''}`);
      if (a.stateProperties.length > 0) {
        const props = a.stateProperties.map((p) => `${p.attrName}: ${p.type}`).join(', ');
        out.push(`  - state: ${props}`);
      }
      const inv = a.invariantCounts;
      const invSummary = `${inv.confirmed} confirmed, ${inv.needs_review} needs_review, ${inv.rejected} rejected`;
      out.push(`  - invariants: ${invSummary}`);
    }
  }

  if (s.domainEvents.length > 0) {
    out.push('\n## Domain Events');
    for (const e of s.domainEvents) {
      const links: string[] = [];
      if (e.linkedCommandName) links.push(`triggered by Command "${e.linkedCommandName}"`);
      if (e.linkedAggregateName) links.push(`on Aggregate "${e.linkedAggregateName}"`);
      out.push(`- ${e.name}${links.length > 0 ? ` (${links.join(', ')})` : ''}`);
    }
  }

  if (s.commands.length > 0) {
    out.push('\n## Commands');
    for (const c of s.commands) {
      out.push(`- ${c.name}${c.linkedEventName ? ` → ${c.linkedEventName}` : ''}`);
    }
  }

  if (s.policies.length > 0) {
    out.push('\n## Policies');
    for (const p of s.policies) {
      const issues = p.issueNames.length > 0 ? ` → issues: ${p.issueNames.join(', ')}` : '';
      out.push(`- ${p.label}${p.triggerName ? ` (on ${p.triggerName})` : ''}${issues}`);
    }
  }

  if (s.readModelsCount > 0 || s.dtosCount > 0) {
    out.push('\n## Read Side');
    if (s.readModelsCount > 0) out.push(`- ReadModels/Remodels: ${s.readModelsCount}`);
    if (s.dtosCount > 0) out.push(`- DTOs: ${s.dtosCount}`);
  }

  if (s.hotspots.length > 0) {
    out.push('\n## Hotspots');
    for (const h of s.hotspots) out.push(`- ${h}`);
  }

  if (s.adjacentContexts.length > 0) {
    out.push('\n## Adjacent Contexts');
    for (const ctx of s.adjacentContexts) {
      const parts: string[] = [];
      if (ctx.aggregateNames.length > 0) parts.push(`Aggregates: ${ctx.aggregateNames.slice(0, 5).join(', ')}`);
      if (ctx.sharedDomainEvents.length > 0) parts.push(`shared events: ${ctx.sharedDomainEvents.join(', ')}`);
      if (ctx.sharedPolicies.length > 0) parts.push(`shared policies: ${ctx.sharedPolicies.join(', ')}`);
      if (ctx.sharedExternalSystems.length > 0) parts.push(`shared externals: ${ctx.sharedExternalSystems.join(', ')}`);
      out.push(`- ${ctx.boardName}${parts.length > 0 ? ` — ${parts.join('; ')}` : ''}`);
    }
  }

  if (s.driftSignals.length > 0) {
    out.push('\n## Drift Signals (heuristic pre-flag)');
    for (const d of s.driftSignals) {
      out.push(`- [${d.kind}] ${d.detail}`);
    }
  }

  // Source of truth：完整 active board JSON。Coach 需要精確欄位值（invariant
  // rules / eventProperties / dtoFields / note.notes / behavior 等）時看這裡。
  if (s.rawActiveBoard) {
    out.push('\n## Raw Active Board JSON (source of truth)');
    out.push('Use this when you need exact field values that the summary above abstracts away.');
    out.push('```json');
    out.push(JSON.stringify(s.rawActiveBoard, null, 2));
    out.push('```');
  }

  return out.join('\n');
}
