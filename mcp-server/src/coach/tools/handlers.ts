// Pure tool handlers extracted from mcp-server/src/index.ts.
//
// Each handler receives (args, ctx) and returns { ok, resultJson, events }.
// The adapter (mcpAdapter.ts) is responsible for loadProjectFromRelay /
// saveProject / syncProjectToRelay / broadcast around each handler call.
//
// Spec A: zero-functional-change refactor of 38 MCP tools — see
// docs/tasks/2026-05-07-coach-agent-spec-a-handler-refactor.md.

import { v4 as uuidv4 } from 'uuid';

// ─── BE-local domain types (mirrors index.ts inline declarations) ──────────

export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot' | 'Diamond' | 'Dto'
  | 'Information' | 'Entity' | 'AggregateRoot';

export interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
  actorId?: string;
}

export interface Property {
  attrName: string;
  type: string;
  dtoSpecRef?: string;
}

export interface InvariantRule {
  when: string;
  rule: string;
}

export interface InvariantSource {
  agent: string;
  derivedFrom: string[];
  inferredAt: string;
  rationale: string;
}

export interface Invariant {
  id: string;
  name: string;
  title: string;
  applicability?: string;
  rules: InvariantRule[];
  errorCode: string;
  relatedState?: string[];
  provenance: 'ui' | 'assumption';
  status: 'confirmed' | 'needs_review' | 'rejected';
  source?: InvariantSource | null;
}

export interface AggregateIdentity {
  name: string;
  _suggested_type?: string;
  _suggested_field?: string;
}

export interface DtoField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;
}

export interface ReturnTypeField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;
}

export interface ReturnTypeSpec {
  shape: 'object' | 'array' | 'primitive';
  fields: ReturnTypeField[];
}

export interface PolicyTrigger {
  type: 'DomainEvent';
  name: string;
  noteRef?: string;
}

export interface PolicyIssue {
  type: 'Command';
  name: string;
  noteRef?: string;
  targetAggregate?: string;
  targetAggregateRef?: string;
}

/**
 * Command pre/post condition (Spec v17). Pre may reference an Aggregate
 * invariant via invariantId. _brokenInvariantLink is a soft-null marker
 * set by cascade when the referenced invariant is deleted.
 */
export interface CommandCondition {
  id: string;
  text: string;
  invariantId?: string;
  _brokenInvariantLink?: {
    previousId: string;
    deletedAt: string;
  };
}

export interface StickyNote {
  id: string;
  type: ElementType;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  behavior?: string;
  information?: Property[];
  eventProperties?: Property[];
  commandId?: string;
  entityId?: string;
  groupEventId?: string;
  informationForCommandId?: string;
  aggregateRootId?: string;
  isAggregateRoot?: boolean;
  linkedAggregateNoteId?: string;
  groupCollapsed?: boolean;
  aggregateIdentity?: AggregateIdentity;
  stateProperties?: Property[];
  invariants?: Invariant[];
  dtoFields?: DtoField[];
  policyTrigger?: PolicyTrigger;
  policyIssues?: PolicyIssue[];
  // --- Command-specific (Spec v17) ---
  preConditions?: CommandCondition[];
  postConditions?: CommandCondition[];
}

export interface BundleSubNote {
  label: string;
  content: string;
}

export interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'remodel';
  toType: 'note' | 'remodel';
  label?: string;
  createdAt: string;
}

export interface Remodel {
  id: string;
  position: { x: number; y: number };
  aggregateNote: BundleSubNote;
  parameterNote: BundleSubNote;
  queryNote: BundleSubNote;
  returnTypeNote: BundleSubNote;
  linkedBundleIds: string[];
  linkedDtoIds: string[];
  collapsed?: boolean;
  sourceEventsExpanded?: boolean;
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  linkedActorId?: string;
  createdAt: string;
  updatedAt: string;
  behavior?: string;
  parameters?: Property[];
  returnType?: ReturnTypeSpec;
}

