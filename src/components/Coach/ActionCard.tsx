import React, { useState } from 'react';
import type { ProposedAction } from '../../types/coach';

const BORDER_COLOR = 'rgba(255, 255, 255, 0.08)';
const TEXT_MAIN = 'rgba(255, 255, 255, 0.92)';
const TEXT_DIM = 'rgba(255, 255, 255, 0.6)';
const TEXT_MUTED = 'rgba(255, 255, 255, 0.4)';
const ACCENT = '#60a5fa';
const SUCCESS = '#22c55e';
const WARNING = '#f59e0b';
const ERROR = '#ef4444';

interface ActionCardProps {
  action: ProposedAction;
  onApply: () => Promise<void>;
  onReject: (reason: string | null) => Promise<void>;
  onForceApply: () => Promise<void>;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const CARD_BASE: React.CSSProperties = {
  border: `1px solid ${BORDER_COLOR}`,
  borderRadius: 6,
  padding: 10,
  background: 'rgba(255, 255, 255, 0.04)',
  color: TEXT_MAIN,
  fontSize: 12,
  lineHeight: 1.5,
};

const ROW_COMPACT: React.CSSProperties = {
  ...CARD_BASE,
  padding: '6px 10px',
  background: 'rgba(255, 255, 255, 0.02)',
  fontSize: 11,
};

const BUTTON_BASE: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 10px',
  cursor: 'pointer',
};

