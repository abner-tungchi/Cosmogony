import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nanoid } from 'nanoid';
import type { CoachMessage, CoachSession, SessionMeta } from './types.js';

interface IndexFile {
  byUser: Record<string, string[]>;
}

interface CoachSessionStoreOptions {
  dataDir: string;
}

export class CoachSessionStore {
  private readonly dataDir: string;
  private readonly sessionsDir: string;
  private readonly indexPath: string;

  // per-session mutex chain (read-modify-write 整段串行)
  private readonly sessionMutex: Map<string, Promise<unknown>> = new Map();
  // index.json 單一 mutex
  private indexMutex: Promise<unknown> = Promise.resolve();

  constructor(opts: CoachSessionStoreOptions) {
    this.dataDir = resolve(opts.dataDir);
    this.sessionsDir = join(this.dataDir, 'sessions');
    this.indexPath = join(this.dataDir, 'index.json');
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
    if (!existsSync(this.indexPath)) {
      // best-effort init
      try {
        // eslint-disable-next-line no-sync
        require('node:fs').writeFileSync(this.indexPath, JSON.stringify({ byUser: {} }, null, 2));
      } catch {
        // ignore
      }
    }
  }

  private sessionPath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  private async writeAtomic(path: string, content: string): Promise<void> {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, path);
  }

  private async readSessionFile(sessionId: string): Promise<CoachSession | null> {
    try {
      const raw = await fs.readFile(this.sessionPath(sessionId), 'utf8');
      return JSON.parse(raw) as CoachSession;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async readIndex(): Promise<IndexFile> {
    try {
      const raw = await fs.readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<IndexFile>;
      return { byUser: parsed.byUser ?? {} };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byUser: {} };
      throw err;
    }
  }

  private async withSessionMutex<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sessionMutex.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn);
    const tracker = next.catch(() => undefined);
    this.sessionMutex.set(sessionId, tracker);
    // 完成後清理 — 若該 sessionId 仍是當前 chain 才 delete（避免清掉後續排隊的 task）
    void tracker.then(() => {
      if (this.sessionMutex.get(sessionId) === tracker) {
        this.sessionMutex.delete(sessionId);
      }
    });
    return next;
  }

  private async withIndexMutex<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.indexMutex;
    const next = prev.then(fn);
    this.indexMutex = next.catch(() => undefined);
    return next;
  }

  async createSession(userId: string): Promise<CoachSession> {
    const id = nanoid();
    const now = new Date().toISOString();
    const session: CoachSession = {
      id,
      userId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.withSessionMutex(id, () => this.writeAtomic(this.sessionPath(id), JSON.stringify(session, null, 2)));
    await this.withIndexMutex(async () => {
      const idx = await this.readIndex();
      const list = idx.byUser[userId] ?? [];
      list.push(id);
      idx.byUser[userId] = list;
      await this.writeAtomic(this.indexPath, JSON.stringify(idx, null, 2));
    });
    return session;
  }

  async getSession(userId: string, sessionId: string): Promise<CoachSession | null> {
    return this.withSessionMutex(sessionId, async () => {
      const session = await this.readSessionFile(sessionId);
      if (!session) return null;
      if (session.userId !== userId) return null;
      return session;
    });
  }

  async appendMessages(userId: string, sessionId: string, msgs: CoachMessage[]): Promise<void> {
    await this.withSessionMutex(sessionId, async () => {
      const session = await this.readSessionFile(sessionId);
      if (!session) throw new Error('session not found');
      if (session.userId !== userId) throw new Error('forbidden');
      session.messages.push(...msgs);
      session.updatedAt = new Date().toISOString();
      await this.writeAtomic(this.sessionPath(sessionId), JSON.stringify(session, null, 2));
    });
  }

  async listSessions(userId: string): Promise<SessionMeta[]> {
    const idx = await this.readIndex();
    const ids = idx.byUser[userId] ?? [];
    const metas: SessionMeta[] = [];
    for (const id of ids) {
      try {
        const s = await this.readSessionFile(id);
        if (!s || s.userId !== userId) continue;
        if (s.archived) continue;
        const firstUser = s.messages.find((m) => m.role === 'user');
        const preview = firstUser
          ? firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 60)
          : undefined;
        metas.push({
          id: s.id,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
          firstUserMessagePreview: preview,
        });
      } catch {
        // 個別 session 讀失敗不擋整體列表
      }
    }
    metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return metas;
  }

  async archiveSession(userId: string, sessionId: string): Promise<void> {
    await this.withSessionMutex(sessionId, async () => {
      const session = await this.readSessionFile(sessionId);
      if (!session) throw new Error('session not found');
      if (session.userId !== userId) throw new Error('forbidden');
      session.archived = true;
      session.updatedAt = new Date().toISOString();
      await this.writeAtomic(this.sessionPath(sessionId), JSON.stringify(session, null, 2));
    });
  }
}
