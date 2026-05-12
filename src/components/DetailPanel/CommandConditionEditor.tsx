import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CommandCondition, StickyNote } from '../../types/elements';

// Color palette mirrors DetailPanel.tsx
const TEXT_MAIN = 'rgba(255,255,255,0.9)';
const TEXT_DIM = 'rgba(255,255,255,0.6)';
const TEXT_MUTED = 'rgba(255,255,255,0.4)';
const BORDER_COLOR = 'rgba(255,255,255,0.08)';
const ACCENT = '#60a5fa';
const WARNING = '#f59e0b';

export interface AggregateInvariantOption {
  invariantId: string;
  invariantTitle: string;
  aggregateLabel: string;
}

export interface CommandConditionEditorProps {
  conditions: CommandCondition[];
  /** All Aggregate invariants on the board, flattened. Only shown when kind='pre'. */
  allAggregateInvariants: AggregateInvariantOption[];
  kind: 'pre' | 'post';
  onChange: (next: CommandCondition[]) => void;
}

/**
 * Inline-style editor matching DetailPanel.tsx visual language.
 * Each row: textarea for text + (kind='pre' only) invariantId dropdown + delete button.
 * `+ 新增條件` button appends a new empty condition.
 * `_brokenInvariantLink` displays a ⚠️ marker.
 */
export const CommandConditionEditor: React.FC<CommandConditionEditorProps> = ({
  conditions,
  allAggregateInvariants,
  kind,
  onChange,
}) => {
  const updateAt = (idx: number, patch: Partial<CommandCondition>) => {
    const next = conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };

  const removeAt = (idx: number) => {
    onChange(conditions.filter((_, i) => i !== idx));
  };

  const addNew = () => {
    onChange([
      ...conditions,
      { id: uuidv4(), text: '', invariantId: undefined } as CommandCondition,
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {conditions.length === 0 && (
        <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic', padding: '4px 0' }}>
          尚未新增條件
        </div>
      )}
      {conditions.map((cond, idx) => (
        <div
          key={cond.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 6,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 4,
          }}
          data-testid={`condition-row-${kind}-${idx}`}
        >
          {/* Text textarea */}
          <textarea
            value={cond.text}
            placeholder={kind === 'pre' ? '例：顧客信用額度 ≥ 訂單金額' : '例：訂單已建立'}
            onChange={(e) => updateAt(idx, { text: e.target.value })}
            rows={Math.max(1, cond.text.split('\n').length)}
            style={{
              background: 'transparent',
              border: `1px solid ${BORDER_COLOR}`,
              borderRadius: 3,
              color: TEXT_MAIN,
              fontSize: 12,
              padding: '4px 6px',
              resize: 'vertical',
              minHeight: 24,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {/* Pre-only: invariantId picker */}
          {kind === 'pre' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Linked Invariant
              </span>
              <select
                value={cond.invariantId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateAt(idx, {
                    invariantId: val || undefined,
                    // Clear broken-link marker once a new selection is made
                    _brokenInvariantLink: val ? undefined : cond._brokenInvariantLink,
                  });
                }}
                style={{
                  flex: 1,
                  background: '#0f172a',
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 3,
                  color: TEXT_MAIN,
                  fontSize: 11,
                  padding: '3px 4px',
                }}
              >
                <option value="">（無連結）</option>
                {allAggregateInvariants.map((opt) => (
                  <option key={opt.invariantId} value={opt.invariantId}>
                    {opt.aggregateLabel} · {opt.invariantTitle}
                  </option>
                ))}
              </select>
              {cond._brokenInvariantLink && (
                <span
                  title={`原 invariant ${cond._brokenInvariantLink.previousId} 已刪除於 ${cond._brokenInvariantLink.deletedAt}`}
                  style={{ color: WARNING, fontSize: 12, cursor: 'help' }}
                >
                  ⚠️
                </span>
              )}
            </div>
          )}

          {/* Delete row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              style={{
                background: 'transparent',
                border: 'none',
                color: TEXT_DIM,
                fontSize: 10,
                cursor: 'pointer',
                padding: '2px 6px',
              }}
              aria-label="刪除條件"
            >
              🗑 刪除
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addNew}
        style={{
          background: 'transparent',
          border: `1px dashed ${BORDER_COLOR}`,
          color: ACCENT,
          fontSize: 11,
          padding: '4px 8px',
          borderRadius: 3,
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        + 新增條件
      </button>
    </div>
  );
};

/**
 * Helper: scan all notes for Aggregate invariants, flatten for the dropdown.
 */
export function collectAggregateInvariants(allNotes: StickyNote[]): AggregateInvariantOption[] {
  const result: AggregateInvariantOption[] = [];
  for (const note of allNotes) {
    if (note.type !== 'Aggregate' || !note.invariants) continue;
    for (const inv of note.invariants) {
      result.push({
        invariantId: inv.id,
        invariantTitle: inv.title ?? inv.name ?? '(unnamed)',
        aggregateLabel: note.label,
      });
    }
  }
  return result;
}
