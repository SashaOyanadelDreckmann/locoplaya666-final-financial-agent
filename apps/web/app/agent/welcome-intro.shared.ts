import type { AgentBlock } from '@/lib/types/chat';
import type { ChatItem } from '@/lib/agent.response.types';
import {
  EXECUTIVE_INTRO_UI_VERSION,
  buildWelcomeIntroFingerprint,
  extractIntakeEnvelope,
  normalizeWelcomeIntroPayload,
  readCachedWelcomeIntro,
  WELCOME_FINTECH_DEFAULT_BENEFIT,
  WELCOME_FINTECH_DEFAULT_BODY,
  WELCOME_FINTECH_DEFAULT_TITLE,
  type WelcomeIntroPayload,
  type WelcomeIntroSection,
} from '@financial-agent/shared';

export type { WelcomeIntroPayload, WelcomeIntroSection };
export { EXECUTIVE_INTRO_UI_VERSION };

export type WelcomeApiResponse = {
  message: string;
  intro?: WelcomeIntroPayload;
  cached?: boolean;
};

export const EXECUTIVE_INTRO_MARKER = 'informe inicial de diagnóstico';

/** Empty welcome shell, including legacy "—" placeholder from sheet sanitization. */
export function isWelcomeShellMessageContent(content: unknown): boolean {
  const raw = String(content ?? '').trim();
  if (!raw) return true;
  return raw === '—' || raw === '-' || raw === '–';
}

/** Transient agent failures that must not replace the executive welcome shell. */
export function isRecoverableChatErrorMessage(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    normalized.includes('no pude procesar tu mensaje') ||
    normalized.includes('no pude conectar con el servidor') ||
    normalized.includes('tuvimos un problema interno') ||
    normalized.includes('la solicitud tardó demasiado') ||
    normalized.includes('no se pudo completar la solicitud') ||
    normalized.includes('ocurrió un error inesperado')
  );
}

export function shouldSeedWelcomeMessage(threadId: string, items: ChatItem[]): boolean {
  const assistants = items.filter(
    (item): item is Extract<ChatItem, { type: 'message'; role: 'assistant' }> =>
      item.type === 'message' && item.role === 'assistant',
  );

  if (assistants.length === 0) return true;

  if (threadId === 'chat-1') {
    const hasWelcomeShell = assistants.some((item) => isWelcomeShellMessageContent(item.content));
    if (hasWelcomeShell) return false;
    if (assistants.every((item) => isRecoverableChatErrorMessage(String(item.content ?? '')))) {
      return true;
    }
    return (
      assistants.length === 1 &&
      isRecoverableChatErrorMessage(String(assistants[0]?.content ?? ''))
    );
  }

  return false;
}

export function repairChat1WelcomeItems(items: ChatItem[]): ChatItem[] {
  const withoutRecoverableErrors = items.filter((item) => {
    if (item.type !== 'message' || item.role !== 'assistant') return true;
    return !isRecoverableChatErrorMessage(String(item.content ?? ''));
  });

  const hasWelcomeShell = withoutRecoverableErrors.some(
    (item) =>
      item.type === 'message' &&
      item.role === 'assistant' &&
      isWelcomeShellMessageContent(item.content),
  );
  if (hasWelcomeShell) return withoutRecoverableErrors;

  if (!shouldSeedWelcomeMessage('chat-1', items)) return items;

  return [buildWelcomeChatItem({}) as ChatItem, ...withoutRecoverableErrors];
}

export function normalizeWelcomeShellContent(content: unknown): string {
  return isWelcomeShellMessageContent(content) ? '' : String(content ?? '');
}

