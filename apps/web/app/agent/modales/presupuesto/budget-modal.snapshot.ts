'use client';

import type { BudgetTableStyleId } from './budget-modal.helpers';
import { buildBudgetPdfThemeCss } from './budget-modal.pdf-themes';

export type BudgetPdfTotals = {
  income: number;
  expenses: number;
  balance: number;
};

export function collectBudgetSnapshotCss(rootEl: HTMLElement) {
  const cssParts: string[] = [];
  const seen = new Set<string>();
  const selectors = new Set<string>([
    ':root',
    'html',
    'body',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'svg',
    'path',
    'line',
    'small',
    'strong',
    'span',
    'div',
    'article',
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

function sanitizeBudgetSnapshotClone(rootEl: HTMLElement) {
  const cloned = rootEl.cloneNode(true) as HTMLElement;
  cloned.classList.add('budget-pdf-paper', 'is-budget-pdf-exporting');
  cloned.classList.remove('is-mobile-compact');

  cloned.querySelectorAll('.is-mobile-row-card').forEach((row) => row.classList.remove('is-mobile-row-card'));
  cloned.querySelectorAll('.budget-pdf-intel-summary').forEach((el) => el.remove());
  cloned.querySelectorAll('.continue-ghost.danger, .budget-row-delete').forEach((el) => el.remove());
  cloned.querySelectorAll('[data-label]').forEach((el) => el.removeAttribute('data-label'));

  cloned.querySelectorAll('.budget-pill-group').forEach((group) => {
    const active = group.querySelector('.budget-pill-button.is-active') as HTMLElement | null;
    const span = document.createElement('span');
    span.className = 'budget-static-pill';
    span.textContent = active?.textContent?.trim() || '';
    group.replaceWith(span);
  });

  cloned.querySelectorAll('select').forEach((selectEl) => {
    const select = selectEl as HTMLSelectElement;
    const span = document.createElement('span');
    span.className = 'budget-static-field budget-static-select';
    span.textContent = select.options[select.selectedIndex]?.text?.trim() || select.value || '';
    select.replaceWith(span);
  });

  cloned.querySelectorAll('input, textarea').forEach((inputEl) => {
    const input = inputEl as HTMLInputElement | HTMLTextAreaElement;
    const span = document.createElement('span');
    span.className = 'budget-static-field';
    span.textContent = input.value?.trim() || input.getAttribute('placeholder') || '0';
    input.replaceWith(span);
  });

  cloned.querySelectorAll('button').forEach((buttonEl) => {
    const button = buttonEl as HTMLButtonElement;
    if (button.closest('.budget-intel-kpis')) return;
    const span = document.createElement('span');
    span.className = 'budget-static-button';
    span.textContent = button.textContent?.trim() || '';
    button.replaceWith(span);
  });

  cloned.querySelectorAll('.budget-impact-shell').forEach((shell) => {
    const pct = shell.querySelector('small')?.textContent?.trim() || '';
    const label = shell.querySelector('.budget-impact-type-label')?.textContent?.trim() || '';
    shell.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'budget-pdf-impact-text';
    if (pct) {
      const strong = document.createElement('strong');
      strong.textContent = pct;
      wrap.appendChild(strong);
    }
    if (label) {
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(span);
    }
    shell.appendChild(wrap);
  });

  cloned.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));

  return cloned;
}

function buildBudgetPdfExportCss(tableStyle: BudgetTableStyleId) {
  return `
${buildBudgetPdfThemeCss(tableStyle)}

@page {
  margin: 0;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  background: var(--pdf-page-bg) !important;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}

.budget-pdf-snapshot {
  width: 100%;
  min-height: 0 !important;
  height: auto !important;
  padding: 12mm;
  background: var(--pdf-snapshot-bg);
  color: var(--pdf-text);
}

.budget-pdf-running-brand {
  display: block;
  margin: 0 0 3mm;
  text-align: center;
  font-size: 10px;
  color: var(--pdf-accent);
  font-weight: 600;
  font-family: "Times New Roman", Times, Georgia, serif;
}

.budget-pdf-running-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 5mm;
  padding: 0 2px 4px;
  border-bottom: 1px solid var(--pdf-header-border);
}

.budget-pdf-running-kicker {
  margin: 0 0 3mm;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pdf-kicker);
  font-weight: 700;
}

.budget-pdf-running-title {
  margin: 0 0 1.5mm;
  font-size: 21px;
  line-height: 1.1;
  color: var(--pdf-title);
  font-weight: 700;
}

.budget-pdf-running-subtitle {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: var(--pdf-subtitle);
  max-width: 70ch;
}

.budget-pdf-running-badge {
  border: 1px solid var(--pdf-badge-border);
  border-radius: 999px;
  padding: 1.4mm 3.4mm;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pdf-badge-text);
  background: var(--pdf-badge-bg);
  font-weight: 700;
  white-space: nowrap;
}

.budget-pdf-running-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 6mm;
}

.budget-pdf-running-metrics > div {
  padding: 10px 12px;
  border: 1px solid var(--pdf-metric-border);
  border-radius: 10px;
  background: var(--pdf-metric-bg);
}

.budget-pdf-running-metrics span {
  display: block;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pdf-metric-label);
  margin-bottom: 4px;
}

.budget-pdf-running-metrics > div:nth-child(1) strong {
  color: var(--pdf-metric-income);
}

.budget-pdf-running-metrics > div:nth-child(2) strong {
  color: var(--pdf-metric-expense);
}

.budget-pdf-running-metrics > div:nth-child(3) strong {
  color: var(--pdf-metric-balance);
}

.budget-pdf-running-metrics strong {
  display: block;
  font-size: 16px;
}

.budget-pdf-export-root,
.budget-pdf-paper {
  width: 100%;
  background: var(--pdf-surface-bg);
  border: 1px solid var(--pdf-surface-border);
  border-radius: 12px;
  overflow: hidden;
  color: var(--pdf-td-text);
}

.budget-pdf-paper .budget-table-wrap,
.budget-pdf-paper .budget-table-wrap-pro {
  padding: 0;
  overflow: visible;
  background: var(--pdf-surface-bg);
}

.budget-pdf-paper .budget-table,
.budget-pdf-paper .budget-table-pro {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
  background: var(--pdf-surface-bg);
}

.budget-pdf-paper .budget-table thead {
  display: table-header-group;
}

.budget-pdf-paper .budget-table tbody {
  display: table-row-group;
}

.budget-pdf-paper .budget-table tr {
  display: table-row;
  page-break-inside: avoid;
}

.budget-pdf-paper .budget-table th,
.budget-pdf-paper .budget-table td {
  display: table-cell;
  vertical-align: top;
  padding: 8px 10px;
  text-align: left;
  white-space: normal;
  word-break: normal;
  overflow-wrap: normal;
  letter-spacing: normal;
  text-transform: none;
  color: var(--pdf-td-text);
  -webkit-text-fill-color: var(--pdf-td-text);
  border-bottom: 1px solid var(--pdf-td-border);
  background: var(--pdf-td-bg);
}

.budget-pdf-paper .budget-table th {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pdf-th-text);
  -webkit-text-fill-color: var(--pdf-th-text);
  background: var(--pdf-th-bg);
  border-bottom: 1px solid var(--pdf-th-border);
}

.budget-pdf-paper .budget-table td::before {
  display: none !important;
  content: none !important;
}

.budget-pdf-paper .budget-table th:nth-child(4),
.budget-pdf-paper .budget-table td:nth-child(4),
.budget-pdf-paper .budget-table th:nth-child(8),
.budget-pdf-paper .budget-table td:nth-child(8),
.budget-pdf-paper .budget-row-actions-cell {
  display: none !important;
}

.budget-pdf-paper .budget-table th:nth-child(1),
.budget-pdf-paper .budget-table td:nth-child(1) { width: 22%; }
.budget-pdf-paper .budget-table th:nth-child(2),
.budget-pdf-paper .budget-table td:nth-child(2) { width: 10%; }
.budget-pdf-paper .budget-table th:nth-child(3),
.budget-pdf-paper .budget-table td:nth-child(3) { width: 12%; }
.budget-pdf-paper .budget-table th:nth-child(5),
.budget-pdf-paper .budget-table td:nth-child(5) { width: 14%; }
.budget-pdf-paper .budget-table th:nth-child(6),
.budget-pdf-paper .budget-table td:nth-child(6) { width: 18%; }
.budget-pdf-paper .budget-table th:nth-child(7),
.budget-pdf-paper .budget-table td:nth-child(7) { width: 24%; }

.budget-pdf-paper .budget-table tr.budget-row-income td {
  background: var(--pdf-income-row-bg);
}

.budget-pdf-paper .budget-table tr.budget-row-expense td {
  background: var(--pdf-expense-row-bg);
}

.budget-static-field,
.budget-static-pill,
.budget-static-button {
  display: inline;
  white-space: normal;
  word-break: normal;
  overflow-wrap: normal;
  letter-spacing: normal;
  color: inherit;
  -webkit-text-fill-color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  min-height: 0;
}

.budget-pdf-impact-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.budget-pdf-impact-text strong {
  font-size: 11px;
  color: var(--pdf-impact-strong);
  -webkit-text-fill-color: var(--pdf-impact-strong);
}

.budget-pdf-impact-text span {
  font-size: 10px;
  color: var(--pdf-impact-muted);
  -webkit-text-fill-color: var(--pdf-impact-muted);
}

.budget-pdf-paper svg,
.budget-pdf-paper .budget-impact-cell {
  display: none !important;
}
`;
}

export function buildBudgetSnapshotHtmlAndCss(
  rootEl: HTMLElement,
  styleLabel: string,
  tableStyle: BudgetTableStyleId,
  totals: BudgetPdfTotals,
  formatAmount: (value: number) => string,
) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const cloned = sanitizeBudgetSnapshotClone(rootEl);

  return {
    html: `<div class="budget-pdf-snapshot" data-budget-table-style="${escapeHtml(tableStyle)}">
      <div class="budget-pdf-running-brand">Financieramente</div>
      <header class="budget-pdf-running-header">
        <div class="budget-pdf-running-header-copy">
          <p class="budget-pdf-running-kicker">PRESUPUESTO</p>
          <h1 class="budget-pdf-running-title">Inteligencia de presupuesto</h1>
          <p class="budget-pdf-running-subtitle">Tabla exportada con el estilo visual activo y los valores actuales del presupuesto.</p>
        </div>
        <div class="budget-pdf-running-badge">${escapeHtml(styleLabel)}</div>
      </header>
      <div class="budget-pdf-running-metrics">
        <div><span>Ingreso</span><strong>${escapeHtml(formatAmount(totals.income))}</strong></div>
        <div><span>Gasto</span><strong>${escapeHtml(formatAmount(totals.expenses))}</strong></div>
        <div><span>Balance</span><strong>${escapeHtml(formatAmount(totals.balance))}</strong></div>
      </div>
      <div class="budget-pdf-export-root">
        ${cloned.outerHTML}
      </div>
    </div>`,
    css: buildBudgetPdfExportCss(tableStyle),
  };
}
