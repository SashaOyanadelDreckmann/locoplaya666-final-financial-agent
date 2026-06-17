'use client';

export type BubbleSnapshotMeta = {
  kicker?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  citations?: Array<{ title?: string; source?: string; url?: string }>;
};

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectBubbleSnapshotCss(rootEl: HTMLElement) {
  const cssParts: string[] = [];
  const seen = new Set<string>();
  const selectors = new Set<string>([
    ':root',
    'html',
    'body',
    '.agent-bubble',
    '.assistant',
    '.latex-doc',
    '.latex-doc-body',
    '.latex-doc-head',
    '.latex-doc-heading',
    '.latex-doc-kicker',
    '.latex-doc-title',
    '.latex-doc-subtitle',
    '.latex-doc-mode',
    '.latex-inline-annex',
    '.latex-inline-annex-head',
    '.citation-stack',
    '.citation-bubble',
    '.citation-url',
    '.premium-markdown',
    '.academic-paper',
    '.md-h1',
    '.md-h2',
    '.md-h3',
    '.md-h4',
    '.md-paragraph',
    '.md-list',
    '.md-list-ordered',
    '.md-list-item',
    '.md-table-wrap',
    '.md-table',
    '.katex',
    '.katex-display',
    '.katex-html',
    '.agent-blocks-renderer',
    '.agent-block',
    '.agent-chart-block',
    '.agent-chart-canvas',
    '.agent-chart-footnote',
    '.agent-table-block',
    '.agent-table-wrap',
    '.agent-tx-chart-block',
    '.agent-tx-chart-card',
    '.latex-inline-annex-charts',
    '.tx-minimal-cashflow-card',
    '.tx-minimal-cashflow-chart',
    '.tx-minimal-cashflow-head',
    '.tx-minimal-cashflow-legend',
    '.agent-tx-bar-chart',
    '.chat-table-scroll-host',
    '.chat-table-scroll-hint',
    '.agent-table',
    '.recharts-responsive-container',
    '.recharts-surface',
    'svg',
    'table',
    'th',
    'td',
    'a',
    'p',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
  ]);

  rootEl.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
    node.classList.forEach((className) => selectors.add(`.${className}`));
  });

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selector = rule.selectorText || '';
        if (Array.from(selectors).some((entry) => selector.includes(entry)) && !seen.has(rule.cssText)) {
          seen.add(rule.cssText);
          cssParts.push(rule.cssText);
        }
        continue;
      }

      if (rule instanceof CSSMediaRule) {
        const nested: string[] = [];
        for (const nestedRule of Array.from(rule.cssRules)) {
          if (!(nestedRule instanceof CSSStyleRule)) continue;
          const selector = nestedRule.selectorText || '';
          if (Array.from(selectors).some((entry) => selector.includes(entry)) && !seen.has(nestedRule.cssText)) {
            seen.add(nestedRule.cssText);
            nested.push(nestedRule.cssText);
          }
        }
        if (nested.length > 0) cssParts.push(`@media ${rule.conditionText}{${nested.join('\n')}}`);
        continue;
      }

      if (rule instanceof CSSKeyframesRule && !seen.has(rule.cssText)) {
        seen.add(rule.cssText);
        cssParts.push(rule.cssText);
      }
    }
  }

  return cssParts.join('\n');
}

const PDF_CHART_SURFACE_SELECTORS =
  '.recharts-responsive-container, .agent-chart-canvas, .tx-minimal-cashflow-chart, .agent-tx-bar-chart';
const PDF_TABLE_HOST_SELECTORS = '.chat-table-scroll-host, .md-table-wrap, .agent-table-wrap';
const PDF_SCROLL_UNLOCK_SELECTORS =
  '.latex-doc-body, .premium-markdown, .latex-inline-annex-charts, .latex-inline-annex, .agent-blocks-renderer, .agent-tx-chart-block, .agent-tx-chart-card, .tx-minimal-cashflow-card';
