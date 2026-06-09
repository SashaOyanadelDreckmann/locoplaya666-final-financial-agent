import { NextResponse } from 'next/server';

import { getServerApiBaseUrl } from '@/lib/apiBase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ApiReadyPayload = {
  ready?: boolean;
  status?: string;
  checks?: Record<string, unknown>;
};

async function fetchApiReadiness(): Promise<{ ok: boolean; status: number; payload: ApiReadyPayload | null }> {
  const apiBase = getServerApiBaseUrl().replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${apiBase}/health/ready`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    const payload = (await res.json().catch(() => null)) as {
      data?: ApiReadyPayload;
    } | null;

    const readyPayload = payload?.data ?? (payload as ApiReadyPayload | null);
    const ready = readyPayload?.ready === true;

    return { ok: ready && res.ok, status: res.status, payload: readyPayload };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  try {
    const api = await fetchApiReadiness();

    if (api.ok) {
      return NextResponse.json(
        {
          ok: true,
          service: 'web',
          ready: true,
          api: api.payload,
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        service: 'web',
        ready: false,
        api: api.payload,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'upstream readiness check failed';
    return NextResponse.json(
      {
        ok: false,
        service: 'web',
        ready: false,
        error: detail,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
