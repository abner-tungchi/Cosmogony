import React, { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { useActiveBoard } from '../../store/selectors';
import type { StickyNote, FlowPath, Remodel, Property } from '../../types/elements';
import type { ReturnTypeSpec } from '../../types/specs';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';
import { AggregatePanel } from './AggregatePanel';
import { DtoPanel } from './DtoPanel';
import { ReturnTypeEditor } from './ReturnTypeEditor';

// ─── Constants ───────────────────────────────────────────────────────────────

const PANEL_WIDTH = 360;

const PANEL_BG = '#1e293b';
const BORDER_COLOR = 'rgba(255,255,255,0.08)';
const TEXT_MUTED = 'rgba(255,255,255,0.4)';
const TEXT_DIM = 'rgba(255,255,255,0.6)';
const TEXT_MAIN = 'rgba(255,255,255,0.9)';

// ─── Shared sub-components ────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: TEXT_MUTED,
    marginBottom: 8,
  }}>
    {children}
  </div>
);

interface InlineFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  onBlur: () => void;
  multiline?: boolean;
}

const InlineField: React.FC<InlineFieldProps> = ({ label, value, placeholder, onChange, onBlur, multiline }) => {
  const sharedStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: TEXT_MAIN,
    fontSize: 12,
    padding: '6px 8px',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TEXT_MUTED, marginBottom: 4 }}>
        {label}
      </div>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={3}
          style={{ ...sharedStyle, lineHeight: 1.5 }}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          style={sharedStyle}
        />
      )}
    </div>
  );
};

// ─── Property Table ───────────────────────────────────────────────────────────

interface PropertyTableProps {
  properties: Property[];
  onChange: (updated: Property[]) => void;
}