const PDF_CHART_BLOCK_SELECTORS =
  '.agent-chart-block, .agent-tx-chart-block, .agent-tx-chart-card, .tx-minimal-cashflow-card, .latex-inline-annex-charts > *';

function unlockScrollableRegions(root: HTMLElement) {
  root.querySelectorAll(PDF_SCROLL_UNLOCK_SELECTORS).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.maxHeight = 'none';
    node.style.height = 'auto';
    node.style.overflow = 'visible';
  });
}

function syncMeasuredBlockHeights(sourceRoot: HTMLElement, clonedRoot: HTMLElement, selector: string, minHeight = 220) {
  const sourceNodes = sourceRoot.querySelectorAll(selector);
  const clonedNodes = clonedRoot.querySelectorAll(selector);
  sourceNodes.forEach((sourceNode, index) => {
    const clonedNode = clonedNodes[index];
    if (!(sourceNode instanceof HTMLElement) || !(clonedNode instanceof HTMLElement)) return;

    const rect = sourceNode.getBoundingClientRect();
    const height = Math.max(minHeight, Math.ceil(rect.height));
    const width = Math.max(0, Math.ceil(rect.width));

    clonedNode.style.width = width > 0 ? `${width}px` : '100%';
    clonedNode.style.minWidth = width > 0 ? `${width}px` : '0';
    clonedNode.style.maxWidth = '100%';
    clonedNode.style.height = `${height}px`;
    clonedNode.style.minHeight = `${height}px`;
    clonedNode.style.maxHeight = 'none';
    clonedNode.style.overflow = 'visible';

    const sourceSvg = sourceNode.querySelector('svg.recharts-surface');
    const clonedSvg = clonedNode.querySelector('svg.recharts-surface');
    if (sourceSvg instanceof SVGSVGElement && clonedSvg instanceof SVGSVGElement) {
      const svgRect = sourceSvg.getBoundingClientRect();
      const svgWidth = Math.max(1, Math.ceil(svgRect.width));
      const svgHeight = Math.max(1, Math.ceil(svgRect.height));
      clonedSvg.setAttribute('width', String(svgWidth));
      clonedSvg.setAttribute('height', String(svgHeight));
      clonedSvg.style.width = `${svgWidth}px`;
      clonedSvg.style.height = `${svgHeight}px`;
      clonedSvg.style.overflow = 'visible';
    }
  });
}

function expandTablesForPdfExport(sourceRoot: HTMLElement, clonedRoot: HTMLElement) {
  const sourceHosts = sourceRoot.querySelectorAll(PDF_TABLE_HOST_SELECTORS);
  const clonedHosts = clonedRoot.querySelectorAll(PDF_TABLE_HOST_SELECTORS);

  clonedHosts.forEach((host, index) => {
    if (!(host instanceof HTMLElement)) return;
    const sourceHost = sourceHosts[index];
    host.classList.remove(
      'is-scrollable-x',
      'is-scrollable-y',
      'is-at-scroll-start-x',
      'is-at-scroll-end-x',
      'is-at-scroll-start-y',
      'is-at-scroll-end-y',
      'is-hint-visible',
      'is-hint-dismissed',
    );
    host.style.maxHeight = 'none';
    host.style.height = 'auto';
    host.style.overflow = 'visible';
    host.style.width = '100%';

    const table = host.querySelector('table');
    const sourceTable =
      sourceHost instanceof HTMLElement ? sourceHost.querySelector('table') : null;
    if (!(table instanceof HTMLElement)) return;

    table.style.width = '100%';
    table.style.maxWidth = 'none';
    table.style.tableLayout = 'auto';

    if (sourceTable instanceof HTMLElement) {
      const fullWidth = Math.max(
        sourceTable.scrollWidth,
        sourceTable.getBoundingClientRect().width,
        table.scrollWidth,
      );
      const fullHeight = Math.max(
        sourceTable.scrollHeight,
        sourceTable.getBoundingClientRect().height,
        table.scrollHeight,
      );
      if (fullWidth > 0) {
        table.style.width = `${Math.ceil(fullWidth)}px`;
        host.style.minWidth = `${Math.ceil(fullWidth)}px`;
      }
      if (fullHeight > 0) {
        host.style.minHeight = `${Math.ceil(fullHeight)}px`;
      }
    }
  });
}

