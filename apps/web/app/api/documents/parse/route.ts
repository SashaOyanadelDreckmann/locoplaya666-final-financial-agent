import { NextRequest, NextResponse } from 'next/server';
import { getServerApiBaseUrl } from '@/lib/api/base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FORWARD_TIMEOUT_MS = 115_000;
const MAX_BODY_BYTES = 70 * 1024 * 1024; // 70 MB — matches Express backend limit
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 700;

function pickHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const target = `${getServerApiBaseUrl()}/api/documents/parse`;
  const body = await request.text();

  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', detail: `El cuerpo supera ${MAX_BODY_BYTES / 1024 / 1024} MB.` } },
      { status: 413 },
    );
  }

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
    const csrfToken = upstream.headers.get('x-csrf-token');
    const cacheControl = upstream.headers.get('cache-control');
    if (csrfToken) responseHeaders.set('x-csrf-token', csrfToken);
    if (cacheControl) responseHeaders.set('cache-control', cacheControl);

    return new NextResponse(text, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const detail =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Document parse upstream timeout'
        : 'Document parse upstream unavailable';

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          detail,
        },
      },
      { status: 504 },
    );
  }
}
