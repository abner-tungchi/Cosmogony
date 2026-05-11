import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuditLog, type AuditLogEntry } from '../audit/auditLog.js';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'audit-test-'));
});

afterEach(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function mkEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    schemaVersion: 1,
    toolVersion: '1.0.0',
    eventType: 'propose',
    timestamp: '2026-05-11T12:00:00.000Z',
    sessionId: 'sess-1',
    messageId: 'msg-1',
    actionId: 'act-1',
    toolName: 'es_add_note',
    args: { type: 'DomainEvent', label: 'X' },
    status: 'pending',
    baseHash: 'h1',
    baseProjectVersion: '2026-05-11T00:00:00.000Z',
    forceApply: null,
    errorEnvelope: null,
    resultJson: null,
    ...overrides,
  };
}

describe('createAuditLog', () => {
  it('returns object with .append', () => {
    const log = createAuditLog({ dataDir });
    expect(typeof log.append).toBe('function');
  });

  it('first append creates the dir and writes one JSON line', async () => {
    const subDir = join(dataDir, 'nested', 'audit');
    const log = createAuditLog({ dataDir: subDir });
    const entry = mkEntry();
    await log.append(entry);

    expect(existsSync(subDir)).toBe(true);
    const expectedFile = join(subDir, 'audit-2026-05-11.jsonl');
    const content = readFileSync(expectedFile, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.actionId).toBe('act-1');
    expect(parsed.schemaVersion).toBe(1);
  });

  it('two appends on same day → two lines in same file', async () => {
    const log = createAuditLog({ dataDir });
    await log.append(mkEntry({ actionId: 'a1' }));
    await log.append(mkEntry({ actionId: 'a2' }));
    const file = join(dataDir, 'audit-2026-05-11.jsonl');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const ids = lines.map((l) => JSON.parse(l).actionId);
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('appends on different days → two separate files', async () => {
    const log = createAuditLog({ dataDir });
    await log.append(mkEntry({ timestamp: '2026-05-11T01:00:00.000Z', actionId: 'a1' }));
    await log.append(mkEntry({ timestamp: '2026-05-12T01:00:00.000Z', actionId: 'a2' }));
    const files = readdirSync(dataDir).sort();
    expect(files).toEqual(['audit-2026-05-11.jsonl', 'audit-2026-05-12.jsonl']);
  });

  it('written line has schemaVersion === 1', async () => {
    const log = createAuditLog({ dataDir });
    await log.append(mkEntry());
    const file = join(dataDir, 'audit-2026-05-11.jsonl');
    const parsed = JSON.parse(readFileSync(file, 'utf8').trim());
    expect(parsed.schemaVersion).toBe(1);
  });

  it('concurrent appends → all lines present (mutex serialization)', async () => {
    const log = createAuditLog({ dataDir });
    await Promise.all([
      log.append(mkEntry({ actionId: 'c1' })),
      log.append(mkEntry({ actionId: 'c2' })),
      log.append(mkEntry({ actionId: 'c3' })),
    ]);
    const file = join(dataDir, 'audit-2026-05-11.jsonl');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const ids = lines.map((l) => JSON.parse(l).actionId).sort();
    expect(ids).toEqual(['c1', 'c2', 'c3']);
  });

  it('fail-soft: invalid path (null byte) does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createAuditLog({ dataDir: '\0bad-dir' });
    await expect(log.append(mkEntry())).resolves.not.toThrow();
    warn.mockRestore();
  });
});
