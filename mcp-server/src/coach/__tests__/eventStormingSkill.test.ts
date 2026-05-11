import { describe, it, expect } from 'vitest';
import { EventStormingSkill } from '../skills/eventStormingSkill.js';
import type { Project, Board, StickyNote, ToolHandlerCtx } from '../tools/handlers.js';

const FIXED_NOW = '2026-05-11T00:00:00.000Z';

const EXPECTED_READ_TOOLS = ['es_list_contexts', 'es_get_project', 'es_get_board'];
const EXPECTED_ADDITIVE_TOOLS = [
  'es_create_context',
  'es_add_note',
  'es_add_command_for_event',
  'es_add_flow',
  'es_add_remodel',
  'es_add_flow_path',
  'es_add_link',
  'es_add_entity_for_event',
  'es_add_invariant',
];

function buildProject(): Project {
  const eventNote: StickyNote = {
    id: 'evt-1',
    type: 'DomainEvent',
    label: 'OrderPlaced',
    position: { x: 240, y: 200 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  const aggNote: StickyNote = {
    id: 'agg-1',
    type: 'Aggregate',
    label: 'Order',
    position: { x: 80, y: 80 },
    size: { width: 160, height: 80 },
    zIndex: 1,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  const board: Board = {
    id: 'board-A',
    name: 'Sales',
    notes: [eventNote, aggNote],
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
    activeBoardId: 'board-A',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function ctxFor(project: Project): ToolHandlerCtx {
  return { projectState: project, now: () => FIXED_NOW };
}

describe('EventStormingSkill.buildDeclarations', () => {
  it('exports exactly 12 tools (3 read + 9 additive)', () => {
    const skill = new EventStormingSkill();
    const decls = skill.buildDeclarations();
    expect(decls).toHaveLength(12);
    const names = decls.map((d) => d.name).sort();
    const expected = [...EXPECTED_READ_TOOLS, ...EXPECTED_ADDITIVE_TOOLS].sort();
    expect(names).toEqual(expected);
  });

  it('is cached — second call returns same array reference', () => {
    const skill = new EventStormingSkill();
    const a = skill.buildDeclarations();
    const b = skill.buildDeclarations();
    expect(a).toBe(b);
  });
});

describe('EventStormingSkill.execute', () => {
  it('happy path: es_create_context with valid args returns ok=true', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const result = skill.execute('es_create_context', { name: 'Foo' }, ctxFor(project));
    expect(result.ok).toBe(true);
  });

  it('rejects mutate-class tool (es_update_note) with PRECONDITION_FAILED', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const result = skill.execute('es_update_note', { id: 'x' }, ctxFor(project));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRECONDITION_FAILED');
    expect(result.error?.message).toContain('not exposed in MVP-mid');
  });

  it('rejects unknown tool with PRECONDITION_FAILED', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const result = skill.execute('es_does_not_exist', {}, ctxFor(project));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRECONDITION_FAILED');
  });

  it('zod re-validate failure: es_create_context with name: 123', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const result = skill.execute('es_create_context', { name: 123 }, ctxFor(project));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRECONDITION_FAILED');
    expect(result.error?.message).toContain('Invalid args');
  });
});

describe('EventStormingSkill.describeProposal', () => {
  it('es_add_command_for_event → targetIds = [eventNoteId], subjectLabel has commandLabel', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_command_for_event',
      { eventNoteId: 'evt-1', commandLabel: 'PlaceOrder' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['evt-1']);
    expect(desc.subjectLabel).toContain('PlaceOrder');
  });

  it('es_add_entity_for_event → targetIds = [eventNoteId]', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_entity_for_event',
      { eventNoteId: 'evt-1', entityLabel: 'Order' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['evt-1']);
  });

  it('es_add_invariant → targetIds = [noteId]', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_invariant',
      { noteId: 'agg-1', invariant: { title: 'No cancel after ship' } },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['agg-1']);
  });

  it('es_add_link (note → note) → targetIds = [fromId, toId]', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_link',
      { fromId: 'agg-1', fromType: 'note', toId: 'evt-1', toType: 'note' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['agg-1', 'evt-1']);
  });

  it('es_add_link (note → remodel) → targetIds = [fromId] only', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_link',
      { fromId: 'evt-1', fromType: 'note', toId: 'rmd-1', toType: 'remodel' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['evt-1']);
  });

  it('es_add_link (remodel → note) → targetIds = [toId] only', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_add_link',
      { fromId: 'rmd-1', fromType: 'remodel', toId: 'evt-1', toType: 'note' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual(['evt-1']);
  });

  it('es_create_context → targetIds = []', () => {
    const skill = new EventStormingSkill();
    const project = buildProject();
    const desc = skill.describeProposal(
      'es_create_context',
      { name: 'Inventory' },
      ctxFor(project),
    );
    expect(desc.targetIds).toEqual([]);
  });
});
