import React, { useState, useRef } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useUIStore } from '../../store/uiStore';

export const TabBar: React.FC = () => {
  const { project, setActiveBoard, addBoard, closeBoard, renameBoard } = useBoardStore();
  const { currentView, setCurrentView } = useUIStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const openBoards = project.boards.filter((b) => project.openBoardIds.includes(b.id));

  const handleAddBoard = () => {
    addBoard('New Context');
    setCurrentView('board');
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeBoard(id);
    const remaining = project.openBoardIds.filter((i) => i !== id);
    if (remaining.length === 0) {
      setCurrentView('home');
    }
  };

  const handleTabClick = (id: string) => {
    setActiveBoard(id);
    setCurrentView('board');
  };

  const handleDoubleClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(name);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleRenameCommit = () => {
    if (editingId) renameBoard(editingId, editName.trim() || 'New Context');
    setEditingId(null);
  };

  const isHome = currentView === 'home';

  return (
    <div
      style={{
        height: 40,
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        scrollbarWidth: 'none',
      }}
    >
      {/* Home button */}
      <button
        onClick={() => setCurrentView('home')}
        title="Project home"
        style={{
          background: isHome ? '#0f172a' : 'transparent',
          border: 'none',
          borderRight: '1px solid #334155',
          borderBottom: isHome ? '2px solid #3b82f6' : '2px solid transparent',
          color: isHome ? '#f1f5f9' : '#64748b',
          cursor: 'pointer',
          padding: '0 14px',
          fontSize: 16,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.15s',
        }}
      >
        ⌂
      </button>

      {/* Open context tabs */}
      {openBoards.map((board) => {
        const isActive = board.id === project.activeBoardId && currentView === 'board';
        return (
          <div
            key={board.id}
            onClick={() => handleTabClick(board.id)}
            onDoubleClick={(e) => handleDoubleClick(e, board.id, board.name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 10px 0 14px',
              cursor: 'pointer',
              background: isActive ? '#0f172a' : 'transparent',
              borderRight: '1px solid #334155',
              borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
              color: isActive ? '#f1f5f9' : '#94a3b8',
              fontSize: 13,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            {editingId === board.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameCommit();
                  if (e.key === 'Escape') setEditingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#334155',
                  border: '1px solid #475569',
                  borderRadius: 4,
                  color: '#f1f5f9',
                  padding: '2px 6px',
                  fontSize: 13,
                  outline: 'none',
                  minWidth: 80,
                  maxWidth: 160,
                }}
              />
            ) : (
              <span>{board.name}</span>
            )}
            <button
              onClick={(e) => handleClose(e, board.id)}
              title="Close tab"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 16,
                padding: '0 2px',
                lineHeight: 1,
                borderRadius: 3,
                marginLeft: 4,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* Add new context */}
      <button
        onClick={handleAddBoard}
        title="Add new context"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: 20,
          padding: '0 14px',
          flexShrink: 0,
          lineHeight: 1,
          alignSelf: 'center',
        }}
      >
        +
      </button>
    </div>
  );
};
