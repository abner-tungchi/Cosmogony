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
  // DomainEvent-centric fields
  behavior?: string;              // DomainEvent's behavior description (e.g. "Delete a product")
  information?: Property[];       // Command's input parameters
  eventProperties?: Property[];   // DomainEvent's output properties
  commandId?: string;             // DomainEvent links to its triggering Command
  entityId?: string;              // DomainEvent links to its Entity note
  // Visual group fields
  groupEventId?: string;              // Information/Command/Entity → their parent DomainEvent id
  informationForCommandId?: string;   // Information note → which Command it serves
  aggregateRootId?: string;           // Entity note → which AggregateRoot it belongs to
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

/** Returns the next auto-layout X for a new note cluster: rightmost existing note X + 400, or 80 if none. */
function nextEventX(): number {
  const board = getActiveBoard();
  const eventNotes = board.notes.filter((n) => n.type === 'DomainEvent');
  if (eventNotes.length === 0) return 80;
  const maxX = Math.max(...eventNotes.map((n) => n.position.x));
  return maxX + 400;
}

/** Returns the next auto-layout X for a new remodel: rightmost existing note/remodel X + 400, or 80 if none. */
function nextRemodelX(): number {
  const board = getActiveBoard();
  const allX = [
    ...board.notes.map((n) => n.position.x),
    ...board.remodels.map((r) => r.position.x),
  ];
  if (allX.length === 0) return 80;
  return Math.max(...allX) + 400;
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
  version: '3.0.0',
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
  'Return a summary of the entire project: name, project ID, and all contexts with note/event counts. Use this first to get a global overview before drilling into a specific context.',
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
        domainEventCount: b.notes.filter((n) => n.type === 'DomainEvent').length,
        commandCount: b.notes.filter((n) => n.type === 'Command').length,
        entityCount: b.notes.filter((n) => n.type === 'Entity').length,
        aggregateRootCount: b.notes.filter((n) => n.type === 'AggregateRoot').length,
        informationCount: b.notes.filter((n) => n.type === 'Information').length,
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
  `Return the active Bounded Context board JSON. Includes all notes (with DomainEvent-centric fields), remodels, links, and flowPaths.
Each DomainEvent note includes: commandId (linked Command note ID), entityId (linked Aggregate note ID), eventProperties (output schema), information (inherited from Command).
Use this before incremental edits to read current state.`,
  {},
  async () => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    // Annotate each note with resolved labels for readability
    const notesWithComputed = board.notes.map((n) => {
      if (n.type === 'DomainEvent') {
        const commandNote = n.commandId ? board.notes.find((c) => c.id === n.commandId) : undefined;
        const entityNote = n.entityId ? board.notes.find((e) => e.id === n.entityId) : undefined;
        return {
          ...n,
          _commandLabel: commandNote?.label ?? null,
          _entityLabel: entityNote?.label ?? null,
        };
      }
      if (n.type === 'Entity' && n.aggregateRootId) {
        const aggRoot = board.notes.find((e) => e.id === n.aggregateRootId);
        return { ...n, _aggregateRootLabel: aggRoot?.label ?? null };
      }
      return n;
    });
    const boardWithComputed = { ...board, notes: notesWithComputed };
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
  • Suggested Y layers: Actor/Policy→0, Command→200, DomainEvent→200, Aggregate→80
  • Types: DomainEvent | Command | Aggregate | Policy | ExternalSystem | Actor | ReadModel | Hotspot | Diamond | Dto
Note: Prefer es_add_command_for_event to create Command+DomainEvent pairs atomically.`,
  {
    type: z.enum(['DomainEvent', 'Command', 'Aggregate', 'AggregateRoot', 'Policy', 'ExternalSystem', 'Actor', 'ReadModel', 'Hotspot', 'Diamond', 'Dto']).describe('Element type'),
    label: z.string().describe('Text label for the note'),
    x: z.number().describe('X position in canvas coordinates'),
    y: z.number().describe('Y position in canvas coordinates'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this note belongs to'),
    phase: z.string().optional().describe('Phase or stage label for this note'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
    behavior: z.string().optional().describe('(DomainEvent only) Behavior description for this event (e.g. "Delete a product")'),
  },
  async ({ type, label, x, y, paths, phase, notes, behavior }) => {
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
      ...(type === 'DomainEvent' && behavior !== undefined ? { behavior } : {}),
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
    behavior: z.string().optional().describe('(DomainEvent only) Behavior description for this event (e.g. "Delete a product")'),
  },
  async ({ id, label, x, y, paths, phase, notes, behavior }) => {
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
    if (behavior !== undefined && note.type === 'DomainEvent') note.behavior = behavior;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    projectState.updatedAt = note.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id, label, x, y, paths, phase, notes, behavior });
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

// ─── DomainEvent-centric tools ──────────────────────────────────────────────

server.tool(
  'es_add_command_for_event',
  `Create a Command note and link it to an existing DomainEvent note as its trigger.
The Command is placed to the left of the DomainEvent on the canvas.
Also creates a directional link: Command → DomainEvent.
Returns { commandId, linkId }.

Use this to build the Command→Event flow step by step:
1. Create DomainEvent notes first (or use es_add_flow)
2. Call this tool to attach a Command to each event`,
  {
    eventNoteId: z.string().describe('ID of the DomainEvent note to attach the command to'),
    commandLabel: z.string().describe('Label for the Command note (imperative: e.g. "PlaceOrder", "Submit Payment")'),
    information: z.array(z.object({
      attrName: z.string().describe('Parameter attribute name'),
      type: z.string().describe('Parameter type (e.g. "String", "Integer", "Boolean")'),
    })).optional().default([]).describe('Input parameters required by this command'),
  },
  async ({ eventNoteId, commandLabel, information }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const eventNote = board.notes.find((n) => n.id === eventNoteId);
    if (!eventNote) {
      return { content: [{ type: 'text' as const, text: `DomainEvent note ${eventNoteId} not found.` }] };
    }
    if (eventNote.type !== 'DomainEvent') {
      return { content: [{ type: 'text' as const, text: `Note ${eventNoteId} is not a DomainEvent (type: ${eventNote.type}).` }] };
    }

    const now = new Date().toISOString();
    const commandNoteId = uuidv4();

    const commandNote: StickyNote = {
      id: commandNoteId,
      type: 'Command',
      label: commandLabel,
      position: {
        x: eventNote.position.x - 176,
        y: eventNote.position.y,
      },
      size: { width: 160, height: 80 },
      zIndex: eventNote.zIndex,
      paths: eventNote.paths ?? [],
      phase: eventNote.phase,
      information: information ?? [],
      groupEventId: eventNoteId,
      createdAt: now,
      updatedAt: now,
    };

    board.notes.push(commandNote);

    // If information is non-empty, also create an Information note
    let infoNoteId: string | undefined;
    if ((information ?? []).length > 0) {
      infoNoteId = uuidv4();
      const infoNote: StickyNote = {
        id: infoNoteId,
        type: 'Information',
        label: commandLabel + ' Info',
        position: {
          x: commandNote.position.x - 176,
          y: commandNote.position.y,
        },
        size: { width: 160, height: 80 },
        zIndex: eventNote.zIndex,
        paths: eventNote.paths ?? [],
        information: [...(information ?? [])],
        groupEventId: eventNoteId,
        informationForCommandId: commandNoteId,
        createdAt: now,
        updatedAt: now,
      };
      board.notes.push(infoNote);
      await broadcast('add_note', infoNote);
    }

    // Update the DomainEvent to reference this Command (no Link record)
    eventNote.commandId = commandNoteId;
    eventNote.updatedAt = now;

    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_note', commandNote);
    await broadcast('update_note', { id: eventNoteId, commandId: commandNoteId });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ commandId: commandNoteId, infoNoteId: infoNoteId ?? null }),
      }],
    };
  }
);

server.tool(
  'es_update_command_information',
  'Update the input parameters (information schema) of a Command note. Replaces all existing parameters.',
  {
    commandId: z.string().describe('ID of the Command note to update'),
    information: z.array(z.object({
      attrName: z.string().describe('Parameter attribute name'),
      type: z.string().describe('Parameter type (e.g. "String", "Integer", "Boolean")'),
    })).describe('Complete replacement of the command\'s input parameters'),
  },
  async ({ commandId, information }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const note = board.notes.find((n) => n.id === commandId);
    if (!note) return { content: [{ type: 'text' as const, text: `Note ${commandId} not found.` }] };
    if (note.type !== 'Command') return { content: [{ type: 'text' as const, text: `Note ${commandId} is not a Command (type: ${note.type}).` }] };
    note.information = information;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    projectState.updatedAt = note.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id: commandId, information });
    return { content: [{ type: 'text' as const, text: 'Command information updated.' }] };
  }
);

server.tool(
  'es_update_event_properties',
  'Update the output properties (event schema) of a DomainEvent note. Replaces all existing properties.',
  {
    eventId: z.string().describe('ID of the DomainEvent note to update'),
    eventProperties: z.array(z.object({
      attrName: z.string().describe('Property attribute name'),
      type: z.string().describe('Property type (e.g. "String", "Integer", "DateTime")'),
    })).describe('Complete replacement of the event\'s output properties'),
  },
  async ({ eventId, eventProperties }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const note = board.notes.find((n) => n.id === eventId);
    if (!note) return { content: [{ type: 'text' as const, text: `Note ${eventId} not found.` }] };
    if (note.type !== 'DomainEvent') return { content: [{ type: 'text' as const, text: `Note ${eventId} is not a DomainEvent (type: ${note.type}).` }] };
    note.eventProperties = eventProperties;
    note.updatedAt = new Date().toISOString();
    board.updatedAt = note.updatedAt;
    projectState.updatedAt = note.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id: eventId, eventProperties });
    return { content: [{ type: 'text' as const, text: 'Event properties updated.' }] };
  }
);

server.tool(
  'es_link_entity_to_event',
  `Link an Aggregate note to a DomainEvent as its entity (the aggregate being acted upon).
Sets DomainEvent.entityId = aggregateNoteId. Pass aggregateNoteId as empty string "" to unlink.
Returns { success: true }.`,
  {
    eventNoteId: z.string().describe('ID of the DomainEvent note'),
    aggregateNoteId: z.string().describe('ID of the Aggregate note to link (pass empty string to unlink)'),
  },
  async ({ eventNoteId, aggregateNoteId }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const eventNote = board.notes.find((n) => n.id === eventNoteId);
    if (!eventNote) return { content: [{ type: 'text' as const, text: `DomainEvent note ${eventNoteId} not found.` }] };
    if (eventNote.type !== 'DomainEvent') return { content: [{ type: 'text' as const, text: `Note ${eventNoteId} is not a DomainEvent.` }] };

    const entityId = aggregateNoteId.trim() === '' ? undefined : aggregateNoteId;
    eventNote.entityId = entityId;
    eventNote.updatedAt = new Date().toISOString();
    board.updatedAt = eventNote.updatedAt;
    projectState.updatedAt = eventNote.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id: eventNoteId, entityId });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
  }
);

// ─── Flow (happy path) tool ──────────────────────────────────────────────────

server.tool(
  'es_add_flow',
  `Create an entire Event Storming happy path by adding multiple Command→DomainEvent pairs in one call.
Each step creates: one Command note + one DomainEvent note + a Command→Event link.
Steps are auto-positioned left-to-right (400px spacing, y=200) starting after any existing events.
Optionally auto-links consecutive DomainEvents with arrows.
Returns [{ commandId, eventId, linkId, index }] for each step.

Layout per step (pair of notes, 200px spacing):
  Command: x=stepX,       y=200, size 160×80, color blue
  Event:   x=stepX+200,   y=200, size 160×80, color orange

Example: 3 steps → placed at x=80, x=480, x=880 (if board is empty)`,
  {
    steps: z.array(z.object({
      commandLabel: z.string().describe('Command label (imperative: e.g. "PlaceOrder")'),
      eventLabel: z.string().describe('Domain Event label (past tense: e.g. "OrderPlaced")'),
      eventBehavior: z.string().optional().describe('Behavior description for the DomainEvent (e.g. "Delete a product")'),
      information: z.array(z.object({
        attrName: z.string(),
        type: z.string(),
      })).optional().default([]).describe('Input parameters for the command'),
      eventProperties: z.array(z.object({
        attrName: z.string(),
        type: z.string(),
      })).optional().default([]).describe('Output properties carried by the domain event'),
    })).describe('Ordered flow steps, left to right'),
    autoLink: z.boolean().optional().default(true).describe('Auto-create DomainEvent→next-Command links between consecutive steps'),
    startX: z.number().optional().describe('Override X start position for the first step (default: auto, appends after existing events)'),
  },
  async ({ steps, autoLink, startX }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const baseX = startX ?? nextEventX();
    const STEP_SPACING = 400;
    const CMD_EVENT_GAP = 200;

    const createdSteps: Array<{ commandId: string; eventId: string; linkId: string; index: number }> = [];

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const stepX = baseX + i * STEP_SPACING;

      const commandId = uuidv4();
      const eventId = uuidv4();
      const linkId = uuidv4();

      const commandNote: StickyNote = {
        id: commandId,
        type: 'Command',
        label: s.commandLabel,
        position: { x: stepX, y: 200 },
        size: { width: 160, height: 80 },
        zIndex: 1,
        paths: [],
        information: s.information ?? [],
        createdAt: now,
        updatedAt: now,
      };

      const eventNote: StickyNote = {
        id: eventId,
        type: 'DomainEvent',
        label: s.eventLabel,
        position: { x: stepX + CMD_EVENT_GAP, y: 200 },
        size: { width: 160, height: 80 },
        zIndex: 1,
        paths: [],
        commandId,
        ...(s.eventBehavior !== undefined ? { behavior: s.eventBehavior } : {}),
        eventProperties: s.eventProperties ?? [],
        createdAt: now,
        updatedAt: now,
      };

      const cmdEventLink: Link = {
        id: linkId,
        fromId: commandId,
        toId: eventId,
        fromType: 'note',
        toType: 'note',
        createdAt: now,
      };

      board.notes.push(commandNote);
      board.notes.push(eventNote);
      board.links.push(cmdEventLink);

      await broadcast('add_note', commandNote);
      await broadcast('add_note', eventNote);
      await broadcast('add_link', cmdEventLink);

      createdSteps.push({ commandId, eventId, linkId, index: i });
    }

    // Auto-link: DomainEvent[i] → Command[i+1]
    if (autoLink && createdSteps.length > 1) {
      for (let i = 0; i < createdSteps.length - 1; i++) {
        const flowLink: Link = {
          id: uuidv4(),
          fromId: createdSteps[i].eventId,
          toId: createdSteps[i + 1].commandId,
          fromType: 'note',
          toType: 'note',
          createdAt: now,
        };
        board.links.push(flowLink);
        await broadcast('add_link', flowLink);
      }
    }

    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();

    return { content: [{ type: 'text' as const, text: JSON.stringify(createdSteps, null, 2) }] };
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
  • Lavender (bottom-right): Return type description
  • Remodel size: 496×248px; omit x/y for auto-layout (appended right of existing elements at y=520)
  • linkedBundleIds now means linked DomainEvent note IDs (post-migration)`,
  {
    aggregateLabel: z.string().describe('Aggregate name for read perspective (top cell)'),
    aggregateContent: z.string().optional().describe('Aggregate description'),
    parameterLabel: z.string().describe('Query parameter name (bottom-left cell)'),
    parameterContent: z.string().optional().describe('Parameter details'),
    queryLabel: z.string().describe('Query name — convention: "Get" + name, e.g. "GetOrderList" (bottom-center cell)'),
    queryContent: z.string().optional().describe('Query description'),
    returnTypeLabel: z.string().describe('Return type name (bottom-right cell)'),
    returnTypeContent: z.string().optional().describe('Return type description'),
    linkedEventIds: z.array(z.string()).optional().describe('IDs of DomainEvent notes whose events feed this Read Model (stored in linkedBundleIds field)'),
    linkedDtoIds: z.array(z.string()).optional().describe('IDs of Dto StickyNotes associated with this Remodel (default: [])'),
    x: z.number().optional().describe('X position (omit for auto-layout)'),
    y: z.number().optional().describe('Y position (omit for auto-layout, defaults to 520)'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
    phase: z.string().optional().describe('Phase or stage label'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ aggregateLabel, aggregateContent, parameterLabel, parameterContent, queryLabel, queryContent, returnTypeLabel, returnTypeContent, linkedEventIds, linkedDtoIds, x, y, paths, phase, notes }) => {
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
      returnTypeNote: { label: returnTypeLabel, content: returnTypeContent ?? '' },
      linkedBundleIds: linkedEventIds ?? [],
      linkedDtoIds: linkedDtoIds ?? [],
      zIndex: board.remodels.length + board.notes.length + 1,
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
      content: [{ type: 'text' as const, text: JSON.stringify(remodel, null, 2) }],
    };
  }
);

