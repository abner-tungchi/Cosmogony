import { v4 as uuidv4 } from 'uuid';
import type {
  LLMAdapter,
  FunctionCallRequest,
  ToolResponseMessage,
  ToolResponseEnvelope,
} from '../llm/adapter.js';
import type { EventStormingSkill } from '../skills/eventStormingSkill.js';
import type { CoachMessage, BoardSnapshot, ProposedAction } from '../types.js';
import type { AuditLog } from '../audit/auditLog.js';
import type { PendingActionStore, ProjectSnapshot } from './pendingActions.js';
import { computeTargetEntityHash } from './pendingActions.js';
import {
  detectMutationIntent,
  checkProposalBudget,
  DEFAULT_PROPOSAL_BUDGET_PER_TURN,
} from './intentGate.js';
import type { ToolHandlerCtx } from '../tools/handlers.js';
import { TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';

const MAX_STEPS = 6;
const MAX_READ_CALLS = 3;

export interface AgentTurnInput {
  sessionId: string;
  userId: string;
  userMessage: string;
  attachSnapshot: boolean;
  boardSnapshot: BoardSnapshot | null;
  /** ToolResponseMessage 注入 from prior turn (Step 2 wires this — Step 1 may be []). */
  priorToolResponses?: ToolResponseMessage[];
  /** Optional override (Spec A pattern). */
  modelOverride?: string;
}

export interface AgentTurnResult {
  assistantMessage: CoachMessage;
  newPendingActions: ProposedAction[];
}

export interface OrchestratorDeps {
  llm: LLMAdapter;
  skill: EventStormingSkill;
  pendingStore: PendingActionStore;
  auditLog: AuditLog;
  loadProject: () => ProjectSnapshot;
  buildSystemPrompt: (input: {
    attachSnapshot: boolean;
    snapshot: BoardSnapshot | null;
  }) => string;
  /** package.json version — fed to auditLog entries. */
  toolVersion: string;
  /** Optional clock for testability. */
  now?: () => string;
}

export async function runAgentTurn(
  input: AgentTurnInput,
  deps: OrchestratorDeps,
): Promise<AgentTurnResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const systemPrompt = deps.buildSystemPrompt({
    attachSnapshot: input.attachSnapshot,
    snapshot: input.boardSnapshot,
  });
  const tools = deps.skill.buildDeclarations();

  const messages = [{ role: 'user' as const, content: input.userMessage }];
  let toolResponses: ToolResponseMessage[] = input.priorToolResponses ?? [];

  const newPending: ProposedAction[] = [];
  const proposedThisTurn = { count: 0 };
  const readDedup = new Set<string>();
  let readCallCount = 0;
  let lastContent = '';
  let lastModelUsed = deps.llm.modelName;
  let lastTokenUsage = { input: 0, output: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await deps.llm.chat({
      systemPrompt,
      messages,
      model: input.modelOverride,
      tools,
      toolConfig: { mode: 'AUTO' },
      toolResponses,
    });

    lastContent = reply.content ?? lastContent;
    lastModelUsed = reply.modelUsed;
    lastTokenUsage = reply.tokenUsage;
    toolResponses = []; // consumed

    const calls = reply.functionCalls ?? [];

    if (calls.length === 0) {
      // No tool calls — terminate.
      break;
    }

    let mutatingProposedThisStep = false;
    const stepToolResponses: ToolResponseMessage[] = [];

    for (const call of calls) {
      const def = TOOL_DEFINITIONS.find((d) => d.name === call.name);
      const risk = def?.risk ?? 'unset';

      if (risk === 'read') {
        const dedupKey = `${call.name}:${stableStringify(call.args)}`;
        if (readCallCount >= MAX_READ_CALLS || readDedup.has(dedupKey)) {
          stepToolResponses.push({
            toolCallId: call.id,
            toolName: call.name,
            response: {
              status: 'failed',
              actionId: `read-${call.id}`,
              errorEnvelope: {
                code: 'PRECONDITION_FAILED',
                message: 'Read budget exhausted or duplicate call.',
              },
            },
          });
          continue;
        }
        readDedup.add(dedupKey);
        readCallCount += 1;

        const ctx: ToolHandlerCtx = {
          projectState: deps.loadProject() as unknown as ToolHandlerCtx['projectState'],
          now,
        };
        const result = deps.skill.execute(call.name, call.args, ctx);
        await deps.auditLog.append({
          schemaVersion: 1,
          toolVersion: deps.toolVersion,
          eventType: 'auto_exec_read',
          timestamp: now(),
          sessionId: input.sessionId,
          messageId: null,
          actionId: null,
          toolName: call.name,
          args: call.args,
          status: 'auto_exec',
          baseHash: '',
          baseProjectVersion: deps.loadProject().updatedAt,
          forceApply: null,
          errorEnvelope: null,
          resultJson: result.resultJson,
        });
        stepToolResponses.push({
          toolCallId: call.id,
          toolName: call.name,
          response: result.ok
            ? { status: 'auto_exec_result', resultJson: result.resultJson }
            : {
                status: 'failed',
                actionId: `read-${call.id}`,
                errorEnvelope: {
                  code: result.error?.code ?? 'PRECONDITION_FAILED',
                  message: result.error?.message ?? 'Read failed',
                },
              },
        });
        continue;
      }

      if (risk === 'additive') {
        // attachSnapshot=false guard (N16)
        if (input.boardSnapshot === null) {
          await blockMutating(deps, input, call, now, 'no_snapshot_attached');
          stepToolResponses.push(makeSyntheticReject(call, 'no_snapshot_attached'));
          continue;
        }
        if (!detectMutationIntent(input.userMessage)) {
          await blockMutating(deps, input, call, now, 'no_mutation_intent_in_user_turn');
          stepToolResponses.push(
            makeSyntheticReject(call, 'no_mutation_intent_in_user_turn'),
          );
          continue;
        }
        const budget = checkProposalBudget(
          proposedThisTurn.count,
          DEFAULT_PROPOSAL_BUDGET_PER_TURN,
        );
        if (!budget.allowMutating) {
          await blockMutating(deps, input, call, now, budget.reason ?? 'budget_exceeded');
          stepToolResponses.push(makeSyntheticReject(call, budget.reason ?? 'budget_exceeded'));
          continue;
        }
        // Build ProposedAction
        const ctx: ToolHandlerCtx = {
          projectState: deps.loadProject() as unknown as ToolHandlerCtx['projectState'],
          now,
        };
        const desc = deps.skill.describeProposal(call.name, call.args, ctx);
        const project = deps.loadProject();
        const baseHash = computeTargetEntityHash(project, desc.targetIds);

        const action: ProposedAction = {
          id: uuidv4(),
          toolName: call.name,
          args: call.args,
          toolCallId: call.id,
          targetIds: desc.targetIds,
          subjectLabel: desc.subjectLabel,
          humanSummary: desc.humanSummary,
          rationale: reply.content ?? '',
          status: 'pending',
          baseHash,
          baseProjectVersion: project.updatedAt,
          createdAt: now(),
          finalizedAt: null,
          rejectReason: null,
          forceApply: false,
          errorEnvelope: null,
        };

        await deps.pendingStore.propose(input.sessionId, action);
        newPending.push(action);
        proposedThisTurn.count += 1;
        mutatingProposedThisStep = true;

        await deps.auditLog.append({
          schemaVersion: 1,
          toolVersion: deps.toolVersion,
          eventType: 'propose',
          timestamp: now(),
          sessionId: input.sessionId,
          messageId: null,
          actionId: action.id,
          toolName: call.name,
          args: call.args,
          status: 'pending',
          baseHash,
          baseProjectVersion: project.updatedAt,
          forceApply: null,
          errorEnvelope: null,
          resultJson: null,
        });
        continue;
      }

      // mutate / destructive / unset — always reject (Spec B does not expose)
      await blockMutating(deps, input, call, now, 'not_in_mvp_scope');
      stepToolResponses.push(makeSyntheticReject(call, 'not_in_mvp_scope'));
    }

    toolResponses = stepToolResponses;

    if (mutatingProposedThisStep) {
      // D17(c): interrupt loop immediately after first mutating proposal.
      break;
    }
  }

  const assistantMessage: CoachMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: lastContent,
    metadata: {
      model: lastModelUsed,
      tokenUsage: lastTokenUsage,
      proposedActions: newPending.length > 0 ? [...newPending] : undefined,
    },
    createdAt: now(),
  };

  return { assistantMessage, newPendingActions: newPending };
}

async function blockMutating(
  deps: OrchestratorDeps,
  input: AgentTurnInput,
  call: FunctionCallRequest,
  now: () => string,
  reason: string,
): Promise<void> {
  await deps.auditLog.append({
    schemaVersion: 1,
    toolVersion: deps.toolVersion,
    eventType: 'intent_gate_blocked',
    timestamp: now(),
    sessionId: input.sessionId,
    messageId: null,
    actionId: null,
    toolName: call.name,
    args: call.args,
    status: 'gate_blocked',
    baseHash: '',
    baseProjectVersion: deps.loadProject().updatedAt,
    forceApply: null,
    errorEnvelope: { code: 'INTENT_GATE_BLOCKED', message: reason },
    resultJson: null,
  });
}

function makeSyntheticReject(call: FunctionCallRequest, reason: string): ToolResponseMessage {
  const envelope: ToolResponseEnvelope = {
    status: 'rejected',
    actionId: `rejected-${call.id}`,
    reason,
  };
  return {
    toolCallId: call.id,
    toolName: call.name,
    response: envelope,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
