import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TOOL_DEFINITIONS, type ToolDefinition, type ToolRiskLevel } from '../tools/toolDefinitions.js';
import type { ToolDeclaration } from '../llm/adapter.js';
import type { ToolHandlerCtx, ToolHandlerResult } from '../tools/handlers.js';

export interface ProposalDescription {
  targetIds: string[];
  subjectLabel: string;
  humanSummary: string;
}

export interface Skill {
  readonly name: string;
  buildDeclarations(): ToolDeclaration[];
  execute(toolName: string, args: unknown, ctx: ToolHandlerCtx): ToolHandlerResult;
}

const EXPOSED_RISKS: ReadonlyArray<ToolRiskLevel> = ['read', 'additive'];

export class EventStormingSkill implements Skill {
  readonly name = 'event-storming';
  private declarations: ToolDeclaration[] | null = null;

  buildDeclarations(): ToolDeclaration[] {
    if (this.declarations) return this.declarations;
    this.declarations = TOOL_DEFINITIONS
      .filter((d) => EXPOSED_RISKS.includes(d.risk))
      .map((d) => toDeclaration(d));
    return this.declarations;
  }

  execute(toolName: string, args: unknown, ctx: ToolHandlerCtx): ToolHandlerResult {
    const def = TOOL_DEFINITIONS.find((d) => d.name === toolName);
    if (!def || !EXPOSED_RISKS.includes(def.risk)) {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: {
          code: 'PRECONDITION_FAILED',
          message: `Tool ${toolName} not exposed in MVP-mid.`,
        },
      };
    }
    const schema = z.object(def.schema);
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        resultJson: null,
        events: [],
        error: {
          code: 'PRECONDITION_FAILED',
          message: `Invalid args for ${toolName}: ${parsed.error.message}`,
        },
      };
    }
    return (def.handler as (a: unknown, c: ToolHandlerCtx) => ToolHandlerResult)(parsed.data, ctx);
  }

  describeProposal(toolName: string, args: unknown, ctx: ToolHandlerCtx): ProposalDescription {
    const a = (args ?? {}) as Record<string, unknown>;
    const board = ctx.projectState.boards.find((b) => b.id === ctx.projectState.activeBoardId);
    const findLabel = (id: string | undefined): string | undefined => {
      if (!id || !board) return undefined;
      const note = board.notes.find((n) => n.id === id);
      return note?.label;
    };

    let targetIds: string[] = [];
    let subjectLabel = '';
    let humanSummary = '';
    const boardName = board?.name ?? 'unknown';

    switch (toolName) {
      case 'es_add_command_for_event': {
        targetIds = typeof a.eventNoteId === 'string' ? [a.eventNoteId] : [];
        const eventLabel = findLabel(targetIds[0]) ?? targetIds[0];
        const cmdLabel = String(a.commandLabel ?? '');
        subjectLabel = `Command "${cmdLabel}"`;
        humanSummary = `在 board "${boardName}" 加 Command "${cmdLabel}" 並關聯到 event "${eventLabel}"`;
        break;
      }
      case 'es_add_entity_for_event': {
        targetIds = typeof a.eventNoteId === 'string' ? [a.eventNoteId] : [];
        const eventLabel = findLabel(targetIds[0]) ?? targetIds[0];
        const entLabel = String(a.entityLabel ?? '');
        subjectLabel = `Entity "${entLabel}"`;
        humanSummary = `在 board "${boardName}" 加 Entity "${entLabel}" 並關聯到 event "${eventLabel}"`;
        break;
      }
      case 'es_add_invariant': {
        targetIds = typeof a.noteId === 'string' ? [a.noteId] : [];
        const aggLabel = findLabel(targetIds[0]) ?? targetIds[0];
        const inv = (a.invariant ?? {}) as Record<string, unknown>;
        const invTitle = String(inv.title ?? inv.name ?? 'invariant');
        subjectLabel = `Invariant "${invTitle}"`;
        humanSummary = `在 aggregate "${aggLabel}" 加 invariant "${invTitle}"`;
        break;
      }
      case 'es_add_command_condition': {
        const cmdId = typeof a.commandNoteId === 'string' ? a.commandNoteId : '';
        targetIds = cmdId ? [cmdId] : [];
        const cmdLabel = findLabel(cmdId) ?? cmdId;
        const cond = (a.condition ?? {}) as Record<string, unknown>;
        const kindLabel = a.kind === 'pre' ? '前置狀態' : '執行後狀態';
        const text = String(cond.text ?? '(unnamed condition)');
        const shortText = text.length > 40 ? text.slice(0, 40) + '...' : text;
        subjectLabel = `${kindLabel} "${shortText}"`;
        humanSummary = `在 Command "${cmdLabel}" 加 ${kindLabel}：${text}`;
        break;
      }
      case 'es_add_link': {
        const fromId = typeof a.fromId === 'string' ? a.fromId : '';
        const toId = typeof a.toId === 'string' ? a.toId : '';
        const fromType = a.fromType;
        const toType = a.toType;
        const ids: string[] = [];
        if (fromType === 'note' && fromId) ids.push(fromId);
        if (toType === 'note' && toId) ids.push(toId);
        targetIds = ids;
        subjectLabel = `Link ${fromId} → ${toId}`;
        humanSummary = `在 board "${boardName}" 加 link：${findLabel(fromId) ?? fromId} → ${findLabel(toId) ?? toId}`;
        break;
      }
      case 'es_create_context': {
        targetIds = [];
        const ctxName = String(a.name ?? '');
        subjectLabel = `Context "${ctxName}"`;
        humanSummary = `建立新 Bounded Context "${ctxName}"`;
        break;
      }
      case 'es_add_note': {
        targetIds = [];
        const noteType = String(a.type ?? 'Note');
        const noteLabel = String(a.label ?? '');
        subjectLabel = `${noteType} "${noteLabel}"`;
        humanSummary = `在 board "${boardName}" 加 ${noteType} "${noteLabel}"`;
        break;
      }
      case 'es_add_flow': {
        targetIds = [];
        const steps = Array.isArray(a.steps) ? a.steps.length : 0;
        subjectLabel = `Flow (${steps} steps)`;
        humanSummary = `在 board "${boardName}" 加 ${steps} 個 Command+Event pair`;
        break;
      }
      case 'es_add_remodel': {
        targetIds = [];
        const queryLabel = String((a.queryNote as { label?: string } | undefined)?.label ?? 'Remodel');
        subjectLabel = `Remodel "${queryLabel}"`;
        humanSummary = `在 board "${boardName}" 加 Remodel "${queryLabel}"`;
        break;
      }
      case 'es_add_flow_path': {
        targetIds = [];
        const fpName = String(a.name ?? '');
        subjectLabel = `FlowPath "${fpName}"`;
        humanSummary = `在 board "${boardName}" 加 FlowPath "${fpName}"`;
        break;
      }
      default: {
        targetIds = [];
        subjectLabel = toolName;
        humanSummary = `執行 ${toolName}`;
      }
    }
    return { targetIds, subjectLabel, humanSummary };
  }
}

function toDeclaration(def: ToolDefinition): ToolDeclaration {
  const zodSchema = z.object(def.schema);
  const json = zodToJsonSchema(zodSchema, { target: 'openApi3', $refStrategy: 'none' }) as object;
  return {
    name: def.name,
    description: def.description,
    parameters: json,
  };
}