server.tool(
  'es_update_remodel',
  'Update a Remodel\'s content, linked events, or metadata. All fields except id are optional (partial update — undefined fields are not overwritten).',
  {
    id: z.string().describe('Remodel ID to update'),
    aggregateLabel: z.string().optional().describe('Aggregate name (top cell)'),
    aggregateContent: z.string().optional().describe('Aggregate description'),
    parameterLabel: z.string().optional().describe('Query parameter name (bottom-left cell)'),
    parameterContent: z.string().optional().describe('Parameter details'),
    queryLabel: z.string().optional().describe('Query name (bottom-center cell)'),
    queryContent: z.string().optional().describe('Query description'),
    returnTypeLabel: z.string().optional().describe('Return type name (bottom-right cell)'),
    returnTypeContent: z.string().optional().describe('Return type description'),
    linkedEventIds: z.array(z.string()).optional().describe('Complete replacement of linked DomainEvent note IDs (stored in linkedBundleIds)'),
    linkedDtoIds: z.array(z.string()).optional().describe('Complete replacement of linked Dto StickyNote IDs (not append)'),
    sourceEventsExpanded: z.boolean().optional().describe('Source Events area expanded state'),
    x: z.number().optional().describe('New X position'),
    y: z.number().optional().describe('New Y position'),
    paths: z.array(z.string()).optional().describe('FlowPath IDs this remodel belongs to'),
    phase: z.string().optional().describe('Phase or stage label'),
    notes: z.string().optional().describe('Free-text annotations or remarks'),
  },
  async ({ id, aggregateLabel, aggregateContent, parameterLabel, parameterContent, queryLabel, queryContent, returnTypeLabel, returnTypeContent, linkedEventIds, linkedDtoIds, sourceEventsExpanded, x, y, paths, phase, notes }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const remodel = board.remodels.find((r) => r.id === id);
    if (!remodel) return { content: [{ type: 'text' as const, text: `Remodel ${id} not found.` }] };

    if (x !== undefined) remodel.position.x = x;
    if (y !== undefined) remodel.position.y = y;
    if (aggregateLabel !== undefined) remodel.aggregateNote.label = aggregateLabel;
    if (aggregateContent !== undefined) remodel.aggregateNote.content = aggregateContent;
    if (parameterLabel !== undefined) remodel.parameterNote.label = parameterLabel;
    if (parameterContent !== undefined) remodel.parameterNote.content = parameterContent;
    if (queryLabel !== undefined) remodel.queryNote.label = queryLabel;
    if (queryContent !== undefined) remodel.queryNote.content = queryContent;
    if (returnTypeLabel !== undefined) remodel.returnTypeNote.label = returnTypeLabel;
    if (returnTypeContent !== undefined) remodel.returnTypeNote.content = returnTypeContent;
    if (linkedEventIds !== undefined) remodel.linkedBundleIds = linkedEventIds;
    if (linkedDtoIds !== undefined) remodel.linkedDtoIds = linkedDtoIds;
    if (sourceEventsExpanded !== undefined) remodel.sourceEventsExpanded = sourceEventsExpanded;
    if (paths !== undefined) remodel.paths = paths;
    if (phase !== undefined) remodel.phase = phase;
    if (notes !== undefined) remodel.notes = notes;

    remodel.updatedAt = new Date().toISOString();
    board.updatedAt = remodel.updatedAt;
    projectState.updatedAt = remodel.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_remodel', remodel);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(remodel, null, 2) }],
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
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: id }) }],
    };
  }
);

