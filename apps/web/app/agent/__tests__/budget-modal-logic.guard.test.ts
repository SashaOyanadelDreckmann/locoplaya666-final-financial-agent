/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget modal logic guards', () => {
  const modalsPath = path.join(process.cwd(), 'app', 'agent', 'modals.tsx');
  const source = fs.readFileSync(modalsPath, 'utf8');

  it('opens in split/stack senior mode by default when modal opens', () => {
    expect(source).toContain("setBudgetViewMode(window.innerWidth >= 1024 ? 2 : 1);");
  });

  it('keeps desktop->mobile mode fallback to prevent invalid mode 3 on mobile', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'use-budget-modal-layout.ts'), 'utf8');
    expect(layoutSource).toContain('window.innerWidth >= 1024');
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
});
