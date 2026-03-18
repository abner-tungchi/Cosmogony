import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ELEMENT_CONFIGS, ELEMENT_TYPE_LIST } from '../../constants/elementTypes';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import type { ElementType, Bundle, BundleSubNote } from '../../types/elements';

interface Props {
  collapsed: boolean;
  onShowExport: () => void;
}

const iconMap: Record<string, string> = {
  DomainEvent: '⚡',
  Command: '📋',
  Aggregate: '📦',
  Policy: '📜',
  ExternalSystem: '🔌',
  Actor: '👤',
  ReadModel: '📊',
  Hotspot: '❓',
  Diamond: '◆',
};

export const SidebarPalette: React.FC<Props> = ({ collapsed, onShowExport }) => {
  const {
    activeToolType, setActiveToolType,
    zoom, setZoom, resetView,
    isLinkingMode, setLinkingMode,
    selectedNoteIds, setSelectedNoteIds,
  } = useUIStore();
  const { addBundle, deleteNote } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);

  const handleBundleSelected = () => {
    const selectedNotes = activeBoard.notes.filter((n) => selectedNoteIds.includes(n.id));
    if (selectedNotes.length < 2) return;

    // Map by type: Aggregate→info, Command→command, DomainEvent→event, others→entity
    const toSubNote = (n: typeof selectedNotes[0] | undefined): BundleSubNote =>
      n ? { label: n.label, content: '' } : { label: '', content: '' };

    const aggregate = selectedNotes.find((n) => n.type === 'Aggregate');
    const command = selectedNotes.find((n) => n.type === 'Command');
    const event = selectedNotes.find((n) => n.type === 'DomainEvent');
    const entityCandidates = selectedNotes.filter(
      (n) => n !== aggregate && n !== command && n !== event
    );
    const entity = entityCandidates[0];

    const usedIds = [aggregate?.id, command?.id, event?.id, entity?.id].filter(Boolean) as string[];

    const avgX = selectedNotes.reduce((s, n) => s + n.position.x, 0) / selectedNotes.length;
    const avgY = selectedNotes.reduce((s, n) => s + n.position.y, 0) / selectedNotes.length;

    const newBundle: Bundle = {
      id: uuidv4(),
      position: { x: avgX - (160 * 3 + 8 * 2) / 2, y: avgY - (120 * 2 + 8) / 2 },
      infoNote: toSubNote(aggregate),
      entityNote: toSubNote(entity),
      commandNote: toSubNote(command),
      eventNote: toSubNote(event),
      zIndex: 10 + activeBoard.bundles.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addBundle(newBundle);
    usedIds.forEach((id) => deleteNote(id));
    setSelectedNoteIds([]);
  };

  const handleToolClick = (type: string) => {
    if (type === 'Link') {
      setLinkingMode(!isLinkingMode);
      setActiveToolType(null);
    } else {
      setLinkingMode(false);
      setActiveToolType(activeToolType === type ? null : type);
    }
  };

  const sectionLabel = (text: string) =>
    !collapsed && (
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#64748b',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '12px 12px 4px',
      }}>
        {text}
      </div>
    );

  const toolBtn = (type: string, label: string, color?: string) => {
    const isActive = type === 'Link' ? isLinkingMode : activeToolType === type;
    return (
      <button
        key={type}
        onClick={() => handleToolClick(type)}
        title={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '8px 12px',
          margin: '2px 8px',
          borderRadius: 8,
          border: isActive ? '2px solid #3b82f6' : '2px solid transparent',
          background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontSize: 13,
          width: collapsed ? '100%' : 'calc(100% - 16px)',
          boxSizing: 'border-box',
          transition: 'background 0.15s, border 0.15s',
        }}
      >
        {color ? (
          <span style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: type === 'Diamond' ? 0 : 3,
            backgroundColor: color,
            flexShrink: 0,
            transform: type === 'Diamond' ? 'rotate(45deg)' : undefined,
          }} />
        ) : (
          <span style={{ fontSize: 16 }}>{iconMap[type] || '●'}</span>
        )}
        {!collapsed && <span>{label}</span>}
      </button>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      {sectionLabel('Elements')}

      {/* Bundle special button */}
      <button
        onClick={() => handleToolClick('Bundle')}
        title="Bundle (4-in-1)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '8px 12px',
          margin: '2px 8px',
          borderRadius: 8,
          border: activeToolType === 'Bundle' ? '2px solid #3b82f6' : '2px solid #334155',
          background: activeToolType === 'Bundle' ? 'rgba(59,130,246,0.15)' : '#1e293b',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontSize: 13,
          width: collapsed ? '100%' : 'calc(100% - 16px)',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 16 }}>⊞</span>
        {!collapsed && <span style={{ fontWeight: 600 }}>Bundle (4-in-1)</span>}
      </button>

      {/* All element types */}
      {ELEMENT_TYPE_LIST.map((type: ElementType) => {
        const config = ELEMENT_CONFIGS[type];
        return toolBtn(type, config.label, config.color);
      })}

      {sectionLabel('Tools')}

      {/* Bundle selected notes */}
      {selectedNoteIds.length >= 2 && (
        <button
          onClick={handleBundleSelected}
          title={`Bundle ${selectedNoteIds.length} selected notes`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 8,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '8px 12px',
            margin: '2px 8px',
            borderRadius: 8,
            border: '2px solid #f59e0b',
            background: 'rgba(245,158,11,0.15)',
            cursor: 'pointer',
            color: '#fbbf24',
            fontSize: 13,
            width: collapsed ? '100%' : 'calc(100% - 16px)',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: 16 }}>⊞</span>
          {!collapsed && <span>Bundle Selected ({selectedNoteIds.length})</span>}
        </button>
      )}

      {/* Link tool */}
      <button
        onClick={() => handleToolClick('Link')}
        title="Link Mode"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '8px 12px',
          margin: '2px 8px',
          borderRadius: 8,
          border: isLinkingMode ? '2px solid #22c55e' : '2px solid transparent',
          background: isLinkingMode ? 'rgba(34,197,94,0.15)' : 'transparent',
          cursor: 'pointer',
          color: isLinkingMode ? '#22c55e' : '#e2e8f0',
          fontSize: 13,
          width: collapsed ? '100%' : 'calc(100% - 16px)',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 16 }}>→</span>
        {!collapsed && <span>{isLinkingMode ? 'Link Mode (ON)' : 'Link Mode'}</span>}
      </button>

      {sectionLabel('Board')}

      {/* Zoom controls */}
      {!collapsed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px' }}>
          <button onClick={() => setZoom(zoom - 0.1)} style={smallBtn}>−</button>
          <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(zoom + 0.1)} style={smallBtn}>+</button>
          <button onClick={resetView} style={{ ...smallBtn, marginLeft: 4 }} title="Reset view">⌂</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0' }}>
          <button onClick={() => setZoom(zoom - 0.1)} style={smallBtn} title="Zoom out">−</button>
          <button onClick={resetView} style={smallBtn} title="Reset view">⌂</button>
          <button onClick={() => setZoom(zoom + 0.1)} style={smallBtn} title="Zoom in">+</button>
        </div>
      )}

      {/* Export */}
      <button
        onClick={onShowExport}
        title="Export Markdown"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '8px 12px',
          margin: '4px 8px 8px',
          borderRadius: 8,
          border: 'none',
          background: '#0f766e',
          cursor: 'pointer',
          color: '#fff',
          fontSize: 13,
          width: collapsed ? '100%' : 'calc(100% - 16px)',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 16 }}>📤</span>
        {!collapsed && <span>Export Markdown</span>}
      </button>
    </div>
  );
};

const smallBtn: React.CSSProperties = {
  background: '#334155',
  border: '1px solid #475569',
  borderRadius: 4,
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '3px 8px',
  fontSize: 14,
};
