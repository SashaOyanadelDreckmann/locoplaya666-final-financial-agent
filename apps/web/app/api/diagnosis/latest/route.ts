import { NextRequest, NextResponse } from 'next/server';

import { getServerApiBaseUrl } from '@/lib/api/base';
import { requireBackendSession } from '@/lib/sesion/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireBackendSession(request);
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const cookie = request.headers.get('cookie') ?? '';
  const target = `${getServerApiBaseUrl()}/diagnosis/latest`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      headers: { cookie },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    const responseHeaders = new Headers({ 'content-type': contentType });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) responseHeaders.set('set-cookie', setCookie);

    return new NextResponse(text, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'UPSTREAM_ERROR', detail: 'Diagnosis upstream unavailable' } },
      { status: 502 },
    );
  }
}
