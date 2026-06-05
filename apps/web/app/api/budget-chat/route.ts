import { NextResponse } from 'next/server';
import { requireBackendSession } from '@/lib/serverAuth';
import { getApiBaseUrl } from '@/lib/apiBase';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  let session: { userId: string };
  try {
    session = await requireBackendSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const rl = checkRateLimit(`budget-chat:${session.userId}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  const cookie = req.headers.get('cookie') ?? '';
  const csrfToken = req.headers.get('x-csrf-token') ?? '';
  const body = await req.text();
  try {
    const apiRes = await fetch(`${getApiBaseUrl()}/api/budget-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie && { cookie }),
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
      body,
    });

    const raw = await apiRes.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : { ok: false, error: 'Empty upstream response' };
    } catch {
      data = { ok: false, error: 'Invalid upstream response', detail: raw.slice(0, 240) };
    }
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Upstream request failed' }, { status: 502 });
  }
}
