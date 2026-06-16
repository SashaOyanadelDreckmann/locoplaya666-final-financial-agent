import type { StoredPanelState } from '../persistencia/types';
import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import {
  readSessionIntakeEnvelope,
  type SessionIntakeEnvelope,
} from '@financial-agent/shared';
import { loadUserPanelState } from '../services/user.service';
import { resolveUserDiagnosticProfile } from '../services/diagnostic-profile.service';
import { getLifecycleFromMemory } from '../services/product-lifecycle.service';
import { getSocialReflectionsFromMemory } from '../services/social-consciousness-reflections.service';
import { loadUserMemoryBlob } from '../services/user.service';

export type ContextSourceBundle = {
  userId: string;
  intakeEnvelope: SessionIntakeEnvelope;
  panelState: StoredPanelState | null;
  diagnosticProfile: FinancialDiagnosticProfile | null;
  memoryBlob: Record<string, unknown>;
  lifecycle: ReturnType<typeof getLifecycleFromMemory>;
  socialReflections: ReturnType<typeof getSocialReflectionsFromMemory>;
  loadedAt: string;
};

export async function loadContextSourceBundle(user: {
  id: string;
  injectedIntake?: unknown;
  injectedProfile?: unknown;
  latestDiagnosticProfileId?: string | null;
  memoryBlob?: unknown;
  panelState?: unknown;
}): Promise<ContextSourceBundle> {
  const intakeEnvelope = readSessionIntakeEnvelope(user.injectedIntake);
  const panelState =
    (user.panelState as StoredPanelState | null | undefined) ??
    (await loadUserPanelState(user.id));
  const memoryBlob =
    (user.memoryBlob && typeof user.memoryBlob === 'object'
      ? (user.memoryBlob as Record<string, unknown>)
      : null) ?? (await loadUserMemoryBlob(user.id)) ?? {};
  const diagnosticProfile = await resolveUserDiagnosticProfile(user);
  const lifecycle = getLifecycleFromMemory(memoryBlob);
  const socialReflections = getSocialReflectionsFromMemory(memoryBlob);

  return {
    userId: user.id,
    intakeEnvelope,
    panelState,
    diagnosticProfile,
    memoryBlob,
    lifecycle,
    socialReflections,
    loadedAt: new Date().toISOString(),
  };
}

export function readBudgetContext(bundle: ContextSourceBundle): Record<string, unknown> {
  const fromIntake =
    bundle.intakeEnvelope.budgetContext && typeof bundle.intakeEnvelope.budgetContext === 'object'
      ? (bundle.intakeEnvelope.budgetContext as Record<string, unknown>)
      : {};
  const panelRows = Array.isArray(bundle.panelState?.budgetRows) ? bundle.panelState.budgetRows : [];
  if (panelRows.length === 0) return fromIntake;
  return {
    ...fromIntake,
    rows: panelRows,
    rowsCount: panelRows.filter((row) => Number(row.amount ?? 0) > 0).length,
  };
}

export function readProductsContext(bundle: ContextSourceBundle): Record<string, unknown> {
  return bundle.intakeEnvelope.productsContext && typeof bundle.intakeEnvelope.productsContext === 'object'
    ? (bundle.intakeEnvelope.productsContext as Record<string, unknown>)
    : {};
}

export function readIntakeQuestionnaire(bundle: ContextSourceBundle): Record<string, unknown> {
  return bundle.intakeEnvelope.intake && typeof bundle.intakeEnvelope.intake === 'object'
    ? (bundle.intakeEnvelope.intake as Record<string, unknown>)
    : {};
}
