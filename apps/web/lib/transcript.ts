function normalizeTranscriptChunk(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldInsertSpace(previous: string, next: string): boolean {
  if (!previous) return false;
  if (/[\s([{\-–—/]$/.test(previous)) return false;
  if (/^[,.;:!?)}\]]/.test(next)) return false;
  return true;
}

export function appendTranscriptChunk(previous: string, chunk: string): string {
  const next = normalizeTranscriptChunk(chunk);
  if (!next) return previous;

  const prev = previous.trimEnd();
  if (!prev) return next;

  const prevLower = prev.toLowerCase();
  const nextLower = next.toLowerCase();

  if (prevLower === nextLower || prevLower.endsWith(nextLower)) {
    return prev;
  }

  return `${prev}${shouldInsertSpace(prev, next) ? ' ' : ''}${next}`;
}
