const PANEL_INTRO_COMPLETED_KEY = 'agent.panel-intro.completed.v1';

export function markPanelIntroCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PANEL_INTRO_COMPLETED_KEY, String(Date.now()));
  } catch {}
}

export function hasCompletedPanelIntro(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PANEL_INTRO_COMPLETED_KEY) != null;
  } catch {
    return false;
  }
}
