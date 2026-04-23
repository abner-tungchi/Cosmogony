import React from 'react';
import type { InvariantRule } from '../../types/specs';
import { TEXT_MAIN, TEXT_MUTED } from './panelStyles';

interface RulesEditorProps {
  rules: InvariantRule[];
  onChange: (rules: InvariantRule[]) => void;
  disabled?: boolean;
}

/**
 * Editor for the `rules[]` array on an Invariant.
 * Each row = one (when, rule) pair. Free-text input for both.
 */
export const RulesEditor: React.FC<RulesEditorProps> = ({ rules, onChange, disabled }) => {
  const inputBase: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 3,
    color: TEXT_MAIN,
    fontSize: 11,
    padding: '4px 6px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const updateRule = (index: number, patch: Partial<InvariantRule>) => {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const deleteRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const addRule = () => {
    onChange([...rules, { when: 'always', rule: '' }]);
  };

  return (
    <div>
      <div style={{
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: TEXT_MUTED,
        fontWeight: 600,
        marginBottom: 4,
      }}>
        Rules
      </div>

      {rules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>When</div>
            <div style={{ flex: 1, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rule</div>
            <div style={{ width: 18 }} />
          </div>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={r.when}
                placeholder='"always" / "<field> == .x"'
                onChange={(e) => updateRule(i, { when: e.target.value })}
                disabled={disabled}
                style={inputBase}
              />
              <input
                type="text"
                value={r.rule}
                placeholder="rule statement"
                onChange={(e) => updateRule(i, { rule: e.target.value })}
                disabled={disabled}
                style={inputBase}
              />
              <button
                onClick={() => deleteRule(i)}
                disabled={disabled}
                aria-label="Delete rule"
                style={{
                  width: 18,
                  height: 18,
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: disabled ? 'default' : 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                  flexShrink: 0,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addRule}
        disabled={disabled}
        style={{
          background: 'none',
          border: '1px dashed rgba(255,255,255,0.2)',
          borderRadius: 3,
          color: TEXT_MUTED,
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 11,
          padding: '3px 8px',
          width: '100%',
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        + Add Rule
      </button>
    </div>
  );
};
