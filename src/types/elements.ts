import type {
  Invariant,
  AggregateIdentity,
  DtoField,
  ReturnTypeSpec,
  PolicyTrigger,
  PolicyIssue,
} from './specs';

export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot'
  | 'Diamond' | 'Dto'
  | 'Information' | 'Entity';

export interface Policy {
  rule: string;
  severity: 'block' | 'warn';
}

export interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
  actorId?: string;
}

export interface TextFormat {
  fontSize?: number;   // e.g. 13 (default)
  color?: string;      // text color override, e.g. '#1e293b'
  bold?: boolean;
  italic?: boolean;
}

export interface Property {
  attrName: string;
  type: string;
  // Optional structural link to a Dto note. Only used by "input" editors
  // (Command information, Remodel parameters); other Property editors
  // (Aggregate state, DomainEvent eventProperties) ignore this field.
  // Display follows the same dtoDerived invariant as DtoField: when set
  // and resolvable, the DTO label takes precedence over the raw `type`.
  dtoSpecRef?: string;
}

/**
 * 一條 Command 的 pre/post condition。dogfood 階段以自然語言文字為主；
 * preCondition 可選擇連結 Aggregate invariant 做 traceability。
 */
export interface CommandCondition {
  id: string;                 // 穩定 uuid，給 diff / cross-ref 用
  text: string;               // 自然語言描述（中英文皆可）
  invariantId?: string;       // 只 pre 用 — 連結同 board 上的 Aggregate invariant id
  _brokenInvariantLink?: {    // soft-null：cascade delete 時保留歷史軌跡
    previousId: string;
    deletedAt: string;        // ISO8601
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
  textFormat?: TextFormat;
  createdAt: string;
  updatedAt: string;
  // DomainEvent-centric fields
  behavior?: string;              // DomainEvent's behavior description (e.g. "Delete a product")
  information?: Property[];       // Command's input parameters (lives on Command note)
  eventProperties?: Property[];   // Domain Event's output properties (lives on DomainEvent note)
  commandId?: string;             // DomainEvent links to its triggering Command note
  entityId?: string;              // DomainEvent links to its Entity note
  // Visual group fields
  groupEventId?: string;              // Information/Command/Entity → their parent DomainEvent id
  informationForCommandId?: string;   // Information note → which Command it serves
  aggregateRootId?: string;           // Entity note → which AggregateRoot it belongs to (legacy, kept for backward compat)
  isAggregateRoot?: boolean;          // Entity is designated as Aggregate Root
  linkedAggregateNoteId?: string;     // id of the auto-created Aggregate note linked to this Entity
  groupCollapsed?: boolean;           // DomainEvent: whether its group is collapsed (satellites hidden)

  // --- Aggregate-specific ---
  aggregateIdentity?: AggregateIdentity;
  stateProperties?: Property[];
  invariants?: Invariant[];

  // --- Dto-specific ---
  dtoFields?: DtoField[];

  // --- Policy-specific ---
  policyTrigger?: PolicyTrigger;
  policyIssues?: PolicyIssue[];

  // --- Command-specific ---
  preConditions?: CommandCondition[];
  postConditions?: CommandCondition[];
}

// BundleSubNote kept only for Remodel compatibility
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

  // Four sub-notes (reusing BundleSubNote, different semantics)
  aggregateNote: BundleSubNote;     // top: Aggregate (read perspective)
  parameterNote: BundleSubNote;     // bottom-left: Query parameters
  queryNote: BundleSubNote;         // bottom-center: Query name
  returnTypeNote: BundleSubNote;    // bottom-right: Return type description

  // Linkage
  linkedBundleIds: string[];        // kept for backward compat but semantically maps to linked note IDs post-migration
  linkedDtoIds: string[];           // linked Dto StickyNote IDs

  // Collapse state
  collapsed?: boolean;
  collapsedSize?: { width: number; height: number };
  sourceEventsExpanded?: boolean;

  // Metadata
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  linkedActorId?: string;
  createdAt: string;
  updatedAt: string;

  // --- Structured spec data ---
  // Semantically, parameterNote / queryNote / returnTypeNote will gradually
  // become display-only (derived from the structured fields below by the UI).
  // Converting the existing BundleSubNote fields is out of scope for this task.
  behavior?: string;
  parameters?: Property[];
  returnType?: ReturnTypeSpec;
}
