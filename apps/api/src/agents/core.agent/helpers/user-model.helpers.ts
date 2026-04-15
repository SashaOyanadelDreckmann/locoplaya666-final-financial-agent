/**
 * user-model.helpers.ts
 * User model inference from messages and profiles
 */

import type { InferredUserModel } from '../agent-types';

/**
 * Infer user model from message, profile, and conversation history
 */
export function inferUserModel(params: {
  userMessage: string;
  history?: Array<{ role: string; content: string }>;
  profile?: any;
  intake?: any;
}): InferredUserModel {
  const { userMessage, profile, intake } = params;
  const fullText = `${userMessage}`.toLowerCase();

  // Infer preferred output
  let preferred_output: 'pdf' | 'charts' | 'mixed' = 'mixed';
  if (/\b(pdf|reporte|informe|documento|descargar|archivo)\b/i.test(fullText)) {
    preferred_output = 'pdf';
  } else if (/\b(gráfico|grafico|chart|visualizaci[óo]n)\b/i.test(fullText)) {
    preferred_output = 'charts';
  }

  // Infer detail level
  let detail_level: 'standard' | 'high' = 'standard';
  if (/\b(detall|explica|desglose|análisis profundo|exhaustivo)\b/i.test(fullText)) {
    detail_level = 'high';
  }

  // Infer risk profile from message
  let risk_profile: 'conservative' | 'balanced' | 'aggressive' = 'balanced';
  if (/\b(riesgo|volatil|agresivo|growth|invest|alto rendimiento)\b/i.test(fullText)) {
    risk_profile = 'aggressive';
  } else if (/\b(conservador|seguro|bajo riesgo|fijo|garantizado)\b/i.test(fullText)) {
    risk_profile = 'conservative';
  }

  // Extract numerical parameters
  const principalMatch = userMessage.match(/\$?([\d,]+(?:\.\d{2})?)\s*(?:para invertir|como capital|principal|aportar)/i);
  const horizonMatch = userMessage.match(/(\d+)\s*(?:meses|años|anos|months|years)/i);
  const contributionMatch = userMessage.match(/\$?([\d,]+)\s*(?:al mes|por mes|mensual|monthly)/i);

  return {
    preferred_output,
    detail_level,
    risk_profile,
    inferred_principal: principalMatch
      ? parseFloat(principalMatch[1].replace(/,/g, ''))
      : undefined,
    inferred_horizon_months: horizonMatch ? parseInt(horizonMatch[1], 10) : undefined,
    inferred_monthly_contribution: contributionMatch
      ? parseFloat(contributionMatch[1].replace(/,/g, ''))
      : undefined,
  };
}

/**
 * Infer PDF format preferences from message
 */
export function inferPdfFormatPreferences(userMessage: string): string | undefined {
  const lower = userMessage.toLowerCase();
  if (/\b(narrativo|narración|prosa|historia|explicaci[óo]n)\b/i.test(lower)) {
    return 'narrative';
  }
  if (/\b(tabla|tablas|datos|números|breakdown|detalle)\b/i.test(lower)) {
    return 'tabular';
  }
  if (/\b(gráfico|grafico|visualización|chart|barras|línea|line)\b/i.test(lower)) {
    return 'charts';
  }
  return undefined;
}

/**
 * Check if PDF format is fully specified
 */
export function isPdfFormatComplete(format?: string): boolean {
  return !!(format && ['narrative', 'tabular', 'charts'].includes(format));
}

/**
 * Check if user allows agent to choose PDF format
 */
export function userAllowsAgentToChooseFormat(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  // User explicitly says "whatever format", "as you prefer", "your choice"
  return /\b(como prefieras|elige t[úu]|formato que creas|como creas|lo que sea|cualquier formato)\b/i.test(lower);
}

/**
 * Decide if should ask user for PDF format
 */
export function shouldAskPdfFormat(
  userMessage: string,
  asksPdf: boolean,
  inferredFormat?: string
): boolean {
  if (!asksPdf) return false;
  if (isPdfFormatComplete(inferredFormat)) return false;
  if (userAllowsAgentToChooseFormat(userMessage)) return false;
  return true;
}
