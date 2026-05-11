import type { Project, Board } from '../types/board';
import type { StickyNote } from '../types/elements';
import type { DriftSignal } from '../types/coach';

// Raw board JSON shape sent to Coach. 等同 Board interface — 重新 alias 為了
// 讓「raw 是給 Coach 用、未來可能 strip 噪音」這件事有獨立鉤子。
export type RawCoachBoard = Board;

export interface AggregateSummary {
  id: string;
  name: string;
  identityName?: string;
  stateProperties: Array<{ attrName: string; type: string }>;
  invariantCounts: { confirmed: number; needs_review: number; rejected: number };
}

export interface EventSummary {
  id: string;
  name: string;
  linkedAggregateName?: string;
  linkedCommandName?: string;
}

export interface CommandSummary {
  id: string;
  name: string;
  linkedEventName?: string;
}

export interface PolicySummary {
  id: string;
  label: string;
  triggerName?: string;
  issueNames: string[];
}

export interface AdjacentContextRef {
  boardId: string;
  boardName: string;
  aggregateNames: string[];
  sharedDomainEvents: string[];
  sharedPolicies: string[];
  sharedExternalSystems: string[];
}

export interface BoardSnapshot {
  activeBoardId: string;
  activeBoardName: string;
  aggregates: AggregateSummary[];
  domainEvents: EventSummary[];
  commands: CommandSummary[];
  policies: PolicySummary[];
  readModelsCount: number;
  dtosCount: number;
  hotspots: string[];
  adjacentContexts: AdjacentContextRef[];
  driftSignals: DriftSignal[];
  /**
   * 完整 active board JSON（含 notes / links / flowPaths / remodels）。
   * Coach 看 summary 取得 high-level 結構，需要精確欄位值（invariant rules、
   * eventProperties、dtoFields、note.notes 等）時改讀 raw。
   * 雙來源並存，summary 是 narrative、raw 是 source of truth。
   */
  rawActiveBoard: RawCoachBoard | null;
  hash: string;
}

function firstLine(s: string): string {
  return (s ?? '').split('\n')[0]?.trim() ?? '';
}

function nameOf(n: StickyNote): string {
  return firstLine(n.label) || '(unnamed)';
}

function summarizeAggregate(note: StickyNote): AggregateSummary {
  const counts = { confirmed: 0, needs_review: 0, rejected: 0 };
  for (const inv of note.invariants ?? []) counts[inv.status]++;
  return {
    id: note.id,
    name: nameOf(note),
    identityName: note.aggregateIdentity?.name,
    stateProperties: (note.stateProperties ?? []).map((p) => ({ attrName: p.attrName, type: p.type })),
    invariantCounts: counts,
  };
}

function summarizeEvent(note: StickyNote, boardNotes: StickyNote[]): EventSummary {
  const aggregate = note.entityId ? boardNotes.find((n) => n.id === note.entityId) : undefined;
  const command = note.commandId ? boardNotes.find((n) => n.id === note.commandId) : undefined;
  return {
    id: note.id,
    name: nameOf(note),
    linkedAggregateName: aggregate ? nameOf(aggregate) : undefined,
    linkedCommandName: command ? nameOf(command) : undefined,
  };
}

function summarizeCommand(note: StickyNote, boardNotes: StickyNote[]): CommandSummary {
  const evt = boardNotes.find((n) => n.commandId === note.id);
  return {
    id: note.id,
    name: nameOf(note),
    linkedEventName: evt ? nameOf(evt) : undefined,
  };
}

function summarizePolicy(note: StickyNote): PolicySummary {
  return {
    id: note.id,
    label: nameOf(note),
    triggerName: note.policyTrigger?.name,
    issueNames: (note.policyIssues ?? []).map((i) => i.name),
  };
}

function buildAdjacent(activeBoard: Board, otherBoards: Board[]): AdjacentContextRef[] {
  const activeEventNames = new Set(
    activeBoard.notes.filter((n) => n.type === 'DomainEvent').map((n) => nameOf(n)),
  );
  const activeBoardLabels = activeBoard.notes
    .filter((n) => n.type === 'Policy' || n.type === 'Hotspot')
    .map((n) => firstLine(n.label));
  const activeExternals = new Set(
    activeBoard.notes.filter((n) => n.type === 'ExternalSystem').map((n) => nameOf(n)),
  );

  return otherBoards.map((b) => {
    const aggregateNames = b.notes.filter((n) => n.type === 'Aggregate').map(nameOf);
    const sharedEvents = b.notes
      .filter((n) => n.type === 'DomainEvent' && activeEventNames.has(nameOf(n)))
      .map(nameOf);
    const sharedPolicies = activeBoardLabels.filter((label) =>
      label.toLowerCase().includes(b.name.toLowerCase()),
    );
    const sharedExternals = b.notes
      .filter((n) => n.type === 'ExternalSystem' && activeExternals.has(nameOf(n)))
      .map(nameOf);
    return {
      boardId: b.id,
      boardName: b.name,
      aggregateNames,
      sharedDomainEvents: sharedEvents,
      sharedPolicies,
      sharedExternalSystems: sharedExternals,
    };
  });
}

