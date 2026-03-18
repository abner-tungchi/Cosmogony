export type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot'
  | 'Diamond';

export interface StickyNote {
  id: string;
  type: ElementType;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
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
