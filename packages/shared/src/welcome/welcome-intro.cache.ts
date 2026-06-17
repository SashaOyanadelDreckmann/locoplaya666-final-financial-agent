import {
  WELCOME_FINTECH_DEFAULT_BENEFIT,
  WELCOME_FINTECH_DEFAULT_BODY,
  WELCOME_FINTECH_DEFAULT_TITLE,
} from './welcome-intro.copy';
import {
  EXECUTIVE_INTRO_UI_VERSION,
  WELCOME_INTRO_MAX_LLM_GENERATIONS,
  type InjectedIntakeEnvelope,
  type WelcomeIntroCache,
  type WelcomeIntroPayload,
  type WelcomeIntroSection,
} from './welcome-intro.types';
import { formatProductHintsBlurb } from './welcome-guide.helpers';

export { WELCOME_INTRO_MAX_LLM_GENERATIONS };

export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'number' || valueType === 'boolean') return JSON.stringify(value);
  if (valueType === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return 'null';
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildWelcomeIntroFingerprint(
  intake: Record<string, unknown>,
  llmSummary: { summary?: string; highlights?: string[] } | null,
): string {
  const payload = stableStringify({ intake, llmSummary });
  return (
    fnv1aHex(payload) +
    fnv1aHex(`${payload}:1`) +
    fnv1aHex(`${payload}:2`)
  ).slice(0, 24);
}

export function extractIntakeEnvelope(injectedIntake: unknown): {
  intake: Record<string, unknown>;
  intakeContext: Record<string, unknown>;
  llmSummary: { summary?: string; highlights?: string[] } | null;
} {
  const root =
    injectedIntake && typeof injectedIntake === 'object'
      ? (injectedIntake as InjectedIntakeEnvelope)
      : {};
  const intake =
    root.intake && typeof root.intake === 'object'
      ? root.intake
      : (root as Record<string, unknown>);
  const intakeContext =
    root.intakeContext && typeof root.intakeContext === 'object' ? root.intakeContext : {};
  const rawSummary = root.llmSummary;
  const llmSummary =
    rawSummary && typeof rawSummary === 'object'
      ? (rawSummary as { summary?: string; highlights?: string[] })
      : null;

  return { intake, intakeContext, llmSummary };
}

export function readWelcomeIntroCache(injectedIntake: unknown): WelcomeIntroCache | null {
  const root =
    injectedIntake && typeof injectedIntake === 'object'
      ? (injectedIntake as InjectedIntakeEnvelope)
      : null;
  const cache = root?.welcomeIntroCache;
  if (!cache || typeof cache !== 'object') return null;

  const record = cache as WelcomeIntroCache;
  if (
    typeof record.fingerprint !== 'string' ||
    typeof record.uiVersion !== 'number' ||
    typeof record.createdAt !== 'string' ||
    !record.intro ||
    typeof record.intro !== 'object'
  ) {
    return null;
  }

  return record;
}

export function readWelcomeIntroGenerationCount(
  cache: WelcomeIntroCache | null | undefined,
): number {
  if (!cache?.intro) return 0;
  if (
    typeof cache.llmGenerationCount === 'number' &&
    Number.isFinite(cache.llmGenerationCount)
  ) {
    return Math.max(
      0,
      Math.min(WELCOME_INTRO_MAX_LLM_GENERATIONS, Math.floor(cache.llmGenerationCount)),
    );
  }
  return 1;
}

export function canGenerateWelcomeIntroWithLlm(
  cache: WelcomeIntroCache | null | undefined,
): boolean {
  return readWelcomeIntroGenerationCount(cache) < WELCOME_INTRO_MAX_LLM_GENERATIONS;
}

export function isValidWelcomeIntroCache(
  cache: WelcomeIntroCache | null | undefined,
  fingerprint: string,
): cache is WelcomeIntroCache {
  if (!cache) return false;
  if (cache.fingerprint !== fingerprint) return false;
  if (cache.intro.version !== 2) return false;
  if (typeof cache.intro.headline !== 'string' || !cache.intro.headline.trim()) return false;
  if (typeof cache.intro.personalRead !== 'string' || !cache.intro.personalRead.trim()) return false;
  if (!Array.isArray(cache.intro.signals)) return false;
  if (!cache.intro.sections || typeof cache.intro.sections !== 'object') return false;
  return true;
}

export function withWelcomeIntroFirstName(
  intro: WelcomeIntroPayload,
  firstName: string,
): WelcomeIntroPayload {
  if (intro.firstName === firstName) return intro;
  return { ...intro, firstName };
}

const DEFAULT_METODO: WelcomeIntroSection['metodo'] = [
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
];

function normalizeSections(sections: WelcomeIntroSection | undefined): WelcomeIntroSection {
  const metodo = Array.isArray(sections?.metodo)
    ? sections!.metodo
        .filter(
          (step) =>
            step &&
            typeof step === 'object' &&
            typeof step.label === 'string' &&
            typeof step.detail === 'string',
        )
        .slice(0, 3)
        .map((step, index) => ({
          step: typeof step.step === 'number' ? step.step : index + 1,
          label: step.label.trim(),
          detail: step.detail.trim(),
        }))
    : [];

  return {
    marco: {
      title: sections?.marco?.title?.trim() || 'Marco de trabajo',
      body:
        sections?.marco?.body?.trim() ||
        'Convertimos información financiera dispersa en un diagnóstico claro, verificable y accionable.',
    },
    fintech: {
      title: sections?.fintech?.title?.trim() || WELCOME_FINTECH_DEFAULT_TITLE,
      body: sections?.fintech?.body?.trim() || WELCOME_FINTECH_DEFAULT_BODY,
      benefit: sections?.fintech?.benefit?.trim() || WELCOME_FINTECH_DEFAULT_BENEFIT,
    },
    metodo: metodo.length > 0 ? metodo : DEFAULT_METODO,
    resultado: {
      title: sections?.resultado?.title?.trim() || 'Resultado',
      body:
        sections?.resultado?.body?.trim() ||
        'Un diagnóstico financiero personal con prioridades concretas y una ruta de decisión verificable.',
    },
  };
}

export function normalizeWelcomeIntroPayload(intro: WelcomeIntroPayload): WelcomeIntroPayload {
  const firstName = intro.firstName?.trim() || 'Hola';
  const productHints = Array.isArray(intro.productHints)
    ? intro.productHints
        .filter(
          (hint) =>
            hint &&
            typeof hint === 'object' &&
            typeof hint.label === 'string' &&
            typeof hint.fact === 'string',
        )
        .slice(0, 3)
        .map((hint) => ({
          label: hint.label.trim(),
          fact: hint.fact.trim(),
          source: String(hint.source ?? 'Web').trim() || 'Web',
          url: typeof hint.url === 'string' ? hint.url.trim() : undefined,
        }))
    : undefined;

  return {
    version: 2,
    uiVersion: intro.uiVersion ?? EXECUTIVE_INTRO_UI_VERSION,
    firstName,
    headline:
      intro.headline?.trim() ||
      `${firstName}, partimos con una lectura seria de tu situación.`,
    wittyHook: intro.wittyHook?.trim() || undefined,
    personalRead: intro.personalRead?.trim() || '',
    signals: Array.isArray(intro.signals)
      ? intro.signals.filter((signal) => typeof signal === 'string' && signal.trim()).slice(0, 4)
      : [],
    sections: normalizeSections(intro.sections),
    closingQuestion: intro.closingQuestion?.trim() || '¿Partimos por Productos y transacciones?',
    guideActions: Array.isArray(intro.guideActions) ? intro.guideActions.slice(0, 4) : undefined,
    productHints,
    productBlurb: intro.productBlurb?.trim() || formatProductHintsBlurb(productHints ?? []),
  };
}

export function readCachedWelcomeIntro(session: {
  name?: string | null;
  injectedIntake?: unknown;
} | null | undefined): WelcomeIntroPayload | null {
  if (!session?.injectedIntake) return null;

  const firstName = String(session.name ?? '').split(' ')[0]?.trim() || 'Hola';
  const { intake, llmSummary } = extractIntakeEnvelope(session.injectedIntake);
  const fingerprint = buildWelcomeIntroFingerprint(intake, llmSummary);
  const cache = readWelcomeIntroCache(session.injectedIntake);

  if (!isValidWelcomeIntroCache(cache, fingerprint)) return null;

  return normalizeWelcomeIntroPayload(withWelcomeIntroFirstName(cache.intro, firstName));
}
