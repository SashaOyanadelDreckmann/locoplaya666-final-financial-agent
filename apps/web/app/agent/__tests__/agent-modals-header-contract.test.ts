/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('modal header contract css', () => {
  const headerCssPath = path.join(
    process.cwd(),
    'app',
    'estilos',
    'modales',
    'comunes',
    'agent-modals-header-contract.css',
  );
  const headerCss = fs.readFileSync(headerCssPath, 'utf8');
  const layoutCss = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
  const budgetSource = fs.readFileSync(
    path.join(process.cwd(), 'app', 'agent', 'modales', 'presupuesto', 'BudgetModal.tsx'),
    'utf8',
  );

  it('loads header contract after mobile fullscreen in layout', () => {
    expect(layoutCss).toContain("import './estilos/modales/comunes/agent-modals-header-contract.css';");
    const imports = [...layoutCss.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    const fullscreenIdx = imports.indexOf('estilos/modales/comunes/agent-modals-mobile-fullscreen.css');
    const headerIdx = imports.indexOf('estilos/modales/comunes/agent-modals-header-contract.css');
    const confirmIdx = imports.indexOf('estilos/modales/comunes/agent-modals-close-confirm.css');
    expect(fullscreenIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBe(fullscreenIdx + 1);
    expect(confirmIdx).toBe(headerIdx + 1);
    expect(confirmIdx).toBe(imports.length - 1);
  });

  it('keeps modal headers in document flow (not sticky)', () => {
    expect(headerCss).toContain('position: relative !important');
    expect(headerCss).toContain('top: auto !important');
    expect(headerCss).toContain('never sticky / fixed');
  });

  it('scopes flex scroll-host collapse fixes to mobile only and restores desktop tx layout', () => {
    expect(headerCss).toContain('mobile sheet only (desktop uses content height)');
    expect(headerCss).toContain('@media (min-width: 1101px)');
    expect(headerCss).toContain('flex: 0 1 auto !important');
    expect(headerCss).toContain('height: auto !important');
    expect(headerCss).not.toMatch(
      /^\.transactions-modal \.tx-scroll-body,\s*\n\.budget-modal \.budget-modal-body \{/m,
    );
  });

  it('defines left-aligned title row with top inset and close on the right', () => {
    expect(headerCss).toContain('--modal-header-top-inset');
    expect(headerCss).toContain('align-items: flex-start !important');
    expect(headerCss).toContain('text-align: left !important');
    expect(headerCss).toContain('justify-content: space-between !important');
    expect(headerCss).toContain('position: relative !important');
    expect(headerCss).toContain('margin-left: auto !important');
  });

  it('covers budget, transactions, interview, social and fincoin headers', () => {
    expect(headerCss).toContain('.budget-modal .budget-modal-header-title-row');
    expect(headerCss).toContain('.transactions-modal .bcc-modal-header');
    expect(headerCss).toContain('.interview-modal .bcc-modal-header');
    expect(headerCss).toContain('.social-modal-header');
    expect(headerCss).toContain('.fincoin-usage-header.bcc-modal-header');
  });

  it('places budget view nav and close button in the title row', () => {
    expect(budgetSource).toContain('budget-modal-header-title-row');
    expect(budgetSource).toMatch(
      /budget-modal-header-title-row[\s\S]*bcc-modal-title-wrap[\s\S]*BudgetViewNav[\s\S]*AgentModalCloseButton/,
    );
  });

  it('places budget header inside the scroll body', () => {
    expect(budgetSource).toMatch(
      /budget-modal-body[\s\S]*bcc-modal-header budget-modal-header-layer/,
    );
  });

  it('places transactions header inside tx-scroll-body', () => {
    const txSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'transacciones', 'TransactionsModal.tsx'),
      'utf8',
    );
    expect(txSource).toMatch(/tx-scroll-body[\s\S]*bcc-modal-header tx-modal-header-layer/);
  });
});
