import { fetchWithScrapeDo } from '../web/scrapeDoClient';

export type IndicadorKind = 'dolar' | 'uf' | 'utm' | 'tpm';

export type IndicadorResult = {
  valor: number | null;
  unidad: string | null;
  fecha: string | null;
  raw: unknown;
  url: string;
  source: 'direct' | 'scrape_do';
};

function parseMindicadorJson(text: string, url: string): IndicadorResult {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }

  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const series = record.serie;
  const first = Array.isArray(series) ? series[0] : null;
  const firstRecord =
    first && typeof first === 'object' ? (first as Record<string, unknown>) : null;

  const valor = typeof firstRecord?.valor === 'number' ? firstRecord.valor : null;
  const fecha = typeof firstRecord?.fecha === 'string' ? firstRecord.fecha : null;
  const unidad = typeof record.unidad_medida === 'string' ? record.unidad_medida : null;

  return { valor, unidad, fecha, raw, url, source: 'direct' };
}

async function fetchIndicadorDirect(url: string, timeoutMs = 5000): Promise<IndicadorResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FinancialAgent/1.0 (mindicador)',
      },
    });

    if (!res.ok) {
      throw new Error(`mindicador HTTP ${res.status}`);
    }

    const text = await res.text();
    const parsed = parseMindicadorJson(text, url);
    if (parsed.valor === null) {
      throw new Error('mindicador response missing valor');
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchIndicadorViaScrapeDo(url: string): Promise<IndicadorResult> {
  const fetched = await fetchWithScrapeDo({
    url,
    render: false,
    output: 'raw',
    blockResources: true,
    returnJSON: false,
  });

  const parsed = parseMindicadorJson(fetched.text, url);
  return { ...parsed, source: 'scrape_do' };
}

/**
 * Public mindicador.cl JSON API — direct fetch first (free), Scrape.do fallback when configured.
 */
export async function fetchIndicador(ind: IndicadorKind): Promise<IndicadorResult> {
  const url = `https://mindicador.cl/api/${ind}`;

  try {
    return await fetchIndicadorDirect(url);
  } catch (directErr) {
    if (!process.env.SCRAPE_DO_API_KEY) {
      throw directErr;
    }
    return fetchIndicadorViaScrapeDo(url);
  }
}
