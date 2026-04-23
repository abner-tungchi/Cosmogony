import type { Board } from '../types/board';
import type { Link, Property, Remodel, StickyNote } from '../types/elements';
import type {
  AggregateEventRef,
  AggregateMethodRef,
  AggregateSpec,
  DtoSpec,
  ReadModelSpec,
  SpecBundle,
  SpecLink,
  SpecLinkTargetType,
  SpecProperty,
  UseCaseSpec,
} from '../types/bundle';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert a human label to camelCase, stripping non-word characters.
 * Empty / whitespace-only labels collapse to ''.
 *
 *   "Order"             → "order"
 *   "OrderLine"         → "orderLine"
 *   "Order Line Item"   → "orderLineItem"
 *   "cancel order"      → "cancelOrder"
 */
const camelCase = (raw: string): string => {
  if (!raw) return '';
  const parts = raw
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return '';
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
};

/** Take the first non-empty line of a multi-line label, trimmed. */
const firstLine = (label: string | undefined): string => {
  if (!label) return '';
  const line = label.split('\n').find((l) => l.trim().length > 0);
  return (line ?? '').trim();
};

/** Board-level Property → Bundle SpecProperty (renames `attrName` to `name`). */
const toSpecProperty = (p: Property): SpecProperty => {
  const out: SpecProperty = {
    name: p.attrName,
    type: p.type,
  };
  return out;
};

const toSpecProperties = (props: Property[] | undefined): SpecProperty[] =>
  (props ?? []).map(toSpecProperty);

/**
 * Strip `undefined` / empty-array/empty-object/empty-string values so that
 * optional spec fields simply disappear from the emitted JSON (per task spec:
 * "空欄位策略：若某個可選欄位沒值，直接不放進 JSON").
 *
 * Top-level bundle arrays (`aggregates`, `useCases`, …) must stay even when
 * empty — callers pass `keepKeys` to protect them.
 *
 * Declared on `object` (rather than `Record<string, unknown>`) so that callers
 * can pass interface-typed objects directly without TS complaining about the
 * missing index signature.
 */
const pruneEmpty = <T extends object>(obj: T, keepKeys: ReadonlyArray<keyof T> = []): T => {
  const result: Record<string, unknown> = {};
  const entries = Object.entries(obj) as Array<[string, unknown]>;
  for (const [key, value] of entries) {
    const keep = (keepKeys as readonly string[]).includes(key);
    if (keep) {
      result[key] = value;
      continue;
    }
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0
    ) {
      continue;
    }
    result[key] = value;
  }
  return result as T;
};

/** Resolve what kind of thing a Board link endpoint points at, for targetType. */
const resolveLinkTarget = (
  endpointId: string,
  endpointKind: 'note' | 'remodel',
  notesById: Map<string, StickyNote>,
  remodelsById: Map<string, Remodel>,
): { targetType: SpecLinkTargetType; targetName: string } | null => {
  if (endpointKind === 'remodel') {
    const r = remodelsById.get(endpointId);
    if (!r) return null;
    return {
      targetType: 'ReadModel',
      targetName:
        firstLine(r.queryNote.content) ||
        firstLine(r.queryNote.label) ||
        firstLine(r.aggregateNote.label) ||
        '(unnamed ReadModel)',
    };
  }
  const note = notesById.get(endpointId);
  if (!note) return null;
  // Board ElementType maps 1:1 to SpecLinkTargetType.
  return {
    targetType: note.type as SpecLinkTargetType,
    targetName: firstLine(note.label) || note.label,
  };
};

/**
 * Build SpecLink[] for a single spec owner (note or remodel). Filters Board.links
 * to ones that touch `ownerId`; computes `direction` from `fromId === ownerId`.
 */
const buildSpecLinks = (
  ownerId: string,
  links: Link[],
  notesById: Map<string, StickyNote>,
  remodelsById: Map<string, Remodel>,
): SpecLink[] => {
  const result: SpecLink[] = [];
  for (const link of links) {
    if (link.fromId !== ownerId && link.toId !== ownerId) continue;
    const isOutbound = link.fromId === ownerId;
    const otherId = isOutbound ? link.toId : link.fromId;
    const otherKind = isOutbound ? link.toType : link.fromType;
    const resolved = resolveLinkTarget(otherId, otherKind, notesById, remodelsById);
    if (!resolved) continue;
    const specLink: SpecLink = {
      direction: isOutbound ? 'outbound' : 'inbound',
      targetType: resolved.targetType,
      targetName: resolved.targetName,
      targetSpecId: otherId,
    };
    if (link.label) specLink.label = link.label;
    result.push(specLink);
  }
  return result;
};