export interface Board {
  id: string;
  name: string;
  parentContextId?: string;
  notes: StickyNote[];
  remodels: Remodel[];
  links: Link[];
  flowPaths: FlowPath[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  boards: Board[];
  activeBoardId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Handler type system ───────────────────────────────────────────────────

export interface ToolHandlerCtx {
  projectState: Project;
  now: () => string;
}

export type BroadcastPhase = 'pre-commit' | 'post-commit';

export interface BroadcastEvent {
  phase: BroadcastPhase;
  action: string;
  payload: unknown;
}

export type ToolErrorCode = 'NOT_FOUND' | 'INVALID_TYPE' | 'PRECONDITION_FAILED';

export interface ToolHandlerError {
  code: ToolErrorCode;
  message: string;
}

export interface ToolHandlerResult {
  ok: boolean;
  resultJson: unknown;
  events: BroadcastEvent[];
  error?: ToolHandlerError;
}

export type ToolHandler<Args> = (args: Args, ctx: ToolHandlerCtx) => ToolHandlerResult;

// ─── Internal helpers (re-declared from index.ts to avoid import cycle) ────

function getActiveBoard(p: Project): Board {
  return p.boards.find((b) => b.id === p.activeBoardId) ?? p.boards[0];
}

function nextEventX(board: Board): number {
  const eventNotes = board.notes.filter((n) => n.type === 'DomainEvent');
  if (eventNotes.length === 0) return 80;
  return Math.max(...eventNotes.map((n) => n.position.x)) + 400;
}

function nextRemodelX(board: Board): number {
  const allX = [
    ...board.notes.map((n) => n.position.x),
    ...board.remodels.map((r) => r.position.x),
  ];
  if (allX.length === 0) return 80;
  return Math.max(...allX) + 400;
}

function createBoard(name: string, now: string, parentContextId?: string): Board {
  return {
    id: uuidv4(),
    name,
    parentContextId,
    notes: [],
    remodels: [],
    links: [],
    flowPaths: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Handlers — Context (Board) management ─────────────────────────────────

export interface EsListContextsArgs {}

export const handle_es_list_contexts: ToolHandler<EsListContextsArgs> = (_args, ctx) => {
  const contexts = ctx.projectState.boards.map((b) => ({
    id: b.id,
    name: b.name,
    isActive: b.id === ctx.projectState.activeBoardId,
  }));
  return { ok: true, resultJson: contexts, events: [] };
};

export interface EsGetProjectArgs {}

export const handle_es_get_project: ToolHandler<EsGetProjectArgs> = (_args, ctx) => {
  const summary = {
    id: ctx.projectState.id,
    name: ctx.projectState.name,
    activeBoardId: ctx.projectState.activeBoardId,
    contexts: ctx.projectState.boards.map((b) => ({
      id: b.id,
      name: b.name,
      isActive: b.id === ctx.projectState.activeBoardId,
      noteCount: b.notes.length,
      domainEventCount: b.notes.filter((n) => n.type === 'DomainEvent').length,
      commandCount: b.notes.filter((n) => n.type === 'Command').length,
      entityCount: b.notes.filter((n) => n.type === 'Entity').length,
      aggregateRootCount: b.notes.filter((n) => n.type === 'AggregateRoot').length,
      informationCount: b.notes.filter((n) => n.type === 'Information').length,
      remodelCount: b.remodels.length,
      linkCount: b.links.length,
      flowPathCount: b.flowPaths.length,
      updatedAt: b.updatedAt,
    })),
  };
  return { ok: true, resultJson: summary, events: [] };
};

export interface EsCreateContextArgs {
  name: string;
}

export const handle_es_create_context: ToolHandler<EsCreateContextArgs> = ({ name }, ctx) => {
  const now = ctx.now();
  const newBoard = createBoard(name, now);
  ctx.projectState.boards.push(newBoard);
  ctx.projectState.activeBoardId = newBoard.id;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { id: newBoard.id },
    events: [{ phase: 'post-commit', action: 'add_board', payload: { id: newBoard.id, name } }],
  };
};

export interface EsSwitchContextArgs {
  id: string;
}

export const handle_es_switch_context: ToolHandler<EsSwitchContextArgs> = ({ id }, ctx) => {
  if (!ctx.projectState.boards.some((b) => b.id === id)) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Context ${id} not found.` },
    };
  }
  ctx.projectState.activeBoardId = id;
  ctx.projectState.updatedAt = ctx.now();
  return { ok: true, resultJson: `Switched to context ${id}.`, events: [] };
};

export interface EsRenameContextArgs {
  id: string;
  name: string;
}

export const handle_es_rename_context: ToolHandler<EsRenameContextArgs> = ({ id, name }, ctx) => {
  const board = ctx.projectState.boards.find((b) => b.id === id);
  if (!board) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Context ${id} not found.` },
    };
  }
  board.name = name;
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: `Context renamed to "${name}".`,
    events: [{ phase: 'post-commit', action: 'rename_board', payload: { id, name } }],
  };
};

export interface EsDeleteContextArgs {
  id: string;
}

export const handle_es_delete_context: ToolHandler<EsDeleteContextArgs> = ({ id }, ctx) => {
  if (ctx.projectState.boards.length <= 1) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: 'Cannot delete the last context.' },
    };
  }
  ctx.projectState.boards = ctx.projectState.boards.filter((b) => b.id !== id);
  if (ctx.projectState.activeBoardId === id) {
    ctx.projectState.activeBoardId = ctx.projectState.boards[0].id;
  }
  ctx.projectState.updatedAt = ctx.now();
  return {
    ok: true,
    resultJson: `Context ${id} deleted.`,
    events: [{ phase: 'post-commit', action: 'delete_board', payload: { id } }],
  };
};

// ─── Handlers — Board read/write ───────────────────────────────────────────

export interface EsGetBoardArgs {}

export const handle_es_get_board: ToolHandler<EsGetBoardArgs> = (_args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const notesWithComputed = board.notes.map((n) => {
    if (n.type === 'DomainEvent') {
      const commandNote = n.commandId ? board.notes.find((c) => c.id === n.commandId) : undefined;
      const entityNote = n.entityId ? board.notes.find((e) => e.id === n.entityId) : undefined;
      return {
        ...n,
        _commandLabel: commandNote?.label ?? null,
        _entityLabel: entityNote?.label ?? null,
      };
    }
    if (n.type === 'Entity' && n.aggregateRootId) {
      const aggRoot = board.notes.find((e) => e.id === n.aggregateRootId);
      return { ...n, _aggregateRootLabel: aggRoot?.label ?? null };
    }
    return n;
  });
  return { ok: true, resultJson: { ...board, notes: notesWithComputed }, events: [] };
};

export interface EsClearBoardArgs {}

export const handle_es_clear_board: ToolHandler<EsClearBoardArgs> = (_args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  board.notes = [];
  board.remodels = [];
  board.links = [];
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Active context cleared.',
    events: [{ phase: 'post-commit', action: 'clear_board', payload: {} }],
  };
};

export interface EsSetBoardNameArgs {
  name: string;
}

export const handle_es_set_board_name: ToolHandler<EsSetBoardNameArgs> = ({ name }, ctx) => {
  ctx.projectState.name = name;
  ctx.projectState.updatedAt = ctx.now();
  return {
    ok: true,
    resultJson: `Project name set to "${name}".`,
    events: [{ phase: 'post-commit', action: 'set_project_name', payload: { name } }],
  };
};

// ─── Handlers — Note CRUD ──────────────────────────────────────────────────

export interface EsAddNoteArgs {
  type: ElementType;
  label: string;
  x: number;
  y: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  behavior?: string;
}

