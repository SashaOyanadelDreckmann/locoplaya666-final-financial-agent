import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SimulationArtifact } from '../simulations/simulation.service';
import { completeWithClaude } from '../llm.service';
import {
  generateNarrativePdf,
  getSimulationArtifactsDir,
} from '../simulations/simulation.service';

export type ProfessionalPdfInput = {
  title: string;
  subtitle?: string;
  style?: 'corporativo' | 'minimalista' | 'tecnico' | 'premium_dark';
  source?: 'simulation' | 'analysis' | 'diagnostic';
  sections?: Array<{ heading: string; body: string }>;
  tables?: Array<{
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    align?: Array<'left' | 'center' | 'right'>;
  }>;
  charts?: Array<{
    title: string;
    subtitle?: string;
    kind?: 'line' | 'bar' | 'area';
    labels: string[];
    values: number[];
  }>;
};

type ConversationContext = {
  userMessage?: string;
  history?: Array<{ role?: string; content?: string }>;
  citations?: Array<{ source?: string; title?: string; url?: string }>;
};

function escapeHtml(text: string) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractHtmlFromModel(raw: string) {
  if (!raw) return '';
  const codeBlock = raw.match(/```html\s*([\s\S]*?)```/i);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  if (/<(article|main|section|div|h1|h2|p|ul|ol|table)\b/i.test(raw)) return raw.trim();
  return '';
}

async function composeHtmlWithAnthropic(
  input: ProfessionalPdfInput,
  context?: ConversationContext
): Promise<string> {
  const compactHistory = (context?.history ?? []).slice(-16).map((h) => ({
    role: h.role ?? 'user',
    content: String(h.content ?? '').slice(0, 900),
  }));
  const compactCitations = (context?.citations ?? []).slice(0, 10).map((c) => ({
    source: c.source,
    title: c.title,
    url: c.url,
  }));

  const prompt = [
    'Devuelve SOLO HTML válido (sin markdown, sin ```), listo para imprimir en PDF.',
    'Usa estructura profesional: portada breve, resumen ejecutivo, secciones, hallazgos accionables, siguiente plan de acción.',
    'Incluye SOLO contenido relevante de la conversación y contexto entregado.',
    'No inventes datos numéricos no respaldados por contexto.',
    'Mantén tono senior, sobrio y ejecutivo.',
    '',
    `Título: ${input.title}`,
    `Subtítulo: ${input.subtitle ?? ''}`,
    `Solicitud actual: ${context?.userMessage ?? ''}`,
    `Secciones sugeridas: ${JSON.stringify(input.sections ?? [])}`,
    `Tablas sugeridas: ${JSON.stringify(input.tables ?? [])}`,
    `Gráficos sugeridos: ${JSON.stringify(input.charts ?? [])}`,
    `Historial reciente: ${JSON.stringify(compactHistory)}`,
    `Fuentes/citas disponibles: ${JSON.stringify(compactCitations)}`,
    '',
    'Entrega únicamente el contenido dentro de <main>...</main>.',
  ].join('\n');

  const raw = await completeWithClaude(prompt, {
    systemPrompt:
      'Eres un redactor financiero senior especializado en informes ejecutivos de alta calidad visual.',
    temperature: 0.35,
  });

  return extractHtmlFromModel(raw);
}

function buildFallbackHtml(input: ProfessionalPdfInput) {
  const sections = (input.sections ?? [])
    .slice(0, 10)
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body).replace(/\n/g, '<br/>')}</p></section>`
    )
    .join('\n');

  return `<main>
    <header>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="subtitle">${escapeHtml(input.subtitle ?? '')}</p>
    </header>
    <section>
      <h2>Resumen ejecutivo</h2>
      <p>Informe profesional generado con el contexto más relevante de la conversación.</p>
    </section>
    ${sections}
  </main>`;
}

function wrapStyledHtml(bodyHtml: string) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{
      --bg:#0b0b0c;
      --text:#f1f5f9;
      --secondary:#7ea6bf;
      --muted:#9cb8cc;
      --rule:#2a3b47;
    }
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:A4;margin:0;background:var(--bg)}
    html,body{margin:0;padding:0;background:var(--bg)!important;color:var(--text);font-family:"Times New Roman", Times, serif;line-height:1.55}
    body{min-height:100vh}
    .page{padding:18mm 14mm 16mm 14mm;background:var(--bg);min-height:calc(297mm - 34mm)}
    h1{font-size:30px;line-height:1.2;margin:0 0 8px;color:var(--text)}
    .subtitle{margin:0 0 18px;color:var(--muted);font-size:14px}
    h2{font-size:20px;margin:22px 0 8px;color:var(--secondary);border-bottom:1px solid var(--rule);padding-bottom:6px}
    p,li{font-size:13px;color:var(--text)}
    ul,ol{padding-left:20px}
    table{width:100%;border-collapse:collapse;margin:12px 0 18px}
    th,td{border:1px solid var(--rule);padding:8px 10px;font-size:12px}
    th{color:var(--secondary);text-align:left}
    blockquote{margin:10px 0;padding:10px 12px;border-left:3px solid var(--secondary);color:var(--muted);background:#10161b}
    .kpi{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .card{border:1px solid var(--rule);padding:10px 12px;background:#0f151a}
    .card .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
    .card .value{font-size:18px;color:var(--text);font-weight:700}
  </style>
</head>
<body>
  <div class="page">${bodyHtml}</div>
</body>
</html>`;
}

async function renderHtmlToPdf(pdfPath: string, html: string) {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      format: 'A4',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
  } finally {
    await browser.close();
  }
}

/**
 * Genera PDF profesional desde HTML (compuesto por Anthropic con contexto del chat).
 * Si falla renderer HTML->PDF, hace fallback a renderer narrativo estable.
 */
export async function generateProfessionalReportPdf(
  input: ProfessionalPdfInput,
  userId = 'anonymous',
  context?: ConversationContext
): Promise<SimulationArtifact> {
  const normalized: ProfessionalPdfInput = { ...input, style: 'premium_dark' };
  const now = new Date();
  const createdAt = now.toISOString();
  const id = `rep-${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const outDir = getSimulationArtifactsDir(userId);
  const pdfName = `${id}.pdf`;
  const pdfPath = path.join(outDir, pdfName);

  try {
    const modelHtml = await composeHtmlWithAnthropic(normalized, context);
    const body = modelHtml || buildFallbackHtml(normalized);
    const fullHtml = wrapStyledHtml(body);
    await renderHtmlToPdf(pdfPath, fullHtml);

    return {
      id,
      type: 'pdf',
      title: normalized.title,
      description: normalized.subtitle ?? `Informe generado ${now.toLocaleDateString('es-CL')}`,
      fileUrl: `/api/pdfs/serve?file=${pdfName}`,
      previewImageUrl: '',
      source: normalized.source ?? 'analysis',
      createdAt,
      saved: false,
      meta: {
        kind: 'professional_html_pdf',
        sections: normalized.sections?.length ?? 0,
        tables: normalized.tables?.length ?? 0,
        charts: normalized.charts?.length ?? 0,
      },
    };
  } catch {
    return await generateNarrativePdf(normalized, userId);
  }
}
