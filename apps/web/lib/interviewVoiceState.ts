export const INTERVIEW_UI_STATE_KEY = 'financial-agent-interview-voice-state.v1';

export function readInterviewVoiceState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.sessionStorage.getItem(INTERVIEW_UI_STATE_KEY) ??
      window.localStorage.getItem(INTERVIEW_UI_STATE_KEY);
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
    window.localStorage.setItem(INTERVIEW_UI_STATE_KEY, raw);
  } catch {}
}

export function clearInterviewVoiceState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(INTERVIEW_UI_STATE_KEY);
    window.localStorage.removeItem(INTERVIEW_UI_STATE_KEY);
  } catch {}
}
