import { describe, it, expect } from 'vitest';
import {
  handle_es_list_contexts,
  handle_es_get_project,
  handle_es_create_context,
  handle_es_switch_context,
  handle_es_rename_context,
  handle_es_delete_context,
  handle_es_get_board,
  handle_es_clear_board,
  handle_es_set_board_name,
  handle_es_add_note,
  handle_es_update_note,
  handle_es_delete_note,
  handle_es_add_command_for_event,
  handle_es_update_command_information,
  handle_es_update_event_properties,
  handle_es_link_entity_to_event,
  handle_es_add_flow,
  handle_es_add_remodel,
  handle_es_update_remodel,
  handle_es_delete_remodel,
  handle_es_set_event_paths,
  handle_es_set_event_phase,
  handle_es_add_flow_path,
  handle_es_delete_flow_path,
  handle_es_add_link,
  handle_es_delete_link,
  handle_es_add_entity_for_event,
  handle_es_link_entity_to_aggregate_root,
  handle_es_update_aggregate_identity,
  handle_es_update_state_properties,
  handle_es_add_invariant,
  handle_es_update_invariant,
  handle_es_delete_invariant,
  handle_es_set_invariant_status,
  handle_es_update_dto_fields,
  handle_es_update_remodel_behavior,
  handle_es_update_remodel_parameters,
  handle_es_update_remodel_return_type,
} from '../handlers.js';
import type {
  Project,
  Board,
  StickyNote,
  Remodel,
  Link,
  FlowPath,
  ToolHandlerCtx,
} from '../handlers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FIXED_NOW = '2026-05-08T00:00:00.000Z';
const ctxFor = (project: Project): ToolHandlerCtx => ({ projectState: project, now: () => FIXED_NOW });

