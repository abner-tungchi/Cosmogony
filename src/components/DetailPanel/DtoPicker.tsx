import React, { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '../../types/elements';
import { TEXT_MAIN, TEXT_MUTED } from './panelStyles';

interface DtoPickerProps {
  value: string | undefined;              // selected Dto note id
  allDtoNotes: StickyNote[];
  excludeId?: string;                      // exclude self from list (prevent cycle)
  onChange: (dtoId: string | undefined) => void;
  theme?: 'dark' | 'light';                // dark for main panel, light for colored remodel blocks
}

function firstLineLabel(note: StickyNote): string {
  const first = note.label.split('\n')[0].trim();
  return first || '(Unnamed DTO)';
}

function shortened(label: string, maxLen = 8): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen) + '…';
}

/**
 * Small inline dropdown for picking a Dto note reference (dtoSpecRef).
 * Excludes the owning note to prevent cyclic self-reference.
 */
export const DtoPicker: React.FC<DtoPickerProps> = ({
  value,
  allDtoNotes,
  excludeId,
  onChange,
  theme = 'dark',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = value ? allDtoNotes.find((n) => n.id === value) : undefined;
  const isMissingRef = value !== undefined && !selected;

  const available = allDtoNotes.filter((n) => n.id !== excludeId);
  const filtered = available.filter((n) => {
    if (!query.trim()) return true;
    return firstLineLabel(n).toLowerCase().includes(query.toLowerCase());
  });

  const isDark = theme === 'dark';
  const buttonBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
  const buttonBorder = isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)';
  const buttonColor = isMissingRef ? '#ef4444' : (isDark ? TEXT_MAIN : '#1e293b');

  const dropdownBg = isDark ? '#1e293b' : '#ffffff';
  const dropdownBorder = isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.15)';
  const dropdownItemColor = isDark ? TEXT_MAIN : '#1e293b';

  const displayLabel = (() => {
    if (isMissingRef) return '(deleted)';
    if (selected) return shortened(firstLineLabel(selected), 10);
    return '—';
  })();

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Pick referenced DTO"
        style={{
          width: '100%',
          background: buttonBg,
          border: buttonBorder,
          borderRadius: 3,
          color: buttonColor,
          fontSize: 11,
          padding: '3px 6px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: dropdownBg,
          border: dropdownBorder,
          borderRadius: 6,
          zIndex: 300,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          minWidth: 180,
        }}>
          <div style={{ padding: 6, borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)' }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search DTO..."
              style={{
                width: '100%',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                borderRadius: 3,
                color: isDark ? TEXT_MAIN : '#1e293b',
                fontSize: 11,
                padding: '3px 6px',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>
                {available.length === 0 ? 'No DTOs on this board' : 'No matching DTOs'}
              </div>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { onChange(n.id); setOpen(false); setQuery(''); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: dropdownItemColor,
                    fontSize: 11,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontFamily: '"Courier New", Courier, monospace',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  {firstLineLabel(n)}
                </button>
              ))
            )}
          </div>
          {value && (
            <>
              <div style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)' }} />
              <button
                onClick={() => { onChange(undefined); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  fontSize: 11,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontStyle: 'italic',
                }}
              >
                (none)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
