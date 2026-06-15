import { getSessionApiBaseUrl } from '@/lib/api/base';
import { getCsrfToken } from '@/lib/sesion/csrf';

type KeepaliveJsonRequest = {
  path: string;
  method: 'POST' | 'PUT';
  body: Record<string, unknown>;
};

function buildKeepaliveHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getCsrfToken();
  if (token) headers['X-CSRF-Token'] = token;
  return headers;
}

/**
 * Best-effort persistence when the tab is closing or navigating away.
 * Uses fetch keepalive so the browser may complete the request after unload.
 */
export function postJsonKeepalive(request: KeepaliveJsonRequest): void {
  if (typeof window === 'undefined') return;

  try {
    const API_URL = getSessionApiBaseUrl();
    void fetch(`${API_URL}${request.path}`, {
      method: request.method,
      headers: buildKeepaliveHeaders(),
      credentials: 'include',
      body: JSON.stringify(request.body),
      keepalive: true,
    });
  } catch {
    // ignore unload races
  }
}

export function flushSheetsKeepalive(sheets: Record<string, unknown>[]): void {
  postJsonKeepalive({
    path: '/api/sheets',
    method: 'POST',
    body: { sheets },
  });
}

export function flushPanelStateKeepalive(panelState: Record<string, unknown>): void {
  postJsonKeepalive({
    path: '/api/panel-state',
    method: 'POST',
    body: { panelState },
  });
}

export function flushSocialReflectionsKeepalive(session: Record<string, unknown>): void {
  postJsonKeepalive({
    path: '/api/agent/social-reflections',
    method: 'PUT',
    body: session,
  });
}

export type AgentPersistenceFlushPayload = {
  sheets?: Record<string, unknown>[] | null;
  panelState?: Record<string, unknown> | null;
  socialReflections?: Record<string, unknown> | null;
};

export function flushAgentPersistenceKeepalive(payload: AgentPersistenceFlushPayload): void {
  if (payload.sheets && payload.sheets.length > 0) {
    flushSheetsKeepalive(payload.sheets);
  }
  if (payload.panelState && Object.keys(payload.panelState).length > 0) {
    flushPanelStateKeepalive(payload.panelState);
  }
  if (payload.socialReflections && Object.keys(payload.socialReflections).length > 0) {
    flushSocialReflectionsKeepalive(payload.socialReflections);
  }
}

export function bindAgentPersistenceFlush(params: {
  getPayload: () => AgentPersistenceFlushPayload;
}): () => void {
  if (typeof window === 'undefined') return () => {};

  const flush = () => {
    flushAgentPersistenceKeepalive(params.getPayload());
  };

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