export const handle_es_add_note: ToolHandler<EsAddNoteArgs> = (args, ctx) => {
  const now = ctx.now();
  const note: StickyNote = {
    id: uuidv4(),
    type: args.type,
    label: args.label,
    position: { x: args.x, y: args.y },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: args.paths ?? [],
    phase: args.phase,
    notes: args.notes,
    ...(args.type === 'DomainEvent' && args.behavior !== undefined ? { behavior: args.behavior } : {}),
    // audit HIGH-1: Command creation paths must initialize condition arrays
    ...(args.type === 'Command' ? { preConditions: [], postConditions: [] } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const board = getActiveBoard(ctx.projectState);
  board.notes.push(note);
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { id: note.id },
    events: [{ phase: 'post-commit', action: 'add_note', payload: note }],
  };
};

export interface EsUpdateNoteArgs {
  id: string;
  label?: string;
  x?: number;
  y?: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  behavior?: string;
  policyTrigger?: PolicyTrigger;
  policyIssues?: PolicyIssue[];
}

export const handle_es_update_note: ToolHandler<EsUpdateNoteArgs> = (args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === args.id);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${args.id} not found.` },
    };
  }
  if (args.label !== undefined) note.label = args.label;
  if (args.x !== undefined) note.position.x = args.x;
  if (args.y !== undefined) note.position.y = args.y;
  if (args.paths !== undefined) note.paths = args.paths;
  if (args.phase !== undefined) note.phase = args.phase;
  if (args.notes !== undefined) note.notes = args.notes;
  if (args.behavior !== undefined && note.type === 'DomainEvent') note.behavior = args.behavior;
  if (args.policyTrigger !== undefined && note.type === 'Policy') note.policyTrigger = args.policyTrigger;
  if (args.policyIssues !== undefined && note.type === 'Policy') note.policyIssues = args.policyIssues;
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Note updated.',
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: {
          id: args.id,
          label: args.label,
          x: args.x,
          y: args.y,
          paths: args.paths,
          phase: args.phase,
          notes: args.notes,
          behavior: args.behavior,
          policyTrigger: args.policyTrigger,
          policyIssues: args.policyIssues,
        },
      },
    ],
  };
};

export interface EsDeleteNoteArgs {
  id: string;
}

export const handle_es_delete_note: ToolHandler<EsDeleteNoteArgs> = ({ id }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  // PERMISSIVE: filter even if id not present, still emit event.
  board.notes = board.notes.filter((n) => n.id !== id);
  board.links = board.links.filter((l) => l.fromId !== id && l.toId !== id);
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Note deleted.',
    events: [{ phase: 'post-commit', action: 'delete_note', payload: { id } }],
  };
};

// ─── Handlers — DomainEvent-centric ────────────────────────────────────────

export interface EsAddCommandForEventArgs {
  eventNoteId: string;
  commandLabel: string;
  information?: Property[];
}

export const handle_es_add_command_for_event: ToolHandler<EsAddCommandForEventArgs> = (
  { eventNoteId, commandLabel, information },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const eventNote = board.notes.find((n) => n.id === eventNoteId);
  if (!eventNote) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `DomainEvent note ${eventNoteId} not found.` },
    };
  }
  if (eventNote.type !== 'DomainEvent') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${eventNoteId} is not a DomainEvent (type: ${eventNote.type}).`,
      },
    };
  }

  const now = ctx.now();
  const commandNoteId = uuidv4();
  const commandNote: StickyNote = {
    id: commandNoteId,
    type: 'Command',
    label: commandLabel,
    position: { x: eventNote.position.x - 176, y: eventNote.position.y },
    size: { width: 160, height: 80 },
    zIndex: eventNote.zIndex,
    paths: eventNote.paths ?? [],
    phase: eventNote.phase,
    information: information ?? [],
    preConditions: [],
    postConditions: [],
    groupEventId: eventNoteId,
    createdAt: now,
    updatedAt: now,
  };
  board.notes.push(commandNote);

  const events: BroadcastEvent[] = [];
  let infoNoteId: string | undefined;
  if ((information ?? []).length > 0) {
    infoNoteId = uuidv4();
    const infoNote: StickyNote = {
      id: infoNoteId,
      type: 'Information',
      label: commandLabel + ' Info',
      position: { x: commandNote.position.x - 176, y: commandNote.position.y },
      size: { width: 160, height: 80 },
      zIndex: eventNote.zIndex,
      paths: eventNote.paths ?? [],
      information: [...(information ?? [])],
      groupEventId: eventNoteId,
      informationForCommandId: commandNoteId,
      createdAt: now,
      updatedAt: now,
    };
    board.notes.push(infoNote);
    events.push({ phase: 'pre-commit', action: 'add_note', payload: infoNote });
  }

  eventNote.commandId = commandNoteId;
  eventNote.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  events.push({ phase: 'post-commit', action: 'add_note', payload: commandNote });
  events.push({
    phase: 'post-commit',
    action: 'update_note',
    payload: { id: eventNoteId, commandId: commandNoteId },
  });

  return {
    ok: true,
    resultJson: { commandId: commandNoteId, infoNoteId: infoNoteId ?? null },
    events,
  };
};

export interface EsUpdateCommandInformationArgs {
  commandId: string;
  information: Property[];
}

export const handle_es_update_command_information: ToolHandler<EsUpdateCommandInformationArgs> = (
  { commandId, information },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === commandId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${commandId} not found.` },
    };
  }
  if (note.type !== 'Command') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${commandId} is not a Command (type: ${note.type}).`,
      },
    };
  }
  note.information = information;
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Command information updated.',
    events: [
      { phase: 'post-commit', action: 'update_note', payload: { id: commandId, information } },
    ],
  };
};

export interface EsUpdateEventPropertiesArgs {
  eventId: string;
  eventProperties: Property[];
}

