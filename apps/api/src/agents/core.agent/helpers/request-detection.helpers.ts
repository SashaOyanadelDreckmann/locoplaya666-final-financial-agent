/**
 * request-detection.helpers.ts
 * Detect user intent and request type
 */

/**
 * Check if request is for conceptual PDF (not numerical simulations)
 */
export function isConceptualPdfRequest(
  userMessage: string,
  history?: Array<{ role: string; content: string }>,
  mode?: string
): boolean {
  const full = `${history?.map((h) => h.content).join(' ') ?? ''} ${userMessage}`.toLowerCase();
  const asksPdf = /\b(pdf|reporte|informe|documento|descargar|archivo)\b/i.test(full);
  if (!asksPdf) return false;

  const conceptual = /\b(que es|qué es|explica|concepto|definici[óo]n|glosario|cmf|fintec|ley)\b/i.test(
    full
  );
  const hasNumbers = /[\$]?\d{3,}/.test(full);

  return (
    conceptual &&
    !hasNumbers &&
    (mode === 'education' || mode === 'regulation' || mode === 'information')
  );
}

/**
 * Check if request is for diagnostic report
 */
export function isDiagnosticReportRequest(userMessage: string): boolean {
  return /\b(diagnóstico|diagnóstico integral|evaluaci[óo]n|análisis completo|panorama|situaci[óo]n financiera)\b/i.test(
    userMessage
  );
}

/**
 * Check if should prefer narrative report over simulation
 */
export function shouldPreferNarrativeReport(
  userMessage: string,
  history?: Array<{ role: string; content: string }>,
  mode?: string
): boolean {
  const full = `${history?.map((h) => h.content).join(' ') ?? ''} ${userMessage}`.toLowerCase();
  const asksReport = /\b(pdf|reporte|informe|documento|archivo|resumen ejecutivo)\b/i.test(full);
  const asksTableOrChartExplanation =
    /\b(tabla|tablas|cuadro|matriz|grafico|gráfico|chart)\b/i.test(full) &&
    /\b(explica|explicame|explicación|analiza|interpret|estructur|resum)\b/i.test(full);

  if (!asksReport && !asksTableOrChartExplanation) return false;

  const strongSimulationSignal =
    /\b(simul|proyecci|rentabilidad|drawdown|volatilidad|monte\s*carlo|escenario)\b/i.test(full) ||
    (/\b(tasa|aporte|capital|mes|meses)\b/i.test(full) && /[\$]?\d{3,}/.test(full));

  return !strongSimulationSignal;
}

/**
 * Get current request text for analysis
 */
export function getCurrentRequestText(userMessage: string, intent?: string): string {
  return `${userMessage} ${intent ?? ''}`.toLowerCase();
}