function prepareBubbleForPdfExport(
  clonedBubble: HTMLElement,
  meta?: BubbleSnapshotMeta,
  sourceBubble?: HTMLElement,
) {
  clonedBubble.classList.add('bubble-pdf-paper');
  clonedBubble.classList.remove('is-scrollable-bubble');

  clonedBubble
    .querySelectorAll('button, input, textarea, select, [role="button"]')
    .forEach((el) => el.remove());

  clonedBubble.querySelectorAll('.latex-inline-questionnaire, .agent-questionnaire-block').forEach((el) => {
    el.remove();
  });

  clonedBubble
    .querySelectorAll('.is-scrollable-bubble, .is-scrollable-content')
    .forEach((el) => el.classList.remove('is-scrollable-bubble', 'is-scrollable-content'));

  clonedBubble.querySelectorAll('[data-chat-export-skip]').forEach((el) => el.remove());
  clonedBubble.querySelectorAll('.citation-toggle').forEach((el) => el.remove());

  clonedBubble.querySelectorAll('.latex-inline-annex').forEach((annex) => {
    const label = annex.querySelector('.latex-inline-annex-head span:first-child')?.textContent?.trim() ?? '';
    if (label === 'Fuentes verificables') {
      annex.remove();
    }
  });

  const measurementRoot = sourceBubble ?? clonedBubble;
  unlockScrollableRegions(clonedBubble);
  expandTablesForPdfExport(measurementRoot, clonedBubble);
  syncMeasuredBlockHeights(measurementRoot, clonedBubble, PDF_CHART_SURFACE_SELECTORS);

  clonedBubble.querySelectorAll(PDF_CHART_BLOCK_SELECTORS).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.overflow = 'visible';
    node.style.breakInside = 'avoid';
    node.style.pageBreakInside = 'avoid';
  });
}

