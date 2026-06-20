import type { ProductChatId } from './chat-lifecycle.constants';

export type ChatClosureSummarySection = {
  label: string;
  body: string;
};

export type ClosureMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatClosureSummary = {
  kicker: string;
  title: string;
  subtitle: string;
  body: string;
  nextStep: string;
  /** @deprecated Legacy carousel sections; kept for persisted sheets. */
  sections?: ChatClosureSummarySection[];
  footer: string;
};

function normalizeContent(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function stripResumeLanguage(value: string): string {
  return value
    .replace(/si vuelves, retoma desde este punto\.?/gi, '')
    .replace(/listo para retomar cuando quieras\.?/gi, '')
    .replace(/puedes retomar[^.!?]*[.!?]?/gi, '')
    .replace(/retoma desde este punto\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveChatTone(chatId: ProductChatId) {
  if (chatId === 'chat-2') {
    return {
      kicker: 'Cierre ejecutivo',
      title: 'Resumen del plan de accion',
      subtitle: 'Sintesis del plan, trade-offs y validacion pendiente fuera de la app.',
      criterion:
        'Prioriza liquidez, horizonte y trade-offs claros antes de abrir nuevas decisiones.',
    };
  }
  if (chatId === 'chat-3') {
    return {
      kicker: 'Cierre reflexivo',
      title: 'Resumen de conciencia social',
      subtitle: 'Lectura de la tension entre dinero, valores y contexto.',
      criterion:
        'La pregunta central no es solo cuanto cuesta, sino que valores sostiene cada decision.',
    };
  }
  return {
    kicker: 'Cierre del diagnostico',
    title: 'Resumen del chat general',
    subtitle: 'Sintesis de lo conversado y accion concreta fuera de la app.',
    criterion:
      'Primero evidencia real, luego presupuesto y finalmente prioridad: no cierres temas con caja fragil.',
  };
}

export function extractClosureMessages(
  items: Array<{ type?: string; role?: string; content?: unknown }>,
): ClosureMessage[] {
  return items
    .filter(
      (item) =>
        item.type === 'message' && (item.role === 'user' || item.role === 'assistant'),
    )
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: String(item.content ?? ''),
    }))
    .filter((item) => normalizeContent(item.content).length > 0);
}

export function extractClosureMessagesFromTurns(
  turns: Array<{ userMessage?: string | null; assistantMessage?: string | null }>,
): ClosureMessage[] {
  const out: ClosureMessage[] = [];
  for (const turn of turns) {
    const user = normalizeContent(turn.userMessage ?? '');
    const assistant = normalizeContent(turn.assistantMessage ?? '');
    if (user) out.push({ role: 'user', content: user });
    if (assistant) out.push({ role: 'assistant', content: assistant });
  }
  return out;
}

export function resolveClosureSummaryBody(summary: ChatClosureSummary): string {
  const body = normalizeContent(summary.body);
  if (body.length > 0) return summary.body;

  if (Array.isArray(summary.sections) && summary.sections.length > 0) {
    return stripResumeLanguage(
      summary.sections
        .filter((section) => !/proximo paso|siguiente paso|siguiente pregunta/i.test(section.label))
        .map((section) => `### ${section.label}\n\n${stripResumeLanguage(section.body)}`)
        .join('\n\n'),
    );
  }

  return '';
}

export function resolveClosureSummaryNextStep(summary: ChatClosureSummary): string {
  const nextStep = normalizeContent(summary.nextStep);
  if (nextStep.length > 0) return stripResumeLanguage(nextStep);

  if (Array.isArray(summary.sections)) {
    const legacy = summary.sections.find((section) =>
      /proximo paso|siguiente paso|siguiente pregunta/i.test(section.label),
    );
    if (legacy?.body) {
      return stripResumeLanguage(legacy.body);
    }
  }

  return 'Fuera de la app, guarda este resumen en PDF y ejecuta una sola accion concreta esta semana, con monto y fecha si aplica.';
}

function buildFallbackMessages(params: {
  userMessage?: string;
  assistantMessage?: string;
}): ClosureMessage[] {
  const out: ClosureMessage[] = [];
  const user = normalizeContent(params.userMessage ?? '');
  const assistant = normalizeContent(params.assistantMessage ?? '');
  if (user) out.push({ role: 'user', content: user });
  if (assistant) out.push({ role: 'assistant', content: assistant });
  return out;
}

function extractActionCandidates(text: string): string[] {
  const lines = String(text ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: string[] = [];

  for (const line of lines) {
    const bullet = line.replace(/^[-*•]\s+|^\d+[.)]\s+/, '').trim();
    if (bullet !== line && bullet.length >= 12) {
      out.push(bullet);
      continue;
    }
    if (/^(te recomiendo|siguiente paso|proximo paso|accion|prioriza|empieza|valida|revisa|calendariza)/i.test(line)) {
      out.push(line);
    }
  }

  return out;
}

