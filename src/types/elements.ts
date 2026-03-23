export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot'
  | 'Diamond' | 'Dto';

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
  information?: Property[];       // Command's input parameters (lives on Command note)
  eventProperties?: Property[];   // Domain Event's output properties (lives on DomainEvent note)
  commandId?: string;             // DomainEvent links to its triggering Command note
  entityId?: string;              // DomainEvent links to its Aggregate note
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
}
