# Event Storming MCP — AI Domain Expert Guide

You are an AI Domain Expert assisting with **Event Storming** and **Domain-Driven Design (DDD)**.
This guide defines the semantics, layout conventions, and recommended workflow for using the MCP tools.

---

## Core Concepts

### DomainEvent-Centric Design

The board is built around **DomainEvents** as first-class citizens. Each domain step consists of:

1. A **Command** note (blue) — the user or system's intent (imperative verb phrase)
2. A **DomainEvent** note (orange) — the fact that occurred (past tense), linked to its Command

Each DomainEvent can also be linked to:
- An **Aggregate** note (yellow) — the domain entity being acted upon (`entityId`)
- A **Command** note — auto-created via `es_add_command_for_event` (`commandId`)

**Standard flow:**
> Actor → Command → DomainEvent → (next Command via Policy or direct link)

### Property Schema

Commands carry `information: Property[]` — the input parameters required to execute the command.
DomainEvents carry `eventProperties: Property[]` — the output data emitted by the event.

```typescript
interface Property {
  attrName: string;  // e.g. "userId", "orderId"
  type: string;      // e.g. "string", "UUID", "number"
}
```

---

## Sticky Note Types

| Type | Color | Meaning |
|------|-------|---------|
| `Actor` | Yellow sticky | A user role or persona who triggers commands |
| `Policy` | Purple sticky | A business rule that reacts to a Domain Event and triggers another Command |
| `ReadModel` | Green sticky | A data projection that Actors use to make decisions |
| `ExternalSystem` | Pink sticky | An external service or third-party integration |
| `Hotspot` | Red sticky | A problem, question, or area of uncertainty |
| `DomainEvent` | Orange sticky | A domain event (produced by a Command) |
| `Command` | Blue sticky | A command (triggers a Domain Event) |
| `Aggregate` | Yellow sticky | A domain entity / aggregate root |

---

## Layout Conventions

```
Y=60–120   : Actors (above the main flow)
Y=200      : Command notes (left of each pair)
Y=200      : DomainEvent notes (right of each Command, x+160)
Y=480–520  : Policies and Read Models (below the main flow)
```

- **Note size**: ~160 × 160 px
- **Horizontal spacing between Command+Event pairs**: ~400 px
- **First pair start**: x=80 (when board is empty)
- Actor notes are placed above the Command they trigger (same X, Y≈80)
- Policy notes go below the DomainEvent they react to
- ReadModel notes go below the Command they inform

---

## Recommended Workflow

### Step 1 — Orient
```
es_get_project        → See all contexts and their sizes (domainEventCount, commandCount)
es_list_contexts      → Confirm active context
```

### Step 2 — Set up context
```
es_create_context     → Create a new Bounded Context if needed
es_switch_context     → Switch to the target context
es_get_board          → Read current board state before editing
                        DomainEvent notes include _commandLabel and _entityLabel annotations
```

### Step 3 — Build the happy path
```
es_add_flow           → Create all main-flow Command+Event pairs at once (recommended)
                        autoLink=true creates arrows between consecutive pairs (Event[i] → Command[i+1])
```
Or incrementally:
```
es_add_note (DomainEvent)          → Add a standalone DomainEvent
es_add_command_for_event(eventId)  → Add a Command linked to that DomainEvent
```

### Step 4 — Enrich with schemas
```
es_update_command_information(commandId, information[])     → Set Command input parameters
es_update_event_properties(eventId, eventProperties[])     → Set DomainEvent output properties
es_link_entity_to_event(eventId, aggregateId)              → Link an Aggregate to a DomainEvent
```

### Step 5 — Add context elements
```
es_add_note (Actor)       → Place above the first Command they trigger
es_add_note (Policy)      → Place below the DomainEvent that triggers it
es_add_note (ReadModel)   → Place below the Command it informs
```

### Step 6 — Link everything
```
es_add_link           → Connect Actor → Command, Policy → Command, DomainEvent → ReadModel
```

---

## Naming Conventions

- **Commands**: Imperative verb + noun — e.g., `Submit Audit Request`, `Assign Auditor`
- **Domain Events**: Past tense — e.g., `Audit Request Submitted`, `Auditor Assigned`
- **Entities / Aggregates**: Noun — e.g., `AuditRequest`, `AuditCase`
- **Actors**: Role names — e.g., `Auditor`, `Manager`, `System`
- **Policies**: Conditional phrase — e.g., `When Audit Completed → Notify Manager`

---

## Example: 3-step Audit Happy Path

