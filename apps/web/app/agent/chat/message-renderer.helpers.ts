/** True when a line reads as Spanish prose, not a compact finance/LaTeX equation. */
export function isNaturalLanguageEquationLine(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;

  if (/\bH\s*\d+\s*:/i.test(trimmed) || /^H\d+\s*:/i.test(trimmed)) return true;
  if (/\bPor\s*qu[eé]\s*importa\b/i.test(trimmed)) return true;
  if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(trimmed)) return true;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 16) return true;

  const spanishStopwordRe =
    /\b(?:de|del|la|el|los|las|que|por|para|con|sin|una|uno|pero|si|sí|cada|antes|después|tienes|hay|necesitamos|muestra|gastos|presupuesto|disponibles|registrados|invertir|quincenal|cobras)\b/gi;
  const stopwordHits = (trimmed.match(spanishStopwordRe) ?? []).length;
  if (words.length >= 7 && stopwordHits >= 2) return true;

  const hasSpanishPhrase =
    /\b(?:de|del|la|el|en|un|una|por|que|con|sin|pero|si|cada|antes|después)\s+[a-záéíóúñ]{3,}\b/i.test(trimmed) ||
    /\b[a-záéíóúñ]{4,}\s+(?:de|del|la|el|en|y|o)\s+[a-záéíóúñ]{3,}\b/i.test(trimmed);
  if (hasSpanishPhrase) return true;

  return false;
}

export function looksFormulaLikeLine(body: string): boolean {
  return (
    /[=Σπμσ√∞∑]/u.test(body) ||
    /\b(?:VAN|VPN|TIR|IRR|WACC|CAPM|ROI|ROE|EBITDA|NPV|beta|alpha|ln|cov|var)\b/i.test(body) ||
    /[A-Za-z][A-Za-z0-9_]*\s*=\s*.+/.test(body) ||
    /\([^)]+\)\^[^\s]+/.test(body) ||
    /\bCF_t\b|\br_f\b|\br_m\b|\bP_final\b|\bP_inicial\b/.test(body)
  );
}

export function shouldPromoteLineToBlockMath(body: string): boolean {
  if (!looksFormulaLikeLine(body)) return false;
  if (isNaturalLanguageEquationLine(body)) return false;
  const wordCount = body.split(/\s+/).length;
  if (wordCount > 18) return false;
  return true;
}
