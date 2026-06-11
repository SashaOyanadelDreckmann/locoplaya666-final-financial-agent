/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget modal logic guards', () => {
  const budgetModalPath = path.join(process.cwd(), 'app', 'agent', 'BudgetModal.tsx');
  const source = fs.readFileSync(budgetModalPath, 'utf8');

  it('opens in mode 1 when modal opens (assistant on mobile, split on desktop)', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'use-budget-modal-layout.ts'), 'utf8');
    expect(layoutSource).toContain('useSyncExternalStore');
    expect(layoutSource).toContain('setBudgetViewMode(1);');
  });

  it('mounts the budget modal in the agent page again', () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'page.tsx'), 'utf8');
    expect(pageSource).toContain('<BudgetModal');
    expect(pageSource).toContain('isBudgetModalOpen');
    expect(pageSource).toContain('setIsBudgetModalOpen(true);');
    expect(pageSource).toMatch(/hasBlockingModalOpen[\s\S]*isBudgetModalOpen/);
  });

  it('keeps three desktop modes and two mobile modes', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'use-budget-modal-layout.ts'), 'utf8');
    expect(layoutSource).toContain('shouldUseMobileShell');
    expect(layoutSource).toContain('export type BudgetViewMode = 1 | 2 | 3;');
    expect(layoutSource).toContain("'table-only'");
    expect(layoutSource).toContain("'split'");
    expect(layoutSource).toContain("'agent-front'");
    const budgetModalSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'BudgetModal.tsx'), 'utf8');
    expect(budgetModalSource).toContain('budget-assistant-blur-veil');
    expect(layoutSource).toContain('isBudgetAssistantOverlayMode');
    expect(layoutSource).toContain('isBudgetSplitMode');
    expect(budgetModalSource).toContain('isBudgetAssistantOverlayMode');
    expect(budgetModalSource).toContain('tableViewMode');
    expect(budgetModalSource).toContain('Asistente + Tabla');
    expect(budgetModalSource).toContain("onClick={() => setBudgetViewMode(2)}");
    expect(budgetModalSource).toContain('onClick={() => setBudgetViewMode(tableViewMode)}');
    expect(budgetModalSource).toContain('BudgetCarouselStage');
    expect(budgetModalSource).toContain('budget-mobile-stage');
    expect(budgetModalSource).not.toContain('budget-desktop-stage');
    expect(budgetModalSource).toContain('data-budget-table-style={budgetTableStyle}');
    expect(budgetModalSource).toContain('tableStyle={budgetTableStyle}');
  });

  it('auto-applies budget template when modal opens with empty rows', () => {
    expect(source).toContain('const templateAppliedRef = useRef(false);');
    expect(source).toContain('if (props.budgetRows.length > 0 || templateAppliedRef.current) return;');
    expect(source).toContain('props.applyBudgetTemplate();');
  });

  it('waits for budget rows before starting chat init', () => {
    expect(source).toContain('if (props.budgetRows.length === 0) return;');
    expect(source).toContain('budgetInitStartedRef');
  });

  it('avoids duplicate budget init when switching back from mobile table mode', () => {
    expect(source).toContain('resolveLocalBudgetQuestion');
    expect(source).not.toMatch(/previousMode === tableViewMode[\s\S]{0,400}intent: 'init'/);
  });

  it('uses lightweight local fallbacks while agent round-trip is pending', () => {
    const helperSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'budget-modal.helpers.ts'), 'utf8');
    expect(helperSource).toContain('getBudgetQuestionForRow');
    expect(helperSource).toContain('¿Qué quieres cambiar en tu presupuesto?');
  });

  it('keeps single-turn assistant UI with typewriter and user echo', () => {
    expect(source).toContain('AgentHeroText');
    expect(source).toContain('agent-hero-text');
    const heroSource = fs.readFileSync(
      path.join(process.cwd(), 'components', 'ui', 'agent-hero-text.tsx'),
      'utf8',
    );
    expect(heroSource).toContain('agent-keyword-gradient');
    expect(heroSource).toContain('agent-hero-highlight.helpers');
    expect(source).toContain('focusRow={activeBudgetRow}');
    expect(source).toContain('lastUserAnswer');
    expect(source).toContain('bcc-hero-reply');
    expect(source).not.toContain('bcc-hero-transcript');
    expect(source).not.toContain('budgetTranscript');
    expect(source).toContain('formatBudgetAssistantTurn');
  });

  it('prevents duplicate reply submissions while a request is in flight', () => {
    expect(source).toContain('const replySubmitLockRef = useRef(false);');
    expect(source).toContain('!props.isOpen || isAskingAI || isInitializing || replySubmitLockRef.current');
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
    expect(source).toContain('function parseBudgetTableAction(');
    expect(source).toContain('mergeBudgetActionIntoRow');
    expect(source).toContain("if (kind === 'delete') {");
    expect(source).toContain('if (!rowExists) return null;');
    expect(source).toContain("if (kind === 'update' && !rowExists) return null;");
    expect(source).toContain("kind: kind === 'add' && rowExists ? 'update'");
    expect(source).toContain('const parsed = parseBudgetTableAction(action, existingRow, Boolean(existingRow));');
    expect(source).toContain('if (!parsed) continue;');
  });

  it('defers table mutations until the user confirms pending assistant actions', () => {
    expect(source).toContain('budgetPendingConfirmation');
    expect(source).toContain('pendingConfirmation: budgetPendingConfirmation');
    expect(source).toContain('requires_confirmation');
    expect(source).toContain('setBudgetPendingConfirmation(null);');
    expect(source).toContain('BudgetPendingConfirmBanner');
    expect(source).toContain("handleBudgetAgentReplySubmit('sí')");
    expect(source).toContain("handleBudgetAgentReplySubmit('no')");
  });

  it('aborts in-flight budget chat when the modal closes', () => {
    expect(source).toContain('isOpenRef');
    expect(source).toContain('initAbortRef.current?.abort()');
    expect(source).toContain('replyAbortRef.current?.abort()');
    expect(source).toContain('if (!isOpenRef.current');
    expect(source).not.toContain('autoSendTimerRef');
  });

  it('commits chat answers only after a successful assistant reply', () => {
    expect(source).toContain('props.onChatAnswersChange(newChatAnswers)');
    expect(source).not.toMatch(
      /props\.onChatAnswersChange\(newChatAnswers\);\s*\n\s*setBudgetReply\(''\)/,
    );
  });

  it('keeps modals barrel free of duplicated budget snapshot helpers', () => {
    const modalsSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'modals.tsx'), 'utf8');
    expect(modalsSource).not.toContain('collectBudgetSnapshotCss');
    expect(modalsSource).not.toContain('buildBudgetSnapshotHtmlAndCss');
    expect(modalsSource).toContain("export { BudgetModal } from './BudgetModal'");
  });

  it('centralizes budget chat API helpers outside the modal component', () => {
    const apiSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'budget-modal.chat-api.ts'), 'utf8');
    expect(apiSource).toContain('export function normalizeBudgetChatPayload');
    expect(apiSource).toContain('BUDGET_CHAT_WATCHDOG_MS');
    expect(apiSource).toContain('BUDGET_CHAT_ABORT_MESSAGE');
  });

  it('keeps assistant UI minimal with only the current turn and input', () => {
    expect(source).toContain('bcc-hero-question');
    expect(source).toContain('bcc-hero-reply');
    expect(source).not.toContain('budget-market-strip');
    expect(source).not.toContain('bcc-hero-transcript');
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
    const apiSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'budget-modal.chat-api.ts'), 'utf8');
    expect(apiSource).toContain("if (message.includes('HTTP 401'))");
    expect(apiSource).toContain('Sesión expirada o no iniciada. Vuelve a entrar para usar el asistente.');
    expect(apiSource).toContain("if (message.includes('HTTP 429'))");
    expect(apiSource).toContain('Demasiadas solicitudes al asistente. Espera un momento e intenta otra vez.');
    expect(apiSource).toContain("if (message.includes('HTTP 5'))");
    expect(apiSource).toContain('El servicio del asistente no está disponible ahora. Intenta nuevamente en unos segundos.');
    expect(source).toContain('BUDGET_CHAT_ABORT_MESSAGE');
  });

  it('wires mobile shell class, hidden cockpit, chat sync, and safe overlay dismiss', () => {
    expect(source).toContain("data-budget-mobile={isMobileShell ? 'true' : undefined}");
    expect(source).toContain('resolveBudgetViewDataAttr(isDesktopLayout, budgetViewMode)');
    expect(source).toContain('{!isMobileShell && (');
    expect(source).toContain('budget-cockpit-banner');
    expect(source).toContain('bcc-hero-question');
    expect(source).toContain('handleSendBudgetToAgent');
    expect(source).toContain('props.sendBudgetToAgent()');
    expect(source).toContain('budget-chat-sync-button');
    expect(source).toContain('handleOverlayPointerDown');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={budgetViewMode === 1}');
    expect(source).toContain('useBudgetCloseConfirm');
    expect(source).toContain('BudgetCloseConfirmDialog');
    expect(source).toContain('requestClose');
    expect(source).toContain('forceClose');
    expect(source).not.toContain('onClick={props.onClose}');
  });

  it('extracts pdf snapshot helpers into a dedicated module', () => {
    expect(source).toContain("from './budget-modal.snapshot'");
    expect(source).not.toContain('function collectBudgetSnapshotCss');
    const snapshotSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'budget-modal.snapshot.ts'), 'utf8');
    expect(snapshotSource).toContain('export function buildBudgetSnapshotHtmlAndCss');
    const chatThreadSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'chat-thread-view.tsx'), 'utf8');
    expect(chatThreadSource).toContain("from './bubble-chat.snapshot'");
    const bubbleSnapshotSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'bubble-chat.snapshot.ts'), 'utf8');
    expect(bubbleSnapshotSource).toContain('export function buildBubbleSnapshotHtmlAndCss');
  });

  it('measures mobile row slot height for one-row table viewport', () => {
    expect(source).toContain('--budget-mobile-row-slot');
    expect(source).toContain('measureMobileRowSlot');
    expect(source).toContain('resolveDominantMobileBudgetRowScrollTop');
    expect(source).toContain('readMobileBudgetRowSnapCandidates');
  });

  it('shows informe action below assistant compose on assistant and split views', () => {
    expect(source).toContain('showAssistantInformeAction');
    expect(source).toContain('isAssistantOverlayMode');
    expect(source).toContain('isSplitMode');
    expect(source).toContain('bcc-hero-compose');
    expect(source).toContain('Generar informe en chat');
    expect(source).toContain('Informe en chat');
  });

  it('scopes legacy table column hiding away from budget-table-pro', () => {
    const budgetCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget.css');
    const budgetCss = fs.readFileSync(budgetCssPath, 'utf8');
    expect(budgetCss).toContain('.budget-table:not(.budget-table-pro) th:nth-child(n+5)');
    expect(budgetCss).toContain('.budget-modal-body.is-desktop .budget-table-wrap');
  });
});
