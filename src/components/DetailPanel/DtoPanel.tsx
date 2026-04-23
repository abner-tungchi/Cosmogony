import React, { useCallback, useEffect, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { FlowPath, StickyNote } from '../../types/elements';
import { DtoFieldsEditor } from './DtoFieldsEditor';
import {
  BORDER_COLOR,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_DIM,
  DTO_BADGE_BG,
  DTO_BADGE_COLOR,
} from './panelStyles';

interface DtoPanelProps {
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

/**
 * Detail panel for a Dto StickyNote.
 * Provides: label input, description textarea, structured fields editor, paths, notes.
 *
 * Legacy `label` format included inline schema (e.g. "OrderDto\n---\nfield: Type").
 * We keep `label` as a single-line name; fields are the structured source of truth.
 */
export const DtoPanel: React.FC<DtoPanelProps> = ({ note, allNotes, flowPaths }) => {
  const { updateNote, updateDtoFields } = useBoardStore();

  // The first line of label is treated as the DTO name
  const initialName = note.label.split('\n')[0].trim();

  const [dtoName, setDtoName] = useState(initialName);
  const [description, setDescription] = useState(note.notes ?? '');

  useEffect(() => {
    setDtoName(note.label.split('\n')[0].trim());
    setDescription(note.notes ?? '');
  }, [note.id]);

  const saveName = useCallback(() => {
    const trimmed = dtoName.trim();
    if (trimmed === note.label.split('\n')[0].trim()) return;
    // Preserve any trailing lines in label (legacy compatibility)
    const rest = note.label.split('\n').slice(1).join('\n');
    const newLabel = rest ? `${trimmed}\n${rest}` : trimmed;
    updateNote(note.id, { label: newLabel });
  }, [dtoName, note.id, note.label, updateNote]);

  const saveDescription = useCallback(() => {
    updateNote(note.id, { notes: description });
  }, [note.id, description, updateNote]);

  const togglePath = (pathId: string) => {
    const current = note.paths ?? [];
    const updated = current.includes(pathId)
      ? current.filter((p) => p !== pathId)
      : [...current, pathId];
    updateNote(note.id, { paths: updated });
  };

  const notePaths = note.paths ?? [];

  const allDtoNotes = allNotes.filter((n) => n.type === 'Dto');

  const divider = <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '0 0 16px' }} />;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* DTO Badge + Name */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: DTO_BADGE_BG,
          borderRadius: 4,
          padding: '3px 8px',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: DTO_BADGE_COLOR }}>DTO</span>
        </div>
        <input
          type="text"
          value={dtoName}
          placeholder="DtoName"
          onChange={(e) => setDtoName(e.target.value)}
          onBlur={saveName}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: TEXT_MAIN,
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 10px',
            outline: 'none',
            fontFamily: '"Courier New", Courier, monospace',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {divider}

      {/* DESCRIPTION */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>Description</div>
        <textarea
          value={description}
          placeholder="Optional description..."
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={2}
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

      {divider}

      {/* FIELDS */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>Fields</div>
        <DtoFieldsEditor
          fields={note.dtoFields ?? []}
          allDtoNotes={allDtoNotes}
          selfId={note.id}
          onChange={(updated) => updateDtoFields(note.id, updated)}
        />
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
                  <input type="checkbox" checked={notePaths.includes(fp.id)} onChange={() => togglePath(fp.id)} style={{ accentColor: fp.color }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: fp.color, flexShrink: 0 }} />
                  {fp.name}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
