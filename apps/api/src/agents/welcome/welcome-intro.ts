import { completeStructured, runWithLLMCostTracking } from '../../services/llm.service';
import { getUserById } from '../../persistencia/repos';
import {
  canAffordOperation,
  chargeActualUsdSpent,
  getFincoinUsageForUser,
} from '../../services/fincoin.service';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import {
  WELCOME_FINTECH_DEFAULT_BENEFIT,
  WELCOME_FINTECH_DEFAULT_BODY,
  WELCOME_FINTECH_DEFAULT_TITLE,
  WELCOME_MARCO_DEFAULT_BODY,
  buildWelcomeIntroFingerprint,
  buildWelcomeGuideEnrichment,
  canGenerateWelcomeIntroWithLlm,
  extractIntakeEnvelope,
  normalizeWelcomeIntroPayload,
  readWelcomeIntroCache,
  readWelcomeIntroGenerationCount,
  withWelcomeIntroFirstName,
  EXECUTIVE_INTRO_UI_VERSION,
  WELCOME_INTRO_MAX_LLM_GENERATIONS,
  type WelcomeIntroCache,
  type WelcomeIntroPayload,
  type WelcomeIntroSection,
} from '@financial-agent/shared';

export type {
  WelcomeIntroCache,
  WelcomeIntroPayload,
  WelcomeIntroSection,
} from '@financial-agent/shared';
export {
  buildWelcomeIntroFingerprint,
  canGenerateWelcomeIntroWithLlm,
  extractIntakeEnvelope,
  isValidWelcomeIntroCache,
  normalizeWelcomeIntroPayload,
  readWelcomeIntroCache,
  readWelcomeIntroGenerationCount,
  withWelcomeIntroFirstName,
  EXECUTIVE_INTRO_UI_VERSION,
  WELCOME_INTRO_MAX_LLM_GENERATIONS,
} from '@financial-agent/shared';

type WelcomeIntroLLM = {
  headline?: string;
  wittyHook?: string;
  personalRead?: string;
  signals?: string[];
  fintechInsight?: string;
  fintechBenefit?: string;
  resultNote?: string;
  closingQuestion?: string;
};

const WELCOME_INTRO_SYSTEM = `
Eres un director de diagnóstico financiero chileno. Redactas la introducción de Financieramente: cercano, preciso y premium.

Devuelve SOLO JSON válido:
{
  "headline": "frase ejecutiva con su nombre, máx 12 palabras",
  "wittyHook": "1 línea ingeniosa citando UN dato del intake (ciudad, ingreso, deuda, estrés). Breve y memorable.",
  "personalRead": "1-2 oraciones. Diagnóstico inicial conciso, cálido y sin repetir el formulario.",
  "signals": ["3 señales cortas del intake"],
  "fintechInsight": "1 oración: simulación inspirada en Ley Fintech 21.521, sin Open Finance oficial",
  "fintechBenefit": "1 oración: estudio de utilidad, no conexión bancaria regulada",
  "resultNote": "1 oración sobre diagnóstico personal con prioridades concretas",
  "closingQuestion": "pregunta corta para iniciar por cartola, presupuesto o entrevista"
}

Reglas: español chileno, tú, sin emojis. No recomiendes productos financieros ni instituciones en esta introducción inicial.
NUNCA prometas PDFs: la exportación la hace el usuario con Guardar PDF.
`.trim();

function buildDeterministicRead(intake: Record<string, unknown>): string {
  const hasSavings =
    typeof intake.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
  const hasDebt = typeof intake.hasDebt === 'boolean' ? intake.hasDebt : null;

  if (hasSavings === false && hasDebt === false) {
    return 'hoy el foco parece estar en construir base y liquidez, más que en apagar incendios.';
  }
  if (hasDebt === true && hasSavings === false) {
    return 'hay presión entre caja corta y deuda; conviene priorizar secuencia y oxígeno financiero.';
  }
  if (hasSavings === true) {
    return 'ya existe una base sobre la cual conviene decidir mejor cómo asignar flujo y riesgo.';
  }
  return 'hay espacio para ordenar mejor tu mapa financiero con evidencia real.';
}