// =============================================================================
// Aggregate
// =============================================================================

export const buildAggregateSpec = (
  aggregateNote: StickyNote,
  domainEvents: StickyNote[],
  notesById: Map<string, StickyNote>,
  remodelsById: Map<string, Remodel>,
  links: Link[],
): AggregateSpec => {
  const label = firstLine(aggregateNote.label) || aggregateNote.label;

  // identity — prefer authored `aggregateIdentity`, else derive from label.
  const identity = aggregateNote.aggregateIdentity ?? {
    name: label ? `${camelCase(label)}Id` : '',
    _suggested_type: label ? `${label}Id` : undefined,
    _suggested_field: label ? `${camelCase(label)}Id` : undefined,
  };

  const state = toSpecProperties(aggregateNote.stateProperties);

  // methods — one per DomainEvent whose entityId points at this Aggregate note.
  const methods: AggregateMethodRef[] = [];
  const events: AggregateEventRef[] = [];
  for (const ev of domainEvents) {
    if (ev.entityId !== aggregateNote.id) continue;
    const commandLabel = ev.commandId
      ? firstLine(notesById.get(ev.commandId)?.label ?? '') || ''
      : '';
    const eventLabel = firstLine(ev.label) || ev.label;
    methods.push({
      useCaseSpecId: ev.id,
      useCase: commandLabel,
      emitsEvent: eventLabel,
      _suggested_method: commandLabel && label ? `${label}.${commandLabel}` : undefined,
    });
    events.push({
      name: eventLabel,
      emittedByUseCaseSpecId: ev.id,
    });
  }

  const relationships = buildSpecLinks(aggregateNote.id, links, notesById, remodelsById);

  const spec: AggregateSpec = {
    kind: 'AggregateSpec',
    aggregateSpecId: aggregateNote.id,
    aggregate: label,
    behavior: aggregateNote.notes,
    identity,
    state,
    invariants: aggregateNote.invariants,
    methods: methods.map((m) => pruneEmpty(m)),
    relationships,
    events,
    _suggested_aggregateId: label ? `${label}Id` : undefined,
    _suggested_repository: label ? `${label}Repository` : undefined,
  };

  // Preserve required bundle arrays even when empty, per design contract.
  return pruneEmpty(spec, ['state', 'methods', 'events']);
};

// =============================================================================
// UseCase
// =============================================================================