const BUBBLE_PDF_EXPORT_CSS = `
@page {
  margin: 0;
}

html, body, .bubble-pdf-snapshot {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  background: #f5f1e8 !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc * {
  color: #1c3145 !important;
  -webkit-text-fill-color: #1c3145 !important;
  text-shadow: none !important;
}

.bubble-pdf-snapshot {
  width: 100% !important;
  min-height: auto !important;
  box-sizing: border-box !important;
  padding: 12mm 12mm 14mm 12mm !important;
  -webkit-box-decoration-break: clone !important;
  box-decoration-break: clone !important;
}

.bubble-pdf-snapshot,
.bubble-pdf-snapshot * {
  opacity: 1 !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.bubble-pdf-snapshot,
.bubble-pdf-snapshot .bubble-pdf-paper,
.bubble-pdf-snapshot .bubble-pdf-paper * {
  background-color: #f5f1e8 !important;
}

.bubble-pdf-running-brand {
  position: static;
  display: block;
  margin: 0 0 3mm 0;
  text-align: center;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  color: #1a3047;
  font-weight: 600;
  font-family: "Times New Roman", Times, Georgia, serif;
}

.bubble-pdf-running-header {
  position: static;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 10mm 0;
  padding: 0 2px 4px 2px;
  border-bottom: 1px solid rgba(28, 49, 69, 0.1);
  background: #f5f1e8 !important;
}

.bubble-pdf-running-header-copy {
  min-width: 0;
  color: #1b3046 !important;
}

.bubble-pdf-running-kicker {
  margin: 0 0 3mm 0;
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: #46698f !important;
  font-weight: 700;
}

.bubble-pdf-running-title {
  margin: 0 0 1.5mm 0;
  font-size: 21px;
  line-height: 1.1;
  color: #132b40 !important;
  font-weight: 700;
}

.bubble-pdf-running-subtitle {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: #2b3f53 !important;
  max-width: 70ch;
}

.bubble-pdf-running-badge {
  border: 1px solid rgba(53, 94, 137, 0.9);
  border-radius: 999px;
  padding: 1.4mm 3.4mm;
  font-size: 9px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #355f89 !important;
  font-weight: 700;
  white-space: nowrap;
}

.bubble-pdf-snapshot .bubble-pdf-paper {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  border: 0 !important;
  background: #f5f1e8 !important;
  overflow: visible !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper > :first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-body,
.bubble-pdf-snapshot .bubble-pdf-paper .premium-markdown,
.bubble-pdf-snapshot .bubble-pdf-paper .academic-paper,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-inline-annex,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-inline-annex-charts,
.bubble-pdf-snapshot .bubble-pdf-paper .agent-blocks-renderer {
  max-height: none !important;
  height: auto !important;
  overflow: visible !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-head {
  display: none !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-head,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-title,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-subtitle,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h1,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h2,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h3 {
  break-after: avoid-page !important;
  page-break-after: avoid !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper p,
.bubble-pdf-snapshot .bubble-pdf-paper li,
.bubble-pdf-snapshot .bubble-pdf-paper blockquote {
  orphans: 3;
  widows: 3;
}

.bubble-pdf-snapshot .bubble-pdf-paper pre,
.bubble-pdf-snapshot .bubble-pdf-paper code {
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.bubble-pdf-snapshot .agent-chart-block,
.bubble-pdf-snapshot .agent-tx-chart-block,
.bubble-pdf-snapshot .agent-tx-chart-card,
.bubble-pdf-snapshot .tx-minimal-cashflow-card,
.bubble-pdf-snapshot .agent-table-block,
.bubble-pdf-snapshot .md-table-wrap,
.bubble-pdf-snapshot .latex-inline-annex,
.bubble-pdf-snapshot .latex-inline-annex-charts > *,
.bubble-pdf-snapshot .citation-bubble {
  break-inside: avoid-page !important;
  page-break-inside: avoid !important;
  margin-bottom: 8mm !important;
  overflow: visible !important;
}

.bubble-pdf-snapshot .recharts-responsive-container,
.bubble-pdf-snapshot .agent-chart-canvas,
.bubble-pdf-snapshot .tx-minimal-cashflow-chart,
.bubble-pdf-snapshot .agent-tx-bar-chart {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding-inline: 12px !important;
  overflow: visible !important;
}

.bubble-pdf-snapshot .recharts-wrapper,
.bubble-pdf-snapshot .recharts-surface,
.bubble-pdf-snapshot .recharts-legend-wrapper {
  overflow: visible !important;
}

.bubble-pdf-snapshot .citation-bubble {
  border: 1px solid rgba(28, 49, 69, 0.14) !important;
  border-radius: 8px !important;
  padding: 8px 10px !important;
  margin-bottom: 6px !important;
  background: rgba(255, 255, 255, 0.72) !important;
}

.bubble-pdf-snapshot .citation-bubble strong,
.bubble-pdf-snapshot .citation-url {
  color: #1c3145 !important;
  -webkit-text-fill-color: #1c3145 !important;
}

.bubble-pdf-snapshot .citation-url {
  font-size: 9px !important;
  word-break: break-all !important;
}

.bubble-pdf-snapshot .md-table-wrap,
.bubble-pdf-snapshot .agent-table-wrap,
.bubble-pdf-snapshot .chat-table-scroll-host {
  overflow: visible !important;
  max-height: none !important;
  height: auto !important;
}

.bubble-pdf-snapshot .chat-table-scroll-hint,
.bubble-pdf-snapshot .chat-table-scroll-host::before,
.bubble-pdf-snapshot .chat-table-scroll-host::after {
  display: none !important;
}

.bubble-pdf-citations {
  margin-top: 8mm;
  padding-top: 4mm;
  border-top: 1px solid rgba(28, 49, 69, 0.1);
}

.bubble-pdf-citations-label {
  margin: 0 0 3mm 0;
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: #46698f !important;
  font-weight: 700;
}

.bubble-pdf-citation-item {
  margin-bottom: 2mm;
}

.bubble-pdf-citation-title {
  display: block;
  font-size: 10px;
  color: #1c3145 !important;
  font-weight: 600;
}

.bubble-pdf-citation-url {
  display: block;
  font-size: 8px;
  color: #46698f !important;
  word-break: break-all;
  text-decoration: none;
}

.bubble-pdf-snapshot .agent-table th,
.bubble-pdf-snapshot .agent-table td,
.bubble-pdf-snapshot .md-table th,
.bubble-pdf-snapshot .md-table td {
  color: #1c3145 !important;
  border-color: rgba(28, 49, 69, 0.18) !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
`;

