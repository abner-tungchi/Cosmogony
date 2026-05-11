// Adapter that wires pure handlers (handlers.ts) onto an MCP server.
//
// Adapter responsibilities:
//   1. loadProjectFromRelay() before each handler call.
//   2. Invoke handler(args, ctx) to mutate ctx.projectState.
//   3. Translate ok=false → MCP text error; otherwise dispatch broadcast +
//      saveProject + syncProjectToRelay per policy.
//   4. Convert handler resultJson → MCP text content.
//
// Spec A: zero-functional-change — preserves the broadcast phase ordering of
// every existing tool.
//
// Spec B (§8a, audit HIGH-1): commit pipeline (pre-commit broadcast → save →
// sync → post-commit broadcast) is extracted into `commitHandlerResult` so that
// both `registerMcpTools` and `pendingActions.confirm` go through one
// single source of truth.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommitBroadcastPolicy, ToolDefinition } from './toolDefinitions.js';
import type { ToolHandler, ToolHandlerResult } from './handlers.js';

export interface CommitDeps {
  saveProject: () => void;
  syncProjectToRelay: () => Promise<void>;
  broadcast: (action: string, payload: unknown, excludeId?: string) => Promise<void>;
}

export interface McpAdapterDeps {
  loadProjectFromRelay: () => Promise<void>;
  saveProject: () => void;
  syncProjectToRelay: () => Promise<void>;
  broadcast: (action: string, payload: unknown, excludeId?: string) => Promise<void>;
  /**
   * Mutable handle to the in-memory project state. Adapter passes this into
   * the handler ctx so mutations propagate back to the index.ts module-scope
   * `projectState`. Required because index.ts reassigns `projectState` after
   * loadProjectFromRelay(), so we need a getter rather than a snapshot.
   */
  getProjectState: () => unknown;
}

function textFromResult(resultJson: unknown): string {
  if (typeof resultJson === 'string') return resultJson;
  if (resultJson === null || resultJson === undefined) return '';
  return JSON.stringify(resultJson, null, 2);
}

/**
 * Single source of truth for the commit pipeline. Caller must guarantee
 * `result.ok === true`. Dev-mode invariant assertions are enforced here so
 * any caller — `registerMcpTools` or `pendingActions.confirm` — gets the
 * same checks.
 *
 * `toolName` is only used for dev-mode error messages.
 */
export async function commitHandlerResult(
  toolName: string,
  result: ToolHandlerResult,
  policy: CommitBroadcastPolicy,
  deps: CommitDeps,
): Promise<void> {
  // Dev-mode invariant assertions on policy / events agreement.
  if (process.env.NODE_ENV !== 'production') {
    if (policy === 'read-only' && result.events.length > 0) {
      throw new Error(
        `[mcpAdapter] read-only handler "${toolName}" emitted ${result.events.length} event(s); expected 0.`,
      );
    }
    if (
      policy === 'pre-commit-only' &&
      result.events.some((e) => e.phase === 'post-commit')
    ) {
      throw new Error(
        `[mcpAdapter] pre-commit-only handler "${toolName}" emitted post-commit event(s); expected pre-commit only.`,
      );
    }
    if (policy === 'no-broadcast' && result.events.length > 0) {
      throw new Error(
        `[mcpAdapter] no-broadcast handler "${toolName}" emitted ${result.events.length} event(s); expected 0.`,
      );
    }
  }

  if (policy === 'read-only') return;

  // pre-commit broadcasts (preserves es_add_flow / es_add_command_for_event timing).
  for (const e of result.events) {
    if (e.phase === 'pre-commit') {
      await deps.broadcast(e.action, e.payload);
    }
  }

  deps.saveProject();
  await deps.syncProjectToRelay();

  // post-commit broadcasts (standard pattern).
  for (const e of result.events) {
    if (e.phase === 'post-commit') {
      await deps.broadcast(e.action, e.payload);
    }
  }
}

export function registerMcpTools(
  server: McpServer,
  definitions: ToolDefinition[],
  deps: McpAdapterDeps,
): void {
  for (const def of definitions) {
    const handler = def.handler as ToolHandler<unknown>;
    const policy = def.policy;

    server.tool(def.name, def.description, def.schema, async (args: unknown) => {
      await deps.loadProjectFromRelay();
      const ctx = {
        projectState: deps.getProjectState() as never,
        now: () => new Date().toISOString(),
      };
      const result = handler(args, ctx);

      if (!result.ok) {
        const message = result.error?.message ?? 'Unknown error.';
        return { content: [{ type: 'text' as const, text: message }] };
      }

      await commitHandlerResult(def.name, result, policy, {
        saveProject: deps.saveProject,
        syncProjectToRelay: deps.syncProjectToRelay,
        broadcast: deps.broadcast,
      });

      return { content: [{ type: 'text' as const, text: textFromResult(result.resultJson) }] };
    });
  }
}
