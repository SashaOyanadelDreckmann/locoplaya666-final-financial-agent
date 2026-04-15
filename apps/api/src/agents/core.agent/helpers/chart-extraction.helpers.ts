/**
 * chart-extraction.helpers.ts
 * Extract charts and visual blocks from tool outputs
 */

import type { AgentBlock, ChartBlock, TableBlock, QuestionnaireBlock } from '../chat.types';

type JsonRecord = Record<string, unknown>;

function toChartKind(kind: unknown): 'line' | 'bar' | 'area' {
  if (kind === 'line' || kind === 'bar' || kind === 'area') return kind;
  return 'line';
}

function isObject(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeChartPayload(payload: unknown): ChartBlock | null {
  if (!isObject(payload)) return null;

  // Canonical shape
  if (
    typeof payload.title === 'string' &&
    typeof payload.xKey === 'string' &&
    typeof payload.yKey === 'string' &&
    Array.isArray(payload.data)
  ) {
    return {
      type: 'chart',
      chart: {
        kind: toChartKind(payload.kind),
        title: payload.title,
        subtitle: typeof payload.subtitle === 'string' ? payload.subtitle : undefined,
        xKey: payload.xKey,
        yKey: payload.yKey,
        data: payload.data as Array<Record<string, string | number>>,
        format:
          payload.format === 'currency' || payload.format === 'percentage' || payload.format === 'number'
            ? payload.format
            : undefined,
        currency: typeof payload.currency === 'string' ? payload.currency : undefined,
      },
    };
  }

  // Legacy shape with labels + values
  if (Array.isArray(payload.labels) && Array.isArray(payload.values)) {
    const labels = payload.labels.map((v) => String(v));
    const values = payload.values.map((v) => Number(v ?? 0));
    return {
      type: 'chart',
      chart: {
        kind: toChartKind(payload.type),
        title: typeof payload.title === 'string' ? payload.title : 'Grafico',
        subtitle: typeof payload.subtitle === 'string' ? payload.subtitle : undefined,
        xKey: 'label',
        yKey: 'value',
        data: labels.map((label, i) => ({ label, value: values[i] ?? 0 })),
        format: 'number',
      },
    };
  }

  return null;
}

function chartBlocksFromSeries(series: unknown): ChartBlock[] {
  if (!Array.isArray(series) || series.length === 0) return [];
  if (!series.every((row) => isObject(row))) return [];

  const first = series[0] as JsonRecord;
  const keys = Object.keys(first);
  if (!keys.length) return [];

  const xKey = keys.find((k) => typeof first[k] === 'string' || typeof first[k] === 'number');
  if (!xKey) return [];

  const yKeys = keys.filter(
    (k) => k !== xKey && typeof first[k] === 'number'
  );
  if (!yKeys.length) return [];

  // Build one chart per numeric series to stay compatible with single yKey schema.
  return yKeys.map((yKey) => ({
    type: 'chart',
    chart: {
      kind: 'line',
      title: `Serie: ${yKey.replaceAll('_', ' ')}`,
      xKey,
      yKey,
      data: series as Array<Record<string, string | number>>,
      format: 'number',
    },
  }));
}

function extractChartsFromObject(source: unknown): ChartBlock[] {
  const blocks: ChartBlock[] = [];
  if (!isObject(source)) return blocks;

  const canonical = normalizeChartPayload(source);
  if (canonical) blocks.push(canonical);

  if (Array.isArray(source.chart_series)) {
    blocks.push(...chartBlocksFromSeries(source.chart_series));
  }

  for (const value of Object.values(source)) {
    if (isObject(value)) {
      blocks.push(...extractChartsFromObject(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isObject(item)) blocks.push(...extractChartsFromObject(item));
      }
    }
  }

  return blocks;
}

function normalizeQuestionnairePayload(payload: unknown): QuestionnaireBlock | null {
  if (!isObject(payload)) return null;
  if (typeof payload.id !== 'string' || !Array.isArray(payload.questions)) return null;

  const questions = payload.questions
    .map((q) => {
      if (!isObject(q) || typeof q.id !== 'string' || typeof q.question !== 'string') return null;
      const rawChoices = Array.isArray(q.choices) ? q.choices.slice(0, 4) : [];
      const choices = rawChoices.map((c) => String(c)).filter(Boolean);
      return {
        id: q.id,
        question: q.question,
        choices,
        allow_free_text: q.allow_free_text !== false,
        free_text_placeholder:
          typeof q.free_text_placeholder === 'string' ? q.free_text_placeholder : undefined,
        required: q.required !== false,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .slice(0, 3);

  if (questions.length === 0) return null;

  return {
    type: 'questionnaire',
    questionnaire: {
      id: payload.id,
      title: typeof payload.title === 'string' ? payload.title : undefined,
      submit_label:
        typeof payload.submit_label === 'string' ? payload.submit_label : undefined,
      questions,
    },
  };
}

function compactQuestionText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function inferLikelyIncomeChoices(intake: JsonRecord | null): string[] | null {
  if (!intake) return null;
  const exact = typeof intake.exactMonthlyIncome === 'number' ? intake.exactMonthlyIncome : null;
  if (exact !== null) {
    if (exact < 800_000) return ['< 800.000 CLP', '800.000-1.500.000 CLP', 'Ingreso variable', 'Prefiero otro monto'];
    if (exact < 1_500_000) return ['800.000-1.500.000 CLP', '1.500.000-2.500.000 CLP', '600.000-800.000 CLP', 'Prefiero otro monto'];
    return ['> 1.500.000 CLP', '1.000.000-1.500.000 CLP', 'Ingreso variable', 'Prefiero otro monto'];
  }
  const band = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  if (!band) return null;
  const map: Record<string, string[]> = {
    no_income: ['Sin ingresos fijos', 'Ingreso variable', 'Apoyo familiar', 'Prefiero explicar'],
    '<300k': ['< 300.000 CLP', '300.000-600.000 CLP', 'Ingreso variable', 'Prefiero explicar'],
    '300k-600k': ['300.000-600.000 CLP', '600.000-1.000.000 CLP', '< 300.000 CLP', 'Prefiero explicar'],
    '600k-1M': ['600.000-1.000.000 CLP', '1.000.000-1.500.000 CLP', '300.000-600.000 CLP', 'Prefiero explicar'],
    '1M-2M': ['1.000.000-2.000.000 CLP', '2.000.000-4.000.000 CLP', '600.000-1.000.000 CLP', 'Prefiero explicar'],
    '2M-4M': ['2.000.000-4.000.000 CLP', '> 4.000.000 CLP', '1.000.000-2.000.000 CLP', 'Prefiero explicar'],
    '>4M': ['> 4.000.000 CLP', '2.000.000-4.000.000 CLP', 'Ingreso variable', 'Prefiero explicar'],
    variable: ['Ingreso variable', '< 800.000 CLP', '800.000-1.500.000 CLP', 'Prefiero explicar'],
  };
  return map[band] ?? null;
}

function inferLikelyDebtChoices(intake: JsonRecord | null): string[] | null {
  if (!intake) return null;
  const hasDebt = typeof intake.hasDebt === 'boolean' ? intake.hasDebt : null;
  if (hasDebt === false) {
    return ['No tengo deudas activas', 'Solo tarjeta de crédito', 'Crédito de consumo', 'Prefiero explicar'];
  }

  const products = Array.isArray(intake.financialProducts) ? intake.financialProducts : [];
  const labels = products
    .map((p) => (isObject(p) && typeof p.product === 'string' ? p.product.toLowerCase() : ''))
    .filter(Boolean);
  const inferred: string[] = [];
  if (labels.some((p) => /tarjeta|credit/.test(p))) inferred.push('Tarjeta de crédito');
  if (labels.some((p) => /consumo|personal/.test(p))) inferred.push('Crédito de consumo');
  if (labels.some((p) => /hipotec/.test(p))) inferred.push('Crédito hipotecario');
  if (labels.some((p) => /auto|automot/.test(p))) inferred.push('Crédito automotriz');
  if (inferred.length === 0) return null;
  while (inferred.length < 4) inferred.push(['Línea de crédito', 'CAE', 'Otra deuda', 'Prefiero explicar'][inferred.length - 1] ?? 'Prefiero explicar');
  return inferred.slice(0, 4);
}

function inferLikelySavingsChoices(intake: JsonRecord | null): string[] | null {
  if (!intake) return null;
  const has = typeof intake.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
  if (has === false) return ['No ahorro hoy', 'Ahorro ocasional', 'Quiero empezar este mes', 'Prefiero explicar'];

  const exact = typeof intake.exactSavingsAmount === 'number' ? intake.exactSavingsAmount : null;
  if (exact !== null) {
    if (exact < 300_000) return ['< 300.000 CLP', '300.000-1.000.000 CLP', 'Ahorro mensual pequeño', 'Prefiero explicar'];
    if (exact < 1_000_000) return ['300.000-1.000.000 CLP', '1.000.000-3.000.000 CLP', '< 300.000 CLP', 'Prefiero explicar'];
    return ['> 1.000.000 CLP', 'Ahorro automático mensual', 'Inversión periódica', 'Prefiero explicar'];
  }
  return null;
}

function inferChoicesFromQuestion(question: string, context?: { intake?: JsonRecord | null }): string[] {
  const q = question.toLowerCase();
  const intake = context?.intake ?? null;

  const withFallback = (choices: string[], fallback: string[]): string[] => {
    const normalized = Array.from(
      new Set([...choices, ...fallback].map((c) => c.trim()).filter(Boolean))
    );
    return normalized.slice(0, 4);
  };

  if (/\bmejor(ar|es)?\b|\boptimiz(ar|arlo)?\b|\bsubir\b|\bpotenciar\b/i.test(q)) {
    return withFallback(
      ['Sí, quiero optimizar al máximo', 'Solo un ajuste realista', 'Primero quiero ver impacto en números', 'No por ahora'],
      ['Bajo impacto', 'Impacto medio', 'Impacto alto', 'Prefiero explicar']
    );
  }

  if (/\bacercarte\b|\bnegoci(ar|ación)\b|\brenegoci(ar|ación)\b|\breducir tasa\b/i.test(q)) {
    return withFallback(
      ['Sí, tengo una oferta para negociar', 'Sí, pero necesito guion de negociación', 'Solo si baja la cuota mensual', 'No me siento listo aún'],
      ['Hoy mismo', 'Esta semana', 'Este mes', 'Prefiero explicar']
    );
  }

  if (/\bprioridad\b|\bqué prefieres\b|\bque prefieres\b|\bpor dónde empezamos\b|\bpor donde empezamos\b/i.test(q)) {
    return withFallback(
      ['Bajar deudas primero', 'Armar fondo de emergencia', 'Optimizar presupuesto mensual', 'Iniciar inversión gradual'],
      ['Rápido', 'Balanceado', 'Conservador', 'Prefiero explicar']
    );
  }

  if (/\bcu[aá]nto\b.*\bahorrar\b|\bahorro mensual\b|\bmeta mensual\b/i.test(q)) {
    return withFallback(
      ['5% de mi ingreso', '10% de mi ingreso', '15% de mi ingreso', '20% o más'],
      ['Monto fijo bajo', 'Monto fijo medio', 'Monto fijo alto', 'Prefiero explicar']
    );
  }

  if (/\btiempo\b|\bfrecuencia\b|\bcada mes\b|\bcada semana\b|\bcada quincena\b/i.test(q)) {
    return withFallback(
      ['Mensual', 'Quincenal', 'Semanal', 'Depende de mi flujo'],
      ['Corto plazo', 'Mediano plazo', 'Largo plazo', 'Prefiero explicar']
    );
  }

  if (/\bdeuda|deudas|crédito|credito|tarjeta|consumo|hipotec/i.test(q)) {
    return inferLikelyDebtChoices(intake) ?? ['Tarjeta de crédito', 'Crédito de consumo', 'Hipotecario', 'Línea de crédito'];
  }
  if (/\bingreso|sueldo|entra|ganas|mes\b/i.test(q)) {
    return inferLikelyIncomeChoices(intake) ?? ['< 800.000 CLP', '800.000-1.500.000 CLP', '> 1.500.000 CLP', 'Prefiero otro monto'];
  }
  if (/\bgasto|gastos|fijo|fijos\b/i.test(q)) {
    return ['Vivienda / arriendo', 'Alimentación', 'Transporte', 'Pago de deudas'];
  }
  if (/\bahorro|ahorras|ahorrar|meta\b/i.test(q)) {
    return inferLikelySavingsChoices(intake) ?? ['No ahorro', 'Ahorro irregular', 'Ahorro automático', 'Inversión mensual'];
  }
  if (/\bplazo|horizonte|meses|años|anos\b/i.test(q)) {
    return ['3-6 meses', '6-12 meses', '1-3 años', 'Más de 3 años'];
  }
  if (/\briesgo|volatil|ca[ií]da|perdida|p[eé]rdida\b/i.test(q)) {
    return ['Conservador', 'Balanceado', 'Agresivo', 'Prefiero explicar'];
  }

  return ['Opción más segura', 'Opción equilibrada', 'Opción agresiva', 'Prefiero explicarlo yo'];
}

export function inferQuestionnaireFromText(
  text: string,
  context?: {
    intake?: unknown;
    profile?: unknown;
    user_message?: string;
  }
): QuestionnaireBlock | null {
  if (!text) return null;

  const normalized = text.replace(/\r\n/g, '\n');
  const matches = normalized.match(/¿[^?\n]+[?]/g) ?? [];
  const uniqueQuestions = Array.from(
    new Set(matches.map((m) => compactQuestionText(m)))
  ).slice(0, 3);

  if (uniqueQuestions.length === 0) return null;

  const intake = isObject(context?.intake) ? context?.intake : null;

  const questions = uniqueQuestions.map((question, idx) => ({
    id: `q_${idx + 1}`,
    question,
    choices: inferChoicesFromQuestion(question, { intake }).slice(0, 4),
    allow_free_text: true,
    free_text_placeholder: 'Otro (escribe aquí)',
    required: true,
  }));

  return {
    type: 'questionnaire',
    questionnaire: {
      id: `auto-${Date.now()}`,
      title: 'Responde para avanzar',
      submit_label: 'Enviar respuestas',
      questions,
    },
  };
}

/**
 * Extract chart blocks from tool output text
 * Looks for patterns like <CHART>...data...</CHART>, <TABLE>...data...</TABLE>
 */
export function extractChartBlocksFromToolOutput(
  text: string,
  context?: any
): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  const pushIfUnique = (block: AgentBlock) => {
    const key = JSON.stringify(block);
    const exists = blocks.some((b) => JSON.stringify(b) === key);
    if (!exists) blocks.push(block);
  };

  // Match <CHART> blocks
  const chartRegex = /<CHART>([\s\S]*?)<\/CHART>/g;
  let match;
  while ((match = chartRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const block = normalizeChartPayload(data);
      if (block) pushIfUnique(block);
    } catch {
      // Invalid JSON in tag, skip
    }
  }

  // Match <TABLE> blocks
  const tableRegex = /<TABLE>(\{[\s\S]*?\})<\/TABLE>/g;
  while ((match = tableRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const block: TableBlock = {
        type: 'table',
        table: {
          title: data.title || 'Tabla',
          headers: data.headers || data.columns || [],
          rows: data.rows || [],
          note: data.note,
        },
      };
      pushIfUnique(block);
    } catch {
      // Invalid JSON in tag, skip
    }
  }

  // Match <QUESTIONNAIRE> blocks
  const questionnaireRegex = /<QUESTIONNAIRE>([\s\S]*?)<\/QUESTIONNAIRE>/g;
  while ((match = questionnaireRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const block = normalizeQuestionnairePayload(data);
      if (block) pushIfUnique(block);
    } catch {
      // Invalid JSON in tag, skip
    }
  }

  // Extract from raw JSON object payloads (tool outputs like chart_series)
  try {
    const parsed = JSON.parse(text);
    const extra = extractChartsFromObject(parsed);
    for (const block of extra) pushIfUnique(block);
  } catch {
    // Text may not be JSON; ignore
  }

  return blocks;
}

/**
 * Extract suggested replies from <SUGERENCIAS> tag
 */
export function extractSuggestedReplies(text: string): string[] {
  const match = text.match(/<SUGERENCIAS>\[([\s\S]*?)\]<\/SUGERENCIAS>/);
  if (!match) return [];

  try {
    const jsonStr = `[${match[1]}]`;
    return JSON.parse(jsonStr);
  } catch {
    // Try simpler parsing: split by comma + clean quotes
    const items = match[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    return items;
  }
}

/**
 * Parse panel action from text
 */
export function extractPanelAction(
  text: string
): { section?: string; message?: string } | undefined {
  const match = text.match(/<PANEL>\s*(\{[\s\S]*?\})\s*<\/PANEL>/);
  if (!match) return undefined;

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Remove all special tags from text
 */
export function cleanSpecialTags(text: string): string {
  return text
    .replace(/<CHART>[\s\S]*?<\/CHART>/g, '\n\n')
    .replace(/<TABLE>[\s\S]*?<\/TABLE>/g, '\n\n')
    .replace(/<QUESTIONNAIRE>[\s\S]*?<\/QUESTIONNAIRE>/g, '\n\n')
    .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/g, '\n\n')
    .replace(/<PANEL>[\s\S]*?<\/PANEL>/g, '\n\n')
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '\n\n')
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, '\n\n')
    .replace(/<parameter[\s\S]*?<\/parameter>/gi, '\n\n')
    .replace(/<\/?(function_calls|invoke|parameter)[^>]*>/gi, '\n')
    .replace(/<CONTEXT_SCORE>\d+<\/CONTEXT_SCORE>/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
