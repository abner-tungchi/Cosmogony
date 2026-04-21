import React, { useState, useEffect } from 'react';

export interface ExistingEntity {
  id: string;
  label: string;
  type: string;
}

export interface SetEntityModalProps {
  isOpen: boolean;
  eventNoteId: string;
  eventNoteLabel: string;
  existingEntities: ExistingEntity[];
  onConfirm: (entityLabel: string) => void;
  onLinkExisting: (entityNoteId: string) => void;
  onClose: () => void;
}

type ActiveTab = 'new' | 'existing';

const OVERLAY_BG = 'rgba(0,0,0,0.7)';
const MODAL_BG = '#1e293b';
const BORDER_COLOR = '#334155';
const TEXT_MAIN = 'rgba(255,255,255,0.9)';
const TEXT_MUTED = 'rgba(255,255,255,0.4)';
const TEXT_DIM = 'rgba(255,255,255,0.6)';
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const SetEntityModal: React.FC<SetEntityModalProps> = ({
  isOpen,
  eventNoteLabel,
  existingEntities,
  onConfirm,
  onLinkExisting,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('new');
  const [entityLabel, setEntityLabel] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab('new');
      setEntityLabel('');
      setSelectedEntityId('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmNew = () => {
    const trimmed = entityLabel.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  const handleConfirmExisting = () => {
    if (!selectedEntityId) return;
    onLinkExisting(selectedEntityId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const tabButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    background: 'none',
    border: 'none',
    borderBottom: isActive ? '2px solid #FFD600' : '2px solid transparent',
    color: isActive ? TEXT_MAIN : TEXT_DIM,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    fontFamily: 'inherit',
    marginBottom: -1,
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: OVERLAY_BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: MODAL_BG,
          borderRadius: 12,
          padding: 24,
          width: 380,
          maxWidth: '92vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          border: `1px solid ${BORDER_COLOR}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>
            Set Entity
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED }}>
            for event: <span style={{ color: '#fb923c', fontWeight: 600 }}>{eventNoteLabel || '(Unnamed Event)'}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 20,
        }}>
          <button style={tabButtonStyle(activeTab === 'new')} onClick={() => setActiveTab('new')}>
            New Entity
          </button>
          <button style={tabButtonStyle(activeTab === 'existing')} onClick={() => setActiveTab('existing')}>
            Link Existing
          </button>
        </div>

        {/* Tab: New Entity */}
        {activeTab === 'new' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: TEXT_MUTED,
                marginBottom: 6,
              }}>
                Entity Name
              </div>
              <input
                autoFocus
                type="text"
                value={entityLabel}
                onChange={(e) => setEntityLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
                  if (e.key === 'Enter') { e.preventDefault(); handleConfirmNew(); }
                }}
                placeholder="e.g. Order, Customer, Product..."
                style={INPUT_STYLE}
              />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  color: TEXT_DIM,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNew}
                disabled={!entityLabel.trim()}
                style={{
                  padding: '8px 20px',
                  background: entityLabel.trim() ? '#FFD600' : 'rgba(255,214,0,0.3)',
                  border: 'none',
                  borderRadius: 6,
                  color: entityLabel.trim() ? '#333333' : 'rgba(51,51,51,0.5)',
                  cursor: entityLabel.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                Set
              </button>
            </div>
          </div>
        )}

        {/* Tab: Link Existing */}
        {activeTab === 'existing' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: TEXT_MUTED,
                marginBottom: 6,
              }}>
                Select Entity
              </div>

              {existingEntities.length === 0 ? (
                <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic', padding: '8px 0' }}>
                  No existing entities on this board. Use 'New Entity' instead.
                </div>
              ) : (
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  style={{
                    ...INPUT_STYLE,
                    cursor: 'pointer',
                  }}
                  autoFocus
                >
                  <option value="" disabled style={{ background: MODAL_BG }}>
                    — choose an entity —
                  </option>
                  {existingEntities.map((entity) => (
                    <option key={entity.id} value={entity.id} style={{ background: MODAL_BG }}>
                      {entity.label || '(Unnamed)'} ({entity.type})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  color: TEXT_DIM,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExisting}
                disabled={!selectedEntityId}
                style={{
                  padding: '8px 20px',
                  background: selectedEntityId ? '#FFD600' : 'rgba(255,214,0,0.3)',
                  border: 'none',
                  borderRadius: 6,
                  color: selectedEntityId ? '#333333' : 'rgba(51,51,51,0.5)',
                  cursor: selectedEntityId ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
