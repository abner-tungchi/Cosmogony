import React, { useState } from 'react';
import { SidebarPalette } from './SidebarPalette';
import { useBoardStore } from '../../store/boardStore';
import { ExportModal } from '../Modals/ExportModal';

interface Props {
  onWidthChange?: (width: number) => void;
}

export const Sidebar: React.FC<Props> = ({ onWidthChange }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showExport, setShowExport] = useState(false);
  const { project, setProjectName } = useBoardStore();

  const width = collapsed ? 48 : 240;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    onWidthChange?.(next ? 48 : 240);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width,
          height: '100vh',
          background: '#1e293b',
          borderRight: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
          transition: 'width 0.2s ease',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '12px 0' : '12px 12px 12px 16px',
            borderBottom: '1px solid #334155',
            minHeight: 52,
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            isEditingName ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  setIsEditingName(false);
                  setProjectName(editName);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingName(false);
                    setProjectName(editName);
                  }
                  if (e.key === 'Escape') {
                    setIsEditingName(false);
                  }
                }}
                style={{
                  background: '#334155',
                  border: '1px solid #475569',
                  borderRadius: 6,
                  color: '#f1f5f9',
                  padding: '3px 6px',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                  flex: 1,
                  marginRight: 8,
                  minWidth: 0,
                }}
              />
            ) : (
              <span
                onClick={() => {
                  setIsEditingName(true);
                  setEditName(project.name);
                }}
                style={{
                  color: '#f1f5f9',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginRight: 8,
                }}
                title="Click to rename project"
              >
                {project.name}
              </span>
            )
          )}

          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 18,
              padding: '2px 4px',
              borderRadius: 4,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Palette */}
        <SidebarPalette collapsed={collapsed} onShowExport={() => setShowExport(true)} />
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </>
  );
};
