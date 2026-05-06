/**
 * Spec Bundle 相關型別定義
 * 對應 docs/spec-design.md
 */

// ---------- Invariant ----------

export interface InvariantRule {
  when: string;        // "always" / "never" / "<field> <op> <value>"
  rule: string;        // natural language statement or expression
}

export interface InvariantSource {
  agent: string;
  derivedFrom: string[];
  inferredAt: string;       // ISO timestamp
  rationale: string;
}

export interface Invariant {
  id: string;
  name: string;             // camelCase, e.g. "checkCancellable"
  title: string;            // human-readable, e.g. "已出貨不可取消"
  applicability?: string;
  rules: InvariantRule[];
  errorCode: string;        // camelCase, e.g. "orderAlreadyShipped"
  relatedState?: string[];  // references Property.attrName
  provenance: 'ui' | 'assumption';
  status: 'confirmed' | 'needs_review' | 'rejected';
  source?: InvariantSource | null;
}

// ---------- Aggregate ----------

export interface AggregateIdentity {
  name: string;               // e.g. "orderId"
  _suggested_type?: string;   // e.g. "OrderId"
  _suggested_field?: string;  // e.g. "orderId"
}

// ---------- Dto ----------

export interface DtoField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;        // reference to another Dto note id
}

// ---------- Remodel Return Type ----------

export interface ReturnTypeField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;        // reference to Dto note id
}

export interface ReturnTypeSpec {
  shape: 'object' | 'array' | 'primitive';
  fields: ReturnTypeField[];
}

// ---------- Policy ----------

/**
 * Describes the DomainEvent that triggers this Policy.
 * Initial enum: only 'DomainEvent'. May expand later (TimeTrigger / ExternalSystem).
 * `name` is the user-authored canonical display name.
 * `noteRef` is an optional graph link to a DomainEvent note on the active board.
 */
export interface PolicyTrigger {
  type: 'DomainEvent';
  name: string;
  noteRef?: string;
}

/**
 * Describes a Command issued by this Policy.
 * Initial enum: only 'Command'. `targetAggregate` is the aggregate this command
 * targets, with optional `targetAggregateRef` graph link.
 */
export interface PolicyIssue {
  type: 'Command';
  name: string;
  noteRef?: string;
  targetAggregate?: string;
  targetAggregateRef?: string;
}
