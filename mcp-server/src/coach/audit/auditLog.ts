import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Mutex } from 'async-mutex';
import type { ErrorEnvelope, ProposedActionStatus } from '../types.js';

export interface AuditLogEntry {
  schemaVersion: 1; // Spec C 升 v2 加 inversePatch
  toolVersion: string;
  eventType:
    | 'propose'
    | 'confirm'
    | 'reject'
    | 'auto_exec_read'
    | 'intent_gate_blocked'
    | 'force_apply'
    | 'failed';
  timestamp: string;
  sessionId: string;
  messageId: string | null;
  actionId: string | null;
  toolName: string;
  args: Record<string, unknown>;
  status: ProposedActionStatus | 'auto_exec' | 'gate_blocked';
  baseHash: string;
  baseProjectVersion: string;
  forceApply: boolean | null;
  errorEnvelope: ErrorEnvelope | null;
  resultJson: unknown | null;
}

export interface AuditLog {
  append(entry: AuditLogEntry): Promise<void>;
}

export interface CreateAuditLogOpts {
  /** Directory under which `audit-YYYY-MM-DD.jsonl` files are written. */
  dataDir: string;
}

export function createAuditLog(opts: CreateAuditLogOpts): AuditLog {
  const mutex = new Mutex();
  let dirEnsured = false;

  const ensureDir = () => {
    if (dirEnsured) return;
    mkdirSync(opts.dataDir, { recursive: true });
    dirEnsured = true;
  };

  const fileForDate = (ts: string): string => {
    const day = ts.slice(0, 10); // YYYY-MM-DD
    return resolve(opts.dataDir, `audit-${day}.jsonl`);
  };

  return {
    async append(entry) {
      await mutex.runExclusive(() => {
        try {
          ensureDir();
          const path = fileForDate(entry.timestamp);
          appendFileSync(path, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
        } catch (err) {
          // Fail-soft per spec: do not throw; emit warning so flow continues.
          // eslint-disable-next-line no-console
          console.warn('[auditLog] append failed:', (err as Error).message);
        }
      });
    },
  };
}
