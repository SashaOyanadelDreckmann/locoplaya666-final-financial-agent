const INCOME_LABELS: Record<string, string> = {
  no_income: 'sin ingreso fijo',
  '<300k': 'bajo $300k',
  '300k-600k': '$300k–$600k',
  '600k-1M': '$600k–$1M',
  '1M-2M': '$1M–$2M',
  '2M-4M': '$2M–$4M',
  '>4M': 'más de $4M',
  variable: 'ingreso variable',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: 'dependiente',
  freelance: 'independiente',
  unemployed: 'sin empleo',
  student: 'estudiante',
  employed_student: 'dependiente + estudiante',
  freelance_student: 'independiente + estudiante',
  employed_freelance: 'mixto dependiente/independiente',
  employed_freelance_student: 'mixto + estudiante',
};

const EXPENSES_LABELS: Record<string, string> = {
  surplus: 'gastos con superávit',
  tight: 'gastos ajustados',
  sometimes: 'a veces al límite',
  no: 'gastos sin cubrir',
};

const TRACKING_LABELS: Record<string, string> = {
  yes: 'rastrea gastos',
  sometimes: 'rastrea a veces',
  no: 'no rastrea gastos',
};

const RISK_LABELS: Record<string, string> = {
  sell: 'vendería ante caída',
  hold: 'mantendría posición',
  buy_more: 'compraría más',
  never_invest: 'no invertiría',
  other: 'otra reacción al riesgo',
};

const SAVINGS_LABELS: Record<string, string> = {
  none: 'sin colchón',
  '<300k': 'ahorro bajo $300k',
  '300k-1M': 'ahorro $300k–$1M',
  '1M-3M': 'ahorro $1M–$3M',
  '3M-10M': 'ahorro $3M–$10M',
  '>10M': 'ahorro +$10M',
};

function extractIntake(session: {
  name?: string | null;
  injectedIntake?: unknown;
}): Record<string, unknown> {
  const root =
    session?.injectedIntake && typeof session.injectedIntake === 'object'
      ? (session.injectedIntake as Record<string, unknown>)
      : null;
  return root?.intake && typeof root.intake === 'object'
    ? (root.intake as Record<string, unknown>)
    : root ?? {};
}

export function buildIntakeScrambleLines(session: {
  name?: string | null;
  injectedIntake?: unknown;
}): string[] {
  const intake = extractIntake(session);
  const firstName =
    String(session?.name ?? '')
      .split(' ')
      .find(Boolean) ?? 'Tú';

  const lines: string[] = [firstName];

  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  if (city) lines.push(`Base · ${city}`);

  const age = typeof intake.age === 'number' ? intake.age : null;
  if (age !== null) lines.push(`Edad · ${age}`);

  const profession = typeof intake.profession === 'string' ? intake.profession.trim() : '';
  if (profession) lines.push(`Oficio · ${profession}`);

  const employment =
    typeof intake.employmentStatus === 'string' ? intake.employmentStatus : '';
  if (employment) {
    lines.push(`Trabajo · ${EMPLOYMENT_LABELS[employment] ?? employment}`);
  }

  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  if (incomeBand) {
    lines.push(`Ingresos · ${INCOME_LABELS[incomeBand] ?? incomeBand}`);
  }

  const expenses =
    typeof intake.expensesCoverage === 'string' ? intake.expensesCoverage : '';
  if (expenses) {
    lines.push(`Caja · ${EXPENSES_LABELS[expenses] ?? expenses}`);
  }

  const tracks = typeof intake.tracksExpenses === 'string' ? intake.tracksExpenses : '';
  if (tracks) {
    lines.push(`Control · ${TRACKING_LABELS[tracks] ?? tracks}`);
  }

  if (typeof intake.hasDebt === 'boolean') {
    lines.push(intake.hasDebt ? 'Deuda · activa' : 'Deuda · sin presión');
  }

  if (typeof intake.hasSavingsOrInvestments === 'boolean') {
    lines.push(
      intake.hasSavingsOrInvestments ? 'Ahorro · presente' : 'Ahorro · por construir'
    );
  }

  const savingsBand = typeof intake.savingsBand === 'string' ? intake.savingsBand : '';
  if (savingsBand) {
    lines.push(`Colchón · ${SAVINGS_LABELS[savingsBand] ?? savingsBand}`);
  }

  const stress =
    typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;
  if (stress !== null) lines.push(`Estrés · ${stress}/10`);

  const understanding =
    typeof intake.selfRatedUnderstanding === 'number' ? intake.selfRatedUnderstanding : null;
  if (understanding !== null) lines.push(`Confianza · ${understanding}/10`);

  const risk = typeof intake.riskReaction === 'string' ? intake.riskReaction : '';
  if (risk) {
    lines.push(`Riesgo · ${RISK_LABELS[risk] ?? risk}`);
  }

  const knowledge = intake.financialKnowledge;
  if (knowledge && typeof knowledge === 'object') {
    const count = Object.values(knowledge as Record<string, boolean>).filter(Boolean).length;
    if (count > 0) lines.push(`Conceptos · ${count} dominados`);
  }

  return lines;
}
