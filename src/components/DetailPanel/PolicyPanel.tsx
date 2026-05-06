import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { FlowPath, StickyNote } from '../../types/elements';
import type { PolicyIssue } from '../../types/specs';
import { resolveNoteRefDisplay } from '../../utils/policyDerived';
import {
  BORDER_COLOR,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_DIM,
} from './panelStyles';

interface PolicyPanelProps {
  note: StickyNote;
  allNotes: StickyNote[];
  flowPaths: FlowPath[];
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: TEXT_MUTED,
  marginBottom: 8,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: TEXT_MUTED,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 2,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

// ─── Inline NoteRefPicker ────────────────────────────────────────────────────
// File-local — Policy panel only. dtoSpecRef picker is independent (different
// shape and consumer), so duplicate logic is acceptable here per design D5.

interface NoteRefPickerInlineProps {
  value: { name: string; noteRef?: string };
  expectedType: 'DomainEvent' | 'Command' | 'Aggregate';
  allNotes: StickyNote[];
  excludeId?: string;
  placeholder: string;
  onChange: (next: { name: string; noteRef?: string }) => void;
}

const NoteRefPickerInline: React.FC<NoteRefPickerInlineProps> = ({
  value,
  expectedType,
  allNotes,
  excludeId,
  placeholder,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Click outside closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Autofocus search
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const candidates = allNotes
    .filter((n) => n.type === expectedType && n.id !== excludeId)
    .map((n) => ({ id: n.id, label: (n.label.split('\n')[0] ?? '').trim() || '(Unnamed)' }))
    .filter(({ label }) => !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase()));

  const { isStale } = resolveNoteRefDisplay(value.name, value.noteRef, allNotes, expectedType);

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title={isStale ? 'Referenced note is missing — re-pick to fix' : `Pick ${expectedType}`}
        onClick={() => setIsOpen((v) => !v)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          color: isStale ? '#ef4444' : TEXT_DIM,
          fontSize: 12,
          padding: '6px 8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        ⌕
      </button>
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            minWidth: 220,
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 300,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ padding: 6, borderBottom: '1px solid #334155' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={placeholder}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                color: TEXT_MAIN,
                fontSize: 11,
                padding: '4px 8px',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {candidates.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>
              {query ? 'No matches' : `No ${expectedType} notes on this board`}
            </div>
          ) : (
            candidates.map((c) => {
              const isSelected = value.noteRef === c.id;
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange({ name: c.label, noteRef: c.id });
                    setIsOpen(false);
                    setQuery('');
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#334155';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    color: TEXT_MAIN,
                    cursor: 'pointer',
                    background: isSelected ? '#334155' : 'transparent',
                    fontFamily: '"Courier New", Courier, monospace',
                  }}
                >
                  {c.label}
                </div>
              );
            })
          )}
          {value.noteRef && (
            <>
              <div style={{ borderTop: '1px solid #334155' }} />
              <div
                onClick={() => {
                  onChange({ name: value.name, noteRef: undefined });
                  setIsOpen(false);
                  setQuery('');
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  color: TEXT_MUTED,
                  fontStyle: 'italic',
                  cursor: 'pointer',
                }}
              >
                Clear ref (keep name)
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Issue Card ──────────────────────────────────────────────────────────────

interface IssueCardProps {
  issue: PolicyIssue;
  index: number;
  allNotes: StickyNote[];
  onChange: (index: number, next: PolicyIssue) => void;
  onDelete: (index: number) => void;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue, index, allNotes, onChange, onDelete }) => {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 4 }}>
        <button
          onClick={() => onDelete(index)}
          aria-label="Delete issue"
          style={{
            background: 'none',
            border: 'none',
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={fieldLabelStyle}>Name</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={issue.name}
            placeholder="commandName"
            onChange={(e) => onChange(index, { ...issue, name: e.target.value })}
            style={inputStyle}
          />
          <NoteRefPickerInline
            value={{ name: issue.name, noteRef: issue.noteRef }}
            expectedType="Command"
            allNotes={allNotes}
            placeholder="Search Command..."
            onChange={(next) => onChange(index, { ...issue, name: next.name, noteRef: next.noteRef })}
          />
        </div>
      </div>

      <div>
        <div style={fieldLabelStyle}>Target Aggregate</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={issue.targetAggregate ?? ''}
            placeholder="aggregateName (optional)"
            onChange={(e) => onChange(index, { ...issue, targetAggregate: e.target.value || undefined })}
            style={inputStyle}
          />
          <NoteRefPickerInline
            value={{ name: issue.targetAggregate ?? '', noteRef: issue.targetAggregateRef }}
            expectedType="Aggregate"
            allNotes={allNotes}
            placeholder="Search Aggregate..."
            onChange={(next) =>
              onChange(index, {
                ...issue,
                targetAggregate: next.name || undefined,
                targetAggregateRef: next.noteRef,
              })
            }
          />
        </div>
      </div>
    </div>
  );
};