function buildDeterministicSignals(intake: Record<string, unknown>, ctx: Record<string, unknown>): string[] {
  const signals: string[] = [];
  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const stress = typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;
  const tracks = typeof intake.tracksExpenses === 'string' ? intake.tracksExpenses : '';

  if (incomeBand) signals.push(`Tramo de ingresos: ${incomeBand}`);
  if (city) signals.push(`Operas desde ${city}`);
  if (stress !== null && stress >= 7) signals.push('Estrés financiero elevado');
  else if (stress !== null && stress <= 3) signals.push('Estrés financiero contenido');
  if (tracks === 'no' || tracks === 'sometimes') signals.push('Gastos poco trazados');
  if (typeof intake.hasDebt === 'boolean' && intake.hasDebt) signals.push('Deuda activa en el radar');
  if (typeof intake.hasSavingsOrInvestments === 'boolean' && intake.hasSavingsOrInvestments) {
    signals.push('Ahorro o inversión presente');
  }

  const literacy = typeof ctx.financialLiteracy === 'string' ? ctx.financialLiteracy : '';
  if (literacy === 'low') signals.push('Espacio para fortalecer alfabetización');
  if (literacy === 'high') signals.push('Perfil analítico detectado');

  return signals.slice(0, 4);
}

function buildFallbackWittyHook(firstName: string, intake: Record<string, unknown>): string {
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const income = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const stress = typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;
  if (city && stress !== null && stress >= 7) {
    return `${firstName}, operas desde ${city} con estrés en ${stress}/10: si esto fuera rally, ya estaríamos en la recta final con luces de advertencia.`;
  }
  if (income) {
    return `${firstName}, con tramo ${income} en la mesa, tu perfil ya llegó con más contexto que la mayoría de reuniones ejecutivas.`;
  }
  return `${firstName}, tu intake llegó con tanta señal útil que casi pedimos autógrafo antes del diagnóstico.`;
}

function defaultSections(llm?: WelcomeIntroLLM): WelcomeIntroSection {
  return {
    marco: {
      title: 'Marco de trabajo',
      body: WELCOME_MARCO_DEFAULT_BODY,
    },
    fintech: {
      title: WELCOME_FINTECH_DEFAULT_TITLE,
      body: llm?.fintechInsight?.trim() || WELCOME_FINTECH_DEFAULT_BODY,
      benefit: llm?.fintechBenefit?.trim() || WELCOME_FINTECH_DEFAULT_BENEFIT,
    },
    metodo: [
      {
        step: 1,
        label: 'Productos y transacciones',
        detail: 'Fuente primaria de evidencia: movimientos reales, categorías y alertas.',
      },
      {
        step: 2,
        label: 'Presupuesto',
        detail: 'Estructura ingresos, gastos y balance para leer capacidad y margen.',
      },
      {
        step: 3,
        label: 'Entrevista breve',
        detail: 'Criterio, prioridad y tolerancia al riesgo para cerrar el diagnóstico.',
      },
    ],
    resultado: {
      title: 'Resultado',
      body:
        llm?.resultNote?.trim() ||
        'Un diagnóstico financiero personal con prioridades concretas y una ruta de decisión verificable.',
    },
  };
}

export function buildFallbackWelcomeIntro(params: {
  firstName: string;
  intake?: Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
  llmSummary?: { summary?: string; highlights?: string[] } | null;
  diagnosisUnlocked?: boolean;
}): WelcomeIntroPayload {
  const intake = params.intake ?? {};
  const ctx = params.intakeContext ?? {};
  const firstName = params.firstName || 'Hola';
  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const read = buildDeterministicRead(intake);
  const hints = [
    city ? ` Estás operando desde ${city}.` : '',
    incomeBand ? ` Tu tramo de ingresos declarado es ${incomeBand}.` : '',
  ].join('');

  const highlights = Array.isArray(params.llmSummary?.highlights)
    ? params.llmSummary!.highlights!.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4)
    : [];
  const signals =
    highlights.length > 0 ? highlights : buildDeterministicSignals(intake, ctx);

  const personalRead =
    typeof params.llmSummary?.summary === 'string' && params.llmSummary.summary.trim()
      ? params.llmSummary.summary.trim()
      : `${read}${hints}`.trim();

  return attachWelcomeGuideEnrichment(
    normalizeWelcomeIntroPayload({
      version: 2,
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
      firstName,
      headline: `${firstName}, partimos con una lectura seria de tu situación.`,
      wittyHook: buildFallbackWittyHook(firstName, intake),
      personalRead,
      signals,
      sections: defaultSections(),
      closingQuestion: '¿Partimos por tu cartola o el presupuesto?',
    }),
    {
      firstName,
      intake,
      diagnosisUnlocked: params.diagnosisUnlocked,
    },
  );
}