export const ActionCard: React.FC<ActionCardProps> = ({ action, onApply, onReject, onForceApply }) => {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRawArgs, setShowRawArgs] = useState(false);

  const handleRejectSubmit = () => {
    const trimmed = rejectReason.trim();
    void onReject(trimmed === '' ? null : trimmed);
    setShowRejectForm(false);
    setRejectReason('');
  };

  const RawArgs = (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={() => setShowRawArgs((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: TEXT_MUTED,
          fontSize: 10,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {showRawArgs ? '▼ 隱藏原始參數' : '▶ 顯示原始參數'}
      </button>
      {showRawArgs && (
        <pre
          style={{
            marginTop: 4,
            padding: 6,
            background: 'rgba(0, 0, 0, 0.3)',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 4,
            fontSize: 10,
            color: TEXT_DIM,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify({ toolName: action.toolName, args: action.args }, null, 2)}
        </pre>
      )}
    </div>
  );

  switch (action.status) {
    case 'pending':
      return (
        <div data-testid="action-card-pending" style={CARD_BASE}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{action.humanSummary}</div>
          {action.subjectLabel && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4 }}>{action.subjectLabel}</div>
          )}
          {action.rationale && action.rationale.trim() !== '' && (
            <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 6 }}>{action.rationale}</div>
          )}
          {RawArgs}
          {!showRejectForm ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void onApply()}
                style={{ ...BUTTON_BASE, background: ACCENT, color: '#0f172a' }}
              >
                套用
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                style={{
                  ...BUTTON_BASE,
                  background: 'transparent',
                  border: `1px solid ${BORDER_COLOR}`,
                  color: TEXT_DIM,
                }}
              >
                拒絕
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: TEXT_DIM }}>為什麼拒絕？(可選)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 4,
                  color: TEXT_MAIN,
                  fontSize: 11,
                  padding: '4px 6px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleRejectSubmit}
                  style={{ ...BUTTON_BASE, background: ERROR, color: '#fff' }}
                >
                  確認
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason('');
                  }}
                  style={{
                    ...BUTTON_BASE,
                    background: 'transparent',
                    border: `1px solid ${BORDER_COLOR}`,
                    color: TEXT_DIM,
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      );

    case 'confirming':
      return (
        <div data-testid="action-card-confirming" style={{ ...CARD_BASE, opacity: 0.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{action.humanSummary}</div>
          {action.subjectLabel && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4 }}>{action.subjectLabel}</div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              color: TEXT_DIM,
              fontSize: 11,
            }}
          >
            <span
              className="action-card-spinner"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: `2px solid ${TEXT_MUTED}`,
                borderTopColor: ACCENT,
              }}
            />
            <span>套用中…</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              disabled
              style={{
                ...BUTTON_BASE,
                background: 'rgba(255, 255, 255, 0.08)',
                color: TEXT_MUTED,
                cursor: 'default',
              }}
            >
              套用
            </button>
            <button
              type="button"
              disabled
              style={{
                ...BUTTON_BASE,
                background: 'transparent',
                border: `1px solid ${BORDER_COLOR}`,
                color: TEXT_MUTED,
                cursor: 'default',
              }}
            >
              拒絕
            </button>
          </div>
          <style>{`
            @keyframes action-card-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .action-card-spinner {
              animation: action-card-spin 0.9s linear infinite;
            }
          `}</style>
        </div>
      );

    case 'confirmed': {
      const t = fmtTime(action.finalizedAt);
      return (
        <div
          data-testid="action-card-confirmed"
          style={{ ...ROW_COMPACT, color: SUCCESS, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>已套用</span>
          {t && <span style={{ color: TEXT_MUTED }}>at {t}</span>}
          {action.subjectLabel && (
            <span style={{ color: TEXT_DIM }}>— {action.subjectLabel}</span>
          )}
        </div>
      );
    }

    case 'rejected': {
      const t = fmtTime(action.finalizedAt);
      const reason = action.rejectReason && action.rejectReason.trim() !== '' ? action.rejectReason : '無';
      return (
        <div
          data-testid="action-card-rejected"
          style={{ ...ROW_COMPACT, color: TEXT_DIM, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>已拒絕（{reason}）</span>
          {t && <span style={{ color: TEXT_MUTED }}>at {t}</span>}
        </div>
      );
    }

    case 'stale':
      return (
        <div
          data-testid="action-card-stale"
          style={{
            ...CARD_BASE,
            background: 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${WARNING}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: WARNING,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            畫布已變動，仍要套用？
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{action.humanSummary}</div>
          {action.subjectLabel && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4 }}>{action.subjectLabel}</div>
          )}
          {action.rationale && action.rationale.trim() !== '' && (
            <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 6 }}>{action.rationale}</div>
          )}
          {RawArgs}
          {!showRejectForm ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void onForceApply()}
                style={{ ...BUTTON_BASE, background: WARNING, color: '#0f172a' }}
              >
                仍要套用
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                style={{
                  ...BUTTON_BASE,
                  background: 'transparent',
                  border: `1px solid ${BORDER_COLOR}`,
                  color: TEXT_DIM,
                }}
              >
                拒絕
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: TEXT_DIM }}>為什麼拒絕？(可選)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 4,
                  color: TEXT_MAIN,
                  fontSize: 11,
                  padding: '4px 6px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleRejectSubmit}
                  style={{ ...BUTTON_BASE, background: ERROR, color: '#fff' }}
                >
                  確認
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason('');
                  }}
                  style={{
                    ...BUTTON_BASE,
                    background: 'transparent',
                    border: `1px solid ${BORDER_COLOR}`,
                    color: TEXT_DIM,
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      );

    case 'failed': {
      const errMsg = action.errorEnvelope?.message ?? '套用失敗';
      return (
        <div
          data-testid="action-card-failed"
          style={{
            ...CARD_BASE,
            background: 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${ERROR}`,
          }}
        >
          <div style={{ fontSize: 11, color: ERROR, fontWeight: 600, marginBottom: 6 }}>
            套用失敗
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{action.humanSummary}</div>
          {action.subjectLabel && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4 }}>{action.subjectLabel}</div>
          )}
          <div style={{ color: '#fecaca', fontSize: 11, marginBottom: 6 }}>{errMsg}</div>
          {RawArgs}
          {!showRejectForm ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                style={{
                  ...BUTTON_BASE,
                  background: 'transparent',
                  border: `1px solid ${BORDER_COLOR}`,
                  color: TEXT_DIM,
                }}
              >
                拒絕
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: TEXT_DIM }}>為什麼拒絕？(可選)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 4,
                  color: TEXT_MAIN,
                  fontSize: 11,
                  padding: '4px 6px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleRejectSubmit}
                  style={{ ...BUTTON_BASE, background: ERROR, color: '#fff' }}
                >
                  確認
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason('');
                  }}
                  style={{
                    ...BUTTON_BASE,
                    background: 'transparent',
                    border: `1px solid ${BORDER_COLOR}`,
                    color: TEXT_DIM,
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
};
