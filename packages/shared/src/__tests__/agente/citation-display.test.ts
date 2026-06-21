import { describe, expect, it } from 'vitest';

import {
  isInternalToolCitationLabel,
  isPublicCitationRenderable,
  sanitizePublicCitations,
  stripInternalToolSourceLines,
} from '../../agente/citation-display';

describe('citation-display', () => {
  it('flags internal tool names as non-public citations', () => {
    expect(isInternalToolCitationLabel('web.search')).toBe(true);
    expect(isInternalToolCitationLabel('rag.lookup')).toBe(true);
    expect(isPublicCitationRenderable({ doc_title: 'web.search' })).toBe(false);
  });

  it('keeps web citations with urls', () => {
    expect(
      isPublicCitationRenderable({
        doc_title: 'CMF Chile',
        url: 'https://www.cmfchile.cl',
      }),
    ).toBe(true);
  });

  it('sanitizes mixed citations and keeps only public ones', () => {
    const sanitized = sanitizePublicCitations([
      { doc_title: 'web.search' },
      { doc_id: 'apps/api/src/mcp/tools/finance/goalPlanner.tool.ts', doc_title: 'goalPlanner.tool' },
      { doc_title: 'Biografía presidencial', url: 'https://www.bcn.cl' },
      { doc_id: 'agent:reference-date', doc_title: 'Marco de referencia temporal' },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]?.url).toBe('https://www.bcn.cl');
  });

  it('strips inline tool-only source lines', () => {
    const cleaned = stripInternalToolSourceLines(
      'Respuesta breve.\n\nFuentes: web.search, rag.lookup',
    );
    expect(cleaned).toBe('Respuesta breve.');
  });
});
