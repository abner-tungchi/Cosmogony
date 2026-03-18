import type { ElementType } from '../types/elements';

export interface ElementConfig {
  type: ElementType;
  label: string;
  color: string;
  textColor: string;
  defaultSize: { width: number; height: number };
}

export const ELEMENT_CONFIGS: Record<ElementType, ElementConfig> = {
  DomainEvent: {
    type: 'DomainEvent',
    label: 'Domain Event',
    color: '#FF8C00',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  Command: {
    type: 'Command',
    label: 'Command',
    color: '#1E88E5',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  Aggregate: {
    type: 'Aggregate',
    label: 'Aggregate',
    color: '#FFD600',
    textColor: '#333333',
    defaultSize: { width: 160, height: 80 },
  },
  Policy: {
    type: 'Policy',
    label: 'Policy',
    color: '#7B1FA2',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  ExternalSystem: {
    type: 'ExternalSystem',
    label: 'External System',
    color: '#EC407A',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  Actor: {
    type: 'Actor',
    label: 'Actor',
    color: '#FFF9C4',
    textColor: '#333333',
    defaultSize: { width: 160, height: 80 },
  },
  ReadModel: {
    type: 'ReadModel',
    label: 'Read Model',
    color: '#43A047',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  Hotspot: {
    type: 'Hotspot',
    label: 'Hotspot',
    color: '#E53935',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 80 },
  },
  Diamond: {
    type: 'Diamond',
    label: 'Diamond',
    color: '#EC407A',
    textColor: '#ffffff',
    defaultSize: { width: 160, height: 160 },
  },
};

export const ELEMENT_TYPE_LIST: ElementType[] = [
  'DomainEvent', 'Command', 'Aggregate', 'Policy',
  'ExternalSystem', 'Actor', 'ReadModel', 'Hotspot', 'Diamond',
];
