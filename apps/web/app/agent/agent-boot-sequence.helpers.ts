import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { buildFallbackWelcomeIntro } from './welcome-intro.shared';

export const AGENT_BOOT_FROM_INTAKE_KEY = 'agent.boot.from-intake';

export type BootScriptLine = {
  id: string;
  tone: 'comment' | 'system' | 'keyword' | 'string' | 'plain' | 'success' | 'dim';
  text: string;
  pauseMs?: number;
};

const INCOME_LABELS: Record<string, string> = {
  no_income: 'sin ingreso fijo',
  '<300k': 'bajo $300k',
  '300k-600k': '$300k–$600k',
  '600k-1M': '$600k–$1M',
  '1M-2M': '$1M–$2M',
  '2M-4M': '$2M–$4M',
  '>4M': 'más de $4M',
  variable: 'variable',
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
  surplus: 'con superávit',
  tight: 'ajustado',
  sometimes: 'a veces al límite',
  no: 'sin cubrir gastos',
};

const RISK_LABELS: Record<string, string> = {
  sell: 'vendería ante caída',
  hold: 'mantendría posición',
  buy_more: 'compraría más',
  never_invest: 'no invertiría',
  other: 'otra reacción',
};

function escapeJson(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractIntake(session: {
  name?: string | null;
  injectedIntake?: unknown;
}): Partial<IntakeQuestionnaire> & Record<string, unknown> {
  const root =
    session?.injectedIntake && typeof session.injectedIntake === 'object'
      ? (session.injectedIntake as Record<string, unknown>)
      : null;
  const intake =
    root?.intake && typeof root.intake === 'object'
      ? (root.intake as Partial<IntakeQuestionnaire> & Record<string, unknown>)
      : root ?? {};
  return intake;
}

export function markAgentBootFromIntake(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AGENT_BOOT_FROM_INTAKE_KEY, '1');
  } catch {}
}

export function shouldShowAgentBootSequence(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(AGENT_BOOT_FROM_INTAKE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearAgentBootFromIntake(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AGENT_BOOT_FROM_INTAKE_KEY);
  } catch {}
}

