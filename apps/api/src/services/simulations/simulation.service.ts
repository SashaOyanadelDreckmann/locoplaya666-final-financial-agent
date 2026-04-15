import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import PDFDocument from 'pdfkit';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import crypto from 'crypto';

const TIMES_NEW_ROMAN_REGULAR = 'TimesNewRoman-Regular';
const TIMES_NEW_ROMAN_BOLD = 'TimesNewRoman-Bold';
let ACTIVE_PDF_FONT_REGULAR = 'Times-Roman';
let ACTIVE_PDF_FONT_BOLD = 'Times-Bold';

function registerPdfFonts(doc: any) {
  const projectCandidates = [
    path.join(findRepoRoot(process.cwd()), 'apps', 'api', 'assets', 'fonts'),
    path.join(process.cwd(), 'apps', 'api', 'assets', 'fonts'),
    path.join(process.cwd(), 'assets', 'fonts'),
  ];

  const candidatePairs = [
    ['Times New Roman.ttf', 'Times New Roman Bold.ttf'],
    ['times.ttf', 'timesbd.ttf'],
    ['OpenSans-Regular.ttf', 'OpenSans-Bold.ttf'],
  ] as const;

  for (const base of projectCandidates) {
    for (const [regularFile, boldFile] of candidatePairs) {
      const regularPath = path.join(base, regularFile);
      const boldPath = path.join(base, boldFile);
      if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
        doc.registerFont(TIMES_NEW_ROMAN_REGULAR, regularPath);
        doc.registerFont(TIMES_NEW_ROMAN_BOLD, boldPath);
        ACTIVE_PDF_FONT_REGULAR = TIMES_NEW_ROMAN_REGULAR;
        ACTIVE_PDF_FONT_BOLD = TIMES_NEW_ROMAN_BOLD;
        return { regular: ACTIVE_PDF_FONT_REGULAR, bold: ACTIVE_PDF_FONT_BOLD };
      }
    }
  }

  ACTIVE_PDF_FONT_REGULAR = 'Times-Roman';
  ACTIVE_PDF_FONT_BOLD = 'Times-Bold';
  return { regular: 'Times-Roman', bold: 'Times-Bold' };
}

function footerY(doc: any) {
  return doc.page.height - doc.page.margins.bottom - 14;
}

