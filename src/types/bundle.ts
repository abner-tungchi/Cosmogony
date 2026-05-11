/**
 * Spec Bundle — the top-level export format produced by `jsonExporter`.
 *
 * Corresponds to `docs/spec-design.md`. The bundle is a snapshot of a Board
 * expressed in the four spec families AI agents consume for code-gen:
 * Aggregates, UseCases, ReadModels, and DTOs.
 *
 * Distinct from the runtime types in `./elements.ts` — those describe the
 * editing model; these describe the machine-stable export contract.
 */

import type {
  AggregateIdentity,
  DtoField,
  Invariant,
  ReturnTypeSpec,
} from './specs';

// ---------- Shared ----------

/**
 * Property shape used inside spec bodies (`state[]`, `input[]`,
 * `eventPayload[]`, `parameters[]`).
 *
 * Note the field name is `name` (not `attrName` as in the board-level
 * `Property` type). Exporter maps `attrName → name`.
 */
export interface SpecProperty {
  name: string;
  type: string;
  required?: boolean;
  notes?: string;
}

export interface SpecCondition {
  text: string;
  invariantSpecId?: string;
}

/**
 * Target categories a spec link/relationship can point at. Mirrors
 * `ElementType` but adds `ReadModel` for remodels (which aren't sticky notes).
 */
export type SpecLinkTargetType =
  | 'Actor'
  | 'DomainEvent'
  | 'Command'
  | 'Entity'
  | 'Aggregate'
  | 'Policy'
  | 'ExternalSystem'
  | 'ReadModel'
  | 'Dto'
  | 'Hotspot'
  | 'Diamond'
  | 'Information';

/**
 * Minimal link schema shared by `AggregateSpec.relationships`,
 * `UseCaseSpec.links`, `ReadModelSpec.links`.
 *
 * Direction is computed relative to the spec that owns the link:
 * - `outbound` when the owner is the `fromId` of the board link
 * - `inbound`  when the owner is the `toId`
 */
export interface SpecLink {
  direction: 'outbound' | 'inbound';
  targetType: SpecLinkTargetType;
  targetName: string;
  targetSpecId: string;
  label?: string;
}

// ---------- AggregateSpec ----------

export interface AggregateMethodRef {
  useCaseSpecId: string;
  useCase: string;
  emitsEvent: string;
  _suggested_method?: string;
}

export interface AggregateEventRef {
  name: string;
  emittedByUseCaseSpecId: string;
}

export interface AggregateSpec {
  kind: 'AggregateSpec';
  aggregateSpecId: string;
  aggregate: string;
  behavior?: string;
  identity: AggregateIdentity;
  state: SpecProperty[];
  invariants?: Invariant[];
  methods: AggregateMethodRef[];
  relationships?: SpecLink[];
  events: AggregateEventRef[];
  _suggested_aggregateId?: string;
  _suggested_repository?: string;
}

// ---------- UseCaseSpec ----------

export interface UseCaseSpec {
  kind: 'UseCaseSpec';
  useCaseSpecId: string;
  aggregateSpecId?: string;
  useCase: string;
  behavior?: string;
  aggregate?: string;
  paths?: string[];
  // Hoare triple {P} c {Q} ordering (gemini-review-fix): pre → input → post → emittedEvent
  preconditions: SpecCondition[];   // {P}
  input: SpecProperty[];            // c
  postconditions: SpecCondition[];  // {Q}
  emittedEvent: string;
  eventPayload: SpecProperty[];
  links?: SpecLink[];
  _suggested_aggregateId?: string;
  _suggested_method?: string;
  _suggested_domainEvent?: string;
  _suggested_repository?: string;
}

// ---------- ReadModelSpec ----------

export interface ReadModelSpec {
  kind: 'ReadModelSpec';
  readModelSpecId: string;
  queryName: string;
  behavior?: string;
  parameters: SpecProperty[];
  returnType: ReturnTypeSpec;
  links?: SpecLink[];
  _suggested_queryFunction?: string;
}

// ---------- DtoSpec ----------

export interface DtoSpec {
  kind: 'DtoSpec';
  dtoSpecId: string;
  name: string;
  description?: string;
  fields: DtoField[];
}

// ---------- SpecBundle ----------

export interface SpecBundle {
  manifestVersion: 1;
  bundleId: string;
  context: string;
  aggregates: AggregateSpec[];
  useCases: UseCaseSpec[];
  readModels: ReadModelSpec[];
  dtos: DtoSpec[];
}