// ─── Batch path / phase tools ───────────────────────────────────────────────

server.tool(
  'es_set_event_paths',
  `Batch-assign FlowPath IDs to multiple notes and/or remodels in one call (overwrites existing paths — not append).
Searches notes[] and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
  {
    ids: z.array(z.string()).describe('Note or Remodel IDs to update'),
    paths: z.array(z.string()).describe('FlowPath IDs to assign (replaces existing paths)'),
  },
  async ({ ids, paths }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const updated: string[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
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
  `Batch-assign a phase label to multiple notes and/or remodels in one call (overwrites existing phase).
Searches notes[] and remodels[] so you can mix IDs freely.
Returns { updated: string[], notFound: string[] }.`,
  {
    ids: z.array(z.string()).describe('Note or Remodel IDs to update'),
    phase: z.string().describe('Phase label to assign (e.g. "Discovery", "Order Processing")'),
  },
  async ({ ids, phase }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const now = new Date().toISOString();

    const updated: string[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
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
FlowPaths are color-coded path markers used to categorize Notes into named flows
(e.g. "Happy Path", "Error Path", "Admin Flow"). After creating a FlowPath, assign its id
to notes via es_update_note paths field.`,
  {
    name: z.string().describe('Display name for this flow path (e.g. "Happy Path", "Error Flow")'),
    color: z.string().describe('CSS color string for this path (e.g. "#4CAF50", "blue", "hsl(120,60%,50%)")'),
    description: z.string().optional().describe('Optional description of when/why this path is taken'),
  },
  async ({ name, color, description }) => {
    await loadProjectFromRelay();
    const now = new Date().toISOString();
    const flowPath: FlowPath = { id: uuidv4(), name, color, description };
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
  'Delete a FlowPath definition from the active Bounded Context by ID. Note: this does NOT remove the path id from notes that reference it.',
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
  'Create a directional link between two elements (notes or remodels) in the active context. Returns { id }.',
  {
    fromId: z.string().describe('ID of the source element'),
    fromType: z.enum(['note', 'remodel']).describe('Type of the source element'),
    toId: z.string().describe('ID of the target element'),
    toType: z.enum(['note', 'remodel']).describe('Type of the target element'),
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

// ─── Entity / AggregateRoot tools ───────────────────────────────────────────

server.tool(
  'es_add_entity_for_event',
  `Create an Entity note and link it to an existing DomainEvent note as its entity.
The Entity is placed above the group of satellite notes (Command, Information) centered on the DomainEvent.
Returns { entityId }.`,
  {
    eventNoteId: z.string().describe('ID of the DomainEvent note'),
    entityLabel: z.string().describe('Label for the Entity note (noun, e.g. "Order", "Customer")'),
  },
  async ({ eventNoteId, entityLabel }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const eventNote = board.notes.find((n) => n.id === eventNoteId);
    if (!eventNote) {
      return { content: [{ type: 'text' as const, text: `DomainEvent note ${eventNoteId} not found.` }] };
    }
    if (eventNote.type !== 'DomainEvent') {
      return { content: [{ type: 'text' as const, text: `Note ${eventNoteId} is not a DomainEvent.` }] };
    }

    const now = new Date().toISOString();
    const NOTE_WIDTH = 160;

    // Compute group bounds
    const groupNotes = board.notes.filter(
      (n) => n.groupEventId === eventNoteId || n.id === eventNoteId
    );
    const minX = groupNotes.length > 0 ? Math.min(...groupNotes.map((n) => n.position.x)) : eventNote.position.x;
    const maxX = groupNotes.length > 0 ? Math.max(...groupNotes.map((n) => n.position.x)) : eventNote.position.x;
    const groupCenterX = (minX + maxX + NOTE_WIDTH) / 2;

    const entityNote: StickyNote = {
      id: uuidv4(),
      type: 'Entity',
      label: entityLabel,
      position: {
        x: groupCenterX - NOTE_WIDTH / 2,
        y: eventNote.position.y - 104,
      },
      size: { width: NOTE_WIDTH, height: 80 },
      zIndex: eventNote.zIndex,
      paths: eventNote.paths ?? [],
      groupEventId: eventNoteId,
      createdAt: now,
      updatedAt: now,
    };

    board.notes.push(entityNote);
    eventNote.entityId = entityNote.id;
    eventNote.updatedAt = now;

    board.updatedAt = now;
    projectState.updatedAt = now;
    saveProject();
    await syncProjectToRelay();
    await broadcast('add_note', entityNote);
    await broadcast('update_note', { id: eventNoteId, entityId: entityNote.id });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ entityId: entityNote.id }) }],
    };
  }
);

