import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ─────────────────────────────────────────────────────────────────

type ElementType =
  | 'DomainEvent' | 'Command' | 'Aggregate' | 'Policy'
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot' | 'Diamond' | 'Dto'
  | 'Information' | 'Entity' | 'AggregateRoot';

interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
  actorId?: string;
}

interface Property {
  attrName: string;
  type: string;
  dtoSpecRef?: string;  // optional DTO ref; only used by input-side editors (Command information, Remodel parameters)
}

// ─── Spec Bundle Types (mirrors src/types/specs.ts) ─────────────────────────

interface InvariantRule {
  when: string;   // "always" | "never" | "<field> <op> <value>"
  rule: string;   // natural language statement or expression
}

interface InvariantSource {
  agent: string;
  derivedFrom: string[];
  inferredAt: string;     // ISO timestamp
  rationale: string;
}

interface Invariant {
  id: string;
  name: string;           // camelCase, e.g. "checkCancellable"
  title: string;          // human-readable, e.g. "已出貨不可取消"
  applicability?: string;
  rules: InvariantRule[];
  errorCode: string;      // camelCase, e.g. "orderAlreadyShipped"
  relatedState?: string[];
  provenance: 'ui' | 'assumption';
  status: 'confirmed' | 'needs_review' | 'rejected';
  source?: InvariantSource | null;
}

interface AggregateIdentity {
  name: string;               // e.g. "orderId"
  _suggested_type?: string;   // e.g. "OrderId"
  _suggested_field?: string;  // e.g. "orderId"
}

interface DtoField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;  // reference to another Dto note id
}

interface ReturnTypeField {
  name: string;
  type: string;
  nullable?: boolean;
  dtoSpecRef?: string;  // reference to Dto note id
}

interface ReturnTypeSpec {
  shape: 'object' | 'array' | 'primitive';
  fields: ReturnTypeField[];
}

interface PolicyTrigger {
  type: 'DomainEvent';
  name: string;
  noteRef?: string;
}

interface PolicyIssue {
  type: 'Command';
  name: string;
  noteRef?: string;
  targetAggregate?: string;
  targetAggregateRef?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
interface StickyNote {
  id: string;
  type: ElementType;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // DomainEvent-centric fields
  behavior?: string;              // DomainEvent's behavior description (e.g. "Delete a product")
  information?: Property[];       // Command's input parameters
  eventProperties?: Property[];   // DomainEvent's output properties
  commandId?: string;             // DomainEvent links to its triggering Command
  entityId?: string;              // DomainEvent links to its Entity note
  // Visual group fields
  groupEventId?: string;              // Information/Command/Entity → their parent DomainEvent id
  informationForCommandId?: string;   // Information note → which Command it serves
  aggregateRootId?: string;           // Entity note → which AggregateRoot it belongs to (legacy)
  isAggregateRoot?: boolean;          // Entity is designated as Aggregate Root
  linkedAggregateNoteId?: string;     // id of the auto-created Aggregate note linked to this Entity
  groupCollapsed?: boolean;           // DomainEvent: whether its group is collapsed
  // --- Aggregate-specific (Spec Bundle) ---
  aggregateIdentity?: AggregateIdentity;
  stateProperties?: Property[];
  invariants?: Invariant[];
  // --- Dto-specific (Spec Bundle) ---
  dtoFields?: DtoField[];
  // --- Policy-specific (Spec Bundle) ---
  policyTrigger?: PolicyTrigger;
  policyIssues?: PolicyIssue[];
}

interface BundleSubNote {
  label: string;
  content: string;
}

interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'remodel';
  toType: 'note' | 'remodel';
  label?: string;
  createdAt: string;
}

interface Remodel {
  id: string;
  position: { x: number; y: number };
  aggregateNote: BundleSubNote;
  parameterNote: BundleSubNote;
  queryNote: BundleSubNote;
  returnTypeNote: BundleSubNote;
  linkedBundleIds: string[];   // semantically: linked DomainEvent note IDs post-migration
  linkedDtoIds: string[];
  collapsed?: boolean;
  sourceEventsExpanded?: boolean;
  zIndex: number;
  paths?: string[];
  phase?: string;
  notes?: string;
  linkedActorId?: string;
  createdAt: string;
  updatedAt: string;
  // --- Structured spec data (Spec Bundle) ---
  behavior?: string;
  parameters?: Property[];
  returnType?: ReturnTypeSpec;
}

