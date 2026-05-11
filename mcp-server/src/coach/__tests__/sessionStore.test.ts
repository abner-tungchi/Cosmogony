import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoachSessionStore } from '../sessionStore.js';
import type { CoachMessage } from '../types.js';

let store: CoachSessionStore;
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'coach-test-'));
  store = new CoachSessionStore({ dataDir });
});

afterEach(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

const mkMsg = (content: string): CoachMessage => ({
  id: Math.random().toString(36).slice(2),
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
});

describe('CoachSessionStore', () => {
  it('createSession 後可讀回', async () => {
    const s = await store.createSession('user-A');
    const got = await store.getSession('user-A', s.id);
    expect(got).not.toBeNull();
    expect(got?.userId).toBe('user-A');
    expect(got?.messages).toEqual([]);
  });

  it('跨 user 取 session 回 null（隔離）', async () => {
    const s = await store.createSession('user-A');
    const got = await store.getSession('user-B', s.id);
    expect(got).toBeNull();
  });

  it('appendMessages 序列化並發寫入不丟訊息', async () => {
    const s = await store.createSession('user-A');
    // 並發 5 次 append，每次 2 則
    const tasks = Array.from({ length: 5 }, (_, i) =>
      store.appendMessages('user-A', s.id, [mkMsg(`u${i}`), mkMsg(`a${i}`)]),
    );
    await Promise.all(tasks);
    const got = await store.getSession('user-A', s.id);
    expect(got).not.toBeNull();
    expect(got!.messages.length).toBe(10);
  });

  it('appendMessages 跨 user forbidden', async () => {
    const s = await store.createSession('user-A');
    await expect(
      store.appendMessages('user-B', s.id, [mkMsg('hi')]),
    ).rejects.toThrow();
  });

  it('listSessions 只回傳該 user 自己的 sessions', async () => {
    const a1 = await store.createSession('user-A');
    const a2 = await store.createSession('user-A');
    await store.createSession('user-B');
    const list = await store.listSessions('user-A');
    expect(list.map((m) => m.id).sort()).toEqual([a1.id, a2.id].sort());
  });

  it('archiveSession 後 listSessions 不顯示', async () => {
    const s = await store.createSession('user-A');
    await store.archiveSession('user-A', s.id);
    const list = await store.listSessions('user-A');
    expect(list.find((m) => m.id === s.id)).toBeUndefined();
    // 但 getSession 仍可讀（標 archived）
    const got = await store.getSession('user-A', s.id);
    expect(got?.archived).toBe(true);
  });
});
