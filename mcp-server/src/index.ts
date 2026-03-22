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
  | 'ExternalSystem' | 'Actor' | 'ReadModel' | 'Hotspot' | 'Diamond';

interface Policy {
  rule: string;
  severity: 'block' | 'warn';
}

interface FlowPath {
  id: string;
  name: string;
  color: string;
  description?: string;
  actorId?: string;
}

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
}

interface BundleSubNote {
  label: string;
  content: string;
}

interface Bundle {
  id: string;
  position: { x: number; y: number };
  infoNote: BundleSubNote;
  entityNote: BundleSubNote;
  commandNote: BundleSubNote;
  eventNote: BundleSubNote;
  zIndex: number;
  collapsed?: boolean;
  policies?: Policy[];
  paths?: string[];
  phase?: string;
  trigger?: string;
  uiDescription?: string;
  readModels?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'bundle' | 'remodel';
  toType: 'note' | 'bundle' | 'remodel';
  label?: string;
  createdAt: string;
}

interface Remodel {
  id: string;
  position: { x: number; y: number };

  // Four sub-notes (reusing BundleSubNote, different semantics)
  aggregateNote: BundleSubNote;   // top: Aggregate (read perspective)
  parameterNote: BundleSubNote;   // bottom-left: Query parameters
  queryNote: BundleSubNote;       // bottom-center: Query name
  sourceEventNote: BundleSubNote; // bottom-right: Event Source description

  // Bundle linkage
  linkedBundleIds: string[];

