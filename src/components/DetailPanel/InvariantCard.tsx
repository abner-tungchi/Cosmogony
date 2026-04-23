import React, { useState } from 'react';
import type { Invariant } from '../../types/specs';
import { RulesEditor } from './RulesEditor';
import {
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_DIM,
  BAND_REVIEW_ACCENT,
} from './panelStyles';

interface InvariantCardProps {
  invariant: Invariant;
  availableStateAttrs: string[];
  onChange: (updates: Partial<Invariant>) => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 3,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: '4px 6px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

/**
 * Renders a single invariant with band-appropriate visuals.
 * Does NOT own the band container — that's InvariantBand's job.
 */
export const InvariantCard: React.FC<InvariantCardProps> = ({
  invariant,
  availableStateAttrs,
  onChange,
  onDelete,
  onApprove,
  onReject,
  onRestore,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showRationale, setShowRationale] = useState(false);
  const [addingStateRef, setAddingStateRef] = useState(false);
  const [newStateRef, setNewStateRef] = useState('');

  const isRejected = invariant.status === 'rejected';
  const isReview = invariant.status === 'needs_review';
  const isAI = invariant.provenance === 'assumption';

  const addStateRef = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const current = invariant.relatedState ?? [];
    if (current.includes(trimmed)) return;
    onChange({ relatedState: [...current, trimmed] });
    setNewStateRef('');
    setAddingStateRef(false);
  };

  const removeStateRef = (name: string) => {
    const current = invariant.relatedState ?? [];
    onChange({ relatedState: current.filter((s) => s !== name) });
  };

  // REJECTED minimal display
  if (isRejected) {
    return (
      <div style={{
        opacity: 0.45,
        padding: '6px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          flex: 1,
          fontSize: 12,
          color: TEXT_DIM,
          textDecoration: 'line-through',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {invariant.name || '(unnamed)'} — {invariant.title || '(no title)'}
        </div>
        <button
          onClick={onRestore}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 3,
            color: TEXT_DIM,
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          Restore
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete invariant"
          style={{
            background: 'none',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Header: name + menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          value={invariant.name}
          placeholder="nameInCamelCase"
          onChange={(e) => onChange({ name: e.target.value })}
          style={{
            ...inputStyle,
            fontWeight: 600,
            fontSize: 12,
            fontFamily: '"Courier New", Courier, monospace',
          }}
        />
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Invariant menu"
            style={{
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 14,
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ⋯
          </button>
          {showMenu && (
            <div
              onClick={() => setShowMenu(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 199,
              }}
            />
          )}
          {showMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              zIndex: 200,
              minWidth: 140,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => { onDelete(); setShowMenu(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 12,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title + AI badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input
          type="text"
          value={invariant.title}
          placeholder="Human-readable title"
          onChange={(e) => onChange({ title: e.target.value })}
          style={{ ...inputStyle, fontSize: 13, fontWeight: 500 }}
        />
        {isAI && (
          <span
            aria-label="AI inferred invariant"
            title="AI inferred invariant"
            style={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 700,
              color: BAND_REVIEW_ACCENT,
              letterSpacing: '0.04em',
            }}
          >
            ★ AI
          </span>
        )}
      </div>

      {/* AI source / rationale (only for AI-inferred) */}
      {isAI && invariant.source && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 2 }}>
            Inferred by {invariant.source.agent || 'unknown'}
          </div>
          {invariant.source.rationale && (
            <div>
              <div style={{
                fontSize: 11,
                color: TEXT_DIM,
                fontStyle: 'italic',
                lineHeight: 1.4,
                display: showRationale ? 'block' : '-webkit-box',
                WebkitLineClamp: showRationale ? undefined : 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                paddingLeft: 6,
                borderLeft: '2px solid rgba(234,179,8,0.3)',
              }}>
                {invariant.source.rationale}
              </div>
              <button
                onClick={() => setShowRationale((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '2px 0',
                  marginTop: 2,
                  fontFamily: 'inherit',
                }}
              >
                {showRationale ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Applicability (optional) */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          Applicability
        </div>
        <input
          type="text"
          value={invariant.applicability ?? ''}
          placeholder="(optional condition)"
          onChange={(e) => onChange({ applicability: e.target.value })}
          style={inputStyle}
        />
      </div>

      {/* Rules */}
      <div style={{ marginBottom: 8 }}>
        <RulesEditor
          rules={invariant.rules}
          onChange={(rules) => onChange({ rules })}
        />
      </div>

      {/* Error Code */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          Error Code
        </div>
        <input
          type="text"
          value={invariant.errorCode}
          placeholder="errorCodeInCamelCase"
          onChange={(e) => onChange({ errorCode: e.target.value })}
          style={{ ...inputStyle, fontFamily: '"Courier New", Courier, monospace' }}
        />
      </div>

      {/* State Refs */}
      <div style={{ marginBottom: isReview ? 10 : 0 }}>
        <div style={{ fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          State Refs
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {(invariant.relatedState ?? []).map((name) => (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 11,
                color: TEXT_MAIN,
              }}
            >
              {name}
              <button
                onClick={() => removeStateRef(name)}
                aria-label={`Remove state ref ${name}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
          {addingStateRef ? (
            <input
              autoFocus
              type="text"
              value={newStateRef}
              list={`state-ref-suggestions-${invariant.id}`}
              placeholder="field name"
              onChange={(e) => setNewStateRef(e.target.value)}
              onBlur={() => {
                if (newStateRef.trim()) addStateRef(newStateRef);
                else { setAddingStateRef(false); setNewStateRef(''); }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addStateRef(newStateRef); }
                if (e.key === 'Escape') { setAddingStateRef(false); setNewStateRef(''); }
              }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 11,
                color: TEXT_MAIN,
                fontFamily: 'inherit',
                outline: 'none',
                width: 110,
              }}
            />
          ) : (
            <button
              onClick={() => setAddingStateRef(true)}
              style={{
                background: 'none',
                border: '1px dashed rgba(255,255,255,0.2)',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 11,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + add…
            </button>
          )}
          {availableStateAttrs.length > 0 && (
            <datalist id={`state-ref-suggestions-${invariant.id}`}>
              {availableStateAttrs.map((attr) => (
                <option key={attr} value={attr} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      {/* Approve / Reject buttons (only for needs_review) */}
      {isReview && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              background: 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.35)',
              borderRadius: 3,
              color: '#4ade80',
              cursor: 'pointer',
              fontSize: 11,
              padding: '5px 8px',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 3,
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 11,
              padding: '5px 8px',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  );
};
