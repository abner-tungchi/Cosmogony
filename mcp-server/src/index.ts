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

interface StickyNote {
  id: string;
  type: ElementType;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
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
  createdAt: string;
  updatedAt: string;
}

interface Link {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'note' | 'bundle';
  toType: 'note' | 'bundle';
  label?: string;
  createdAt: string;
}

interface Board {
  id: string;
  name: string;
  notes: StickyNote[];
  bundles: Bundle[];
  links: Link[];
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
    links: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

let projectState: Project = (() => {
  if (existsSync(PROJECT_FILE)) {
    try {
      return JSON.parse(readFileSync(PROJECT_FILE, 'utf-8')) as Project;
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

// ─── SSE subscribers ───────────────────────────────────────────────────────

const subscribers = new Set<Response>();

// ─── Relay mode helpers ────────────────────────────────────────────────────

let expressReady = false;
const RELAY_BASE = process.env.ES_RELAY_BASE ?? 'http://localhost:3333';
const FORCE_RELAY = process.env.ES_RELAY_MODE === 'true';

async function broadcast(action: string, payload: unknown): Promise<void> {
  const body = JSON.stringify({ action, payload });
  if (expressReady) {
    for (const res of subscribers) {
      res.write(`data: ${body}\n\n`);
    }
  } else {
    try {
      await fetch(`${RELAY_BASE}/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
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
      if (res.ok) projectState = (await res.json()) as Project;
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

  subscribers.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
});

// React syncs project state here
app.post('/api/board', (req: Request, res: Response) => {
  if (req.body && typeof req.body === 'object') {
    projectState = req.body as Project;
    saveProject();
  }
  res.json({ ok: true });
});

// Read project state (used by relay instances)
app.get('/api/board', (_req: Request, res: Response) => {
  res.json(projectState);
});

// Relay broadcast endpoint
app.post('/api/broadcast', (req: Request, res: Response) => {
  const { action, payload } = req.body as { action: string; payload: unknown };
  const data = JSON.stringify({ action, payload });
  for (const sub of subscribers) {
    sub.write(`data: ${data}\n\n`);
  }
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
  version: '2.0.0',
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
        linkCount: b.links.length,
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
    const now = new Date().toISOString();
    const newBoard: Board = {
      id: uuidv4(),
      name,
      notes: [],
      bundles: [],
      links: [],
      createdAt: now,
      updatedAt: now,
    };
    projectState.boards.push(newBoard);
    projectState.activeBoardId = newBoard.id;
    projectState.updatedAt = now;
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
  'Return the active Bounded Context board JSON. Use this before incremental edits to read current state.',
  {},
  async () => {
    await loadProjectFromRelay();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(getActiveBoard(), null, 2) }],
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
  },
  async ({ type, label, x, y }) => {
    await loadProjectFromRelay();
    const now = new Date().toISOString();
    const note: StickyNote = {
      id: uuidv4(),
      type,
      label,
      position: { x, y },
      size: { width: 160, height: 80 },
      zIndex: 1,
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
  },
  async ({ id, label, x, y }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const note = board.notes.find(n => n.id === id);
    if (!note) return { content: [{ type: 'text' as const, text: `Note ${id} not found.` }] };
    if (label !== undefined) note.label = label;
    if (x !== undefined) note.position.x = x;
    if (y !== undefined) note.position.y = y;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    projectState.updatedAt = note.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id, label, x, y });
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
  },
  async ({ x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent }) => {
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
  'Update any sub-note labels/contents or position of an existing Bundle. All fields except id are optional.',
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
  },
  async ({ id, x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent }) => {
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
    bundle.updatedAt = new Date().toISOString();
    board.updatedAt = bundle.updatedAt;
    projectState.updatedAt = bundle.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_bundle', { id, x, y, infoLabel, infoContent, entityLabel, entityContent, commandLabel, commandContent, eventLabel, eventContent });
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

// ─── Link tools ─────────────────────────────────────────────────────────────

server.tool(
  'es_add_link',
  'Create a directional link between two elements (notes or bundles) in the active context. Returns { id }.',
  {
    fromId: z.string().describe('ID of the source element'),
    fromType: z.enum(['note', 'bundle']).describe('Type of the source element'),
    toId: z.string().describe('ID of the target element'),
    toType: z.enum(['note', 'bundle']).describe('Type of the target element'),
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
