export type ScrapeDoArgs = {
  url: string;
  render?: boolean;
  device?: 'desktop' | 'mobile' | 'tablet';
  geoCode?: string;
  timeout?: number;
  output?: 'raw' | 'markdown';
  blockResources?: boolean;
  returnJSON?: boolean;
};

/**
 * Fetch through Scrape.do (API mode).
 * Uses env SCRAPE_DO_API_KEY (matches your .env).
 */
export async function fetchWithScrapeDo(args: ScrapeDoArgs): Promise<{
  status: number;
  contentType: string;
  text: string;
  json?: any;
}> {
  const token = process.env.SCRAPE_DO_API_KEY;
  if (!token) throw new Error('SCRAPE_DO_API_KEY not set');

  const params = new URLSearchParams();
  params.set('token', token);
  params.set('url', String(args.url));

  if (typeof args.render === 'boolean') params.set('render', String(args.render));
  if (args.device) params.set('device', String(args.device));
  if (args.geoCode) params.set('geoCode', String(args.geoCode));
  if (typeof args.timeout === 'number') params.set('timeout', String(args.timeout));
  if (args.output) params.set('output', String(args.output));
  if (typeof args.blockResources === 'boolean') params.set('blockResources', String(args.blockResources));
  if (typeof args.returnJSON === 'boolean') params.set('returnJSON', String(args.returnJSON));

  const endpoint = `https://api.scrape.do/?${params.toString()}`;

  const res = await fetch(endpoint, { method: 'GET' });
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Scrape.do error ${res.status}: ${text.slice(0, 300)}`);
  }

  let json: any | undefined;
  if (contentType.includes('application/json')) {
    try { json = JSON.parse(text); } catch { /* ignore */ }
  }

  return { status: res.status, contentType, text, json };
}
