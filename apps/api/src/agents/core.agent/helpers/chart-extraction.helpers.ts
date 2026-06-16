/**
 * chart-extraction.helpers.ts
 * Extract charts and visual blocks from tool outputs
 */

import type { AgentBlock, ChartBlock, TableBlock, QuestionnaireBlock, TxChartBlock } from '../chat.types';
import type { BudgetTablePatch } from '@financial-agent/shared';
import {
  budgetRowsFromUiSnapshot,
  buildBudgetTablePatch,
  extractBudgetTableActionsFromTag,
  extractBudgetTablePatchFromToolOutputs,
  findAgentTableTagSpans,
  legacyBudgetUpdatesToActions,
  parseBudgetTableActionsJson,
  stripAgentTableTags,
} from '@financial-agent/shared';

type JsonRecord = Record<string, unknown>;

function toChartKind(kind: unknown): 'line' | 'bar' | 'area' {
  if (kind === 'line' || kind === 'bar' || kind === 'area') return kind;
  return 'line';
}

function isObject(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeTxChartBlock(payload: unknown): TxChartBlock | null {
  if (!isObject(payload)) return null;
  if (payload.type === 'tx_chart' && isObject(payload.tx_chart)) {
    const parsed = { type: 'tx_chart', tx_chart: payload.tx_chart };
    return parsed as TxChartBlock;
  }
  if (typeof payload.variant === 'string' && payload.variant in { cumulative_cashflow: 1, flow_bar: 1, category_bar: 1 }) {
    return { type: 'tx_chart', tx_chart: payload } as TxChartBlock;
  }
  return null;
}

function extractAgentBlocksFromObject(source: unknown): AgentBlock[] {
  if (!isObject(source)) return [];
  const blocks: AgentBlock[] = [];

  if (Array.isArray(source.agent_blocks)) {
    for (const block of source.agent_blocks) {
      if (!isObject(block)) continue;
      if (block.type === 'tx_chart') {
        const txBlock = normalizeTxChartBlock(block);
        if (txBlock) blocks.push(txBlock);
        continue;
      }
      const chart = normalizeChartPayload(block.type === 'chart' ? block.chart : block);
      if (chart) {
        blocks.push(chart);
        continue;
      }
      if (block.type === 'table' && isObject(block.table)) {
        blocks.push(block as TableBlock);
        continue;
      }
      if (block.type === 'questionnaire' && isObject(block.questionnaire)) {
        const questionnaire = normalizeQuestionnairePayload(block.questionnaire);
        if (questionnaire) blocks.push(questionnaire);
      }
    }
  }

  const txChart = normalizeTxChartBlock(source);
  if (txChart) blocks.push(txChart);

  return blocks;
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
      title: `Serie: ${yKey.replace(/_/g, ' ')}`,
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

  return null;
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

  if (
    /\b(dónde|donde|a dónde|adonde)\b/i.test(q) ||
    /\bobjetivo\b.*\b(concreto|inversión|inversion)\b/i.test(q)
  ) {
    return ['Opción más segura', 'Opción equilibrada', 'Opción agresiva', 'Prefiero explicarlo yo'];
  }

  if (
    /\b(tiempo|frecuencia|con qué frecuencia|que frecuencia|qué tan seguido|que tan seguido)\b/i.test(q) ||
    /\b(cada mes|cada semana|cada quincena)\b/i.test(q)
  ) {
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
  let match: RegExpExecArray | null;
  const pushIfUnique = (block: AgentBlock) => {
    const key = JSON.stringify(block);
    const exists = blocks.some((b) => JSON.stringify(b) === key);
    if (!exists) blocks.push(block);
  };

  // Match <TX_CHART> blocks (transaction modal charts)
  const txChartRegex = /<TX_CHART>([\s\S]*?)<\/TX_CHART>/g;
  while ((match = txChartRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const block = normalizeTxChartBlock(data);
      if (block) pushIfUnique(block);
    } catch {
      // Invalid JSON in tag, skip
    }
  }

  // Match <CHART> blocks
  const chartRegex = /<CHART>([\s\S]*?)<\/CHART>/g;
  while ((match = chartRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const block = normalizeChartPayload(data);
      if (block) pushIfUnique(block);
    } catch {
      // Invalid JSON in tag, skip
    }
  }

  // Match <TABLE> blocks (closed or missing </TABLE>)
  for (const span of findAgentTableTagSpans(text)) {
    const data = span.data;
    const block: TableBlock = {
      type: 'table',
      table: {
        title: data.title || 'Tabla',
        headers: data.headers || data.columns || [],
        rows: (data.rows || []).map((row: unknown) =>
          Array.isArray(row)
            ? row.map((cell) => String(cell ?? ''))
            : [],
        ),
        note: data.note,
      },
    };
    pushIfUnique(block);
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
    const agentBlocks = extractAgentBlocksFromObject(parsed);
    for (const block of agentBlocks) pushIfUnique(block);
  } catch {
    // Text may not be JSON; ignore
  }

  return blocks;
}

/**
 * Extract suggested replies from <SUGERENCIAS> tag
 */
export function extractSuggestedReplies(text: string): string[] {
  const xmlMatch = text.match(/<SUGERENCIAS>\s*(\[[\s\S]*?\])\s*<\/SUGERENCIAS>/i);
  const plainMatch = text.match(/(?:^|\n)\s*SUGERENCIAS\s*:\s*(\[[\s\S]*?\])\s*(?:\n|$)/i);
  const payload = xmlMatch?.[1] ?? plainMatch?.[1];
  if (!payload) return [];

  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    // Try simpler parsing: split by comma + clean quotes
    const items = payload
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    return items;
  }
}

export const CORE_AGENT_PANEL_SECTIONS = [
  'budget',
  'transactions',
  'products_transactions',
  'library',
  'recents',
  'profile',
  'news',
  'objective',
  'mode',
  'interview',
] as const;

export type CoreAgentPanelSection = (typeof CORE_AGENT_PANEL_SECTIONS)[number];

const PANEL_SECTION_ALIASES: Record<string, CoreAgentPanelSection> = {
  products_transactions: 'transactions',
  productos: 'transactions',
  transacciones: 'transactions',
};

export function normalizeCoreAgentPanelSection(
  section?: string | null,
): CoreAgentPanelSection | undefined {
  const raw = String(section ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (PANEL_SECTION_ALIASES[raw]) return PANEL_SECTION_ALIASES[raw];
  if ((CORE_AGENT_PANEL_SECTIONS as readonly string[]).includes(raw)) {
    return raw as CoreAgentPanelSection;
  }
  return undefined;
}

/**
 * Parse and normalize <PANEL> actions from formatter output.
 */
export function extractPanelAction(
  text: string,
): { section?: CoreAgentPanelSection; message?: string } | undefined {
  const match = text.match(/<PANEL>\s*(\{[\s\S]*?\})\s*<\/PANEL>/);
  if (!match) return undefined;

  try {
    const parsed = JSON.parse(match[1]) as { section?: string; message?: string };
    const section = normalizeCoreAgentPanelSection(parsed.section);
    const message = typeof parsed.message === 'string' ? parsed.message : undefined;
    if (!section && !message) return undefined;
    return { section, message };
  } catch {
    return undefined;
  }
}

/**
 * Extract budget table patch from execution outputs, structured tag, or legacy BUDGET_UPDATE.
 */
export function extractLegacyBudgetUpdates(
  text: string,
): Array<{ label: string; type: 'income' | 'expense'; amount: number; category?: string }> {
  const match = text.match(/<BUDGET_UPDATE>\s*(\[[\s\S]*?\])\s*<\/BUDGET_UPDATE>/i);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const label = typeof row?.label === 'string' ? row.label.trim() : '';
        const amount = Number(row?.amount);
        const type = row?.type === 'income' ? 'income' : row?.type === 'expense' ? 'expense' : null;
        if (!label || !type || !Number.isFinite(amount)) return null;
        const category = typeof row?.category === 'string' ? row.category.trim() : undefined;
        return { label, type, amount, ...(category ? { category } : {}) };
      })
      .filter(
        (x): x is { label: string; type: 'income' | 'expense'; amount: number; category?: string } =>
          x !== null,
      );
  } catch {
    return [];
  }
}