export function buildBubbleSnapshotHtmlAndCss(bubbleEl: HTMLElement, meta?: BubbleSnapshotMeta) {
  const clonedBubble = bubbleEl.cloneNode(true) as HTMLElement;
  prepareBubbleForPdfExport(clonedBubble, meta, bubbleEl);

  const kickerText =
    meta?.kicker?.trim() ||
    clonedBubble.querySelector('.latex-doc-kicker')?.textContent?.trim() ||
    'CHAT GENERAL';
  const titleText =
    meta?.title?.trim() ||
    clonedBubble.querySelector('.latex-doc-title, .latex-doc-h1, .md-h1')?.textContent?.trim() ||
    'Informe financiero';
  const subtitleText =
    meta?.subtitle?.trim() ||
    clonedBubble.querySelector('.latex-doc-subtitle')?.textContent?.trim() ||
    'Síntesis profesional del contexto, evidencia disponible y próximos pasos.';
  const badgeText =
    meta?.badge?.trim() ||
    clonedBubble.querySelector('.latex-doc-mode')?.textContent?.trim() ||
    'ANÁLISIS';

  const renderableCitations = (meta?.citations ?? []).filter((c) => c.title ?? c.source ?? c.url);
  const citationsHtml =
    renderableCitations.length > 0
      ? `<section class="bubble-pdf-citations">
          <p class="bubble-pdf-citations-label">Fuentes</p>
          ${renderableCitations
            .map(
              (c) =>
                `<div class="bubble-pdf-citation-item">
                  <strong class="bubble-pdf-citation-title">${escapeHtml(c.title ?? c.source ?? '')}</strong>
                  ${c.url ? `<a class="bubble-pdf-citation-url" href="${escapeHtml(c.url)}">${escapeHtml(c.url)}</a>` : ''}
                </div>`,
            )
            .join('')}
        </section>`
      : '';

  return {
    html: `<div class="bubble-pdf-snapshot">
      <div class="bubble-pdf-running-brand">Financieramente</div>
      <header class="bubble-pdf-running-header">
        <div class="bubble-pdf-running-header-copy">
          <p class="bubble-pdf-running-kicker">${escapeHtml(kickerText)}</p>
          <h1 class="bubble-pdf-running-title">${escapeHtml(titleText)}</h1>
          <p class="bubble-pdf-running-subtitle">${escapeHtml(subtitleText)}</p>
        </div>
        <div class="bubble-pdf-running-badge">${escapeHtml(badgeText)}</div>
      </header>
      ${clonedBubble.outerHTML}
      ${citationsHtml}
    </div>`,
    css: `${collectBubbleSnapshotCss(bubbleEl)}\n${BUBBLE_PDF_EXPORT_CSS}`,
  };
}