const PropertyTable: React.FC<PropertyTableProps> = ({ properties, onChange }) => {
  const inputBase: React.CSSProperties = {
    flex: 1,
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

  return (
    <div>
      {properties.length > 0 && (
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
                onChange={(e) => {
                  const updated = properties.map((p, idx) => idx === i ? { ...p, attrName: e.target.value } : p);
                  onChange(updated);
                }}
                style={inputBase}
              />
              <input
                type="text"
                value={prop.type}
                placeholder="String"
                onChange={(e) => {
                  const updated = properties.map((p, idx) => idx === i ? { ...p, type: e.target.value } : p);
                  onChange(updated);
                }}
                style={inputBase}
              />
              <button
                onClick={() => onChange(properties.filter((_, idx) => idx !== i))}
                style={{
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => onChange([...properties, { attrName: '', type: '' }])}
        style={{
          background: 'none',
          border: '1px dashed rgba(255,255,255,0.2)',
          borderRadius: 4,
          color: TEXT_MUTED,
          cursor: 'pointer',
          fontSize: 11,
          padding: '4px 8px',
          width: '100%',
          fontFamily: 'inherit',
        }}
      >
        + Add Property
      </button>
    </div>
  );
};

// ─── Editable Color Block ─────────────────────────────────────────────────────

interface EditableColorBlockProps {
  sectionLabel: string;
  labelValue: string;
  contentValue: string;
  labelPlaceholder: string;
  contentPlaceholder: string;
  bgColor: string;
  textColor: string;
  fullWidth?: boolean;
  noLabelInput?: boolean;
  onLabelChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onBlur: () => void;
}

const EditableColorBlock: React.FC<EditableColorBlockProps> = ({
  sectionLabel, labelValue, contentValue, labelPlaceholder, contentPlaceholder,
  bgColor, textColor, fullWidth, noLabelInput, onLabelChange, onContentChange, onBlur,
}) => {
  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(0,0,0,0.1)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 3,
    color: textColor,
    fontSize: 12,
    padding: '3px 6px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    lineHeight: 1.4,
  };
  return (
    <div style={{
      gridColumn: fullWidth ? 'span 2' : undefined,
      backgroundColor: bgColor,
      borderRadius: 6,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        opacity: 0.6,
        color: textColor,
        fontWeight: 600,
      }}>
        {sectionLabel}
      </div>
      {!noLabelInput && (
        <input
          type="text"
          value={labelValue}
          placeholder={labelPlaceholder}
          onChange={(e) => onLabelChange(e.target.value)}
          onBlur={onBlur}
          style={{ ...inputBase, fontWeight: 600 }}
        />
      )}
      <textarea
        value={contentValue}
        placeholder={contentPlaceholder}
        onChange={(e) => onContentChange(e.target.value)}
        onBlur={onBlur}
        rows={2}
        style={{ ...inputBase, resize: 'none' }}
      />
    </div>
  );
};

// ─── Group Panel ──────────────────────────────────────────────────────────────

interface GroupPanelProps {
  note: StickyNote;
  allNotes: StickyNote[];
  flowPaths: FlowPath[];
  onAddCommand?: (noteId: string) => void;
  onSetEntity?: (noteId: string) => void;
}

const GroupPanel: React.FC<GroupPanelProps> = ({ note, allNotes, flowPaths, onAddCommand, onSetEntity }) => {
  const { updateNote, updateCommandInformation, updateEventProperties, linkEntityToEvent, linkEventToAggregate, setEntityAsAggregateRoot, unsetEntityAsAggregateRoot } = useBoardStore();

  const linkedCommand = note.commandId ? allNotes.find((n) => n.id === note.commandId) : undefined;
  const linkedEntityOrAggregate = note.entityId ? allNotes.find((n) => n.id === note.entityId) : undefined;

  // Determine which state we're in for the Entity/Aggregate section
  const linkedEntity = linkedEntityOrAggregate?.type === 'Entity' ? linkedEntityOrAggregate : undefined;
  const linkedAggregate = linkedEntityOrAggregate?.type === 'Aggregate' ? linkedEntityOrAggregate : undefined;

  // Count how many DomainEvents reference the same Aggregate
  const aggregateReferenceCount = linkedAggregate
    ? allNotes.filter((n) => n.type === 'DomainEvent' && n.entityId === linkedAggregate.id).length
    : 0;

  // Is this the original group for the Aggregate?
  const isOriginalAggregateGroup = linkedAggregate?.groupEventId === note.id;

  // List all Aggregate notes on the board for the "Select Aggregate" dropdown
  const availableAggregates = allNotes.filter((n) => n.type === 'Aggregate');
  const [showAggregateDropdown, setShowAggregateDropdown] = useState(false);
  const aggregateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAggregateDropdown) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (aggregateDropdownRef.current && !aggregateDropdownRef.current.contains(e.target as Node)) {
        setShowAggregateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showAggregateDropdown]);

  const [localInfo, setLocalInfo] = useState<Property[]>(linkedCommand?.information ?? []);
  const [localEventProps, setLocalEventProps] = useState<Property[]>(note.eventProperties ?? []);
  const [notesMeta, setNotesMeta] = useState(note.notes ?? '');
  const [localBehavior, setLocalBehavior] = useState(note.behavior ?? '');

  useEffect(() => {
    const cmd = note.commandId ? allNotes.find((n) => n.id === note.commandId) : undefined;
    setLocalInfo(cmd?.information ?? []);
    setLocalEventProps(note.eventProperties ?? []);
    setNotesMeta(note.notes ?? '');
    setLocalBehavior(note.behavior ?? '');
  }, [note.id]);

  useEffect(() => {
    if (note.commandId) {
      const cmd = allNotes.find((n) => n.id === note.commandId);
      if (cmd?.information) setLocalInfo(cmd.information);
    } else {
      setLocalInfo([]);
    }
  }, [note.commandId]);

  const togglePath = (pathId: string) => {
    const current = note.paths ?? [];
    const updated = current.includes(pathId)
      ? current.filter((p) => p !== pathId)
      : [...current, pathId];
    updateNote(note.id, { paths: updated });
  };

  const notePaths = note.paths ?? [];

  const dashedBtn: React.CSSProperties = {
    background: 'none',
    border: '1px dashed rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: TEXT_DIM,
    cursor: 'pointer',
    fontSize: 12,
    padding: '6px 10px',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
  };

  const nameInput = (accent: string): React.CSSProperties => ({
    width: '100%',
    background: `rgba(${accent},0.1)`,
    border: `1px solid rgba(${accent},0.3)`,
    borderRadius: 4,
    color: TEXT_MAIN,
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 10px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  });

  const divider = <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '0 0 16px' }} />;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* DOMAIN EVENT */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Domain Event</SectionLabel>
        <input
          type="text"
          value={note.label}
          placeholder="(Unnamed Event)"
          onChange={(e) => updateNote(note.id, { label: e.target.value })}
          style={nameInput('255,140,0')}
        />
      </div>

      {/* BEHAVIOR */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Behavior</SectionLabel>
        <input
          type="text"
          value={localBehavior}
          placeholder="e.g. Delete a product"
          onChange={(e) => setLocalBehavior(e.target.value)}
          onBlur={() => updateNote(note.id, { behavior: localBehavior })}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '6px 8px',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {divider}

      {/* ENTITY / AGGREGATE */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Entity / Aggregate</SectionLabel>

        {/* State C: DomainEvent references an Aggregate note */}
        {linkedAggregate ? (
          <div>
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6,
            }}>
              <div style={{
                flex: 1,
                background: 'rgba(184,134,11,0.12)',
                border: '1px solid rgba(184,134,11,0.35)',
                borderRadius: 4,
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#b8860b', flexShrink: 0 }}>AR</span>
                <input
                  type="text"
                  value={linkedAggregate.label}
                  placeholder="(Unnamed Aggregate)"
                  onChange={(e) => updateNote(linkedAggregate.id, { label: e.target.value })}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    color: TEXT_MAIN,
                    fontSize: 12,
                    outline: 'none',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                />
              </div>
              <button
                onClick={() => linkEntityToEvent(note.id, undefined)}
                title="Unlink from this Aggregate"
                style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
              >×</button>
            </div>
            {aggregateReferenceCount > 1 && (
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6 }}>
                Referenced by {aggregateReferenceCount} groups
              </div>
            )}
            {isOriginalAggregateGroup && (
              <button
                onClick={() => unsetEntityAsAggregateRoot(linkedAggregate.id)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4, color: TEXT_MUTED, cursor: 'pointer',
                  fontSize: 11, padding: '3px 10px', fontFamily: 'inherit', display: 'block',
                }}
              >
                Unmark Aggregate Root
              </button>
            )}
          </div>
        ) : linkedEntity ? (
          /* State B: DomainEvent has a plain Entity (not yet AR) */
          <div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                type="text"
                value={linkedEntity.label}
                placeholder="(Unnamed Entity)"
                onChange={(e) => updateNote(linkedEntity.id, { label: e.target.value })}
                style={{
                  flex: 1,
                  background: 'rgba(255,214,0,0.1)',
                  border: '1px solid rgba(255,214,0,0.3)',
                  borderRadius: 4,
                  color: TEXT_MAIN,
                  fontSize: 12,
                  padding: '5px 8px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => linkEntityToEvent(note.id, undefined)}
                title="Unlink entity"
                style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
              >×</button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setEntityAsAggregateRoot(linkedEntity.id)}
                style={{
                  background: 'none', border: '1px dashed rgba(184,134,11,0.5)',
                  borderRadius: 4, color: 'rgba(184,134,11,0.8)', cursor: 'pointer',
                  fontSize: 11, padding: '3px 10px', fontFamily: 'inherit', flex: 1,
                }}
              >
                Mark as Aggregate Root
              </button>
              <div style={{ position: 'relative', flex: 1 }} ref={aggregateDropdownRef}>
                <button
                  onClick={() => availableAggregates.length > 0 && setShowAggregateDropdown((v) => !v)}
                  disabled={availableAggregates.length === 0}
                  title={availableAggregates.length === 0 ? '尚無 Aggregate，請先在其他 Group 標記 AR' : undefined}
                  style={{
                    background: 'none',
                    border: '1px dashed rgba(184,134,11,0.4)',
                    borderRadius: 4,
                    color: availableAggregates.length === 0 ? TEXT_MUTED : 'rgba(184,134,11,0.8)',
                    cursor: availableAggregates.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    padding: '3px 10px',
                    fontFamily: 'inherit',
                    width: '100%',
                    opacity: availableAggregates.length === 0 ? 0.5 : 1,
                  }}
                >
                  Link Aggregate
                </button>
                {showAggregateDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    zIndex: 100,
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}>
                    {availableAggregates.map((agg) => (
                      <button
                        key={agg.id}
                        onClick={() => {
                          linkEventToAggregate(note.id, agg.id);
                          setShowAggregateDropdown(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          color: TEXT_MAIN,
                          fontSize: 12,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        <span style={{ fontSize: 10, color: '#b8860b', marginRight: 6, fontWeight: 700 }}>AR</span>
                        {agg.label || '(Unnamed)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* State A: No Entity and no Aggregate */
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onSetEntity?.(note.id)} style={{ ...dashedBtn, flex: 1 }}>
              + Add Entity
            </button>
            {availableAggregates.length > 0 && (
              <div style={{ position: 'relative', flex: 1 }} ref={aggregateDropdownRef}>
                <button
                  onClick={() => setShowAggregateDropdown((v) => !v)}
                  style={{ ...dashedBtn, width: '100%', borderColor: 'rgba(184,134,11,0.4)', color: 'rgba(184,134,11,0.8)' }}
                >
                  Link Aggregate
                </button>
                {showAggregateDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    zIndex: 100,
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}>
                    {availableAggregates.map((agg) => (
                      <button
                        key={agg.id}
                        onClick={() => {
                          linkEventToAggregate(note.id, agg.id);
                          setShowAggregateDropdown(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          color: TEXT_MAIN,
                          fontSize: 12,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        <span style={{ fontSize: 10, color: '#b8860b', marginRight: 6, fontWeight: 700 }}>AR</span>
                        {agg.label || '(Unnamed)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {divider}

      {/* COMMAND */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Command</SectionLabel>
        {linkedCommand ? (
          <input
            type="text"
            value={linkedCommand.label}
            placeholder="(Unnamed Command)"
            onChange={(e) => updateNote(linkedCommand.id, { label: e.target.value })}
            style={nameInput('30,136,229')}
          />
        ) : (
          <button onClick={() => onAddCommand?.(note.id)} style={dashedBtn}>+ Add Command</button>
        )}
      </div>

      {/* INFORMATION */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Information (Command Input)</SectionLabel>
        {linkedCommand ? (
          <PropertyTable
            properties={localInfo}
            onChange={(updated) => {
              setLocalInfo(updated);
              updateCommandInformation(linkedCommand.id, updated);
            }}
          />
        ) : (
          <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>
            Link a command first to edit input parameters
          </div>
        )}
      </div>

      {divider}

      {/* EVENT OUTPUT */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Event Output</SectionLabel>
        <PropertyTable
          properties={localEventProps}
          onChange={(updated) => {
            setLocalEventProps(updated);
            updateEventProperties(note.id, updated);
          }}
        />
      </div>

      {/* PATHS */}
      {flowPaths.length > 0 && (
        <>
          {divider}
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Paths</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flowPaths.map((fp) => (
                <label key={fp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: TEXT_DIM }}>
                  <input type="checkbox" checked={notePaths.includes(fp.id)} onChange={() => togglePath(fp.id)} style={{ accentColor: fp.color }} />
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
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notesMeta}
          placeholder="Add notes..."
          onChange={(e) => setNotesMeta(e.target.value)}
          onBlur={() => updateNote(note.id, { notes: notesMeta })}
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

// ─── Entity Panel ─────────────────────────────────────────────────────────────

interface EntityPanelProps {
  note: StickyNote;
  flowPaths: FlowPath[];
}

const EntityPanel: React.FC<EntityPanelProps> = ({ note, flowPaths }) => {
  const { updateNote, setEntityAsAggregateRoot } = useBoardStore();
  const [notes, setNotes] = useState(note.notes ?? '');

  useEffect(() => {
    setNotes(note.notes ?? '');
  }, [note.id]);

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

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Type badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#FFD600',
        borderRadius: 4,
        padding: '3px 8px',
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#333333' }}>Entity</span>
      </div>

      {/* AGGREGATE ROOT section */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Aggregate Root</SectionLabel>
        <button
          onClick={() => setEntityAsAggregateRoot(note.id)}
          style={{
            background: 'none', border: '1px dashed rgba(184,134,11,0.5)',
            borderRadius: 4, color: 'rgba(184,134,11,0.8)', cursor: 'pointer',
            fontSize: 12, padding: '5px 10px', width: '100%',
            textAlign: 'left', fontFamily: 'inherit',
          }}
        >
          ◈ Mark as Aggregate Root
        </button>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, marginBottom: 16 }} />

      {/* PATHS section */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Paths</SectionLabel>
        {flowPaths.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>No paths created yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flowPaths.map((fp) => {
              const checked = notePaths.includes(fp.id);
              return (
                <label key={fp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: checked ? TEXT_MAIN : TEXT_DIM }}>
                  <input type="checkbox" checked={checked} onChange={() => togglePath(fp.id)} style={{ accentColor: fp.color, width: 14, height: 14 }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: fp.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{fp.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* NOTES section */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes..."
          rows={4}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderLeft: '2px solid rgba(255,255,255,0.15)',
            borderRadius: 0,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '4px 10px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  );
};

// ─── StickyNote Panel ─────────────────────────────────────────────────────────

interface NotePanelProps {
  note: StickyNote;
  flowPaths: FlowPath[];
}

const NotePanel: React.FC<NotePanelProps> = ({ note, flowPaths }) => {
  const { updateNote } = useBoardStore();
  const [phase, setPhase] = useState(note.phase ?? '');
  const [notes, setNotes] = useState(note.notes ?? '');

  useEffect(() => {
    setPhase(note.phase ?? '');
    setNotes(note.notes ?? '');
  }, [note.id]);

  const saveMeta = useCallback(() => {
    updateNote(note.id, { phase });
  }, [note.id, phase, updateNote]);

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
  const config = ELEMENT_CONFIGS[note.type];

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Type badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: config?.color ?? '#666',
        borderRadius: 4,
        padding: '3px 8px',
        marginBottom: 20,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: config?.textColor ?? '#fff' }}>
          {note.type}
        </span>
      </div>

      {/* PATHS section */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Paths</SectionLabel>
        {flowPaths.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
            尚未建立任何 Path
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flowPaths.map((fp) => {
              const checked = notePaths.includes(fp.id);
              return (
                <label
                  key={fp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    color: checked ? TEXT_MAIN : TEXT_DIM,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePath(fp.id)}
                    style={{ accentColor: fp.color, width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: fp.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{fp.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Phase */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Meta</SectionLabel>
        <InlineField
          label="Phase"
          value={phase}
          placeholder="階段..."
          onChange={setPhase}
          onBlur={saveMeta}
        />
      </div>

      {/* NOTES section */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="新增備注..."
          rows={4}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderLeft: '2px solid rgba(255,255,255,0.15)',
            borderRadius: 0,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '4px 10px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  );
};

// ─── Colored block helpers (used inside Remodel Panel) ────────────────────────

interface ColoredStructuredBlockProps {
  bgColor: string;
  sectionLabel: string;
  children: React.ReactNode;
}

/** Wrapper for the mint-green / blue-gray Remodel section containers with
 *  a structured editor inside (replaces plain-text EditableColorBlock). */
const ColoredStructuredBlock: React.FC<ColoredStructuredBlockProps> = ({
  bgColor, sectionLabel, children,
}) => (
  <div style={{
    backgroundColor: bgColor,
    borderRadius: 6,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  }}>
    <div style={{
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      opacity: 0.6,
      color: '#1e293b',
      fontWeight: 600,
    }}>
      {sectionLabel}
    </div>
    {children}
  </div>
);

interface ColoredPropertyTableProps {
  properties: Property[];
  onChange: (updated: Property[]) => void;
  addLabel?: string;
}

/** PropertyTable variant styled for light-background (colored) Remodel blocks. */
const ColoredPropertyTable: React.FC<ColoredPropertyTableProps> = ({
  properties, onChange, addLabel,
}) => {
  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 3,
    color: '#1e293b',
    fontSize: 11,
    padding: '3px 6px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 9,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  };

  return (
    <div>
      {properties.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, ...headerStyle }}>Attr</div>
            <div style={{ flex: 1, ...headerStyle }}>Type</div>
            <div style={{ width: 18 }} />
          </div>
          {properties.map((prop, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={prop.attrName}
                placeholder="attrName"
                onChange={(e) => onChange(properties.map((p, idx) => idx === i ? { ...p, attrName: e.target.value } : p))}
                style={inputStyle}
              />
              <input
                type="text"
                value={prop.type}
                placeholder="Type"
                onChange={(e) => onChange(properties.map((p, idx) => idx === i ? { ...p, type: e.target.value } : p))}
                style={inputStyle}
              />
              <button
                onClick={() => onChange(properties.filter((_, idx) => idx !== i))}
                aria-label={`Delete ${prop.attrName || 'field'}`}
                style={{
                  width: 18,
                  height: 18,
                  background: 'none',
                  border: 'none',
                  color: '#475569',
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
      )}
      <button
        onClick={() => onChange([...properties, { attrName: '', type: '' }])}
        style={{
          background: 'none',
          border: '1px dashed rgba(0,0,0,0.2)',
          borderRadius: 3,
          color: '#475569',
          cursor: 'pointer',
          fontSize: 11,
          padding: '3px 8px',
          width: '100%',
          fontFamily: 'inherit',
        }}
      >
        {addLabel ?? '+ Add'}
      </button>
    </div>
  );
};

// ─── Remodel Panel ────────────────────────────────────────────────────────────

interface RemodelPanelProps {
  remodel: Remodel;
  allNotes: StickyNote[];
}

const RemodelPanel: React.FC<RemodelPanelProps> = ({ remodel, allNotes }) => {
  const {
    updateRemodel,
    addNote,
    updateRemodelBehavior,
    updateRemodelParameters,
    updateRemodelReturnType,
  } = useBoardStore();

  // Local state for sub-note fields (queryNote stays as free text)
  const [queryContent, setQueryContent] = useState(remodel.queryNote.content);
  const [behavior, setBehavior] = useState(remodel.behavior ?? '');
  const [phase, setPhase] = useState(remodel.phase ?? '');
  const [notes, setNotes] = useState(remodel.notes ?? '');

  // Linked source events (formerly linkedBundleIds — now maps to DomainEvent note IDs)
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const eventDropdownRef = useRef<HTMLDivElement>(null);

  // Linked DTOs dropdown state
  const [showDtoDropdown, setShowDtoDropdown] = useState(false);
  const [dtoSearchQuery, setDtoSearchQuery] = useState('');
  const dtosDropdownRef = useRef<HTMLDivElement>(null);

  // Actor section state
  const [showActorNameInput, setShowActorNameInput] = useState(false);
  const [actorNameInput, setActorNameInput] = useState('');
  const [showActorDropdown, setShowActorDropdown] = useState(false);
  const actorDropdownRef = useRef<HTMLDivElement>(null);

  // Sync when switching between remodels
  useEffect(() => {
    setQueryContent(remodel.queryNote.content);
    setBehavior(remodel.behavior ?? '');
    setPhase(remodel.phase ?? '');
    setNotes(remodel.notes ?? '');
    setShowEventDropdown(false);
    setEventSearchQuery('');
    setShowDtoDropdown(false);
    setDtoSearchQuery('');
    setShowActorNameInput(false);
    setActorNameInput('');
    setShowActorDropdown(false);
  }, [remodel.id]);

  // Close event dropdown on outside click
  useEffect(() => {
    if (!showEventDropdown) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setShowEventDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showEventDropdown]);

  // Close DTO dropdown on outside click
  useEffect(() => {
    if (!showDtoDropdown) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dtosDropdownRef.current && !dtosDropdownRef.current.contains(e.target as Node)) {
        setShowDtoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDtoDropdown]);

  // Close actor dropdown on outside click
  useEffect(() => {
    if (!showActorDropdown) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (actorDropdownRef.current && !actorDropdownRef.current.contains(e.target as Node)) {
        setShowActorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showActorDropdown]);

  const saveQueryNote = useCallback(() => {
    updateRemodel(remodel.id, { queryNote: { label: remodel.queryNote.label, content: queryContent } });
  }, [remodel.id, remodel.queryNote.label, queryContent, updateRemodel]);

  const saveBehavior = useCallback(() => {
    updateRemodelBehavior(remodel.id, behavior);
  }, [remodel.id, behavior, updateRemodelBehavior]);

  const saveMeta = useCallback(() => {
    updateRemodel(remodel.id, { phase });
  }, [remodel.id, phase, updateRemodel]);

  const saveNotes = useCallback(() => {
    updateRemodel(remodel.id, { notes });
  }, [remodel.id, notes, updateRemodel]);

  const createAndLinkDto = () => {
    const newId = uuidv4();
    const REMODEL_W = 496;
    const newNote: StickyNote = {
      id: newId,
      type: 'Dto',
      label: '[DtoName]\n----------\nfield: Type',
      position: {
        x: remodel.position.x + REMODEL_W + 20,
        y: remodel.position.y,
      },
      size: { width: 200, height: 160 },
      zIndex: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addNote(newNote);
    if (!remodel.linkedDtoIds.includes(newId)) {
      updateRemodel(remodel.id, { linkedDtoIds: [...remodel.linkedDtoIds, newId] });
    }
  };

  const removeEventLink = (noteId: string) => {
    updateRemodel(remodel.id, {
      linkedBundleIds: remodel.linkedBundleIds.filter((id) => id !== noteId),
    });
  };

  const addEventLink = (noteId: string) => {
    if (remodel.linkedBundleIds.includes(noteId)) return;
    updateRemodel(remodel.id, {
      linkedBundleIds: [...remodel.linkedBundleIds, noteId],
    });
    setShowEventDropdown(false);
    setEventSearchQuery('');
  };

  const removeDtoLink = (dtoId: string) => {
    updateRemodel(remodel.id, { linkedDtoIds: remodel.linkedDtoIds.filter((id) => id !== dtoId) });
  };

  const addDtoLink = (dtoId: string) => {
    if (remodel.linkedDtoIds.includes(dtoId)) return;
    updateRemodel(remodel.id, { linkedDtoIds: [...remodel.linkedDtoIds, dtoId] });
    setShowDtoDropdown(false);
    setDtoSearchQuery('');
  };

  const createAndLinkActor = () => {
    const name = actorNameInput.trim();
    if (!name) return;
    const newId = uuidv4();
    const newNote: StickyNote = {
      id: newId,
      type: 'Actor',
      label: name,
      position: { x: remodel.position.x + 520, y: remodel.position.y },
      size: { width: 120, height: 80 },
      zIndex: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addNote(newNote);
    updateRemodel(remodel.id, { linkedActorId: newId });
    setShowActorNameInput(false);
    setActorNameInput('');
  };

  const linkExistingActor = (actorId: string) => {
    updateRemodel(remodel.id, { linkedActorId: actorId });
    setShowActorDropdown(false);
  };

  const unlinkActor = () => {
    updateRemodel(remodel.id, { linkedActorId: undefined });
  };

  // All DomainEvent notes on the board
  const allEventNotes = allNotes.filter((n) => n.type === 'DomainEvent');
  const availableEvents = allEventNotes.filter((n) => !remodel.linkedBundleIds.includes(n.id));
  const filteredAvailableEvents = availableEvents.filter((n) => {
    const q = eventSearchQuery.toLowerCase();
    return n.label.toLowerCase().includes(q);
  });

  // All Dto notes on the board
  const allDtoNotes = allNotes.filter((n) => n.type === 'Dto');
  const availableDtoNotes = allDtoNotes.filter((n) => !remodel.linkedDtoIds.includes(n.id));
  const filteredAvailableDtos = availableDtoNotes.filter((n) => {
    const q = dtoSearchQuery.toLowerCase();
    return n.label.toLowerCase().includes(q);
  });

  const allActorNotes = allNotes.filter((n) => n.type === 'Actor' && n.id !== remodel.linkedActorId);
  const linkedActor = remodel.linkedActorId
    ? allNotes.find((n) => n.id === remodel.linkedActorId)
    : undefined;

  const allDtoNotesForReturnType = allNotes.filter((n) => n.type === 'Dto');

  const returnType: ReturnTypeSpec = remodel.returnType ?? { shape: 'object', fields: [] };

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Colored structured blocks — vertical: Parameters → Func Name → Return Type */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 20,
      }}>
        {/* PARAMETERS — mint green block */}
        <ColoredStructuredBlock bgColor="#bbf7d0" sectionLabel="Parameters">
          <ColoredPropertyTable
            properties={remodel.parameters ?? []}
            onChange={(updated) => updateRemodelParameters(remodel.id, updated)}
            addLabel="+ Add Parameter"
          />
        </ColoredStructuredBlock>

        {/* FUNC NAME — blue-gray block, kept as plain textarea (user types query name) */}
        <EditableColorBlock
          sectionLabel="FUNC NAME"
          labelValue={remodel.queryNote.label}
          contentValue={queryContent}
          labelPlaceholder="e.g. GetOrderList"
          contentPlaceholder="e.g. GetOrderList"
          bgColor="#bfdbfe"
          textColor="#1e293b"
          noLabelInput
          onLabelChange={() => {}}
          onContentChange={setQueryContent}
          onBlur={saveQueryNote}
        />

        {/* RETURN TYPE — mint green block */}
        <ColoredStructuredBlock bgColor="#bbf7d0" sectionLabel="Return Type">
          <ReturnTypeEditor
            returnType={returnType}
            allDtoNotes={allDtoNotesForReturnType}
            onChange={(updated) => updateRemodelReturnType(remodel.id, updated)}
          />
        </ColoredStructuredBlock>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, marginBottom: 16 }} />

      {/* BEHAVIOR */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Behavior</SectionLabel>
        <input
          type="text"
          value={behavior}
          placeholder="e.g. Retrieve orders for customer service"
          onChange={(e) => setBehavior(e.target.value)}
          onBlur={saveBehavior}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '6px 8px',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, marginBottom: 20 }} />

      {/* LINKED SOURCE EVENTS section */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Source Events</SectionLabel>

        {/* Existing linked event chips */}
        {remodel.linkedBundleIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {remodel.linkedBundleIds.map((linkedId) => {
              const linkedEvent = allNotes.find((n) => n.id === linkedId);
              const isDeleted = !linkedEvent;
              const displayLabel = linkedEvent ? (linkedEvent.label || '(Unnamed Event)') : '(Deleted Event)';

              return (
                <div
                  key={linkedId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDeleted ? 'rgba(255,255,255,0.03)' : 'rgba(255,140,0,0.1)',
                    border: `1px solid ${isDeleted ? 'rgba(255,255,255,0.06)' : 'rgba(255,140,0,0.25)'}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                  }}
                >
                  <span style={{
                    fontSize: 12,
                    color: isDeleted ? TEXT_MUTED : '#fb923c',
                    fontStyle: isDeleted ? 'italic' : 'normal',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {displayLabel}
                  </span>
                  <button
                    onClick={() => removeEventLink(linkedId)}
                    title={isDeleted ? 'Clean up link' : 'Remove link'}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: TEXT_MUTED,
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '0 0 0 8px',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Event dropdown */}
        <div ref={eventDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowEventDropdown((v) => !v)}
            style={{
              background: 'none',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 4,
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 12,
              padding: '5px 10px',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            + Add Source Event
          </button>

          {showEventDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <input
                  autoFocus
                  type="text"
                  value={eventSearchQuery}
                  onChange={(e) => setEventSearchQuery(e.target.value)}
                  placeholder="Search events..."
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    color: TEXT_MAIN,
                    fontSize: 12,
                    padding: '4px 8px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {filteredAvailableEvents.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
                    {availableEvents.length === 0 ? 'No events available' : 'No matching events'}
                  </div>
                ) : (
                  filteredAvailableEvents.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => addEventLink(n.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        color: TEXT_MAIN,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      {n.label || '(Unnamed Event)'}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LINKED DTOS section */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
          }}>
            Linked DTOs
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={createAndLinkDto}
              title="Create new DTO"
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              +
            </button>
            <button
              onClick={() => setShowDtoDropdown((v) => !v)}
              title="Link existing DTO"
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ⇌
            </button>
          </div>
        </div>

        <div ref={dtosDropdownRef} style={{ position: 'relative' }}>
          {showDtoDropdown && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <input
                  autoFocus
                  type="text"
                  value={dtoSearchQuery}
                  onChange={(e) => setDtoSearchQuery(e.target.value)}
                  placeholder="Search DTOs..."
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    color: TEXT_MAIN,
                    fontSize: 12,
                    padding: '4px 8px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {filteredAvailableDtos.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
                    {availableDtoNotes.length === 0 ? 'No DTOs on this board' : 'No matching DTOs'}
                  </div>
                ) : (
                  filteredAvailableDtos.map((dto) => {
                    const firstLine = dto.label.split('\n')[0].trim() || '(Unnamed DTO)';
                    return (
                      <button
                        key={dto.id}
                        onClick={() => addDtoLink(dto.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: TEXT_MAIN,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: '"Courier New", Courier, monospace',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        {firstLine}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Existing linked DTOs as chips */}
        {remodel.linkedDtoIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {remodel.linkedDtoIds.map((linkedId) => {
              const linkedDto = allDtoNotes.find((n) => n.id === linkedId);
              const isDeleted = !linkedDto;
              const displayLabel = linkedDto
                ? (linkedDto.label.split('\n')[0].trim() || '(Unnamed DTO)')
                : '(Deleted DTO)';

              return (
                <div
                  key={linkedId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDeleted ? 'rgba(255,255,255,0.03)' : 'rgba(134,239,172,0.08)',
                    border: `1px solid ${isDeleted ? 'rgba(255,255,255,0.06)' : 'rgba(134,239,172,0.2)'}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                  }}
                >
                  <span style={{
                    fontSize: 12,
                    color: isDeleted ? TEXT_MUTED : '#86efac',
                    fontStyle: isDeleted ? 'italic' : 'normal',
                    fontFamily: isDeleted ? 'inherit' : '"Courier New", Courier, monospace',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {displayLabel}
                  </span>
                  <button
                    onClick={() => removeDtoLink(linkedId)}
                    title={isDeleted ? '清理此連結' : '移除連結'}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: TEXT_MUTED,
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '0 0 0 8px',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ACTOR section */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
          }}>
            Actor
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { setShowActorNameInput((v) => !v); setShowActorDropdown(false); }}
              title="Create new Actor"
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              +
            </button>
            <button
              onClick={() => { setShowActorDropdown((v) => !v); setShowActorNameInput(false); setActorNameInput(''); }}
              title="Link existing Actor"
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ⇌
            </button>
          </div>
        </div>

        {/* Inline actor name input */}
        {showActorNameInput && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input
              autoFocus
              type="text"
              value={actorNameInput}
              onChange={(e) => setActorNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndLinkActor();
                if (e.key === 'Escape') { setShowActorNameInput(false); setActorNameInput(''); }
              }}
              placeholder="Actor name..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                color: TEXT_MAIN,
                fontSize: 12,
                padding: '4px 8px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={createAndLinkActor}
              title="Confirm"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: TEXT_MAIN,
                cursor: 'pointer',
                fontSize: 12,
                padding: '4px 6px',
                lineHeight: 1,
              }}
            >
              ✓
            </button>
            <button
              onClick={() => { setShowActorNameInput(false); setActorNameInput(''); }}
              title="Cancel"
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 12,
                padding: '4px 6px',
                lineHeight: 1,
              }}
            >
              ✗
            </button>
          </div>
        )}

        {/* Link existing actor dropdown */}
        <div ref={actorDropdownRef} style={{ position: 'relative' }}>
          {showActorDropdown && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {allActorNotes.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
                    No Actor notes on this board
                  </div>
                ) : (
                  allActorNotes.map((actor) => (
                    <button
                      key={actor.id}
                      onClick={() => linkExistingActor(actor.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        color: TEXT_MAIN,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      {actor.label || '(Unnamed Actor)'}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Linked actor chip */}
        {remodel.linkedActorId && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: linkedActor ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${linkedActor ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 6,
            padding: '6px 10px',
          }}>
            <span style={{
              fontSize: 12,
              color: linkedActor ? '#fbbf24' : TEXT_MUTED,
              fontStyle: linkedActor ? 'normal' : 'italic',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {linkedActor ? (linkedActor.label || '(Unnamed Actor)') : '(Deleted Actor)'}
            </span>
            <button
              onClick={unlinkActor}
              title="Remove actor link"
              style={{
                background: 'none',
                border: 'none',
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 14,
                padding: '0 0 0 8px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* META section */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Meta</SectionLabel>
        <InlineField
          label="Phase"
          value={phase}
          placeholder="階段..."
          onChange={setPhase}
          onBlur={saveMeta}
        />
      </div>

      {/* NOTES section */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="新增備注..."
          rows={4}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderLeft: '2px solid rgba(255,255,255,0.15)',
            borderRadius: 0,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '4px 10px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface DetailPanelProps {
  onAddCommand?: (noteId: string) => void;
  onSetEntity?: (noteId: string) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({ onAddCommand, onSetEntity }) => {
  const { selectedElementId, selectedElementType, setSelectedElement } = useUIStore();
  const activeBoard = useActiveBoard();
  const panelRef = useRef<HTMLDivElement>(null);

  const isOpen = selectedElementId !== null;

  // Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setSelectedElement(null, null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setSelectedElement]);

  // Find the selected element
  const note = selectedElementType === 'note'
    ? activeBoard.notes.find((n) => n.id === selectedElementId) ?? null
    : null;

  const remodel = selectedElementType === 'remodel'
    ? activeBoard.remodels.find((r) => r.id === selectedElementId) ?? null
    : null;

  // If element no longer exists (deleted), close the panel
  useEffect(() => {
    if (isOpen && !note && !remodel) {
      setSelectedElement(null, null);
    }
  }, [isOpen, note, remodel, setSelectedElement]);

  const title = note
    ? (note.label || note.type)
    : remodel
    ? (remodel.queryNote.label || remodel.aggregateNote.label || 'Read Model')
    : '';

  const subtitle = note
    ? `${note.type === 'DomainEvent' ? 'group' : note.type} · ${note.id.slice(0, 6)}`
    : remodel
    ? `read model · ${remodel.id.slice(0, 6)}`
    : '';

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100vh',
        width: PANEL_WIDTH,
        background: PANEL_BG,
        borderLeft: `1px solid ${BORDER_COLOR}`,
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`,
        transition: 'transform 300ms cubic-bezier(0,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: `1px solid ${BORDER_COLOR}`,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        background: PANEL_BG,
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <div style={{
              fontSize: 15,
              fontWeight: 600,
              color: TEXT_MAIN,
              wordBreak: 'break-word',
              lineHeight: 1.3,
            }}>
              {title || '\u00a0'}
            </div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
          <button
            onClick={() => setSelectedElement(null, null)}
            style={{
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '2px 4px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Body — single-path dispatcher (one panel renders per selected note) */}
      <div style={{ flex: 1, paddingTop: 16 }}>
        {note && (() => {
          switch (note.type) {
            case 'DomainEvent':
              return (
                <GroupPanel
                  note={note}
                  allNotes={activeBoard.notes}
                  flowPaths={activeBoard.flowPaths}
                  onAddCommand={onAddCommand}
                  onSetEntity={onSetEntity}
                />
              );
            case 'Entity':
              return <EntityPanel note={note} flowPaths={activeBoard.flowPaths} />;
            case 'Aggregate':
              return <AggregatePanel note={note} flowPaths={activeBoard.flowPaths} />;
            case 'Dto':
              return (
                <DtoPanel
                  note={note}
                  allNotes={activeBoard.notes}
                  flowPaths={activeBoard.flowPaths}
                />
              );
            default:
              return <NotePanel note={note} flowPaths={activeBoard.flowPaths} />;
          }
        })()}
        {remodel && (
          <RemodelPanel
            remodel={remodel}
            allNotes={activeBoard.notes}
          />
        )}
      </div>
    </div>
  );
};