function buildNextStep(params: {
  chatId: ProductChatId;
  messages: ClosureMessage[];
  lastAssistantText: string;
}): string {
  const corpus = params.messages.map((message) => message.content).join(' ').toLowerCase();
  const lastUser =
    [...params.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const actionCandidates = extractActionCandidates(params.lastAssistantText);

  if (actionCandidates.length > 0) {
    return `Fuera de la app, empieza por esto: ${truncateText(actionCandidates[0], 420)}`;
  }

  if (params.chatId === 'chat-2') {
    if (/liquidez|efectivo|caja|colchon/.test(corpus)) {
      return 'Fuera de la app, calendariza una revision semanal de liquidez y anota desviaciones en tu propia hoja o spreadsheet.';
    }
    if (/apv|inversion|fondo|renta variable|diversifica/.test(corpus)) {
      return 'Fuera de la app, elige una sola hipotesis del plan, ponle monto maximo y fecha de revision en tu agenda personal.';
    }
    return 'Fuera de la app, selecciona una accion del plan, asignale responsable y fecha, y registrala donde gestiones tus finanzas personales.';
  }

  if (params.chatId === 'chat-3') {
    if (/valor|etica|familia|comunidad|proposito/.test(corpus)) {
      return 'Fuera de la app, escribe una nota personal sobre que valor quieres sostener la proxima vez que enfrentes una decision con plata.';
    }
    return 'Fuera de la app, deja por escrito una pregunta abierta sobre tu relacion con el dinero y revisala en un momento de calma, sin volver a este chat.';
  }

  if (/presupuesto|gasto|ingreso|balance/.test(corpus)) {
    return 'Fuera de la app, revisa tu presupuesto real del mes y ajusta una categoria concreta segun lo conversado.';
  }
  if (/deuda|credito|cuota|tarjeta/.test(corpus)) {
    return 'Fuera de la app, lista tus deudas con tasa y vencimiento, y define el proximo pago extra que puedas sostener.';
  }
  if (/ahorro|apv|fondo|emergencia|meta/.test(corpus)) {
    return 'Fuera de la app, programa un aporte automatico modesto hacia tu meta de ahorro o fondo de emergencia.';
  }
  if (/cartola|movimiento|transaccion|banco/.test(corpus)) {
    return 'Fuera de la app, cruza un movimiento real de tu cartola con una categoria del mes y corrige una sola desviacion.';
  }

  if (normalizeContent(lastUser).length > 0) {
    return `Fuera de la app, convierte tu ultima consulta ("${truncateText(lastUser, 96)}") en una accion concreta con fecha en tu calendario o bloc de notas.`;
  }

  return 'Fuera de la app, guarda este resumen en PDF y ejecuta una sola accion concreta esta semana, con monto y fecha si aplica.';
}

function buildLongClosureBody(params: {
  chatId: ProductChatId;
  messages: ClosureMessage[];
}): string {
  const tone = resolveChatTone(params.chatId);
  const userMessages = params.messages.filter((message) => message.role === 'user');
  const assistantMessages = params.messages.filter((message) => message.role === 'assistant');
  const interactionCount = userMessages.length;
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const lastAssistantText = lastAssistant ? normalizeContent(lastAssistant.content) : '';

  const exchanges: string[] = [];
  let pendingUser: string | null = null;

  for (const message of params.messages) {
    if (message.role === 'user') {
      pendingUser = normalizeContent(message.content);
      continue;
    }

    const assistantText = normalizeContent(message.content);
    if (!assistantText) continue;

    const userLine = pendingUser
      ? `**Consulta:** ${truncateText(pendingUser, 320)}\n\n`
      : '';
    pendingUser = null;

    exchanges.push(
      `${userLine}**Respuesta:** ${
        assistantText.length > 1600 ? truncateText(assistantText, 1600) : assistantText
      }`,
    );
  }

  if (pendingUser) {
    exchanges.push(`**Consulta pendiente:** ${truncateText(pendingUser, 320)}`);
  }

  const parts: string[] = [];
  parts.push(
    `Esta conversacion recorrio ${Math.max(interactionCount, 1)} interaccion${
      interactionCount === 1 ? '' : 'es'
    }. ${tone.criterion}`,
  );

  if (exchanges.length > 1) {
    parts.push('\n\n### Recorrido\n\n' + exchanges.slice(0, -1).join('\n\n---\n\n'));
  }

  if (lastAssistantText) {
    parts.push(`\n\n### Sintesis de cierre\n\n${lastAssistantText.slice(0, 6000)}`);
  } else if (exchanges.length > 0) {
    parts.push(`\n\n### Sintesis de cierre\n\n${exchanges[exchanges.length - 1]}`);
  } else {
    parts.push(
      '\n\n### Sintesis de cierre\n\nSe consolido una lectura final con la evidencia disponible en el chat.',
    );
  }

  return parts.join('');
}

export function buildChatClosureSummary(params: {
  chatId: ProductChatId;
  userMessage?: string;
  assistantMessage?: string;
  messages?: ClosureMessage[];
  turnsRemaining?: number;
}): ChatClosureSummary {
  const tone = resolveChatTone(params.chatId);
  const messages =
    params.messages && params.messages.length > 0
      ? params.messages
      : buildFallbackMessages(params);
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const lastAssistantText = assistantMessages[assistantMessages.length - 1]
    ? normalizeContent(assistantMessages[assistantMessages.length - 1].content)
    : normalizeContent(params.assistantMessage ?? '');
  const body = buildLongClosureBody({
    chatId: params.chatId,
    messages,
  });
  const nextStep = buildNextStep({
    chatId: params.chatId,
    messages,
    lastAssistantText,
  });
  const closed = Number(params.turnsRemaining ?? 0) <= 0;

  return {
    kicker: tone.kicker,
    title: tone.title,
    subtitle: tone.subtitle,
    body,
    nextStep,
    footer: closed
      ? 'Este chat ya no admite nuevas interacciones. Conserva el PDF como registro personal.'
      : 'Cierre en curso: usa el proximo paso como accion fuera de la app.',
  };
}
