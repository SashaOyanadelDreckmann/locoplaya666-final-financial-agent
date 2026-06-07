'use client';

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

export function buildBudgetSnapshotHtmlAndCss(rootEl: HTMLElement, styleLabel: string) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const cloned = rootEl.cloneNode(true) as HTMLElement;
  cloned.classList.add('budget-pdf-paper');

  cloned.querySelectorAll('.continue-ghost.danger').forEach((el) => el.remove());

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
    span.className = `budget-static-field budget-static-select ${select.className}`.trim();
    span.textContent = select.options[select.selectedIndex]?.text?.trim() || select.value || '';
    select.replaceWith(span);
  });

  cloned.querySelectorAll('input, textarea').forEach((inputEl) => {
    const input = inputEl as HTMLInputElement | HTMLTextAreaElement;
    const span = document.createElement('span');
    span.className = `budget-static-field ${input.className}`.trim();
    span.textContent = input.value?.trim() || input.getAttribute('placeholder') || '0';
    const inlineStyle = input.getAttribute('style');
    if (inlineStyle) span.setAttribute('style', inlineStyle);
    input.replaceWith(span);
  });

  cloned.querySelectorAll('button').forEach((buttonEl) => {
    const button = buttonEl as HTMLButtonElement;
    if (button.closest('.budget-intel-kpis')) return;
    const span = document.createElement('span');
    span.className = `budget-static-button ${button.className}`.trim();
    span.textContent = button.textContent?.trim() || '';
    button.replaceWith(span);
  });

  const exportCss = `
@page {
  size: A4;
  margin: 0;
}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #f5f1e8 !important;
}

.budget-pdf-snapshot {
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 12mm !important;
  background: #f5f1e8 !important;
}

.budget-pdf-running-brand {
  display: block;
  margin: 0 0 3mm 0;
  text-align: center;
  font-size: 10px;
  color: #1a3047;
  font-weight: 600;
  font-family: "Times New Roman", Times, Georgia, serif;
}

.budget-pdf-running-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 8mm 0;
  padding: 0 2px 4px 2px;
  border-bottom: 1px solid rgba(28, 49, 69, 0.1);
  background: #f5f1e8 !important;
}

.budget-pdf-running-kicker {
  margin: 0 0 3mm 0;
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: #46698f !important;
  font-weight: 700;
}

.budget-pdf-running-title {
  margin: 0 0 1.5mm 0;
  font-size: 21px;
  line-height: 1.1;
  color: #132b40 !important;
  font-weight: 700;
}

.budget-pdf-running-subtitle {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: #2b3f53 !important;
  max-width: 70ch;
}

.budget-pdf-running-badge {
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

.budget-pdf-paper,
.budget-pdf-paper * {
  opacity: 1 !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.budget-pdf-paper {
  overflow: visible !important;
  box-shadow: none !important;
}

.budget-pdf-paper .budget-table-wrap,
.budget-pdf-paper .budget-table {
  overflow: visible !important;
}

.budget-static-field,
.budget-static-pill,
.budget-static-button {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  box-sizing: border-box;
}

.budget-static-field {
  width: 100%;
  white-space: normal;
}

.budget-static-pill {
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
}

.budget-pdf-paper .budget-impact-shell {
  min-width: 118px;
}
`;

  return {
    html: `<div class="budget-pdf-snapshot">
      <div class="budget-pdf-running-brand">Financieramente</div>
      <header class="budget-pdf-running-header">
        <div class="budget-pdf-running-header-copy">
          <p class="budget-pdf-running-kicker">PRESUPUESTO</p>
          <h1 class="budget-pdf-running-title">Budget intelligence</h1>
          <p class="budget-pdf-running-subtitle">Tabla exportada con el estilo visual activo y los valores actuales del presupuesto.</p>
        </div>
        <div class="budget-pdf-running-badge">${escapeHtml(styleLabel)}</div>
      </header>
      ${cloned.outerHTML}
    </div>`,
    css: `${collectBudgetSnapshotCss(rootEl)}\n${exportCss}`,
  };
}