server.tool(
  'es_link_entity_to_aggregate_root',
  `Link an Entity note to an AggregateRoot note. Sets Entity.aggregateRootId = aggregateRootNoteId.
Pass aggregateRootNoteId as empty string "" to unlink.
Returns { success: true }.`,
  {
    entityNoteId: z.string().describe('ID of the Entity note'),
    aggregateRootNoteId: z.string().describe('ID of the AggregateRoot note to link (pass empty string to unlink)'),
  },
  async ({ entityNoteId, aggregateRootNoteId }) => {
    await loadProjectFromRelay();
    const board = getActiveBoard();
    const entityNote = board.notes.find((n) => n.id === entityNoteId);
    if (!entityNote) return { content: [{ type: 'text' as const, text: `Entity note ${entityNoteId} not found.` }] };
    if (entityNote.type !== 'Entity') return { content: [{ type: 'text' as const, text: `Note ${entityNoteId} is not an Entity.` }] };

    const aggRootId = aggregateRootNoteId.trim() === '' ? undefined : aggregateRootNoteId;
    entityNote.aggregateRootId = aggRootId;
    entityNote.updatedAt = new Date().toISOString();
    board.updatedAt = entityNote.updatedAt;
    projectState.updatedAt = entityNote.updatedAt;
    saveProject();
    await syncProjectToRelay();
    await broadcast('update_note', { id: entityNoteId, aggregateRootId: aggRootId });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
  }
);

// ─── Connect MCP over stdio ────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('MCP server ready\n');