export function normalizeChat1WelcomeShellItems(items: ChatItem[]): ChatItem[] {
  const firstAssistantIdx = items.findIndex(
    (it) => it.type === 'message' && it.role === 'assistant',
  );
  if (firstAssistantIdx !== 0) return items;
  const item = items[firstAssistantIdx];
  if (item.type !== 'message' || item.role !== 'assistant') return items;
  if (!isWelcomeShellMessageContent(item.content)) return items;
  const normalized = normalizeWelcomeShellContent(item.content);
  if (normalized === String(item.content ?? '')) return items;
  return items.map((it, idx) =>
    idx === firstAssistantIdx && it.type === 'message' ? { ...it, content: normalized } : it,
  );
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

function buildDeterministicSignals(intake: Record<string, unknown>): string[] {
  const signals: string[] = [];
  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const stress = typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;

  if (incomeBand) signals.push(`Tramo: ${incomeBand}`);
  if (city) signals.push(`Base: ${city}`);
  if (stress !== null && stress >= 7) signals.push('Estrés elevado');
  if (typeof intake.hasDebt === 'boolean' && intake.hasDebt) signals.push('Deuda activa');
  if (typeof intake.hasSavingsOrInvestments === 'boolean' && intake.hasSavingsOrInvestments) {
    signals.push('Con ahorro o inversión');
  }
  return signals.slice(0, 4);
}

export function buildFallbackWelcomeIntro(session: {
  name?: string | null;
  injectedIntake?: unknown;
}): WelcomeIntroPayload {
  const firstName = String(session?.name ?? '').split(' ')[0]?.trim() || 'Hola';
  const root =
    session?.injectedIntake && typeof session.injectedIntake === 'object'
      ? (session.injectedIntake as Record<string, unknown>)
      : null;
  const intake =
    root?.intake && typeof root.intake === 'object'
      ? (root.intake as Record<string, unknown>)
      : root ?? {};
  const llmSummary =
    root?.llmSummary && typeof root.llmSummary === 'object'
      ? (root.llmSummary as { summary?: string; highlights?: string[] })
      : null;

  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const read = buildDeterministicRead(intake);
  const hints = [
    city ? ` Estás operando desde ${city}.` : '',
    incomeBand ? ` Tu tramo de ingresos declarado es ${incomeBand}.` : '',
  ].join('');

  const highlights = Array.isArray(llmSummary?.highlights)
    ? llmSummary.highlights.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4)
    : [];

  return normalizeWelcomeIntroPayload({
    version: 2,
    uiVersion: EXECUTIVE_INTRO_UI_VERSION,
    firstName,
    headline: `${firstName}, partimos con una lectura seria de tu situación.`,
    wittyHook: buildFallbackWittyHook(firstName, intake),
    personalRead:
      typeof llmSummary?.summary === 'string' && llmSummary.summary.trim()
        ? llmSummary.summary.trim()
        : `${read}${hints}`.trim(),
    signals: highlights.length > 0 ? highlights : buildDeterministicSignals(intake),
    sections: {
      marco: {
        title: 'Marco de trabajo',
        body: 'Convertimos información financiera dispersa en un diagnóstico claro, verificable y accionable. Evidencia real primero; recomendaciones después.',
      },
      fintech: {
        title: WELCOME_FINTECH_DEFAULT_TITLE,
        body: WELCOME_FINTECH_DEFAULT_BODY,
        benefit: WELCOME_FINTECH_DEFAULT_BENEFIT,
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
        body: 'Un diagnóstico financiero personal con prioridades concretas y una ruta de decisión verificable.',
      },
    },
    closingQuestion: '¿Partimos por Productos y transacciones?',
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

export function buildExecutiveIntroBlock(intro: WelcomeIntroPayload): AgentBlock {
  return { type: 'executive_intro', intro };
}

export function hasExecutiveIntroBlock(item: ChatItem): boolean {
  if (item.type !== 'message' || item.role !== 'assistant') return false;
  return (item.agent_blocks ?? []).some((b) => b.type === 'executive_intro');
}

export function needsExecutiveIntroUpgrade(_item: ChatItem): boolean {
  return false;
}

export function getExecutiveIntroFromItem(item: ChatItem): WelcomeIntroPayload | null {
  if (item.type !== 'message' || item.role !== 'assistant') return null;
  const block = (item.agent_blocks ?? []).find((b) => b.type === 'executive_intro');
  if (!block || block.type !== 'executive_intro') return null;
  return block.intro;
}

export function buildWelcomeChatItem(params: {
  intro?: WelcomeIntroPayload;
  panelAction?: Extract<ChatItem, { type: 'message'; role: 'assistant' }>['panel_action'];
}): Extract<ChatItem, { type: 'message'; role: 'assistant' }> {
  void params.intro;
  return {
    type: 'message',
    role: 'assistant',
    content: '',
    mode: 'information',
    agent_blocks: [],
    suggested_replies: [],
    panel_action: params.panelAction,
  };
}

export function resolveWelcomeIntro(
  api: WelcomeApiResponse | null | undefined,
  session: { name?: string | null; injectedIntake?: unknown } | null | undefined,
): WelcomeIntroPayload {
  if (api?.intro?.version === 2) {
    const intro = normalizeWelcomeIntroPayload({
      ...api.intro,
      uiVersion: api.intro.uiVersion ?? EXECUTIVE_INTRO_UI_VERSION,
    });
    rememberHydratedWelcomeIntro(session, intro);
    return intro;
  }

  const cached = readHydratedWelcomeIntro(session);
  if (cached) return cached;

  return buildFallbackWelcomeIntro(session ?? {});
}

let clientWelcomeIntro: { fingerprint: string; intro: WelcomeIntroPayload } | null = null;

function resolveWelcomeIntroFingerprint(
  session: { injectedIntake?: unknown } | null | undefined,
): string | null {
  if (!session?.injectedIntake) return null;
  const { intake, llmSummary } = extractIntakeEnvelope(session.injectedIntake);
  return buildWelcomeIntroFingerprint(intake, llmSummary);
}

export function readHydratedWelcomeIntro(
  session: { name?: string | null; injectedIntake?: unknown } | null | undefined,
): WelcomeIntroPayload | null {
  const fromSession = readCachedWelcomeIntro(session);
  if (fromSession) {
    const fingerprint = resolveWelcomeIntroFingerprint(session);
    if (fingerprint) {
      clientWelcomeIntro = { fingerprint, intro: fromSession };
    }
    return fromSession;
  }

  const fingerprint = resolveWelcomeIntroFingerprint(session);
  if (fingerprint && clientWelcomeIntro?.fingerprint === fingerprint) {
    return clientWelcomeIntro.intro;
  }

  return null;
}

export function rememberHydratedWelcomeIntro(
  session: { name?: string | null; injectedIntake?: unknown } | null | undefined,
  intro: WelcomeIntroPayload,
): void {
  const fingerprint = resolveWelcomeIntroFingerprint(session);
  if (!fingerprint) return;
  clientWelcomeIntro = {
    fingerprint,
    intro: normalizeWelcomeIntroPayload(intro),
  };
}

export { readCachedWelcomeIntro };
