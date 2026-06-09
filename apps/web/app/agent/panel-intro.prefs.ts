const PANEL_INTRO_COMPLETED_KEY = 'agent.panel-intro.completed.v1';
const PANEL_INTRO_PENDING_KEY = 'agent.panel-intro.pending.v1';

export function markPanelIntroCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PANEL_INTRO_COMPLETED_KEY, String(Date.now()));
    sessionStorage.removeItem(PANEL_INTRO_PENDING_KEY);
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

export function clearPanelIntroCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PANEL_INTRO_COMPLETED_KEY);
  } catch {}
}

/** Set when intake finishes — guarantees intro on next /agent visit this session. */
export function markPanelIntroPendingFromIntake(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PANEL_INTRO_PENDING_KEY, '1');
    localStorage.removeItem(PANEL_INTRO_COMPLETED_KEY);
  } catch {}
}

export function hasPendingPanelIntroFromIntake(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PANEL_INTRO_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPendingPanelIntroFromIntake(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PANEL_INTRO_PENDING_KEY);
  } catch {}
}

export function shouldPresentPanelIntro(): boolean {
  if (hasPendingPanelIntroFromIntake()) return true;
  return !hasCompletedPanelIntro();
}