export function extractBudgetTablePatch(params: {
  text: string;
  tool_outputs?: Array<{ tool: string; data: unknown }>;
  ui_state?: Record<string, unknown>;
}): BudgetTablePatch | undefined {
  const rows = budgetRowsFromUiSnapshot(params.ui_state?.budget_rows);

  const fromTools = extractBudgetTablePatchFromToolOutputs(params.tool_outputs, rows);
  if (fromTools && (fromTools.actions.length > 0 || fromTools.pending_confirmation)) {
    return fromTools;
  }

  const tagActions = extractBudgetTableActionsFromTag(params.text);
  if (tagActions.length > 0) {
    return buildBudgetTablePatch(rows, tagActions);
  }

  const legacyTagMatch = params.text.match(
    /<BUDGET_TABLE_ACTIONS>\s*(\{[\s\S]*?\})\s*<\/BUDGET_TABLE_ACTIONS>/i,
  );
  if (legacyTagMatch) {
    try {
      const parsed = JSON.parse(legacyTagMatch[1]) as { actions?: unknown };
      const actions = parseBudgetTableActionsJson(parsed.actions);
      if (actions.length > 0) {
        return buildBudgetTablePatch(rows, actions, {
          modelRequiresConfirmation: Boolean(
            (parsed as { requires_confirmation?: boolean }).requires_confirmation,
          ),
        });
      }
    } catch {
      // ignore malformed object tag
    }
  }

  const legacyUpdates = extractLegacyBudgetUpdates(params.text);
  if (legacyUpdates.length > 0) {
    const actions = legacyBudgetUpdatesToActions(rows, legacyUpdates);
    if (actions.length > 0) {
      return buildBudgetTablePatch(rows, actions);
    }
  }

  return undefined;
}

