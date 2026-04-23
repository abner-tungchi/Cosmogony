import React, { useState } from 'react';
import type { Invariant } from '../../types/specs';
import { InvariantCard } from './InvariantCard';
import {
  TEXT_MUTED,
  BAND_CONFIRMED_BORDER,
  BAND_CONFIRMED_BG,
  BAND_REVIEW_BORDER,
  BAND_REVIEW_BG,
  BAND_REVIEW_ACCENT,
} from './panelStyles';

interface InvariantBandProps {
  status: 'confirmed' | 'needs_review' | 'rejected';
  invariants: Invariant[];
  availableStateAttrs: string[];
  onChangeInvariant: (invariantId: string, updates: Partial<Invariant>) => void;
  onDeleteInvariant: (invariantId: string) => void;
  onApproveInvariant: (invariantId: string) => void;
  onRejectInvariant: (invariantId: string) => void;
  onRestoreInvariant: (invariantId: string) => void;
}

/**
 * Renders a group of invariants filtered by their status.
 * Applies the visual band style defined in UX-004 §1.4.1.
 */
export const InvariantBand: React.FC<InvariantBandProps> = ({
  status,
  invariants,
  availableStateAttrs,
  onChangeInvariant,
  onDeleteInvariant,
  onApproveInvariant,
  onRejectInvariant,
  onRestoreInvariant,
}) => {
  const [rejectedExpanded, setRejectedExpanded] = useState(false);

  if (invariants.length === 0) return null;

  // ── Rejected band: accordion ───────────────────────────────────────────────
  if (status === 'rejected') {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setRejectedExpanded((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 11,
            padding: '4px 0',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 10 }}>{rejectedExpanded ? '▼' : '▸'}</span>
          Rejected ({invariants.length})
        </button>
        {rejectedExpanded && (
          <div style={{
            paddingLeft: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {invariants.map((inv) => (
              <InvariantCard
                key={inv.id}
                invariant={inv}
                availableStateAttrs={availableStateAttrs}
                onChange={(updates) => onChangeInvariant(inv.id, updates)}
                onDelete={() => onDeleteInvariant(inv.id)}
                onApprove={() => onApproveInvariant(inv.id)}
                onReject={() => onRejectInvariant(inv.id)}
                onRestore={() => onRestoreInvariant(inv.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Confirmed / Needs Review bands ─────────────────────────────────────────
  const isReview = status === 'needs_review';

  const bandStyle: React.CSSProperties = isReview
    ? {
        border: `1px dashed ${BAND_REVIEW_BORDER}`,
        background: BAND_REVIEW_BG,
        borderRadius: 6,
        padding: 10,
      }
    : {
        border: `1px solid ${BAND_CONFIRMED_BORDER}`,
        background: BAND_CONFIRMED_BG,
        borderRadius: 6,
        padding: 10,
      };

  const headerText = isReview
    ? `⚠ Needs Review · AI-inferred (${invariants.length})`
    : `Confirmed (${invariants.length})`;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: isReview ? BAND_REVIEW_ACCENT : TEXT_MUTED,
        marginBottom: 6,
      }}>
        {headerText}
      </div>
      <div style={bandStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {invariants.map((inv, idx) => (
            <React.Fragment key={inv.id}>
              {idx > 0 && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  margin: '0 -4px',
                }} />
              )}
              <InvariantCard
                invariant={inv}
                availableStateAttrs={availableStateAttrs}
                onChange={(updates) => onChangeInvariant(inv.id, updates)}
                onDelete={() => onDeleteInvariant(inv.id)}
                onApprove={() => onApproveInvariant(inv.id)}
                onReject={() => onRejectInvariant(inv.id)}
                onRestore={() => onRestoreInvariant(inv.id)}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
