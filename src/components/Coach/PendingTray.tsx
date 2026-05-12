import React, { useState } from 'react';

interface PendingTrayProps {
  pendingCount: number;
  onApplyAll: () => Promise<void>;
  onRejectAll: () => Promise<void>;
}

const TRAY_BG = 'rgba(96, 165, 250, 0.08)';   // ACCENT @ 8%
const BORDER_COLOR = 'rgba(96, 165, 250, 0.4)';
const TEXT_MAIN = 'rgba(255, 255, 255, 0.92)';
const TEXT_DIM = 'rgba(255, 255, 255, 0.6)';
const ACCENT = '#60a5fa';
const ERROR = '#ef4444';

export const PendingTray: React.FC<PendingTrayProps> = ({ pendingCount, onApplyAll, onRejectAll }) => {
  const [busy, setBusy] = useState(false);

  if (pendingCount < 3) return null;

  const handleApplyAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onApplyAll();
    } finally {
      setBusy(false);
    }
  };

  const handleRejectAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRejectAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="pending-tray"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: TRAY_BG,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backdropFilter: 'blur(4px)',
      }}
    >
      <span style={{ color: TEXT_MAIN, fontWeight: 600, fontSize: 13 }}>
        {pendingCount} 個待確認
      </span>
      <span style={{ flex: 1, color: TEXT_DIM, fontSize: 12 }}>
        Coach 提出多個建議。批次處理：
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={handleApplyAll}
        style={{
          background: ACCENT,
          color: '#0b1220',
          border: 'none',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 4,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        全部套用
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={handleRejectAll}
        style={{
          background: 'transparent',
          color: ERROR,
          border: `1px solid ${ERROR}`,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 4,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        全部拒絕
      </button>
    </div>
  );
};
