import { GoogleGenAI } from '@google/genai';
import { nanoid } from 'nanoid';
import type {
  LLMAdapter,
  LLMAdapterMessage,
  LLMReply,
  ToolDeclaration,
  ToolConfig,
  ToolResponseMessage,
  FunctionCallRequest,
} from './adapter.js';

interface GeminiOptions {
  apiKey: string;
  model?: string;
}

/**
 * 可選 model allowlist。前端能呼叫的 model 都必須在這裡，不在的 fallback 用 default。
 * 加新 model 要同步更新 system prompt / 文件中的描述。
 */
const AVAILABLE_GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

const RETRY_DELAYS_MS = [500, 1500, 4000];

function isTransientOverload(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // Google API 常見 transient 訊號：503 / 429 / UNAVAILABLE / RESOURCE_EXHAUSTED
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED)\b/i.test(msg)
    || /high demand|overloaded|try again later/i.test(msg);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Gemini adapter with function-calling support (Spec B Step 2b).
 *
 * Framework notes:
 * - @google/genai (not deprecated @google/generative-ai) — ESM-only, Node ≥ 18
 * - Content.role ∈ { 'user', 'model', 'function' }; 'tool' is NOT a role —
 *   function responses use role='function' with parts containing
 *   { functionResponse: { name, response, id? } }.
 * - 'system' 用 config.systemInstruction（不是 messages 陣列）
 * - Function declarations are passed as config.tools = [{ functionDeclarations: [...] }].
 * - ToolConfig (mode AUTO/ANY/NONE) goes under config.toolConfig.functionCallingConfig.
 * - Response candidates[0].content.parts may contain { functionCall: { name, args, id? } }
 *   parts; older SDK versions may not emit `id` — synthesize via nanoid() fallback.
 * - AbortSignal 透過 promise race + signal listener 接 — SDK 直接傳 signal 在不同版本支援度不一
 */
export class GeminiAdapter implements LLMAdapter {
  readonly modelName: string;
  readonly availableModels = AVAILABLE_GEMINI_MODELS;
  private readonly genai: GoogleGenAI;

  constructor(opts: GeminiOptions) {
    this.modelName = opts.model && (AVAILABLE_GEMINI_MODELS as readonly string[]).includes(opts.model)
      ? opts.model
      : 'gemini-2.5-pro';
    this.genai = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async chat(opts: {
    systemPrompt: string;
    messages: LLMAdapterMessage[];
    signal?: AbortSignal;
    model?: string;
    tools?: ToolDeclaration[];
    toolConfig?: ToolConfig;
    toolResponses?: ToolResponseMessage[];
  }): Promise<LLMReply> {
    // Build conversation contents: prior history first, then prior-turn tool
    // responses (role='function'). Orchestrator passes one user turn per chat()
    // call, so toolResponses appended after history is correct for Spec B.
    const historyContents = opts.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const toolResponseContents = (opts.toolResponses ?? []).map((tr) => ({
      role: 'function' as const,
      parts: [
        {
          functionResponse: {
            name: tr.toolName,
            response: tr.response as unknown as Record<string, unknown>,
            id: tr.toolCallId,
          },
        },
      ],
    }));

    const contents = [...historyContents, ...toolResponseContents];

    // Per-call override — 必須在 allowlist 裡才生效，否則 fallback 到 default
    const modelToUse = opts.model && (AVAILABLE_GEMINI_MODELS as readonly string[]).includes(opts.model)
      ? opts.model
      : this.modelName;

    const config: Record<string, unknown> = {
      systemInstruction: opts.systemPrompt,
    };
    if (opts.tools && opts.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: opts.tools.map((d) => ({
            name: d.name,
            description: d.description,
            parameters: d.parameters,
          })),
        },
      ];
      config.toolConfig = {
        functionCallingConfig: {
          mode: opts.toolConfig?.mode ?? 'AUTO',
          ...(opts.toolConfig?.allowedFunctionNames
            ? { allowedFunctionNames: opts.toolConfig.allowedFunctionNames }
            : {}),
        },
      };
    }

    // Retry-with-backoff on transient overload (503 UNAVAILABLE / 429 RESOURCE_EXHAUSTED).
    // Preview models 特別容易遇到 capacity；穩定 model 也偶有 spike。
    let lastErr: unknown;
    let response: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const callPromise = this.genai.models.generateContent({
          model: modelToUse,
          contents,
          config,
        });

        response = opts.signal
          ? await Promise.race([
              callPromise,
              new Promise<never>((_, reject) => {
                if (opts.signal!.aborted) {
                  reject(new DOMException('aborted', 'AbortError'));
                  return;
                }
                opts.signal!.addEventListener(
                  'abort',
                  () => reject(new DOMException('aborted', 'AbortError')),
                  { once: true },
                );
              }),
            ])
          : await callPromise;
        break; // success
      } catch (err) {
        lastErr = err;
        if (opts.signal?.aborted) throw err;
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (!isTransientOverload(err) || attempt === RETRY_DELAYS_MS.length) throw err;
        const delay = RETRY_DELAYS_MS[attempt];
        process.stderr.write(
          `Gemini transient overload (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}); retrying in ${delay}ms\n`,
        );
        await sleep(delay, opts.signal);
      }
    }
    if (!response) throw lastErr ?? new Error('Gemini chat failed without response');

    const respAny = response as {
      text?: string | (() => string);
      response?: { text?: () => string };
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: {
              name?: string;
              args?: Record<string, unknown>;
              id?: string;
            };
          }>;
        };
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    // Extract text + function calls from candidates[0].content.parts. When tools
    // are enabled, .text alone is unreliable — parts traversal is the canonical
    // path.
    const parts = respAny.candidates?.[0]?.content?.parts ?? [];
    const textChunks: string[] = [];
    const functionCalls: FunctionCallRequest[] = [];
    for (const p of parts) {
      if (typeof p.text === 'string' && p.text.length > 0) {
        textChunks.push(p.text);
      }
      if (p.functionCall && typeof p.functionCall.name === 'string') {
        functionCalls.push({
          id: p.functionCall.id ?? `fc-${nanoid(10)}`,
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
        });
      }
    }

    // Fallback to .text when no parts (legacy SDK / non-tool calls).
    let text = textChunks.join('');
    if (!text) {
      if (typeof respAny.text === 'string') {
        text = respAny.text;
      } else if (typeof respAny.text === 'function') {
        try {
          text = (respAny.text as () => string)();
        } catch {
          text = '';
        }
      } else if (respAny.response && typeof respAny.response.text === 'function') {
        try {
          text = respAny.response.text();
        } catch {
          text = '';
        }
      }
    }

    return {
      content: text,
      modelUsed: modelToUse,
      tokenUsage: {
        input: respAny.usageMetadata?.promptTokenCount ?? 0,
        output: respAny.usageMetadata?.candidatesTokenCount ?? 0,
      },
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      // When there are pending function calls the loop must continue (auto-exec
      // read or propose additive); only terminate when LLM is done with text.
      isFinished: functionCalls.length === 0,
    };
  }
}