export const handle_es_update_event_properties: ToolHandler<EsUpdateEventPropertiesArgs> = (
  { eventId, eventProperties },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === eventId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${eventId} not found.` },
    };
  }
  if (note.type !== 'DomainEvent') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${eventId} is not a DomainEvent (type: ${note.type}).`,
      },
    };
  }
  note.eventProperties = eventProperties;
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Event properties updated.',
    events: [
      { phase: 'post-commit', action: 'update_note', payload: { id: eventId, eventProperties } },
    ],
  };
};

export interface EsLinkEntityToEventArgs {
  eventNoteId: string;
  aggregateNoteId: string;
}

export const handle_es_link_entity_to_event: ToolHandler<EsLinkEntityToEventArgs> = (
  { eventNoteId, aggregateNoteId },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const eventNote = board.notes.find((n) => n.id === eventNoteId);
  if (!eventNote) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `DomainEvent note ${eventNoteId} not found.` },
    };
  }
  if (eventNote.type !== 'DomainEvent') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${eventNoteId} is not a DomainEvent.` },
    };
  }
  const entityId = aggregateNoteId.trim() === '' ? undefined : aggregateNoteId;
  eventNote.entityId = entityId;
  const now = ctx.now();
  eventNote.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      { phase: 'post-commit', action: 'update_note', payload: { id: eventNoteId, entityId } },
    ],
  };
};

// ─── Handlers — Flow ────────────────────────────────────────────────────────

export interface EsAddFlowArgs {
  steps: Array<{
    commandLabel: string;
    eventLabel: string;
    eventBehavior?: string;
    information?: Property[];
    eventProperties?: Property[];
  }>;
  autoLink?: boolean;
  startX?: number;
}

export const handle_es_add_flow: ToolHandler<EsAddFlowArgs> = (args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const now = ctx.now();
  const baseX = args.startX ?? nextEventX(board);
  const STEP_SPACING = 400;
  const CMD_EVENT_GAP = 200;

  const createdSteps: Array<{ commandId: string; eventId: string; linkId: string; index: number }> = [];
  const events: BroadcastEvent[] = [];
  const autoLink = args.autoLink ?? true;

  for (let i = 0; i < args.steps.length; i++) {
    const s = args.steps[i];
    const stepX = baseX + i * STEP_SPACING;

    const commandId = uuidv4();
    const eventId = uuidv4();
    const linkId = uuidv4();

    const commandNote: StickyNote = {
      id: commandId,
      type: 'Command',
      label: s.commandLabel,
      position: { x: stepX, y: 200 },
      size: { width: 160, height: 80 },
      zIndex: 1,
      paths: [],
      information: s.information ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const eventNote: StickyNote = {
      id: eventId,
      type: 'DomainEvent',
      label: s.eventLabel,
      position: { x: stepX + CMD_EVENT_GAP, y: 200 },
      size: { width: 160, height: 80 },
      zIndex: 1,
      paths: [],
      commandId,
      ...(s.eventBehavior !== undefined ? { behavior: s.eventBehavior } : {}),
      eventProperties: s.eventProperties ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const cmdEventLink: Link = {
      id: linkId,
      fromId: commandId,
      toId: eventId,
      fromType: 'note',
      toType: 'note',
      createdAt: now,
    };

    board.notes.push(commandNote);
    board.notes.push(eventNote);
    board.links.push(cmdEventLink);

    events.push({ phase: 'pre-commit', action: 'add_note', payload: commandNote });
    events.push({ phase: 'pre-commit', action: 'add_note', payload: eventNote });
    events.push({ phase: 'pre-commit', action: 'add_link', payload: cmdEventLink });

    createdSteps.push({ commandId, eventId, linkId, index: i });
  }

  if (autoLink && createdSteps.length > 1) {
    for (let i = 0; i < createdSteps.length - 1; i++) {
      const flowLink: Link = {
        id: uuidv4(),
        fromId: createdSteps[i].eventId,
        toId: createdSteps[i + 1].commandId,
        fromType: 'note',
        toType: 'note',
        createdAt: now,
      };
      board.links.push(flowLink);
      events.push({ phase: 'pre-commit', action: 'add_link', payload: flowLink });
    }
  }

  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  return { ok: true, resultJson: createdSteps, events };
};

// ─── Handlers — Remodel ────────────────────────────────────────────────────

export interface EsAddRemodelArgs {
  aggregateLabel: string;
  aggregateContent?: string;
  parameterLabel: string;
  parameterContent?: string;
  queryLabel: string;
  queryContent?: string;
  returnTypeLabel: string;
  returnTypeContent?: string;
  linkedEventIds?: string[];
  linkedDtoIds?: string[];
  x?: number;
  y?: number;
  paths?: string[];
  phase?: string;
  notes?: string;
}

export const handle_es_add_remodel: ToolHandler<EsAddRemodelArgs> = (args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const posX = args.x ?? nextRemodelX(board);
  const posY = args.y ?? 520;
  const now = ctx.now();
  const remodel: Remodel = {
    id: uuidv4(),
    position: { x: posX, y: posY },
    aggregateNote: { label: args.aggregateLabel, content: args.aggregateContent ?? '' },
    parameterNote: { label: args.parameterLabel, content: args.parameterContent ?? '' },
    queryNote: { label: args.queryLabel, content: args.queryContent ?? '' },
    returnTypeNote: { label: args.returnTypeLabel, content: args.returnTypeContent ?? '' },
    linkedBundleIds: args.linkedEventIds ?? [],
    linkedDtoIds: args.linkedDtoIds ?? [],
    zIndex: board.remodels.length + board.notes.length + 1,
    paths: args.paths ?? [],
    phase: args.phase,
    notes: args.notes,
    createdAt: now,
    updatedAt: now,
  };
  board.remodels.push(remodel);
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: remodel,
    events: [{ phase: 'post-commit', action: 'add_remodel', payload: remodel }],
  };
};

export interface EsUpdateRemodelArgs {
  id: string;
  aggregateLabel?: string;
  aggregateContent?: string;
  parameterLabel?: string;
  parameterContent?: string;
  queryLabel?: string;
  queryContent?: string;
  returnTypeLabel?: string;
  returnTypeContent?: string;
  linkedEventIds?: string[];
  linkedDtoIds?: string[];
  sourceEventsExpanded?: boolean;
  x?: number;
  y?: number;
  paths?: string[];
  phase?: string;
  notes?: string;
}

export const handle_es_update_remodel: ToolHandler<EsUpdateRemodelArgs> = (args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const remodel = board.remodels.find((r) => r.id === args.id);
  if (!remodel) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Remodel ${args.id} not found.` },
    };
  }
  if (args.x !== undefined) remodel.position.x = args.x;
  if (args.y !== undefined) remodel.position.y = args.y;
  if (args.aggregateLabel !== undefined) remodel.aggregateNote.label = args.aggregateLabel;
  if (args.aggregateContent !== undefined) remodel.aggregateNote.content = args.aggregateContent;
  if (args.parameterLabel !== undefined) remodel.parameterNote.label = args.parameterLabel;
  if (args.parameterContent !== undefined) remodel.parameterNote.content = args.parameterContent;
  if (args.queryLabel !== undefined) remodel.queryNote.label = args.queryLabel;
  if (args.queryContent !== undefined) remodel.queryNote.content = args.queryContent;
  if (args.returnTypeLabel !== undefined) remodel.returnTypeNote.label = args.returnTypeLabel;
  if (args.returnTypeContent !== undefined) remodel.returnTypeNote.content = args.returnTypeContent;
  if (args.linkedEventIds !== undefined) remodel.linkedBundleIds = args.linkedEventIds;
  if (args.linkedDtoIds !== undefined) remodel.linkedDtoIds = args.linkedDtoIds;
  if (args.sourceEventsExpanded !== undefined) remodel.sourceEventsExpanded = args.sourceEventsExpanded;
  if (args.paths !== undefined) remodel.paths = args.paths;
  if (args.phase !== undefined) remodel.phase = args.phase;
  if (args.notes !== undefined) remodel.notes = args.notes;
  const now = ctx.now();
  remodel.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: remodel,
    events: [{ phase: 'post-commit', action: 'update_remodel', payload: remodel }],
  };
};

