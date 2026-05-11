/**
 * Adapter messages 只接受 user/assistant/tool — caller 必須過濾 'system' role。
 * 這層抽象讓未來換 model（Claude / 其他）時下游不動。
 */
export interface LLMAdapterMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Gemini SDK FunctionDeclaration shape — produced by EventStormingSkill.buildDeclarations(). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: object; // JSON Schema (OpenAPI subset)
}

/** Gemini's tool config (AUTO / ANY / NONE). Spec B 預設 AUTO。 */
export interface ToolConfig {
  mode: 'AUTO' | 'ANY' | 'NONE';
  /** When mode='ANY', the allowed function name(s). */
  allowedFunctionNames?: string[];
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

export interface ToolResponseMessage {
  /**
   * 對應 LLM 上一輪的 functionCall.id；synthetic 來源用
   * 'pending-${actionId}' / 'rejected-${actionId}' 等 namespace（N8）。
   */
  toolCallId: string;
  toolName: string;
  /**
   * 強型別 schema (N9)。status='pending' 是 server 故意給 LLM 的「等使用者確認」訊號,
   * 不是 error。
   */
  response: ToolResponseEnvelope;
}

export interface FunctionCallRequest {
  /** Gemini SDK 提供的原生 functionCall id（用於配對 functionResponse）。 */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LLMReply {
  content: string;
  modelUsed: string;
  tokenUsage: { input: number; output: number };
  /** LLM 此輪要求呼叫的 tools（read 自動執行；additive 進 pending）。 */
  functionCalls?: FunctionCallRequest[];
  /** false = LLM 仍想繼續（auto-exec read 後再 chat）；true = 終止 loop。 */
  isFinished: boolean;
}

export interface LLMAdapter {
  readonly modelName: string;
  readonly availableModels: readonly string[];
  chat(opts: {
    systemPrompt: string;
    messages: LLMAdapterMessage[];
    signal?: AbortSignal;
    model?: string;
    /** EventStormingSkill.buildDeclarations() 產出。 */
    tools?: ToolDeclaration[];
    /** Gemini AUTO mode；caller 預設 AUTO。 */
    toolConfig?: ToolConfig;
    /**
     * Pending action 上一輪的結果。orchestrator 在 user 下次發訊息前注入 functionResponse
     * messages，對應每個已 confirmed/rejected/failed/stale 的 actionId。
     * 注入用 'tool' role / functionResponse 形式（D2 + D17(a)）。
     */
    toolResponses?: ToolResponseMessage[];
  }): Promise<LLMReply>;
}
