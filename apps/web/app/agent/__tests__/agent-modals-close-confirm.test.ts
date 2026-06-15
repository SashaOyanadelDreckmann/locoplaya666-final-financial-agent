/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('modal close confirm css', () => {
  const confirmCssPath = path.join(
    process.cwd(),
    'app',
    'estilos',
    'modales',
    'comunes',
    'agent-modals-close-confirm.css',
  );
  const confirmCss = fs.readFileSync(confirmCssPath, 'utf8');
  const layoutCss = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
  const modalSource = fs.readFileSync(
    path.join(process.cwd(), 'app', 'agent', 'modales', 'comunes', 'ModalCloseConfirmDialog.tsx'),
    'utf8',
  );

  it('loads close confirm contract last in layout', () => {
    const imports = [...layoutCss.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    expect(imports.at(-1)).toBe('estilos/modales/comunes/agent-modals-close-confirm.css');
  });

  it('defines universal modal-close-confirm classes (budget canonical)', () => {
    expect(confirmCss).toContain('.modal-close-confirm-layer');
    expect(confirmCss).toContain('.modal-close-confirm-dialog');
    expect(confirmCss).toContain('rgba(28, 28, 30, 0.78)');
    expect(confirmCss).toContain('justify-content: center');
    expect(confirmCss).toContain('text-align: center');
  });

  it('wires budget and transactions dialogs through the shared component', () => {
    expect(modalSource).toContain('modal-close-confirm-layer');
    expect(modalSource).toContain('modal-close-confirm-actions');

    const budgetSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'comunes', 'BudgetCloseConfirmDialog.tsx'),
      'utf8',
    );
    const txSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'transacciones', 'TxCloseConfirmDialog.tsx'),
      'utf8',
    );

    expect(budgetSource).toContain('ModalCloseConfirmDialog');
    expect(txSource).toContain('ModalCloseConfirmDialog');
    expect(budgetSource).not.toContain('budget-close-confirm-layer');
    expect(txSource).not.toContain('tx-close-confirm-layer');
  });
});