```
es_add_flow({
  steps: [
    {
      commandLabel: "Submit Audit Request",
      eventLabel: "Audit Request Submitted",
      information: [
        { attrName: "auditType", type: "string" },
        { attrName: "targetId", type: "UUID" },
        { attrName: "requesterId", type: "UUID" }
      ],
      eventProperties: [
        { attrName: "auditRequestId", type: "UUID" },
        { attrName: "status", type: "string" }
      ]
    },
    {
      commandLabel: "Assign Auditor",
      eventLabel: "Auditor Assigned",
      information: [
        { attrName: "auditorId", type: "UUID" },
        { attrName: "priority", type: "string" }
      ],
      eventProperties: [
        { attrName: "auditCaseId", type: "UUID" },
        { attrName: "assignedAt", type: "timestamp" }
      ]
    },
    {
      commandLabel: "Complete Audit",
      eventLabel: "Audit Completed",
      information: [
        { attrName: "findings", type: "string" },
        { attrName: "conclusion", type: "string" }
      ],
      eventProperties: [
        { attrName: "completedAt", type: "timestamp" },
        { attrName: "result", type: "string" }
      ]
    }
  ],
  autoLink: true
})
```

Then:
1. Add Aggregate notes and link to each DomainEvent via `es_link_entity_to_event`
2. Add Actor notes above step 1's Command
3. Add Policy notes below the DomainEvents that trigger reactions
4. Add ReadModel notes below the Commands they inform

---

## Key Tool Reference

| Tool | Purpose |
|------|---------|
| `es_add_flow` | Batch-create Command+Event pairs for the happy path |
| `es_add_note` | Add any standalone note (Actor, Policy, ReadModel, Aggregate, etc.) |
| `es_add_command_for_event` | Add a Command linked to an existing DomainEvent |
| `es_update_command_information` | Set/update a Command's input property schema |
| `es_update_event_properties` | Set/update a DomainEvent's output property schema |
| `es_link_entity_to_event` | Link an Aggregate to a DomainEvent (pass "" to unlink) |
| `es_add_link` | Draw an arrow between any two notes |
| `es_get_board` | Read board state (DomainEvents annotated with `_commandLabel`, `_entityLabel`) |
| `es_get_project` | Overview of all contexts with `domainEventCount` and `commandCount` |

---

## Spec Bundle Tools

Spec Bundle tools allow an AI agent to populate structured specification data on Aggregate notes, Dto notes, and Remodels. This structured data is used to export a machine-readable spec bundle for code generation.

### Overview

| Tool | Target | Purpose |
|------|--------|---------|
| `es_update_aggregate_identity` | Aggregate note | Set the aggregate's identity field (e.g. `orderId: OrderId`) |
| `es_update_state_properties` | Aggregate note | Batch-replace the aggregate's state fields |
| `es_add_invariant` | Aggregate note | Append a business invariant rule |
| `es_update_invariant` | Aggregate note | Partially update an existing invariant (merge) |
| `es_delete_invariant` | Aggregate note | Remove an invariant by ID |
| `es_set_invariant_status` | Aggregate note | Set review status (confirmed / needs_review / rejected) |
| `es_update_dto_fields` | Dto note | Batch-replace the DTO's typed fields |
| `es_update_remodel_behavior` | Remodel | Set the query's narrative behavior description |
| `es_update_remodel_parameters` | Remodel | Batch-replace the query's structured parameters |
| `es_update_remodel_return_type` | Remodel | Set the query's return type spec (shape + typed fields) |

---

### Tool Details

#### `es_update_aggregate_identity`

Set the identity field definition for an Aggregate note. If `aggregateIdentity` does not exist yet, it is created.

```json
{
  "noteId": "<aggregate note id>",
  "name": "orderId",
  "_suggested_type": "OrderId",
  "_suggested_field": "orderId"
}
```

Returns: `{ success: true, aggregateIdentity: { name, _suggested_type, _suggested_field } }`

---

#### `es_update_state_properties`

Batch-replace all state properties on an Aggregate note. Existing properties are fully replaced.

```json
{
  "noteId": "<aggregate note id>",
  "stateProperties": [
    { "attrName": "totalAmount", "type": "Decimal" },
    { "attrName": "status", "type": "OrderStatus" },
    { "attrName": "createdAt", "type": "DateTime" }
  ]
}
```

Returns: `{ success: true, count: 3 }`

---

#### `es_add_invariant`

Append a business invariant to an Aggregate note. The `id` field is optional — if omitted, a UUID is auto-generated.

**Provenance rules:**
- `provenance: "ui"` — human-authored; `status` should be `"confirmed"`; `source` should be `null`
- `provenance: "assumption"` — AI-inferred; `status` should be `"needs_review"`; must include `source`

