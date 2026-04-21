import React, { useState } from 'react';
import { useBoardStore, selectActiveBoard } from '../../store/boardStore';
import { exportToMarkdown } from '../../utils/markdownExporter';
import { exportBoardToJson } from '../../utils/jsonExporter';
import { buildAiHandoffPrompt } from '../../utils/aiPromptBuilder';

interface Props {
  onClose: () => void;
}

export const ExportModal: React.FC<Props> = ({ onClose }) => {
  const activeBoard = useBoardStore(selectActiveBoard);
  const markdown = exportToMarkdown(activeBoard);
  const [copied, setCopied] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBoard.name.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const useCases = exportBoardToJson(activeBoard);
    const jsonStr = JSON.stringify(useCases, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBoard.name.replace(/\s+/g, '_')}_usecases.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: 24,
          width: '80%',
          maxWidth: 800,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          border: '1px solid #334155',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>
            Export Markdown — {activeBoard.name}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        <pre
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: 16,
            color: '#94a3b8',
            fontSize: 13,
            overflowY: 'auto',
            flex: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
          }}
        >
          {markdown}
        </pre>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#16a34a' : '#334155',
              border: '1px solid #475569',
              borderRadius: 8,
              color: '#f1f5f9',
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 14,
            }}
          >
            {copied ? 'Copied!' : 'Copy Markdown'}
          </button>
          <button
            onClick={() => {
              const prompt = buildAiHandoffPrompt(activeBoard);
              navigator.clipboard.writeText(prompt).then(() => {
                setCopiedAi(true);
                setTimeout(() => setCopiedAi(false), 2000);
              });
            }}
            title="Copy a prompt with board JSON + Markdown for AI handoff"
            style={{
              background: copiedAi ? '#16a34a' : '#1d4ed8',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {copiedAi ? 'Copied!' : 'Copy AI Prompt'}
          </button>
          <button
            onClick={handleDownload}
            style={{
              background: '#0f766e',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Download .md
          </button>
          <button
            onClick={handleDownloadJson}
            style={{
              background: '#7c3aed',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
};