/** @deprecated Use extractBudgetTablePatch */
export function extractBudgetUpdates(
  text: string,
): Array<{ label: string; type: 'income' | 'expense'; amount: number; category?: string }> {
  return extractLegacyBudgetUpdates(text);
}

/**
 * Remove all special tags from text
 */
export function cleanSpecialTags(text: string): string {
  return stripAgentTableTags(
    text
      .replace(/<CHART>[\s\S]*?<\/CHART>/g, '\n\n')
      .replace(/<TX_CHART>[\s\S]*?<\/TX_CHART>/g, '\n\n')
      .replace(/<QUESTIONNAIRE>[\s\S]*?<\/QUESTIONNAIRE>/g, '\n\n')
      .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/g, '\n\n')
      .replace(/<PANEL>[\s\S]*?<\/PANEL>/g, '\n\n')
      .replace(/<BUDGET_UPDATE>[\s\S]*?<\/BUDGET_UPDATE>/gi, '\n\n')
      .replace(/<BUDGET_TABLE_ACTIONS>[\s\S]*?<\/BUDGET_TABLE_ACTIONS>/gi, '\n\n')
      .replace(/(?:^|\n)\s*SUGERENCIAS\s*:\s*\[[\s\S]*?\]\s*(?=\n|$)/gi, '\n\n')
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '\n\n')
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, '\n\n')
      .replace(/<parameter[\s\S]*?<\/parameter>/gi, '\n\n')
      .replace(/<\/?(function_calls|invoke|parameter)[^>]*>/gi, '\n')
      .replace(/<CONTEXT_SCORE>\d+<\/CONTEXT_SCORE>/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}
