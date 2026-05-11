import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS } from '../toolDefinitions.js';

const EXPECTED_NAMES = [
  'es_list_contexts',
  'es_get_project',
  'es_get_board',
  'es_create_context',
  'es_switch_context',
  'es_rename_context',
  'es_delete_context',
  'es_set_board_name',
  'es_clear_board',
  'es_add_note',
  'es_update_note',
  'es_delete_note',
  'es_add_command_for_event',
  'es_update_command_information',
  'es_update_event_properties',
  'es_link_entity_to_event',
  'es_link_entity_to_aggregate_root',
  'es_add_flow',
  'es_add_remodel',
  'es_update_remodel',
  'es_delete_remodel',
  'es_set_event_paths',
  'es_set_event_phase',
  'es_add_flow_path',
  'es_delete_flow_path',
  'es_add_link',
  'es_delete_link',
  'es_add_entity_for_event',
  'es_update_aggregate_identity',
  'es_update_state_properties',
  'es_add_invariant',
  'es_update_invariant',
  'es_delete_invariant',
  'es_set_invariant_status',
  'es_update_dto_fields',
  'es_update_remodel_behavior',
  'es_update_remodel_parameters',
  'es_update_remodel_return_type',
] as const;

const VALID_POLICIES = ['read-only', 'standard', 'pre-commit-only', 'mixed', 'no-broadcast'];

describe('TOOL_DEFINITIONS registry', () => {
  it('contains exactly 38 tools', () => {
    expect(TOOL_DEFINITIONS.length).toBe(38);
  });

  it('tool names are unique', () => {
    expect(new Set(TOOL_DEFINITIONS.map((d) => d.name)).size).toBe(38);
  });

  it('tool names match EXPECTED_NAMES set', () => {
    expect(new Set(TOOL_DEFINITIONS.map((d) => d.name))).toEqual(new Set(EXPECTED_NAMES));
  });

  it('Spec B fills risk distribution 3+9+14+1+11 = 38', () => {
    const distribution = TOOL_DEFINITIONS.reduce<Record<string, number>>((acc, d) => {
      acc[d.risk] = (acc[d.risk] ?? 0) + 1;
      return acc;
    }, {});
    expect(distribution).toEqual({ read: 3, additive: 9, mutate: 14, destructive: 1, unset: 11 });
  });

  it("'read' risk maps to 3 tools (exact set)", () => {
    expect(new Set(TOOL_DEFINITIONS.filter((d) => d.risk === 'read').map((d) => d.name))).toEqual(
      new Set(['es_get_project', 'es_list_contexts', 'es_get_board']),
    );
  });

  it("'additive' risk maps to exact 9 tools (es_link_entity_to_aggregate_root NOT in)", () => {
    expect(new Set(TOOL_DEFINITIONS.filter((d) => d.risk === 'additive').map((d) => d.name))).toEqual(
      new Set([
        'es_create_context',
        'es_add_note',
        'es_add_command_for_event',
        'es_add_entity_for_event',
        'es_add_flow',
        'es_add_remodel',
        'es_add_invariant',
        'es_add_link',
        'es_add_flow_path',
      ]),
    );
  });

  it("'mutate' risk maps to 14 tools incl. es_link_entity_to_aggregate_root (audit HIGH-4)", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.risk === 'mutate').length).toBe(14);
    expect(new Set(TOOL_DEFINITIONS.filter((d) => d.risk === 'mutate').map((d) => d.name))).toEqual(
      new Set([
        'es_update_note',
        'es_update_command_information',
        'es_update_event_properties',
        'es_link_entity_to_event',
        'es_link_entity_to_aggregate_root',
        'es_update_aggregate_identity',
        'es_update_state_properties',
        'es_update_invariant',
        'es_set_invariant_status',
        'es_update_dto_fields',
        'es_update_remodel',
        'es_update_remodel_behavior',
        'es_update_remodel_parameters',
        'es_update_remodel_return_type',
      ]),
    );
  });

  it("'destructive' risk maps to es_delete_link only", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.risk === 'destructive').map((d) => d.name)).toEqual([
      'es_delete_link',
    ]);
  });

  it("'unset' risk has 11 tools (Spec B does not expose them)", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.risk === 'unset').length).toBe(11);
  });

  it('all risk values are within enum', () => {
    const VALID_RISKS = ['unset', 'read', 'additive', 'mutate', 'destructive'];
    expect(TOOL_DEFINITIONS.every((d) => VALID_RISKS.includes(d.risk))).toBe(true);
  });

  it('policy values are within enum', () => {
    expect(TOOL_DEFINITIONS.every((d) => VALID_POLICIES.includes(d.policy))).toBe(true);
  });

  it("'read-only' policy maps to the 3 read tools", () => {
    expect(new Set(TOOL_DEFINITIONS.filter((d) => d.policy === 'read-only').map((d) => d.name))).toEqual(
      new Set(['es_list_contexts', 'es_get_project', 'es_get_board']),
    );
  });

  it("'pre-commit-only' is uniquely es_add_flow", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.policy === 'pre-commit-only').map((d) => d.name)).toEqual([
      'es_add_flow',
    ]);
  });

  it("'mixed' is uniquely es_add_command_for_event", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.policy === 'mixed').map((d) => d.name)).toEqual([
      'es_add_command_for_event',
    ]);
  });

  it("'no-broadcast' is uniquely es_switch_context", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.policy === 'no-broadcast').map((d) => d.name)).toEqual([
      'es_switch_context',
    ]);
  });

  it("'standard' policy contains 32 tools", () => {
    expect(TOOL_DEFINITIONS.filter((d) => d.policy === 'standard').length).toBe(32);
  });

  it('each tool has handler and non-empty description', () => {
    for (const d of TOOL_DEFINITIONS) {
      expect(typeof d.handler).toBe('function');
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});
