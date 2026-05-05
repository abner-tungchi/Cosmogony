import React, { useState, useEffect, useRef } from 'react';

export const BUILT_IN_TYPES: readonly string[] = [
  'String', 'Int', 'Float', 'Boolean',
  'Date', 'DateTime', 'UUID', 'ID',
  'Long', 'Double', 'Decimal',
  'Object', 'Array', 'JSON',
];

const TEXT_MAIN = 'rgba(255,255,255,0.9)';
const TEXT_MUTED = 'rgba(255,255,255,0.4)';
const TEXT_DIM = 'rgba(255,255,255,0.6)';
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export interface TypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  customTypes: string[];
  onAddCustomType: (typeName: string) => void;
}

export const TypeDropdown: React.FC<TypeDropdownProps> = ({ value, onChange, customTypes, onAddCustomType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const newTypeInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        setNewTypeName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus inline input when add-type mode activates
  useEffect(() => {
    if (isAddingNew && newTypeInputRef.current) {
      newTypeInputRef.current.focus();
    }
  }, [isAddingNew]);

  const handleSelect = (type: string) => {
    onChange(type);
    setIsOpen(false);
    setIsAddingNew(false);
    setNewTypeName('');
  };

  const handleAddTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const trimmed = newTypeName.trim();
      if (trimmed) {
        onAddCustomType(trimmed);
        onChange(trimmed);
        setIsOpen(false);
        setIsAddingNew(false);
        setNewTypeName('');
      }
    } else if (e.key === 'Escape') {
      setIsAddingNew(false);
      setNewTypeName('');
    }
  };

  const triggerStyle: React.CSSProperties = {
    ...INPUT_STYLE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
    padding: '8px 10px',
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
    maxHeight: 240,
    overflowY: 'auto',
    zIndex: 50,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  const optionStyle = (selected: boolean, hover?: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: selected ? TEXT_MAIN : TEXT_DIM,
    background: hover ? '#334155' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const separatorStyle: React.CSSProperties = {
    borderTop: '1px solid #334155',
    margin: '4px 0',
  };

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
      {/* Trigger button */}
      <div
        style={triggerStyle}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (isOpen) {
            setIsAddingNew(false);
            setNewTypeName('');
          }
        }}
      >
        <span style={{ color: value ? TEXT_MAIN : TEXT_MUTED }}>
          {value || 'Select type...'}
        </span>
        <span style={{ color: TEXT_MUTED, fontSize: 10, marginLeft: 4 }}>▼</span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div style={dropdownStyle}>
          {/* Custom types section */}
          {customTypes.length > 0 && (
            <>
              {customTypes.map((type) => (
                <HoverOption
                  key={type}
                  label={type}
                  selected={value === type}
                  onSelect={() => handleSelect(type)}
                  optionStyle={optionStyle}
                />
              ))}
              <div style={separatorStyle} />
            </>
          )}

          {/* Built-in types */}
          {BUILT_IN_TYPES.map((type) => (
            <HoverOption
              key={type}
              label={type}
              selected={value === type}
              onSelect={() => handleSelect(type)}
              optionStyle={optionStyle}
            />
          ))}

          {/* Separator + Add Type */}
          <div style={separatorStyle} />
          {isAddingNew ? (
            <div style={{ padding: '6px 12px' }}>
              <input
                ref={newTypeInputRef}
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={handleAddTypeKeyDown}
                placeholder="Type name, press Enter..."
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid #60a5fa',
                  borderRadius: 4,
                  color: TEXT_MAIN,
                  fontSize: 13,
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
                fontSize: 13,
                color: '#60a5fa',
                fontStyle: 'italic',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingNew(true);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#334155';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              + Add Type...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface HoverOptionProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  optionStyle: (selected: boolean, hover?: boolean) => React.CSSProperties;
}

const HoverOption: React.FC<HoverOptionProps> = ({ label, selected, onSelect, optionStyle }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={optionStyle(selected, hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <span>{label}</span>
      {selected && <span style={{ color: '#60a5fa', fontSize: 12 }}>✓</span>}
    </div>
  );
};
