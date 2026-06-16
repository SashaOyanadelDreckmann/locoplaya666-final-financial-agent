/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('useBudgetChat hook guards', () => {
  const hookPath = path.join(
    process.cwd(),
    'app',
    'agent',
    'modales',
    'presupuesto',
    'use-budget-chat.ts',
  );
  const source = fs.readFileSync(hookPath, 'utf8');

  it('waits for budget rows before starting chat init', () => {
    expect(source).toContain('if (budgetRows.length === 0) return;');
    expect(source).toContain('budgetInitStartedRef');
  });

  it('prevents duplicate reply submissions while a request is in flight', () => {
    expect(source).toContain('const replySubmitLockRef = useRef(false);');
    expect(source).toContain('isAskingAI || isInitializing || replySubmitLockRef.current');
    expect(source).toContain('replySubmitLockRef.current = true;');
    expect(source).toContain('replySubmitLockRef.current = false;');
  });

  it('aborts in-flight budget chat when the modal closes', () => {
    expect(source).toContain('isOpenRef');
    expect(source).toContain('initAbortRef.current?.abort()');
    expect(source).toContain('replyAbortRef.current?.abort()');
    expect(source).toContain('if (!isOpenRef.current');
  });

  it('commits chat answers only after a successful assistant reply', () => {
    expect(source).toContain('onChatAnswersChange(newChatAnswers)');
    expect(source).not.toMatch(
      /onChatAnswersChange\(newChatAnswers\);\s*\n\s*setBudgetReply\(''\)/,
    );
  });

  it('resumes local session when chat answers already exist', () => {
    expect(source).toContain('chatAnswersRef.current.length > 0');
    expect(source).toContain('restoreLocalSession');
    expect(source).toContain('setResumedSession(true)');
    expect(source).not.toMatch(/chatAnswersRef\.current\.length > 0[\s\S]{0,220}intent: 'init'/);
  });

  it('clears initializing state when init effect is aborted or cleaned up', () => {
    expect(source).toContain('initController.abort()');
    expect(source).toContain('setIsInitializing(false)');
    expect(source).not.toContain('if (!initSignal.aborted && isOpenRef.current) setIsInitializing(false)');
  });

  it('defers table mutations until the user confirms pending assistant actions', () => {
    expect(source).toContain('pendingConfirmation: pendingForTurn');
    expect(source).toContain('requires_confirmation');
    expect(source).toContain('setBudgetPendingConfirmation(null);');
  });
});
