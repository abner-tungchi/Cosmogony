import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpTools, commitHandlerResult, type CommitDeps } from '../mcpAdapter.js';
import type { ToolDefinition } from '../toolDefinitions.js';
import type { ToolHandler, ToolHandlerResult } from '../handlers.js';

type Callback = (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

interface MockServer {
  registered: Map<string, Callback>;
  tool: (name: string, desc: string, schema: unknown, cb: Callback) => void;
}

function makeMockServer(): MockServer {
  const registered = new Map<string, Callback>();
  return {
    registered,
    tool(name: string, _desc: string, _schema: unknown, cb: Callback) {
      registered.set(name, cb);
    },
  };
}

function makeDeps(calls: string[]) {
  return {
    loadProjectFromRelay: async () => {
      calls.push('load');
    },
    saveProject: () => {
      calls.push('save');
    },
    syncProjectToRelay: async () => {
      calls.push('sync');
    },
    broadcast: async (action: string) => {
      calls.push(`bcast:${action}`);
    },
    getProjectState: () => ({}),
  };
}

function defOf(
  name: string,
  policy: ToolDefinition['policy'],
  handler: ToolHandler<unknown>,
): ToolDefinition {
  return {
    name,
    description: 'test',
    schema: {},
    handler,
    policy,
    risk: 'unset',
  };
}

const okEmpty: ToolHandlerResult = { ok: true, resultJson: 'ok', events: [] };

describe('registerMcpTools', () => {
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it('standard policy: load → save → sync → post-commit broadcast', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'ok',
      events: [{ phase: 'post-commit', action: 'add_note', payload: {} }],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'standard', handler)], makeDeps(calls));
    await server.registered.get('t')!({});
    expect(calls).toEqual(['load', 'save', 'sync', 'bcast:add_note']);
  });

  it('pre-commit-only policy: load → broadcasts → save → sync', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'ok',
      events: [
        { phase: 'pre-commit', action: 'a', payload: {} },
        { phase: 'pre-commit', action: 'b', payload: {} },
      ],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'pre-commit-only', handler)], makeDeps(calls));
    await server.registered.get('t')!({});
    expect(calls).toEqual(['load', 'bcast:a', 'bcast:b', 'save', 'sync']);
  });

  it('mixed policy: load → pre-broadcast → save → sync → post-broadcasts', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'ok',
      events: [
        { phase: 'pre-commit', action: 'pre', payload: {} },
        { phase: 'post-commit', action: 'post1', payload: {} },
        { phase: 'post-commit', action: 'post2', payload: {} },
      ],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'mixed', handler)], makeDeps(calls));
    await server.registered.get('t')!({});
    expect(calls).toEqual(['load', 'bcast:pre', 'save', 'sync', 'bcast:post1', 'bcast:post2']);
  });

  it('no-broadcast policy: load → save → sync (no broadcast)', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => okEmpty;
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'no-broadcast', handler)], makeDeps(calls));
    await server.registered.get('t')!({});
    expect(calls).toEqual(['load', 'save', 'sync']);
  });

  it('read-only policy: load only (no save/sync/broadcast)', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({ ok: true, resultJson: { items: [] }, events: [] });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'read-only', handler)], makeDeps(calls));
    const out = await server.registered.get('t')!({});
    expect(calls).toEqual(['load']);
    expect(out.content[0].type).toBe('text');
    expect(JSON.parse(out.content[0].text)).toEqual({ items: [] });
  });

  it('error path: ok=false returns text and skips save/sync/broadcast', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({
      ok: false,
      resultJson: null,
      events: [],
      error: { code: 'NOT_FOUND', message: 'Note nope not found.' },
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'standard', handler)], makeDeps(calls));
    const out = await server.registered.get('t')!({});
    expect(calls).toEqual(['load']);
    expect(out.content[0].text).toBe('Note nope not found.');
  });

  it('dev-mode invariant: read-only handler emitting events throws', async () => {
    process.env.NODE_ENV = 'development';
    const server = makeMockServer();
    const calls: string[] = [];
    const badHandler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'x',
      events: [{ phase: 'post-commit', action: 'oops', payload: {} }],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'read-only', badHandler)], makeDeps(calls));
    await expect(server.registered.get('t')!({})).rejects.toThrow(/read-only handler/);
  });

  it('dev-mode invariant: pre-commit-only handler emitting post-commit throws', async () => {
    process.env.NODE_ENV = 'development';
    const server = makeMockServer();
    const calls: string[] = [];
    const badHandler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'x',
      events: [{ phase: 'post-commit', action: 'oops', payload: {} }],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'pre-commit-only', badHandler)], makeDeps(calls));
    await expect(server.registered.get('t')!({})).rejects.toThrow(/pre-commit-only handler/);
  });

  it('dev-mode invariant: no-broadcast handler emitting events throws', async () => {
    process.env.NODE_ENV = 'development';
    const server = makeMockServer();
    const calls: string[] = [];
    const badHandler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: 'x',
      events: [{ phase: 'pre-commit', action: 'oops', payload: {} }],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'no-broadcast', badHandler)], makeDeps(calls));
    await expect(server.registered.get('t')!({})).rejects.toThrow(/no-broadcast handler/);
  });

  it('textFromResult: object → JSON string', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({
      ok: true,
      resultJson: { id: 'x' },
      events: [],
    });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'no-broadcast', handler)], makeDeps(calls));
    const out = await server.registered.get('t')!({});
    expect(JSON.parse(out.content[0].text)).toEqual({ id: 'x' });
  });

  it('textFromResult: null → empty string', async () => {
    const server = makeMockServer();
    const calls: string[] = [];
    const handler: ToolHandler<unknown> = () => ({ ok: true, resultJson: null, events: [] });
    registerMcpTools(server as unknown as McpServer, [defOf('t', 'no-broadcast', handler)], makeDeps(calls));
    const out = await server.registered.get('t')!({});
    expect(out.content[0].text).toBe('');
  });
});

describe('commitHandlerResult (single source of truth, Spec B §8a)', () => {
  it('dispatches pre-commit before save then post-commit in order', async () => {
    const order: string[] = [];
    const deps: CommitDeps = {
      saveProject: () => order.push('save'),
      syncProjectToRelay: async () => {
        order.push('sync');
      },
      broadcast: async (action) => {
        order.push(`broadcast:${action}`);
      },
    };
    const result: ToolHandlerResult = {
      ok: true,
      resultJson: null,
      events: [
        { phase: 'pre-commit', action: 'pre-A', payload: {} },
        { phase: 'post-commit', action: 'post-A', payload: {} },
        { phase: 'post-commit', action: 'post-B', payload: {} },
      ],
    };
    await commitHandlerResult('test_tool', result, 'mixed', deps);
    expect(order).toEqual([
      'broadcast:pre-A',
      'save',
      'sync',
      'broadcast:post-A',
      'broadcast:post-B',
    ]);
  });

  it('skips everything for read-only policy', async () => {
    let calls = 0;
    const deps: CommitDeps = {
      saveProject: () => {
        calls++;
      },
      syncProjectToRelay: async () => {
        calls++;
      },
      broadcast: async () => {
        calls++;
      },
    };
    await commitHandlerResult(
      'es_get_project',
      { ok: true, resultJson: { x: 1 }, events: [] },
      'read-only',
      deps,
    );
    expect(calls).toBe(0);
  });
});