export interface EsDeleteRemodelArgs {
  id: string;
}

export const handle_es_delete_remodel: ToolHandler<EsDeleteRemodelArgs> = ({ id }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const exists = board.remodels.some((r) => r.id === id);
  if (!exists) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Remodel ${id} not found.` },
    };
  }
  board.remodels = board.remodels.filter((r) => r.id !== id);
  board.links = board.links.filter((l) => l.fromId !== id && l.toId !== id);
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, deletedId: id },
    events: [{ phase: 'post-commit', action: 'delete_remodel', payload: { id } }],
  };
};

// ─── Handlers — Batch path / phase ─────────────────────────────────────────

export interface EsSetEventPathsArgs {
  ids: string[];
  paths: string[];
}

export const handle_es_set_event_paths: ToolHandler<EsSetEventPathsArgs> = ({ ids, paths }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const now = ctx.now();
  const updated: string[] = [];
  const notFound: string[] = [];

  for (const id of ids) {
    const note = board.notes.find((n) => n.id === id);
    if (note) {
      note.paths = paths;
      note.updatedAt = now;
      updated.push(id);
      continue;
    }
    const remodel = board.remodels.find((r) => r.id === id);
    if (remodel) {
      remodel.paths = paths;
      remodel.updatedAt = now;
      updated.push(id);
      continue;
    }
    notFound.push(id);
  }

  const events: BroadcastEvent[] = [];
  if (updated.length > 0) {
    board.updatedAt = now;
    ctx.projectState.updatedAt = now;
    events.push({
      phase: 'post-commit',
      action: 'set_event_paths',
      payload: { ids: updated, paths },
    });
  }
  return { ok: true, resultJson: { updated, notFound }, events };
};

export interface EsSetEventPhaseArgs {
  ids: string[];
  phase: string;
}

export const handle_es_set_event_phase: ToolHandler<EsSetEventPhaseArgs> = ({ ids, phase }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const now = ctx.now();
  const updated: string[] = [];
  const notFound: string[] = [];

  for (const id of ids) {
    const note = board.notes.find((n) => n.id === id);
    if (note) {
      note.phase = phase;
      note.updatedAt = now;
      updated.push(id);
      continue;
    }
    const remodel = board.remodels.find((r) => r.id === id);
    if (remodel) {
      remodel.phase = phase;
      remodel.updatedAt = now;
      updated.push(id);
      continue;
    }
    notFound.push(id);
  }

  const events: BroadcastEvent[] = [];
  if (updated.length > 0) {
    board.updatedAt = now;
    ctx.projectState.updatedAt = now;
    events.push({
      phase: 'post-commit',
      action: 'set_event_phase',
      payload: { ids: updated, phase },
    });
  }
  return { ok: true, resultJson: { updated, notFound }, events };
};

// ─── Handlers — FlowPath ────────────────────────────────────────────────────

export interface EsAddFlowPathArgs {
  name: string;
  color: string;
  description?: string;
}

export const handle_es_add_flow_path: ToolHandler<EsAddFlowPathArgs> = (
  { name, color, description },
  ctx,
) => {
  const now = ctx.now();
  const flowPath: FlowPath = { id: uuidv4(), name, color, description };
  const board = getActiveBoard(ctx.projectState);
  board.flowPaths.push(flowPath);
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { id: flowPath.id },
    events: [{ phase: 'post-commit', action: 'add_flow_path', payload: flowPath }],
  };
};

export interface EsDeleteFlowPathArgs {
  id: string;
}

export const handle_es_delete_flow_path: ToolHandler<EsDeleteFlowPathArgs> = ({ id }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const exists = board.flowPaths.some((fp) => fp.id === id);
  if (!exists) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `FlowPath ${id} not found.` },
    };
  }
  board.flowPaths = board.flowPaths.filter((fp) => fp.id !== id);
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: `FlowPath ${id} deleted.`,
    events: [{ phase: 'post-commit', action: 'delete_flow_path', payload: { id } }],
  };
};

// ─── Handlers — Link ───────────────────────────────────────────────────────

export interface EsAddLinkArgs {
  fromId: string;
  fromType: 'note' | 'remodel';
  toId: string;
  toType: 'note' | 'remodel';
  label?: string;
}

export const handle_es_add_link: ToolHandler<EsAddLinkArgs> = (args, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  const { fromId, toId } = args;
  if (args.fromType === 'note' && !board.notes.find((n) => n.id === fromId)) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Source note ${fromId} not found.` },
    };
  }
  if (args.fromType === 'remodel' && !board.remodels.find((r) => r.id === fromId)) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Source remodel ${fromId} not found.` },
    };
  }
  if (args.toType === 'note' && !board.notes.find((n) => n.id === toId)) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Target note ${toId} not found.` },
    };
  }
  if (args.toType === 'remodel' && !board.remodels.find((r) => r.id === toId)) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Target remodel ${toId} not found.` },
    };
  }
  const now = ctx.now();
  const link: Link = {
    id: uuidv4(),
    fromId: args.fromId,
    fromType: args.fromType,
    toId: args.toId,
    toType: args.toType,
    label: args.label,
    createdAt: now,
  };
  board.links.push(link);
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { id: link.id },
    events: [{ phase: 'post-commit', action: 'add_link', payload: link }],
  };
};

export interface EsDeleteLinkArgs {
  id: string;
}

export const handle_es_delete_link: ToolHandler<EsDeleteLinkArgs> = ({ id }, ctx) => {
  const board = getActiveBoard(ctx.projectState);
  // PERMISSIVE: filter even if id missing.
  board.links = board.links.filter((l) => l.id !== id);
  const now = ctx.now();
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: 'Link deleted.',
    events: [{ phase: 'post-commit', action: 'delete_link', payload: { id } }],
  };
};

// ─── Handlers — Entity / AggregateRoot ─────────────────────────────────────

export interface EsAddEntityForEventArgs {
  eventNoteId: string;
  entityLabel: string;
}

export const handle_es_add_entity_for_event: ToolHandler<EsAddEntityForEventArgs> = (
  { eventNoteId, entityLabel },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const eventNote = board.notes.find((n) => n.id === eventNoteId);
  if (!eventNote) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `DomainEvent note ${eventNoteId} not found.` },
    };
  }
  if (eventNote.type !== 'DomainEvent') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${eventNoteId} is not a DomainEvent.` },
    };
  }

  const now = ctx.now();
  const NOTE_WIDTH = 160;
  const groupNotes = board.notes.filter(
    (n) => n.groupEventId === eventNoteId || n.id === eventNoteId,
  );
  const minX = groupNotes.length > 0 ? Math.min(...groupNotes.map((n) => n.position.x)) : eventNote.position.x;
  const maxX = groupNotes.length > 0 ? Math.max(...groupNotes.map((n) => n.position.x)) : eventNote.position.x;
  const groupCenterX = (minX + maxX + NOTE_WIDTH) / 2;

  const entityNote: StickyNote = {
    id: uuidv4(),
    type: 'Entity',
    label: entityLabel,
    position: { x: groupCenterX - NOTE_WIDTH / 2, y: eventNote.position.y - 104 },
    size: { width: NOTE_WIDTH, height: 80 },
    zIndex: eventNote.zIndex,
    paths: eventNote.paths ?? [],
    groupEventId: eventNoteId,
    createdAt: now,
    updatedAt: now,
  };

  board.notes.push(entityNote);
  eventNote.entityId = entityNote.id;
  eventNote.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  return {
    ok: true,
    resultJson: { entityId: entityNote.id },
    events: [
      { phase: 'post-commit', action: 'add_note', payload: entityNote },
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: eventNoteId, entityId: entityNote.id },
      },
    ],
  };
};

