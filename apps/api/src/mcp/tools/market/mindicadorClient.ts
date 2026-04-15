import { fetchWithScrapeDo } from '../web/scrapeDoClient';

export async function fetchIndicador(ind: 'dolar' | 'uf' | 'utm' | 'tpm'): Promise<{
  valor: number | null;
  unidad: string | null;
  fecha: string | null;
  raw: any;
  url: string;
}> {
  // Public endpoint used widely; returns JSON with series array.
  const url = `https://mindicador.cl/api/${ind}`;

  const fetched = await fetchWithScrapeDo({
    url,
    render: false,
    output: 'raw',
    blockResources: true,
    returnJSON: false,
  });

  let raw: any = null;
  try { raw = JSON.parse(fetched.text); } catch { raw = null; }

  const series = raw?.serie;
  const first = Array.isArray(series) ? series[0] : null;

  const valor = typeof first?.valor === 'number' ? first.valor : null;
  const fecha = typeof first?.fecha === 'string' ? first.fecha : null;
  const unidad = typeof raw?.unidad_medida === 'string' ? raw.unidad_medida : null;

  return { valor, unidad, fecha, raw, url };
}
