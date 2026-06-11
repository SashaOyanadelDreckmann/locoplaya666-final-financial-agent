export type OnboardingFlowStatus = {
  productsCompleted: boolean;
  transactionsCompleted: boolean;
  budgetUnlocked: boolean;
  budgetCompleted: boolean;
  budgetRowsCompleted: number;
  interviewUnlocked: boolean;
  diagnosisCompleted: boolean;
};

export const BUDGET_ROWS_TARGET = 3;

export type OnboardingFlowCtaModel = {
  section: 'transactions' | 'products_transactions' | 'budget' | 'interview';
  headline: string;
  body: string;
  buttonLabel: string;
  progressLabel?: string;
  progressRatio?: number;
  steps: Array<{ id: string; label: string; done: boolean; current: boolean }>;
};

function buildSteps(status: OnboardingFlowStatus) {
  return [
    {
      id: 'evidence',
      label: 'Cartolas',
      done: status.transactionsCompleted,
      current: !status.transactionsCompleted,
    },
    {
      id: 'budget',
      label: 'Presupuesto',
      done: status.budgetCompleted,
      current: status.transactionsCompleted && !status.budgetCompleted,
    },
    {
      id: 'interview',
      label: 'Entrevista',
      done: status.diagnosisCompleted,
      current: status.budgetCompleted && !status.diagnosisCompleted,
    },
  ];
}

export function buildOnboardingFlowCta(
  status: OnboardingFlowStatus,
  userName?: string | null,
): OnboardingFlowCtaModel | null {
  if (status.diagnosisCompleted) return null;

  const firstName = String(userName ?? '').trim().split(/\s+/)[0] || 'tú';
  const steps = buildSteps(status);
  const rowsRemaining = Math.max(0, BUDGET_ROWS_TARGET - status.budgetRowsCompleted);

  if (!status.transactionsCompleted) {
    return {
      section: 'transactions',
      headline: `${firstName}, el siguiente paso es tu evidencia`,
      body: 'Sube una cartola o movimiento del mes. Con eso abrimos presupuesto y tu lectura personalizada.',
      buttonLabel: 'Agregar cartolas',
      steps,
    };
  }

  if (!status.budgetCompleted) {
    return {
      section: 'budget',
      headline:
        rowsRemaining > 0
          ? `Te faltan ${rowsRemaining} fila${rowsRemaining === 1 ? '' : 's'} de presupuesto`
          : 'Cierra tu presupuesto',
      body: 'Ingresa ingresos y gastos reales del mes. No tiene que ser perfecto — solo honesto.',
      buttonLabel: rowsRemaining > 0 ? 'Completar presupuesto' : 'Revisar presupuesto',
      progressLabel: `${Math.min(status.budgetRowsCompleted, BUDGET_ROWS_TARGET)}/${BUDGET_ROWS_TARGET} filas`,
      progressRatio: Math.min(1, status.budgetRowsCompleted / BUDGET_ROWS_TARGET),
      steps,
    };
  }

  return {
    section: 'interview',
    headline: 'Presupuesto listo',
    body: 'Cierra con una entrevista breve (máx. 3 min) para tu diagnóstico premium y desbloquear los chats superiores.',
    buttonLabel: 'Iniciar entrevista',
    steps,
  };
}
