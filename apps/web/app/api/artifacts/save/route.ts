import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';

type Body = {
  id: string;
  title?: string;
  fileUrl?: string; // puede ser relativa (/pdfs/...) o absoluta (http...)
};

function safeId(id: string) {
  return String(id || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

// SECURITY: Allowlist of trusted origins for absolute URLs.
// Only the app's own API origin is permitted to prevent SSRF.
function getAllowedOrigins(): string[] {
  const origins: string[] = [
    process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001',
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000',
  ];
  // Optional: comma-separated extra trusted origins
  if (process.env.PDF_FETCH_ALLOWED_ORIGINS) {
    origins.push(...process.env.PDF_FETCH_ALLOWED_ORIGINS.split(',').map((o) => o.trim()));
  }
  return origins.filter(Boolean);
}

function validateFetchUrl(fileUrl: string): string {
  const isAbs = /^https?:\/\//i.test(fileUrl);
  if (!isAbs) {
    // Relative URLs are always resolved to the trusted API origin — safe.
    return `${process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001'}${fileUrl}`;
  }

  // For absolute URLs, validate against the allowlist.
  const allowed = getAllowedOrigins();
  try {
    const parsed = new URL(fileUrl);
    const origin = parsed.origin; // e.g. "https://api.myapp.com"
    if (!allowed.some((a) => origin === new URL(a).origin)) {
      throw new Error(`URL origin not allowed: ${origin}`);
    }
  } catch (e: any) {
    throw new Error(`Invalid or disallowed fileUrl: ${e.message}`);
  }
  return fileUrl;
}

async function fetchPdfBytes(fileUrl: string) {
  const url = validateFetchUrl(fileUrl);
  // redirect:'error' prevents SSRF via open-redirect on allowed origins
  const res = await fetch(url, { cache: 'no-store', redirect: 'error' });
  if (!res.ok) throw new Error(`No se pudo descargar PDF (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function POST(req: Request) {
  try {
    const session = await requireBackendSession(req);

    const rl = checkRateLimit(`artifacts:${session.userId}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const body = (await req.json()) as Body;

    if (!body?.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    if (!body?.fileUrl) {
      return NextResponse.json({ error: 'Missing fileUrl' }, { status: 400 });
    }

    const id = safeId(body.id);
    const userSegment = safeId(session.userId);
    // Store outside of public/ so Next.js doesn't serve them statically
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), '..', '..', 'data');
    const outDir = path.join(dataDir, 'pdfs', userSegment);
    const outPath = path.join(outDir, `${id}.pdf`);
    await fs.mkdir(outDir, { recursive: true });

    const bytes = await fetchPdfBytes(body.fileUrl);
    await fs.writeFile(outPath, bytes);

    // URL served by the authenticated backend endpoint
    const backendOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
    const publicUrl = `${backendOrigin}/api/pdfs/serve?file=${id}.pdf`;
    return NextResponse.json({ ok: true, publicUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Save error' },
      { status: 500 }
    );
  }
}
