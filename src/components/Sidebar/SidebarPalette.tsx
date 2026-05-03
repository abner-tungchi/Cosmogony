import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ELEMENT_CONFIGS, PALETTE_TYPE_LIST } from '../../constants/elementTypes';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import type { ElementType, StickyNote as StickyNoteType, Remodel } from '../../types/elements';

interface Props {
  collapsed: boolean;
  onShowExport: () => void;
  currentView: 'home' | 'board';
}

const iconMap: Record<string, string> = {
  DomainEvent: '⚡',
  Command: '📋',
  Aggregate: '📦',
  AggregateRoot: '◈',
  Policy: '📜',
  ExternalSystem: '🔌',
  Actor: '👤',
  ReadModel: '📊',
  Hotspot: '❓',
  Diamond: '◆',
  Dto: '{}',
};

export const SidebarPalette: React.FC<Props> = ({ collapsed, onShowExport, currentView }) => {
  const {
    zoom, panX, panY, setZoom, resetView, fitAll,
    isLinkingMode, setLinkingMode,
    setCurrentView,
    setSelectedNoteIds, setSelectedElement,
  } = useUIStore();
  const { addBoard, renameBoard, openBoard, project, addNote, addRemodel } = useBoardStore();
  const activeBoard = useActiveBoard();

  // Compute canvas center position based on current viewport, pan, and zoom
  const getViewportCenter = () => {
    const viewport = document.getElementById('board-canvas-viewport');
    const rect = viewport?.getBoundingClientRect();
    const vpWidth = rect?.width ?? window.innerWidth;
    const vpHeight = rect?.height ?? window.innerHeight;
    return {
      x: (vpWidth / 2 - panX) / zoom,
      y: (vpHeight / 2 - panY) / zoom,
    };
  };

  const handleToolClick = (type: string) => {
    if (type === 'Link') {
      setLinkingMode(!isLinkingMode);
      return;
    }

    setLinkingMode(false);

    // Special: Remodel — create directly at canvas center
    if (type === 'Remodel') {
      const center = getViewportCenter();
      const newRemodel: Remodel = {
        id: uuidv4(),
        position: {
          x: center.x - (160 * 3 + 8 * 2) / 2,
          y: center.y - (120 * 2 + 8) / 2,
        },
        aggregateNote: { label: '', content: '' },
        parameterNote: { label: '', content: '' },
        queryNote: { label: '', content: '' },
        returnTypeNote: { label: '', content: '' },
        linkedBundleIds: [],
        linkedDtoIds: [],
        zIndex: 10 + activeBoard.remodels.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addRemodel(newRemodel);
      return;
    }

    // All StickyNote types — create directly at canvas center
    const config = ELEMENT_CONFIGS[type as keyof typeof ELEMENT_CONFIGS];
    if (!config) return;

    const center = getViewportCenter();
    const DEFAULT_DTO_LABEL = '[DtoName]\n----------\nfield: Type';
    const noteLabel = type === 'Dto' ? DEFAULT_DTO_LABEL : config.label;

    const newNote: StickyNoteType = {
      id: uuidv4(),
      type: type as StickyNoteType['type'],
      label: noteLabel,
      position: {
        x: center.x - config.defaultSize.width / 2,
        y: center.y - config.defaultSize.height / 2,
      },
      size: config.defaultSize,
      zIndex: 10 + activeBoard.notes.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addNote(newNote);
    setSelectedNoteIds([newNote.id]);
    setSelectedElement(newNote.id, 'note');
  };

  const handleFitAll = () => {
    const viewport = document.getElementById('board-canvas-viewport');
    const rect = viewport?.getBoundingClientRect();
    fitAll({
      notes: activeBoard.notes,
      remodels: activeBoard.remodels,
      viewportWidth: rect?.width ?? window.innerWidth,
      viewportHeight: rect?.height ?? window.innerHeight,
    });
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
    const isActive = type === 'Link' ? isLinkingMode : false;
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

  // ── Homepage sidebar ────────────────────────────────────────────────────────
  if (currentView === 'home') {
    // ── helpers ──
    const contextBoards = project.boards.filter((b) => !b.parentContextId);

    const getHealth = (board: typeof project.boards[0]): 'green' | 'yellow' | 'red' => {
      if (board.notes.length === 0) return 'red';
      if (board.links.length === 0) return 'yellow';
      return 'green';
    };

    const HEALTH_DOT: Record<'green' | 'yellow' | 'red', { color: string; title: string }> = {
      green:  { color: '#22c55e', title: 'Complete (has notes + links)' },
      yellow: { color: '#f59e0b', title: 'In progress (no links yet)' },
      red:    { color: '#ef4444', title: 'Empty' },
    };

    const worstHealth = (): 'green' | 'yellow' | 'red' => {
      const healths = contextBoards.map(getHealth);
      if (healths.includes('red'))    return 'red';
      if (healths.includes('yellow')) return 'yellow';
      return 'green';
    };

    // Notes type distribution across all boards (include actor sub-boards in totals)
    const noteTypeCounts: Partial<Record<ElementType, number>> = {};
    for (const board of project.boards) {
      for (const note of board.notes) {
        noteTypeCounts[note.type] = (noteTypeCounts[note.type] ?? 0) + 1;
      }
    }
    const totalNotes = Object.values(noteTypeCounts).reduce((s, n) => s + n, 0);
    const totalEvents = project.boards.reduce(
      (s, b) => s + b.notes.filter((n) => n.type === 'DomainEvent').length,
      0
    );

    // Top types for bar + legend (sorted by count desc)
    const sortedTypes = (Object.entries(noteTypeCounts) as [ElementType, number][])
      .sort((a, b) => b[1] - a[1]);

    const handleNew = () => {
      const id = addBoard('New Context');
      renameBoard(id, 'New Context');
      setCurrentView('board');
    };

    const handleOpenContext = (id: string) => {
      openBoard(id);
      setCurrentView('board');
    };

    // ── collapsed view ──
    if (collapsed) {
      const dot = HEALTH_DOT[worstHealth()];
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 4 }}>
          <div title={`${contextBoards.length} contexts`} style={{ color: '#94a3b8', fontSize: 13, padding: '6px 0' }}>⊡</div>
          <div title={dot.title} style={{ width: 10, height: 10, borderRadius: '50%', background: dot.color, margin: '2px auto' }} />
          <div title={`${totalNotes} notes`} style={{ color: '#94a3b8', fontSize: 13, padding: '6px 0' }}>📝</div>
          <div title={`${totalEvents} domain events`} style={{ color: '#94a3b8', fontSize: 13, padding: '6px 0' }}>⚡</div>
          <div style={{ flex: 1 }} />
          <button onClick={onShowExport} title="Export Markdown"
            style={{ background: '#0f766e', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 16, padding: '10px 0', width: '100%' }}>
            📤
          </button>
        </div>
      );
    }

    // ── expanded view ──
    return (
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── Contexts ── */}
        {sectionLabel('Contexts')}

        {contextBoards.map((board) => {
          const h = getHealth(board);
          const dot = HEALTH_DOT[h];
          return (
            <button
              key={board.id}
              onClick={() => handleOpenContext(board.id)}
              title={dot.title}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', margin: '1px 0',
                background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#e2e8f0',
                fontSize: 13, textAlign: 'left', width: '100%',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* health dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color, flexShrink: 0 }} />
              {/* name */}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {board.name}
              </span>
              {/* counts */}
              {board.notes.length > 0 && (
                <span style={{ display: 'flex', gap: 6, color: '#64748b', fontSize: 11, flexShrink: 0 }}>
                  <span>📝{board.notes.length}</span>
                </span>
              )}
            </button>
          );
        })}

        {/* New Context */}
        <button
          onClick={handleNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', margin: '4px 0 8px',
            background: 'transparent', border: '1px dashed #334155',
            cursor: 'pointer', color: '#64748b',
            fontSize: 12, borderRadius: 6, width: 'calc(100% - 0px)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.color = '#3b82f6'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
        >
          <span>＋</span>
          <span>New Context</span>
        </button>

        {/* ── Notes ── */}
        {sectionLabel('Notes')}
        <div style={{ padding: '0 12px 8px' }}>
          {/* total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>Total</span>
            <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{totalNotes}</span>
          </div>
          {/* color bar */}
          {totalNotes > 0 ? (
            <>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                {sortedTypes.filter(([type]) => !!ELEMENT_CONFIGS[type]).map(([type, count]) => (
                  <div
                    key={type}
                    title={`${ELEMENT_CONFIGS[type].label}: ${count}`}
                    style={{
                      width: `${(count / totalNotes) * 100}%`,
                      background: ELEMENT_CONFIGS[type].color,
                      minWidth: count > 0 ? 2 : 0,
                    }}
                  />
                ))}
              </div>
              {/* legend — top 4 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
                {sortedTypes.filter(([type]) => !!ELEMENT_CONFIGS[type]).slice(0, 4).map(([type, count]) => (
                  <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ELEMENT_CONFIGS[type].color, display: 'inline-block', flexShrink: 0 }} />
                    {count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 8, borderRadius: 4, background: '#334155' }} />
          )}
        </div>

        {/* ── Events ── */}
        {sectionLabel('Domain Events')}
        <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>across all contexts</span>
          <span style={{ color: '#fb923c', fontSize: 13, fontWeight: 700 }}>{totalEvents}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* ── Export ── */}
        <button
          onClick={onShowExport}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', margin: '4px 8px 8px',
            borderRadius: 8, border: 'none',
            background: '#0f766e', cursor: 'pointer',
            color: '#fff', fontSize: 13, fontWeight: 600,
            width: 'calc(100% - 16px)', boxSizing: 'border-box' as const,
          }}
        >
          <span>📤</span>
          <span>Export Markdown</span>
        </button>
      </div>
    );
  }

  // ── Board sidebar ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      {sectionLabel('Elements')}

      {/* Remodel special button */}
      <button
        onClick={() => handleToolClick('Remodel')}
        title="Read Model"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '8px 12px',
          margin: '2px 8px',
          borderRadius: 8,
          border: '2px solid #334155',
          background: '#1e293b',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontSize: 13,
          width: collapsed ? '100%' : 'calc(100% - 16px)',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 16 }}>⊟</span>
        {!collapsed && <span style={{ fontWeight: 600 }}>Read Model</span>}
      </button>

      {/* All palette element types — excludes ReadModel (replaced by Remodel), Aggregate (legacy), Entity (created via DomainEvent), Information (created via Command) */}
      {PALETTE_TYPE_LIST.filter((t) => t !== 'ReadModel').map((type: ElementType) => {
        const config = ELEMENT_CONFIGS[type];
        return toolBtn(type, config.label, config.color);
      })}

      {sectionLabel('Tools')}

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
          <button onClick={handleFitAll} style={{ ...smallBtn, marginLeft: 2 }} title="Fit All (F)">⊡</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0' }}>
          <button onClick={() => setZoom(zoom - 0.1)} style={smallBtn} title="Zoom out">−</button>
          <button onClick={resetView} style={smallBtn} title="Reset view">⌂</button>
          <button onClick={handleFitAll} style={smallBtn} title="Fit All (F)">⊡</button>
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
