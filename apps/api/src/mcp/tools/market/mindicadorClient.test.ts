import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIndicador } from './mindicadorClient';

describe('fetchIndicador', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SCRAPE_DO_API_KEY;
  });

  it('parses mindicador JSON via direct fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            unidad_medida: 'Pesos',
            serie: [{ fecha: '2026-06-15', valor: 39234.56 }],
          }),
      }),
    );

    const out = await fetchIndicador('uf');
    expect(out.valor).toBe(39234.56);
    expect(out.fecha).toBe('2026-06-15');
    expect(out.source).toBe('direct');
    expect(out.url).toContain('mindicador.cl/api/uf');
  });

  it('throws when direct fetch fails and scrape.do is not configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => '',
      }),
    );

    await expect(fetchIndicador('tpm')).rejects.toThrow('mindicador HTTP 503');
  });
});
