export const PANEL_STATE_BACKUP_KEY_PREFIX = 'agent.panel.backup.v1';

export function normalizeBackupUserKey(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return 'guest';
  return raw.replace(/[^a-z0-9@._-]/g, '_').slice(0, 120) || 'guest';
}

export function panelStateBackupKeyForUser(input: unknown): string {
  return `${PANEL_STATE_BACKUP_KEY_PREFIX}:${normalizeBackupUserKey(input)}`;
}

export function clearAllPanelStateBackups(): void {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key === PANEL_STATE_BACKUP_KEY_PREFIX || key.startsWith(`${PANEL_STATE_BACKUP_KEY_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    /* localStorage may be unavailable */
  }
}

export function hasMeaningfulPanelState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const budgetRows = Array.isArray(record.budgetRows) ? record.budgetRows : [];
  const savedReports = Array.isArray(record.savedReports) ? record.savedReports : [];
  const bankSimulation =
    record.bankSimulation && typeof record.bankSimulation === 'object'
      ? (record.bankSimulation as Record<string, unknown>)
      : null;
  const products = Array.isArray(bankSimulation?.products) ? bankSimulation.products : [];
  return budgetRows.length > 0 || savedReports.length > 0 || products.length > 0;
}
