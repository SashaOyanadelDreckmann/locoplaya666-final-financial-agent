/** Extract a balanced JSON object starting at `{` (handles strings/escapes). */
export function extractBalancedJsonObject(
  text: string,
  startIndex: number,
): { json: string; endIndex: number } | null {
  if (text[startIndex] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { json: text.slice(startIndex, i + 1), endIndex: i + 1 };
      }
    }
  }

  return null;
}

export type ParsedAgentTablePayload = {
  title?: string;
  headers?: string[];
  columns?: string[];
  rows?: Array<Array<string | number>>;
  note?: string;
};

/** Find `<TABLE>{...}` blocks, including when `</TABLE>` is missing. */
export function findAgentTableTagSpans(text: string): Array<{ start: number; end: number; data: ParsedAgentTablePayload }> {
  const spans: Array<{ start: number; end: number; data: ParsedAgentTablePayload }> = [];
  const tagRegex = /<TABLE>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const start = match.index;
    const afterTag = match.index + match[0].length;
    const rest = text.slice(afterTag);
    const jsonOffset = rest.search(/\S/);
    if (jsonOffset < 0) {
      spans.push({ start, end: afterTag, data: {} });
      continue;
    }

    const jsonStart = afterTag + jsonOffset;
    if (text[jsonStart] !== '{') continue;

    const balanced = extractBalancedJsonObject(text, jsonStart);
    if (!balanced) continue;

    try {
      const data = JSON.parse(balanced.json) as ParsedAgentTablePayload;
      let end = balanced.endIndex;
      const closeMatch = text.slice(end).match(/^\s*<\/TABLE>/i);
      if (closeMatch) end += closeMatch[0].length;
      spans.push({ start, end, data });
    } catch {
      // Invalid JSON inside tag — still strip the visible garbage later.
      spans.push({ start, end: balanced.endIndex, data: {} });
    }
  }

  return spans;
}

export function stripAgentTableTags(text: string): string {
  const spans = findAgentTableTagSpans(text);
  if (spans.length === 0) return text;

  let out = text;
  for (const span of [...spans].reverse()) {
    out = `${out.slice(0, span.start)}\n\n${out.slice(span.end)}`;
  }
  return out;
}
