import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