function escapeLatex(text: string) {
  return String(text ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function latexCompilerCommand(): string | null {
  const candidates = ['pdflatex', 'xelatex', 'lualatex'];
  for (const cmd of candidates) {
    const ok = spawnSync('sh', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' });
    if (ok.status === 0) return cmd;
  }
  return null;
}

function buildLatexDocument(input: NarrativePdfInput, createdAt: Date) {
  const sections = Array.isArray(input.sections) ? input.sections.slice(0, 12) : [];
  const tables = Array.isArray(input.tables) ? input.tables.slice(0, 3) : [];
  const charts = Array.isArray(input.charts) ? input.charts.slice(0, 3) : [];

  const sectionLatex = sections
    .map((s) => `\\section{${escapeLatex(s.heading)}}\n${escapeLatex(s.body)}`)
    .join('\n\n');
  const tableLatex = tables
    .map((t) => {
      const cols = t.columns.slice(0, 5);
      const spec = `|${cols.map(() => 'p{0.17\\linewidth}').join('|')}|`;
      const header = cols.map((c) => `\\textbf{${escapeLatex(c)}}`).join(' & ');
      const rows = (t.rows ?? [])
        .slice(0, 12)
        .map((r) => r.slice(0, cols.length).map((c) => escapeLatex(String(c ?? ''))).join(' & '))
        .join(' \\\\\n\\hline\n');
      return `\\section{${escapeLatex(t.title)}}\n\\begin{longtable}{${spec}}\n\\hline\n${header} \\\\\n\\hline\n${rows}\n\\\\\n\\hline\n\\end{longtable}`;
    })
    .join('\n\n');
  const chartLatex = charts
    .map((c) => {
      const pairs = c.labels.slice(0, 8).map((l, i) => `- ${escapeLatex(l)}: ${escapeLatex(String(c.values?.[i] ?? ''))}`);
      return `\\section{${escapeLatex(c.title)}}\n${escapeLatex(c.subtitle || 'Resumen de datos para visualización.')}\n\n${pairs
        .map((p) => `${p}\\\\`)
        .join('\n')}`;
    })
    .join('\n\n');

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[top=2.35cm,bottom=2.35cm,left=2.35cm,right=2.35cm,headheight=15pt]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{mathpazo}
\\usepackage{microtype}
\\usepackage{xcolor}
\\definecolor{bgblack}{HTML}{0B0B0C}
\\definecolor{textwhite}{HTML}{D7D5CF}
\\definecolor{textsoft}{HTML}{9CB8CC}
\\definecolor{textmuted}{HTML}{7EA6BF}
\\definecolor{rulecolor}{HTML}{4E5640}
\\definecolor{paneldark}{HTML}{F1F1F1}
\\definecolor{panelsoft}{HTML}{4E5640}
\\definecolor{accentwine}{HTML}{9CB8CC}
\\definecolor{accentolive}{HTML}{7EA6BF}
\\definecolor{accentmustard}{HTML}{B8D4E3}
\\usepackage{pagecolor}
\\pagecolor{bgblack}
\\color{textwhite}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{colortbl}
\\usepackage{multirow}
\\usepackage{multicol}
\\usepackage{enumitem}
\\usepackage{longtable}
\\usepackage{ragged2e}
\\usepackage{makecell}
\\usepackage{caption}
\\usepackage{etoolbox}
\\usepackage{quoting}
\\usepackage{tcolorbox}
\\tcbuselibrary{skins,breakable}
\\arrayrulecolor{rulecolor}
\\setlength{\\arrayrulewidth}{0.35pt}
\\renewcommand{\\arraystretch}{1.18}
\\captionsetup{labelfont={color=textsoft},textfont={color=textsoft}}
\\AtBeginEnvironment{longtable}{\\color{textwhite}}
\\AtBeginEnvironment{tabular}{\\color{textwhite}}
\\AtBeginEnvironment{tabularx}{\\color{textwhite}}
\\quotingsetup{leftmargin=1.2em,rightmargin=0pt,vskip=4pt,font={\\color{textsoft}\\itshape}}
\\tcbset{
  insight/.style={enhanced,colback=accentolive!14!bgblack,colframe=accentolive,coltext=textwhite,arc=3pt,boxrule=0.8pt,left=10pt,right=10pt,top=7pt,bottom=7pt,fonttitle=\\small\\bfseries\\color{accentolive},breakable},
  alert/.style={enhanced,colback=accentwine!12!bgblack,colframe=accentwine,coltext=textwhite,arc=3pt,boxrule=0.8pt,left=10pt,right=10pt,top=7pt,bottom=7pt,fonttitle=\\small\\bfseries\\color{accentwine},breakable},
  warning/.style={enhanced,colback=accentmustard!14!bgblack,colframe=accentmustard,coltext=textwhite,arc=3pt,boxrule=0.8pt,left=10pt,right=10pt,top=7pt,bottom=7pt,fonttitle=\\small\\bfseries\\color{accentmustard},breakable},
  neutral/.style={enhanced,colback=paneldark,colframe=rulecolor,coltext=textwhite,arc=3pt,boxrule=0.6pt,left=10pt,right=10pt,top=7pt,bottom=7pt,fonttitle=\\small\\bfseries\\color{textwhite},breakable}
}
\\usepackage{titlesec}
\\titleformat{\\section}{\\Large\\bfseries\\color{textwhite}}{\\color{accentmustard}\\thesection.}{0.6em}{}[\\vspace{2pt}\\textcolor{accentmustard}{\\rule{\\linewidth}{1.1pt}}\\vspace{-4pt}]
\\titlespacing{\\section}{0pt}{22pt}{10pt}
\\titleformat{\\subsection}{\\normalsize\\bfseries\\color{textsoft}}{}{0em}{}
\\titlespacing{\\subsection}{0pt}{14pt}{4pt}
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{\\small\\color{textmuted}Informe financiero profesional}
\\rhead{\\small\\color{textmuted}Confidencial}
\\cfoot{\\small\\color{textmuted}\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}
\\makeatletter
\\renewcommand{\\headrule}{{\\color{rulecolor}\\hrule\\@height 0.4pt \\@width\\headwidth}}
\\makeatother
\\renewcommand{\\footrulewidth}{0pt}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{8pt}
\\linespread{1.34}
\\setlist[itemize]{leftmargin=1.4em,itemsep=3pt,topsep=4pt}
\\setlist[enumerate]{leftmargin=1.6em,itemsep=3pt,topsep=4pt}
\\usepackage{hyperref}
\\hypersetup{
  colorlinks=true,
  linkcolor=accentmustard,
  urlcolor=accentmustard,
  citecolor=accentolive,
  pdfauthor={Financiera Mente},
  pdftitle={Informe financiero profesional},
  pdfsubject={Analitica financiera personalizada}
}
\\begin{document}
{\\LARGE\\textbf{${escapeLatex(input.title)}}}\\\\
{\\small\\color{textmuted}${escapeLatex(
    input.subtitle ?? `Informe generado ${createdAt.toLocaleDateString('es-CL')}`
  )}}

\\section{Resumen ejecutivo}
${escapeLatex('Documento profesional generado con síntesis de conversación y contexto relevante.')}

${sectionLatex}

${chartLatex}

${tableLatex}
\\end{document}`;
}



type SimulationInput = {
  principal: number;
  annualRate: number;      // e.g. 0.05
  months: number;          // e.g. 12
  monthlyContribution: number; // e.g. 0
  title?: string;
  subtitle?: string;
  executiveSummary?: string;
  keyFindings?: string[];
  assumptions?: string[];
  contextHighlights?: string[];
};

type NarrativePdfInput = {
  title: string;
  subtitle?: string;
  sections?: Array<{ heading: string; body: string }>;
  style?: 'corporativo' | 'minimalista' | 'tecnico' | 'premium_dark';
  source?: 'simulation' | 'analysis' | 'diagnostic';
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

type NarrativeStyle = 'corporativo' | 'minimalista' | 'tecnico' | 'premium_dark';

type ReportTheme = {
  heading: string;
  text: string;
  muted: string;
  accent: string;
  divider: string;
  tableHeaderBg: string;
  tableBorder: string;
  chartLine: string;
  chartArea: string;
  chartBackground: string;
  pageBackground?: string;
  tableRowBg?: string;
};

export type SimulationArtifact = {
  id: string;
  type: 'pdf';
  title: string;
  description?: string;
  fileUrl: string;
  previewImageUrl: string;
  source: 'simulation' | 'analysis' | 'diagnostic';
  createdAt: string;
  saved?: boolean;
  meta?: Record<string, any>;
};

function findRepoRoot(start: string) {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cur, 'pnpm-workspace.yaml');
    if (fs.existsSync(candidate)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeUserSegment(userId: string) {
  return String(userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Returns (and ensures) the per-user artifacts directory (private, outside public/). */
export function getSimulationArtifactsDir(userId: string) {
  const base = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(findRepoRoot(process.cwd()), 'data');
  const dir = path.join(base, 'pdfs', safeUserSegment(userId));
  ensureDir(dir);
  return dir;
}

function monthlySeries(input: SimulationInput) {
  const r = input.annualRate / 12;
  const values: number[] = [];
  let balance = input.principal;

  for (let m = 1; m <= input.months; m++) {
    // aporte al inicio del mes
    balance += input.monthlyContribution;
    // interés mensual
    balance *= (1 + r);
    values.push(balance);
  }
  return values;
}

async function renderChartPng(labels: string[], data: number[]) {
  const width = 1200;
  const height = 700;
  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Saldo proyectado',
          data,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
            callback: (v: any) => {
              const n = Number(v);
              if (Number.isFinite(n)) return n.toLocaleString('es-CL');
              return v;
            },
          },
        },
      },
    },
  } as any;

  return chart.renderToBuffer(cfg);
}

function formatCLP(n: number) {
  // no es CLP necesariamente, pero el formato ejecutivo ayuda
  return Math.round(n).toLocaleString('es-CL');
}

function normalizeLines(lines?: string[], fallback: string[] = []) {
  const safe = Array.isArray(lines)
    ? lines
        .filter((x) => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
    : [];
  return safe.length > 0 ? safe : fallback;
}

function ensureSpace(doc: any, needed = 80, theme?: ReportTheme) {
  const maxY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > maxY) {
    doc.addPage();
    if (theme) paintNarrativePageBackground(doc, theme);
  }
}

function getReportTheme(style: NarrativeStyle): ReportTheme {
  if (style === 'premium_dark') {
    return {
      heading: '#f8fbff',
      text: '#edf4ff',
      muted: '#9cb8cc',
      accent: '#7ea6bf', // celeste opaco
      divider: '#445a6a',
      tableHeaderBg: '#1a2631',
      tableBorder: '#4d6576',
      chartLine: 'rgba(126,166,191,0.95)',
      chartArea: 'rgba(126,166,191,0.24)',
      chartBackground: '#0b1118',
      pageBackground: '#070b10',
      tableRowBg: '#0d141d',
    };
  }
  if (style === 'minimalista') {
    return {
      heading: '#111111',
      text: '#202020',
      muted: '#666666',
      accent: '#444444',
      divider: '#d4d4d4',
      tableHeaderBg: '#f5f5f5',
      tableBorder: '#c9c9c9',
      chartLine: 'rgba(75,85,99,0.95)',
      chartArea: 'rgba(107,114,128,0.24)',
      chartBackground: '#ffffff',
    };
  }
  if (style === 'tecnico') {
    return {
      heading: '#0b1f4d',
      text: '#102a43',
      muted: '#486581',
      accent: '#1f6feb',
      divider: '#8bb4ff',
      tableHeaderBg: '#eaf2ff',
      tableBorder: '#9ab8e5',
      chartLine: 'rgba(31,111,235,0.95)',
      chartArea: 'rgba(31,111,235,0.22)',
      chartBackground: '#ffffff',
    };
  }
  return {
    heading: '#0f172a',
    text: '#1f2937',
    muted: '#475569',
    accent: '#2563eb',
    divider: '#8aa0bf',
    tableHeaderBg: '#eef2ff',
    tableBorder: '#8ea0ba',
    chartLine: 'rgba(37,99,235,0.9)',
    chartArea: 'rgba(59,130,246,0.22)',
    chartBackground: '#ffffff',
  };
}

function paintNarrativePageBackground(doc: any, theme: ReportTheme) {
  if (!theme.pageBackground) return;
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.pageBackground);
  doc.restore();
}

function writeSectionTitle(doc: any, title: string, theme?: ReportTheme) {
  ensureSpace(doc, 40, theme);
  doc.moveDown(0.6);
  doc
    .fillColor(theme?.heading ?? '#0f172a')
    .font(ACTIVE_PDF_FONT_BOLD)
    .fontSize(11)
    .text(title.toUpperCase());
  doc.moveDown(0.2);
}

function writeBullets(doc: any, lines: string[], theme?: ReportTheme) {
  for (const line of lines) {
    ensureSpace(doc, 28, theme);
    doc
      .fillColor(theme?.text ?? '#1f2937')
      .font(ACTIVE_PDF_FONT_REGULAR)
      .fontSize(10)
      .text(`- ${line}`, { lineGap: 2 });
  }
}

function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('es-CL');
}

function summarizeSeries(values: number[]) {
  const safe = values.filter((v) => Number.isFinite(v));
  if (safe.length === 0) {
    return {
      start: 0,
      end: 0,
      min: 0,
      max: 0,
      delta: 0,
      trend: 'estable',
    };
  }
  const start = safe[0];
  const end = safe[safe.length - 1];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const delta = end - start;
  const trend = delta > 0 ? 'al alza' : delta < 0 ? 'a la baja' : 'estable';
  return { start, end, min, max, delta, trend };
}

function buildChartNarrative(args: {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
}) {
  const series = summarizeSeries(args.values);
  const fromLabel = args.labels[0] ?? 'inicio';
  const toLabel = args.labels[args.labels.length - 1] ?? 'cierre';
  const absDelta = Math.abs(series.delta);
  const pct =
    series.start !== 0
      ? ((series.delta / series.start) * 100).toFixed(1)
      : '0.0';

  const lead =
    args.subtitle?.trim() ||
    `El grafico "${args.title}" resume la evolucion entre ${fromLabel} y ${toLabel}.`;
  const detail = `Se observa una trayectoria ${series.trend}, con inicio en ${formatMetricValue(
    series.start
  )}, cierre en ${formatMetricValue(series.end)} y variacion de ${formatMetricValue(
    absDelta
  )} (${pct}%).`;
  const range = `Rango observado: minimo ${formatMetricValue(
    series.min
  )} y maximo ${formatMetricValue(series.max)}.`;

  return `${lead} ${detail} ${range}`;
}

function writeNarrativeCoverPage(args: {
  doc: any;
  title: string;
  subtitle: string;
  source: 'simulation' | 'analysis' | 'diagnostic';
  createdAt: Date;
  theme: ReportTheme;
}) {
  const { doc, title, subtitle, source, createdAt, theme } = args;

  doc
    .fillColor(theme.heading)
    .font(ACTIVE_PDF_FONT_BOLD)
    .fontSize(28)
    .text(title, { align: 'left', lineGap: 2 });
  doc.moveDown(0.6);

  doc
    .fillColor(theme.muted)
    .font(ACTIVE_PDF_FONT_REGULAR)
    .fontSize(12)
    .text(subtitle, { align: 'left', lineGap: 2 });

  doc.moveDown(1.4);
  doc
    .lineWidth(1)
    .strokeColor(theme.divider)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(1);

  doc
    .fillColor(theme.heading)
    .font(ACTIVE_PDF_FONT_BOLD)
    .fontSize(11)
    .text('Ficha del documento');
  doc.moveDown(0.3);

  const sourceLabel =
    source === 'diagnostic'
      ? 'Diagnostico'
      : source === 'simulation'
      ? 'Simulacion'
      : 'Analisis';

  const metadataRows = [
    ['Tipo de informe', sourceLabel],
    ['Fecha de emision', createdAt.toLocaleDateString('es-CL')],
    ['Hora de emision', createdAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })],
  ];

  for (const [label, value] of metadataRows) {
    doc
      .fillColor(theme.muted)
      .font(ACTIVE_PDF_FONT_REGULAR)
      .fontSize(9.2)
      .text(label.toUpperCase());
    doc
      .fillColor(theme.text)
      .font(ACTIVE_PDF_FONT_BOLD)
      .fontSize(11)
      .text(value);
    doc.moveDown(0.45);
  }

  doc.moveDown(0.6);
  doc
    .fillColor(theme.muted)
    .font(ACTIVE_PDF_FONT_REGULAR)
    .fontSize(9)
    .text(
      'Documento generado automaticamente a partir de la conversacion, contexto estructurado y evidencia disponible.',
      { lineGap: 2 }
    );
}

function writeGeneralIndexPage(args: {
  doc: any;
  theme: ReportTheme;
  sections: Array<{ heading: string; body: string }>;
  charts: Array<{ title: string }>;
  tables: Array<{ title: string }>;
}) {
  const { doc, theme, sections, charts, tables } = args;

  doc
    .fillColor(theme.heading)
    .font(ACTIVE_PDF_FONT_BOLD)
    .fontSize(18)
    .text('Indice general');
  doc.moveDown(0.35);
  doc
    .fillColor(theme.muted)
    .font(ACTIVE_PDF_FONT_REGULAR)
    .fontSize(10)
    .text(
      'Vista resumida del contenido del informe para lectura ejecutiva y navegacion rapida.',
      { lineGap: 2 }
    );
  doc.moveDown(0.7);

  writeSectionTitle(doc, 'Secciones narrativas', theme);
  if (sections.length === 0) {
    writeBullets(doc, ['No se incluyeron secciones narrativas.'], theme);
  } else {
    const lines = sections.slice(0, 12).map((s, idx) => `${idx + 1}. ${s.heading}`);
    writeBullets(doc, lines, theme);
  }

  writeSectionTitle(doc, 'Graficos incluidos', theme);
  if (charts.length === 0) {
    writeBullets(doc, ['No se incluyeron graficos en este documento.'], theme);
  } else {
    const lines = charts.slice(0, 12).map((c, idx) => `${idx + 1}. ${c.title}`);
    writeBullets(doc, lines, theme);
  }

  writeSectionTitle(doc, 'Tablas incluidas', theme);
  if (tables.length === 0) {
    writeBullets(doc, ['No se incluyeron tablas en este documento.'], theme);
  } else {
    const lines = tables.slice(0, 12).map((t, idx) => `${idx + 1}. ${t.title}`);
    writeBullets(doc, lines, theme);
  }
}

function writeChartIndexPage(args: {
  doc: any;
  theme: ReportTheme;
  charts: Array<{
    title: string;
    subtitle?: string;
    kind?: 'line' | 'bar' | 'area';
    labels: string[];
    values: number[];
  }>;
}) {
  const { doc, charts, theme } = args;
  if (charts.length === 0) return;

  doc
    .fillColor(theme.heading)
    .font(ACTIVE_PDF_FONT_BOLD)
    .fontSize(18)
    .text('Indice de graficos');
  doc.moveDown(0.35);
  doc
    .fillColor(theme.muted)
    .font(ACTIVE_PDF_FONT_REGULAR)
    .fontSize(10)
    .text(
      'Resumen ejecutivo de visualizaciones incluidas en el informe para lectura rapida y trazabilidad del analisis.'
    );
  doc.moveDown(0.8);

  charts.forEach((chart, idx) => {
    ensureSpace(doc, 90);
    doc
      .fillColor(theme.text)
      .font(ACTIVE_PDF_FONT_BOLD)
      .fontSize(11.5)
      .text(`${idx + 1}. ${chart.title}`);

    const pairs = Math.min(chart.labels.length, chart.values.length);
    const typeLabel =
      chart.kind === 'area' ? 'Area' : chart.kind === 'bar' ? 'Barras' : 'Linea';
    const summary = summarizeSeries(chart.values.slice(0, pairs));
    doc
      .fillColor(theme.muted)
      .font(ACTIVE_PDF_FONT_REGULAR)
      .fontSize(9.5)
      .text(
        `${chart.subtitle?.trim() || 'Sin subtitulo explicito.'} Tipo: ${typeLabel}. Puntos: ${pairs}. Tendencia: ${
          summary.trend
        }.`,
        { lineGap: 1.5 }
      );
    doc.moveDown(0.55);
  });
}

function asCellText(value: string | number | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('es-CL');
  }
  if (typeof value === 'string') return value;
  return '';
}

function isNumericCell(value: string | number | undefined): boolean {
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (typeof value !== 'string') return false;
  return /^[$]?\s*[\d.,-]+$/.test(value.trim());
}

function drawNarrativeTable(
  doc: any,
  table: {
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    align?: Array<'left' | 'center' | 'right'>;
  },
  theme?: ReportTheme
) {
  if (!Array.isArray(table.columns) || table.columns.length === 0) return;

  writeSectionTitle(doc, table.title, theme);

  const columns = table.columns.slice(0, 6);
  const rows = Array.isArray(table.rows) ? table.rows.slice(0, 18) : [];
  const colCount = columns.length;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usableWidth / colCount;
  const rowHeight = 22;

  const drawRow = (
    y: number,
    cells: Array<string | number>,
    opts: { isHeader?: boolean } = {}
  ) => {
    const isHeader = Boolean(opts.isHeader);
    for (let i = 0; i < colCount; i += 1) {
      const x = doc.page.margins.left + i * colWidth;
      const raw = i < cells.length ? cells[i] : '';
      const text = asCellText(raw);
      const alignFromInput = table.align?.[i];
      const align =
        alignFromInput ??
        (isNumericCell(raw) ? 'right' : 'left');

      doc
        .save()
        .lineWidth(0.6)
        .strokeColor(theme?.tableBorder ?? 'rgba(120, 134, 162, 0.45)')
        .fillColor(
          isHeader
            ? theme?.tableHeaderBg ?? '#eef2ff'
            : theme?.tableRowBg ?? '#ffffff'
        )
        .rect(x, y, colWidth, rowHeight)
        .fillAndStroke();

      doc
        .fillColor(isHeader ? theme?.heading ?? '#0f172a' : theme?.text ?? '#1f2937')
        .font(isHeader ? ACTIVE_PDF_FONT_BOLD : ACTIVE_PDF_FONT_REGULAR)
        .fontSize(isHeader ? 9 : 8.8)
        .text(text, x + 6, y + 6, {
          width: colWidth - 12,
          align: align as 'left' | 'center' | 'right',
          lineBreak: false,
          ellipsis: true,
        });
      doc.restore();
    }
  };

  ensureSpace(doc, rowHeight * 2, theme);
  drawRow(doc.y, columns, { isHeader: true });
  doc.y += rowHeight;

  for (const row of rows) {
    ensureSpace(doc, rowHeight + 4, theme);
    drawRow(doc.y, row);
    doc.y += rowHeight;
  }

  doc.moveDown(0.8);
}

async function renderNarrativeChartPng(args: {
  title: string;
  labels: string[];
  values: number[];
  kind?: 'line' | 'bar' | 'area';
  theme?: ReportTheme;
}) {
  const width = 1200;
  const height = 620;
  const chart = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: args.theme?.chartBackground ?? 'white',
  });
  const kind = args.kind ?? 'line';

  const cfg = {
    type: kind === 'area' ? 'line' : kind,
    data: {
      labels: args.labels,
      datasets: [
        {
          label: args.title,
          data: args.values,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.22,
          fill: kind === 'area',
          backgroundColor:
            kind === 'area'
              ? args.theme?.chartArea ?? 'rgba(59,130,246,0.22)'
              : args.theme?.chartLine ?? 'rgba(37,99,235,0.82)',
          borderColor: args.theme?.chartLine ?? 'rgba(37,99,235,0.9)',
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: args.theme?.muted ?? '#64748b',
          },
        },
        y: {
          grid: {
            color: args.theme?.tableBorder ?? 'rgba(120,134,162,0.22)',
          },
          ticks: {
            color: args.theme?.muted ?? '#64748b',
            callback: (v: any) => {
              const n = Number(v);
              if (Number.isFinite(n)) return n.toLocaleString('es-CL');
              return v;
            },
          },
        },
      },
    },
  } as any;

  return chart.renderToBuffer(cfg);
}

async function drawNarrativeChartSection(args: {
  doc: any;
  index: number;
  total: number;
  theme: ReportTheme;
  chart: {
    title: string;
    subtitle?: string;
    kind?: 'line' | 'bar' | 'area';
    labels: string[];
    values: number[];
  };
}) {
  const { doc, chart, index, total, theme } = args;
  const pairs = Math.min(chart.labels.length, chart.values.length);
  if (pairs === 0) return;

  const labels = chart.labels.slice(0, Math.min(48, pairs));
  const values = chart.values.slice(0, labels.length);
  if (values.length === 0) return;

  // Keep each chart block visually grouped.
  ensureSpace(doc, 360, theme);
  writeSectionTitle(doc, `Grafico ${index + 1} de ${total}: ${chart.title}`, theme);

  const explanation = buildChartNarrative({
    title: chart.title,
    subtitle: chart.subtitle,
    labels,
    values,
  });
  doc.fillColor(theme.muted).font(ACTIVE_PDF_FONT_REGULAR).fontSize(9.6).text(explanation, {
    lineGap: 2,
  });
  doc.moveDown(0.3);

  const png = await renderNarrativeChartPng({
    title: chart.title,
    labels,
    values,
    kind: chart.kind,
    theme,
  });
  ensureSpace(doc, 250, theme);
  doc.image(png, { fit: [495, 235], align: 'center' });
  doc.moveDown(0.55);

  const summary = summarizeSeries(values);
  const bullets = [
    `Inicio: ${formatMetricValue(summary.start)} · Cierre: ${formatMetricValue(summary.end)}`,
    `Variacion total: ${formatMetricValue(summary.delta)} · Tendencia: ${summary.trend}`,
    `Minimo: ${formatMetricValue(summary.min)} · Maximo: ${formatMetricValue(summary.max)}`,
  ];
  writeBullets(doc, bullets, theme);
}

export async function generateSimulationPdf(
  input: SimulationInput,
  userId = 'anonymous'
): Promise<SimulationArtifact> {
  const now = new Date();
  const createdAt = now.toISOString();
  const id = `sim-${now.toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,8)}`;

  const outDir = getSimulationArtifactsDir(userId);

  const months = input.months ?? 12;
  const labels = Array.from({ length: months }, (_, i) => `Mes ${i + 1}`);
  const series = monthlySeries({ ...input, months });

  const png = await renderChartPng(labels, series);
  const pngName = `${id}.png`;
  const pdfName = `${id}.pdf`;

  fs.writeFileSync(path.join(outDir, pngName), png);

  const title = input.title ?? 'Simulación ejecutiva';
  const subtitle =
    input.subtitle ??
    `Horizonte ${months} meses · Tasa anual ${(input.annualRate * 100).toFixed(2)}% · Aporte mensual ${formatCLP(input.monthlyContribution)}`;
  const executiveSummary =
    input.executiveSummary ??
    `Proyeccion a ${months} meses con capital inicial ${formatCLP(input.principal)}, aporte mensual ${formatCLP(
      input.monthlyContribution
    )} y tasa anual ${(input.annualRate * 100).toFixed(2)}%.`;
  const keyFindings = normalizeLines(input.keyFindings, [
    `Capital proyectado al cierre: ${formatCLP(series[series.length - 1] ?? input.principal)}.`,
    `Variacion estimada sobre capital inicial: ${formatCLP((series[series.length - 1] ?? input.principal) - input.principal)}.`,
  ]);
  const assumptions = normalizeLines(input.assumptions, [
    'Capitalizacion mensual con tasa constante.',
    'No incluye inflacion, impuestos ni comisiones.',
  ]);
  const contextHighlights = normalizeLines(input.contextHighlights, []);

  // PDF editorial simple pero pro (A4, márgenes, jerarquía)
  const doc = new PDFDocument({ size: 'A4', margin: 54 });
  const fonts = registerPdfFonts(doc);
  doc.font(fonts.regular);
  const pdfPath = path.join(outDir, pdfName);
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  // Header
  doc.font(fonts.bold).fontSize(20).text(title, { align: 'left' });
  doc.moveDown(0.3);
  doc.font(fonts.regular).fontSize(11).fillColor('#333333').text(subtitle);
  doc.moveDown(1);

  // KPI row
  const start = input.principal;
  const end = series[series.length - 1];
  const gain = end - start;

  doc.fillColor('#000000');
  doc.font(fonts.bold).fontSize(11).text(`Capital inicial: ${formatCLP(start)}`);
  doc.font(fonts.bold).fontSize(11).text(`Capital proyectado: ${formatCLP(end)}`);
  doc.font(fonts.regular).fontSize(11).fillColor('#333333').text(`Ganancia estimada: ${formatCLP(gain)}`);
  doc.moveDown(1);

  // Chart image (fit within page)
  const imgPath = path.join(outDir, pngName);
  doc.image(imgPath, { fit: [495, 280], align: 'center' });

  writeSectionTitle(doc, 'Resumen ejecutivo');
  doc.fillColor('#111827').font(fonts.regular).fontSize(10).text(executiveSummary, { lineGap: 3 });

  writeSectionTitle(doc, 'Hallazgos clave');
  writeBullets(doc, keyFindings.slice(0, 6));

  writeSectionTitle(doc, 'Supuestos del informe');
  writeBullets(doc, assumptions.slice(0, 6));

  if (contextHighlights.length > 0) {
    writeSectionTitle(doc, 'Continuidad con conversacion previa');
    writeBullets(doc, contextHighlights.slice(0, 6));
  }

  writeSectionTitle(doc, 'Nota metodologica');
  doc
    .fillColor('#4b5563')
    .font(fonts.regular)
    .fontSize(9)
    .text(
      'Proyeccion deterministica con capitalizacion mensual. Los resultados son referenciales y deben complementarse con criterios de riesgo, liquidez y objetivos personales.',
      { align: 'left', lineGap: 2 }
    );

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return {
    id,
    type: 'pdf',
    title: /(\bmes|\bmonth)/i.test(title) ? title : `${title}: ${months} meses`,
    description: subtitle,
    fileUrl: `/api/pdfs/serve?file=${pdfName}`,
    previewImageUrl: `/api/pdfs/serve?file=${pngName}`,
    source: 'analysis',
    createdAt,
    saved: false,
    meta: {
      principal: input.principal,
      annualRate: input.annualRate,
      monthlyContribution: input.monthlyContribution,
      months,
      projectedEnd: end,
      executiveSummary,
      keyFindings,
      assumptions,
      contextHighlights,
    },
  };
}

export async function generateNarrativePdf(
  input: NarrativePdfInput,
  userId = 'anonymous'
): Promise<SimulationArtifact> {
  const now = new Date();
  const createdAt = now.toISOString();
  const id = `rep-${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;

  const outDir = getSimulationArtifactsDir(userId);

  const pdfName = `${id}.pdf`;
  const pdfPath = path.join(outDir, pdfName);

  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true });
  const fonts = registerPdfFonts(doc);
  doc.font(fonts.regular);
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  const subtitle =
    input.subtitle ??
    `Informe generado ${now.toLocaleDateString('es-CL')}`;
  const style: NarrativeStyle = input.style ?? 'corporativo';
  const theme = getReportTheme(style);
  paintNarrativePageBackground(doc, theme);

  const sections =
    Array.isArray(input.sections) && input.sections.length > 0
      ? input.sections
      : [
          {
            heading: 'Resumen ejecutivo',
            body: 'Documento narrativo generado en base al contexto del usuario y del chat.',
          },
        ];
  const tables = Array.isArray(input.tables) ? input.tables.slice(0, 4) : [];
  const charts = Array.isArray(input.charts) ? input.charts.slice(0, 3) : [];

  writeNarrativeCoverPage({
    doc,
    title: input.title,
    subtitle,
    source: input.source ?? 'analysis',
    createdAt: now,
    theme,
  });

  doc.addPage();
  paintNarrativePageBackground(doc, theme);
  writeGeneralIndexPage({
    doc,
    theme,
    sections,
    charts: charts.map((c) => ({ title: c.title })),
    tables: tables.map((t) => ({ title: t.title })),
  });

  if (charts.length > 0) {
    doc.addPage();
    paintNarrativePageBackground(doc, theme);
    writeChartIndexPage({ doc, charts, theme });
  }

  doc.addPage();
  paintNarrativePageBackground(doc, theme);
  doc.fillColor(theme.heading).font(fonts.bold).fontSize(18).text('Desarrollo del informe', {
    align: 'left',
  });
  doc.moveDown(0.35);
  doc.fillColor(theme.muted).font(fonts.regular).fontSize(10).text(
    'A continuacion se presentan secciones narrativas, graficos y tablas consolidadas para la toma de decisiones.',
    { lineGap: 2 }
  );
  doc.moveDown(0.8);

  for (const sec of sections.slice(0, 10)) {
    ensureSpace(doc, 80, theme);
    doc.fillColor(theme.heading).font(fonts.bold).fontSize(12).text(sec.heading.toUpperCase());
    doc.moveDown(0.2);
    doc.fillColor(theme.text).font(fonts.regular).fontSize(10).text(sec.body, { lineGap: 3 });
    doc.moveDown(0.7);
  }

  for (const [index, chart] of charts.entries()) {
    await drawNarrativeChartSection({
      doc,
      index,
      total: charts.length,
      theme,
      chart,
    });
  }

  for (const table of tables) {
    drawNarrativeTable(doc, table, theme);
  }

  doc.fillColor(theme.muted).font(fonts.regular).fontSize(9).text(
    'Nota: este informe es informativo y no constituye una recomendación de inversión personalizada.',
    { align: 'left' }
  );

  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
    doc.switchToPage(i);
    const pageNo = i + 1;
    doc
      .fillColor(theme.muted)
      .font(fonts.regular)
      .fontSize(8.5)
      .text(
        pageNo === 1
          ? 'Portada'
          : `Pagina ${pageNo} de ${pageRange.count}`,
        doc.page.margins.left,
        footerY(doc),
        {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'right',
        }
      );
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return {
    id,
    type: 'pdf',
    title: input.title,
    description: subtitle,
    fileUrl: `/api/pdfs/serve?file=${pdfName}`,
    previewImageUrl: '',
    source: input.source ?? 'analysis',
    createdAt,
    saved: false,
    meta: {
      kind: 'narrative',
      sections: sections.length,
      tables: tables.length,
      charts: charts.length,
      style,
    },
  };
}

export async function generateNarrativeLatexPdf(
  input: NarrativePdfInput,
  userId = 'anonymous'
): Promise<SimulationArtifact> {
  const now = new Date();
  const createdAt = now.toISOString();
  const id = `rep-${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const outDir = getSimulationArtifactsDir(userId);
  const texName = `${id}.tex`;
  const pdfName = `${id}.pdf`;
  const texPath = path.join(outDir, texName);
  const pdfPath = path.join(outDir, pdfName);

  const latex = buildLatexDocument(input, now);
  fs.writeFileSync(texPath, latex, 'utf8');

  const compiler = latexCompilerCommand();
  if (!compiler) {
    throw new Error('LATEX_COMPILER_NOT_AVAILABLE');
  }

  const compile = spawnSync(
    compiler,
    ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', outDir, texPath],
    { encoding: 'utf8' }
  );
  if (compile.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error(`LATEX_COMPILE_FAILED: ${compile.stderr || compile.stdout || 'unknown'}`);
  }

  return {
    id,
    type: 'pdf',
    title: input.title,
    description: input.subtitle ?? `Informe generado ${now.toLocaleDateString('es-CL')}`,
    fileUrl: `/api/pdfs/serve?file=${pdfName}`,
    previewImageUrl: '',
    source: input.source ?? 'analysis',
    createdAt,
    saved: false,
    meta: {
      kind: 'narrative_latex',
      sections: input.sections?.length ?? 0,
      tables: input.tables?.length ?? 0,
      charts: input.charts?.length ?? 0,
      texName,
      compiler,
    },
  };
}
