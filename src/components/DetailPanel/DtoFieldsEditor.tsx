import React from 'react';
import type { DtoField } from '../../types/specs';
import type { StickyNote } from '../../types/elements';
import { TEXT_MAIN, TEXT_MUTED } from './panelStyles';
import { TypeOrDtoPicker } from '../shared/TypeOrDtoPicker';
import { useBoardStore } from '../../store/boardStore';

interface DtoFieldsEditorProps {
  fields: DtoField[];
  allDtoNotes: StickyNote[];
  selfId: string;
  onChange: (fields: DtoField[]) => void;
}

/**
 * Structured editor for DTO fields.
 * Row: name / type / nullable checkbox / dtoSpecRef picker / delete.
 */
export const DtoFieldsEditor: React.FC<DtoFieldsEditorProps> = ({
  fields,
  allDtoNotes,
  selfId,
  onChange,
}) => {
  const customTypes = useBoardStore((s) => s.project.customTypes) ?? [];
  const addCustomType = useBoardStore((s) => s.addCustomType);

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
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

  const updateField = (index: number, patch: Partial<DtoField>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const deleteField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const addField = () => {
    onChange([...fields, { name: '', type: '' }]);
  };

  return (
    <div>
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ flex: 2, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</div>
            <div style={{ flex: 2, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
            <div style={{ width: 24, fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Null</div>
            <div style={{ width: 18 }} />
          </div>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="text"
                value={f.name}
                placeholder="fieldName"
                onChange={(e) => updateField(i, { name: e.target.value })}
                style={{ ...inputStyle, flex: 2 }}
              />
              <div style={{ flex: 2, minWidth: 0 }}>
                <TypeOrDtoPicker
                  value={f.type}
                  dtoSpecRef={f.dtoSpecRef}
                  allDtoNotes={allDtoNotes}
                  customTypes={customTypes}
                  onAddCustomType={addCustomType}
                  excludeDtoId={selfId}
                  theme="dark"
                  onPick={(entry) => {
                    if (entry.kind === 'dto') {
                      updateField(i, { type: entry.type, dtoSpecRef: entry.dtoNoteId });
                    } else {
                      updateField(i, { type: entry.type, dtoSpecRef: undefined });
                    }
                  }}
                />
              </div>
              <input
                type="checkbox"
                checked={!!f.nullable}
                aria-label={`Nullable for ${f.name || 'field'}`}
                onChange={(e) => updateField(i, { nullable: e.target.checked })}
                style={{ width: 24, height: 16, accentColor: '#4ade80', margin: 0 }}
              />
              <button
                onClick={() => deleteField(i)}
                aria-label={`Delete field ${f.name || i}`}
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
      )}
      <button
        onClick={addField}
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
        + Add Field
      </button>
    </div>
  );
};
