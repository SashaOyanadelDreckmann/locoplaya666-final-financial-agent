import { NextRequest, NextResponse } from 'next/server';

import { getAgentApiBaseUrl } from '@/lib/apiBase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_TIMEOUT_MS = 85_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 450;

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
  }
}
