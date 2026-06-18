import { describe, expect, it } from 'vitest';

import {
  buildMarketSnapshotCitations,
  ensureEvidenceCitations,
  extractCitationsFromToolOutputs,
  mergeCitations,
} from './evidence.helpers';
import type { FormatPhaseInput } from '../agent-types';

describe('evidence.helpers', () => {
  it('merges citations without duplicates', () => {
    const merged = mergeCitations(
      [{ doc_id: 'a', doc_title: 'A', supports: 'claim', confidence: 0.8 }],
      [{ doc_id: 'a', doc_title: 'A duplicate', supports: 'claim', confidence: 0.9 }],
      [{ url: 'https://b.cl', doc_title: 'B', supports: 'claim', confidence: 0.7 }],
    );
    expect(merged).toHaveLength(2);
  });

  it('extracts web citations from tool outputs', () => {
    const citations = extractCitationsFromToolOutputs([
      {
        tool: 'web.search',
        data: {
          results: [{ title: 'CMF', url: 'https://cmfchile.cl', snippet: 'Regulación' }],
        },
      },
    ]);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe('https://cmfchile.cl');
  });

  it('builds market snapshot citations with source urls', () => {
    const citations = buildMarketSnapshotCitations({
      uf: { value: 38000, unit: 'CLP', date: '2026-06-09', source: 'https://mindicador.cl/api/uf' },
    });
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toContain('mindicador');
  });

  it('ensures citations for factual information mode with market snapshot', async () => {
    const input = {
      mode: 'information',
      user_message: '¿Cómo está la UF hoy?',
      execution_result: {
        tool_calls: [],
        tool_outputs: [],
        citations: [],
        artifacts: [],
        agent_blocks: [],
        react_trace: [],
        iterations_count: 0,
      },
      context_summary: {
        reference_date: '2026-06-09',
        market_snapshot: {
          uf: { value: 38000, date: '2026-06-09', source: 'https://mindicador.cl/api/uf' },
        },
      },
    } as FormatPhaseInput;

    const citations = await ensureEvidenceCitations(input);
    expect(citations.length).toBeGreaterThan(0);
    expect(citations.every((entry) => entry.url || entry.doc_title)).toBe(true);
  });

  it('drops internal tool labels from public citations', async () => {
    const input = {
      mode: 'information',
      user_message: '¿Quién es Boric?',
      execution_result: {
        tool_calls: [{ tool: 'web.search', status: 'success' }],
        tool_outputs: [
          {
            tool: 'web.search',
            data: {
              results: [{ title: 'Biografía', url: 'https://www.bcn.cl/boric', snippet: 'Presidente' }],
            },
          },
        ],
        citations: [{ doc_title: 'web.search', doc_id: 'web.search' }],
        artifacts: [],
        agent_blocks: [],
        react_trace: [],
        iterations_count: 0,
      },
      context_summary: {},
    } as FormatPhaseInput;

    const citations = await ensureEvidenceCitations(input);
    expect(citations.some((entry) => entry.url === 'https://www.bcn.cl/boric')).toBe(true);
    expect(citations.some((entry) => String(entry.doc_title).includes('web.search'))).toBe(false);
  });
});
