export type DiagnosisListKind = 'tension' | 'hypothesis' | 'question';

const DEFAULT_MAX: Record<DiagnosisListKind, number> = {
  tension: 140,
  hypothesis: 140,
  question: 120,
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripVerbosePrefixes(text: string): string {
  return text
    .replace(/^El usuario experimenta /i, '')
    .replace(/^El usuario /i, '')
    .replace(/^Existe una desconexión entre /i, 'Desconexión entre ')
    .replace(/^Existe una /i, '')
    .replace(/^La ausencia de registro de /i, 'Sin registro de ')
    .replace(/^La ausencia de /i, 'Sin ')
    .replace(/ podría deberse a /gi, ' por ')
    .replace(/^Hallazgo de entrevista:\s*/i, '')
    .replace(/^La entrevista sugiere que /i, '');
}

function firstCompleteQuestion(text: string): string | null {
  const match = text.match(/^[^?]+\?/);
  return match ? match[0].trim() : null;
}

function takeSentences(text: string, maxLength: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) return text;

  let acc = sentences[0];
  for (let i = 1; i < sentences.length; i += 1) {
    const next = `${acc} ${sentences[i]}`;
    if (next.length > maxLength) break;
    acc = next;
  }
  return acc;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace > maxLength * 0.55 ? slice.slice(0, lastSpace) : slice).trim();
  return cut.endsWith('…') ? cut : `${cut}…`;
}

function capitalizeFirst(text: string): string {
  const first = text.charAt(0);
  if (!first || first !== first.toLowerCase() || !/[a-záéíóúñ]/.test(first)) {
    return text;
  }
  return first.toUpperCase() + text.slice(1);
}

export function compactDiagnosisListItem(
  raw: string,
  kind: DiagnosisListKind = 'tension',
  maxLength = DEFAULT_MAX[kind],
): string {
  let text = normalize(raw);
  if (!text) return text;

  text = stripVerbosePrefixes(text);
  text = text.replace(/, considerando (que )?/i, '. ');
  text = text.replace(/, lo que sugiere /i, ' → ');

  if (kind === 'question' || text.includes('?')) {
    const firstQ = firstCompleteQuestion(text);
    if (firstQ) {
      text = firstQ.length <= maxLength + 24 ? firstQ : truncateAtWord(firstQ, maxLength);
    }
  }

  if (text.length > maxLength) {
    text = takeSentences(text, maxLength);
  }

  if (text.length > maxLength) {
    text = truncateAtWord(text, maxLength);
  }

  return capitalizeFirst(text);
}

export function compactDiagnosisList(
  items: string[] | undefined,
  kind: DiagnosisListKind,
  maxLength?: number,
): string[] {
  return (items ?? [])
    .filter(Boolean)
    .map((item) => compactDiagnosisListItem(item, kind, maxLength));
}
