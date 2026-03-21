export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot'
  | 'Diamond';

export interface Policy {
  rule: string;
  severity: 'block' | 'warn';
}

export interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
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
  fromType: 'note' | 'bundle';
  toType: 'note' | 'bundle';
  label?: string;
  createdAt: string;
}
