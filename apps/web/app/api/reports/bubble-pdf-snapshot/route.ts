import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import { getBubbleReportsDir, buildBubbleReportPublicUrls } from '@/lib/bubble-pdf-storage';
import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { launchBubblePdfBrowser, readKatexCss } from '@/lib/bubble-pdf-browser';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
        { error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = (await req.json()) as Body;
    if (!body?.html || !body?.css) {
      return NextResponse.json({ error: 'Faltan html/css para generar el PDF' }, { status: 400 });
    }

    const title = String(body.title ?? 'Informe diagnóstico financiero').trim() || 'Informe diagnóstico financiero';
    const subtitle =
      String(body.subtitle ?? 'Síntesis profesional del contexto, evidencia disponible y próximos pasos.').trim() ||
      'Síntesis profesional del contexto, evidencia disponible y próximos pasos.';

    let browser;
    try {
      browser = await launchBubblePdfBrowser();
    } catch {
      return NextResponse.json(
        {
          error:
            'No hay navegador headless disponible para generar el PDF. En producción debe existir Chromium (CHROME_PATH).',
        },
        { status: 503 },
      );
    }

    const katexCss = await readKatexCss();

    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 2200 },
        deviceScaleFactor: 2,
      });

      const documentHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${katexCss}
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

      await page.setContent(documentHtml, { waitUntil: 'load', timeout: 45_000 });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(async () => {
        if ('fonts' in document) {
          await document.fonts.ready;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });

      const slug = safeSlug(title);
      const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const outDir = getBubbleReportsDir(session.userId);
      await fs.mkdir(outDir, { recursive: true });

      const pdfFileName = `${slug}-${suffix}.pdf`;
      const pngFileName = `${slug}-${suffix}.png`;
      const pdfPath = path.join(outDir, pdfFileName);
      const pngPath = path.join(outDir, pngFileName);

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

      const urls = buildBubbleReportPublicUrls(session.userId, pdfFileName, pngFileName);

      const artifact = {
        id: `${slug}-${suffix}`,
        type: 'pdf' as const,
        title,
        description: subtitle,
        fileUrl: urls.fileUrl,
        previewImageUrl: urls.previewImageUrl,
        source: 'diagnostic' as const,
        createdAt: new Date().toISOString(),
      };

      return NextResponse.json({ ok: true, artifact });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Snapshot PDF error';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: 'Inicia sesión para guardar el PDF en biblioteca.' },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
