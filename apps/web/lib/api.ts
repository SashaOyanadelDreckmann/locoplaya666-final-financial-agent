import { getApiBaseUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';
import { getCsrfToken } from './csrf';

function withCsrf(headers: Record<string, string> = {}): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers, 'X-CSRF-Token': token };
}

export async function nextConversationStep(payload: unknown) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/conversation/next`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<any>(res);
}

export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
}) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{
    user?: { id?: string; name?: string; email?: string; role?: string };
  }>(res);
}

export async function loginUser(payload: { email: string; password: string }) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{
    user?: { id?: string; name?: string; email?: string; role?: string };
  }>(res);
}

export async function logoutUser() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ loggedOut: boolean }>(res);
}

export async function injectProfileToAgent(profile: unknown) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/inject-profile`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ profile }),
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function injectIntakeToAgent(payload: { intake: unknown; llmSummary?: unknown }) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/inject-intake`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function removeInjectedIntake() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/remove-injected-intake`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function getSessionInfo() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/session`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function parseDocuments(files: Array<{ name: string; base64: string }>) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/documents/parse`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ files }),
  });

  return parseApiResponse<any>(res);
}

export async function loadSheets() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/sheets`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function saveSheets(sheets: unknown[]) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/sheets`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ sheets }),
  });

  return parseApiResponse<any>(res);
}

export async function loadPanelState() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/panel-state`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function savePanelState(panelState: Record<string, unknown>) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/panel-state`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ panelState }),
  });

  return parseApiResponse<any>(res);
}

export async function getWelcomeMessage() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/welcome`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<{ message: string }>(res);
}

export async function removeInjectedProfile() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/remove-injected-profile`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function getInterviewRealtimeToken() {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/interview/realtime/token`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<{
    value: string;
    expires_at?: number;
    session_id?: string;
    call_id?: string;
    calls_used?: number;
    calls_left?: number;
    max_duration_sec?: number;
    total_used_sec?: number;
    remaining_total_sec?: number;
    pause_limit?: number;
  }>(res);
}

export async function finalizeInterviewVoiceCall(payload: {
  intake: unknown;
  transcript: string;
  endedBy: 'timeout' | 'agent' | 'user';
  durationSec?: number;
  callId?: string;
}) {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/conversation/voice/finalize`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<any>(res);
}
