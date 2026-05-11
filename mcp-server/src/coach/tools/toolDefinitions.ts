// Single source of truth for the 38 MCP tool registrations.
//
// Spec A: name + description + schema + handler + policy + risk='unset'.
// Spec B will populate `risk` with read / additive / mutate / destructive.
//
// Order intentionally matches the previous registration order in
// mcp-server/src/index.ts so audit / diff tooling stays aligned.

import { z } from 'zod';
import type { ToolHandler } from './handlers.js';
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
} from './handlers.js';

export type CommitBroadcastPolicy =
  | 'read-only'
  | 'standard'
  | 'pre-commit-only'
  | 'mixed'
  | 'no-broadcast';

export type ToolRiskLevel = 'unset' | 'read' | 'additive' | 'mutate' | 'destructive';

export interface ToolDefinition<Args = unknown> {
  name: string;
  description: string;
  schema: Record<string, z.ZodType>;
  handler: ToolHandler<Args>;
  policy: CommitBroadcastPolicy;
  risk: ToolRiskLevel;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'es_list_contexts',
    description: 'List all Bounded Context tabs. Returns [{ id, name, isActive }].',
    schema: {},
    handler: handle_es_list_contexts as ToolHandler<unknown>,
    policy: 'read-only',
    risk: 'read',
  },
  {
    name: 'es_get_project',
    description:
      'Return a summary of the entire project: name, project ID, and all contexts with note/event counts. Use this first to get a global overview before drilling into a specific context.',
    schema: {},
    handler: handle_es_get_project as ToolHandler<unknown>,
    policy: 'read-only',
    risk: 'read',
  },
  {
    name: 'es_create_context',
    description: 'Create a new Bounded Context tab. Returns { id }.',
    schema: { name: z.string().describe('Name of the new Bounded Context') },
    handler: handle_es_create_context as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_switch_context',
    description: 'Switch the active Bounded Context tab.',
    schema: { id: z.string().describe('ID of the context to switch to') },
    handler: handle_es_switch_context as ToolHandler<unknown>,
    policy: 'no-broadcast',
    risk: 'unset',
  },
  {
    name: 'es_rename_context',
    description: 'Rename a Bounded Context tab.',
    schema: {
      id: z.string().describe('ID of the context to rename'),
      name: z.string().describe('New name for the context'),
    },
    handler: handle_es_rename_context as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_delete_context',
    description: 'Delete a Bounded Context tab (cannot delete the last one).',
    schema: { id: z.string().describe('ID of the context to delete') },
    handler: handle_es_delete_context as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_get_board',
    description: `Return the active Bounded Context board JSON. Includes all notes (with DomainEvent-centric fields), remodels, links, and flowPaths.
Each DomainEvent note includes: commandId (linked Command note ID), entityId (linked Aggregate note ID), eventProperties (output schema), information (inherited from Command).
Use this before incremental edits to read current state.`,
    schema: {},
    handler: handle_es_get_board as ToolHandler<unknown>,
    policy: 'read-only',
    risk: 'read',
  },
  {
    name: 'es_clear_board',
    description: 'Clear all elements from the active Bounded Context.',
    schema: {},
    handler: handle_es_clear_board as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_set_board_name',
    description: 'Set the project name.',
    schema: { name: z.string().describe('New project name') },
    handler: handle_es_set_board_name as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_add_note',
    description: `Add a sticky note to the active Bounded Context. Returns { id }.
Layout guide:
  • Canvas origin (0,0) top-left; X→right, Y→down
  • StickyNote default size: 160×80px; horizontal spacing: 240px
  • Suggested Y layers: Actor/Policy→0, Command→200, DomainEvent→200, Aggregate→80
  • Types: DomainEvent | Command | Aggregate | Policy | ExternalSystem | Actor | ReadModel | Hotspot | Diamond | Dto
Note: Prefer es_add_command_for_event to create Command+DomainEvent pairs atomically.`,
    schema: {
      type: z
        .enum([
          'DomainEvent',
          'Command',
          'Aggregate',
          'AggregateRoot',
          'Policy',
          'ExternalSystem',
          'Actor',
          'ReadModel',
          'Hotspot',
          'Diamond',
          'Dto',
        ])
        .describe('Element type'),
      label: z.string().describe('Text label for the note'),
      x: z.number().describe('X position in canvas coordinates'),
      y: z.number().describe('Y position in canvas coordinates'),
      paths: z.array(z.string()).optional().describe('FlowPath IDs this note belongs to'),
      phase: z.string().optional().describe('Phase or stage label for this note'),
      notes: z.string().optional().describe('Free-text annotations or remarks'),
      behavior: z
        .string()
        .optional()
        .describe('(DomainEvent only) Behavior description for this event (e.g. "Delete a product")'),
    },
    handler: handle_es_add_note as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_update_note',
    description: 'Update an existing sticky note. All fields except id are optional.',
    schema: {
      id: z.string().describe('Note ID to update'),
      label: z.string().optional().describe('New label text'),
      x: z.number().optional().describe('New X position'),
      y: z.number().optional().describe('New Y position'),
      paths: z.array(z.string()).optional().describe('FlowPath IDs this note belongs to'),
      phase: z.string().optional().describe('Phase or stage label for this note'),
      notes: z.string().optional().describe('Free-text annotations or remarks'),
      behavior: z
        .string()
        .optional()
        .describe('(DomainEvent only) Behavior description for this event (e.g. "Delete a product")'),
      policyTrigger: z
        .object({
          type: z.literal('DomainEvent'),
          name: z.string(),
          noteRef: z.string().optional(),
        })
        .optional()
        .describe(
          '(Policy only) The DomainEvent that triggers this Policy. Setting this field overwrites the trigger entirely; pass undefined to leave unchanged (clearing requires using es_update_note with no policyTrigger to leave it as-is — this MCP tool does not currently support explicit removal).',
        ),
      policyIssues: z
        .array(
          z.object({
            type: z.literal('Command'),
            name: z.string(),
            noteRef: z.string().optional(),
            targetAggregate: z.string().optional(),
            targetAggregateRef: z.string().optional(),
          }),
        )
        .optional()
        .describe(
          '(Policy only) Commands fired by this Policy. Setting this field REPLACES the entire array (not append). Pass [] to clear all issues.',
        ),
    },
    handler: handle_es_update_note as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_delete_note',
    description: 'Delete a sticky note and its associated links.',
    schema: { id: z.string().describe('Note ID to delete') },
    handler: handle_es_delete_note as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_add_command_for_event',
    description: `Create a Command note and link it to an existing DomainEvent note as its trigger.
The Command is placed to the left of the DomainEvent on the canvas.
Also creates a directional link: Command → DomainEvent.
Returns { commandId, linkId }.

Use this to build the Command→Event flow step by step:
1. Create DomainEvent notes first (or use es_add_flow)
2. Call this tool to attach a Command to each event`,
    schema: {
      eventNoteId: z.string().describe('ID of the DomainEvent note to attach the command to'),
      commandLabel: z
        .string()
        .describe('Label for the Command note (imperative: e.g. "PlaceOrder", "Submit Payment")'),
      information: z
        .array(
          z.object({
            attrName: z.string().describe('Parameter attribute name'),
            type: z.string().describe('Parameter type (e.g. "String", "Integer", "Boolean")'),
          }),
        )
        .optional()
        .default([])
        .describe('Input parameters required by this command'),
    },
    handler: handle_es_add_command_for_event as ToolHandler<unknown>,
    policy: 'mixed',
    risk: 'additive',
  },
  {
    name: 'es_update_command_information',
    description:
      'Update the input parameters (information schema) of a Command note. Replaces all existing parameters.',
    schema: {
      commandId: z.string().describe('ID of the Command note to update'),
      information: z
        .array(
          z.object({
            attrName: z.string().describe('Parameter attribute name'),
            type: z.string().describe('Parameter type (e.g. "String", "Integer", "Boolean")'),
          }),
        )
        .describe("Complete replacement of the command's input parameters"),
    },
    handler: handle_es_update_command_information as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_event_properties',
    description:
      'Update the output properties (event schema) of a DomainEvent note. Replaces all existing properties.',
    schema: {
      eventId: z.string().describe('ID of the DomainEvent note to update'),
      eventProperties: z
        .array(
          z.object({
            attrName: z.string().describe('Property attribute name'),
            type: z.string().describe('Property type (e.g. "String", "Integer", "DateTime")'),
          }),
        )
        .describe("Complete replacement of the event's output properties"),
    },
    handler: handle_es_update_event_properties as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_link_entity_to_event',
    description: `Link an Aggregate note to a DomainEvent as its entity (the aggregate being acted upon).
Sets DomainEvent.entityId = aggregateNoteId. Pass aggregateNoteId as empty string "" to unlink.
Returns { success: true }.`,
    schema: {
      eventNoteId: z.string().describe('ID of the DomainEvent note'),
      aggregateNoteId: z
        .string()
        .describe('ID of the Aggregate note to link (pass empty string to unlink)'),
    },
    handler: handle_es_link_entity_to_event as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_add_flow',
    description: `Create an entire Event Storming happy path by adding multiple Command→DomainEvent pairs in one call.
Each step creates: one Command note + one DomainEvent note + a Command→Event link.
Steps are auto-positioned left-to-right (400px spacing, y=200) starting after any existing events.
Optionally auto-links consecutive DomainEvents with arrows.
Returns [{ commandId, eventId, linkId, index }] for each step.

Layout per step (pair of notes, 200px spacing):
  Command: x=stepX,       y=200, size 160×80, color blue
  Event:   x=stepX+200,   y=200, size 160×80, color orange

Example: 3 steps → placed at x=80, x=480, x=880 (if board is empty)`,
    schema: {
      steps: z
        .array(
          z.object({
            commandLabel: z.string().describe('Command label (imperative: e.g. "PlaceOrder")'),
            eventLabel: z.string().describe('Domain Event label (past tense: e.g. "OrderPlaced")'),
            eventBehavior: z
              .string()
              .optional()
              .describe('Behavior description for the DomainEvent (e.g. "Delete a product")'),
            information: z
              .array(z.object({ attrName: z.string(), type: z.string() }))
              .optional()
              .default([])
              .describe('Input parameters for the command'),
            eventProperties: z
              .array(z.object({ attrName: z.string(), type: z.string() }))
              .optional()
              .default([])
              .describe('Output properties carried by the domain event'),
          }),
        )
        .describe('Ordered flow steps, left to right'),
      autoLink: z
        .boolean()
        .optional()
        .default(true)
        .describe('Auto-create DomainEvent→next-Command links between consecutive steps'),
      startX: z
        .number()
        .optional()
        .describe(
          'Override X start position for the first step (default: auto, appends after existing events)',
        ),
    },
    handler: handle_es_add_flow as ToolHandler<unknown>,
    policy: 'pre-commit-only',
    risk: 'additive',
  },
  {
    name: 'es_add_remodel',
    description: `Add a Remodel (4-in-1 read-side card) to the active Bounded Context. Returns the full Remodel JSON including id.
Remodel represents a Read Model projection in Event Sourcing architecture.
Layout:
  • Purple (top): Aggregate (read perspective)
  • Cyan (bottom-left): Query Parameters
  • Blue-grey (bottom-center): Query name (convention: "Get" + name, e.g. "GetOrderList")
  • Lavender (bottom-right): Return type description
  • Remodel size: 496×248px; omit x/y for auto-layout (appended right of existing elements at y=520)
  • linkedBundleIds now means linked DomainEvent note IDs (post-migration)`,
    schema: {
      aggregateLabel: z.string().describe('Aggregate name for read perspective (top cell)'),
      aggregateContent: z.string().optional().describe('Aggregate description'),
      parameterLabel: z.string().describe('Query parameter name (bottom-left cell)'),
      parameterContent: z.string().optional().describe('Parameter details'),
      queryLabel: z
        .string()
        .describe('Query name — convention: "Get" + name, e.g. "GetOrderList" (bottom-center cell)'),
      queryContent: z.string().optional().describe('Query description'),
      returnTypeLabel: z.string().describe('Return type name (bottom-right cell)'),
      returnTypeContent: z.string().optional().describe('Return type description'),
      linkedEventIds: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of DomainEvent notes whose events feed this Read Model (stored in linkedBundleIds field)',
        ),
      linkedDtoIds: z
        .array(z.string())
        .optional()
        .describe('IDs of Dto StickyNotes associated with this Remodel (default: [])'),
      x: z.number().optional().describe('X position (omit for auto-layout)'),
      y: z.number().optional().describe('Y position (omit for auto-layout, defaults to 520)'),
      paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
      phase: z.string().optional().describe('Phase or stage label'),
      notes: z.string().optional().describe('Free-text annotations or remarks'),
    },
    handler: handle_es_add_remodel as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_update_remodel',
    description:
      "Update a Remodel's content, linked events, or metadata. All fields except id are optional (partial update — undefined fields are not overwritten).",
    schema: {
      id: z.string().describe('Remodel ID to update'),
      aggregateLabel: z.string().optional().describe('Aggregate name (top cell)'),
      aggregateContent: z.string().optional().describe('Aggregate description'),
      parameterLabel: z.string().optional().describe('Query parameter name (bottom-left cell)'),
      parameterContent: z.string().optional().describe('Parameter details'),
      queryLabel: z.string().optional().describe('Query name (bottom-center cell)'),
      queryContent: z.string().optional().describe('Query description'),
      returnTypeLabel: z.string().optional().describe('Return type name (bottom-right cell)'),
      returnTypeContent: z.string().optional().describe('Return type description'),
      linkedEventIds: z
        .array(z.string())
        .optional()
        .describe(
          'Complete replacement of linked DomainEvent note IDs (stored in linkedBundleIds)',
        ),
      linkedDtoIds: z
        .array(z.string())
        .optional()
        .describe('Complete replacement of linked Dto StickyNote IDs (not append)'),
      sourceEventsExpanded: z.boolean().optional().describe('Source Events area expanded state'),
      x: z.number().optional().describe('New X position'),
      y: z.number().optional().describe('New Y position'),
      paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
      phase: z.string().optional().describe('Phase or stage label'),
      notes: z.string().optional().describe('Free-text annotations or remarks'),
    },
    handler: handle_es_update_remodel as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_delete_remodel',
    description:
      'Delete a Remodel and all links where it is the source or target. Returns { success: true, deletedId }.',
    schema: { id: z.string().describe('Remodel ID to delete') },
    handler: handle_es_delete_remodel as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_set_event_paths',
    description: `Batch-assign FlowPath IDs to multiple notes and/or remodels in one call (overwrites existing paths — not append).
Searches notes[] and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
    schema: {
      ids: z.array(z.string()).describe('Note or Remodel IDs to update'),
      paths: z.array(z.string()).describe('FlowPath IDs to assign (replaces existing paths)'),
    },
    handler: handle_es_set_event_paths as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_set_event_phase',
    description: `Batch-assign a phase label to multiple notes and/or remodels in one call (overwrites existing phase).
