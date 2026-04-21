import React, { useEffect, useState } from 'react';

interface ShortcutHint {
  key: string;
  label: string;
}

const SHORTCUTS: ShortcutHint[] = [
  { key: 'F', label: 'Fit All' },
  { key: 'Esc', label: 'Close Panel' },
  { key: 'Del', label: 'Delete' },
];

export const HintBar: React.FC = () => {
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        setIsInputFocused(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  if (isInputFocused) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '5px 14px',
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {SHORTCUTS.map((shortcut, index) => (
        <React.Fragment key={shortcut.key}>
          {index > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>|</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <kbd
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1px 6px',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '0.02em',
              }}
            >
              {shortcut.key}
            </kbd>
            <span
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.55)',
                whiteSpace: 'nowrap',
              }}
            >
              {shortcut.label}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};