export const buildUseCaseSpec = (
  domainEvent: StickyNote,
  notesById: Map<string, StickyNote>,
  remodelsById: Map<string, Remodel>,
  links: Link[],
  flowPathsById: Map<string, { name: string }>,
): UseCaseSpec => {
  const commandNote = domainEvent.commandId ? notesById.get(domainEvent.commandId) : undefined;
  if (!commandNote) {
    console.warn(
      `[jsonExporter] DomainEvent "${domainEvent.label}" (${domainEvent.id}) has no linked Command; emitting partial UseCaseSpec.`,
    );
  }
  const commandLabel = commandNote ? firstLine(commandNote.label) : '';

  const aggregateNote = domainEvent.entityId ? notesById.get(domainEvent.entityId) : undefined;
  const aggregateLabel = aggregateNote ? firstLine(aggregateNote.label) : '';

  const input = toSpecProperties(commandNote?.information);
  const eventPayload = toSpecProperties(domainEvent.eventProperties);
  const eventLabel = firstLine(domainEvent.label) || domainEvent.label;

  const paths = (domainEvent.paths ?? [])
    .map((id) => flowPathsById.get(id)?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  const specLinks = buildSpecLinks(domainEvent.id, links, notesById, remodelsById);

  const spec: UseCaseSpec = {
    kind: 'UseCaseSpec',
    useCaseSpecId: domainEvent.id,
    aggregateSpecId: aggregateNote?.id,
    useCase: commandLabel,
    behavior: domainEvent.behavior,
    aggregate: aggregateLabel,
    paths,
    input,
    emittedEvent: eventLabel,
    eventPayload,
    links: specLinks,
    _suggested_aggregateId: aggregateLabel ? `${aggregateLabel}Id` : undefined,
    _suggested_method:
      aggregateLabel && commandLabel ? `${aggregateLabel}.${commandLabel}` : undefined,
    _suggested_domainEvent: aggregateLabel
      ? `${aggregateLabel}Events.${eventLabel}`
      : eventLabel || undefined,
    _suggested_repository: aggregateLabel ? `${aggregateLabel}Repository` : undefined,
  };

  return pruneEmpty(spec, ['input', 'eventPayload']);
};

// =============================================================================
// ReadModel
// =============================================================================

export const buildReadModelSpec = (
  remodel: Remodel,
  notesById: Map<string, StickyNote>,
  remodelsById: Map<string, Remodel>,
  links: Link[],
): ReadModelSpec => {
  const queryName =
    firstLine(remodel.queryNote.content) ||
    firstLine(remodel.queryNote.label) ||
    '';

  const parameters = toSpecProperties(remodel.parameters);
  const returnType = remodel.returnType ?? { shape: 'object', fields: [] };

  // Links: Board.links touching this remodel + derived semantic links for
  // linkedActorId / linkedBundleIds / linkedDtoIds (those aren't stored in
  // Board.links but they are first-class ReadModel relationships).
  const boardLinks = buildSpecLinks(remodel.id, links, notesById, remodelsById);

  const derivedLinks: SpecLink[] = [];
  const pushDerivedFor = (targetNoteId: string) => {
    const note = notesById.get(targetNoteId);
    if (!note) return;
    derivedLinks.push({
      direction: 'outbound',
      targetType: note.type as SpecLinkTargetType,
      targetName: firstLine(note.label) || note.label,
      targetSpecId: note.id,
    });
  };

  if (remodel.linkedActorId) pushDerivedFor(remodel.linkedActorId);
  for (const id of remodel.linkedBundleIds ?? []) pushDerivedFor(id);
  for (const id of remodel.linkedDtoIds ?? []) pushDerivedFor(id);

  // Deduplicate by (targetSpecId, direction) in case a board link duplicates a
  // derived one.
  const seen = new Set<string>();
  const allLinks = [...boardLinks, ...derivedLinks].filter((l) => {
    const key = `${l.direction}::${l.targetSpecId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const spec: ReadModelSpec = {
    kind: 'ReadModelSpec',
    readModelSpecId: remodel.id,
    queryName,
    behavior: remodel.behavior,
    parameters,
    returnType,
    links: allLinks,
    _suggested_queryFunction: queryName ? `${queryName}.query` : undefined,
  };

  return pruneEmpty(spec, ['parameters', 'returnType']);
  // Note: `remodelsById` is accepted for symmetry / future use even though the
  // current impl doesn't need it (a remodel isn't the source of links pointing
  // to another remodel in the current data model, but this keeps the helper
  // robust if that ever changes).
};

// =============================================================================
// Dto
// =============================================================================

export const buildDtoSpec = (dtoNote: StickyNote): DtoSpec => {
  // Legacy Dto notes encoded fields inline in `label` (first line = name,
  // subsequent lines = `field: Type`). Current model moves fields into
  // `dtoFields[]` but the first line of `label` is still the DTO name.
  const name = firstLine(dtoNote.label) || '(Unnamed DTO)';

  const spec: DtoSpec = {
    kind: 'DtoSpec',
    dtoSpecId: dtoNote.id,
    name,
    description: dtoNote.notes,
    fields: dtoNote.dtoFields ?? [],
  };

  return pruneEmpty(spec, ['fields']);
};

// =============================================================================
// Bundle
// =============================================================================

/**
 * Export a Board as a complete Spec Bundle.
 *
 * Per `docs/spec-design.md`:
 *   - Top-level arrays (`aggregates`, `useCases`, `readModels`, `dtos`) are
 *     always present — even when empty.
 *   - Optional per-spec fields are omitted when they have no value.
 *   - T1 Export is pure: no AI inference, no writes to the store.
 */
export const exportBoardAsBundle = (board: Board): SpecBundle => {
  const notesById = new Map(board.notes.map((n) => [n.id, n] as const));
  const remodelsById = new Map(board.remodels.map((r) => [r.id, r] as const));
  const flowPathsById = new Map(board.flowPaths.map((fp) => [fp.id, fp] as const));

  const aggregateNotes = board.notes.filter((n) => n.type === 'Aggregate');
  const domainEvents = board.notes.filter((n) => n.type === 'DomainEvent');
  const dtoNotes = board.notes.filter((n) => n.type === 'Dto');

  const aggregates = aggregateNotes.map((n) =>
    buildAggregateSpec(n, domainEvents, notesById, remodelsById, board.links),
  );
  const useCases = domainEvents.map((ev) =>
    buildUseCaseSpec(ev, notesById, remodelsById, board.links, flowPathsById),
  );
  const readModels = board.remodels.map((r) =>
    buildReadModelSpec(r, notesById, remodelsById, board.links),
  );
  const dtos = dtoNotes.map(buildDtoSpec);

  return {
    manifestVersion: 1,
    bundleId: board.id,
    context: board.name,
    aggregates,
    useCases,
    readModels,
    dtos,
  };
};

// =============================================================================
// Legacy — kept only for callers still on the UseCaseExport shape.
// =============================================================================

interface UseCaseInputProperty {
  name: string;
  type: string;
  note: string;
}

interface UseCaseLink {
  type: string;
  name: string;
}

export interface UseCaseExport {
  useCase: string;
  behavior: string;
  input: UseCaseInputProperty[];
  aggregate: string;
  aggregateId: string;
  method: string;
  domainEvent: string;
  repository: string;
  links: UseCaseLink[];
  paths: string[];
}

/**
 * @deprecated Use {@link exportBoardAsBundle} instead. This legacy UseCase-only
 * exporter is retained for backward compatibility and will be removed once all
 * callers migrate to the Spec Bundle format.
 */
export const exportBoardToJson = (board: Board): UseCaseExport[] => {
  const domainEvents = board.notes.filter((n) => n.type === 'DomainEvent');
  const notesById = new Map<string, StickyNote>(board.notes.map((n) => [n.id, n]));
  const flowPathsById = new Map(board.flowPaths.map((fp) => [fp.id, fp]));

  return domainEvents.map((event) => {
    const commandNote = event.commandId ? notesById.get(event.commandId) : undefined;
    const commandLabel = commandNote?.label ?? '';

    const input: UseCaseInputProperty[] = (commandNote?.information ?? []).map((prop) => ({
      name: prop.attrName,
      type: prop.type,
      note: '',
    }));

    const entityOrAggregateNote = event.entityId ? notesById.get(event.entityId) : undefined;
    const aggregateLabel = entityOrAggregateNote?.label ?? '';

    const relatedLinks: UseCaseLink[] = board.links
      .filter((link) => link.fromId === event.id || link.toId === event.id)
      .map((link) => {
        const otherId = link.fromId === event.id ? link.toId : link.fromId;
        const otherNote = notesById.get(otherId);
        if (otherNote) {
          return { type: otherNote.type, name: otherNote.label };
        }
        const otherRemodel = board.remodels.find((r) => r.id === otherId);
        if (otherRemodel) {
          return {
            type: 'ReadModel',
            name: otherRemodel.queryNote.label || otherRemodel.aggregateNote.label,
          };
        }
        return null;
      })
      .filter((l): l is UseCaseLink => l !== null);

    const paths = (event.paths ?? [])
      .map((pathId) => flowPathsById.get(pathId)?.name)
      .filter((name): name is string => name !== undefined);

    return {
      useCase: commandLabel,
      behavior: event.behavior ?? '',
      input,
      aggregate: aggregateLabel,
      aggregateId: aggregateLabel ? `${aggregateLabel}Id` : '',
      method: aggregateLabel && commandLabel ? `${aggregateLabel}.${commandLabel}` : '',
      domainEvent: aggregateLabel ? `${aggregateLabel}Events.${event.label}` : event.label,
      repository: aggregateLabel ? `${aggregateLabel}Repository` : '',
      links: relatedLinks,
      paths,
    };
  });
};
