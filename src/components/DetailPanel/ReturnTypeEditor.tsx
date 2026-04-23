import React from 'react';
import type { ReturnTypeField, ReturnTypeSpec } from '../../types/specs';
import type { StickyNote } from '../../types/elements';
import { DtoPicker } from './DtoPicker';

interface ReturnTypeEditorProps {
  returnType: ReturnTypeSpec;
  allDtoNotes: StickyNote[];
  /** Text color for inputs; defaults to dark slate for light backgrounds. */
  textColor?: string;
  onChange: (updated: ReturnTypeSpec) => void;
}

const SHAPE_OPTIONS: ReturnTypeSpec['shape'][] = ['object', 'array', 'primitive'];

/**
 * Shape selector + fields list for a Remodel's returnType.
 * Rendered inside a colored block — adopts light-theme input styling.
 */
export const ReturnTypeEditor: React.FC<ReturnTypeEditorProps> = ({
  returnType,
  allDtoNotes,
  textColor = '#1e293b',
  onChange,
}) => {
  const inputBase: React.CSSProperties = {
    background: 'rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 3,
    color: textColor,
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

  const updateField = (index: number, patch: Partial<ReturnTypeField>) => {
    onChange({
      ...returnType,
      fields: returnType.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  };

  const deleteField = (index: number) => {
    onChange({
      ...returnType,
      fields: returnType.fields.filter((_, i) => i !== index),
    });
  };

  const addField = () => {
    onChange({
      ...returnType,
      fields: [...returnType.fields, { name: '', type: '' }],
    });
  };

  const shape = returnType.shape;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Shape selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...headerStyle }}>Shape</span>
        <select
          value={shape}
          onChange={(e) => onChange({ ...returnType, shape: e.target.value as ReturnTypeSpec['shape'] })}
          style={{
            ...inputBase,
            flex: 'none',
            minWidth: 110,
            cursor: 'pointer',
          }}
        >
          {SHAPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Primitive: single type input. Stored as one pseudo-field with an empty name. */}
      {shape === 'primitive' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...headerStyle, width: 40 }}>Type</span>
          <input
            type="text"
            value={returnType.fields[0]?.type ?? ''}
            placeholder="String"
            onChange={(e) => {
              onChange({
                ...returnType,
                fields: [{ name: '', type: e.target.value }],
              });
            }}
            style={{ ...inputBase, flex: 1 }}
          />
        </div>
      )}

      {/* Array / Object: fields table */}
      {shape !== 'primitive' && (
        <div>
          {shape === 'array' && (
            <div style={{ fontSize: 10, fontStyle: 'italic', color: '#475569', marginBottom: 4 }}>
              (Array of the following fields)
            </div>
          )}

          {returnType.fields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={{ flex: 2, ...headerStyle }}>Name</div>
                <div style={{ flex: 2, ...headerStyle }}>Type</div>
                <div style={{ width: 24, ...headerStyle, textAlign: 'center' }}>Null</div>
                <div style={{ width: 70, ...headerStyle }}>Ref</div>
                <div style={{ width: 18 }} />
              </div>
              {returnType.fields.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={f.name}
                    placeholder="fieldName"
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    style={{ ...inputBase, flex: 2 }}
                  />
                  <input
                    type="text"
                    value={f.type}
                    placeholder="String"
                    onChange={(e) => updateField(i, { type: e.target.value })}
                    style={{ ...inputBase, flex: 2 }}
                  />
                  <input
                    type="checkbox"
                    checked={!!f.nullable}
                    aria-label={`Nullable for ${f.name || 'field'}`}
                    onChange={(e) => updateField(i, { nullable: e.target.checked })}
                    style={{ width: 24, height: 16, accentColor: '#0f766e', margin: 0 }}
                  />
                  <div style={{ width: 70 }}>
                    <DtoPicker
                      value={f.dtoSpecRef}
                      allDtoNotes={allDtoNotes}
                      onChange={(id) => updateField(i, { dtoSpecRef: id })}
                      theme="light"
                    />
                  </div>
                  <button
                    onClick={() => deleteField(i)}
                    aria-label={`Delete field ${f.name || i}`}
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
            onClick={addField}
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
            + Add Field
          </button>
        </div>
      )}
    </div>
  );
};