// ─── Main PolicyPanel ────────────────────────────────────────────────────────

export const PolicyPanel: React.FC<PolicyPanelProps> = ({ note, allNotes, flowPaths }) => {
  const { updateNote, updatePolicyTrigger, updatePolicyIssues } = useBoardStore();

  const [notes, setNotes] = useState(note.notes ?? '');
  useEffect(() => {
    setNotes(note.notes ?? '');
  }, [note.id, note.notes]);

  const saveNotes = useCallback(() => {
    updateNote(note.id, { notes });
  }, [note.id, notes, updateNote]);

  const trigger = note.policyTrigger;
  const issues = note.policyIssues ?? [];

  const setTriggerName = (name: string) => {
    updatePolicyTrigger(note.id, {
      type: 'DomainEvent',
      name,
      noteRef: trigger?.noteRef,
    });
  };
  const setTriggerFromPicker = (next: { name: string; noteRef?: string }) => {
    updatePolicyTrigger(note.id, {
      type: 'DomainEvent',
      name: next.name,
      noteRef: next.noteRef,
    });
  };
  const removeTrigger = () => updatePolicyTrigger(note.id, undefined);

  const updateIssue = (index: number, next: PolicyIssue) => {
    const updated = [...issues];
    updated[index] = next;
    updatePolicyIssues(note.id, updated);
  };
  const deleteIssue = (index: number) => {
    updatePolicyIssues(note.id, issues.filter((_, i) => i !== index));
  };
  const addIssue = () => {
    const newIssues: PolicyIssue[] = [...issues, { type: 'Command', name: '' }];
    updatePolicyIssues(note.id, newIssues);
  };

  const togglePath = (pathId: string) => {
    const current = note.paths ?? [];
    const updated = current.includes(pathId)
      ? current.filter((p) => p !== pathId)
      : [...current, pathId];
    updateNote(note.id, { paths: updated });
  };

  const notePaths = note.paths ?? [];
  const divider = <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '0 0 16px' }} />;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Label */}
      <div style={{ marginBottom: 16 }}>
        <div style={fieldLabelStyle}>Name</div>
        <input
          type="text"
          value={note.label}
          placeholder="(Unnamed Policy)"
          onChange={(e) => updateNote(note.id, { label: e.target.value })}
          style={{
            ...inputStyle,
            fontSize: 13,
            fontWeight: 600,
          }}
        />
      </div>

      {divider}

      {/* TRIGGERED BY */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ ...sectionLabelStyle, marginBottom: 0 }}>Triggered By</div>
          {trigger && (
            <button
              onClick={removeTrigger}
              style={{
                background: 'none',
                border: 'none',
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
              }}
            >
              × Remove
            </button>
          )}
        </div>

        <div>
          <div style={fieldLabelStyle}>Name</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              value={trigger?.name ?? ''}
              placeholder="eventName"
              onChange={(e) => setTriggerName(e.target.value)}
              style={inputStyle}
            />
            <NoteRefPickerInline
              value={{ name: trigger?.name ?? '', noteRef: trigger?.noteRef }}
              expectedType="DomainEvent"
              allNotes={allNotes}
              placeholder="Search DomainEvent..."
              onChange={setTriggerFromPicker}
            />
          </div>
        </div>
      </div>

      {divider}

      {/* ISSUES */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>Issues (Commands fired)</div>
        {issues.map((iss, i) => (
          <IssueCard
            key={i}
            issue={iss}
            index={i}
            allNotes={allNotes}
            onChange={updateIssue}
            onDelete={deleteIssue}
          />
        ))}
        <button
          onClick={addIssue}
          style={{
            background: 'none',
            border: '1px dashed rgba(255,255,255,0.2)',
            borderRadius: 4,
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 11,
            padding: '6px 10px',
            width: '100%',
            fontFamily: 'inherit',
          }}
        >
          + Add Issue
        </button>
      </div>

      {divider}

      {/* PATHS */}
      {flowPaths.length > 0 && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={sectionLabelStyle}>Paths</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {flowPaths.map((p) => {
                const active = notePaths.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePath(p.id)}
                    style={{
                      background: active ? p.color : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? p.color : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 12,
                      color: active ? '#fff' : TEXT_DIM,
                      fontSize: 11,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          {divider}
        </>
      )}

      {/* NOTES */}
      <div>
        <div style={sectionLabelStyle}>Notes</div>
        <textarea
          value={notes}
          placeholder="Add notes..."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          style={{
            ...inputStyle,
            resize: 'vertical',
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
};
