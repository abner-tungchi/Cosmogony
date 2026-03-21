import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { FlowPath } from '../../types/elements';
import { PathModal } from './PathModal';

type ContextMenuState =
  | { open: false }
  | { open: true; pathId: string; x: number; y: number; confirmingDelete: boolean };

export const PathBar: React.FC = () => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const { addFlowPath, updateFlowPath, deleteFlowPath } = useBoardStore();
  const { activePath, setActivePath } = useUIStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPath, setEditingPath] = useState<FlowPath | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false });
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  // If activePath no longer exists in flowPaths, reset to null
  useEffect(() => {
    if (activePath && !activeBoard.flowPaths.some((fp) => fp.id === activePath)) {
      setActivePath(null);
    }
  }, [activeBoard.flowPaths, activePath, setActivePath]);

  const pathCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const fp of activeBoard.flowPaths) {
      const noteCount = activeBoard.notes.filter((n) => n.paths?.includes(fp.id)).length;
      const bundleCount = activeBoard.bundles.filter((b) => b.paths?.includes(fp.id)).length;
      counts[fp.id] = noteCount + bundleCount;
    }
    return counts;
  }, [activeBoard.flowPaths, activeBoard.notes, activeBoard.bundles]);

  const handleCreatePath = useCallback((data: Omit<FlowPath, 'id'>) => {
    addFlowPath({ id: uuidv4(), ...data });
    setShowCreateModal(false);
  }, [addFlowPath]);

  const handleEditPath = useCallback((data: Omit<FlowPath, 'id'>) => {
    if (!editingPath) return;
    updateFlowPath(editingPath.id, data);
    setEditingPath(null);
  }, [editingPath, updateFlowPath]);

  const handleDeletePath = useCallback((id: string) => {
    deleteFlowPath(id);
    if (activePath === id) setActivePath(null);
    setContextMenu({ open: false });
  }, [deleteFlowPath, activePath, setActivePath]);

  const handleTabRightClick = (e: React.MouseEvent, pathId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ open: true, pathId, x: e.clientX, y: e.clientY, confirmingDelete: false });
  };

  const handlePathTabHover = (e: React.MouseEvent<HTMLButtonElement>, path: FlowPath, isActive: boolean, entering: boolean) => {
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
            marginRight: 8,
            flexShrink: 0,
          }}
        >
          PATH
        </span>

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

        {/* Path tabs */}
        {activeBoard.flowPaths.map((path) => {
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
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Edit
              </button>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 8px' }} />
              <button
                onClick={() =>
                  setContextMenu((prev) =>
                    prev.open ? { ...prev, confirmingDelete: true } : prev
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
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
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
          onConfirm={handleCreatePath}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit Modal */}
      {editingPath && (
        <PathModal
          mode="edit"
          initialData={editingPath}
          onConfirm={handleEditPath}
          onCancel={() => setEditingPath(null)}
        />
      )}
    </>
  );
};
