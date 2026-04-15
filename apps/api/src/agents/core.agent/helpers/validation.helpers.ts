/**
 * validation.helpers.ts
 * Basic validation and type guards
 */

/**
 * Check if object looks like an artifact (PDF, doc, etc)
 */
export function isArtifactLike(x: any): boolean {
  return (
    x &&
    typeof x === 'object' &&
    typeof x.id === 'string' &&
    typeof x.type === 'string' &&
    typeof x.title === 'string'
  );
}

/**
 * Extract source name from citation doc_id or doc_title
 */
export function sourceName(c: { doc_id: string; doc_title?: string }): string {
  if (c.doc_title) return c.doc_title;
  try {
    return new URL(c.doc_id).hostname;
  } catch {
    const parts = c.doc_id.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? 'source';
  }
}
