export const PANEL_STATE_BACKUP_KEY_PREFIX = 'agent.panel.backup.v1';

const SAVED_REPORT_GROUPS = new Set([
  'plan_action',
  'simulation',
  'budget',
  'diagnosis',
  'other',
]);

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

/** Normalize panel snapshot before API persistence to match backend schema. */
export function sanitizePanelSnapshotForSave(snapshot: Record<string, unknown>): Record<string, unknown> {
  const budgetRows = Array.isArray(snapshot.budgetRows)
    ? snapshot.budgetRows
        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        .map((row, index) => ({
          ...row,
          id: typeof row.id === 'string' && row.id.trim() ? row.id : `budget-row-${index}`,
          category:
            typeof row.category === 'string' && row.category.trim() ? row.category : 'Sin categoría',
          type: row.type === 'expense' ? 'expense' : 'income',
          amount: typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0,
          note: typeof row.note === 'string' ? row.note : '',
        }))
    : [];

  const bankSimulationRaw =
    snapshot.bankSimulation && typeof snapshot.bankSimulation === 'object'
      ? (snapshot.bankSimulation as Record<string, unknown>)
      : {};

  const products = Array.isArray(bankSimulationRaw.products)
    ? bankSimulationRaw.products
        .filter((product): product is Record<string, unknown> => typeof product === 'object' && product !== null)
        .map((product, index) => ({
          ...product,
          id: typeof product.id === 'string' && product.id.trim() ? product.id : `product-${index}`,
          label: typeof product.label === 'string' ? product.label : '',
          bank: typeof product.bank === 'string' ? product.bank : '',
          productType:
            typeof product.productType === 'string' && product.productType.trim()
              ? product.productType
              : 'checking_account',
        }))
    : [];

  const savedReports = Array.isArray(snapshot.savedReports)
    ? snapshot.savedReports
        .filter((report): report is Record<string, unknown> => typeof report === 'object' && report !== null)
        .map((report, index) => {
          const groupRaw = String(report.group ?? 'other');
          const group = SAVED_REPORT_GROUPS.has(groupRaw) ? groupRaw : 'other';
          return {
            ...report,
            id: typeof report.id === 'string' && report.id.trim() ? report.id : `report-${index}`,
            title: typeof report.title === 'string' ? report.title : 'Informe',
            fileUrl: typeof report.fileUrl === 'string' ? report.fileUrl : '',
            createdAt:
              typeof report.createdAt === 'string' && report.createdAt.trim()
                ? report.createdAt
                : new Date().toISOString(),
            group,
          };
        })
    : [];

  return {
    ...snapshot,
    budgetRows,
    bankSimulation: {
      ...bankSimulationRaw,
      products,
    },
    savedReports,
    updatedAt:
      typeof snapshot.updatedAt === 'string' && snapshot.updatedAt.trim()
        ? snapshot.updatedAt
        : new Date().toISOString(),
  };
}
