'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getCsrfToken } from '@/lib/sesion/csrf';
import { dismissMobileKeyboard } from '@/lib/interfaz/mobile-keyboard-focus';
import { FINCOIN_SPEND_BLOCKED_MESSAGE } from '@/lib/compartido/fincoin-gate';
import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import {
  inferBudgetFocusRowId,
  resolveBudgetChatTargetRow,
} from '@/lib/presupuesto/filas.helpers';
import {
  compactBudgetChatAnswers,
  type BudgetPendingConfirmation,
  type BudgetProductSnapshot,
  type BudgetTableAction,
} from '@financial-agent/shared';

import {
  buildBudgetRowSummary,
  formatBudgetAssistantTurn,
  getAssistantMessage,
  getBudgetQuestionForRow,
  getNextQuestion,
  normalizeActionRowId,
  sanitizeBudgetQuestion,
  type BudgetModalAssistantContextInput,
} from './budget-modal.helpers';
import {
  BUDGET_CHAT_ABORT_MESSAGE,
  BUDGET_CHAT_WATCHDOG_MS,
  budgetChatErrorMessage,
  createBudgetChatHttpError,
  isBudgetChatAbortError,
  normalizeBudgetChatPayload,
  unwrapApiData,
  type BudgetChatApiPayload,
} from './budget-modal.chat-api';

export type UseBudgetChatParams = {
  isOpen: boolean;
  fincoinSpendBlocked?: boolean;
  budgetRows: BudgetRow[];
  chatAnswers: Array<{ q: string; a: string }>;
  onChatAnswersChange: (answers: Array<{ q: string; a: string }>) => void;
  bankProducts?: BudgetProductSnapshot[];
  activeBudgetRowId: string | null;
  assistantBudgetRowId: string | null;
  setAssistantBudgetRowId: (id: string | null) => void;
  resolveLocalBudgetQuestion: (rowId: string | null) => string;
  onApplyTableActions: (actions: Array<Record<string, unknown>>) => string | null;
  onInitFocusReset?: () => void;
  pendingConfirmation?: BudgetPendingConfirmation | null;
  onPendingConfirmationChange?: (pending: BudgetPendingConfirmation | null) => void;
};

