import { NextRequest, NextResponse } from 'next/server';

import { getAgentApiBaseUrl } from '@/lib/apiBase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_TIMEOUT_MS = 85_000;

function pickHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const backendBase = getAgentApiBaseUrl();
  const target = `${backendBase}/api/agent`;
  const body = await request.text();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(pickHeader(request, 'cookie') ? { cookie: pickHeader(request, 'cookie') as string } : {}),
        ...(pickHeader(request, 'x-csrf-token')
          ? { 'x-csrf-token': pickHeader(request, 'x-csrf-token') as string }
          : {}),
      },
      body,
      cache: 'no-store',
      signal: controller.signal,
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': contentType,
      },
    });
  } catch (error: unknown) {
    const detail =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Agent upstream timeout'
        : 'Agent upstream unavailable';

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          detail,
        },
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
