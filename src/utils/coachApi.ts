import type { CoachMessage, ProposedAction, ErrorEnvelope } from '../types/coach';
import type { BoardSnapshot } from './coachSnapshot';
import { getCoachUserId } from './coachUser';

export interface PostMessageRequest {
  sessionId: string | null;
  clientMessageId: string;
  text: string;
  attachSnapshot: boolean;
  boardSnapshot: BoardSnapshot | null;
  model?: string;
}

export interface ModelsInfo {
  defaultModel: string;
  availableModels: string[];
}

export interface PostMessageResponse {
  sessionId: string;
  userMessage: CoachMessage;
  assistantMessage: CoachMessage;
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstUserMessagePreview?: string;
}

export class CoachApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CoachApiError';
    this.status = status;
  }
}

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Coach-User-Id': getCoachUserId(),
  };
}

async function parseError(res: Response): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = (body as { error?: string }).error ?? '';
  } catch {
    detail = await res.text().catch(() => '');
  }
  throw new CoachApiError(detail || `HTTP ${res.status}`, res.status);
}

export async function postMessage(req: PostMessageRequest, signal?: AbortSignal): Promise<PostMessageResponse> {
  const res = await fetch('/api/coach/message', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch('/api/coach/sessions', { headers: headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getSession(sessionId: string): Promise<{ id: string; messages: CoachMessage[] }> {
  const res = await fetch(`/api/coach/sessions/${encodeURIComponent(sessionId)}`, { headers: headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function clearSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/coach/sessions/${encodeURIComponent(sessionId)}/clear`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) await parseError(res);
}

export async function getModels(): Promise<ModelsInfo> {
  const res = await fetch('/api/coach/models', { headers: headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export interface ConfirmActionResponse {
  status: 'confirmed' | 'stale' | 'failed';
  finalAction: ProposedAction;
  errorEnvelope?: ErrorEnvelope;
}

export interface ConfirmBatchResponse {
  results: Array<{
    actionId: string;
    status: 'confirmed' | 'stale' | 'failed';
    errorEnvelope?: ErrorEnvelope;
  }>;
  stoppedAt?: string;
}

export async function confirmAction(
  actionId: string,
  sessionId: string,
  forceApply: boolean,
): Promise<ConfirmActionResponse> {
  const res = await fetch(`/api/coach/actions/${encodeURIComponent(actionId)}/confirm`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ sessionId, forceApply }),
  });
  // 409 stale is a valid business status; surface body without throwing.
  if (res.status === 409) {
    return (await res.json()) as ConfirmActionResponse;
  }
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function rejectAction(
  actionId: string,
  sessionId: string,
  reason: string | null,
): Promise<{ ok: true }> {
  const res = await fetch(`/api/coach/actions/${encodeURIComponent(actionId)}/reject`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ sessionId, reason }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function confirmBatchActions(
  sessionId: string,
  actionIds: string[],
): Promise<ConfirmBatchResponse> {
  const res = await fetch('/api/coach/actions/confirm-batch', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ sessionId, actionIds }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listPendingActions(sessionId: string): Promise<ProposedAction[]> {
  const res = await fetch(
    `/api/coach/sessions/${encodeURIComponent(sessionId)}/pending`,
    { headers: headers() },
  );
  if (!res.ok) await parseError(res);
  return res.json();
}