export function useBudgetChat(params: UseBudgetChatParams) {
  const {
    isOpen,
    fincoinSpendBlocked,
    budgetRows,
    chatAnswers,
    onChatAnswersChange,
    bankProducts,
    activeBudgetRowId,
    assistantBudgetRowId,
    setAssistantBudgetRowId,
    resolveLocalBudgetQuestion,
    onApplyTableActions,
    onInitFocusReset,
    pendingConfirmation: controlledPending,
    onPendingConfirmationChange,
  } = params;

  const [internalPending, setInternalPending] = useState<BudgetPendingConfirmation | null>(null);
  const budgetPendingConfirmation =
    onPendingConfirmationChange !== undefined ? (controlledPending ?? null) : internalPending;
  const setBudgetPendingConfirmation = useCallback(
    (next: BudgetPendingConfirmation | null) => {
      if (onPendingConfirmationChange) {
        onPendingConfirmationChange(next);
        return;
      }
      setInternalPending(next);
    },
    [onPendingConfirmationChange],
  );
  const [budgetReply, setBudgetReply] = useState('');
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [conversationDone, setConversationDone] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [assistantNextQuestion, setAssistantNextQuestion] = useState<string | null>(null);
  const [lastUserAnswer, setLastUserAnswer] = useState<string | null>(null);
  const [typewriterTurnKey, setTypewriterTurnKey] = useState(0);
  const [resumedSession, setResumedSession] = useState(false);

  const budgetPendingConfirmationRef = useRef<BudgetPendingConfirmation | null>(null);
  const isOpenRef = useRef(isOpen);
  const askingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replySubmitLockRef = useRef(false);
  const initAbortRef = useRef<AbortController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const budgetInitStartedRef = useRef(false);
  const chatAnswersRef = useRef(chatAnswers);
  const bankProductsRef = useRef(bankProducts);
  const resolveLocalBudgetQuestionRef = useRef(resolveLocalBudgetQuestion);
  const onInitFocusResetRef = useRef(onInitFocusReset);

  chatAnswersRef.current = chatAnswers;
  bankProductsRef.current = bankProducts;
  resolveLocalBudgetQuestionRef.current = resolveLocalBudgetQuestion;
  onInitFocusResetRef.current = onInitFocusReset;

  const isBudgetChatBusy = isAskingAI || isInitializing;
  const activeQuestion = assistantNextQuestion ?? '¿Qué quieres cambiar en tu presupuesto?';
  const agentTypewriterText =
    formatBudgetAssistantTurn({
      assistant_reply: assistantReply ?? undefined,
      next_question: assistantNextQuestion,
    }) || activeQuestion;

  const applyAssistantTurn = useCallback((payload: BudgetChatApiPayload) => {
    const reply = getAssistantMessage(payload);
    setAssistantReply(reply || null);
    const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
    setAssistantNextQuestion(nextQuestion || null);
    setLastUserAnswer(null);
    setTypewriterTurnKey((prev) => prev + 1);
  }, []);

  const restoreLocalSession = useCallback(() => {
    const answers = chatAnswersRef.current;
    const lastTurn = answers[answers.length - 1];
    const lastQuestion = lastTurn?.q?.trim() ?? '';
    const focusId = inferBudgetFocusRowId(lastQuestion) ?? 'income_salary';
    setBudgetReply('');
    setConversationDone(false);
    setAiError(null);
    setBudgetPendingConfirmation(null);
    setAssistantReply(null);
    setLastUserAnswer(lastTurn?.a?.trim() || null);
    setTypewriterTurnKey((prev) => prev + 1);
    const nextQuestion = resolveLocalBudgetQuestionRef.current(focusId);
    setAssistantNextQuestion(nextQuestion);
    setAssistantBudgetRowId(focusId);
    setResumedSession(true);
    setIsInitializing(false);
    setIsAskingAI(false);
    onInitFocusResetRef.current?.();
  }, [setAssistantBudgetRowId, setBudgetPendingConfirmation]);

  const resetBudgetChatSession = useCallback(() => {
    setBudgetReply('');
    setAssistantReply(null);
    setConversationDone(false);
    setIsAskingAI(false);
    setIsInitializing(false);
    setAiError(null);
    setAssistantNextQuestion(null);
    setLastUserAnswer(null);
    setTypewriterTurnKey(0);
    setResumedSession(false);
    replySubmitLockRef.current = false;
    budgetInitStartedRef.current = false;
    if (!onPendingConfirmationChange) {
      setBudgetPendingConfirmation(null);
    }
    onInitFocusResetRef.current?.();
  }, [onPendingConfirmationChange, setBudgetPendingConfirmation]);

  const consumeBudgetChatPayload = useCallback(
    (payload: BudgetChatApiPayload) => {
      if (!isOpenRef.current) return;

      const requiresConfirmation = Boolean(payload.requires_confirmation);
      let lastTouchedRowId: string | null = null;
      if (requiresConfirmation && payload.pending_confirmation) {
        setBudgetPendingConfirmation({
          actions: payload.pending_confirmation.actions as BudgetTableAction[],
          summary: payload.pending_confirmation.summary,
        });
      } else {
        setBudgetPendingConfirmation(null);
        const rawActions = payload.actions ?? (payload.action ? [payload.action] : []);
        lastTouchedRowId = onApplyTableActions(rawActions);
      }
      setConversationDone(Boolean(payload.done));
      applyAssistantTurn(payload);
      const explicitFocus = normalizeActionRowId(payload.focus_row_id);
      const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
      setAssistantNextQuestion(nextQuestion || null);
      if (explicitFocus || lastTouchedRowId) {
        setAssistantBudgetRowId(explicitFocus ?? lastTouchedRowId ?? null);
      } else if (nextQuestion) {
        setAssistantBudgetRowId(inferBudgetFocusRowId(nextQuestion));
      }
      setResumedSession(false);
    },
    [applyAssistantTurn, onApplyTableActions, setAssistantBudgetRowId],
  );

  const rejectFincoinSpend = useCallback((): boolean => {
    if (!fincoinSpendBlocked) return false;
    setAiError(FINCOIN_SPEND_BLOCKED_MESSAGE);
    return true;
  }, [fincoinSpendBlocked]);

  const applyPendingTableActions = useCallback((): boolean => {
    const pending = budgetPendingConfirmationRef.current;
    if (!pending?.actions?.length) return false;
    const applied = onApplyTableActions(pending.actions as Array<Record<string, unknown>>);
    return applied !== null;
  }, [onApplyTableActions]);

  const handleBudgetAgentReplySubmit = useCallback(
    async (forcedAnswer?: string, pendingOverride?: BudgetPendingConfirmation | null) => {
      const answer = (forcedAnswer ?? budgetReply).trim();
      if (rejectFincoinSpend()) return;
      if (!answer || !isOpen || isAskingAI || isInitializing || replySubmitLockRef.current) return;
      replySubmitLockRef.current = true;

      const manualFocusRowId = activeBudgetRowId;
      const pendingForTurn = pendingOverride ?? budgetPendingConfirmationRef.current;
      const questionForTurn =
        assistantNextQuestion ??
        (manualFocusRowId ? resolveLocalBudgetQuestion(manualFocusRowId) : null) ??
        activeQuestion;
      const newChatAnswers = [...chatAnswers, { q: questionForTurn, a: answer }];
      if (!forcedAnswer) setBudgetReply('');
      dismissMobileKeyboard();
      setAiError(null);
      setLastUserAnswer(answer);
      setResumedSession(false);

      const inferredFocusId = inferBudgetFocusRowId(assistantNextQuestion ?? activeQuestion) ?? null;
      const focusedRowId = activeBudgetRowId ?? assistantBudgetRowId ?? inferredFocusId;
      const activeBudgetRow = budgetRows.find((row) => row.id === focusedRowId) ?? null;

      const chatTargetRow =
        resolveBudgetChatTargetRow(budgetRows, questionForTurn, {
          manualFocusRowId,
          assistantFocusRowId: assistantBudgetRowId,
          activeRow: activeBudgetRow,
          answer,
        }) ?? null;

      try {
        setIsAskingAI(true);
        replyAbortRef.current?.abort();
        replyAbortRef.current = new AbortController();
        const replySignal = replyAbortRef.current.signal;
        if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
        askingWatchdogRef.current = setTimeout(() => {
          replyAbortRef.current?.abort();
        }, BUDGET_CHAT_WATCHDOG_MS);

        const csrfToken = getCsrfToken();
        const res = await fetch('/api/budget-chat', {
          method: 'POST',
          signal: replySignal,
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            intent: 'reply',
            question: questionForTurn,
            nextQuestion: questionForTurn,
            answer,
            budgetRows: budgetRows.slice(0, 30),
            chatAnswers: newChatAnswers.slice(-20),
            products: bankProducts ?? [],
            manualFocusRowId,
            assistantFocusRowId: assistantBudgetRowId,
            activeRowId: chatTargetRow?.id ?? null,
            activeRow: chatTargetRow ? buildBudgetRowSummary(chatTargetRow) : null,
            pendingConfirmation: pendingForTurn,
          }),
        });
        const raw = await res.json();
        if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
        if (!isOpenRef.current || replySignal.aborted) return;

        const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
        if (payload) {
          onChatAnswersChange(newChatAnswers);
          consumeBudgetChatPayload(payload);
        } else if (isOpenRef.current) {
          setAssistantReply('No recibí respuesta. Reformula con monto o categoría.');
          setAssistantNextQuestion(null);
        }
      } catch (error) {
        if (isBudgetChatAbortError(error)) {
          if (isOpenRef.current) {
            if (!forcedAnswer) setBudgetReply(answer);
            setAiError(BUDGET_CHAT_ABORT_MESSAGE);
          }
        } else if (isOpenRef.current) {
          if (!forcedAnswer) setBudgetReply(answer);
          setAiError(budgetChatErrorMessage(error));
        }
      } finally {
        if (askingWatchdogRef.current) {
          clearTimeout(askingWatchdogRef.current);
          askingWatchdogRef.current = null;
        }
        if (isOpenRef.current) setIsAskingAI(false);
        replySubmitLockRef.current = false;
      }
    },
    [
      activeBudgetRowId,
      activeQuestion,
      assistantBudgetRowId,
      assistantNextQuestion,
      bankProducts,
      budgetReply,
      budgetRows,
      chatAnswers,
      consumeBudgetChatPayload,
      isAskingAI,
      isInitializing,
      isOpen,
      onChatAnswersChange,
      rejectFincoinSpend,
      resolveLocalBudgetQuestion,
    ],
  );

  const handleBudgetPendingConfirm = useCallback(() => {
    const pending = budgetPendingConfirmationRef.current;
    if (!pending?.actions?.length) return;
    applyPendingTableActions();
    setBudgetPendingConfirmation(null);
    void handleBudgetAgentReplySubmit('sí', pending);
  }, [applyPendingTableActions, handleBudgetAgentReplySubmit, setBudgetPendingConfirmation]);

  const handleBudgetPendingReject = useCallback(() => {
    const pending = budgetPendingConfirmationRef.current;
    if (!pending) return;
    setBudgetPendingConfirmation(null);
    void handleBudgetAgentReplySubmit('no', pending);
  }, [handleBudgetAgentReplySubmit, setBudgetPendingConfirmation]);

  useEffect(() => {
    budgetPendingConfirmationRef.current = budgetPendingConfirmation;
  }, [budgetPendingConfirmation]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
      initAbortRef.current = null;
      replyAbortRef.current = null;
      resetBudgetChatSession();
    }
  }, [isOpen, resetBudgetChatSession]);

  useEffect(
    () => () => {
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      budgetInitStartedRef.current = false;
      return;
    }
    if (fincoinSpendBlocked) {
      setAiError(FINCOIN_SPEND_BLOCKED_MESSAGE);
      setIsInitializing(false);
      return;
    }
    if (budgetRows.length === 0) return;
    if (budgetInitStartedRef.current) return;
    budgetInitStartedRef.current = true;

    if (chatAnswersRef.current.length > 0) {
      restoreLocalSession();
      return;
    }

    const budgetRowsForInit = budgetRows.slice(0, 30);
    setBudgetReply('');
    setConversationDone(false);
    setAiError(null);
    setBudgetPendingConfirmation(null);
    setAssistantReply(null);
    setAssistantNextQuestion(null);
    setLastUserAnswer(null);
    setTypewriterTurnKey(0);
    setResumedSession(false);
    setIsInitializing(true);
    onInitFocusResetRef.current?.();

    initAbortRef.current?.abort();
    const initController = new AbortController();
    initAbortRef.current = initController;
    const initSignal = initController.signal;

    void (async () => {
      try {
        const csrfToken = getCsrfToken();
        const res = await fetch('/api/budget-chat', {
          method: 'POST',
          signal: initSignal,
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            intent: 'init',
            budgetRows: budgetRowsForInit,
            chatAnswers: compactBudgetChatAnswers(chatAnswersRef.current, { maxTurns: 20 }),
            products: bankProductsRef.current ?? [],
            activeRowId: null,
            activeRow: null,
          }),
        });
        const raw = await res.json();
        if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
        if (!isOpenRef.current || initSignal.aborted) return;

        const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
        if (payload) {
          applyAssistantTurn(payload);
          const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
          setAssistantNextQuestion(nextQuestion || null);
          setAssistantBudgetRowId(payload.focus_row_id ?? inferBudgetFocusRowId(nextQuestion));
        } else {
          const fallbackQuestion = resolveLocalBudgetQuestionRef.current('income_salary');
          setAssistantReply(null);
          setAssistantNextQuestion(fallbackQuestion);
          setAssistantBudgetRowId('income_salary');
        }
      } catch (err) {
        if (isBudgetChatAbortError(err) || !isOpenRef.current) return;
        const fallbackQuestion = resolveLocalBudgetQuestionRef.current('income_salary');
        setAssistantReply(null);
        setAssistantNextQuestion(fallbackQuestion);
        setAssistantBudgetRowId('income_salary');
        setAiError(budgetChatErrorMessage(err));
      } finally {
        if (isOpenRef.current) setIsInitializing(false);
      }
    })();

    return () => {
      initController.abort();
      setIsInitializing(false);
    };
  }, [applyAssistantTurn, budgetRows.length, fincoinSpendBlocked, isOpen, restoreLocalSession, setAssistantBudgetRowId]);

  return {
    budgetReply,
    setBudgetReply,
    assistantNextQuestion,
    lastUserAnswer,
    typewriterTurnKey,
    conversationDone,
    budgetPendingConfirmation,
    setBudgetPendingConfirmation,
    isAskingAI,
    isInitializing,
    isBudgetChatBusy,
    aiError,
    setAiError,
    agentTypewriterText,
    activeQuestion,
    resumedSession,
    handleBudgetAgentReplySubmit,
    handleBudgetPendingConfirm,
    handleBudgetPendingReject,
    setAssistantNextQuestion,
  };
}

export function buildBudgetAssistantContextInput(
  budgetRows: BudgetRow[],
  chatAnswers: Array<{ q: string; a: string }>,
): BudgetModalAssistantContextInput {
  return { budgetRows, chatAnswers };
}

export function resolveBudgetQuestionForRow(
  row: BudgetRow | null,
  contextInput: BudgetModalAssistantContextInput,
  fallbackRowId?: string | null,
): string {
  return getBudgetQuestionForRow(row, contextInput, fallbackRowId);
}
