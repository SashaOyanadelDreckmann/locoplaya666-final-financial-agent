/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget modal logic guards', () => {
  const modalsPath = path.join(process.cwd(), 'app', 'agent', 'modals.tsx');
  const source = fs.readFileSync(modalsPath, 'utf8');

  it('opens in split/stack senior mode by default when modal opens', () => {
    expect(source).toContain('shouldUseMobileShell');
    expect(source).toContain('setBudgetViewMode(!shouldUseMobileShell() ? 2 : 1);');
  });

  it('mounts the budget modal in the agent page again', () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'page.tsx'), 'utf8');
    expect(pageSource).toContain('<BudgetModal');
    expect(pageSource).toContain('isBudgetModalOpen');
    expect(pageSource).toContain('setIsBudgetModalOpen(true);');
  });

  it('keeps desktop->mobile mode fallback to prevent invalid mode 3 on mobile', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'use-budget-modal-layout.ts'), 'utf8');
    expect(layoutSource).toContain('shouldUseMobileShell');
    expect(layoutSource).toContain("if (!desktop) setBudgetViewMode((prev) => (prev === 3 ? 2 : prev));");
  });

  it('auto-applies budget template when modal opens with empty rows', () => {
    expect(source).toContain('const templateAppliedRef = useRef(false);');
    expect(source).toContain('if (props.budgetRows.length > 0 || templateAppliedRef.current) return;');
    expect(source).toContain('props.applyBudgetTemplate();');
  });

  it('opens budget init without stale active row context', () => {
    expect(source).toContain('activeRowId: null,');
    expect(source).toContain('activeRow: null,');
  });

  it('prevents duplicate reply submissions while a request is in flight', () => {
    expect(source).toContain('const replySubmitLockRef = useRef(false);');
    expect(source).toContain('if (!answer || isAskingAI || replySubmitLockRef.current) return;');
    expect(source).toContain('replySubmitLockRef.current = true;');
    expect(source).toContain('replySubmitLockRef.current = false;');
  });

  it('cleans up async budget timers on unmount', () => {
    expect(source).toContain('budgetActionTimersRef.current.forEach((timerId) => clearTimeout(timerId));');
    expect(source).toContain('budgetDotTimersRef.current.forEach((timerId) => clearTimeout(timerId));');
    expect(source).toContain('budgetActionTimersRef.current = [];');
    expect(source).toContain('budgetDotTimersRef.current = [];');
  });

  it('guards client-side AI actions against unknown row deletes and blind updates', () => {
    expect(source).toContain('const existingRowIds = new Set(props.budgetRows.map((row) => normalizeActionRowId(row.id)).filter(Boolean));');
    expect(source).toContain("if (kind === 'delete') {");
    expect(source).toContain('if (!rowExists) return;');
    expect(source).toContain("if (kind === 'update' && !rowExists) return;");
    expect(source).toContain("if (kind === 'add' && rowExists) kind = 'update';");
  });

  it('opens the budget modal from the panel card instead of leaving dead copy', () => {
    const panelCardsSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'panel-cards.tsx'), 'utf8');
    expect(panelCardsSource).toContain('openBudgetModal');
    expect(panelCardsSource).toContain('Presupuesto está bloqueado: primero completa Productos y Transacciones.');
    expect(panelCardsSource).not.toContain('modal de presupuesto fue retirado');
  });

  it('prioritizes assistant_reply and suppresses next step for education turns', () => {
    const helperSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'budget-modal.helpers.ts'), 'utf8');
    expect(helperSource).toContain('export function getAssistantMessage(payload:');
    expect(helperSource).toContain('payload.assistant_reply');
    expect(helperSource).toContain("payload.source === 'deterministic_education'");
    expect(helperSource).toContain('if (payload.next_question === null) return');
  });

  it('maps auth, rate limit and server failures to explicit assistant error copy', () => {
    expect(source).toContain("if (message.includes('HTTP 401'))");
    expect(source).toContain('Sesion expirada o no iniciada. Vuelve a entrar para usar el asistente.');
    expect(source).toContain("if (message.includes('HTTP 429'))");
    expect(source).toContain('Demasiadas solicitudes al asistente. Espera un momento e intenta otra vez.');
    expect(source).toContain("if (message.includes('HTTP 5'))");
    expect(source).toContain('El servicio del asistente no esta disponible ahora. Intenta nuevamente en unos segundos.');
  });

  it('wires mobile shell class, compact cockpit, chat sync, and safe overlay dismiss', () => {
    expect(source).toContain("isMobileShell ? ' is-mobile-shell' : ''");
    expect(source).toContain('is-compact');
    expect(source).toContain('handleSendBudgetToAgent');
    expect(source).toContain('props.sendBudgetToAgent()');
    expect(source).toContain('budget-chat-sync-button');
    expect(source).toContain('handleOverlayPointerDown');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={budgetViewMode === 1}');
  });

  it('scopes legacy table column hiding away from budget-table-pro', () => {
    const budgetCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget.css');
    const budgetCss = fs.readFileSync(budgetCssPath, 'utf8');
    expect(budgetCss).toContain('.budget-table:not(.budget-table-pro) th:nth-child(n+5)');
    expect(budgetCss).toContain('.budget-modal-body.is-desktop .budget-table-wrap');
  });
});