interface Board {
  id: string;
  name: string;
  parentContextId?: string;
  notes: StickyNote[];
  remodels: Remodel[];
  links: Link[];
  flowPaths: FlowPath[];
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  boards: Board[];
  activeBoardId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Persistence ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const PROJECT_FILE = join(DATA_DIR, 'project.json');

function saveProject(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROJECT_FILE, JSON.stringify(projectState, null, 2), 'utf-8');
}

// ─── In-memory project state ───────────────────────────────────────────────

function createBoard(name: string, parentContextId?: string): Board {
  return {
    id: uuidv4(),
    name,
    parentContextId,
    notes: [],
    remodels: [],
    links: [],
    flowPaths: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Migrate loaded project.json to ensure all fields are up to date.
 * Also handles v8→v9 migration: convert legacy bundles to Command+DomainEvent notes.
 */
function migrateProject(p: Project): Project {
  const now = new Date().toISOString();

  for (const board of p.boards) {
    const b = board as Board & { bundles?: unknown[]; flowPaths?: FlowPath[]; remodels?: Remodel[] };
    if (!b.flowPaths) b.flowPaths = [];
    if (!b.remodels) b.remodels = [];

    // v8→v9: Migrate bundles to Command+DomainEvent notes
    if (b.bundles && b.bundles.length > 0) {
      const bundleToEventNoteId = new Map<string, string>();

      for (const raw of b.bundles) {
        const bundle = raw as {
          id: string;
          position: { x: number; y: number };
          commandNote: BundleSubNote;
          eventNote: BundleSubNote;
          entityNote: BundleSubNote;
          infoNote: BundleSubNote;
          zIndex: number;
          paths?: string[];
          phase?: string;
          notes?: string;
        };

        const commandNoteId = uuidv4();
        const eventNoteId = uuidv4();

        const commandNote: StickyNote = {
          id: commandNoteId,
          type: 'Command',
          label: bundle.commandNote.label || 'Command',
          position: { x: bundle.position.x + 168, y: bundle.position.y + 128 },
          size: { width: 160, height: 80 },
          zIndex: bundle.zIndex,
          paths: bundle.paths ?? [],
          phase: bundle.phase,
          notes: bundle.notes,
          information: bundle.entityNote.content
            ? bundle.entityNote.content.split(',').map((s: string) => ({
                attrName: s.trim(),
                type: 'String',
              })).filter((p: Property) => p.attrName.length > 0)
            : [],
          createdAt: now,
          updatedAt: now,
        };

        const eventNote: StickyNote = {
          id: eventNoteId,
          type: 'DomainEvent',
          label: bundle.eventNote.label || 'DomainEvent',
          position: { x: bundle.position.x + 328, y: bundle.position.y + 128 },
          size: { width: 160, height: 80 },
          zIndex: bundle.zIndex,
          paths: bundle.paths ?? [],
          phase: bundle.phase,
          notes: bundle.notes,
          commandId: commandNoteId,
          entityId: undefined,
          eventProperties: [],
          createdAt: now,
          updatedAt: now,
        };

        board.notes.push(commandNote);
        board.notes.push(eventNote);
        bundleToEventNoteId.set(bundle.id, eventNoteId);

        // Command → DomainEvent link
        board.links.push({
          id: uuidv4(),
          fromId: commandNoteId,
          toId: eventNoteId,
          fromType: 'note',
          toType: 'note',
          createdAt: now,
        });
      }

      // Migrate existing links that referenced bundles
      board.links = board.links.map((link) => {
        const l = link as Link & { fromType: string; toType: string };
        const migrated: Link = { ...link };
        if ((l.fromType as string) === 'bundle') {
          migrated.fromType = 'note';
          migrated.fromId = bundleToEventNoteId.get(link.fromId) ?? link.fromId;
        }
        if ((l.toType as string) === 'bundle') {
          migrated.toType = 'note';
          migrated.toId = bundleToEventNoteId.get(link.toId) ?? link.toId;
        }
        return migrated;
      });

      delete b.bundles;
    }

    for (const note of board.notes) {
      if (!note.paths) note.paths = [];
    }
    for (const remodel of board.remodels) {
      if (!remodel.paths) remodel.paths = [];
      if (!remodel.linkedBundleIds) remodel.linkedBundleIds = [];
      if (!remodel.linkedDtoIds) remodel.linkedDtoIds = [];
      const r = remodel as unknown as Record<string, unknown>;
      if ('sourceEventNote' in r && !('returnTypeNote' in r)) {
        r['returnTypeNote'] = r['sourceEventNote'];
        delete r['sourceEventNote'];
      }
    }
  }
  // Strip per-tab UI fields from any incoming wire payload (FE POST, relay
  // rehydrate, legacy project.json). BE-local Project type still declares
  // activeBoardId; the POST handler restores its server-local copy after
  // migrateProject so MCP tools that read projectState.activeBoardId keep
  // working.
  delete (p as { activeBoardId?: string }).activeBoardId;
  delete (p as { openBoardIds?: string[] }).openBoardIds;
  return p;
}

let projectState: Project = (() => {
  if (existsSync(PROJECT_FILE)) {
    try {
      const loaded = JSON.parse(readFileSync(PROJECT_FILE, 'utf-8')) as Project;
      return migrateProject(loaded);
    } catch {}
  }
  const defaultBoard = createBoard('Default Context');
  return {
    id: uuidv4(),
    name: 'My Event Storming Board',
    boards: [defaultBoard],
    activeBoardId: defaultBoard.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
})();

// ─── SSE subscribers ───────────────────────────────────────────────────────

const subscribers = new Map<string, Response>();

// ─── Relay mode helpers ────────────────────────────────────────────────────

let expressReady = false;
const RELAY_BASE = process.env.ES_RELAY_BASE ?? 'http://localhost:3333';
const FORCE_RELAY = process.env.ES_RELAY_MODE === 'true';

function broadcastExcept(action: string, payload: unknown, excludeId?: string): void {
  const body = JSON.stringify({ action, payload });
  for (const [id, res] of subscribers) {
    if (id !== excludeId) res.write(`data: ${body}\n\n`);
  }
}

async function broadcast(action: string, payload: unknown, excludeId?: string): Promise<void> {
  if (expressReady) {
    broadcastExcept(action, payload, excludeId);
  } else {
    try {
      await fetch(`${RELAY_BASE}/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, excludeClientId: excludeId }),
      });
    } catch {
      // Silent — other server may not be running
    }
  }
}

async function syncProjectToRelay(): Promise<void> {
  if (!expressReady) {
    try {
      await fetch(`${RELAY_BASE}/api/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectState),
      });
    } catch {}
  }
}

async function loadProjectFromRelay(): Promise<void> {
  if (!expressReady) {
    try {
      const res = await fetch(`${RELAY_BASE}/api/board`);
      if (res.ok) projectState = migrateProject((await res.json()) as Project);
    } catch {}
  }
}

// ─── Express app ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Coach (AI 教練) router 掛載 ─────────────────────────────────────────
// 缺 GEMINI_API_KEY 時 mount 降級 router，所有端點一致回 503。
import { CoachSessionStore } from './coach/sessionStore.js';
import { GeminiAdapter } from './coach/llm/gemini.js';
import { createCoachRouter, createDegradedCoachRouter } from './coach/router.js';
import { loadBaseDddGuide, loadUserDraft } from './coach/prompts/system.js';
import { TOOL_DEFINITIONS } from './coach/tools/toolDefinitions.js';
import { registerMcpTools } from './coach/tools/mcpAdapter.js';
import { EventStormingSkill } from './coach/skills/eventStormingSkill.js';
import {
  createFsPendingActionStore,
  type ActionUpdatePayload,
  type ProjectSnapshot,
} from './coach/agent/pendingActions.js';
import { createAuditLog } from './coach/audit/auditLog.js';

const coachDataDir = process.env.COACH_DATA_DIR ?? 'mcp-server/data/coach';
const coachSessionStore = new CoachSessionStore({ dataDir: coachDataDir });
const baseDddGuide = loadBaseDddGuide();
const userDraft = loadUserDraft();
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL;
// Feature flag (default OFF — opt-in). Set ENABLE_COACH=true to mount Coach.
const enableCoach = (process.env.ENABLE_COACH ?? 'false').trim().toLowerCase() === 'true';

if (!enableCoach) {
  process.stderr.write('Coach disabled (ENABLE_COACH not set to true) — /api/coach routes not mounted\n');
} else if (geminiApiKey) {
  const llm = new GeminiAdapter({ apiKey: geminiApiKey, model: geminiModel });
  const skill = new EventStormingSkill();
  const pendingStore = createFsPendingActionStore({ dataDir: coachDataDir });
  const auditLog = createAuditLog({ dataDir: join(coachDataDir, 'audit') });
  const toolVersion = '0.1.0'; // debug-only audit field; bumped manually when behavior changes.

  // Bridge pendingStore updates → SSE broadcast. We subscribe per session
  // lazily (each session-touching router handler calls subscribeIfNeeded) so
  // multi-session usage doesn't leak listeners.
  const subscribedSessions = new Set<string>();
  const subscribeIfNeeded = (sessionId: string): void => {
    if (subscribedSessions.has(sessionId)) return;
    subscribedSessions.add(sessionId);
    pendingStore.subscribe(sessionId, (payload: ActionUpdatePayload) => {
      broadcastExcept('coach_action_update', payload);
    });
  };

  app.use(
    '/api/coach',
    createCoachRouter({
      sessionStore: coachSessionStore,
      llm,
      baseDddGuide,
      userDraft,
      skill,
      pendingStore,
      auditLog,
      loadProject: () => projectState as unknown as ProjectSnapshot,
      getFullProjectState: () => projectState,
      commitDeps: {
        saveProject,
        syncProjectToRelay,
        broadcast: (action, payload, excludeId) => broadcast(action, payload, excludeId),
      },
      toolVersion,
      subscribeIfNeeded,
    }),
  );
  process.stderr.write(`Coach mounted at /api/coach (model: ${llm.modelName})\n`);
} else {
  app.use('/api/coach', createDegradedCoachRouter());
  process.stderr.write('GEMINI_API_KEY not set — Coach endpoints will return 503\n');
}

// SSE endpoint
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = (req.query.clientId as string | undefined) ?? `anon-${uuidv4()}`;
  subscribers.set(clientId, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(clientId);
  });
});

