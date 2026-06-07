import { buildTransactionAuthorizationBlockMessage } from '@/lib/transactions-authorization.helpers';
import type { deriveTransactionAuthorizationState } from '@/lib/transactions-authorization.helpers';
import { MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL } from '../agent-page.constants';
import type { TxWizardStep } from './types';

export type TxWizardStageKey = 'consent' | 'evidence' | 'analyst';

export type TxWizardStage = {
  key: TxWizardStageKey;
  title: string;
  copy: string;
  disabled: boolean;
  disabledReason?: string;
  go: () => void;
};

export type TxFlowStage = 'products' | 'consent' | 'evidence' | 'analyst';

export function deriveActiveTxStageIndex(txWizardStep: TxWizardStep): number {
  if (txWizardStep === 'credentials') return 0;
  if (txWizardStep === 'upload') return 1;
  if (txWizardStep === 'dashboard') return 2;
  return -1;
}

export function deriveCurrentStage(txWizardStep: TxWizardStep): TxFlowStage {
  if (txWizardStep === 'products') return 'products';
  if (txWizardStep === 'upload') return 'evidence';
  if (txWizardStep === 'dashboard') return 'analyst';
  return 'consent';
}

export function buildTxStages(params: {
  consentLocked: boolean;
  hasEvidence: boolean;
  setTxWizardStep: (step: TxWizardStep) => void;
}): TxWizardStage[] {
  const { consentLocked, hasEvidence, setTxWizardStep } = params;
  return [
    {
      key: 'consent',
      title: '1. Autorización',
      copy: 'Conecta institución y autoriza.',
      disabled: consentLocked,
      disabledReason: consentLocked ? 'Este producto ya está autorizado.' : undefined,
      go: () => setTxWizardStep('credentials'),
    },
    {
      key: 'evidence',
      title: '2. Evidencias',
      copy: 'Sube cartolas y respaldos.',
      disabled: !consentLocked,
      disabledReason: !consentLocked ? 'Autoriza el producto para subir evidencias.' : undefined,
      go: () => setTxWizardStep('upload'),
    },
    {
      key: 'analyst',
      title: '3. Resumen',
      copy: 'Revisa la ficha analítica.',
      disabled: !consentLocked || !hasEvidence,
      disabledReason: !consentLocked
        ? 'Autoriza el producto primero.'
        : !hasEvidence
          ? 'Sube y analiza evidencia para desbloquear el resumen.'
          : undefined,
      go: () => hasEvidence && setTxWizardStep('dashboard'),
    },
  ];
}

export function buildTxStageSummary(params: {
  currentStage: TxFlowStage;
  activeProductCreations: number;
  maxProducts: number;
  productsCreatedTotal: number;
}): string {
  const { currentStage, activeProductCreations, maxProducts, productsCreatedTotal } = params;
  if (currentStage === 'products' || currentStage === 'consent') {
    return `Paso 1/3 · ${activeProductCreations}/${maxProducts} activos · ${productsCreatedTotal}/${MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL} creados`;
  }
  if (currentStage === 'evidence') {
    return 'Paso 2 de 3: sube cartolas o respaldos y espera el análisis.';
  }
  return 'Paso 3 de 3: revisa el resumen y continúa con el agente principal.';
}

export function buildTxStageCta(params: {
  currentStage: TxFlowStage;
  analysisAlreadyDone: boolean;
  canContinueAuto: boolean;
  authorizationState: ReturnType<typeof deriveTransactionAuthorizationState>;
}): string {
  const { currentStage, analysisAlreadyDone, canContinueAuto, authorizationState } = params;
  if (currentStage === 'products') return 'Elige un producto o crea uno nuevo para continuar';
  if (currentStage === 'consent') {
    if (canContinueAuto) return 'Autorizar y continuar';
    return buildTransactionAuthorizationBlockMessage(authorizationState);
  }
  if (currentStage === 'evidence') {
    return analysisAlreadyDone ? 'Resumen listo para revisar' : 'Sube evidencia para desbloquear el resumen';
  }
  return analysisAlreadyDone
    ? 'El contexto validado ya se sincroniza solo'
    : 'Guarda o analiza un producto para sincronizar contexto';
}
