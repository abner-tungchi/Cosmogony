import React, { useRef } from 'react';
import type { TextFormat } from '../../types/elements';

interface FormatToolbarProps {
  noteId: string;
  format: TextFormat;
  noteScreenRect: DOMRect;
  onUpdate: (format: TextFormat) => void;
}

const DEFAULT_FONT_SIZE = 13;
const DEFAULT_COLOR = '#1e293b';
const TOOLBAR_WIDTH = 174;

export const FormatToolbar: React.FC<FormatToolbarProps> = ({
  noteId: _noteId,
  format,
  noteScreenRect,
  onUpdate,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);

  const centerX = noteScreenRect.left + noteScreenRect.width / 2;
  const topY = noteScreenRect.top;

  const fontSize = format.fontSize ?? DEFAULT_FONT_SIZE;
  const color = format.color ?? DEFAULT_COLOR;
  const bold = format.bold ?? false;
  const italic = format.italic ?? false;

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 8 && val <= 48) {
      onUpdate({ ...format, fontSize: val });
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ ...format, color: e.target.value });
  };

  const toggleBold = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ ...format, bold: !bold });
  };

  const toggleItalic = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ ...format, italic: !italic });
  };

  const openColorPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    colorInputRef.current?.click();
  };

  const baseBtnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: '#374151',
    flexShrink: 0,
    padding: 0,
    boxSizing: 'border-box' as const,
  };

  const activeBtnStyle: React.CSSProperties = {
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.45)',
    color: '#1d4ed8',
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: centerX - TOOLBAR_WIDTH / 2,
        top: topY - 42,
        zIndex: 99999,
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 2px 12px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)',
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        userSelect: 'none',
        width: TOOLBAR_WIDTH,
        boxSizing: 'border-box',
      }}
    >
      {/* Font size input */}
      <input
        type="number"
        min={8}
        max={48}
        step={1}
        value={fontSize}
        onChange={handleFontSizeChange}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 46,
          height: 28,
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 6,
          fontSize: 12,
          textAlign: 'center',
          outline: 'none',
          color: '#374151',
          padding: '0 2px',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      />

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

      {/* Bold button */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggleBold}
        title="Bold"
        style={{
          ...baseBtnStyle,
          ...(bold ? activeBtnStyle : {}),
          fontWeight: 700,
        }}
      >
        B
      </button>

      {/* Italic button */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggleItalic}
        title="Italic"
        style={{
          ...baseBtnStyle,
          ...(italic ? activeBtnStyle : {}),
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
        }}
      >
        I
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

      {/* Color swatch — clicking opens hidden color input */}
      <div
        onClick={openColorPicker}
        title="Text color"
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          background: color,
          border: '1.5px solid rgba(0,0,0,0.2)',
          cursor: 'pointer',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <input
          ref={colorInputRef}
          type="color"
          value={color}
          onChange={handleColorChange}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};
