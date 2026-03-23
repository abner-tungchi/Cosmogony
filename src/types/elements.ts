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
}

export interface BundleSubNote {
  label: string;
  content: string;
}

export interface Bundle {
  id: string;
  position: { x: number; y: number };
  infoNote: BundleSubNote;
  entityNote: BundleSubNote;
  commandNote: BundleSubNote;
  eventNote: BundleSubNote;
  zIndex: number;
  collapsed?: boolean;
  policies?: Policy[];
  paths?: string[];
  phase?: string;
  trigger?: string;
  uiDescription?: string;
  readModels?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'bundle' | 'remodel';
  toType: 'note' | 'bundle' | 'remodel';
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
  returnTypeNote: BundleSubNote;    // bottom-right: Return type description (renamed from sourceEventNote)

  // Linkage
  linkedBundleIds: string[];        // linked Bundle IDs
  linkedDtoIds: string[];           // linked Dto StickyNote IDs

  // Collapse state
  collapsed?: boolean;              // main card collapse state
  sourceEventsExpanded?: boolean;   // Source Events area expanded (default true by convention)

  // Metadata (consistent with Bundle)
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
