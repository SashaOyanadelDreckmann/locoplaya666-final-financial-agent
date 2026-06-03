import { NextResponse } from 'next/server';
import { requireBackendSession } from '@/lib/serverAuth';
import { getApiBaseUrl } from '@/lib/apiBase';

export async function DELETE(req: Request) {
  try {
    await requireBackendSession(req);

    const url = new URL(req.url);
    const file = url.searchParams.get('file')?.trim() ?? '';
    const previewFile = url.searchParams.get('previewFile')?.trim() ?? '';
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const upstreamUrl = new URL(`${getApiBaseUrl()}/api/pdfs/delete`);
    upstreamUrl.searchParams.set('file', file);
    if (previewFile) upstreamUrl.searchParams.set('previewFile', previewFile);

    const res = await fetch(upstreamUrl.toString(), {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        cookie: req.headers.get('cookie') ?? '',
        'X-CSRF-Token': req.headers.get('x-csrf-token') ?? '',
      },
    });

    const bodyText = await res.text();
    return new NextResponse(bodyText, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
}
