import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

import { requireBackendSession } from '@/lib/sesion/serverAuth';
import { checkRateLimit } from '@/lib/compartido/rateLimit';
import { getBubbleReportFilePath, safeBubbleReportFilename } from '@/lib/compartido/bubble-pdf-storage';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const session = await requireBackendSession(req);
    const rl = checkRateLimit(`bubble-pdf-file:${session.userId}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const url = new URL(req.url);
    const file = safeBubbleReportFilename(url.searchParams.get('file') ?? '');
    if (!file) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }

    const filePath = getBubbleReportFilePath(session.userId, file);
    const bytes = await fs.readFile(filePath);
    const isPdf = file.endsWith('.pdf');

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : 'image/png',
        'Content-Disposition': `inline; filename="${file}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File not found';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Inicia sesión para ver el PDF.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