function buildEmptyProject(): Project {
  const boardId = 'board-1';
  const board: Board = {
    id: boardId,
    name: 'Default Context',
    notes: [],
    remodels: [],
    links: [],
    flowPaths: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  return {
    id: 'proj-1',
    name: 'Test Project',
    boards: [board],
    activeBoardId: boardId,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function buildRichProject(): Project {
  const boardId = 'board-A';
  const altBoardId = 'board-B';

  const aggregate: StickyNote = {
    id: 'agg-1',
    type: 'Aggregate',
    label: 'Order',
    position: { x: 80, y: 80 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    aggregateIdentity: { name: 'orderId' },
    stateProperties: [{ attrName: 'status', type: 'String' }],
    invariants: [
      {
        id: 'inv-1',
        name: 'noCancelAfterShip',
        title: '已出貨不可取消',
        rules: [{ when: 'status == shipped', rule: 'cannot cancel' }],
        errorCode: 'orderAlreadyShipped',
        provenance: 'assumption',
        status: 'needs_review',
        source: { agent: 'agent', derivedFrom: [], inferredAt: FIXED_NOW, rationale: 'r' },
      },
      {
        id: 'inv-2',
        name: 'positiveTotal',
        title: 'Total must be positive',
        rules: [{ when: 'always', rule: 'total > 0' }],
        errorCode: 'totalNotPositive',
        provenance: 'ui',
        status: 'confirmed',
        source: null,
      },
    ],
  };

  const dto: StickyNote = {
    id: 'dto-1',
    type: 'Dto',
    label: 'OrderItemDto',
    position: { x: 80, y: 240 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    dtoFields: [{ name: 'sku', type: 'String' }],
  };

  const eventNote: StickyNote = {
    id: 'evt-1',
    type: 'DomainEvent',
    label: 'OrderPlaced',
    position: { x: 480, y: 200 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    commandId: 'cmd-1',
    entityId: 'agg-1',
    eventProperties: [{ attrName: 'orderId', type: 'UUID' }],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const commandNote: StickyNote = {
    id: 'cmd-1',
    type: 'Command',
    label: 'PlaceOrder',
    position: { x: 280, y: 200 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    information: [{ attrName: 'customerId', type: 'UUID' }],
    groupEventId: 'evt-1',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const infoNote: StickyNote = {
    id: 'info-1',
    type: 'Information',
    label: 'PlaceOrder Info',
    position: { x: 100, y: 200 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    information: [{ attrName: 'customerId', type: 'UUID' }],
    groupEventId: 'evt-1',
    informationForCommandId: 'cmd-1',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const entityNote: StickyNote = {
    id: 'ent-1',
    type: 'Entity',
    label: 'Order',
    position: { x: 480, y: 100 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    groupEventId: 'evt-1',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const policyNote: StickyNote = {
    id: 'pol-1',
    type: 'Policy',
    label: 'NotifyShipping',
    position: { x: 600, y: 360 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    policyTrigger: { type: 'DomainEvent', name: 'OrderPlaced' },
    policyIssues: [{ type: 'Command', name: 'PrepareShipment' }],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const readModelNote: StickyNote = {
    id: 'rm-1',
    type: 'ReadModel',
    label: 'OrderList',
    position: { x: 280, y: 520 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    paths: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const remodel: Remodel = {
    id: 'rm-card-1',
    position: { x: 800, y: 520 },
    aggregateNote: { label: 'Order', content: '' },
    parameterNote: { label: 'customerId', content: '' },
    queryNote: { label: 'GetOrderList', content: '' },
    returnTypeNote: { label: 'OrderListView', content: '' },
    linkedBundleIds: ['evt-1'],
    linkedDtoIds: ['dto-1'],
    zIndex: 9,
    paths: [],
    parameters: [{ attrName: 'customerId', type: 'UUID' }],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const flowPaths: FlowPath[] = [
    { id: 'fp-1', name: 'Happy Path', color: '#4caf50' },
    { id: 'fp-2', name: 'Cancel Flow', color: '#f44336' },
  ];

  const links: Link[] = [
    {
      id: 'lk-1',
      fromId: 'cmd-1',
      toId: 'evt-1',
      fromType: 'note',
      toType: 'note',
      createdAt: FIXED_NOW,
    },
    {
      id: 'lk-2',
      fromId: 'evt-1',
      toId: 'rm-card-1',
      fromType: 'note',
      toType: 'remodel',
      createdAt: FIXED_NOW,
    },
    {
      id: 'lk-3',
      fromId: 'pol-1',
      toId: 'cmd-1',
      fromType: 'note',
      toType: 'note',
      createdAt: FIXED_NOW,
    },
  ];

  const board: Board = {
    id: boardId,
    name: 'Order Context',
    notes: [aggregate, dto, eventNote, commandNote, infoNote, entityNote, policyNote, readModelNote],
    remodels: [remodel],
    links,
    flowPaths,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  const altBoard: Board = {
    id: altBoardId,
    name: 'Billing Context',
    notes: [],
    remodels: [],
    links: [],
    flowPaths: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  return {
    id: 'proj-rich',
    name: 'Rich Project',
    boards: [board, altBoard],
    activeBoardId: boardId,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

// ─── Read-only tools ───────────────────────────────────────────────────────

describe('read-only handlers', () => {
  it('es_list_contexts returns array of contexts and emits no events', () => {
    const p = buildRichProject();
    const before = JSON.parse(JSON.stringify(p));
    const r = handle_es_list_contexts({}, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
    expect(Array.isArray(r.resultJson)).toBe(true);
    const arr = r.resultJson as Array<{ id: string; name: string; isActive: boolean }>;
    expect(arr.length).toBe(2);
    expect(arr.find((c) => c.isActive)?.id).toBe('board-A');
    expect(p).toEqual(before);
  });

  it('es_get_project returns project summary with counts', () => {
    const p = buildRichProject();
    const r = handle_es_get_project({}, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
    const summary = r.resultJson as {
      id: string;
      contexts: Array<{ id: string; domainEventCount: number; commandCount: number }>;
    };
    expect(summary.id).toBe('proj-rich');
    const main = summary.contexts.find((c) => c.id === 'board-A')!;
    expect(main.domainEventCount).toBe(1);
    expect(main.commandCount).toBe(1);
  });

  it('es_get_board returns active board with annotated notes', () => {
    const p = buildRichProject();
    const r = handle_es_get_board({}, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
    const board = r.resultJson as { notes: Array<{ id: string; _commandLabel?: string | null }> };
    const evt = board.notes.find((n) => n.id === 'evt-1')!;
    expect(evt._commandLabel).toBe('PlaceOrder');
  });
});

// ─── Context management ───────────────────────────────────────────────────

describe('context management handlers', () => {
  it('es_create_context appends board, sets it active and emits add_board', () => {
    const p = buildEmptyProject();
    const r = handle_es_create_context({ name: 'New Ctx' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards.length).toBe(2);
    expect(p.activeBoardId).toBe(p.boards[1].id);
    expect(r.events.map((e) => e.action)).toEqual(['add_board']);
    expect(r.events[0].phase).toBe('post-commit');
  });

  it('es_switch_context happy path returns text and no events', () => {
    const p = buildRichProject();
    const r = handle_es_switch_context({ id: 'board-B' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
    expect(p.activeBoardId).toBe('board-B');
    expect(typeof r.resultJson).toBe('string');
  });

  it('es_switch_context unknown id returns NOT_FOUND with no mutation', () => {
    const p = buildRichProject();
    const before = p.activeBoardId;
    const r = handle_es_switch_context({ id: 'nope' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Context nope not found.');
    expect(r.events).toEqual([]);
    expect(p.activeBoardId).toBe(before);
  });

  it('es_rename_context renames and emits rename_board', () => {
    const p = buildRichProject();
    const r = handle_es_rename_context({ id: 'board-A', name: 'Renamed' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards.find((b) => b.id === 'board-A')!.name).toBe('Renamed');
    expect(r.events[0].action).toBe('rename_board');
  });

  it('es_rename_context unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_rename_context({ id: 'no-id', name: 'X' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_delete_context deletes and reassigns active when needed', () => {
    const p = buildRichProject();
    const r = handle_es_delete_context({ id: 'board-A' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards.length).toBe(1);
    expect(p.activeBoardId).toBe('board-B');
    expect(r.events[0].action).toBe('delete_board');
  });

  it('es_delete_context refuses when only 1 board', () => {
    const p = buildEmptyProject();
    const r = handle_es_delete_context({ id: 'board-1' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('PRECONDITION_FAILED');
    expect(r.error?.message).toBe('Cannot delete the last context.');
  });
});

// ─── Board read/write ──────────────────────────────────────────────────────

describe('board read/write handlers', () => {
  it('es_clear_board empties notes/remodels/links', () => {
    const p = buildRichProject();
    const r = handle_es_clear_board({}, ctxFor(p));
    expect(r.ok).toBe(true);
    const b = p.boards.find((bd) => bd.id === 'board-A')!;
    expect(b.notes).toEqual([]);
    expect(b.remodels).toEqual([]);
    expect(b.links).toEqual([]);
    expect(r.events[0].action).toBe('clear_board');
  });

  it('es_set_board_name updates project name and emits set_project_name', () => {
    const p = buildEmptyProject();
    const r = handle_es_set_board_name({ name: 'Renamed Project' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.name).toBe('Renamed Project');
    expect(r.events[0].action).toBe('set_project_name');
  });
});

// ─── Note CRUD ─────────────────────────────────────────────────────────────

describe('note CRUD handlers', () => {
  it('es_add_note pushes note, returns id, emits add_note', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_note(
      { type: 'DomainEvent', label: 'X', x: 10, y: 20, behavior: 'b' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect((r.resultJson as { id: string }).id).toBeDefined();
    expect(p.boards[0].notes.length).toBe(1);
    expect(p.boards[0].notes[0].behavior).toBe('b');
    expect(r.events[0].action).toBe('add_note');
  });

  it('es_update_note merges fields and emits update_note', () => {
    const p = buildRichProject();
    const r = handle_es_update_note({ id: 'cmd-1', label: 'PayOrder', x: 999 }, ctxFor(p));
    expect(r.ok).toBe(true);
    const cmd = p.boards[0].notes.find((n) => n.id === 'cmd-1')!;
    expect(cmd.label).toBe('PayOrder');
    expect(cmd.position.x).toBe(999);
    expect(r.events[0].action).toBe('update_note');
  });

  it('es_update_note unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_note({ id: 'nope' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_delete_note PERMISSIVE: unknown id still emits delete_note (no error)', () => {
    const p = buildRichProject();
    const r = handle_es_delete_note({ id: 'no-such' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events[0].action).toBe('delete_note');
  });

  it('es_delete_note removes note + dependent links', () => {
    const p = buildRichProject();
    const r = handle_es_delete_note({ id: 'cmd-1' }, ctxFor(p));
    expect(r.ok).toBe(true);
    const b = p.boards[0];
    expect(b.notes.find((n) => n.id === 'cmd-1')).toBeUndefined();
    expect(b.links.find((l) => l.fromId === 'cmd-1' || l.toId === 'cmd-1')).toBeUndefined();
  });
});

// ─── DomainEvent-centric ──────────────────────────────────────────────────

describe('DomainEvent-centric handlers', () => {
  it('es_add_command_for_event with information emits 1 pre + 2 post in correct order', () => {
    const p = buildEmptyProject();
    // First add a DomainEvent
    handle_es_add_note(
      { type: 'DomainEvent', label: 'OrderPlaced', x: 480, y: 200 },
      ctxFor(p),
    );
    const evt = p.boards[0].notes[0];
    const r = handle_es_add_command_for_event(
      {
        eventNoteId: evt.id,
        commandLabel: 'PlaceOrder',
        information: [{ attrName: 'customerId', type: 'UUID' }],
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(r.events.length).toBe(3);
    expect(r.events[0]).toMatchObject({ phase: 'pre-commit', action: 'add_note' });
    expect((r.events[0].payload as StickyNote).type).toBe('Information');
    expect(r.events[1]).toMatchObject({ phase: 'post-commit', action: 'add_note' });
    expect((r.events[1].payload as StickyNote).type).toBe('Command');
    expect(r.events[2]).toMatchObject({ phase: 'post-commit', action: 'update_note' });
    // eventNote.commandId is set
    expect(p.boards[0].notes.find((n) => n.id === evt.id)!.commandId).toBeDefined();
  });

  it('es_add_command_for_event with empty information emits 0 pre + 2 post', () => {
    const p = buildEmptyProject();
    handle_es_add_note(
      { type: 'DomainEvent', label: 'OrderPlaced', x: 480, y: 200 },
      ctxFor(p),
    );
    const evt = p.boards[0].notes[0];
    const r = handle_es_add_command_for_event(
      { eventNoteId: evt.id, commandLabel: 'PlaceOrder', information: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(r.events.length).toBe(2);
    expect(r.events.every((e) => e.phase === 'post-commit')).toBe(true);
  });

  it('es_add_command_for_event missing event returns NOT_FOUND', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_command_for_event(
      { eventNoteId: 'nope', commandLabel: 'X' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_add_command_for_event wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_add_command_for_event(
      { eventNoteId: 'cmd-1', commandLabel: 'X' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_update_command_information replaces information', () => {
    const p = buildRichProject();
    const r = handle_es_update_command_information(
      { commandId: 'cmd-1', information: [{ attrName: 'foo', type: 'String' }] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const cmd = p.boards[0].notes.find((n) => n.id === 'cmd-1')!;
    expect(cmd.information).toEqual([{ attrName: 'foo', type: 'String' }]);
  });

  it('es_update_command_information wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_update_command_information(
      { commandId: 'evt-1', information: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_update_event_properties replaces eventProperties', () => {
    const p = buildRichProject();
    const r = handle_es_update_event_properties(
      { eventId: 'evt-1', eventProperties: [{ attrName: 'x', type: 'String' }] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const evt = p.boards[0].notes.find((n) => n.id === 'evt-1')!;
    expect(evt.eventProperties).toEqual([{ attrName: 'x', type: 'String' }]);
  });

  it('es_update_event_properties wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_update_event_properties(
      { eventId: 'cmd-1', eventProperties: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_link_entity_to_event sets entityId and emits update_note', () => {
    const p = buildRichProject();
    const r = handle_es_link_entity_to_event(
      { eventNoteId: 'evt-1', aggregateNoteId: 'agg-1' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'evt-1')!.entityId).toBe('agg-1');
  });

  it('es_link_entity_to_event empty string unlinks', () => {
    const p = buildRichProject();
    const r = handle_es_link_entity_to_event(
      { eventNoteId: 'evt-1', aggregateNoteId: '' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'evt-1')!.entityId).toBeUndefined();
  });

  it('es_link_entity_to_event missing event returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_link_entity_to_event(
      { eventNoteId: 'nope', aggregateNoteId: 'agg-1' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });
});

// ─── Flow ─────────────────────────────────────────────────────────────────

describe('es_add_flow', () => {
  it('2 steps + autoLink emits 7 pre-commit events in order (golden)', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_flow(
      {
        steps: [
          { commandLabel: 'A', eventLabel: 'AHappened' },
          { commandLabel: 'B', eventLabel: 'BHappened' },
        ],
        autoLink: true,
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    // 7 events: cmd1 / evt1 / link1 / cmd2 / evt2 / link2 / flowLink
    expect(r.events.length).toBe(7);
    expect(r.events.every((e) => e.phase === 'pre-commit')).toBe(true);
    expect(r.events.map((e) => e.action)).toEqual([
      'add_note',
      'add_note',
      'add_link',
      'add_note',
      'add_note',
      'add_link',
      'add_link',
    ]);
  });

  it('1 step with autoLink emits 3 events (no auto-link)', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_flow(
      { steps: [{ commandLabel: 'A', eventLabel: 'AHappened' }], autoLink: true },
      ctxFor(p),
    );
    expect(r.events.length).toBe(3);
  });
});

// ─── Remodel ───────────────────────────────────────────────────────────────

describe('Remodel handlers', () => {
  it('es_add_remodel pushes remodel and emits add_remodel', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_remodel(
      {
        aggregateLabel: 'A',
        parameterLabel: 'P',
        queryLabel: 'GetX',
        returnTypeLabel: 'X',
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].remodels.length).toBe(1);
    expect(r.events[0].action).toBe('add_remodel');
  });

  it('es_update_remodel partial-merges fields', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel(
      { id: 'rm-card-1', queryLabel: 'GetOrders' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const rm = p.boards[0].remodels[0];
    expect(rm.queryNote.label).toBe('GetOrders');
  });

  it('es_update_remodel unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel({ id: 'nope' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_delete_remodel STRICT: unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_delete_remodel({ id: 'nope' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Remodel nope not found.');
  });

  it('es_delete_remodel removes remodel and dependent links', () => {
    const p = buildRichProject();
    const r = handle_es_delete_remodel({ id: 'rm-card-1' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards[0].remodels).toEqual([]);
    expect(p.boards[0].links.find((l) => l.fromId === 'rm-card-1' || l.toId === 'rm-card-1')).toBeUndefined();
  });
});

// ─── Batch path/phase ──────────────────────────────────────────────────────

describe('batch path/phase handlers', () => {
  it('es_set_event_paths PERMISSIVE: missing ids reported in notFound', () => {
    const p = buildRichProject();
    const r = handle_es_set_event_paths(
      { ids: ['cmd-1', 'no-such', 'rm-card-1'], paths: ['fp-1'] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const result = r.resultJson as { updated: string[]; notFound: string[] };
    expect(result.updated).toEqual(['cmd-1', 'rm-card-1']);
    expect(result.notFound).toEqual(['no-such']);
    expect(r.events.length).toBe(1);
    expect(r.events[0].action).toBe('set_event_paths');
  });

  it('es_set_event_paths zero updated emits no event', () => {
    const p = buildRichProject();
    const r = handle_es_set_event_paths({ ids: ['no-1', 'no-2'], paths: ['fp-1'] }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
  });

  it('es_set_event_phase batch updates notes + remodels', () => {
    const p = buildRichProject();
    const r = handle_es_set_event_phase(
      { ids: ['evt-1', 'rm-card-1'], phase: 'Discovery' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'evt-1')!.phase).toBe('Discovery');
    expect(p.boards[0].remodels[0].phase).toBe('Discovery');
  });
});

// ─── FlowPath ─────────────────────────────────────────────────────────────

describe('FlowPath handlers', () => {
  it('es_add_flow_path pushes and returns id', () => {
    const p = buildEmptyProject();
    const r = handle_es_add_flow_path({ name: 'X', color: '#fff' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards[0].flowPaths.length).toBe(1);
  });

  it('es_delete_flow_path STRICT: unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_delete_flow_path({ id: 'nope' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_delete_flow_path removes existing flow path', () => {
    const p = buildRichProject();
    const r = handle_es_delete_flow_path({ id: 'fp-1' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards[0].flowPaths.map((fp) => fp.id)).toEqual(['fp-2']);
  });
});

// ─── Link ─────────────────────────────────────────────────────────────────

describe('Link handlers', () => {
  it('es_add_link creates and returns id', () => {
    const p = buildRichProject();
    const before = p.boards[0].links.length;
    const r = handle_es_add_link(
      { fromId: 'cmd-1', toId: 'evt-1', fromType: 'note', toType: 'note' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].links.length).toBe(before + 1);
  });

  it('es_add_link returns NOT_FOUND when fromId (note) missing', () => {
    const p = buildRichProject();
    const r = handle_es_add_link(
      { fromId: 'ghost-note', toId: 'evt-1', fromType: 'note', toType: 'note' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Source note ghost-note not found.');
  });

  it('es_add_link returns NOT_FOUND when fromId (remodel) missing', () => {
    const p = buildRichProject();
    const r = handle_es_add_link(
      { fromId: 'ghost-rm', toId: 'evt-1', fromType: 'remodel', toType: 'note' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Source remodel ghost-rm not found.');
  });

  it('es_add_link returns NOT_FOUND when toId (note) missing', () => {
    const p = buildRichProject();
    const r = handle_es_add_link(
      { fromId: 'cmd-1', toId: 'ghost-note', fromType: 'note', toType: 'note' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Target note ghost-note not found.');
  });

  it('es_add_link returns NOT_FOUND when toId (remodel) missing', () => {
    const p = buildRichProject();
    const r = handle_es_add_link(
      { fromId: 'cmd-1', toId: 'ghost-rm', fromType: 'note', toType: 'remodel' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Target remodel ghost-rm not found.');
  });

  it('es_delete_link PERMISSIVE: unknown id still emits delete_link', () => {
    const p = buildRichProject();
    const before = p.boards[0].links.length;
    const r = handle_es_delete_link({ id: 'no-id' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(r.events[0].action).toBe('delete_link');
    expect(p.boards[0].links.length).toBe(before);
  });

  it('es_delete_link removes existing link', () => {
    const p = buildRichProject();
    const r = handle_es_delete_link({ id: 'lk-1' }, ctxFor(p));
    expect(r.ok).toBe(true);
    expect(p.boards[0].links.find((l) => l.id === 'lk-1')).toBeUndefined();
  });
});

// ─── Entity / AggregateRoot ────────────────────────────────────────────────

describe('Entity / AggregateRoot handlers', () => {
  it('es_add_entity_for_event creates entity, links event, emits 2 post-commit', () => {
    const p = buildRichProject();
    const r = handle_es_add_entity_for_event(
      { eventNoteId: 'evt-1', entityLabel: 'OrderEntity' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(r.events.length).toBe(2);
    expect(r.events.every((e) => e.phase === 'post-commit')).toBe(true);
  });

  it('es_add_entity_for_event missing event returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_add_entity_for_event(
      { eventNoteId: 'nope', entityLabel: 'X' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_add_entity_for_event wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_add_entity_for_event(
      { eventNoteId: 'cmd-1', entityLabel: 'X' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_link_entity_to_aggregate_root happy + INVALID_TYPE', () => {
    const p = buildRichProject();
    const r1 = handle_es_link_entity_to_aggregate_root(
      { entityNoteId: 'ent-1', aggregateRootNoteId: 'agg-1' },
      ctxFor(p),
    );
    expect(r1.ok).toBe(true);
    const r2 = handle_es_link_entity_to_aggregate_root(
      { entityNoteId: 'cmd-1', aggregateRootNoteId: 'agg-1' },
      ctxFor(p),
    );
    expect(r2.ok).toBe(false);
    expect(r2.error?.code).toBe('INVALID_TYPE');
  });

  it('es_link_entity_to_aggregate_root returns NOT_FOUND when target aggregate missing', () => {
    const p = buildRichProject();
    const r = handle_es_link_entity_to_aggregate_root(
      { entityNoteId: 'ent-1', aggregateRootNoteId: 'ghost-agg' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
    expect(r.error?.message).toBe('Aggregate note ghost-agg not found.');
  });

  it('es_link_entity_to_aggregate_root returns INVALID_TYPE when target is not Aggregate', () => {
    const p = buildRichProject();
    // cmd-1 is a Command, not an Aggregate — wrong target type
    const r = handle_es_link_entity_to_aggregate_root(
      { entityNoteId: 'ent-1', aggregateRootNoteId: 'cmd-1' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
    expect(r.error?.message).toBe('Note cmd-1 is not an Aggregate (type: Command).');
  });
});

// ─── Spec Bundle: Aggregate ───────────────────────────────────────────────

describe('Aggregate spec handlers', () => {
  it('es_update_aggregate_identity sets identity', () => {
    const p = buildRichProject();
    const r = handle_es_update_aggregate_identity(
      { noteId: 'agg-1', name: 'orderId', _suggested_type: 'OrderId' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'agg-1')!.aggregateIdentity!.name).toBe('orderId');
  });

  it('es_update_aggregate_identity wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_update_aggregate_identity({ noteId: 'cmd-1', name: 'x' }, ctxFor(p));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_update_state_properties replaces stateProperties', () => {
    const p = buildRichProject();
    const r = handle_es_update_state_properties(
      { noteId: 'agg-1', stateProperties: [{ attrName: 'total', type: 'Decimal' }] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'agg-1')!.stateProperties).toEqual([
      { attrName: 'total', type: 'Decimal' },
    ]);
  });

  it('es_update_state_properties NOT_FOUND on missing note', () => {
    const p = buildRichProject();
    const r = handle_es_update_state_properties(
      { noteId: 'nope', stateProperties: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_add_invariant appends with auto-id when omitted', () => {
    const p = buildRichProject();
    const r = handle_es_add_invariant(
      {
        noteId: 'agg-1',
        invariant: {
          name: 'newRule',
          title: 'New',
          rules: [{ when: 'always', rule: 'x' }],
          errorCode: 'newRule',
          provenance: 'ui',
          status: 'confirmed',
          source: null,
        },
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect((r.resultJson as { invariantId: string }).invariantId).toBeDefined();
    expect(p.boards[0].notes.find((n) => n.id === 'agg-1')!.invariants!.length).toBe(3);
  });

  it('es_add_invariant INVALID_TYPE on non-aggregate', () => {
    const p = buildRichProject();
    const r = handle_es_add_invariant(
      {
        noteId: 'cmd-1',
        invariant: {
          name: 'x',
          title: 'x',
          rules: [],
          errorCode: 'x',
          provenance: 'ui',
          status: 'confirmed',
          source: null,
        },
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });

  it('es_update_invariant merges updates', () => {
    const p = buildRichProject();
    const r = handle_es_update_invariant(
      { noteId: 'agg-1', invariantId: 'inv-1', updates: { title: 'Changed' } },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const inv = p.boards[0].notes.find((n) => n.id === 'agg-1')!.invariants!.find((i) => i.id === 'inv-1')!;
    expect(inv.title).toBe('Changed');
  });

  it('es_update_invariant unknown invariantId returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_invariant(
      { noteId: 'agg-1', invariantId: 'nope', updates: {} },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_delete_invariant STRICT: 3-stage check + post-filter length', () => {
    const p = buildRichProject();
    const r = handle_es_delete_invariant(
      { noteId: 'agg-1', invariantId: 'inv-1' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'agg-1')!.invariants!.length).toBe(1);
  });

  it('es_delete_invariant unknown invariantId returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_delete_invariant(
      { noteId: 'agg-1', invariantId: 'nope' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_set_invariant_status promotes assumption→ui when confirmed', () => {
    const p = buildRichProject();
    const r = handle_es_set_invariant_status(
      { noteId: 'agg-1', invariantId: 'inv-1', status: 'confirmed' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    const inv = p.boards[0].notes.find((n) => n.id === 'agg-1')!.invariants!.find((i) => i.id === 'inv-1')!;
    expect(inv.status).toBe('confirmed');
    expect(inv.provenance).toBe('ui');
  });

  it('es_set_invariant_status unknown invariantId returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_set_invariant_status(
      { noteId: 'agg-1', invariantId: 'nope', status: 'rejected' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });
});

// ─── Spec Bundle: Dto ──────────────────────────────────────────────────────

describe('Dto handlers', () => {
  it('es_update_dto_fields replaces fields', () => {
    const p = buildRichProject();
    const r = handle_es_update_dto_fields(
      { noteId: 'dto-1', dtoFields: [{ name: 'a', type: 'String' }] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].notes.find((n) => n.id === 'dto-1')!.dtoFields).toEqual([
      { name: 'a', type: 'String' },
    ]);
  });

  it('es_update_dto_fields wrong type returns INVALID_TYPE', () => {
    const p = buildRichProject();
    const r = handle_es_update_dto_fields(
      { noteId: 'cmd-1', dtoFields: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_TYPE');
  });
});

// ─── Spec Bundle: Remodel ──────────────────────────────────────────────────

describe('Remodel spec handlers', () => {
  it('es_update_remodel_behavior sets behavior', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_behavior(
      { remodelId: 'rm-card-1', behavior: 'returns list' },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].remodels[0].behavior).toBe('returns list');
  });

  it('es_update_remodel_behavior unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_behavior(
      { remodelId: 'nope', behavior: 'x' },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_update_remodel_parameters replaces parameters', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_parameters(
      { remodelId: 'rm-card-1', parameters: [{ attrName: 'a', type: 'String' }] },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].remodels[0].parameters).toEqual([{ attrName: 'a', type: 'String' }]);
  });

  it('es_update_remodel_parameters unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_parameters(
      { remodelId: 'nope', parameters: [] },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });

  it('es_update_remodel_return_type sets returnType', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_return_type(
      {
        remodelId: 'rm-card-1',
        returnType: { shape: 'object', fields: [{ name: 'x', type: 'String' }] },
      },
      ctxFor(p),
    );
    expect(r.ok).toBe(true);
    expect(p.boards[0].remodels[0].returnType?.shape).toBe('object');
  });

  it('es_update_remodel_return_type unknown id returns NOT_FOUND', () => {
    const p = buildRichProject();
    const r = handle_es_update_remodel_return_type(
      { remodelId: 'nope', returnType: { shape: 'array', fields: [] } },
      ctxFor(p),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_FOUND');
  });
});
