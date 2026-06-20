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
  thankYou: string;
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
    .replace(/\*\*Consulta:\*\*[^*]+/gi, '')
    .replace(/\*\*Respuesta:\*\*/gi, '')
    .replace(/###\s*Recorrido/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveChatTone(chatId: ProductChatId) {
  if (chatId === 'chat-2') {
    return {
      kicker: 'Cierre ejecutivo',
      title: 'Resumen del plan',
      subtitle: 'Sintesis del plan y validacion pendiente fuera de la app.',
      focus: 'decisiones, secuencia y trade-offs del plan',
    };
  }
  if (chatId === 'chat-3') {
    return {
      kicker: 'Cierre reflexivo',
      title: 'Resumen reflexivo',
      subtitle: 'Lectura de valores, tensiones y sentido personal.',
      focus: 'valores, tensiones y marco personal',
    };
  }
  return {
    kicker: 'Cierre del diagnostico',
    title: 'Resumen del chat',
    subtitle: 'Sintesis de lo conversado y accion concreta fuera de la app.',
    focus: 'diagnostico, evidencia y prioridades',
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
    const legacy = stripResumeLanguage(
      summary.sections
        .filter((section) => !/proximo paso|siguiente paso|siguiente pregunta/i.test(section.label))
        .map((section) => stripResumeLanguage(section.body))
        .filter(Boolean)
        .join(' '),
    );
    if (legacy.length > 0) {
      return legacy;
    }
  }

  return 'Se consolido una lectura final sobria, util para cerrar esta conversacion con claridad.';
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

export function resolveClosureSummaryThankYou(summary: ChatClosureSummary): string {
  const thankYou = normalizeContent(summary.thankYou);
  if (thankYou.length > 0) return thankYou;
  return 'Gracias por tu tiempo y confianza en este proceso.';
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

function extractInsightSentences(text: string): string[] {
  const sentences = String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);

  const prioritized = sentences.filter((sentence) =>
    /recomiendo|conviene|prior|importante|en resumen|en sintesis|clave|riesgo|deb(es|er)|podrias|sugiero|conclusion|conviene|alerta|vigila|valida|calendariza|trade-off|liquidez|horizonte/i.test(
      sentence,
    ),
  );

  const pool = prioritized.length > 0 ? prioritized : sentences;
  return pool.slice(0, 4);
}

function detectFocusTopics(corpus: string, chatId: ProductChatId): string {
  const topics: string[] = [];

  if (/presupuesto|gasto|ingreso|balance/.test(corpus)) topics.push('presupuesto');
  if (/deuda|credito|cuota|tarjeta/.test(corpus)) topics.push('deuda');
  if (/ahorro|apv|fondo|emergencia|meta/.test(corpus)) topics.push('ahorro');
  if (/cartola|movimiento|transaccion|banco|producto/.test(corpus)) topics.push('evidencia bancaria');
  if (/liquidez|plan|ejecut|prioridad|secuencia/.test(corpus)) topics.push('plan de accion');
  if (/valor|etica|proposito|sociedad|tension/.test(corpus)) topics.push('valores y contexto');
  if (/politic|actualidad|noticia|gobierno/.test(corpus) && topics.length === 0) {
    topics.push('consultas generales');
  }

  if (topics.length === 0) {
    return resolveChatTone(chatId).focus;
  }

  if (topics.length === 1) return topics[0];
  if (topics.length === 2) return `${topics[0]} y ${topics[1]}`;
  return `${topics.slice(0, -1).join(', ')} y ${topics[topics.length - 1]}`;
}

function buildNarrativeSummary(params: {
  chatId: ProductChatId;
  messages: ClosureMessage[];
}): string {
  const tone = resolveChatTone(params.chatId);
  const userMessages = params.messages.filter((message) => message.role === 'user');
  const assistantMessages = params.messages.filter((message) => message.role === 'assistant');
  const interactionCount = Math.max(userMessages.length, 1);
  const corpus = params.messages.map((message) => message.content).join(' ').toLowerCase();
  const focusTopics = detectFocusTopics(corpus, params.chatId);
  const lastUser = normalizeContent(userMessages[userMessages.length - 1]?.content ?? '');
  const insights = assistantMessages
    .flatMap((message) => extractInsightSentences(message.content))
    .filter((sentence, index, list) => list.indexOf(sentence) === index)
    .slice(0, 3);

  const paragraphs: string[] = [];

  paragraphs.push(
    `Este cierre resume ${interactionCount} interaccion${
      interactionCount === 1 ? '' : 'es'
    } centradas en ${focusTopics}. No repite el chat palabra por palabra: condensa lo esencial para que cierres con claridad.`,
  );

  if (insights.length > 0) {
    paragraphs.push(insights.join(' '));
  } else {
    const fallback = normalizeContent(assistantMessages[assistantMessages.length - 1]?.content ?? '');
    paragraphs.push(
      truncateText(
        fallback,
        520,
      ) ||
        'La conversacion dejo una lectura sobria y accionable, alineada con tu contexto y sin prometer resultados fuera de lugar.',
    );
  }

  if (lastUser.length > 0) {
    paragraphs.push(
      `Al cerrar, tu ultimo foco fue "${truncateText(lastUser, 110)}". Esa linea orienta el proximo paso fuera de esta sesion.`,
    );
  } else {
    paragraphs.push(
      `El hilo convergio en ${tone.focus}; usa ese foco como brujula para lo que hagas despues, fuera de la app.`,
    );
  }

  return paragraphs.join('\n\n');
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
    return 'Fuera de la app, deja por escrito una pregunta abierta sobre tu relacion con el dinero y revisala en un momento de calma.';
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
    return `Fuera de la app, convierte tu ultima inquietud ("${truncateText(lastUser, 96)}") en una accion concreta con fecha en tu calendario o bloc de notas.`;
  }

  return 'Fuera de la app, guarda este resumen en PDF y ejecuta una sola accion concreta esta semana, con monto y fecha si aplica.';
}

function buildThankYou(chatId: ProductChatId): string {
  if (chatId === 'chat-2') {
    return 'Gracias por cerrar este plan con rigor. Lleva el PDF como registro y ejecuta una decision concreta esta semana.';
  }
  if (chatId === 'chat-3') {
    return 'Gracias por sostener esta conversacion con honestidad. Quédate con la pregunta que mas te movio y hazla tuya fuera de aqui.';
  }
  return 'Gracias por tu tiempo y confianza en este espacio. Este cierre queda archivado para ti; sigue con el proximo paso en tu mundo real.';
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
  const body = buildNarrativeSummary({
    chatId: params.chatId,
    messages,
  });
  const nextStep = buildNextStep({
    chatId: params.chatId,
    messages,
    lastAssistantText,
  });
  const thankYou = buildThankYou(params.chatId);
  const closed = Number(params.turnsRemaining ?? 0) <= 0;

  return {
    kicker: tone.kicker,
    title: tone.title,
    subtitle: tone.subtitle,
    body,
    nextStep,
    thankYou,
    footer: closed
      ? 'Chat cerrado · puedes exportar este resumen en PDF.'
      : 'Cierre en curso · prepara tu accion fuera de la app.',
  };
}
