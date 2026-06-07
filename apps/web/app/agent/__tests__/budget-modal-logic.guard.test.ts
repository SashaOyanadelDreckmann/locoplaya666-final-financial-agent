/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget modal logic guards', () => {
  const modalsPath = path.join(process.cwd(), 'app', 'agent', 'modals.tsx');
  const source = fs.readFileSync(modalsPath, 'utf8');

  it('opens in assistant mode on mobile when modal opens', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'use-budget-modal-layout.ts'), 'utf8');
    expect(layoutSource).toContain('useSyncExternalStore');
    expect(layoutSource).toContain('setBudgetViewMode(mobileShell ? 1 : 2);');
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
    expect(layoutSource).toContain('const maxMode = isDesktopLayout ? 3 : 2;');
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
    expect(source).toContain('mergeBudgetActionIntoRow');
    expect(source).toContain("if (kind === 'delete') {");
    expect(source).toContain('if (!rowExists) return;');
    expect(source).toContain("if (kind === 'update' && !rowExists) return;");
    expect(source).toContain("kind: kind === 'add' && rowExists ? 'update'");
  });

  it('defers table mutations until the user confirms pending assistant actions', () => {
    expect(source).toContain('budgetPendingConfirmation');
    expect(source).toContain('pendingConfirmation: budgetPendingConfirmation');
    expect(source).toContain('requires_confirmation');
    expect(source).toContain('setBudgetPendingConfirmation(null);');
  });

  it('keeps assistant UI minimal with only the current question and input', () => {
    expect(source).toContain('bcc-hero-question');
    expect(source).not.toContain('bcc-hero-reply');
    expect(source).not.toContain('budget-market-strip');
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

  it('wires mobile shell class, hidden cockpit, chat sync, and safe overlay dismiss', () => {
    expect(source).toContain("data-budget-mobile={isMobileShell ? 'true' : undefined}");
    expect(source).toContain("data-budget-view={budgetViewMode === 2 ? 'table' : 'assistant'}");
    expect(source).toContain('{!isMobileShell && (');
    expect(source).toContain('budget-cockpit-banner');
    expect(source).toContain('bcc-hero-question');
    expect(source).toContain('handleSendBudgetToAgent');
    expect(source).toContain('props.sendBudgetToAgent()');
    expect(source).toContain('budget-chat-sync-button');
    expect(source).toContain('handleOverlayPointerDown');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={budgetViewMode === 1}');
  });

  it('measures mobile row slot height for one-row table viewport', () => {
    expect(source).toContain('--budget-mobile-row-slot');
    expect(source).toContain('measureMobileRowSlot');
  });

  it('hides table informe button on mobile while keeping desktop copy', () => {
    expect(source).toContain('{isDesktopLayout && (');
    expect(source).toContain('Informe en chat');
  });

  it('scopes legacy table column hiding away from budget-table-pro', () => {
    const budgetCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget.css');
    const budgetCss = fs.readFileSync(budgetCssPath, 'utf8');
    expect(budgetCss).toContain('.budget-table:not(.budget-table-pro) th:nth-child(n+5)');
    expect(budgetCss).toContain('.budget-modal-body.is-desktop .budget-table-wrap');
  });
});