  // Metadata (consistent with Bundle)
  zIndex: number;
  collapsed?: boolean;
  paths?: string[];
  phase?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Board {
  id: string;
  name: string;
  notes: StickyNote[];
  bundles: Bundle[];
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

function createBoard(name: string): Board {
  return {
    id: uuidv4(),
    name,
    notes: [],
    bundles: [],
    remodels: [],
    links: [],
    flowPaths: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Migrate loaded project.json to ensure all new optional fields exist. */
function migrateProject(p: Project): Project {
  for (const board of p.boards) {
    const b = board as Board & { flowPaths?: FlowPath[]; remodels?: Remodel[] };
    if (!b.flowPaths) b.flowPaths = [];
    if (!b.remodels) b.remodels = [];
    for (const bundle of board.bundles) {
      if (!bundle.paths) bundle.paths = [];
      if (!bundle.policies) bundle.policies = [];
    }
    for (const note of board.notes) {
      if (!note.paths) note.paths = [];
    }
    for (const remodel of board.remodels) {
      if (!remodel.paths) remodel.paths = [];
      if (!remodel.linkedBundleIds) remodel.linkedBundleIds = [];
    }
  }
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

function getActiveBoard(): Board {
  return projectState.boards.find((b) => b.id === projectState.activeBoardId) ?? projectState.boards[0];
}

/** Returns the next auto-layout X for a new bundle: rightmost existing bundle X + 736, or 80 if none. */
function nextBundleX(): number {
  const board = getActiveBoard();
  if (board.bundles.length === 0) return 80;
  const maxX = Math.max(...board.bundles.map((b) => b.position.x));
  return maxX + 736;
}

/** Returns the next auto-layout X for a new remodel: rightmost existing bundle/remodel X + 736, or 80 if none. */
function nextRemodelX(): number {
  const board = getActiveBoard();
  const allElements = [
    ...board.bundles.map((b) => b.position.x),
    ...board.remodels.map((r) => r.position.x),
  ];
  if (allElements.length === 0) return 80;
  return Math.max(...allElements) + 736;
}

/**
 * Compute whether a Remodel spans more than one Aggregate Root.
 * Rule: linkedBundleIds -> Bundle.infoNote.label; if > 1 unique non-empty label -> Universe.
 */
function isUniverseRemodel(remodel: Remodel, bundles: Bundle[]): boolean {
  const linked = bundles.filter((b) => remodel.linkedBundleIds.includes(b.id));
  const uniqueAggregates = new Set(
    linked
      .map((b) => b.infoNote.label.trim().toLowerCase())
      .filter((label) => label.length > 0),
  );
  return uniqueAggregates.size > 1;
}

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

// React syncs project state here
app.post('/api/board', (req: Request, res: Response) => {
  if (req.body && typeof req.body === 'object') {
    const senderClientId = req.headers['x-client-id'] as string | undefined;
    projectState = migrateProject(req.body as Project);
    saveProject();
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
  version: '2.1.0',
});

// ─── Context (Board) management tools ──────────────────────────────────────

server.tool(
  'es_list_contexts',
  'List all Bounded Context tabs. Returns [{ id, name, isActive }].',
  {},
  async () => {
    await loadProjectFromRelay();
    const contexts = projectState.boards.map((b) => ({
      id: b.id,
      name: b.name,
      isActive: b.id === projectState.activeBoardId,
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(contexts, null, 2) }] };
  }
);

server.tool(
  'es_get_project',
  'Return a summary of the entire project: name, project ID, and all contexts with note/bundle counts. Use this first to get a global overview before drilling into a specific context.',
  {},
  async () => {
    await loadProjectFromRelay();
    const summary = {
      id: projectState.id,
      name: projectState.name,
      activeBoardId: projectState.activeBoardId,
      contexts: projectState.boards.map((b) => ({
        id: b.id,
        name: b.name,
        isActive: b.id === projectState.activeBoardId,
        noteCount: b.notes.length,
        bundleCount: b.bundles.length,
        remodelCount: b.remodels.length,
        linkCount: b.links.length,
        flowPathCount: b.flowPaths.length,
        updatedAt: b.updatedAt,
      })),
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
  }
);

server.tool(
  'es_create_context',
  'Create a new Bounded Context tab. Returns { id }.',
  { name: z.string().describe('Name of the new Bounded Context') },
  async ({ name }) => {
    await loadProjectFromRelay();
    const newBoard = createBoard(name);
    projectState.boards.push(newBoard);
    projectState.activeBoardId = newBoard.id;
    projectState.updatedAt = newBoard.createdAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_board', { id: newBoard.id, name });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ id: newBoard.id }) }] };
  }
);

server.tool(
  'es_switch_context',
  'Switch the active Bounded Context tab.',
  { id: z.string().describe('ID of the context to switch to') },
  async ({ id }) => {
    await loadProjectFromRelay();
    if (!projectState.boards.some((b) => b.id === id)) {
      return { content: [{ type: 'text' as const, text: `Context ${id} not found.` }] };
    }
    projectState.activeBoardId = id;
    projectState.updatedAt = new Date().toISOString();
    saveProject();
    await syncProjectToRelay();
    await broadcast('set_active_board', { id });
    return { content: [{ type: 'text' as const, text: `Switched to context ${id}.` }] };
  }
);

server.tool(
  'es_rename_context',
  'Rename a Bounded Context tab.',
  {
    id: z.string().describe('ID of the context to rename'),
    name: z.string().describe('New name for the context'),
  },
  async ({ id, name }) => {
    await loadProjectFromRelay();
    const board = projectState.boards.find((b) => b.id === id);
    if (!board) return { content: [{ type: 'text' as const, text: `Context ${id} not found.` }] };
    board.name = name;
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('rename_board', { id, name });
    return { content: [{ type: 'text' as const, text: `Context renamed to "${name}".` }] };
  }
);

server.tool(
  'es_delete_context',
  'Delete a Bounded Context tab (cannot delete the last one).',
  { id: z.string().describe('ID of the context to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    if (projectState.boards.length <= 1) {
      return { content: [{ type: 'text' as const, text: 'Cannot delete the last context.' }] };
    }
    projectState.boards = projectState.boards.filter((b) => b.id !== id);
    if (projectState.activeBoardId === id) {
      projectState.activeBoardId = projectState.boards[0].id;
    }
    projectState.updatedAt = new Date().toISOString();
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_board', { id });
    return { content: [{ type: 'text' as const, text: `Context ${id} deleted.` }] };
  }
);

// ─── Board read/write tools ─────────────────────────────────────────────────

server.tool(
  'es_get_board',
  'Return the active Bounded Context board JSON (includes remodels with computed _isUniverse field). Use this before incremental edits to read current state.',
  {},
  async () => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const boardWithComputed = {
      ...board,
      remodels: board.remodels.map((r) => ({
        ...r,
        _isUniverse: isUniverseRemodel(r, board.bundles),
      })),
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(boardWithComputed, null, 2) }],
    };
  }
);

server.tool(
  'es_clear_board',
  'Clear all elements from the active Bounded Context.',
  {},
  async () => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    board.notes = [];
    board.bundles = [];
    board.remodels = [];
    board.links = [];
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('clear_board', {});
    return { content: [{ type: 'text' as const, text: 'Active context cleared.' }] };
  }
);

server.tool(
  'es_set_board_name',
  'Set the project name.',
  { name: z.string().describe('New project name') },
  async ({ name }) => {
    await loadProjectFromRelay();
    projectState.name = name;
    projectState.updatedAt = new Date().toISOString();
    saveProject();
    await syncProjectToRelay();
    await broadcast('set_project_name', { name });
    return { content: [{ type: 'text' as const, text: `Project name set to "${name}".` }] };
  }
);

// ─── Note tools ─────────────────────────────────────────────────────────────

server.tool(
  'es_add_note',
  `Add a sticky note to the active Bounded Context. Returns { id }.
Layout guide:
  • Canvas origin (0,0) top-left; X→right, Y→down
  • StickyNote default size: 160×80px; horizontal spacing: 240px
  • Suggested Y layers: Actor/Policy→0, main flow→200, ReadModel→400
  • Types: DomainEvent | Command | Aggregate | Policy | ExternalSystem | Actor | ReadModel | Hotspot | Diamond`,
  {
    type: z.enum(['DomainEvent', 'Command', 'Aggregate', 'Policy', 'ExternalSystem', 'Actor', 'ReadModel', 'Hotspot', 'Diamond']).describe('Element type'),
    label: z.string().describe('Text label for the note'),
    x: z.number().describe('X position in canvas coordinates'),
    y: z.number().describe('Y position in canvas coordinates'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this note belongs to'),
    phase: z.string().optional().describe('Phase or stage label for this note'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ type, label, x, y, paths, phase, notes }) => {
    await loadProjectFromRelay();
    const now = new Date().toISOString();
    const note: StickyNote = {
      id: uuidv4(),
      type,
      label,
      position: { x, y },
      size: { width: 160, height: 80 },
      zIndex: 1,
      paths: paths ?? [],
      phase,
      notes,
      createdAt: now,
      updatedAt: now,
    };
    const board = getActiveBoard();
    board.notes.push(note);
    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_note', note);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ id: note.id }) }] };
  }
);

server.tool(
  'es_update_note',
  'Update an existing sticky note. All fields except id are optional.',
  {
    id: z.string().describe('Note ID to update'),
    label: z.string().optional().describe('New label text'),
    x: z.number().optional().describe('New X position'),
    y: z.number().optional().describe('New Y position'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this note belongs to'),
    phase: z.string().optional().describe('Phase or stage label for this note'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ id, label, x, y, paths, phase, notes }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const note = board.notes.find(n => n.id === id);
    if (!note) return { content: [{ type: 'text' as const, text: `Note ${id} not found.` }] };
    if (label !== undefined) note.label = label;
    if (x !== undefined) note.position.x = x;
    if (y !== undefined) note.position.y = y;
    if (paths !== undefined) note.paths = paths;
    if (phase !== undefined) note.phase = phase;
    if (notes !== undefined) note.notes = notes;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    projectState.updatedAt = note.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id, label, x, y, paths, phase, notes });
    return { content: [{ type: 'text' as const, text: 'Note updated.' }] };
  }
);

server.tool(
  'es_delete_note',
  'Delete a sticky note and its associated links.',
  { id: z.string().describe('Note ID to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    board.notes = board.notes.filter(n => n.id !== id);
    board.links = board.links.filter(l => l.fromId !== id && l.toId !== id);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_note', { id });
    return { content: [{ type: 'text' as const, text: 'Note deleted.' }] };
  }
);

// ─── Bundle tools ───────────────────────────────────────────────────────────

server.tool(
  'es_add_bundle',
  `Add a 4-in-1 Bundle (Entity/AR + Params + Command + Event) to the active Bounded Context. Returns { id }.
Layout:
  • Yellow (top-center): Entity → becomes Aggregate Root
  • Green (bottom-left): Command Parameters (inputs required by the Command)
  • Blue (bottom-center): Command
  • Orange (bottom-right): Domain Event
  • Bundle size: 496×248px; horizontal spacing: 240px between bundles
  • Omit x/y to use auto-layout: appends right of the last bundle at y=200`,
  {
    x: z.number().optional().describe('X position of the bundle (omit for auto-layout)'),
    y: z.number().optional().describe('Y position of the bundle (omit for auto-layout, defaults to 200)'),
    infoLabel: z.string().describe('Label for the Entity/Aggregate Root (yellow, top-center) sub-note'),
    infoContent: z.string().describe('Content for the Entity sub-note'),
    entityLabel: z.string().describe('Label for the Command Parameters (green, bottom-left) sub-note'),
    entityContent: z.string().describe('Content for the Command Parameters sub-note'),
    commandLabel: z.string().describe('Label for the Command (blue, bottom-center) sub-note'),
    commandContent: z.string().describe('Content for the Command sub-note'),
    eventLabel: z.string().describe('Label for the DomainEvent (orange, bottom-right) sub-note'),
    eventContent: z.string().describe('Content for the DomainEvent sub-note'),
    policies: z.array(z.object({
      rule: z.string().describe('Business rule description'),
      severity: z.enum(['block', 'warn']).describe('block = hard constraint, warn = advisory'),
    })).optional().describe('Business policies / rules attached to this bundle'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this bundle belongs to'),
    phase: z.string().optional().describe('Phase or stage label (e.g. "Discovery", "Order Processing")'),
    trigger: z.string().optional().describe('What triggers this command (e.g. "User clicks Submit", "Policy: X")'),
    uiDescription: z.string().optional().describe('Description of the UI interaction or screen context'),
    readModels: z.array(z.string()).optional().describe('Read model names that inform this command decision'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent, policies, paths, phase, trigger, uiDescription, readModels, notes }) => {
    await loadProjectFromRelay();
    const posX = x ?? nextBundleX();
    const posY = y ?? 200;
    const now = new Date().toISOString();
    const bundle: Bundle = {
      id: uuidv4(),
      position: { x: posX, y: posY },
      infoNote: { label: infoLabel, content: infoContent },
      entityNote: { label: entityLabel, content: entityContent },
      commandNote: { label: commandLabel, content: commandContent },
      eventNote: { label: eventLabel, content: eventContent },
      zIndex: 1,
      policies: policies ?? [],
      paths: paths ?? [],
      phase,
      trigger,
      uiDescription,
      readModels,
      notes,
      createdAt: now,
      updatedAt: now,
    };
    const board = getActiveBoard();
    board.bundles.push(bundle);
    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_bundle', bundle);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ id: bundle.id }) }] };
  }
);

server.tool(
  'es_update_bundle',
  'Update any sub-note labels/contents, position, or metadata of an existing Bundle. All fields except id are optional.',
  {
    id: z.string().describe('Bundle ID to update'),
    x: z.number().optional().describe('New X position'),
    y: z.number().optional().describe('New Y position'),
    infoLabel: z.string().optional(),
    infoContent: z.string().optional(),
    entityLabel: z.string().optional(),
    entityContent: z.string().optional(),
    commandLabel: z.string().optional(),
    commandContent: z.string().optional(),
    eventLabel: z.string().optional(),
    eventContent: z.string().optional(),
    policies: z.array(z.object({
      rule: z.string().describe('Business rule description'),
      severity: z.enum(['block', 'warn']).describe('block = hard constraint, warn = advisory'),
    })).optional().describe('Replace all policies on this bundle'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this bundle belongs to'),
    phase: z.string().optional().describe('Phase or stage label'),
    trigger: z.string().optional().describe('What triggers this command'),
    uiDescription: z.string().optional().describe('Description of the UI interaction or screen context'),
    readModels: z.array(z.string()).optional().describe('Read model names that inform this command decision'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ id, x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent, policies, paths, phase, trigger, uiDescription, readModels, notes }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const bundle = board.bundles.find(b => b.id === id);
    if (!bundle) return { content: [{ type: 'text' as const, text: `Bundle ${id} not found.` }] };
    if (x !== undefined) bundle.position.x = x;
    if (y !== undefined) bundle.position.y = y;
    if (infoLabel !== undefined) bundle.infoNote.label = infoLabel;
    if (infoContent !== undefined) bundle.infoNote.content = infoContent;
    if (entityLabel !== undefined) bundle.entityNote.label = entityLabel;
    if (entityContent !== undefined) bundle.entityNote.content = entityContent;
    if (commandLabel !== undefined) bundle.commandNote.label = commandLabel;
    if (commandContent !== undefined) bundle.commandNote.content = commandContent;
    if (eventLabel !== undefined) bundle.eventNote.label = eventLabel;
    if (eventContent !== undefined) bundle.eventNote.content = eventContent;
    if (policies !== undefined) bundle.policies = policies;
    if (paths !== undefined) bundle.paths = paths;
    if (phase !== undefined) bundle.phase = phase;
    if (trigger !== undefined) bundle.trigger = trigger;
    if (uiDescription !== undefined) bundle.uiDescription = uiDescription;
    if (readModels !== undefined) bundle.readModels = readModels;
    if (notes !== undefined) bundle.notes = notes;
    bundle.updatedAt = new Date().toISOString();
    board.updatedAt = bundle.updatedAt;
    projectState.updatedAt = bundle.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_bundle', { id, x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent, policies, paths, phase, trigger, uiDescription, readModels, notes });
    return { content: [{ type: 'text' as const, text: 'Bundle updated.' }] };
  }
);

server.tool(
  'es_delete_bundle',
  'Delete a Bundle and its associated links.',
  { id: z.string().describe('Bundle ID to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    board.bundles = board.bundles.filter(b => b.id !== id);
    board.links = board.links.filter(l => l.fromId !== id && l.toId !== id);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_bundle', { id });
    return { content: [{ type: 'text' as const, text: 'Bundle deleted.' }] };
  }
);

// ─── Remodel tools ──────────────────────────────────────────────────────────

server.tool(
  'es_add_remodel',
  `Add a Remodel (4-in-1 read-side card) to the active Bounded Context. Returns the full Remodel JSON including id.
Remodel represents a Read Model projection in Event Sourcing architecture.
Layout:
  • Purple (top): Aggregate (read perspective)
  • Cyan (bottom-left): Query Parameters
  • Blue-grey (bottom-center): Query name (convention: "Get" + name, e.g. "GetOrderList")
  • Lavender (bottom-right): Event Source description
  • Remodel size: 496×248px; omit x/y for auto-layout (appended right of existing elements at y=520)`,
  {
    aggregateLabel: z.string().describe('Aggregate name for read perspective (top cell)'),
    aggregateContent: z.string().optional().describe('Aggregate description'),
    parameterLabel: z.string().describe('Query parameter name (bottom-left cell)'),
    parameterContent: z.string().optional().describe('Parameter details'),
    queryLabel: z.string().describe('Query name — convention: "Get" + name, e.g. "GetOrderList" (bottom-center cell)'),
    queryContent: z.string().optional().describe('Query description'),
    sourceEventLabel: z.string().describe('Event source summary (bottom-right cell)'),
    sourceEventContent: z.string().optional().describe('Detailed event source description'),
    linkedBundleIds: z.array(z.string()).optional().describe('IDs of Bundles whose domain events feed this Read Model (default: [])'),
    x: z.number().optional().describe('X position (omit for auto-layout)'),
    y: z.number().optional().describe('Y position (omit for auto-layout, defaults to 520)'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
    phase: z.string().optional().describe('Phase or stage label'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ aggregateLabel, aggregateContent, parameterLabel, parameterContent, queryLabel, queryContent, sourceEventLabel, sourceEventContent, linkedBundleIds, x, y, paths, phase, notes }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const posX = x ?? nextRemodelX();
    const posY = y ?? 520;
    const now = new Date().toISOString();
    const remodel: Remodel = {
      id: uuidv4(),
      position: { x: posX, y: posY },
      aggregateNote: { label: aggregateLabel, content: aggregateContent ?? '' },
      parameterNote: { label: parameterLabel, content: parameterContent ?? '' },
      queryNote: { label: queryLabel, content: queryContent ?? '' },
      sourceEventNote: { label: sourceEventLabel, content: sourceEventContent ?? '' },
      linkedBundleIds: linkedBundleIds ?? [],
      zIndex: board.remodels.length + board.bundles.length + 1,
      paths: paths ?? [],
      phase,
      notes,
      createdAt: now,
      updatedAt: now,
    };
    board.remodels.push(remodel);
    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_remodel', remodel);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ ...remodel, _isUniverse: isUniverseRemodel(remodel, board.bundles) }, null, 2),
      }],
    };
  }
);

server.tool(
  'es_update_remodel',
  'Update a Remodel\'s content, linked bundles, or metadata. All fields except id are optional (partial update — undefined fields are not overwritten).',
  {
    id: z.string().describe('Remodel ID to update'),
    aggregateLabel: z.string().optional().describe('Aggregate name (top cell)'),
    aggregateContent: z.string().optional().describe('Aggregate description'),
    parameterLabel: z.string().optional().describe('Query parameter name (bottom-left cell)'),
    parameterContent: z.string().optional().describe('Parameter details'),
    queryLabel: z.string().optional().describe('Query name (bottom-center cell)'),
    queryContent: z.string().optional().describe('Query description'),
    sourceEventLabel: z.string().optional().describe('Event source summary (bottom-right cell)'),
    sourceEventContent: z.string().optional().describe('Detailed event source description'),
    linkedBundleIds: z.array(z.string()).optional().describe('Complete replacement of linked bundle IDs (not append)'),
    x: z.number().optional().describe('New X position'),
    y: z.number().optional().describe('New Y position'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
    phase: z.string().optional().describe('Phase or stage label'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ id, aggregateLabel, aggregateContent, parameterLabel, parameterContent, queryLabel, queryContent, sourceEventLabel, sourceEventContent, linkedBundleIds, x, y, paths, phase, notes }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const remodel = board.remodels.find((r) => r.id === id);
    if (!remodel) return { content: [{ type: 'text' as const, text: `Remodel ${id} not found.` }] };

    if (x !== undefined) remodel.position.x = x;
    if (y !== undefined) remodel.position.y = y;
    // Sub-note merge: only update the fields that are explicitly provided
    if (aggregateLabel !== undefined) remodel.aggregateNote.label = aggregateLabel;
    if (aggregateContent !== undefined) remodel.aggregateNote.content = aggregateContent;
    if (parameterLabel !== undefined) remodel.parameterNote.label = parameterLabel;
    if (parameterContent !== undefined) remodel.parameterNote.content = parameterContent;
    if (queryLabel !== undefined) remodel.queryNote.label = queryLabel;
    if (queryContent !== undefined) remodel.queryNote.content = queryContent;
    if (sourceEventLabel !== undefined) remodel.sourceEventNote.label = sourceEventLabel;
    if (sourceEventContent !== undefined) remodel.sourceEventNote.content = sourceEventContent;
    if (linkedBundleIds !== undefined) remodel.linkedBundleIds = linkedBundleIds;
    if (paths !== undefined) remodel.paths = paths;
    if (phase !== undefined) remodel.phase = phase;
    if (notes !== undefined) remodel.notes = notes;

    remodel.updatedAt = new Date().toISOString();
    board.updatedAt = remodel.updatedAt;
    projectState.updatedAt = remodel.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_remodel', { ...remodel, _isUniverse: isUniverseRemodel(remodel, board.bundles) });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ ...remodel, _isUniverse: isUniverseRemodel(remodel, board.bundles) }, null, 2),
      }],
    };
  }
);

server.tool(
  'es_delete_remodel',
  'Delete a Remodel and all links where it is the source or target. Returns { success: true, deletedId }.',
  { id: z.string().describe('Remodel ID to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const exists = board.remodels.some((r) => r.id === id);
    if (!exists) return { content: [{ type: 'text' as const, text: `Remodel ${id} not found.` }] };
    board.remodels = board.remodels.filter((r) => r.id !== id);
    board.links = board.links.filter((l) => l.fromId !== id && l.toId !== id);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_remodel', { id });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ success: true, deletedId: id }),
      }],
    };
  }
);

server.tool(
  'es_add_flow',
  `Create an entire Event Storming happy path by adding multiple Bundles in one call.
Bundles are auto-positioned left-to-right (736px spacing, y=200) starting after any existing bundles.
Optionally auto-links consecutive bundles with arrows. Returns [{ id, index }] for each bundle.

Example: 3 steps → 3 bundles placed at x=80, x=816, x=1552 (if board is empty).`,
  {
    steps: z.array(z.object({
      infoLabel: z.string().describe('Entity/AR label (yellow top-center)'),
      infoContent: z.string().optional().default('').describe('Entity content'),
      entityLabel: z.string().describe('Command Params label (green bottom-left)'),
      entityContent: z.string().optional().default('').describe('Params content'),
      commandLabel: z.string().describe('Command label (blue bottom-center)'),
      commandContent: z.string().optional().default('').describe('Command content'),
      eventLabel: z.string().describe('Domain Event label (orange bottom-right)'),
      eventContent: z.string().optional().default('').describe('Event content'),
    })).describe('Ordered flow steps, left to right'),
    autoLink: z.boolean().optional().default(true).describe('Auto-create left-to-right links between consecutive bundles'),
    startX: z.number().optional().describe('Override X start position for the first bundle (default: auto, appends after existing)'),
  },
  async ({ steps, autoLink, startX }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const baseX = startX ?? nextBundleX();
    const createdIds: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const bundle: Bundle = {
        id: uuidv4(),
        position: { x: baseX + i * 736, y: 200 },
        infoNote: { label: s.infoLabel, content: s.infoContent ?? '' },
        entityNote: { label: s.entityLabel, content: s.entityContent ?? '' },
        commandNote: { label: s.commandLabel, content: s.commandContent ?? '' },
        eventNote: { label: s.eventLabel, content: s.eventContent ?? '' },
        zIndex: 1,
        policies: [],
        paths: [],
        createdAt: now,
        updatedAt: now,
      };
      board.bundles.push(bundle);
      createdIds.push(bundle.id);
      await broadcast('add_bundle', bundle);
    }

    if (autoLink && createdIds.length > 1) {
      for (let i = 0; i < createdIds.length - 1; i++) {
        const link: Link = {
          id: uuidv4(),
          fromId: createdIds[i],
          fromType: 'bundle',
          toId: createdIds[i + 1],
          toType: 'bundle',
          createdAt: now,
        };
        board.links.push(link);
        await broadcast('add_link', link);
      }
    }

    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();

    const result = createdIds.map((id, index) => ({ id, index }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Batch path / phase tools ───────────────────────────────────────────────

server.tool(
  'es_set_event_paths',
  `Batch-assign FlowPath IDs to multiple bundles, notes, and/or remodels in one call (overwrites existing paths — not append).
Searches bundles[], notes[], and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
  {
    ids: z.array(z.string()).describe('Bundle, Note, or Remodel IDs to update'),
    paths: z.array(z.string()).describe('FlowPath IDs to assign (replaces existing paths)'),
  },
  async ({ ids, paths }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const updated: string[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      const bundle = board.bundles.find(b => b.id === id);
      if (bundle) {
        bundle.paths = paths;
        bundle.updatedAt = now;
        updated.push(id);
        continue;
      }
      const note = board.notes.find(n => n.id === id);
      if (note) {
        note.paths = paths;
        note.updatedAt = now;
        updated.push(id);
        continue;
      }
      const remodel = board.remodels.find(r => r.id === id);
      if (remodel) {
        remodel.paths = paths;
        remodel.updatedAt = now;
        updated.push(id);
        continue;
      }
      notFound.push(id);
    }

    if (updated.length > 0) {
      board.updatedAt = now;
      projectState.updatedAt = now;
      saveProject();
      await syncProjectToRelay();
      await broadcast('set_event_paths', { ids: updated, paths });
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ updated, notFound }),
      }],
    };
  }
);

server.tool(
  'es_set_event_phase',
  `Batch-assign a phase label to multiple bundles, notes, and/or remodels in one call (overwrites existing phase).
Searches bundles[], notes[], and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
  {
    ids: z.array(z.string()).describe('Bundle, Note, or Remodel IDs to update'),
    phase: z.string().describe('Phase label to assign (e.g. "Discovery", "Order Processing")'),
  },
  async ({ ids, phase }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const updated: string[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      const bundle = board.bundles.find(b => b.id === id);
      if (bundle) {
        bundle.phase = phase;
        bundle.updatedAt = now;
        updated.push(id);
        continue;
      }
      const note = board.notes.find(n => n.id === id);
      if (note) {
        note.phase = phase;
        note.updatedAt = now;
        updated.push(id);
        continue;
      }
      const remodel = board.remodels.find(r => r.id === id);
      if (remodel) {
        remodel.phase = phase;
        remodel.updatedAt = now;
        updated.push(id);
        continue;
      }
      notFound.push(id);
    }

    if (updated.length > 0) {
      board.updatedAt = now;
      projectState.updatedAt = now;
      saveProject();
      await syncProjectToRelay();
      await broadcast('set_event_phase', { ids: updated, phase });
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ updated, notFound }),
      }],
    };
  }
);

