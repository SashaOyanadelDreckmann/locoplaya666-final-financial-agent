import type { ProductChatId } from './chat-lifecycle.constants';

export type ChatClosureSummarySection = {
  label: string;
  body: string;
};

export type ChatClosureSummary = {
  kicker: string;
  title: string;
  subtitle: string;
  sections: ChatClosureSummarySection[];
  footer: string;
};

function compactText(value: unknown, max = 120): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildSnippet(value: unknown, fallback: string, max = 96): string {
  const text = compactText(value, max);
  return text.length > 0 ? text : fallback;
}

function resolveChatTone(chatId: ProductChatId) {
  if (chatId === 'chat-2') {
    return {
      kicker: 'Cierre ejecutivo',
      title: 'Plan de accion cerrado',
      subtitle: 'Sintesis senior del plan, trade-offs y siguiente validacion.',
      labels: ['Tesis', 'Decisión', 'Riesgo', 'Siguiente paso'] as const,
      criterion:
        'Prioriza liquidez, horizonte y trade-offs claros antes de abrir nuevas decisiones.',
    };
  }
  if (chatId === 'chat-3') {
    return {
      kicker: 'Cierre reflexivo',
      title: 'Lectura social consolidada',
      subtitle: 'Resumen sobrio de la tension entre dinero, valores y contexto.',
      labels: ['Lectura', 'Tensión', 'Marco', 'Siguiente pregunta'] as const,
      criterion:
        'La pregunta central no es solo cuanto cuesta, sino que valores sostiene cada decision.',
    };
  }
  return {
    kicker: 'Cierre del diagnostico',
    title: 'Chat general cerrado',
    subtitle: 'Resumen corto, util y listo para retomar cuando quieras.',
    labels: ['Diagnóstico', 'Señal clave', 'Riesgo', 'Próximo paso'] as const,
    criterion:
      'Primero evidencia real, luego presupuesto y finalmente prioridad: no cierres temas con caja fragil.',
  };
}

export function buildChatClosureSummary(params: {
  chatId: ProductChatId;
  userMessage?: string;
  assistantMessage?: string;
  turnsRemaining?: number;
}): ChatClosureSummary {
  const tone = resolveChatTone(params.chatId);
  const userSnippet = buildSnippet(params.userMessage, 'Último pedido: continuar con foco y sin perder el hilo.');
  const assistantSnippet = buildSnippet(
    params.assistantMessage,
    'Se respondió con una síntesis cerrada y una ruta accionable.',
    116,
  );
  const finalLabel = Number(params.turnsRemaining ?? 0) <= 0 ? 'Chat cerrado' : 'Cierre en curso';

  return {
    kicker: tone.kicker,
    title: tone.title,
    subtitle: tone.subtitle,
    sections: [
      {
        label: tone.labels[0],
        body: `Último pedido: ${userSnippet}.`,
      },
      {
        label: tone.labels[1],
        body: `Lo que quedó más visible: ${assistantSnippet}.`,
      },
      {
        label: tone.labels[2],
        body: tone.criterion,
      },
      {
        label: tone.labels[3],
        body: `${finalLabel}. Gracias por la colaboración; si vuelves, retoma desde este punto.`,
      },
    ],
    footer:
      Number(params.turnsRemaining ?? 0) <= 0
        ? 'Resumen preparado para consulta rápida.'
        : 'Resumen preparado para cerrar con una última respuesta.',
  };
}
