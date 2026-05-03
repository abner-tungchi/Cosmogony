import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import { useUIStore } from '../../store/uiStore';
import type { FlowPath } from '../../types/elements';
import { PathModal } from './PathModal';

type ContextMenuState =
  | { open: false }
  | { open: true; pathId: string; x: number; y: number; confirmingDelete: boolean };

export const PathBar: React.FC = () => {
  const activeBoard = useActiveBoard();
  const { addFlowPath, updateFlowPath, deleteFlowPath, addActorBoard, setActiveBoard, renameBoard, deleteBoard } =
    useBoardStore();
  const project = useBoardStore((s) => s.project);
  const activeBoardId = useUIStore((s) => s.activeBoardId);
  const { activePath, setActivePath, activeActorFilter } = useUIStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPath, setEditingPath] = useState<FlowPath | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false });
  const [actorDropdownOpen, setActorDropdownOpen] = useState(false);
  const [actorDropdownPos, setActorDropdownPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [renamingActorId, setRenamingActorId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteActorId, setConfirmDeleteActorId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const actorDropdownRef = useRef<HTMLDivElement>(null);
  const actorButtonRef = useRef<HTMLButtonElement>(null);

  // Actor notes on current board — passed to PathModal
  const actorNotes = useMemo(
    () => activeBoard.notes.filter((n) => n.type === 'Actor'),
    [activeBoard.notes],
  );

  // Active context: if current board is an actor sub-board, use its parentContextId; else use its own id
  const currentContextId = useMemo(() => {
    const active = project.boards.find((b) => b.id === activeBoardId);
    return active?.parentContextId ?? active?.id ?? null;
  }, [project.boards, activeBoardId]);

  // Actor sub-boards under the current context
  const actorSubBoards = useMemo(() => {
    if (!currentContextId) return [];
    return project.boards.filter((b) => b.parentContextId === currentContextId);
  }, [project.boards, currentContextId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu.open) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ open: false });
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu.open]);

  // Close actor dropdown on outside click (exclude both the dropdown and the trigger button)
  useEffect(() => {
    if (!actorDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDropdown =
        actorDropdownRef.current && actorDropdownRef.current.contains(target);
      const insideButton = actorButtonRef.current && actorButtonRef.current.contains(target);
      if (!insideDropdown && !insideButton) {
        setActorDropdownOpen(false);
        setActorDropdownPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [actorDropdownOpen]);

  // If activePath no longer exists in flowPaths, reset to null
  useEffect(() => {
    if (activePath && !activeBoard.flowPaths.some((fp) => fp.id === activePath)) {
      setActivePath(null);
    }
  }, [activeBoard.flowPaths, activePath, setActivePath]);

  // Filtered paths based on active actor filter
  const filteredPaths = useMemo<FlowPath[]>(() => {
    if (!activeActorFilter) return activeBoard.flowPaths;
    return activeBoard.flowPaths.filter(
      (fp) => fp.actorId === activeActorFilter || !fp.actorId,
    );
  }, [activeBoard.flowPaths, activeActorFilter]);

  const pathCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const fp of activeBoard.flowPaths) {
      const noteCount = activeBoard.notes.filter((n) => n.paths?.includes(fp.id)).length;
      counts[fp.id] = noteCount;
    }
    return counts;
  }, [activeBoard.flowPaths, activeBoard.notes]);

  const handleCreatePath = useCallback(
    (data: Omit<FlowPath, 'id'>) => {
      addFlowPath({ id: uuidv4(), ...data });
      setShowCreateModal(false);
    },
    [addFlowPath],
  );

  const handleEditPath = useCallback(
    (data: Omit<FlowPath, 'id'>) => {
      if (!editingPath) return;
      updateFlowPath(editingPath.id, data);
      setEditingPath(null);
    },
    [editingPath, updateFlowPath],
  );

  const handleDeletePath = useCallback(
    (id: string) => {
      deleteFlowPath(id);
      if (activePath === id) setActivePath(null);
      setContextMenu({ open: false });
    },
    [deleteFlowPath, activePath, setActivePath],
  );

  const handleTabRightClick = (e: React.MouseEvent, pathId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ open: true, pathId, x: e.clientX, y: e.clientY, confirmingDelete: false });
  };

  const handlePathTabHover = (
    e: React.MouseEvent<HTMLButtonElement>,
    path: FlowPath,
    isActive: boolean,
    entering: boolean,
  ) => {
    if (isActive) return;
    const btn = e.currentTarget;
    if (entering) {
      btn.style.background = `${path.color}1f`; // ~12% opacity hex
      btn.style.borderColor = `${path.color}66`; // ~40% opacity hex
      btn.style.color = path.color;
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'rgba(0,0,0,0.08)';
      btn.style.color = '#64748b';
    }
  };

  // selectedActorLabel reserved for future multi-actor feature
  // const selectedActorLabel = ...

  return (
    <>
      <div
        style={{
          height: 44,
          background: '#ffffff',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 16px',
          overflowX: 'auto',
          flexShrink: 0,
          zIndex: 10,
          scrollbarWidth: 'none',
        }}
      >
        {/* "PATH" label */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginRight: 4,
            flexShrink: 0,
          }}
        >
          PATH
        </span>

        {/* Actor filter hidden — reserved for future multi-actor feature */}

        {/* "All" tab */}
        <button
          onClick={() => setActivePath(null)}
          style={{
            height: 28,
            padding: '0 12px',
            borderRadius: 14,
            fontSize: 11,
            fontWeight: activePath === null ? 700 : 500,
            background: activePath === null ? 'rgba(0,0,0,0.08)' : 'transparent',
            color: activePath === null ? '#1e293b' : '#64748b',
            border: '1px solid transparent',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 150ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          All
        </button>

        {/* Path tabs — filtered by activeActorFilter */}
        {filteredPaths.map((path) => {
          const isActive = activePath === path.id;
          const count = pathCounts[path.id] ?? 0;
          return (
            <button
              key={path.id}
              onClick={() => setActivePath(isActive ? null : path.id)}
              onContextMenu={(e) => handleTabRightClick(e, path.id)}
              onMouseEnter={(e) => handlePathTabHover(e, path, isActive, true)}
              onMouseLeave={(e) => handlePathTabHover(e, path, isActive, false)}
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 14,
                fontSize: 11,
                fontWeight: isActive ? 600 : 500,
                background: isActive ? path.color : 'transparent',
                color: isActive ? '#ffffff' : '#64748b',
                border: `1px solid ${isActive ? 'transparent' : 'rgba(0,0,0,0.08)'}`,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isActive ? 'rgba(255,255,255,0.7)' : path.color,
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              {path.name}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    opacity: isActive ? 0.8 : 0.55,
                    fontWeight: 500,
                    marginLeft: 2,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Add path button */}
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 14,
            border: '1px dashed rgba(0,0,0,0.15)',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 150ms ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.color = '#3b82f6';
            e.currentTarget.style.background = 'rgba(59,130,246,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          + New Path
        </button>
      </div>

      {/* Actor dropdown — hidden, reserved for future multi-actor feature */}
      {false && actorDropdownOpen && actorDropdownPos != null && (
        <div
          ref={actorDropdownRef}
          style={{
            position: 'fixed',
            top: actorDropdownPos!.top,
            left: actorDropdownPos!.left,
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 99999,
            minWidth: 200,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {/* "All Actors" option — navigates back to the parent context board */}
          <button
            onClick={() => {
              if (currentContextId) setActiveBoard(currentContextId);
              setActorDropdownOpen(false);
              setActorDropdownPos(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: activeBoardId === currentContextId ? 'rgba(59,130,246,0.06)' : 'transparent',
              textAlign: 'left',
              fontSize: 12,
              color: activeBoardId === currentContextId ? '#3b82f6' : '#1e293b',
              fontWeight: activeBoardId === currentContextId ? 600 : 400,
              cursor: 'pointer',
              transition: 'background 100ms ease',
            }}
            onMouseEnter={(e) => {
              if (activeBoardId !== currentContextId) e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              if (activeBoardId !== currentContextId) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: 12 }}>👤</span>
            All Actors
          </button>

          {actorSubBoards.length > 0 && (
            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 8px' }} />
          )}

          {/* Actor sub-board list */}
          {actorSubBoards.map((actorBoard) => {
            const isSelected = actorBoard.id === activeBoardId;
            const isRenaming = renamingActorId === actorBoard.id;
            const isConfirmingDelete = confirmDeleteActorId === actorBoard.id;

            if (isConfirmingDelete) {
              return (
                <div key={actorBoard.id} style={{ padding: '8px 12px', background: '#fff5f5' }}>
                  <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>
                    Delete "{actorBoard.name}"?
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setConfirmDeleteActorId(null)}
                      style={{ flex: 1, padding: '4px 0', border: '1px solid #e2e8f0', borderRadius: 4, background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
                    >Cancel</button>
                    <button
                      onClick={() => {
                        deleteBoard(actorBoard.id);
                        setConfirmDeleteActorId(null);
                      }}
                      style={{ flex: 1, padding: '4px 0', border: 'none', borderRadius: 4, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >Delete</button>
                  </div>
                </div>
              );
            }

            if (isRenaming) {
              return (
                <div key={actorBoard.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}>
                  <span style={{ fontSize: 12 }}>👤</span>
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameBoard(actorBoard.id, renameValue.trim() || actorBoard.name);
                        setRenamingActorId(null);
                      }
                      if (e.key === 'Escape') setRenamingActorId(null);
                      e.stopPropagation();
                    }}
                    onBlur={() => {
                      renameBoard(actorBoard.id, renameValue.trim() || actorBoard.name);
                      setRenamingActorId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, fontSize: 12, padding: '3px 6px', border: '1px solid #3b82f6', borderRadius: 4, outline: 'none', color: '#1e293b' }}
                    autoFocus
                  />
                </div>
              );
            }

            return (
              <div
                key={actorBoard.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 0 12px', background: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent' }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <button
                  onClick={() => { setActiveBoard(actorBoard.id); setActorDropdownOpen(false); setActorDropdownPos(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, padding: '8px 0', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 12, color: isSelected ? '#3b82f6' : '#1e293b', fontWeight: isSelected ? 600 : 400, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12 }}>👤</span>
                  <span style={{ flex: 1 }}>{actorBoard.name}</span>
                </button>
                {/* Rename button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setRenameValue(actorBoard.name); setRenamingActorId(actorBoard.id); setConfirmDeleteActorId(null); setTimeout(() => renameInputRef.current?.focus(), 0); }}
                  title="Rename"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: '4px', borderRadius: 3, lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none'; }}
                >✎</button>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteActorId(actorBoard.id); setRenamingActorId(null); }}
                  title="Delete"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: '4px', borderRadius: 3, lineHeight: 1, flexShrink: 0, marginRight: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none'; }}
                >×</button>
              </div>
            );
          })}

          {/* "+ New Actor Board" button */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '4px 8px' }} />
          <button
            onClick={() => {
              if (currentContextId) addActorBoard(currentContextId, 'New Actor');
              setActorDropdownOpen(false);
              setActorDropdownPos(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: 'calc(100% - 16px)',
              padding: '8px 12px',
              border: '1px dashed rgba(0,0,0,0.15)',
              borderRadius: 6,
              margin: '4px 8px',
              background: 'transparent',
              textAlign: 'left',
              fontSize: 12,
              color: '#94a3b8',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.color = '#3b82f6';
              e.currentTarget.style.background = 'rgba(59,130,246,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            + New Actor Board
          </button>
          <div style={{ height: 4 }} />
        </div>
      )}

      {/* Context menu for path tab right-click */}
      {contextMenu.open && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 9500,
            minWidth: 160,
            overflow: 'hidden',
          }}
        >
          {contextMenu.confirmingDelete ? (
            <div style={{ padding: '12px 14px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                Delete this path?
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: '#64748b' }}>
                Cards assigned to this path will not be deleted.
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setContextMenu({ open: false })}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePath(contextMenu.pathId)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    border: 'none',
                    borderRadius: 6,
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  const path = activeBoard.flowPaths.find((fp) => fp.id === contextMenu.pathId);
                  if (path) setEditingPath(path);
                  setContextMenu({ open: false });
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontSize: 13,
                  color: '#1e293b',
                  cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Edit
              </button>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 8px' }} />
              <button
                onClick={() =>
                  setContextMenu((prev) =>
                    prev.open ? { ...prev, confirmingDelete: true } : prev,
                  )
                }
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontSize: 13,
                  color: '#ef4444',
                  cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <PathModal
          mode="create"
          actorNotes={actorNotes}
          onConfirm={handleCreatePath}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit Modal */}
      {editingPath && (
        <PathModal
          mode="edit"
          initialData={editingPath}
          actorNotes={actorNotes}
          onConfirm={handleEditPath}
          onCancel={() => setEditingPath(null)}
        />
      )}
    </>
  );
};
