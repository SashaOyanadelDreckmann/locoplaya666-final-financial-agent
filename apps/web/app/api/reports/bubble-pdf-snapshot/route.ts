import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium } from 'playwright-core';

import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

type Body = {
  title?: string;
  subtitle?: string;
  html?: string;
  css?: string;
};

function safeSlug(value: string) {
  return String(value || 'report')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'report';
}

function getChromeExecutablePathCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean) as string[];
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: Request) {
  try {
    const session = await requireBackendSession(req);
    const rl = checkRateLimit(`bubble-pdf:${session.userId}`, 8, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const body = (await req.json()) as Body;
    if (!body?.html || !body?.css) {
      return NextResponse.json({ error: 'Missing html/css' }, { status: 400 });
    }

    const title = String(body.title ?? 'Informe diagnóstico financiero').trim() || 'Informe diagnóstico financiero';
    const subtitle =
      String(body.subtitle ?? 'Síntesis profesional del contexto, evidencia disponible y próximos pasos.').trim() ||
      'Síntesis profesional del contexto, evidencia disponible y próximos pasos.';

    const chromePath =
      (await (async () => {
        for (const candidate of getChromeExecutablePathCandidates()) {
          if (await pathExists(candidate)) return candidate;
        }
        return '';
      })()) || '';
    if (!chromePath) {
      return NextResponse.json(
        { error: 'No se encontró Google Chrome para generar el PDF' },
        { status: 500 }
      );
    }

    const browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
    });

    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 2200 },
        deviceScaleFactor: 1,
      });

      const documentHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${body.css}
      html, body {
        margin: 0;
        padding: 0;
        background: #f5f1e8;
      }
    </style>
  </head>
  <body>${body.html}</body>
</html>`;

      await page.setContent(documentHtml, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });

      const slug = safeSlug(title);
      const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const relativeDir = path.join('generated', 'reports', safeSlug(session.userId));
      const publicDir = path.join(process.cwd(), 'public', relativeDir);
      await fs.mkdir(publicDir, { recursive: true });

      const pdfFileName = `${slug}-${suffix}.pdf`;
      const pngFileName = `${slug}-${suffix}.png`;
      const pdfPath = path.join(publicDir, pdfFileName);
      const pngPath = path.join(publicDir, pngFileName);

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });
      await page.screenshot({
        path: pngPath,
        fullPage: false,
        type: 'png',
      });

      const artifact = {
        id: `${slug}-${suffix}`,
        type: 'pdf' as const,
        title,
        description: subtitle,
        fileUrl: `/${relativeDir}/${pdfFileName}`,
        previewImageUrl: `/${relativeDir}/${pngFileName}`,
        source: 'diagnostic' as const,
        createdAt: new Date().toISOString(),
      };

      return NextResponse.json({ ok: true, artifact });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Snapshot PDF error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
