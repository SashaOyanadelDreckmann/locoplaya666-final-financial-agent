export const FACTUAL_INFO_MODES = [
  'information',
  'education',
  'regulation',
  'comparison',
] as const;

export type FactualInfoMode = (typeof FACTUAL_INFO_MODES)[number];

export const EVIDENCE_TOOL_NAMES = [
  'web.search',
  'web.extract',
  'web.scrape',
  'regulatory.lookup_cl',
  'rag.lookup',
  'market.uf_cl',
  'market.tpm_cl',
  'market.fx_usd_clp',
  'market.utm_cl',
] as const;

export const FRESHNESS_SIGNAL_PATTERN =
  /\b(hoy|ahora|actual|vigente|reciente|ultim|últim|noticia|noticias|este ano|este año|2025|2026|al dia|al día|a la fecha|en chile ahora)\b/i;

export const MARKET_FACT_PATTERN =
  /\b(apv|inversion|invertir|fondo|etf|acciones|banco|institucion|institución|tasa|mercado|uf|tpm|utm|dolar|dólar|credito|crédito|hipotec|inflacion|inflación|tipo de cambio|bcentral|bcch)\b/i;

const TRIVIAL_GREETING =
  /^\s*(hola|buenas|buenos dias|buenos días|buenas tardes|buenas noches|gracias|ok|dale|listo)\s*[.!?]*\s*$/i;

export function isTrivialAgentMessage(userMessage?: string): boolean {
  const msg = String(userMessage ?? '').trim();
  return !msg || TRIVIAL_GREETING.test(msg);
}

export function isFactualInfoMode(mode?: string): mode is FactualInfoMode {
  return FACTUAL_INFO_MODES.includes(mode as FactualInfoMode);
}

export function shouldAttachLiveMarketSnapshot(userMessage?: string): boolean {
  if (isTrivialAgentMessage(userMessage)) return false;
  return true;
}

export function shouldBoostFreshEvidenceTools(params: {
  mode?: string;
  userMessage?: string;
  requiresTools?: boolean;
  requiresRag?: boolean;
}): { requires_tools: boolean; requires_rag: boolean } {
  const mode = String(params.mode ?? '');
  const message = String(params.userMessage ?? '');
  let requires_tools = params.requiresTools === true;
  let requires_rag = params.requiresRag === true;

  if (!isFactualInfoMode(mode)) {
    return { requires_tools, requires_rag };
  }

  if (FRESHNESS_SIGNAL_PATTERN.test(message) || MARKET_FACT_PATTERN.test(message)) {
    requires_tools = true;
  }

  if (mode === 'regulation' || REGULATION_HINT.test(message)) {
    requires_rag = true;
    requires_tools = true;
  }

  return { requires_tools, requires_rag };
}

const REGULATION_HINT =
  /\b(cmf|ley 21\.?521|normativa|regulador|fintech|finanzas abiertas|comision para el mercado financiero)\b/i;

export function shouldPrefetchTrustedWeb(params: {
  userMessage?: string;
  mode?: string;
  requiresTools?: boolean;
  requiresRag?: boolean;
}): boolean {
  if (isTrivialAgentMessage(params.userMessage)) return false;
  const boosted = shouldBoostFreshEvidenceTools(params);
  if (boosted.requires_tools || boosted.requires_rag) return true;
  if (isFactualInfoMode(params.mode)) return true;
  return false;
}

export function shouldBypassWebEvidenceCache(userMessage?: string): boolean {
  return FRESHNESS_SIGNAL_PATTERN.test(String(userMessage ?? ''));
}

export function buildTrustedWebQuery(userMessage: string): string {
  const year = new Date().getFullYear();
  return `${userMessage} Chile ${year} (site:cmfchile.cl OR site:cmfeduca.cl OR site:leychile.cl OR site:bcentral.cl OR site:hacienda.cl OR site:mindicador.cl)`;
}

export type PanelSourceCitation = {
  title?: string;
  url?: string;
  source: string;
  supporting_span?: string;
};

export function buildMarketPanelCitations(marketSnapshot: unknown): PanelSourceCitation[] {
  if (!marketSnapshot || typeof marketSnapshot !== 'object') return [];

  const snapshot = marketSnapshot as Record<string, unknown>;
  const labels: Record<string, string> = { uf: 'UF', tpm: 'TPM', usd: 'USD/CLP' };
  const citations: PanelSourceCitation[] = [];

  for (const [key, label] of Object.entries(labels)) {
    const entry = snapshot[key];
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (record.value == null) continue;
    const source = typeof record.source === 'string' ? record.source : 'mindicador.cl';
    const date = typeof record.date === 'string' ? record.date : 'fecha referencial';
    citations.push({
      title: `${label} · mercado Chile`,
      url: source,
      source,
      supporting_span: `Valor ${record.value} (${date})`,
    });
  }

  return citations;
}
