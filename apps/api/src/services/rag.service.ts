// apps/api/src/services/rag.service.ts

import type { Citation } from '../agents/core.agent/chat.types';
import { ragLookupTool } from '../mcp/tools/rag/ragLookup.tool';

/**
 * Retrieves relevant context from the local RAG corpus.
 * Delegates to ragLookupTool which searches apps/rag_data/ + mcp knowledge dirs.
 */
export async function retrieveRAGContext(
  query: string,
  meta: {
    mode: string;
    intent: string;
  }
): Promise<Citation[]> {
  if (!query.trim()) return [];

  try {
    const result = await ragLookupTool.run({ query, limit: 5 });
    return (result.citations ?? []) as Citation[];
  } catch {
    return [];
  }
}
