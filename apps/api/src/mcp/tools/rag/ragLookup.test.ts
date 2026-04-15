import { describe, expect, it } from 'vitest';
import { ragLookupTool } from './ragLookup.tool';

describe('rag.lookup', () => {
  async function run(query: string, limit?: number) {
    const result = await ragLookupTool.run({ query, limit });
    return {
      found: Number(result.data?.found ?? 0),
      citations: Array.isArray(result.citations) ? result.citations : [],
    };
  }

  it('returns citations for a relevant Chilean finance query', async () => {
    const result = await run('APV ahorro previsional');

    expect(result.found).toBeGreaterThan(0);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.doc_id).toBeTruthy();
    expect(result.citations[0]?.doc_title).toBeTruthy();
    expect(result.citations[0]?.supporting_span).toBeTruthy();
  });

  it('returns zero citations for a clearly nonexistent query', async () => {
    const result = await run('xyzabc123nonexistent');

    expect(result.found).toBe(0);
    expect(result.citations).toEqual([]);
  });

  it('respects the limit argument when returning citations', async () => {
    const result = await run('APV', 3);

    expect(result.citations.length).toBeLessThanOrEqual(3);
    expect(result.found).toBeLessThanOrEqual(3);
  });

  it('returns citations ordered by confidence descending', async () => {
    const result = await run('tasas de crédito', 5);

    for (let i = 0; i < result.citations.length - 1; i++) {
      expect(result.citations[i].confidence).toBeGreaterThanOrEqual(
        result.citations[i + 1].confidence
      );
    }
  });

  it('handles short generic queries without crashing', async () => {
    const result = await run('a');

    expect(result.found).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.citations)).toBe(true);
  });
});
