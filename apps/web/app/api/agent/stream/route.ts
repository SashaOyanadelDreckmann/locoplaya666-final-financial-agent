import { NextRequest, NextResponse } from 'next/server';

import { resolveCoreAgentProxyTimeoutMs } from '@financial-agent/shared';

import { getInternalApiBaseUrl } from '@/lib/api/base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_TIMEOUT_MS = resolveCoreAgentProxyTimeoutMs(
  process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS,
);

function pickHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const backendBase = getInternalApiBaseUrl();
  const target = `${backendBase}/api/agent?stream=1`;
  const body = await request.text();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
  };
  const cookie = pickHeader(request, 'cookie');
  if (cookie) headers.cookie = cookie;
  const csrf = pickHeader(request, 'x-csrf-token');
  if (csrf) headers['x-csrf-token'] = csrf;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: 'POST',
        headers,
        body,
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseHeaders = new Headers({
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const setCookie = upstream.headers.get('set-cookie');
    const csrfToken = upstream.headers.get('x-csrf-token');
    if (setCookie) responseHeaders.set('set-cookie', setCookie);
    if (csrfToken) responseHeaders.set('x-csrf-token', csrfToken);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          detail: 'Agent stream upstream unavailable',
        },
      },
      { status: 504 },
    );
  }
}