export function buildBootScriptLines(session: {
  name?: string | null;
  injectedIntake?: unknown;
}): BootScriptLine[] {
  const intake = extractIntake(session);
  const firstName = String(session?.name ?? '').split(' ')[0]?.trim() || 'usuario';
  const fullName = String(session?.name ?? '').trim() || firstName;
  const intro = buildFallbackWelcomeIntro(session);
  const signals = intro.signals;

  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const employment =
    typeof intake.employmentStatus === 'string' ? intake.employmentStatus : 'employed';
  const expenses =
    typeof intake.expensesCoverage === 'string' ? intake.expensesCoverage : 'tight';
  const stress =
    typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;
  const understanding =
    typeof intake.selfRatedUnderstanding === 'number' ? intake.selfRatedUnderstanding : null;
  const hasDebt = typeof intake.hasDebt === 'boolean' ? intake.hasDebt : null;
  const hasSavings =
    typeof intake.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
  const risk =
    typeof intake.riskReaction === 'string' ? intake.riskReaction : 'hold';
  const profession = typeof intake.profession === 'string' ? intake.profession.trim() : '';

  const knowledgeCount = intake.financialKnowledge
    ? Object.values(intake.financialKnowledge).filter(Boolean).length
    : 0;

  const lines: BootScriptLine[] = [
    { id: 'h1', tone: 'comment', text: '// apps/api/src/routes/intake.ts — submitIntake()' },
    { id: 'h2', tone: 'comment', text: '// apps/api/src/agents/welcome/welcome-intro.ts' },
    { id: 'sp1', tone: 'plain', text: '' },
    {
      id: 'import',
      tone: 'plain',
      text: 'import { analyzeIntake, buildIntakeContext } from "@financial-agent/api/intake";',
    },
    {
      id: 'import2',
      tone: 'plain',
      text: 'import { synchronizeKnowledgeFromIntake } from "@financial-agent/api/knowledge";',
    },
    { id: 'sp2', tone: 'plain', text: '' },
    { id: 'const', tone: 'keyword', text: `const subject = "${escapeJson(fullName)}";` },
    { id: 'locale', tone: 'keyword', text: 'const locale = "es-CL";' },
    { id: 'sp3', tone: 'plain', text: '' },
    { id: 'obj', tone: 'system', text: 'const profile = {' },
  ];

  if (city) {
    lines.push({
      id: 'city',
      tone: 'string',
      text: `  city: "${escapeJson(city)}",`,
      pauseMs: 120,
    });
  }

  if (incomeBand) {
    lines.push({
      id: 'income',
      tone: 'string',
      text: `  incomeBand: "${incomeBand}", // ${INCOME_LABELS[incomeBand] ?? incomeBand}`,
      pauseMs: 140,
    });
  }

  lines.push({
    id: 'employment',
    tone: 'string',
    text: `  employmentStatus: "${employment}", // ${EMPLOYMENT_LABELS[employment] ?? employment}`,
    pauseMs: 120,
  });

  if (profession) {
    lines.push({
      id: 'profession',
      tone: 'string',
      text: `  profession: "${escapeJson(profession)}",`,
      pauseMs: 100,
    });
  }

  lines.push({
    id: 'expenses',
    tone: 'string',
    text: `  expensesCoverage: "${expenses}", // ${EXPENSES_LABELS[expenses] ?? expenses}`,
    pauseMs: 110,
  });

  if (stress !== null) {
    lines.push({
      id: 'stress',
      tone: 'string',
      text: `  moneyStressLevel: ${stress},`,
      pauseMs: 90,
    });
  }

  if (understanding !== null) {
    lines.push({
      id: 'understanding',
      tone: 'string',
      text: `  selfRatedUnderstanding: ${understanding}/10,`,
      pauseMs: 90,
    });
  }

  if (hasDebt !== null) {
    lines.push({
      id: 'debt',
      tone: 'string',
      text: `  hasDebt: ${hasDebt},`,
      pauseMs: 80,
    });
  }

  if (hasSavings !== null) {
    lines.push({
      id: 'savings',
      tone: 'string',
      text: `  hasSavingsOrInvestments: ${hasSavings},`,
      pauseMs: 80,
    });
  }

  lines.push({
    id: 'risk',
    tone: 'string',
    text: `  riskReaction: "${risk}", // ${RISK_LABELS[risk] ?? risk}`,
    pauseMs: 110,
  });

  lines.push({ id: 'close', tone: 'system', text: '};' });
  lines.push({ id: 'sp4', tone: 'plain', text: '' });
  lines.push({
    id: 'greet',
    tone: 'comment',
    text: `// Hola ${firstName} — tu intake quedó persistido en sesión`,
    pauseMs: 200,
  });
  lines.push({
    id: 'run1',
    tone: 'system',
    text: 'await attachIntakeToUser(session.id, profile);',
    pauseMs: 160,
  });
  lines.push({
    id: 'run2',
    tone: 'system',
    text: 'const signals = analyzeIntake(profile);',
    pauseMs: 140,
  });
  lines.push({
    id: 'run3',
    tone: 'system',
    text: 'const intakeContext = buildIntakeContext(profile);',
    pauseMs: 140,
  });
  lines.push({
    id: 'run4',
    tone: 'system',
    text: `await synchronizeKnowledgeFromIntake(session.id); // ${knowledgeCount} conceptos`,
    pauseMs: 160,
  });
  lines.push({ id: 'sp5', tone: 'plain', text: '' });

  for (const signal of signals.slice(0, 4)) {
    lines.push({
      id: `sig-${signal}`,
      tone: 'success',
      text: `→ signal: "${escapeJson(signal)}"`,
      pauseMs: 130,
    });
  }

  const readSnippet = intro.personalRead.slice(0, 72).trim();
  if (readSnippet) {
    lines.push({ id: 'sp6', tone: 'plain', text: '' });
    lines.push({
      id: 'read',
      tone: 'comment',
      text: `// lectura: "${escapeJson(readSnippet)}${intro.personalRead.length > 72 ? '…' : ''}"`,
      pauseMs: 180,
    });
  }

  lines.push({ id: 'sp7', tone: 'plain', text: '' });
  lines.push({
    id: 'compile',
    tone: 'keyword',
    text: 'pnpm --filter @financial-agent/web typecheck ✓',
    pauseMs: 220,
  });
  lines.push({
    id: 'ready',
    tone: 'success',
    text: `readyForInterview: true  // agente listo para ${firstName}`,
    pauseMs: 280,
  });

  return lines;
}