export interface EsLinkEntityToAggregateRootArgs {
  entityNoteId: string;
  aggregateRootNoteId: string;
}

export const handle_es_link_entity_to_aggregate_root: ToolHandler<EsLinkEntityToAggregateRootArgs> = (
  { entityNoteId, aggregateRootNoteId },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const entityNote = board.notes.find((n) => n.id === entityNoteId);
  if (!entityNote) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Entity note ${entityNoteId} not found.` },
    };
  }
  if (entityNote.type !== 'Entity') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${entityNoteId} is not an Entity.` },
    };
  }
  if (aggregateRootNoteId.trim() !== '') {
    const target = board.notes.find((n) => n.id === aggregateRootNoteId);
    if (!target) {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: {
          code: 'NOT_FOUND',
          message: `Aggregate note ${aggregateRootNoteId} not found.`,
        },
      };
    }
    if (target.type !== 'Aggregate') {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: {
          code: 'INVALID_TYPE',
          message: `Note ${aggregateRootNoteId} is not an Aggregate (type: ${target.type}).`,
        },
      };
    }
  }
  const aggRootId = aggregateRootNoteId.trim() === '' ? undefined : aggregateRootNoteId;
  entityNote.aggregateRootId = aggRootId;
  const now = ctx.now();
  entityNote.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: entityNoteId, aggregateRootId: aggRootId },
      },
    ],
  };
};

// ─── Handlers — Spec Bundle: Aggregate ─────────────────────────────────────

