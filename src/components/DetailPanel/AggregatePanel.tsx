import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import { TypeDropdown, BUILT_IN_TYPES } from '../shared/TypeDropdown';
import type { FlowPath, Property, StickyNote } from '../../types/elements';
import type { Invariant } from '../../types/specs';
import { InvariantBand } from './InvariantBand';
import {
  BORDER_COLOR,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_DIM,
} from './panelStyles';

interface AggregatePanelProps {
  note: StickyNote;
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

// ─── Local State Property Table (name / type / required) ────────────────────

interface StatePropertyTableProps {
  properties: Property[];
  onChange: (updated: Property[]) => void;
}

const StatePropertyTable: React.FC<StatePropertyTableProps> = ({ properties, onChange }) => {
  const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
  const addCustomType = useBoardStore((s) => s.addCustomType);

  const inputBase: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: TEXT_MAIN,
    fontSize: 12,
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  if (properties.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attr</div>
        <div style={{ flex: 1, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
        <div style={{ width: 18 }} />
      </div>
      {properties.map((prop, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            value={prop.attrName}
            placeholder="attrName"
            onChange={(e) => onChange(properties.map((p, idx) => idx === i ? { ...p, attrName: e.target.value } : p))}
            style={inputBase}
          />
          <TypeDropdown
            value={prop.type}
            onChange={(newType) => onChange(properties.map((p, idx) => idx === i ? { ...p, type: newType } : p))}
            customTypes={customTypes}
            onAddCustomType={addCustomType}
          />
          <button
            onClick={() => onChange(properties.filter((_, idx) => idx !== i))}
            aria-label={`Delete state field ${prop.attrName || i}`}
            style={{
              width: 18,
              height: 18,
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
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
      ))}
    </div>
  );
};

// ─── Event Property Picker ──────────────────────────────────────────────────

interface EventPropertyEntry {
  eventId: string;
  eventLabel: string;
  commandLabel?: string;
  kind: 'input' | 'output';
  attrName: string;
  type: string;
}

interface EventPropertyGroup {
  eventId: string;
  eventLabel: string;
  commandLabel?: string;
  inputs: EventPropertyEntry[];
  outputs: EventPropertyEntry[];
}

interface EventPropertyPickerProps {
  aggregateNoteId: string;
  currentStateProperties: Property[];
  onPick: (attrName: string, type: string) => void;
}

const EventPropertyPicker: React.FC<EventPropertyPickerProps> = ({
  aggregateNoteId,
  currentStateProperties,
  onPick,
}) => {
  const board = useActiveBoard();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build grouped entries: one group per related DomainEvent, with Input + Output sub-sections.
  // Source of truth: board.notes (relation = event.entityId === aggregateNoteId).
  // Sort: position.x asc, createdAt asc as tie-breaker (avoid React reorder flicker).
  // 最終以 closure 分析為準：useMemo body 只讀 board.notes 與 aggregateNoteId。
  const groups = useMemo<EventPropertyGroup[]>(() => {
    const relatedEvents = board.notes
      .filter((n) => n.type === 'DomainEvent' && n.entityId === aggregateNoteId)
      .slice()
      .sort((a, b) => {
        const dx = a.position.x - b.position.x;
        if (dx !== 0) return dx;
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      });

    return relatedEvents
      .map((event): EventPropertyGroup => {
        const command = event.commandId ? board.notes.find((n) => n.id === event.commandId) : undefined;
        const inputs = (command?.information ?? []).map((p): EventPropertyEntry => ({
          eventId: event.id,
          eventLabel: event.label,
          commandLabel: command?.label,
          kind: 'input',
          attrName: p.attrName,
          type: p.type,
        }));
        const outputs = (event.eventProperties ?? []).map((p): EventPropertyEntry => ({
          eventId: event.id,
          eventLabel: event.label,
          commandLabel: command?.label,
          kind: 'output',
          attrName: p.attrName,
          type: p.type,
        }));
        return { eventId: event.id, eventLabel: event.label, commandLabel: command?.label, inputs, outputs };
      })
      .filter((g) => g.inputs.length > 0 || g.outputs.length > 0);
  }, [board.notes, aggregateNoteId]);

  const totalEntries = groups.reduce((acc, g) => acc + g.inputs.length + g.outputs.length, 0);
  const isDisabled = totalEntries === 0;

  // Click outside closes
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const isAdded = (attrName: string): boolean => {
    const trimmed = attrName.trim();
    return currentStateProperties.some((p) => p.attrName.trim() === trimmed);
  };

  const triggerStyle: React.CSSProperties = {
    flex: 1,
    background: 'none',
    border: '1px dashed rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: isDisabled ? 'rgba(255,255,255,0.25)' : TEXT_MUTED,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    padding: '4px 8px',
    fontFamily: 'inherit',
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    maxHeight: 320,
    overflowY: 'auto',
    zIndex: 50,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  const renderEntry = (entry: EventPropertyEntry) => {
    const added = isAdded(entry.attrName);
    return (
      <div
        key={`${entry.eventId}-${entry.kind}-${entry.attrName}`}
        role="option"
        aria-selected={added}
        aria-disabled={added}
        title={added ? 'Already in state — edit the row above to change type' : undefined}
        onClick={() => {
          if (added) return;
          onPick(entry.attrName, entry.type);
        }}
        style={{
          padding: '6px 14px',
          cursor: added ? 'not-allowed' : 'pointer',
          fontSize: 12,
          color: added ? TEXT_MUTED : TEXT_MAIN,
          opacity: added ? 0.55 : 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={(e) => {
          if (added) return;
          (e.currentTarget as HTMLDivElement).style.background = '#334155';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        <span style={{ fontFamily: '"Courier New", Courier, monospace' }}>
          {entry.attrName}
          <span style={{ color: TEXT_DIM }}> : {entry.type || '—'}</span>
        </span>
        {added && (
          <span style={{ fontSize: 10, color: TEXT_MUTED, fontStyle: 'italic' }}>(added)</span>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          if (!isDisabled) setIsOpen((prev) => !prev);
        }}
        disabled={isDisabled}
        title={isDisabled ? 'No related events yet' : undefined}
        aria-label="Pick state field from related events"
        aria-disabled={isDisabled}
        aria-expanded={isOpen}
        style={triggerStyle}
      >
        + Pick from Event ▾
      </button>
      {isOpen && !isDisabled && (
        <div role="listbox" style={dropdownStyle}>
          {groups.map((group) => (
            <div key={group.eventId}>
              <div
                style={{
                  padding: '8px 12px 4px',
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: TEXT_MUTED,
                  borderTop: '1px solid #334155',
                }}
              >
                From {group.eventLabel || '(unnamed)'}{group.commandLabel ? ` / ${group.commandLabel}` : ''}
              </div>
              {group.inputs.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 14px',
                      fontSize: 9,
                      color: TEXT_MUTED,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Input
                  </div>
                  {group.inputs.map(renderEntry)}
                </>
              )}
              {group.outputs.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 14px',
                      fontSize: 9,
                      color: TEXT_MUTED,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Output
                  </div>
                  {group.outputs.map(renderEntry)}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main AggregatePanel ─────────────────────────────────────────────────────

export const AggregatePanel: React.FC<AggregatePanelProps> = ({ note, flowPaths }) => {
  const {
    updateNote,
    updateAggregateIdentity,
    updateStateProperties,
    addInvariant,
    updateInvariant,
    deleteInvariant,
    approveInvariant,
    rejectInvariant,
    restoreInvariant,
  } = useBoardStore();

  const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
  const addCustomType = useBoardStore((s) => s.addCustomType);

  const [identityName, setIdentityName] = useState(note.aggregateIdentity?.name ?? '');
  const [notes, setNotes] = useState(note.notes ?? '');

  useEffect(() => {
    setIdentityName(note.aggregateIdentity?.name ?? '');
    setNotes(note.notes ?? '');
  }, [note.id]);

  // Only persist the authored `name`. `_suggested_type` / `_suggested_field` are
  // derived at render time (per UX-004 Decision C) so they always reflect the
  // current aggregate label without staleness.
  const saveIdentity = useCallback(() => {
    const trimmed = identityName.trim();
    if (trimmed === (note.aggregateIdentity?.name ?? '')) return;
    updateAggregateIdentity(note.id, { name: trimmed });
  }, [identityName, note.id, note.aggregateIdentity?.name, updateAggregateIdentity]);

  const saveNotes = useCallback(() => {
    updateNote(note.id, { notes });
  }, [note.id, notes, updateNote]);

  const togglePath = (pathId: string) => {
    const current = note.paths ?? [];
    const updated = current.includes(pathId)
      ? current.filter((p) => p !== pathId)
      : [...current, pathId];
    updateNote(note.id, { paths: updated });
  };

  const notePaths = note.paths ?? [];

  const invariants = note.invariants ?? [];
  const confirmed = invariants.filter((i) => i.status === 'confirmed');
  const needsReview = invariants.filter((i) => i.status === 'needs_review');
  const rejected = invariants.filter((i) => i.status === 'rejected');

  const availableStateAttrs = (note.stateProperties ?? [])
    .map((p) => p.attrName.trim())
    .filter(Boolean);

  const handlePickFromEvent = (attrName: string, type: string) => {
    const trimmed = attrName.trim();
    // Read latest state via getState() — the `note` prop is closure-captured from
    // a previous render and may be stale across rapid clicks. note.id is unique
    // across boards.notes so we can flatMap and skip the active-board lookup.
    const latest = useBoardStore.getState().project.boards
      .flatMap((b) => b.notes)
      .find((n) => n.id === note.id);
    const current = latest?.stateProperties ?? [];
    if (current.some((p) => p.attrName.trim() === trimmed)) return;
    if (type && !BUILT_IN_TYPES.includes(type) && !customTypes.includes(type)) {
      addCustomType(type);
    }
    updateStateProperties(note.id, [...current, { attrName: trimmed, type }]);
  };

  const handleAddInvariant = () => {
    const newInv: Invariant = {
      id: uuidv4(),
      name: '',
      title: '',
      rules: [{ when: 'always', rule: '' }],
      errorCode: '',
      relatedState: [],
      provenance: 'ui',
      status: 'confirmed',
      source: null,
    };
    addInvariant(note.id, newInv);
  };

  const divider = <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '0 0 16px' }} />;

  // Suggested values (derived, display-only per user confirmation #2)
  const aggName = (note.label || '').trim();
  const suggestedType = aggName ? `${aggName}Id` : '';
  const suggestedField = (note.aggregateIdentity?.name ?? '').trim();
  const showSuggestions = Boolean(suggestedField); // hide when identity.name is empty

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Aggregate name with AR badge */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'rgba(184,134,11,0.12)',
          border: '1px solid rgba(184,134,11,0.35)',
          borderRadius: 6,
          padding: '6px 10px',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#b8860b', flexShrink: 0 }}>AR</span>
          <input
            type="text"
            value={note.label}
            placeholder="(Unnamed Aggregate)"
            onChange={(e) => updateNote(note.id, { label: e.target.value })}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: TEXT_MAIN,
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              fontFamily: 'inherit',
              padding: 0,
            }}
          />
        </div>
      </div>

      {divider}

      {/* IDENTITY */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>Identity</div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Name
          </div>
          <input
            type="text"
            value={identityName}
            placeholder="orderId"
            onChange={(e) => setIdentityName(e.target.value)}
            onBlur={saveIdentity}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: TEXT_MAIN,
              fontSize: 12,
              padding: '6px 8px',
              outline: 'none',
              fontFamily: '"Courier New", Courier, monospace',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {showSuggestions && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 11,
            color: TEXT_MUTED,
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}>
            <div>Suggested Type:&nbsp;&nbsp;<span style={{ fontFamily: '"Courier New", Courier, monospace', fontStyle: 'normal' }}>{suggestedType || '—'}</span></div>
            <div>Suggested Field:&nbsp;<span style={{ fontFamily: '"Courier New", Courier, monospace', fontStyle: 'normal' }}>{suggestedField || '—'}</span></div>
          </div>
        )}
      </div>

      {divider}

      {/* STATE */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>State</div>
        <StatePropertyTable
          properties={note.stateProperties ?? []}
          onChange={(updated) => updateStateProperties(note.id, updated)}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={() =>
              updateStateProperties(note.id, [
                ...(note.stateProperties ?? []),
                { attrName: '', type: '' },
              ])
            }
            style={{
              flex: 1,
              background: 'none',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 4,
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px 8px',
              fontFamily: 'inherit',
            }}
          >
            + Add State Field
          </button>
          <EventPropertyPicker
            aggregateNoteId={note.id}
            currentStateProperties={note.stateProperties ?? []}
            onPick={handlePickFromEvent}
          />
        </div>
      </div>

      {divider}

      {/* INVARIANTS */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ ...sectionLabelStyle, marginBottom: 0 }}>Invariants</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <button
            onClick={handleAddInvariant}
            style={{
              background: 'none',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 4,
              color: TEXT_DIM,
              cursor: 'pointer',
              fontSize: 12,
              padding: '5px 10px',
              fontFamily: 'inherit',
            }}
          >
            + Add Invariant
          </button>
        </div>

        {invariants.length === 0 ? (
          <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>
            No invariants yet. Add one to describe business rules.
          </div>
        ) : (
          <>
            <InvariantBand
              status="confirmed"
              invariants={confirmed}
              availableStateAttrs={availableStateAttrs}
              onChangeInvariant={(invariantId, updates) => updateInvariant(note.id, invariantId, updates)}
              onDeleteInvariant={(invariantId) => deleteInvariant(note.id, invariantId)}
              onApproveInvariant={(invariantId) => approveInvariant(note.id, invariantId)}
              onRejectInvariant={(invariantId) => rejectInvariant(note.id, invariantId)}
              onRestoreInvariant={(invariantId) => restoreInvariant(note.id, invariantId)}
            />
            <InvariantBand
              status="needs_review"
              invariants={needsReview}
              availableStateAttrs={availableStateAttrs}
              onChangeInvariant={(invariantId, updates) => updateInvariant(note.id, invariantId, updates)}
              onDeleteInvariant={(invariantId) => deleteInvariant(note.id, invariantId)}
              onApproveInvariant={(invariantId) => approveInvariant(note.id, invariantId)}
              onRejectInvariant={(invariantId) => rejectInvariant(note.id, invariantId)}
              onRestoreInvariant={(invariantId) => restoreInvariant(note.id, invariantId)}
            />
            <InvariantBand
              status="rejected"
              invariants={rejected}
              availableStateAttrs={availableStateAttrs}
              onChangeInvariant={(invariantId, updates) => updateInvariant(note.id, invariantId, updates)}
              onDeleteInvariant={(invariantId) => deleteInvariant(note.id, invariantId)}
              onApproveInvariant={(invariantId) => approveInvariant(note.id, invariantId)}
              onRejectInvariant={(invariantId) => rejectInvariant(note.id, invariantId)}
              onRestoreInvariant={(invariantId) => restoreInvariant(note.id, invariantId)}
            />
          </>
        )}
      </div>

      {/* PATHS */}
      {flowPaths.length > 0 && (
        <>
          {divider}
          <div style={{ marginBottom: 16 }}>
            <div style={sectionLabelStyle}>Paths</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flowPaths.map((fp) => (
                <label key={fp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: TEXT_DIM }}>
                  <input
                    type="checkbox"
                    checked={notePaths.includes(fp.id)}
                    onChange={() => togglePath(fp.id)}
                    style={{ accentColor: fp.color }}
                  />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: fp.color, flexShrink: 0 }} />
                  {fp.name}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {divider}

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
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 4,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '6px 8px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
};
