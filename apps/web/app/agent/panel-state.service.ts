import { loadPanelState, savePanelState } from '@/lib/api';
import {
  hasMeaningfulPanelState,
  clearAllPanelStateBackups,
  sanitizePanelSnapshotForSave,
} from '@/lib/panel-state.helpers';
import type { BankProduct, TransactionTaxonomyOverride } from './transactions/types';
import type { BudgetRow } from '@/lib/budget-rows.helpers';
import { buildPanelSnapshotPayload, restorePanelStateFromPayload } from './page.flow';

type PanelSnapshot = ReturnType<typeof buildPanelSnapshotPayload>;

type PanelHydrateParams = {
  panelStateBackupKey: string;
  budgetRows: BudgetRow[];
  budgetChatAnswers: Array<{ q: string; a: string }>;
  savedReports: Array<{ id: string; title: string; fileUrl: string; previewImageUrl?: string; group?: string; createdAt?: string }>;
  txProductsCreatedTotal: number;
  bankSimulation: {
    products: BankProduct[];
    taxonomyOverrides: TransactionTaxonomyOverride[];
    activeProductId: string | null;
    lockedMonth: string | null;
    connected: boolean;
    randomMode: boolean;
    uploadedFiles: string[];
    parsedDocuments: BankProduct['parsedDocuments'];
  };
};

export async function hydratePanelState(params: PanelHydrateParams) {
  const applyCandidate = (candidate: unknown) =>
    restorePanelStateFromPayload(candidate, {
      budgetRows: params.budgetRows,
      budgetChatAnswers: params.budgetChatAnswers,
      savedReports: params.savedReports,
      txProductsCreatedTotal: params.txProductsCreatedTotal,
      bankSimulation: params.bankSimulation,
    });

  try {
    const remote = await loadPanelState();
    const remoteState = remote?.panelState;
    if (hasMeaningfulPanelState(remoteState)) {
      const restored = applyCandidate(remoteState);
      if (restored) return { restored, source: 'remote' as const };
    }
  } catch {
    // fallback below
  }

  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(params.panelStateBackupKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!hasMeaningfulPanelState(parsed)) return null;
    const restored = applyCandidate(parsed);
    if (restored) return { restored, source: 'backup' as const };
  } catch {
    // fallback to defaults
  }

  return null;
}

export async function persistPanelState(params: {
  panelStateBackupKey: string;
  snapshot: PanelSnapshot;
}) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(params.panelStateBackupKey, JSON.stringify(params.snapshot));
    } catch {
      // local backup is best-effort
    }
  }
  try {
    await savePanelState(sanitizePanelSnapshotForSave(params.snapshot as Record<string, unknown>));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export function clearPanelStateBackups(): void {
  clearAllPanelStateBackups();
}
