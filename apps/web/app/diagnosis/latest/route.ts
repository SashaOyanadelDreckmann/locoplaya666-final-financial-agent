import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/apiBase';
import { parseApiResponse } from '@/lib/apiEnvelope';

export async function GET(request: Request) {
  try {
    const cookie = request.headers.get('cookie');
    const res = await fetch(
      `${getApiBaseUrl()}/diagnosis/latest`,
      {
        cache: 'no-store',
        headers: cookie ? { cookie } : undefined,
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'No se pudo obtener diagnóstico' },
        { status: res.status }
      );
    }

    const data = await parseApiResponse<Record<string, unknown>>(res);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Error conectando con backend' },
      { status: 500 }
    );
  }
}
