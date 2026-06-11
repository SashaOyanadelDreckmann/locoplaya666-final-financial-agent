/**
 * model-policy.helpers.ts
 * Core Agent model routing: Claude Haiku always; GPT-5.2 for chart/table MCP tools only.
 */

const VISUAL_KEYWORDS =
  /\b(gr[aá]fico|grafico|chart|tabla|tablas|visualiz|comparar|simula|simulaci[oó]n|monte\s*carlo|proyecci[oó]n|escenario|distribuci[oó]n|evoluci[oó]n|barras|l[ií]nea|histograma|cuadro|matriz|amortiz|dividendo)\b/i;

const CHART_TABLE_MODES = new Set([
  'simulation',
  'comparison',
  'budgeting',
  'planification',
  'decision_support',
]);

export function needsChartsOrTablesMcp(params: {
  userMessage: string;
  mode?: string;
  requiresTools?: boolean;
  preferredOutput?: 'pdf' | 'charts' | 'mixed';
  history?: Array<{ role: string; content: string }>;
}): boolean {
  const full = `${params.history?.map((h) => h.content).join(' ') ?? ''} ${params.userMessage}`.trim();

  if (VISUAL_KEYWORDS.test(full)) return true;
  if (params.preferredOutput === 'charts') return true;

  if (params.requiresTools && params.mode && CHART_TABLE_MODES.has(params.mode)) {
    return true;
  }

  return false;
}

/** GPT-5.2 — required for MCP tools that emit charts/tables. */
export function resolveVisualToolsModel(): string {
  return (process.env.OPENAI_MODEL ?? 'gpt-5.2').trim();
}

/** Lighter OpenAI model for non-visual tool loops. */
export function resolveLiteToolsModel(): string {
  return (
    process.env.OPENAI_MODEL_FAST?.trim() ||
    process.env.OPENAI_MODEL_LITE?.trim() ||
    'gpt-4.1-mini'
  );
}

export function resolvePlanExecuteModel(params: {
  userMessage: string;
  mode?: string;
  requiresTools?: boolean;
  preferredOutput?: 'pdf' | 'charts' | 'mixed';
  history?: Array<{ role: string; content: string }>;
}): string {
  if (needsChartsOrTablesMcp(params)) return resolveVisualToolsModel();
  return resolveLiteToolsModel();
}

/** Core Agent always uses Haiku — never Sonnet. */
export function resolveCoreAgentClaudeModel(): string {
  return (process.env.ANTHROPIC_MODEL_FAST ?? 'claude-haiku-4-5').trim();
}
