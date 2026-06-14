import { getSessionApiBaseUrl } from '../api/base';
import { getCsrfToken } from './csrf';

export const INTERVIEW_UI_STATE_KEY = 'financial-agent-interview-voice-state.v1';

export function readInterviewVoiceState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(INTERVIEW_UI_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeInterviewVoiceState(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(payload);
    window.sessionStorage.setItem(INTERVIEW_UI_STATE_KEY, raw);
  } catch {}
}

/**
 * Best-effort persistence when the tab is closing or navigating away.
 * sessionStorage is written synchronously; server sync uses fetch keepalive.
 */
export function flushInterviewVoiceStateOnPageHide(payload: Record<string, unknown>): void {
  writeInterviewVoiceState(payload);
  if (typeof window === 'undefined') return;

  try {
    const API_URL = getSessionApiBaseUrl();
    const token = getCsrfToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-CSRF-Token'] = token;

    void fetch(`${API_URL}/conversation/voice/state`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {}
}

export function clearInterviewVoiceState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(INTERVIEW_UI_STATE_KEY);
  } catch {}
}