function detectDriftSignals(board: Board): DriftSignal[] {
  const signals: DriftSignal[] = [];
  const notes = board.notes;
  const events = notes.filter((n) => n.type === 'DomainEvent');
  const dtos = notes.filter((n) => n.type === 'Dto');
  const readModels = notes.filter((n) => n.type === 'ReadModel');
  const remodels = board.remodels ?? [];
  const aggregates = notes.filter((n) => n.type === 'Aggregate');
  const policies = notes.filter((n) => n.type === 'Policy');

  // 1. high_dto_ratio
  if (dtos.length > Math.max(events.length, 1) && dtos.length >= 3) {
    signals.push({
      kind: 'high_dto_ratio',
      detail: `${dtos.length} DTOs vs ${events.length} DomainEvents`,
    });
  }

  // 2. aggregate_no_invariants
  for (const agg of aggregates) {
    if ((agg.stateProperties?.length ?? 0) > 0 && (agg.invariants?.length ?? 0) === 0) {
      signals.push({
        kind: 'aggregate_no_invariants',
        detail: `Aggregate "${nameOf(agg)}" has ${agg.stateProperties!.length} state fields but no invariants`,
      });
    }
  }

  // 3. crud_event_naming
  if (events.length >= 3) {
    const crud = events.filter((e) => /(?:Created|Updated|Deleted)$/.test(nameOf(e))).length;
    if (crud / events.length > 0.5) {
      signals.push({
        kind: 'crud_event_naming',
        detail: `${crud}/${events.length} events use Created/Updated/Deleted suffix (CRUD-flavored naming)`,
      });
    }
  }

  // 4. policy_missing_trigger
  for (const p of policies) {
    if (!p.policyTrigger) {
      signals.push({
        kind: 'policy_missing_trigger',
        detail: `Policy "${nameOf(p)}" has no triggering DomainEvent`,
      });
    }
  }

  // 5. oop_terminology
  // 注意：用前置 \b 在 CamelCase 拼接字（如 "OrderRepository"）會失效 —
  // 因為 'r' 與 'R' 之間無 word boundary。改用後置 \b 配對結尾，前面允許大小寫接續。
  const oopRegex = /(Repository|Service|Controller|Manager|Helper)\b/;
  const oopHits = notes.filter((n) => oopRegex.test(n.label)).map(nameOf);
  if (oopHits.length > 0) {
    signals.push({
      kind: 'oop_terminology',
      detail: `OOP-flavored names found: ${oopHits.slice(0, 3).join(', ')}${oopHits.length > 3 ? '...' : ''}`,
    });
  }

  // 6. high_readmodel_ratio
  const totalRead = readModels.length + remodels.length;
  if (totalRead > Math.max(events.length, 1) && totalRead >= 3) {
    signals.push({
      kind: 'high_readmodel_ratio',
      detail: `${totalRead} ReadModels/Remodels vs ${events.length} DomainEvents`,
    });
  }

  return signals;
}

export function buildBoardSnapshot(project: Project, activeBoardId: string): BoardSnapshot {
  const activeBoard = project.boards.find((b) => b.id === activeBoardId);
  if (!activeBoard) {
    const empty: Omit<BoardSnapshot, 'hash'> = {
      activeBoardId,
      activeBoardName: '(unknown)',
      aggregates: [],
      domainEvents: [],
      commands: [],
      policies: [],
      readModelsCount: 0,
      dtosCount: 0,
      hotspots: [],
      adjacentContexts: [],
      driftSignals: [],
      rawActiveBoard: null,
    };
    return { ...empty, hash: computeSnapshotHash(empty) };
  }

  const notes = activeBoard.notes;
  const aggregates = notes.filter((n) => n.type === 'Aggregate').map(summarizeAggregate);
  const domainEvents = notes
    .filter((n) => n.type === 'DomainEvent')
    .map((n) => summarizeEvent(n, notes));
  const commands = notes
    .filter((n) => n.type === 'Command')
    .map((n) => summarizeCommand(n, notes));
  const policies = notes.filter((n) => n.type === 'Policy').map(summarizePolicy);
  const readModelsCount = notes.filter((n) => n.type === 'ReadModel').length + (activeBoard.remodels?.length ?? 0);
  const dtosCount = notes.filter((n) => n.type === 'Dto').length;
  const hotspots = notes.filter((n) => n.type === 'Hotspot').map((n) => firstLine(n.label));

  const otherBoards = project.boards.filter((b) => b.id !== activeBoardId);
  const adjacentContexts = buildAdjacent(activeBoard, otherBoards);
  const driftSignals = detectDriftSignals(activeBoard);

  const partial: Omit<BoardSnapshot, 'hash'> = {
    activeBoardId,
    activeBoardName: activeBoard.name,
    aggregates,
    domainEvents,
    commands,
    policies,
    readModelsCount,
    dtosCount,
    hotspots,
    adjacentContexts,
    driftSignals,
    rawActiveBoard: activeBoard,
  };

  return { ...partial, hash: computeSnapshotHash(partial) };
}

/**
 * Simplified sync hash (FNV-1a 32-bit, then combined with length).
 * Collision risk is acceptable — only used for "unchanged from #hash" detection.
 */
export function computeSnapshotHash(snapshot: Omit<BoardSnapshot, 'hash'>): string {
  const json = JSON.stringify(snapshot);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const lenSuffix = (json.length >>> 0).toString(16).padStart(8, '0');
  return h.toString(16).padStart(8, '0') + lenSuffix;
}