// React syncs project state here.
// FE strips activeBoardId / openBoardIds from the POST payload (they're per-tab
// UI state, not shared content). The server preserves its own activeBoardId so
// MCP tools that rely on projectState.activeBoardId (es_switch_context,
// es_list_contexts, es_add_note, etc.) keep working — AI's "current context"
// is independent of any browser tab's selection.
app.post('/api/board', (req: Request, res: Response) => {
  if (req.body && typeof req.body === 'object') {
    const senderClientId = req.headers['x-client-id'] as string | undefined;
    const prevActiveBoardId = projectState.activeBoardId;
    projectState = migrateProject(req.body as Project);
    projectState.activeBoardId = prevActiveBoardId;
    saveProject();
    // Broadcast shared content to OTHER clients (excluding the sender) so React UI
    // edits propagate cross-tab. The sender's FE skips applying its own broadcast
    // via the isApplyingRemoteRef guard. Receivers preserve their local
    // activeBoardId / openBoardIds (see apiSync sync_project dispatch).
    broadcastExcept('sync_project', projectState, senderClientId);
  }
  res.json({ ok: true });
});

// Read project state (used by relay instances)
app.get('/api/board', (_req: Request, res: Response) => {
  res.json(projectState);
});

// Relay broadcast endpoint
app.post('/api/broadcast', (req: Request, res: Response) => {
  const { action, payload, excludeClientId } = req.body as { action: string; payload: unknown; excludeClientId?: string };
  broadcastExcept(action, payload, excludeClientId);
  res.json({ ok: true });
});

if (FORCE_RELAY) {
  process.stderr.write(`Running in relay mode → ${RELAY_BASE}\n`);
  await loadProjectFromRelay();
} else {
  const httpServer = app.listen(3333, () => {
    expressReady = true;
    process.stderr.write('SSE listening on :3333\n');
  });

  httpServer.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write('Port 3333 in use — running in relay mode.\n');
      await loadProjectFromRelay();
    } else {
      process.stderr.write(`Express error: ${err.message}\n`);
    }
  });
}

// ─── MCP Server ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'event-storming',
  version: '3.0.0',
});

// ─── Tool registrations (handlers extracted into ./coach/tools) ──────────

registerMcpTools(server, TOOL_DEFINITIONS, {
  loadProjectFromRelay,
  saveProject,
  syncProjectToRelay,
  broadcast,
  getProjectState: () => projectState,
});

// ─── Connect MCP over stdio ────────────────────────────────────────────────
// Skip stdio in HTTP-only mode (e.g. Docker deployment)

if (process.env.ES_HTTP_ONLY === 'true') {
  process.stderr.write('MCP server ready (HTTP-only mode, stdio disabled)\n');
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('MCP server ready\n');
}