// ─── FlowPath tools ──────────────────────────────────────────────────────────

server.tool(
  'es_add_flow_path',
  `Add a named FlowPath definition to the active Bounded Context. Returns { id }.
FlowPaths are color-coded path markers used to categorize Bundles and Notes into named flows
(e.g. "Happy Path", "Error Path", "Admin Flow"). After creating a FlowPath, assign its id
to bundles/notes via es_update_bundle or es_update_note paths field.`,
  {
    name: z.string().describe('Display name for this flow path (e.g. "Happy Path", "Error Flow")'),
    color: z.string().describe('CSS color string for this path (e.g. "#4CAF50", "blue", "hsl(120,60%,50%)")'),
    description: z.string().optional().describe('Optional description of when/why this path is taken'),
  },
  async ({ name, color, description }) => {
    await loadProjectFromRelay();
    const now = new Date().toISOString();
    const flowPath: FlowPath = {
      id: uuidv4(),
      name,
      color,
      description,
    };
    const board = getActiveBoard();
    board.flowPaths.push(flowPath);
    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_flow_path', flowPath);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ id: flowPath.id }) }] };
  }
);

server.tool(
  'es_delete_flow_path',
  'Delete a FlowPath definition from the active Bounded Context by ID. Note: this does NOT remove the path id from bundles/notes that reference it.',
  { id: z.string().describe('FlowPath ID to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const exists = board.flowPaths.some(fp => fp.id === id);
    if (!exists) return { content: [{ type: 'text' as const, text: `FlowPath ${id} not found.` }] };
    board.flowPaths = board.flowPaths.filter(fp => fp.id !== id);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_flow_path', { id });
    return { content: [{ type: 'text' as const, text: `FlowPath ${id} deleted.` }] };
  }
);

// ─── Link tools ─────────────────────────────────────────────────────────────

server.tool(
  'es_add_link',
  'Create a directional link between two elements (notes, bundles, or remodels) in the active context. Returns { id }.',
  {
    fromId: z.string().describe('ID of the source element'),
    fromType: z.enum(['note', 'bundle', 'remodel']).describe('Type of the source element'),
    toId: z.string().describe('ID of the target element'),
    toType: z.enum(['note', 'bundle', 'remodel']).describe('Type of the target element'),
    label: z.string().optional().describe('Optional label for the link'),
  },
  async ({ fromId, fromType, toId, toType, label }) => {
    await loadProjectFromRelay();
    const link: Link = {
      id: uuidv4(),
      fromId,
      fromType,
      toId,
      toType,
      label,
      createdAt: new Date().toISOString(),
    };
    const board = getActiveBoard();
    board.links.push(link);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_link', link);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ id: link.id }) }] };
  }
);

server.tool(
  'es_delete_link',
  'Delete a link by ID.',
  { id: z.string().describe('Link ID to delete') },
  async ({ id }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    board.links = board.links.filter(l => l.id !== id);
    board.updatedAt = new Date().toISOString();
    projectState.updatedAt = board.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('delete_link', { id });
    return { content: [{ type: 'text' as const, text: 'Link deleted.' }] };
  }
);

// ─── Connect MCP over stdio ────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('MCP server ready\n');
