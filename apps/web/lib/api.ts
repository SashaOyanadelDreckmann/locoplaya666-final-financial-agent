import { getApiBaseUrl, getDocumentParseRequestUrl, getSessionApiBaseUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';
import { getCsrfToken } from './csrf';

function withCsrf(headers: Record<string, string> = {}): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers, 'X-CSRF-Token': token };
}

export async function nextConversationStep(payload: unknown) {
  const API_URL = getSessionApiBaseUrl();
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
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{
    user?: { id?: string; name?: string; email?: string; role?: string };
    approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
    requiresApproval?: boolean;
  }>(res);
}

export async function loginUser(payload: { email: string; password: string }) {
  const API_URL = getSessionApiBaseUrl();
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
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ loggedOut: boolean }>(res);
}

export async function deleteAccount() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/account`, {
    method: 'DELETE',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ deleted: boolean }>(res);
}

export async function forgotPassword(payload: { email: string }) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ sent: boolean }>(res);
}

export async function resetPassword(payload: { token: string; password: string }) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ reset: boolean }>(res);
}

export async function injectProfileToAgent(profile: unknown) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/inject-profile`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ profile }),
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function injectIntakeToAgent(payload: { intake: unknown; llmSummary?: unknown }) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/inject-intake`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function removeInjectedIntake() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/remove-injected-intake`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function getSessionInfo() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/session`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function parseDocuments(
  files: Array<{ name: string; base64: string }>,
  hints?: {
    institutionHint?: string;
    serviceHint?: string;
    productTypeHint?: string;
    productLabelHint?: string;
    fastParse?: boolean;
  }
) {
  const res = await fetch(getDocumentParseRequestUrl(), {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ files, ...(hints ?? {}) }),
  });

  return parseApiResponse<any>(res);
}

export async function resolveDocuments(documentIds: string[]) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/documents/resolve`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ documentIds }),
  });

  return parseApiResponse<any>(res);
}

export async function loadSheets() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/sheets`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function saveSheets(sheets: unknown[]) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/sheets`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ sheets }),
  });

  return parseApiResponse<any>(res);
}

export async function loadPanelState() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/panel-state`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<any>(res);
}

export async function savePanelState(panelState: Record<string, unknown>) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/panel-state`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ panelState }),
  });

  return parseApiResponse<any>(res);
}

function extractArtifactFilename(fileUrl: string) {
  const apiUrl = getApiBaseUrl();
  const url = new URL(fileUrl, apiUrl);
  return url.searchParams.get('file') ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
}

export async function deletePdfArtifact(payload: { fileUrl: string; previewImageUrl?: string }) {
  const file = extractArtifactFilename(payload.fileUrl);
  const previewFile = payload.previewImageUrl ? extractArtifactFilename(payload.previewImageUrl) : '';
  const searchParams = new URLSearchParams({ file });
  if (previewFile) searchParams.set('previewFile', previewFile);
  const res = await fetch(`/api/pdfs/delete?${searchParams.toString()}`, {
    method: 'DELETE',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ deleted: boolean }>(res);
}

export async function getWelcomeMessage() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/welcome`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<{ message: string }>(res);
}

export async function removeInjectedProfile() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/remove-injected-profile`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });

  return parseApiResponse<{ updated: boolean }>(res);
}

export async function getInterviewRealtimeToken() {
  const API_URL = getSessionApiBaseUrl();
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
    interview_voice?: Record<string, unknown>;
  }>(res);
}

export async function abortInterviewRealtimeToken() {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/interview/realtime/abort`, {
    method: 'POST',
    headers: withCsrf(),
    credentials: 'include',
  });
  return parseApiResponse<{ rolled_back: boolean }>(res);
}

export async function saveInterviewVoiceState(payload: Record<string, unknown>) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/conversation/voice/state`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ saved: boolean; interview_voice?: Record<string, unknown> }>(res);
}

export async function finalizeInterviewVoiceCall(payload: {
  intake: unknown;
  minuteSummaries?: Array<{
    minute?: number;
    summary: string;
    keyFindings?: string[];
    confidence?: 'high' | 'medium' | 'low';
    createdAt?: string;
  }>;
  finalSummary?: {
    summary: string;
    keyFindings?: string[];
    confidence?: 'high' | 'medium' | 'low';
    createdAt?: string;
  };
  transcript?: string;
  endedBy: 'timeout' | 'agent';
  durationSec?: number;
  callId?: string;
}) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/conversation/voice/finalize`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<any>(res);
}

export async function mergeProductsContextToIntake(payload: {
  productsContext: {
    scope?: string;
    productsCount: number;
    uploadedFiles?: string[];
    activeProductId?: string | null;
    activeProductLabel?: string;
    activeProduct?: Record<string, unknown>;
    productsIndex?: Array<Record<string, unknown>>;
    transactionSummary?: Record<string, unknown>;
    products?: Array<{
      id?: string;
      label: string;
      bank: string;
      productType: string;
      dashboardSummary?: string;
      period?: { from?: string; to?: string };
      keyMetrics?: {
        inflows_total?: number;
        outflows_total?: number;
        net_flow?: number;
        movement_count?: number;
      };
      topIncome?: Array<{ label: string; amount: number; date?: string }>;
      topExpenses?: Array<{ label: string; amount: number; date?: string }>;
      topCategories?: Array<{ name: string; amount: number }>;
      alerts?: string[];
      movements?: Array<Record<string, unknown>>;
    }>;
  };
  budgetContext?: {
    income?: number;
    expenses?: number;
    balance?: number;
    rowsCount?: number;
    rows?: Array<{
      id: string;
      category: string;
      type: 'income' | 'expense';
      amount: number;
      note?: string;
      detail?: string;
      cadence?: 'fixed' | 'variable' | 'oneoff';
      paymentMethod?: 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
      movementType?:
        | 'income_main'
        | 'income_extra'
        | 'housing'
        | 'home_services'
        | 'food'
        | 'transport'
        | 'health'
        | 'education'
        | 'debt'
        | 'savings_investment'
        | 'taxes_fees'
        | 'leisure_other';
      product?: string;
      institution?: string;
    }>;
  };
}) {
  const API_URL = getSessionApiBaseUrl();
  const res = await fetch(`${API_URL}/api/merge-products-context`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ updated: boolean }>(res);
}
