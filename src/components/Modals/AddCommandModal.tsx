import React, { useState, useEffect, useRef } from 'react';
import type { Property } from '../../types/elements';
import { useBoardStore } from '../../store/boardStore';

interface Props {
  isOpen: boolean;
  eventNoteId: string;
  eventNoteLabel: string;
  initialLabel?: string;
  initialInformation?: Property[];
  onConfirm: (commandLabel: string, information: Property[]) => void;
  onClose: () => void;
}

const BUILT_IN_TYPES = [
  'String', 'Int', 'Float', 'Boolean',
  'Date', 'DateTime', 'UUID', 'ID',
  'Long', 'Double', 'Decimal',
  'Object', 'Array', 'JSON',
];

const OVERLAY_BG = 'rgba(0,0,0,0.7)';
const MODAL_BG = '#1e293b';
const BORDER_COLOR = '#334155';
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

interface TypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  customTypes: string[];
  onAddCustomType: (typeName: string) => void;
}

const TypeDropdown: React.FC<TypeDropdownProps> = ({ value, onChange, customTypes, onAddCustomType }) => {
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

export const AddCommandModal: React.FC<Props> = ({
  isOpen,
  eventNoteLabel,
  initialLabel,
  initialInformation,
  onConfirm,
  onClose,
}) => {
  const isEditMode = !!initialLabel;
  const [commandLabel, setCommandLabel] = useState('');
  const [information, setInformation] = useState<Property[]>([]);

  const customTypes = useBoardStore((state) => state.project.customTypes) ?? [];
  const addCustomType = useBoardStore((state) => state.addCustomType);

  // Reset/pre-fill form whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCommandLabel(initialLabel ?? '');
      setInformation(initialInformation ? [...initialInformation] : []);
    }
  }, [isOpen, initialLabel, initialInformation]);

  if (!isOpen) return null;

  const addProperty = () => {
    setInformation((prev) => [...prev, { attrName: '', type: '' }]);
  };

  const updateProperty = (index: number, field: 'attrName' | 'type', value: string) => {
    setInformation((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeProperty = (index: number) => {
    setInformation((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const trimmed = commandLabel.trim();
    if (!trimmed) return;
    // Filter out empty rows before confirming
    const cleanedInfo = information.filter((p) => p.attrName.trim() || p.type.trim());
    onConfirm(trimmed, cleanedInfo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirm();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: OVERLAY_BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: MODAL_BG,
          borderRadius: 12,
          padding: 24,
          width: 440,
          maxWidth: '92vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          border: `1px solid ${BORDER_COLOR}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>
            {isEditMode ? 'Edit Command' : 'Add Command'}
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED }}>
            for event: <span style={{ color: '#fb923c', fontWeight: 600 }}>{eventNoteLabel || '(Unnamed Event)'}</span>
          </div>
        </div>

        {/* Command Name */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
            marginBottom: 6,
          }}>
            Command Name
          </div>
          <input
            autoFocus
            type="text"
            value={commandLabel}
            onChange={(e) => setCommandLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
            }}
            placeholder="e.g. PlaceOrder, SubmitPayment..."
            style={INPUT_STYLE}
          />
        </div>

        {/* Information (Input Parameters) */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
            marginBottom: 8,
          }}>
            Information (Input Parameters)
          </div>

          {information.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {/* Column headers */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Attribute
                </div>
                <div style={{ flex: 1, fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Type
                </div>
                <div style={{ width: 20 }} />
              </div>

              {information.map((prop, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={prop.attrName}
                    onChange={(e) => updateProperty(i, 'attrName', e.target.value)}
                    placeholder="attrName"
                    style={{ ...INPUT_STYLE, flex: 1 }}
                  />
                  <TypeDropdown
                    value={prop.type}
                    onChange={(value) => updateProperty(i, 'type', value)}
                    customTypes={customTypes}
                    onAddCustomType={addCustomType}
                  />
                  <button
                    onClick={() => removeProperty(i)}
                    title="Remove property"
                    style={{
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'none',
                      border: 'none',
                      color: TEXT_MUTED,
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      flexShrink: 0,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addProperty}
            style={{
              background: 'none',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: TEXT_DIM,
              cursor: 'pointer',
              fontSize: 12,
              padding: '6px 12px',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            + Add Property
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: TEXT_DIM,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!commandLabel.trim()}
            style={{
              padding: '8px 20px',
              background: commandLabel.trim() ? '#3b82f6' : 'rgba(59,130,246,0.3)',
              border: 'none',
              borderRadius: 6,
              color: commandLabel.trim() ? '#fff' : 'rgba(255,255,255,0.4)',
              cursor: commandLabel.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {isEditMode ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};
