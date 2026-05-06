import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StickyNote } from '../../types/elements';
import { BUILT_IN_TYPES } from './TypeDropdown';

// Container types that wrap a base type. Picker offers these via per-entry
// sub-menu; canonical wire format is `Wrapper[Base]` (parsed by dtoDerived).
// Nesting is NOT supported (Array[Set[X]] is undefined behavior — the picker
// UI cannot produce nested wrappers).
export type ContainerWrapper = 'Array' | 'Set' | 'List';
const CONTAINER_WRAPPERS: ContainerWrapper[] = ['Array', 'Set', 'List'];
const SUBMENU_HOVER_DELAY_MS = 250;

/**
 * Wrap a base type string with a container. Returns the base unchanged when
 * wrapper is undefined. The format `Wrapper[Base]` is the canonical wire /
 * display representation; consumers must use this helper (do not hand-build
 * the string) so changes to the format only need to land in one place.
 */
export function wrapType(base: string, wrapper?: ContainerWrapper): string {
  return wrapper ? `${wrapper}[${base}]` : base;
}

// Tagged-union describing the picker's choice. Consumer translates this into
// `{ type, dtoSpecRef }` writes — only the `dto` variant carries an id.
export type TypeOrDtoEntry =
  | { kind: 'builtin'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'custom'; type: string; wrapper?: ContainerWrapper }
  | { kind: 'dto'; dtoNoteId: string; type: string; wrapper?: ContainerWrapper };

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
  const [openSubMenuKey, setOpenSubMenuKey] = useState<string | null>(null);
  // Sub-menu is rendered via React portal to document.body so it escapes
  // (a) the parent dropdown's overflow clipping and (b) any ancestor
  // containing block established by transform / contain / will-change /
  // filter / backdrop-filter. We capture the row's viewport rect when the
  // sub-menu opens and use it to anchor the fixed-position panel.
  const [submenuRect, setSubmenuRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newTypeInputRef = useRef<HTMLInputElement>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setIsOpen(false);
    setIsAddingNew(false);
    setNewTypeName('');
    setQuery('');
    setOpenSubMenuKey(null);
    setSubmenuRect(null);
  };

  const cancelHoverTimer = () => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelHoverTimer();
    };
  }, []);

  // Click-outside closes the whole picker. Submenu lives in a portal under
  // document.body so it's NOT inside containerRef — check submenuRef too.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePicker = containerRef.current?.contains(target);
      const insideSubmenu = submenuRef.current?.contains(target);
      if (!insidePicker && !insideSubmenu) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Esc: collapse sub-menu first; only close main dropdown when no sub-menu.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openSubMenuKey !== null) {
        setOpenSubMenuKey(null);
        setSubmenuRect(null);
        e.stopPropagation();
        return;
      }
      close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, openSubMenuKey]);

  // Autofocus search input when dropdown opens
  useEffect(() => {
    if (isOpen && !isAddingNew) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen, isAddingNew]);

  useEffect(() => {
    if (isAddingNew) newTypeInputRef.current?.focus();
  }, [isAddingNew]);

  // Trigger label resolution: dtoSpecRef wins; type string may carry a
  // `Wrapper[Inner]` prefix that we re-apply over the resolved DTO label so
  // the trigger reads e.g. "Array[OrderDto]" even when the DTO is renamed.
  const dtoTarget = dtoSpecRef
    ? allDtoNotes.find((n) => n.id === dtoSpecRef && n.type === 'Dto')
    : undefined;
  const isStaleRef = dtoSpecRef !== undefined && !dtoTarget;
  const triggerLabel = (() => {
    const wrapperMatch = (value ?? '').match(/^(Array|Set|List)\[(.+)\]$/);
    const wrapper = wrapperMatch?.[1];
    const inner = wrapperMatch?.[2] ?? value;

    let innerDisplay: string;
    if (dtoTarget) {
      innerDisplay = dtoFirstLine(dtoTarget);
    } else if (isStaleRef) {
      innerDisplay = inner ? `${inner} (deleted)` : '(deleted DTO)';
    } else {
      innerDisplay = inner || 'Select type...';
    }
    return wrapper ? `${wrapper}[${innerDisplay}]` : innerDisplay;
  })();

  // Filtered groups. Search matches against the inner (base) name only —
  // wrapped variants are reachable through the per-entry sub-menu.
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
  const submenuChevronColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

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
    overflowX: 'visible',
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

  const SUBMENU_WIDTH = 196;
  // Submenu uses position: fixed (viewport-anchored) so it escapes the
  // dropdown's overflow clipping. Coordinates come from the row's
  // getBoundingClientRect() captured at the moment the sub-menu opens.
  const submenuFixedStyle = (rect: DOMRect): React.CSSProperties => ({
    position: 'fixed',
    top: rect.top,
    left: Math.max(4, rect.left - SUBMENU_WIDTH - 4),
    width: SUBMENU_WIDTH,
    background: dropdownBg,
    border: dropdownBorder,
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  });

  /**
   * Render one option row with primary click (plain pick) and a `▸` icon at
   * the right that toggles a sub-menu listing wrapped variants.
   *
   * - row body click → onPickPlain()
   * - row hover for SUBMENU_HOVER_DELAY_MS → opens sub-menu
   * - chevron click → opens sub-menu immediately (stops propagation)
   * - leaving row → cancels pending hover timer (does not close already-open submenu)
   */
  // Per-render registry of pick callbacks indexed by key. The sub-menu (which
  // lives in a portal — outside the row tree) reads from this map when the
  // user picks a variant. Use useMemo so we get a fresh Map per render
  // (avoiding `useRef.current = new Map()` body-assign which is a render-time
  // side-effect and behaves oddly under strict mode double-render).
  const optionRegistry = useMemo<Map<string, {
    base: string;
    onPickPlain: () => void;
    onPickWrapped: (wrapper: ContainerWrapper) => void;
  }>>(
    () => new Map(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 最終以 closure 分析為準:registry 必須每次 render 重建,因為 onPickPlain /
    // onPickWrapped 的 closure 會 capture 到當下 render 的 props (entries / customTypes
    // 等),所以不能 cache 跨 render。dep 用空 array 是錯的(會 freeze map),
    // 用 entries / customTypes 等不夠穩定。最簡單就是讓 useMemo 每次 re-evaluate:
    // 把 dep 設為一個每次 render 都會變的值。React 沒提供「always re-evaluate」
    // dep,但 [Math.random()] 或不傳 dep 都不行(後者也 freeze)。
    // 所以實務上:**直接每次 render 建一個 Map** — 最簡單、最直觀:
    [
      // 把所有 entry 來源 + onPick 函式 reference 變化的依賴都放進來 — entries
      // 物件每次 render 都重新建,reference 必變,等同每次 render 重建 map。
      allDtoNotes,
      customTypes,
      excludeDtoId,
      onPick,
    ],
  );
  // Reset map content each render so renderOption() rebuilds it fresh with
  // current closures. (useMemo above keeps the Map *instance* stable when
  // deps don't change — but if onPick reference is stable, we still need
  // this to ensure clean rebuild every render.)
  optionRegistry.clear();

  const renderOption = (
    key: string,
    label: string,
    base: string,
    isSelected: boolean,
    onPickPlain: () => void,
    onPickWrapped: (wrapper: ContainerWrapper) => void,
    icon?: string,
  ) => {
    optionRegistry.set(key, { base, onPickPlain, onPickWrapped });

    const captureRectAndOpen = (rowEl: HTMLElement) => {
      const rect = rowEl.getBoundingClientRect();
      setSubmenuRect(rect);
      setOpenSubMenuKey(key);
    };

    return (
      <div
        key={key}
        role="option"
        aria-selected={isSelected}
        onClick={onPickPlain}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = optionHoverBg;
          cancelHoverTimer();
          const rowEl = e.currentTarget;
          submenuTimerRef.current = setTimeout(() => {
            captureRectAndOpen(rowEl);
          }, SUBMENU_HOVER_DELAY_MS);
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          cancelHoverTimer();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 12,
          color: optionColor,
          cursor: 'pointer',
          background: isSelected ? optionHoverBg : 'transparent',
        }}
      >
        {icon && <span style={{ fontSize: 12, opacity: 0.8 }}>{icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {isSelected && <span style={{ color: '#60a5fa', fontSize: 11 }}>✓</span>}
        <span
          role="button"
          aria-label="Show wrapped variants"
          onClick={(e) => {
            e.stopPropagation();
            cancelHoverTimer();
            if (openSubMenuKey === key) {
              setOpenSubMenuKey(null);
              setSubmenuRect(null);
              return;
            }
            const rowEl = (e.currentTarget as HTMLElement).parentElement;
            if (rowEl) captureRectAndOpen(rowEl);
          }}
          style={{
            fontSize: 11,
            color: submenuChevronColor,
            cursor: 'pointer',
            padding: '0 2px',
            userSelect: 'none',
          }}
        >
          ▸
        </span>
      </div>
    );
  };

  // Note: don't capture activeOption here — optionRegistry is populated when
  // renderOption() is called inside JSX below, AFTER this line. We re-look up
  // at submenu render time so we get the populated entry.

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
                  `dto-${note.id}`,
                  name,
                  name,
                  isDtoSelected(note.id),
                  () => {
                    onPick({ kind: 'dto', dtoNoteId: note.id, type: name });
                    close();
                  },
                  (wrapper) => {
                    onPick({ kind: 'dto', dtoNoteId: note.id, type: name, wrapper });
                    close();
                  },
                  '📄',
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
                  `custom-${type}`,
                  type,
                  type,
                  isPlainSelected(type),
                  () => {
                    onPick({ kind: 'custom', type });
                    close();
                  },
                  (wrapper) => {
                    onPick({ kind: 'custom', type, wrapper });
                    close();
                  },
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
                  `builtin-${type}`,
                  type,
                  type,
                  isPlainSelected(type),
                  () => {
                    onPick({ kind: 'builtin', type });
                    close();
                  },
                  (wrapper) => {
                    onPick({ kind: 'builtin', type, wrapper });
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

          {/* Add Custom Type inline (always plain — wrap by re-selecting from list) */}
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
              title="Plain only — wrap by re-selecting from list"
            >
              + Add Custom Type...
            </div>
          )}
        </div>
      )}
      {/*
        Sub-menu rendered via React portal to document.body — escapes both
        parent dropdown's overflow clipping AND any ancestor containing-block
        traps (transform / contain / will-change / filter on ancestors).
        Position fixed with row's getBoundingClientRect() coordinates.
        Click outside still recognized via submenuRef (separate ref since
        portal places it outside containerRef).
      */}
      {(() => {
        if (!isOpen || !openSubMenuKey || !submenuRect) return null;
        const opt = optionRegistry.get(openSubMenuKey);
        if (!opt) return null;
        return createPortal(
          <div ref={submenuRef} role="menu" style={submenuFixedStyle(submenuRect)}>
            <div
              role="menuitem"
              onClick={opt.onPickPlain}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = optionHoverBg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                color: optionColor,
                cursor: 'pointer',
                fontFamily: '"Courier New", Courier, monospace',
              }}
            >
              {opt.base}
            </div>
            {CONTAINER_WRAPPERS.map((wrapper) => (
              <div
                key={wrapper}
                role="menuitem"
                onClick={() => opt.onPickWrapped(wrapper)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = optionHoverBg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  color: optionColor,
                  cursor: 'pointer',
                  fontFamily: '"Courier New", Courier, monospace',
                  borderTop: `1px solid ${separatorColor}`,
                }}
              >
                {wrapType(opt.base, wrapper)}
              </div>
            ))}
          </div>,
          document.body,
        );
      })()}
    </div>
  );
};
