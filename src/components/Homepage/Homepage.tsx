import React, { useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';
import type { Board } from '../../types/board';

export const Homepage: React.FC = () => {
  const { project, addBoard, deleteBoard, openBoard, renameBoard } = useBoardStore();
  const { setCurrentView } = useUIStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleOpen = (id: string) => {
    openBoard(id);
    setCurrentView('board');
  };

  const handleNew = () => {
    const id = addBoard('New Context');
    renameBoard(id, 'New Context');
    setCurrentView('board');
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteBoard(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  const handleRenameStart = (board: Board) => {
    setEditingId(board.id);
    setEditName(board.name);
  };

  const handleRenameCommit = () => {
    if (editingId) renameBoard(editingId, editName.trim() || 'New Context');
    setEditingId(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#f8fafc',
        overflowY: 'auto',
        padding: '48px 56px',
        boxSizing: 'border-box',
      }}
      onClick={() => setConfirmDeleteId(null)}
    >
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Project
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          {project.name}
        </h1>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
          {project.boards.length} context{project.boards.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Context Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {/* Existing context cards */}
        {project.boards.map((board) => {
          const isOpen = project.openBoardIds.includes(board.id);
          const isDeleting = confirmDeleteId === board.id;
          return (
            <div
              key={board.id}
              style={{
                background: '#fff',
                border: `2px solid ${isDeleting ? '#ef4444' : '#e2e8f0'}`,
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                cursor: 'default',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Name */}
              {editingId === board.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRenameCommit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameCommit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#0f172a',
                    border: '1px solid #3b82f6',
                    borderRadius: 6,
                    padding: '4px 8px',
                    outline: 'none',
                    background: '#f0f9ff',
                  }}
                />
              ) : (
                <div
                  onDoubleClick={() => handleRenameStart(board)}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#0f172a',
                    cursor: 'text',
                    lineHeight: 1.3,
                  }}
                  title="Double-click to rename"
                >
                  {board.name}
                  {isOpen && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#3b82f6',
                      background: '#eff6ff',
                      borderRadius: 4,
                      padding: '2px 6px',
                      verticalAlign: 'middle',
                    }}>
                      Open
                    </span>
                  )}
                </div>
              )}

              {/* Stats */}
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
                <span>📝 {board.notes.length} note{board.notes.length !== 1 ? 's' : ''}</span>
                <span>⊞ {board.bundles.length} bundle{board.bundles.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Updated {formatDate(board.updatedAt)}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => handleOpen(board.id)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isOpen ? 'Switch to' : 'Open'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(board.id); }}
                  disabled={project.boards.length <= 1}
                  title={isDeleting ? 'Click again to confirm delete' : 'Delete context'}
                  style={{
                    padding: '8px 14px',
                    background: isDeleting ? '#ef4444' : '#f1f5f9',
                    color: isDeleting ? '#fff' : '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: project.boards.length <= 1 ? 'not-allowed' : 'pointer',
                    opacity: project.boards.length <= 1 ? 0.4 : 1,
                    transition: 'background 0.15s, color 0.15s',
                    fontWeight: 600,
                  }}
                >
                  {isDeleting ? 'Confirm' : '🗑'}
                </button>
              </div>
            </div>
          );
        })}

        {/* New Context card */}
        <button
          onClick={handleNew}
          style={{
            background: 'transparent',
            border: '2px dashed #cbd5e1',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: 'pointer',
            minHeight: 160,
            transition: 'border-color 0.15s, background 0.15s',
            color: '#94a3b8',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
            (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1';
            (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>New Context</span>
        </button>
      </div>
    </div>
  );
};
