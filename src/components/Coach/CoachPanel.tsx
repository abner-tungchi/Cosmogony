import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCoachStore } from '../../store/coachStore';
import { CoachMessage } from './CoachMessage';
import { ActionCard } from './ActionCard';
import { PendingTray } from './PendingTray';
import type { SessionMeta } from '../../utils/coachApi';

interface CoachPanelProps {
  height: number;
  width: number;
}

const PANEL_BG = '#1e293b';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.08)';
const TEXT_MAIN = 'rgba(255, 255, 255, 0.92)';
const TEXT_DIM = 'rgba(255, 255, 255, 0.6)';
const TEXT_MUTED = 'rgba(255, 255, 255, 0.4)';
const ACCENT = '#60a5fa';
const ERROR_BG = 'rgba(239, 68, 68, 0.12)';
const ERROR_BORDER = 'rgba(239, 68, 68, 0.4)';

export const CoachPanel: React.FC<CoachPanelProps> = ({ height }) => {
  const messages = useCoachStore((s) => s.messages);
  const isStreaming = useCoachStore((s) => s.isStreaming);
  const error = useCoachStore((s) => s.error);
  const attachSnapshot = useCoachStore((s) => s.attachSnapshot);
  const setAttachSnapshot = useCoachStore((s) => s.setAttachSnapshot);
  const sendMessage = useCoachStore((s) => s.sendMessage);
  const startNewSession = useCoachStore((s) => s.startNewSession);
  const archiveCurrentSession = useCoachStore((s) => s.archiveCurrentSession);
  const switchToSession = useCoachStore((s) => s.switchToSession);
  const loadSessionList = useCoachStore((s) => s.loadSessionList);
  const sessionList = useCoachStore((s) => s.sessionList);
  const sessionListLoading = useCoachStore((s) => s.sessionListLoading);
  const currentSessionId = useCoachStore((s) => s.currentSessionId);
  const cancel = useCoachStore((s) => s.cancel);
  const selectedModel = useCoachStore((s) => s.selectedModel);
  const defaultModel = useCoachStore((s) => s.defaultModel);
  const availableModels = useCoachStore((s) => s.availableModels);
  const setSelectedModel = useCoachStore((s) => s.setSelectedModel);
  const pendingActionIds = useCoachStore((s) => s.pendingActionIds);
  const applyAllPending = useCoachStore((s) => s.applyAllPending);
  const rejectAllPending = useCoachStore((s) => s.rejectAllPending);

  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // StrictMode-safe via in-store loadingPromise guard
    void useCoachStore
      .getState()
      .loadCurrentSession()
      .then(() => {
        void useCoachStore.getState().reconcilePending();
      });
    void useCoachStore.getState().loadAvailableModels();
  }, []);

  // 點 popover 外面 / Esc 自動關閉 model menu
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [modelMenuOpen]);

  // 點 popover 外面 / 按 Esc 自動關閉歷史對話下拉
  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [historyOpen]);

  const toggleHistory = () => {
    if (!historyOpen) {
      void loadSessionList();
    }
    setHistoryOpen((v) => !v);
  };

  const onPickSession = async (id: string) => {
    setHistoryOpen(false);
    await switchToSession(id);
  };

  const onArchiveCurrent = async () => {
    if (!confirm('封存當前對話？封存後不會出現在歷史列表，但 JSON 檔仍保留。')) return;
    setHistoryOpen(false);
    await archiveCurrentSession();
  };

  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isStreaming]);

  const onSend = () => {
    if (!draft.trim() || isStreaming) return;
    void sendMessage(draft);
    setDraft('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: PANEL_BG,
        borderTop: `1px solid ${BORDER_COLOR}`,
        // 與 DetailPanel 對稱的 height 動畫，避免 DetailPanel 滑入時 CoachPanel 瞬間跳動
        transition: 'height 240ms cubic-bezier(0,0,0.2,1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>🤖 AI Coach</div>
          <div style={{ display: 'flex', gap: 4 }} ref={historyRef}>
            <button
              onClick={() => startNewSession()}
              style={{
                background: 'transparent',
                border: `1px solid ${BORDER_COLOR}`,
                color: TEXT_DIM,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="開新對話（不會封存當前對話）"
            >
              + 新對話
            </button>
            <button
              onClick={toggleHistory}
              style={{
                background: historyOpen ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                border: `1px solid ${BORDER_COLOR}`,
                color: TEXT_DIM,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="切換歷史對話"
            >
              歷史 ▾
            </button>
            {historyOpen && (
              <SessionsPopover
                list={sessionList}
                loading={sessionListLoading}
                currentId={currentSessionId}
                onPick={onPickSession}
                onArchive={onArchiveCurrent}
              />
            )}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TEXT_DIM, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={attachSnapshot}
            onChange={(e) => setAttachSnapshot(e.target.checked)}
            style={{ margin: 0, cursor: 'pointer' }}
          />
          <span>附帶 board snapshot</span>
        </label>
        <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4 }}>
          對話與 board summary 會送至 Google Gemini
        </div>

        <div style={{ position: 'relative' }} ref={modelMenuRef}>
          <button
            onClick={() => setModelMenuOpen((v) => !v)}
            style={{
              background: modelMenuOpen ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_DIM,
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            title="切換 model（每次發送都生效，不需重啟）"
          >
            <span>
              <span style={{ color: TEXT_MUTED }}>Model：</span>
              <span style={{ color: TEXT_MAIN }}>{shortenModelName(selectedModel ?? defaultModel ?? 'loading...')}</span>
              {selectedModel === null && defaultModel && (
                <span style={{ color: TEXT_MUTED }}> (預設)</span>
              )}
            </span>
            <span>▾</span>
          </button>
          {modelMenuOpen && (
            <ModelMenu
              available={availableModels}
              selected={selectedModel}
              defaultModel={defaultModel}
              onPick={(m) => {
                setSelectedModel(m);
                setModelMenuOpen(false);
              }}
            />
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px 14px',
        }}
      >
        <PendingTray
          pendingCount={pendingActionIds.length}
          onApplyAll={applyAllPending}
          onRejectAll={rejectAllPending}
        />
        {messages.length === 0 && !isStreaming && (
          <div style={{ color: TEXT_MUTED, fontSize: 12, textAlign: 'center', padding: '20px 0', lineHeight: 1.6 }}>
            問我關於 DDD、Aggregate、Invariant 設計的任何問題。<br />
            我會看你目前的 board 狀態給建議。
          </div>
        )}
        {messages.map((m) => {
          const actions = m.role === 'assistant' ? m.metadata?.proposedActions : undefined;
          return (
            <React.Fragment key={m.id}>
              <CoachMessage message={m} />
              {actions && actions.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '0 12px',
                    marginBottom: 10,
                  }}
                >
                  {actions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onApply={() => useCoachStore.getState().applyAction(action.id)}
                      onReject={(reason) => useCoachStore.getState().rejectAction(action.id, reason)}
                      onForceApply={() => useCoachStore.getState().forceApplyAction(action.id)}
                    />
                  ))}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
        {isStreaming && (
          <div style={{ color: TEXT_MUTED, fontSize: 12, padding: '4px 0', display: 'flex', gap: 4 }}>
            <span className="coach-dot">●</span>
            <span className="coach-dot" style={{ animationDelay: '0.2s' }}>●</span>
            <span className="coach-dot" style={{ animationDelay: '0.4s' }}>●</span>
          </div>
        )}
        {error && (
          <div
            style={{
              background: ERROR_BG,
              border: `1px solid ${ERROR_BORDER}`,
              color: '#fecaca',
              fontSize: 12,
              padding: '8px 10px',
              borderRadius: 4,
              marginTop: 8,
            }}
          >
            錯誤：{error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: 10,
          borderTop: `1px solid ${BORDER_COLOR}`,
          display: 'flex',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="問 Coach…（Cmd/Ctrl+Enter 送出）"
          rows={2}
          disabled={isStreaming}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.06)',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 4,
            color: TEXT_MAIN,
            fontSize: 12,
            padding: '6px 8px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
          }}
        />
        {isStreaming ? (
          <button
            onClick={cancel}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${ERROR_BORDER}`,
              color: '#fecaca',
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 4,
              cursor: 'pointer',
              minWidth: 60,
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!draft.trim()}
            style={{
              background: draft.trim() ? ACCENT : 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: draft.trim() ? '#0f172a' : TEXT_MUTED,
              fontSize: 12,
              fontWeight: 600,
              padding: '0 12px',
              borderRadius: 4,
              cursor: draft.trim() ? 'pointer' : 'default',
              minWidth: 60,
            }}
          >
            Send
          </button>
        )}
      </div>

      <style>{`
        .coach-dot {
          animation: coach-pulse 1.2s ease-in-out infinite;
          opacity: 0.4;
        }
        @keyframes coach-pulse {
          0%, 80%, 100% { opacity: 0.4; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

function shortenModelName(name: string): string {
  return name.replace(/^gemini-/, '').replace(/-preview$/, '');
}

interface ModelMenuProps {
  available: string[];
  selected: string | null;
  defaultModel: string | null;
  onPick: (model: string | null) => void;
}

const ModelMenu: React.FC<ModelMenuProps> = ({ available, selected, defaultModel, onPick }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        background: '#0f172a',
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 200,
        overflow: 'hidden',
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      <ModelOption
        label={`使用預設${defaultModel ? `（${shortenModelName(defaultModel)}）` : ''}`}
        active={selected === null}
        onClick={() => onPick(null)}
      />
      <div style={{ height: 1, background: BORDER_COLOR }} />
      {available.length === 0 && (
        <div style={{ padding: 10, fontSize: 11, color: TEXT_MUTED, textAlign: 'center' }}>載入中…</div>
      )}
      {available.map((m) => (
        <ModelOption
          key={m}
          label={shortenModelName(m)}
          subtitle={m}
          active={selected === m}
          onClick={() => onPick(m)}
        />
      ))}
    </div>
  );
};

const ModelOption: React.FC<{ label: string; subtitle?: string; active: boolean; onClick: () => void }> = ({ label, subtitle, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block',
      width: '100%',
      textAlign: 'left',
      padding: '8px 10px',
      background: active ? 'rgba(96, 165, 250, 0.12)' : 'transparent',
      border: 'none',
      color: TEXT_MAIN,
      cursor: 'pointer',
      fontSize: 12,
    }}
    onMouseEnter={(e) => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
    }}
    onMouseLeave={(e) => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
    }}
  >
    <div style={{ fontWeight: active ? 600 : 400 }}>
      {active && <span style={{ marginRight: 4 }}>✓</span>}
      {label}
    </div>
    {subtitle && (
      <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>{subtitle}</div>
    )}
  </button>
);

interface SessionsPopoverProps {
  list: SessionMeta[];
  loading: boolean;
  currentId: string | null;
  onPick: (id: string) => void;
  onArchive: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const SessionsPopover: React.FC<SessionsPopoverProps> = ({ list, loading, currentId, onPick, onArchive }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        width: 280,
        maxHeight: 360,
        background: '#0f172a',
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          fontSize: 10,
          fontWeight: 600,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        歷史對話
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 12, fontSize: 11, color: TEXT_MUTED, textAlign: 'center' }}>載入中…</div>
        )}
        {!loading && list.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: TEXT_MUTED, textAlign: 'center' }}>沒有歷史對話</div>
        )}
        {!loading &&
          list.map((s) => {
            const isCurrent = s.id === currentId;
            const preview = s.firstUserMessagePreview || `(${s.messageCount} 則訊息)`;
            return (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: isCurrent ? 'rgba(96, 165, 250, 0.12)' : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${BORDER_COLOR}`,
                  color: TEXT_MAIN,
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, color: TEXT_MUTED, marginBottom: 2 }}>
                  <span>{formatTimestamp(s.updatedAt)}</span>
                  <span>{s.messageCount} 則{isCurrent ? ' · 目前' : ''}</span>
                </div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>
              </button>
            );
          })}
      </div>
      {currentId && (
        <button
          onClick={onArchive}
          style={{
            padding: '8px 10px',
            background: 'transparent',
            border: 'none',
            borderTop: `1px solid ${BORDER_COLOR}`,
            color: 'rgba(252, 165, 165, 0.8)',
            fontSize: 11,
            cursor: 'pointer',
            textAlign: 'center',
          }}
          title="封存後不再出現在歷史列表，但檔案仍保留"
        >
          封存當前對話
        </button>
      )}
    </div>
  );
};
