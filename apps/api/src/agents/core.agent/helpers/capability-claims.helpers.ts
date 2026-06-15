/**
 * Strips or reframes claims the core agent cannot fulfill (e.g. auto PDF generation).
 */

const PDF_AGENT_VERB =
  /\b(genero|generar|generamos|creo|crear|crea|descargo|descargar|exporto|exportar|guardo|guardar)\b/i;

const PDF_NOUN = /\b(pdf|informes?\s+descargables?|reportes?\s+descargables?)\b/i;

export function containsFalsePdfAgentClaims(text: string): boolean {
  const normalized = String(text ?? '').toLowerCase();
  if (!normalized) return false;

  if (
    /\bgenerar informes\b/.test(normalized) ||
    /\binformes que puedas descargar\b/.test(normalized) ||
    /\bpdf[s]?\s+personalizados?\b/.test(normalized) ||
    /\bpdf[s]?\s+descargables?\b/.test(normalized)
  ) {
    return true;
  }

  if (PDF_AGENT_VERB.test(normalized) && PDF_NOUN.test(normalized)) {
    return !/\bbot[oó]n\b[^.\n]{0,80}\b(guardar pdf|pdf)\b/i.test(normalized);
  }

  return false;
}

export function sanitizeAgentCapabilityClaims(message: string): string {
  let out = String(message ?? '');

  out = out.replace(
    /,?\s*y\s+generar informes[^.\n]*/gi,
    '',
  );
  out = out.replace(
    /\bgenerar informes que puedas descargar\b/gi,
    'armar análisis con gráficos y tablas en el chat',
  );
  out = out.replace(
    /\bgenerar informes\b[^.\n]*/gi,
    'armar análisis estructurados en el chat',
  );
  out = out.replace(
    /optimizar ahorros y generar informes[^.\n]*/gi,
    'optimizar ahorros y revisar escenarios',
  );
  out = out.replace(
    /^[\s•\-*\d.)]+generar informes[^\n]*\n?/gim,
    '',
  );

  if (containsFalsePdfAgentClaims(out)) {
    out = out.replace(
      /\b(genero|generar|generamos|creo|crear|descargo|descargar|exporto|exportar)\b[^.\n]{0,60}\b(pdf|informes?|reportes?)\b[^.\n]*/gi,
      'te dejo el análisis completo aquí en el chat',
    );
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function ensurePdfExportClarification(message: string, userMessage?: string): string {
  const asksPdf = /\b(pdf|reporte|informe|descargar|exportar)\b/i.test(String(userMessage ?? ''));
  const mentionsExportButton = /\b(guardar pdf|bot[oó]n)\b/i.test(message);
  if (!asksPdf || mentionsExportButton) return message;

  return `${message}\n\nNota: yo no genero archivos PDF automáticamente. Te entrego el contenido aquí; si quieres exportarlo, usa el botón **Guardar PDF** en esta burbuja.`;
}

const PDF_SUGGESTION_CHIP =
  /\b(generar|crear|descargar|exportar)\b[^.]{0,40}\b(pdf|informe|reporte)\b/i;

const SANITIZED_PDF_REPLACEMENT = 'te dejo el análisis completo aquí en el chat';

export function sanitizeSuggestedReplies(replies: string[]): string[] {
  return replies
    .map((reply) => sanitizeAgentCapabilityClaims(reply))
    .filter((reply) => {
      if (!reply) return false;
      if (reply.toLowerCase() === SANITIZED_PDF_REPLACEMENT) return false;
      if (PDF_SUGGESTION_CHIP.test(reply)) return false;
      return !containsFalsePdfAgentClaims(reply);
    });
}
