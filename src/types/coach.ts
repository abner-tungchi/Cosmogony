/**
 * Coach 共用型別的單一定義來源（避免跨檔重複定義 / 自引）。
 * mcp-server/src/coach/types.ts 為後端鏡像，需與本檔保持同步。
 */

export interface CoachMessage {
  id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    model?: string;
    boardSnapshotHash?: string;
    activeBoardId?: string;
    attachedSnapshot?: boolean;
    proposedActions?: ProposedAction[];
    driftSignals?: DriftSignal[];
    tokenUsage?: { input: number; output: number };
    aborted?: boolean;
  };
  createdAt: string;
}

export interface DriftSignal {
  kind:
    | 'high_dto_ratio'
    | 'aggregate_no_invariants'
    | 'crud_event_naming'
    | 'policy_missing_trigger'
    | 'oop_terminology'
    | 'high_readmodel_ratio';
  detail: string;
}

export interface ErrorEnvelope {
  code:
    | 'NOT_FOUND'
    | 'INVALID_TYPE'
    | 'PRECONDITION_FAILED'
    | 'GEMINI_INVALID_ARGS'
    | 'TOOL_THREW'
    | 'STALE'
    | 'INTENT_GATE_BLOCKED';
  message: string;
  detail?: Record<string, unknown>;
}

export type ToolResponseEnvelope =
  | { status: 'pending'; uiContext: 'Requires user click Apply'; actionId: string }
  | { status: 'confirmed'; actionId: string; resultJson: unknown }
  | { status: 'rejected'; actionId: string; reason: string | null }
  | { status: 'stale'; actionId: string; reason: 'TargetEntityHash mismatch' }
  | { status: 'failed'; actionId: string; errorEnvelope: ErrorEnvelope }
  | { status: 'auto_exec_result'; resultJson: unknown };

export type ProposedActionStatus =
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'rejected'
  | 'stale'
  | 'failed';

export interface ProposedAction {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Gemini functionCall.id pairing — synthetic 來源用 'synthetic-${actionId}' namespace. */
  toolCallId: string;
  /** 此 action 觸碰的既有 note/remodel id（純新增 tool 為空 array）。 */
  targetIds: string[];
  /** 給 sticky tray 顯示，例：「OrderPlaced (DomainEvent)」 */
  subjectLabel: string;
  /** 自然語言摘要，例：「在 board-A 加 DomainEvent 'OrderPlaced'」 */
  humanSummary: string;
  /** LLM 提此 action 的理由；best-effort 或空字串。 */
  rationale: string;
  status: ProposedActionStatus;
  /** propose 時 ctx.projectState 的 TargetEntityHash（targetIds 為空時 = ''）。 */
  baseHash: string;
  /** propose 時 projectState.updatedAt — 粗粒度 fingerprint，輔助 debug。 */
  baseProjectVersion: string;
  createdAt: string;
  /** 走完 lifecycle 後的 timestamp。 */
  finalizedAt: string | null;
  /** Reject 時 user 填的選填 reason；可為空字串。 */
  rejectReason: string | null;
  /** Stale 後 user force-apply 時記錄；server 仍會做 reverify。 */
  forceApply: boolean;
  errorEnvelope: ErrorEnvelope | null;
}
