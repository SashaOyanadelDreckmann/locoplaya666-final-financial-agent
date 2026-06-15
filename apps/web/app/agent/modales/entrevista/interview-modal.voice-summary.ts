import type { InterviewVoiceSummaryEntry } from './interview-modal.context';

export function normalizeSummaryText(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildSummaryInstructions(
  kind: 'minute' | 'final',
  options: {
    callSeconds: number;
    minute?: number;
  },
) {
  const targetMinute =
    typeof options.minute === 'number' ? options.minute : Math.max(1, Math.ceil(options.callSeconds / 60));
  return [
    'Eres un sintetizador ejecutivo de una entrevista financiera en tiempo real.',
    'No transcribas literalmente. Resume el contenido con precisión, sin inventar datos ni montos no mencionados.',
    'Solo incluye hechos presentes en intake, presupuesto o productos ya cargados; si no hay evidencia, dilo explícitamente.',
    'Devuelve SOLO JSON válido, sin markdown ni explicación adicional.',
    'Esquema requerido:',
    '{"minute":number,"summary":"string","keyFindings":["string"],"confidence":"high|medium|low","nextFocus":"string"}',
    'Reglas:',
    '- summary: 2 a 4 frases cortas, chileno profesional, foco ejecutivo.',
    '- keyFindings: 2 a 5 bullets en formato string.',
    '- nextFocus: la mejor próxima línea de profundización.',
    '- PROHIBIDO modismos en ESTE JSON únicamente (wea, weón, bacán, la raja, la zorra, po, cachai, etc.): texto formal y sobrio.',
    '- Tras entregar el JSON, la conversación por voz sigue con modismos chilenos naturales.',
    kind === 'minute'
      ? `Objeto para síntesis intermedia del minuto ${targetMinute}.`
      : 'Objeto para síntesis final de la llamada completa.',
    'Contexto activo: entrevista financiera ejecutiva por voz con intake, presupuesto y productos ya cargados.',
  ].join('\n');
}

export function parseSummaryPayload(
  payload: Record<string, unknown>,
  fallbackMinute: number,
): InterviewVoiceSummaryEntry | null {
  const text =
    typeof payload.text === 'string'
      ? payload.text
      : typeof payload.delta === 'string'
        ? payload.delta
        : typeof payload.content === 'string'
          ? payload.content
          : '';
  const trimmed = normalizeSummaryText(text);
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const summary = normalizeSummaryText(parsed.summary ?? parsed.summaryText ?? trimmed);
    const keyFindings = Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.map((item) => normalizeSummaryText(item)).filter(Boolean).slice(0, 5)
      : [];
    const minute = Number.isFinite(Number(parsed.minute)) ? Math.max(1, Math.floor(Number(parsed.minute))) : fallbackMinute;
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : undefined;
    return {
      minute,
      summary,
      keyFindings,
      confidence,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      minute: fallbackMinute,
      summary: trimmed,
      keyFindings: [],
      confidence: undefined,
      createdAt: new Date().toISOString(),
    };
  }
}

export function formatInterviewClock(totalSeconds: number | null) {
  if (totalSeconds === null) return '—';
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

export function waitMs(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
