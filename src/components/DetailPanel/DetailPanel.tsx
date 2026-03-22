import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import type { Bundle, StickyNote, Policy, FlowPath } from '../../types/elements';
import { ELEMENT_CONFIGS } from '../../constants/elementTypes';

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

// ─── Bundle Panel ─────────────────────────────────────────────────────────────

interface BundlePanelProps {
  bundle: Bundle;
  flowPaths: FlowPath[];
}

const BundlePanel: React.FC<BundlePanelProps> = ({ bundle, flowPaths }) => {
  const { updateBundle } = useBoardStore();

  // Local editable state — synced from bundle prop when bundle id changes
  const [trigger, setTrigger] = useState(bundle.trigger ?? '');
  const [uiDescription, setUiDescription] = useState(bundle.uiDescription ?? '');
  const [phase, setPhase] = useState(bundle.phase ?? '');
  const [notes, setNotes] = useState(bundle.notes ?? '');
  const [policies, setPolicies] = useState<Policy[]>(bundle.policies ?? []);
  const [readModels, setReadModels] = useState<string[]>(bundle.readModels ?? []);
  const [newReadModel, setNewReadModel] = useState('');

  // Sync when switching between bundles
  useEffect(() => {
    setTrigger(bundle.trigger ?? '');
    setUiDescription(bundle.uiDescription ?? '');
    setPhase(bundle.phase ?? '');
    setNotes(bundle.notes ?? '');
    setPolicies(bundle.policies ?? []);
    setReadModels(bundle.readModels ?? []);
    setNewReadModel('');
  }, [bundle.id]);

  const saveMeta = useCallback(() => {
    updateBundle(bundle.id, { trigger, uiDescription, phase });
  }, [bundle.id, trigger, uiDescription, phase, updateBundle]);

  const saveNotes = useCallback(() => {
    updateBundle(bundle.id, { notes });
  }, [bundle.id, notes, updateBundle]);

  const savePolicies = useCallback((updated: Policy[]) => {
    setPolicies(updated);
    updateBundle(bundle.id, { policies: updated });
  }, [bundle.id, updateBundle]);

  const saveReadModels = useCallback((updated: string[]) => {
    setReadModels(updated);
    updateBundle(bundle.id, { readModels: updated });
  }, [bundle.id, updateBundle]);

  // Path toggle
  const togglePath = (pathId: string) => {
    const current = bundle.paths ?? [];
    const updated = current.includes(pathId)
      ? current.filter((p) => p !== pathId)
      : [...current, pathId];
    updateBundle(bundle.id, { paths: updated });
  };

  // Policy helpers
  const addPolicy = () => {
    savePolicies([...policies, { rule: '', severity: 'warn' }]);
  };

  const updatePolicyRule = (index: number, rule: string) => {
    const updated = policies.map((p, i) => i === index ? { ...p, rule } : p);
    setPolicies(updated);
  };

  const savePolicy = (index: number, rule: string) => {
    const updated = policies.map((p, i) => i === index ? { ...p, rule } : p);
    savePolicies(updated);
  };

  const togglePolicySeverity = (index: number) => {
    const updated = policies.map((p, i) =>
      i === index ? { ...p, severity: p.severity === 'block' ? 'warn' : 'block' } as Policy : p
    );
    savePolicies(updated);
  };

  const deletePolicy = (index: number) => {
    savePolicies(policies.filter((_, i) => i !== index));
  };

  // ReadModel helpers
  const addReadModel = () => {
    const val = newReadModel.trim();
    if (!val) return;
    saveReadModels([...readModels, val]);
    setNewReadModel('');
  };

  const deleteReadModel = (index: number) => {
    saveReadModels(readModels.filter((_, i) => i !== index));
  };

  const bundlePaths = bundle.paths ?? [];

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Color block summary — FigJam style */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        marginBottom: 20,
      }}>
        {/* Aggregate (yellow) — full width */}
        <ColorBlock
          label="Aggregate"
          content={bundle.infoNote.content || bundle.infoNote.label}
          bgColor="#FFD600"
          textColor="#333"
          fullWidth
        />
        {/* Command (blue) — left */}
        <ColorBlock
          label="Command"
          content={bundle.commandNote.content || bundle.commandNote.label}
          bgColor="#1E88E5"
          textColor="#fff"
        />
        {/* Event (orange) — right */}
        <ColorBlock
          label="Event"
          content={bundle.eventNote.content || bundle.eventNote.label}
          bgColor="#FF8C00"
          textColor="#fff"
        />
        {/* Information / Params (green) — full width */}
        <ColorBlock
          label="Params"
          content={bundle.entityNote.content || bundle.entityNote.label}
          bgColor="#43A047"
          textColor="#fff"
          fullWidth
        />
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
              const checked = bundlePaths.includes(fp.id);
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

      {/* META section */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Meta</SectionLabel>
        <InlineField
          label="Trigger"
          value={trigger}
          placeholder="觸發條件..."
          onChange={setTrigger}
          onBlur={saveMeta}
        />
        <InlineField
          label="UI Description"
          value={uiDescription}
          placeholder="UI 說明..."
          onChange={setUiDescription}
          onBlur={saveMeta}
        />
        <InlineField
          label="Phase"
          value={phase}
          placeholder="階段..."
          onChange={setPhase}
          onBlur={saveMeta}
        />
      </div>

      {/* POLICIES section */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Policies</SectionLabel>
        {policies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {policies.map((policy, i) => (
              <PolicyRow
                key={i}
                policy={policy}
                onToggleSeverity={() => togglePolicySeverity(i)}
                onChangeRule={(rule) => updatePolicyRule(i, rule)}
                onSave={(rule) => savePolicy(i, rule)}
                onDelete={() => deletePolicy(i)}
              />
            ))}
          </div>
        )}
        <button
          onClick={addPolicy}
          style={{
            background: 'none',
            border: '1px dashed rgba(255,255,255,0.2)',
            borderRadius: 4,
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 12,
            padding: '5px 10px',
            width: '100%',
          }}
        >
          + 新增規則
        </button>
      </div>

      {/* READ MODELS section */}
      {(readModels.length > 0 || true) && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Read Models</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {readModels.map((rm, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(152,195,121,0.15)',
                  border: '1px solid rgba(152,195,121,0.4)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 12,
                  color: '#98C379',
                }}
              >
                {rm}
                <button
                  onClick={() => deleteReadModel(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#98C379',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 12,
                    lineHeight: 1,
                    opacity: 0.7,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newReadModel}
              onChange={(e) => setNewReadModel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReadModel(); } }}
              placeholder="新增 Read Model..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                color: TEXT_MAIN,
                fontSize: 12,
                padding: '5px 8px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={addReadModel}
              style={{
                background: 'rgba(152,195,121,0.2)',
                border: '1px solid rgba(152,195,121,0.4)',
                borderRadius: 4,
                color: '#98C379',
                cursor: 'pointer',
                fontSize: 12,
                padding: '5px 10px',
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

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

// ─── Color Block ──────────────────────────────────────────────────────────────

interface ColorBlockProps {
  label: string;
  content: string;
  bgColor: string;
  textColor: string;
  fullWidth?: boolean;
}

const ColorBlock: React.FC<ColorBlockProps> = ({ label, content, bgColor, textColor, fullWidth }) => (
  <div
    style={{
      gridColumn: fullWidth ? 'span 2' : undefined,
      backgroundColor: bgColor,
      borderRadius: 6,
      padding: '8px 10px',
    }}
  >
    <div style={{
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      opacity: 0.65,
      marginBottom: 4,
      color: textColor,
    }}>
      {label}
    </div>
    <div style={{ fontSize: 12, color: textColor, wordBreak: 'break-word', lineHeight: 1.4 }}>
      {content || <span style={{ opacity: 0.45, fontStyle: 'italic' }}>—</span>}
    </div>
  </div>
);

// ─── Policy Row ───────────────────────────────────────────────────────────────

interface PolicyRowProps {
  policy: Policy;
  onToggleSeverity: () => void;
  onChangeRule: (rule: string) => void;
  onSave: (rule: string) => void;
  onDelete: () => void;
}

const PolicyRow: React.FC<PolicyRowProps> = ({ policy, onToggleSeverity, onChangeRule, onSave, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  const iconColor = policy.severity === 'block'
    ? 'rgba(224,108,117,1)'
    : 'rgba(255,179,71,1)';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onToggleSeverity}
        title={`切換為 ${policy.severity === 'block' ? 'warn' : 'block'}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: iconColor,
          fontSize: 14,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {policy.severity === 'block' ? '🛡' : '⚠'}
      </button>
      <input
        type="text"
        value={policy.rule}
        onChange={(e) => onChangeRule(e.target.value)}
        onBlur={(e) => onSave(e.target.value)}
        placeholder="規則描述..."
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
        onClick={onDelete}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: TEXT_MUTED,
          fontSize: 14,
          padding: 0,
          lineHeight: 1,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 150ms',
          flexShrink: 0,
        }}
      >
        ×
      </button>
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

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const DetailPanel: React.FC = () => {
  const { selectedElementId, selectedElementType, setSelectedElement } = useUIStore();
  const activeBoard = useBoardStore(selectActiveBoard);
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
  const bundle = selectedElementType === 'bundle'
    ? activeBoard.bundles.find((b) => b.id === selectedElementId) ?? null
    : null;

  const note = selectedElementType === 'note'
    ? activeBoard.notes.find((n) => n.id === selectedElementId) ?? null
    : null;

  const remodel = selectedElementType === 'remodel'
    ? activeBoard.remodels.find((r) => r.id === selectedElementId) ?? null
    : null;

  // If element no longer exists (deleted), close the panel
  useEffect(() => {
    if (isOpen && !bundle && !note && !remodel) {
      setSelectedElement(null, null);
    }
  }, [isOpen, bundle, note, remodel, setSelectedElement]);

  const title = bundle
    ? (bundle.eventNote.label || 'Bundle')
    : note
    ? (note.label || note.type)
    : remodel
    ? (remodel.queryNote.label || remodel.aggregateNote.label || 'Remodel')
    : '';

  const subtitle = bundle
    ? `bundle · ${bundle.id.slice(0, 6)}`
    : note
    ? `${note.type} · ${note.id.slice(0, 6)}`
    : remodel
    ? `remodel · ${remodel.id.slice(0, 6)}`
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

      {/* Body */}
      <div style={{ flex: 1, paddingTop: 16 }}>
        {bundle && <BundlePanel bundle={bundle} flowPaths={activeBoard.flowPaths} />}
        {note && <NotePanel note={note} flowPaths={activeBoard.flowPaths} />}
        {remodel && (
          <div style={{ padding: '0 16px', color: '#94a3b8', fontSize: 13 }}>
            {/* Remodel detail editing will be implemented in FE-010 */}
            <div style={{ marginBottom: 8, fontWeight: 600, color: '#a78bfa', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Remodel
            </div>
            <div style={{ opacity: 0.6 }}>
              Detail panel editing for Remodel coming soon (FE-010).
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
