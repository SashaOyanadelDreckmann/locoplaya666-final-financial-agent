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

function resolveChatTone(chatId: ProductChatId) {
  if (chatId === 'chat-2') {
    return {
      kicker: 'Cierre ejecutivo',
      title: 'Plan de accion cerrado',
      subtitle: 'Sintesis senior del plan, trade-offs y siguiente validacion.',
      criterion:
        'Prioriza liquidez, horizonte y trade-offs claros antes de abrir nuevas decisiones.',
    };
  }
  if (chatId === 'chat-3') {
    return {
      kicker: 'Cierre reflexivo',
      title: 'Lectura social consolidada',
      subtitle: 'Resumen sobrio de la tension entre dinero, valores y contexto.',
      criterion:
        'La pregunta central no es solo cuanto cuesta, sino que valores sostiene cada decision.',
    };
  }
  return {
    kicker: 'Cierre del diagnostico',
    title: 'Chat general cerrado',
    subtitle: 'Resumen util y listo para retomar cuando quieras.',
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
    return summary.sections
      .map((section) => `### ${section.label}\n\n${section.body}`)
      .join('\n\n')
      .concat(summary.footer ? `\n\n${summary.footer}` : '');
  }

  return summary.footer ?? '';
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

function buildLongClosureBody(params: {
  chatId: ProductChatId;
  messages: ClosureMessage[];
  turnsRemaining?: number;
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
      '\n\n### Sintesis de cierre\n\nSe respondio con una sintesis cerrada y una ruta accionable.',
    );
  }

  const finalLabel =
    Number(params.turnsRemaining ?? 0) <= 0 ? 'Chat cerrado' : 'Cierre en curso';
  parts.push(
    `\n\n${finalLabel}. Gracias por la colaboracion; si vuelves, retoma desde este punto.`,
  );

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
  const body = buildLongClosureBody({
    chatId: params.chatId,
    messages,
    turnsRemaining: params.turnsRemaining,
  });

  return {
    kicker: tone.kicker,
    title: tone.title,
    subtitle: tone.subtitle,
    body,
    footer:
      Number(params.turnsRemaining ?? 0) <= 0
        ? 'Resumen preparado para consulta rapida.'
        : 'Resumen preparado para cerrar con una ultima respuesta.',
  };
}
