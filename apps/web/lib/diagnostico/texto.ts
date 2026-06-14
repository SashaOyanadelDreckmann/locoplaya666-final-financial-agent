const LATEX_SYMBOLS: Record<string, string> = {
  mu: 'μ',
  sigma: 'σ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  pi: 'π',
  times: '×',
  cdot: '·',
  leq: '≤',
  geq: '≥',
  le: '≤',
  ge: '≥',
  pm: '±',
  neq: '≠',
};

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function replaceRawLatexSymbols(input: string): string {
  return input.replace(/\\(mu|sigma|alpha|beta|gamma|delta|epsilon|theta|pi|times|cdot|leq|geq|le|ge|pm|neq)\b/gi, (_, token: string) => {
    const replacement = LATEX_SYMBOLS[token.toLowerCase()];
    return replacement ?? token;
  });
}

function replaceLatexFractions(input: string): string {
  return input.replace(/(?:\$)?\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_match, numerator: string, denominator: string) => {
    const left = String(numerator).trim();
    const right = String(denominator).trim();
    if (!left || !right) return _match;
    return `${left}/${right}`;
  });
}

function replaceStrayMathDelimiters(input: string): string {
  return input
    .replace(/\$\s*\\frac/g, '\\frac')
    .replace(/\$\s*\\([a-zA-Z]+)/g, (_, token: string) => `\\${token}`)
    .replace(/\$(?=\s*[A-Za-z0-9\\])/g, '')
    .replace(/\$(?=[,.;:!?)]|\s|$)/g, '');
}

export function humanizeDiagnosticText(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const cleaned = normalizeWhitespace(raw)
    .replace(/\bundefined\b/gi, '')
    .replace(/\bnull\b/gi, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/([!?;:])([^\s])/g, '$1 $2')
    .replace(/\.([^\d\s])/g, '. $1')
    .replace(/[ \t]{2,}/g, ' ');

  return replaceStrayMathDelimiters(replaceLatexFractions(replaceRawLatexSymbols(cleaned))).trim() || fallback.trim();
}
