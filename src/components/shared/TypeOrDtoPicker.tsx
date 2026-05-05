import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { StickyNote } from '../../types/elements';
import { BUILT_IN_TYPES } from './TypeDropdown';

// Tagged-union describing the picker's choice. Consumer translates this into
// `{ type, dtoSpecRef }` writes — only the `dto` variant carries an id.
export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string }
  | { kind: 'custom'; type: string }
  | { kind: 'dto'; dtoNoteId: string; type: string };

export interface TypeOrDtoPickerProps {
  value: string;
  dtoSpecRef?: string;
  allDtoNotes: StickyNote[];
  customTypes: string[];
  onAddCustomType: (typeName: string) => void;
  onPick: (entry: TypeOrDtoEntry) => void;
  excludeDtoId?: string;
  theme?: 'dark' | 'light';
}

function dtoFirstLine(note: StickyNote): string {
  const first = (note.label.split('\n')[0] ?? '').trim();
  return first || '(Unnamed DTO)';
}

export const TypeOrDtoPicker: React.FC<TypeOrDtoPickerProps> = ({
  value,
  dtoSpecRef,
  allDtoNotes,
  customTypes,
  onAddCustomType,
  onPick,
  excludeDtoId,
  theme = 'dark',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newTypeInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setIsOpen(false);
    setIsAddingNew(false);
    setNewTypeName('');
    setQuery('');
  };

  // Click-outside closes
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Esc closes (works even when search input has focus)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Autofocus search input when dropdown opens
  useEffect(() => {
    if (isOpen && !isAddingNew) {
      // Wait one tick so the input is mounted before focusing.
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen, isAddingNew]);

  useEffect(() => {
    if (isAddingNew) newTypeInputRef.current?.focus();
  }, [isAddingNew]);

  // Trigger label resolution per spec invariant: dtoSpecRef wins when resolvable.
  const dtoTarget = dtoSpecRef
    ? allDtoNotes.find((n) => n.id === dtoSpecRef && n.type === 'Dto')
    : undefined;
  const isStaleRef = dtoSpecRef !== undefined && !dtoTarget;
  const triggerLabel = (() => {
    if (dtoTarget) return dtoFirstLine(dtoTarget);
    if (isStaleRef) return value ? `${value} (deleted)` : '(deleted DTO)';
    return value || 'Select type...';
  })();

  // Filtered groups. 最終以 closure 分析為準: useMemo body 只用 allDtoNotes /
  // customTypes / query / excludeDtoId。
  const { dtoEntries, customEntries, builtinEntries } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: string) => !q || s.toLowerCase().includes(q);
    const dtos = allDtoNotes
      .filter((n) => n.id !== excludeDtoId)
      .map((n) => ({ note: n, name: dtoFirstLine(n) }))
      .filter((e) => matches(e.name));
    const customs = customTypes.filter(matches);
    const builtins = BUILT_IN_TYPES.filter(matches);
    return { dtoEntries: dtos, customEntries: customs, builtinEntries: builtins };
  }, [allDtoNotes, customTypes, query, excludeDtoId]);

  const noMatches =
    dtoEntries.length === 0 && customEntries.length === 0 && builtinEntries.length === 0;

  // Theme palette
  const isDark = theme !== 'light';
  const triggerBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
  const triggerBorder = isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)';
  const triggerColor = isStaleRef
    ? '#ef4444'
    : isDark
      ? 'rgba(255,255,255,0.9)'
      : '#1e293b';
  const placeholderColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  const dropdownBg = isDark ? '#1e293b' : '#ffffff';
  const dropdownBorder = isDark ? '1px solid #334155' : '1px solid rgba(0,0,0,0.15)';
  const optionColor = isDark ? 'rgba(255,255,255,0.6)' : '#1e293b';
  const optionHoverBg = isDark ? '#334155' : 'rgba(0,0,0,0.05)';
  const headerColor = isDark ? 'rgba(255,255,255,0.4)' : '#475569';
  const separatorColor = isDark ? '#334155' : 'rgba(0,0,0,0.1)';
  const searchBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const searchBorder = isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)';

  const triggerStyle: React.CSSProperties = {
    width: '100%',
    background: triggerBg,
    border: triggerBorder,
    borderRadius: 4,
    color: !value && !dtoTarget && !isStaleRef ? placeholderColor : triggerColor,
    fontSize: 12,
    padding: '4px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: dropdownBg,
    border: dropdownBorder,
    borderRadius: 6,
    minWidth: 220,
    maxHeight: 320,
    overflowY: 'auto',
    zIndex: 300,
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  };

  const groupHeaderStyle: React.CSSProperties = {
    padding: '6px 10px 2px',
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: headerColor,
  };

  const optionRowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 12,
    color: optionColor,
    cursor: 'pointer',
    background: selected ? optionHoverBg : 'transparent',
  });

  const renderOption = (
    label: string,
    isSelected: boolean,
    onClick: () => void,
    icon?: string,
    titleHint?: string,
  ) => (
    <div
      key={`${icon ?? ''}-${label}`}
      role="option"
      aria-selected={isSelected}
      title={titleHint}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = optionHoverBg;
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
      style={optionRowStyle(isSelected)}
    >
      {icon && <span style={{ fontSize: 12, opacity: 0.8 }}>{icon}</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {isSelected && <span style={{ color: '#60a5fa', fontSize: 11 }}>✓</span>}
    </div>
  );

  const isDtoSelected = (noteId: string) => dtoSpecRef === noteId;
  const isPlainSelected = (typeStr: string) => !dtoSpecRef && value === typeStr;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={triggerStyle}
        title={isStaleRef ? 'Referenced DTO no longer exists — pick again to fix' : undefined}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerLabel}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </button>
      {isOpen && (
        <div role="listbox" style={dropdownStyle}>
          {/* Search input */}
          <div style={{ padding: 6, borderBottom: `1px solid ${separatorColor}` }}>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search..."
              style={{
                width: '100%',
                background: searchBg,
                border: searchBorder,
                borderRadius: 3,
                color: isDark ? 'rgba(255,255,255,0.9)' : '#1e293b',
                fontSize: 11,
                padding: '4px 8px',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {dtoEntries.length > 0 && (
            <>
              <div style={groupHeaderStyle}>DTOs on this board</div>
              {dtoEntries.map(({ note, name }) =>
                renderOption(
                  name,
                  isDtoSelected(note.id),
                  () => {
                    onPick({ kind: 'dto', dtoNoteId: note.id, type: name });
                    close();
                  },
                  '📄',
                  'Pick this to set DTO ref',
                ),
              )}
            </>
          )}

          {customEntries.length > 0 && (
            <>
              {dtoEntries.length > 0 && (
                <div style={{ borderTop: `1px solid ${separatorColor}`, margin: '4px 0' }} />
              )}
              <div style={groupHeaderStyle}>Custom Types</div>
              {customEntries.map((type) =>
                renderOption(
                  type,
                  isPlainSelected(type),
                  () => {
                    onPick({ kind: 'custom', type });
                    close();
                  },
                  undefined,
                  'Pick this for plain type string',
                ),
              )}
            </>
          )}

          {builtinEntries.length > 0 && (
            <>
              {(dtoEntries.length > 0 || customEntries.length > 0) && (
                <div style={{ borderTop: `1px solid ${separatorColor}`, margin: '4px 0' }} />
              )}
              <div style={groupHeaderStyle}>Built-in</div>
              {builtinEntries.map((type) =>
                renderOption(
                  type,
                  isPlainSelected(type),
                  () => {
                    onPick({ kind: 'builtin', type });
                    close();
                  },
                ),
              )}
            </>
          )}

          {noMatches && (
            <div
              style={{
                padding: '10px 12px',
                fontSize: 11,
                color: headerColor,
                fontStyle: 'italic',
              }}
            >
              (no matches)
            </div>
          )}

          {/* Add Custom Type inline */}
          <div style={{ borderTop: `1px solid ${separatorColor}`, margin: '4px 0' }} />
          {isAddingNew ? (
            <div style={{ padding: '6px 12px' }}>
              <input
                ref={newTypeInputRef}
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const trimmed = newTypeName.trim();
                    if (trimmed) {
                      onAddCustomType(trimmed);
                      onPick({ kind: 'custom', type: trimmed });
                      close();
                    }
                  } else if (e.key === 'Escape') {
                    setIsAddingNew(false);
                    setNewTypeName('');
                  }
                }}
                placeholder="Type name, press Enter..."
                style={{
                  width: '100%',
                  background: searchBg,
                  border: '1px solid #60a5fa',
                  borderRadius: 4,
                  color: isDark ? 'rgba(255,255,255,0.9)' : '#1e293b',
                  fontSize: 12,
                  padding: '6px 8px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 12,
                color: '#60a5fa',
                fontStyle: 'italic',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingNew(true);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = optionHoverBg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              + Add Custom Type...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