function attachWelcomeGuideEnrichment(
  intro: WelcomeIntroPayload,
  params: {
    firstName: string;
    intake?: Record<string, unknown>;
    diagnosisUnlocked?: boolean;
  },
): WelcomeIntroPayload {
  const enrichment = buildWelcomeGuideEnrichment({
    chatId: 'chat-1',
    firstName: params.firstName,
    intake: params.intake,
    diagnosisUnlocked: params.diagnosisUnlocked,
    productHints: [],
  });

  return normalizeWelcomeIntroPayload({
    ...intro,
    guideActions: enrichment.guideActions,
    productHints: enrichment.productHints,
    productBlurb: enrichment.productBlurb,
  });
}

export function welcomeIntroToMarkdown(intro: WelcomeIntroPayload): string {
  const methodLines = intro.sections.metodo
    .map((m) => `${m.step}. **${m.label}** — ${m.detail}`)
    .join('\n');

  return [
    `# Informe inicial de diagnóstico`,
    ``,
    `**${intro.headline}**`,
    ``,
    ...(intro.wittyHook?.trim() ? [`*${intro.wittyHook.trim()}*`, ``] : []),
    intro.personalRead,
    ``,
    `## ${intro.sections.marco.title}`,
    intro.sections.marco.body,
    ``,
    `## ${intro.sections.fintech.title}`,
    `${intro.sections.fintech.body} ${intro.sections.fintech.benefit}`,
    ``,
    `## Método`,
    methodLines,
    ``,
    `## ${intro.sections.resultado.title}`,
    intro.sections.resultado.body,
    ``,
    intro.closingQuestion,
  ].join('\n');
}