Searches notes[] and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
    schema: {
      ids: z.array(z.string()).describe('Note or Remodel IDs to update'),
      phase: z
        .string()
        .describe('Phase label to assign (e.g. "Discovery", "Order Processing")'),
    },
    handler: handle_es_set_event_phase as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_add_flow_path',
    description: `Add a named FlowPath definition to the active Bounded Context. Returns { id }.
FlowPaths are color-coded path markers used to categorize Notes into named flows
(e.g. "Happy Path", "Error Path", "Admin Flow"). After creating a FlowPath, assign its id
to notes via es_update_note paths field.`,
    schema: {
      name: z
        .string()
        .describe('Display name for this flow path (e.g. "Happy Path", "Error Flow")'),
      color: z
        .string()
        .describe('CSS color string for this path (e.g. "#4CAF50", "blue", "hsl(120,60%,50%)")'),
      description: z
        .string()
        .optional()
        .describe('Optional description of when/why this path is taken'),
    },
    handler: handle_es_add_flow_path as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_delete_flow_path',
    description:
      'Delete a FlowPath definition from the active Bounded Context by ID. Note: this does NOT remove the path id from notes that reference it.',
    schema: { id: z.string().describe('FlowPath ID to delete') },
    handler: handle_es_delete_flow_path as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_add_link',
    description:
      'Create a directional link between two elements (notes or remodels) in the active context. Returns { id }.',
    schema: {
      fromId: z.string().describe('ID of the source element'),
      fromType: z.enum(['note', 'remodel']).describe('Type of the source element'),
      toId: z.string().describe('ID of the target element'),
      toType: z.enum(['note', 'remodel']).describe('Type of the target element'),
      label: z.string().optional().describe('Optional label for the link'),
    },
    handler: handle_es_add_link as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_delete_link',
    description: 'Delete a link by ID.',
    schema: { id: z.string().describe('Link ID to delete') },
    handler: handle_es_delete_link as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'destructive',
  },
  {
    name: 'es_add_entity_for_event',
    description: `Create an Entity note and link it to an existing DomainEvent note as its entity.
The Entity is placed above the group of satellite notes (Command, Information) centered on the DomainEvent.
Returns { entityId }.`,
    schema: {
      eventNoteId: z.string().describe('ID of the DomainEvent note'),
      entityLabel: z
        .string()
        .describe('Label for the Entity note (noun, e.g. "Order", "Customer")'),
    },
    handler: handle_es_add_entity_for_event as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_link_entity_to_aggregate_root',
    description: `Link an Entity note to an AggregateRoot note. Sets Entity.aggregateRootId = aggregateRootNoteId.
Pass aggregateRootNoteId as empty string "" to unlink.
Returns { success: true }.`,
    schema: {
      entityNoteId: z.string().describe('ID of the Entity note'),
      aggregateRootNoteId: z
        .string()
        .describe('ID of the AggregateRoot note to link (pass empty string to unlink)'),
    },
    handler: handle_es_link_entity_to_aggregate_root as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_aggregate_identity',
    description:
      'Set the identity field definition for an Aggregate note. Creates aggregateIdentity if it does not exist yet. Returns { success: true }.',
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      name: z.string().describe('Identity field name (e.g. "orderId")'),
      _suggested_type: z.string().optional().describe('Suggested ID type (e.g. "OrderId")'),
      _suggested_field: z.string().optional().describe('Suggested field name (e.g. "orderId")'),
    },
    handler: handle_es_update_aggregate_identity as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_state_properties',
    description:
      'Batch-replace all state properties on an Aggregate note. Returns { success: true }.',
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      stateProperties: z
        .array(
          z.object({
            attrName: z.string().describe('Property field name (e.g. "totalAmount")'),
            type: z
              .string()
              .describe('Property type (e.g. "Decimal", "String", "Integer")'),
          }),
        )
        .describe("Complete replacement of the aggregate's state properties"),
    },
    handler: handle_es_update_state_properties as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_add_invariant',
    description: `Append an invariant rule to an Aggregate note's invariants[].
If the invariant object does not include an id, one is auto-generated.
AI-inferred invariants should use provenance="assumption" and status="needs_review" with a source object.
User-authored invariants use provenance="ui" and status="confirmed" with source=null.
Returns { success: true, invariantId }.`,
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      invariant: z
        .object({
          id: z.string().optional().describe('Invariant ID (auto-generated if omitted)'),
          name: z
            .string()
            .describe('Semantic identifier in camelCase (e.g. "checkCancellable")'),
          title: z.string().describe('Human-readable label (e.g. "已出貨不可取消")'),
          applicability: z
            .string()
            .optional()
            .describe('Optional condition scope description'),
          rules: z
            .array(
              z.object({
                when: z.string().describe('"always" | "never" | "<field> <op> <value>"'),
                rule: z.string().describe('Rule statement or expression'),
              }),
            )
            .describe('One or more conditional rules'),
          errorCode: z.string().describe('Error code in camelCase (e.g. "orderAlreadyShipped")'),
          relatedState: z
            .array(z.string())
            .optional()
            .describe('State field names related to this invariant'),
          provenance: z
            .enum(['ui', 'assumption'])
            .describe('"ui" = human-authored; "assumption" = AI-inferred'),
          status: z
            .enum(['confirmed', 'needs_review', 'rejected'])
            .describe('Review status'),
          source: z
            .object({
              agent: z.string(),
              derivedFrom: z.array(z.string()),
              inferredAt: z.string(),
              rationale: z.string(),
            })
            .nullable()
            .optional()
            .describe('Source info for AI-inferred invariants (null for ui-authored)'),
        })
        .describe('Invariant definition to append'),
    },
    handler: handle_es_add_invariant as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'additive',
  },
  {
    name: 'es_update_invariant',
    description:
      'Partially update an existing invariant on an Aggregate note (merge updates into the existing invariant). Returns { success: true }.',
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      invariantId: z.string().describe('ID of the invariant to update'),
      updates: z
        .object({
          name: z.string().optional(),
          title: z.string().optional(),
          applicability: z.string().optional(),
          rules: z
            .array(z.object({ when: z.string(), rule: z.string() }))
            .optional(),
          errorCode: z.string().optional(),
          relatedState: z.array(z.string()).optional(),
          provenance: z.enum(['ui', 'assumption']).optional(),
          status: z.enum(['confirmed', 'needs_review', 'rejected']).optional(),
          source: z
            .object({
              agent: z.string(),
              derivedFrom: z.array(z.string()),
              inferredAt: z.string(),
              rationale: z.string(),
            })
            .nullable()
            .optional(),
        })
        .describe('Fields to update (partial merge — unspecified fields are preserved)'),
    },
    handler: handle_es_update_invariant as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_delete_invariant',
    description:
      'Remove an invariant from an Aggregate note by invariant ID. Returns { success: true, deletedId }.',
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      invariantId: z.string().describe('ID of the invariant to delete'),
    },
    handler: handle_es_delete_invariant as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'unset',
  },
  {
    name: 'es_set_invariant_status',
    description: `Set the review status of an invariant on an Aggregate note.
When status is set to "confirmed" and the current provenance is "assumption", provenance is automatically promoted to "ui" (indicating the user has accepted this AI-inferred rule).
Returns { success: true, invariantId, status, provenance }.`,
    schema: {
      noteId: z.string().describe('ID of the Aggregate note'),
      invariantId: z.string().describe('ID of the invariant to update'),
      status: z
        .enum(['confirmed', 'needs_review', 'rejected'])
        .describe('New review status'),
    },
    handler: handle_es_set_invariant_status as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_dto_fields',
    description: 'Batch-replace all fields on a Dto note. Returns { success: true }.',
    schema: {
      noteId: z.string().describe('ID of the Dto note'),
      dtoFields: z
        .array(
          z.object({
            name: z.string().describe('Field name (e.g. "orderId")'),
            type: z.string().describe('Field type (e.g. "String", "Decimal", "UUID")'),
            nullable: z
              .boolean()
              .optional()
              .describe('Whether the field is nullable (default false)'),
            dtoSpecRef: z
              .string()
              .optional()
              .describe('Reference to another Dto note id for nested DTO'),
          }),
        )
        .describe("Complete replacement of the DTO's field definitions"),
    },
    handler: handle_es_update_dto_fields as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_remodel_behavior',
    description:
      'Set the behavior description on a Remodel (narrative of what the query does). Returns { success: true }.',
    schema: {
      remodelId: z.string().describe('ID of the Remodel'),
      behavior: z
        .string()
        .describe('Natural language description of the query behavior'),
    },
    handler: handle_es_update_remodel_behavior as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_remodel_parameters',
    description:
      'Batch-replace all structured query parameters on a Remodel. Returns { success: true }.',
    schema: {
      remodelId: z.string().describe('ID of the Remodel'),
      parameters: z
        .array(
          z.object({
            attrName: z.string().describe('Parameter field name (e.g. "customerId")'),
            type: z.string().describe('Parameter type (e.g. "UUID", "String")'),
          }),
        )
        .describe("Complete replacement of the remodel's query parameters"),
    },
    handler: handle_es_update_remodel_parameters as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
  {
    name: 'es_update_remodel_return_type',
    description:
      'Set the structured return type spec on a Remodel (shape + typed fields). Returns { success: true }.',
    schema: {
      remodelId: z.string().describe('ID of the Remodel'),
      returnType: z
        .object({
          shape: z.enum(['object', 'array', 'primitive']).describe('Return type shape'),
          fields: z
            .array(
              z.object({
                name: z.string().describe('Field name'),
                type: z
                  .string()
                  .describe('Field type (e.g. "String", "Decimal", "OrderItemDto")'),
                nullable: z.boolean().optional().describe('Whether the field is nullable'),
                dtoSpecRef: z
                  .string()
                  .optional()
                  .describe('Reference to a Dto note id for nested DTO'),
              }),
            )
            .describe('Fields in the return type'),
        })
        .describe('Complete return type specification'),
    },
    handler: handle_es_update_remodel_return_type as ToolHandler<unknown>,
    policy: 'standard',
    risk: 'mutate',
  },
];
