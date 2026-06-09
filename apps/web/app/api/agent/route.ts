import { NextRequest, NextResponse } from 'next/server';

import {
  CORE_AGENT_PROXY_RETRY_DELAY_MS,
  resolveCoreAgentProxyTimeoutMs,
} from '@financial-agent/shared';

import { getAgentApiBaseUrl } from '@/lib/apiBase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_TIMEOUT_MS = resolveCoreAgentProxyTimeoutMs(
  process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS,
);
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAY_MS = CORE_AGENT_PROXY_RETRY_DELAY_MS;

function pickHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const backendBase = getAgentApiBaseUrl();
  const target = `${backendBase}/api/agent`;
  const body = await request.text();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const cookie = pickHeader(request, 'cookie');
  if (cookie) headers.cookie = cookie;
  const csrf = pickHeader(request, 'x-csrf-token');
  if (csrf) headers['x-csrf-token'] = csrf;

  try {
    async function fetchUpstream() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
      try {
        return await fetch(target, {
          method: 'POST',
          headers,
          body,
          cache: 'no-store',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    let upstream = await fetchUpstream();
    if (RETRYABLE_STATUS.has(upstream.status)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      upstream = await fetchUpstream();
    }

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    const responseHeaders = new Headers({
      'content-type': contentType,
    });
    const setCookie = upstream.headers.get('set-cookie');
    const csrf = upstream.headers.get('x-csrf-token');
    const cacheControl = upstream.headers.get('cache-control');

    if (setCookie) responseHeaders.set('set-cookie', setCookie);
    if (csrf) responseHeaders.set('x-csrf-token', csrf);
    if (cacheControl) responseHeaders.set('cache-control', cacheControl);

    return new NextResponse(text, {
      status: upstream.status,
      headers: responseHeaders,
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
  }
}