export interface EsUpdateAggregateIdentityArgs {
  noteId: string;
  name: string;
  _suggested_type?: string;
  _suggested_field?: string;
}

export const handle_es_update_aggregate_identity: ToolHandler<EsUpdateAggregateIdentityArgs> = (
  args,
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === args.noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${args.noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${args.noteId} is not an Aggregate (type: ${note.type}).`,
      },
    };
  }
  note.aggregateIdentity = {
    name: args.name,
    ...(args._suggested_type !== undefined ? { _suggested_type: args._suggested_type } : {}),
    ...(args._suggested_field !== undefined ? { _suggested_field: args._suggested_field } : {}),
  };
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, aggregateIdentity: note.aggregateIdentity },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: args.noteId, aggregateIdentity: note.aggregateIdentity },
      },
    ],
  };
};

export interface EsUpdateStatePropertiesArgs {
  noteId: string;
  stateProperties: Property[];
}

export const handle_es_update_state_properties: ToolHandler<EsUpdateStatePropertiesArgs> = (
  { noteId, stateProperties },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${noteId} is not an Aggregate (type: ${note.type}).`,
      },
    };
  }
  note.stateProperties = stateProperties;
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, count: stateProperties.length },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: noteId, stateProperties },
      },
    ],
  };
};

export interface EsAddInvariantArgs {
  noteId: string;
  invariant: Omit<Invariant, 'id'> & { id?: string };
}

export const handle_es_add_invariant: ToolHandler<EsAddInvariantArgs> = (
  { noteId, invariant },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${noteId} is not an Aggregate (type: ${note.type}).`,
      },
    };
  }
  const newInvariant: Invariant = {
    ...invariant,
    id: invariant.id ?? uuidv4(),
  };
  if (!note.invariants) note.invariants = [];
  note.invariants.push(newInvariant);
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, invariantId: newInvariant.id },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: noteId, invariants: note.invariants },
      },
    ],
  };
};

export interface EsUpdateInvariantArgs {
  noteId: string;
  invariantId: string;
  updates: Partial<Omit<Invariant, 'id'>>;
}

export const handle_es_update_invariant: ToolHandler<EsUpdateInvariantArgs> = (
  { noteId, invariantId, updates },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${noteId} is not an Aggregate.` },
    };
  }
  if (!note.invariants) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: `Note ${noteId} has no invariants.` },
    };
  }
  const idx = note.invariants.findIndex((inv) => inv.id === invariantId);
  if (idx === -1) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'NOT_FOUND',
        message: `Invariant ${invariantId} not found on note ${noteId}.`,
      },
    };
  }
  note.invariants[idx] = { ...note.invariants[idx], ...updates };
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: noteId, invariants: note.invariants },
      },
    ],
  };
};

export interface EsDeleteInvariantArgs {
  noteId: string;
  invariantId: string;
}

export const handle_es_delete_invariant: ToolHandler<EsDeleteInvariantArgs> = (
  { noteId, invariantId },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${noteId} is not an Aggregate.` },
    };
  }
  if (!note.invariants) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: `Note ${noteId} has no invariants.` },
    };
  }
  const before = note.invariants.length;
  note.invariants = note.invariants.filter((inv) => inv.id !== invariantId);
  if (note.invariants.length === before) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'NOT_FOUND',
        message: `Invariant ${invariantId} not found on note ${noteId}.`,
      },
    };
  }
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  // audit HIGH-2 / D7 cascade (gemini-review-fix: scan ALL boards)
  // soft-null + flag any preCondition referencing the deleted invariantId
  const cascadeEvents: BroadcastEvent[] = [];
  for (const b of ctx.projectState.boards) {
    for (const cmdNote of b.notes) {
      if (cmdNote.type !== 'Command' || !cmdNote.preConditions) continue;
      let changed = false;
      for (const pre of cmdNote.preConditions) {
        if (pre.invariantId === invariantId) {
          pre._brokenInvariantLink = { previousId: invariantId, deletedAt: now };
          pre.invariantId = undefined;
          changed = true;
        }
      }
      if (changed) {
        cmdNote.updatedAt = now;
        b.updatedAt = now;
        cascadeEvents.push({
          phase: 'post-commit',
          action: 'update_note',
          payload: { id: cmdNote.id, preConditions: cmdNote.preConditions },
        });
      }
    }
  }

  return {
    ok: true,
    resultJson: { success: true, deletedId: invariantId },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: noteId, invariants: note.invariants },
      },
      ...cascadeEvents,
    ],
  };
};

export interface EsSetInvariantStatusArgs {
  noteId: string;
  invariantId: string;
  status: 'confirmed' | 'needs_review' | 'rejected';
}

export const handle_es_set_invariant_status: ToolHandler<EsSetInvariantStatusArgs> = (
  { noteId, invariantId, status },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Aggregate') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${noteId} is not an Aggregate.` },
    };
  }
  if (!note.invariants) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: `Note ${noteId} has no invariants.` },
    };
  }
  const inv = note.invariants.find((i) => i.id === invariantId);
  if (!inv) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'NOT_FOUND',
        message: `Invariant ${invariantId} not found on note ${noteId}.`,
      },
    };
  }
  inv.status = status;
  if (status === 'confirmed' && inv.provenance === 'assumption') {
    inv.provenance = 'ui';
  }
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, invariantId, status: inv.status, provenance: inv.provenance },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: noteId, invariants: note.invariants },
      },
    ],
  };
};

// ─── Handlers — Command Conditions (Spec v17) ─────────────────────────────

export interface EsAddCommandConditionArgs {
  commandNoteId: string;
  kind: 'pre' | 'post';
  condition: Omit<CommandCondition, 'id'> & { id?: string };
}

