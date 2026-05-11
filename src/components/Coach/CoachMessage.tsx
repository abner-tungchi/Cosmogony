import React from 'react';
import type { CoachMessage as CoachMessageType } from '../../types/coach';

interface CoachMessageProps {
  message: CoachMessageType;
}

const USER_BG = 'rgba(96, 165, 250, 0.15)';
const ASSISTANT_BG = 'rgba(255, 255, 255, 0.06)';
const SYSTEM_BG = 'rgba(255, 255, 255, 0.03)';
const TEXT_MAIN = 'rgba(255, 255, 255, 0.92)';
const TEXT_MUTED = 'rgba(255, 255, 255, 0.4)';

export const CoachMessage: React.FC<CoachMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const aborted = message.metadata?.aborted;

  const bg = isSystem ? SYSTEM_BG : isUser ? USER_BG : ASSISTANT_BG;
  const align = isUser ? 'flex-end' : 'flex-start';
  const maxWidth = isSystem ? '100%' : '90%';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth,
          background: bg,
          color: TEXT_MAIN,
          fontSize: 13,
          lineHeight: 1.5,
          padding: '8px 12px',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontStyle: isSystem ? 'italic' : 'normal',
          opacity: aborted ? 0.6 : 1,
        }}
      >
        {message.content}
        {aborted && (
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>（已取消）</div>
        )}
      </div>
    </div>
  );
};
