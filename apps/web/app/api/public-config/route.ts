import { NextResponse } from 'next/server';
import { buildRuntimePublicConfig } from '@/lib/compartido/runtimePublicConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: buildRuntimePublicConfig(),
  });
}