export const handle_es_add_command_condition: ToolHandler<EsAddCommandConditionArgs> = (
  { commandNoteId, kind, condition },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === commandNoteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Command note ${commandNoteId} not found.` },
    };
  }
  if (note.type !== 'Command') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${commandNoteId} is not a Command (type: ${note.type}).` },
    };
  }
  // audit MED-4: postCondition must not carry invariantId
  if (kind === 'post' && condition.invariantId) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'PRECONDITION_FAILED', message: `postCondition must not carry invariantId (linkage only applies to pre).` },
    };
  }
  // invariantId validation for pre: target must exist on some Aggregate's invariants
  if (kind === 'pre' && condition.invariantId) {
    const referenced = board.notes.some(
      (n) => n.type === 'Aggregate' && (n.invariants ?? []).some((inv) => inv.id === condition.invariantId),
    );
    if (!referenced) {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: { code: 'NOT_FOUND', message: `Invariant ${condition.invariantId} not found in any Aggregate.` },
      };
    }
  }

  const newCondition: CommandCondition = {
    ...condition,
    id: condition.id ?? uuidv4(),
  };

  const arrayKey = kind === 'pre' ? 'preConditions' : 'postConditions';
  if (!note[arrayKey]) note[arrayKey] = [];
  note[arrayKey]!.push(newCondition);

  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  return {
    ok: true,
    resultJson: { success: true, conditionId: newCondition.id },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: { id: commandNoteId, [arrayKey]: note[arrayKey] },
      },
    ],
  };
};

export interface EsUpdateCommandConditionsArgs {
  commandNoteId: string;
  preConditions?: CommandCondition[];
  postConditions?: CommandCondition[];
}

export const handle_es_update_command_conditions: ToolHandler<EsUpdateCommandConditionsArgs> = (
  { commandNoteId, preConditions, postConditions },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === commandNoteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Command note ${commandNoteId} not found.` },
    };
  }
  if (note.type !== 'Command') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'INVALID_TYPE', message: `Note ${commandNoteId} is not a Command (type: ${note.type}).` },
    };
  }
  // audit MED-4: any postCondition with invariantId → reject
  if (postConditions !== undefined) {
    for (const p of postConditions) {
      if (p.invariantId) {
        return {
          ok: false,
          resultJson: null,
          events: [],
          error: { code: 'PRECONDITION_FAILED', message: `postCondition must not carry invariantId (linkage only applies to pre).` },
        };
      }
    }
  }

  if (preConditions !== undefined) note.preConditions = preConditions;
  if (postConditions !== undefined) note.postConditions = postConditions;

  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;

  // audit MED-2: single update_note payload carries both arrays (the unchanged one is also included via the current note state)
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      {
        phase: 'post-commit',
        action: 'update_note',
        payload: {
          id: commandNoteId,
          preConditions: note.preConditions ?? [],
          postConditions: note.postConditions ?? [],
        },
      },
    ],
  };
};

// ─── Handlers — Spec Bundle: Dto ───────────────────────────────────────────

export interface EsUpdateDtoFieldsArgs {
  noteId: string;
  dtoFields: DtoField[];
}

export const handle_es_update_dto_fields: ToolHandler<EsUpdateDtoFieldsArgs> = (
  { noteId, dtoFields },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Note ${noteId} not found.` },
    };
  }
  if (note.type !== 'Dto') {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: {
        code: 'INVALID_TYPE',
        message: `Note ${noteId} is not a Dto (type: ${note.type}).`,
      },
    };
  }
  note.dtoFields = dtoFields;
  const now = ctx.now();
  note.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, count: dtoFields.length },
    events: [
      { phase: 'post-commit', action: 'update_note', payload: { id: noteId, dtoFields } },
    ],
  };
};

// ─── Handlers — Spec Bundle: Remodel ───────────────────────────────────────

export interface EsUpdateRemodelBehaviorArgs {
  remodelId: string;
  behavior: string;
}

export const handle_es_update_remodel_behavior: ToolHandler<EsUpdateRemodelBehaviorArgs> = (
  { remodelId, behavior },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const remodel = board.remodels.find((r) => r.id === remodelId);
  if (!remodel) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Remodel ${remodelId} not found.` },
    };
  }
  remodel.behavior = behavior;
  const now = ctx.now();
  remodel.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      {
        phase: 'post-commit',
        action: 'update_remodel',
        payload: { id: remodelId, behavior },
      },
    ],
  };
};

export interface EsUpdateRemodelParametersArgs {
  remodelId: string;
  parameters: Property[];
}

export const handle_es_update_remodel_parameters: ToolHandler<EsUpdateRemodelParametersArgs> = (
  { remodelId, parameters },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const remodel = board.remodels.find((r) => r.id === remodelId);
  if (!remodel) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Remodel ${remodelId} not found.` },
    };
  }
  remodel.parameters = parameters;
  const now = ctx.now();
  remodel.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true, count: parameters.length },
    events: [
      {
        phase: 'post-commit',
        action: 'update_remodel',
        payload: { id: remodelId, parameters },
      },
    ],
  };
};

export interface EsUpdateRemodelReturnTypeArgs {
  remodelId: string;
  returnType: ReturnTypeSpec;
}

export const handle_es_update_remodel_return_type: ToolHandler<EsUpdateRemodelReturnTypeArgs> = (
  { remodelId, returnType },
  ctx,
) => {
  const board = getActiveBoard(ctx.projectState);
  const remodel = board.remodels.find((r) => r.id === remodelId);
  if (!remodel) {
    return {
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: `Remodel ${remodelId} not found.` },
    };
  }
  remodel.returnType = returnType;
  const now = ctx.now();
  remodel.updatedAt = now;
  board.updatedAt = now;
  ctx.projectState.updatedAt = now;
  return {
    ok: true,
    resultJson: { success: true },
    events: [
      {
        phase: 'post-commit',
        action: 'update_remodel',
        payload: { id: remodelId, returnType },
      },
    ],
  };
};