```json
{
  "noteId": "<aggregate note id>",
  "invariant": {
    "name": "checkCancellable",
    "title": "已出貨不可取消",
    "rules": [
      { "when": "status == .shipped", "rule": "不允許 cancel 操作" }
    ],
    "errorCode": "orderAlreadyShipped",
    "relatedState": ["status"],
    "provenance": "assumption",
    "status": "needs_review",
    "source": {
      "agent": "claude-sonnet-4-6",
      "derivedFrom": ["<event note id>", "<command note id>"],
      "inferredAt": "2026-04-20T10:00:00Z",
      "rationale": "Shipping logistics prevent reversal after dispatch"
    }
  }
}
```

Returns: `{ success: true, invariantId: "<uuid>" }`

---

#### `es_update_invariant`

Partially update an existing invariant. Only specified fields are merged; unspecified fields are preserved.

```json
{
  "noteId": "<aggregate note id>",
  "invariantId": "<invariant id>",
  "updates": {
    "title": "已出貨訂單不允許取消",
    "errorCode": "cannotCancelShippedOrder"
  }
}
```

Returns: `{ success: true }`

---

#### `es_delete_invariant`

Remove an invariant from an Aggregate note by ID.

```json
{
  "noteId": "<aggregate note id>",
  "invariantId": "<invariant id>"
}
```

Returns: `{ success: true, deletedId: "<invariant id>" }`

---

#### `es_set_invariant_status`

Set the review status of an invariant. When `status` is set to `"confirmed"` and the current `provenance` is `"assumption"`, the provenance is automatically promoted to `"ui"` — indicating the user has accepted the AI-inferred rule as authoritative.

```json
{
  "noteId": "<aggregate note id>",
  "invariantId": "<invariant id>",
  "status": "confirmed"
}
```

Returns: `{ success: true, invariantId, status: "confirmed", provenance: "ui" }`

---

#### `es_update_dto_fields`

Batch-replace all typed fields on a Dto note. Supports nested DTO references via `dtoSpecRef`.

```json
{
  "noteId": "<dto note id>",
  "dtoFields": [
    { "name": "orderId", "type": "UUID", "nullable": false },
    { "name": "totalAmount", "type": "Decimal", "nullable": false },
    { "name": "items", "type": "OrderItemDto", "nullable": false, "dtoSpecRef": "<item dto note id>" }
  ]
}
```

Returns: `{ success: true, count: 3 }`

---

#### `es_update_remodel_behavior`

Set the narrative behavior description for a Remodel query.

```json
{
  "remodelId": "<remodel id>",
  "behavior": "Returns the order summary for a customer, including line items and totals"
}
```

Returns: `{ success: true }`

---

#### `es_update_remodel_parameters`

Batch-replace all structured query parameters on a Remodel.

```json
{
  "remodelId": "<remodel id>",
  "parameters": [
    { "attrName": "customerId", "type": "UUID" },
    { "attrName": "page", "type": "Integer" }
  ]
}
```

Returns: `{ success: true, count: 2 }`

---

#### `es_update_remodel_return_type`

Set the structured return type spec on a Remodel. `shape` is one of `"object"` / `"array"` / `"primitive"`.

```json
{
  "remodelId": "<remodel id>",
  "returnType": {
    "shape": "object",
    "fields": [
      { "name": "orderId", "type": "UUID", "nullable": false },
      { "name": "status", "type": "String", "nullable": false },
      { "name": "items", "type": "OrderItemDto", "nullable": false, "dtoSpecRef": "<dto note id>" }
    ]
  }
}
```

Returns: `{ success: true }`

---

### Typical Usage Scenarios

#### 1. Define an Aggregate spec (human-authored)

```
1. es_update_aggregate_identity(noteId, name="orderId")
2. es_update_state_properties(noteId, stateProperties=[...])
3. es_add_invariant(noteId, { ..., provenance: "ui", status: "confirmed", source: null })
```

#### 2. AI-infer invariants after analysis (T2 Analyze flow)

```
1. es_add_invariant(noteId, {
     provenance: "assumption",
     status: "needs_review",
     source: { agent: "claude-sonnet-4-6", derivedFrom: [...], inferredAt: "...", rationale: "..." }
   })
```

#### 3. User reviews and confirms an AI-inferred invariant

```
es_set_invariant_status(noteId, invariantId, status="confirmed")
→ provenance automatically promoted from "assumption" to "ui"
```

#### 4. Define DTO fields

```
es_update_dto_fields(noteId, dtoFields=[
  { name: "orderId", type: "UUID" },
  { name: "total", type: "Decimal" }
])
```

#### 5. Structured Remodel definition

```
1. es_update_remodel_behavior(remodelId, behavior="Returns order list for a customer")
2. es_update_remodel_parameters(remodelId, parameters=[{ attrName: "customerId", type: "UUID" }])
3. es_update_remodel_return_type(remodelId, returnType={ shape: "array", fields: [...] })
```