export async function buildWelcomeIntroWithLLM(params: {
  firstName: string;
  intake: IntakeQuestionnaire | Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
  llmSummary?: { summary?: string; highlights?: string[] } | null;
  diagnosisUnlocked?: boolean;
}): Promise<WelcomeIntroPayload> {
  const intakeRecord = params.intake as Record<string, unknown>;
  const fallback = buildFallbackWelcomeIntro({
    firstName: params.firstName,
    intake: intakeRecord,
    intakeContext: params.intakeContext,
    llmSummary: params.llmSummary,
    diagnosisUnlocked: params.diagnosisUnlocked,
  });

  try {
    const user = [
      `Usuario: ${params.firstName}`,
      `Intake: ${JSON.stringify(params.intake, null, 2)}`,
      `Contexto derivado: ${JSON.stringify(params.intakeContext ?? {}, null, 2)}`,
      params.llmSummary
        ? `Análisis previo del intake: ${JSON.stringify(params.llmSummary, null, 2)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const parsed = await completeStructured<WelcomeIntroLLM>({
      system: WELCOME_INTRO_SYSTEM,
      user,
      temperature: 0.72,
      maxCompletionTokens: 460,
    });

    const signals = Array.isArray(parsed.signals)
      ? parsed.signals.filter((s) => typeof s === 'string' && s.trim()).slice(0, 4)
      : fallback.signals;

    const sections = defaultSections(parsed);

    return attachWelcomeGuideEnrichment(
      normalizeWelcomeIntroPayload({
        version: 2,
        uiVersion: EXECUTIVE_INTRO_UI_VERSION,
        firstName: params.firstName,
        headline: parsed.headline?.trim() || fallback.headline,
        wittyHook: parsed.wittyHook?.trim() || fallback.wittyHook,
        personalRead: parsed.personalRead?.trim() || fallback.personalRead,
        signals: signals.length > 0 ? signals : fallback.signals,
        sections,
        closingQuestion: parsed.closingQuestion?.trim() || fallback.closingQuestion,
      }),
      {
        firstName: params.firstName,
        intake: intakeRecord,
        diagnosisUnlocked: params.diagnosisUnlocked,
      },
    );
  } catch {
    return fallback;
  }
}

export async function resolveWelcomeIntroForUser(params: {
  userId: string;
  firstName: string;
  injectedIntake: unknown;
  persistWelcomeIntroCache: (
    userId: string,
    cache: WelcomeIntroCache,
  ) => Promise<boolean>;
}): Promise<{ intro: WelcomeIntroPayload; message: string; cached: boolean }> {
  if (!params.injectedIntake) {
    const intro = buildFallbackWelcomeIntro({ firstName: params.firstName });
    return {
      intro,
      message: `${params.firstName}, antes de avanzar necesito una base mínima de contexto. Completa tu perfil financiero y partimos con una lectura útil de tu situación.`,
      cached: false,
    };
  }

  const envelope = extractIntakeEnvelope(params.injectedIntake);
  const fingerprint = buildWelcomeIntroFingerprint(envelope.intake, envelope.llmSummary);
  const cached = readWelcomeIntroCache(params.injectedIntake);
  const generationCount = readWelcomeIntroGenerationCount(cached);
  const finalizeIntro = (intro: WelcomeIntroPayload) =>
    attachWelcomeGuideEnrichment(
      normalizeWelcomeIntroPayload(withWelcomeIntroFirstName(intro, params.firstName)),
      {
        firstName: params.firstName,
        intake: envelope.intake,
        diagnosisUnlocked: false,
      },
    );

  const persistResolvedCache = async (entry: WelcomeIntroCache) => {
    await params.persistWelcomeIntroCache(params.userId, entry);
  };

  if (cached?.fingerprint === fingerprint && cached.intro) {
    const intro = finalizeIntro(cached.intro);
    if (cached.uiVersion !== EXECUTIVE_INTRO_UI_VERSION) {
      await persistResolvedCache({
        ...cached,
        uiVersion: EXECUTIVE_INTRO_UI_VERSION,
        intro,
        llmGenerationCount: generationCount,
      });
    }
    return {
      intro,
      message: welcomeIntroToMarkdown(intro),
      cached: true,
    };
  }

  if (cached?.intro && !canGenerateWelcomeIntroWithLlm(cached)) {
    const intro = finalizeIntro(cached.intro);
    await persistResolvedCache({
      fingerprint,
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
      intro,
      createdAt: cached.createdAt,
      llmGenerationCount: generationCount,
    });
    return {
      intro,
      message: welcomeIntroToMarkdown(intro),
      cached: true,
    };
  }

  if (canGenerateWelcomeIntroWithLlm(cached)) {
    const userRecord = await getUserById(params.userId);
    const fincoinUsage = userRecord ? getFincoinUsageForUser(userRecord) : null;
    if (
      fincoinUsage &&
      (fincoinUsage.depleted || !canAffordOperation(fincoinUsage, 'welcome.llm'))
    ) {
      const intro = finalizeIntro(
        cached?.intro
          ? cached.intro
          : buildFallbackWelcomeIntro({
              firstName: params.firstName,
              intake: envelope.intake,
              intakeContext: envelope.intakeContext,
              llmSummary: envelope.llmSummary,
            }),
      );
      return {
        intro,
        message: welcomeIntroToMarkdown(intro),
        cached: Boolean(cached?.intro),
      };
    }

    if (!userRecord) {
      const intro = finalizeIntro(
        buildFallbackWelcomeIntro({
          firstName: params.firstName,
          intake: envelope.intake,
          intakeContext: envelope.intakeContext,
          llmSummary: envelope.llmSummary,
        }),
      );
      return {
        intro,
        message: welcomeIntroToMarkdown(intro),
        cached: false,
      };
    }

    const welcomeUsage = getFincoinUsageForUser(userRecord);
    if (!canAffordOperation(welcomeUsage, 'welcome.llm')) {
      const intro = finalizeIntro(
        cached?.intro
          ? cached.intro
          : buildFallbackWelcomeIntro({
              firstName: params.firstName,
              intake: envelope.intake,
              intakeContext: envelope.intakeContext,
              llmSummary: envelope.llmSummary,
            }),
      );
      return {
        intro,
        message: welcomeIntroToMarkdown(intro),
        cached: Boolean(cached?.intro),
      };
    }

    const { result: intro, costUsd } = await runWithLLMCostTracking(async () =>
      finalizeIntro(
        await buildWelcomeIntroWithLLM({
          firstName: params.firstName,
          intake: envelope.intake,
          intakeContext: envelope.intakeContext,
          llmSummary: envelope.llmSummary,
        }),
      ),
    );

    await chargeActualUsdSpent(params.userId, costUsd);

    const cacheEntry: WelcomeIntroCache = {
      fingerprint,
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
      intro,
      createdAt: new Date().toISOString(),
      llmGenerationCount: generationCount + 1,
    };

    await persistResolvedCache(cacheEntry);

    return {
      intro,
      message: welcomeIntroToMarkdown(intro),
      cached: false,
    };
  }

  const intro = finalizeIntro(
    buildFallbackWelcomeIntro({
      firstName: params.firstName,
      intake: envelope.intake,
      intakeContext: envelope.intakeContext,
      llmSummary: envelope.llmSummary,
    }),
  );

  return {
    intro,
    message: welcomeIntroToMarkdown(intro),
    cached: false,
  };
}
