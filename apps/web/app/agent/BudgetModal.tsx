'use client';

import { useEffect, useRef, useState } from 'react';
import { focusMobileInput } from '@/lib/mobile-viewport-sync';
import { getCsrfToken } from '@/lib/csrf';
import { downloadArtifactFile, saveBubbleSnapshotPdfArtifact } from '@/lib/artifacts';
import { BudgetIntelligenceTable, BudgetMobileIntelSummary } from '@/components/ui/budget-intelligence-table';
import { AgentHeroText } from '@/components/ui/agent-hero-text';

import type { BudgetRow } from '@/lib/budget-rows.helpers';
import { inferBudgetFocusRowId, extractInferenceQuestionText, resolveBudgetChatTargetRow } from '@/lib/budget-rows.helpers';
import { mergeBudgetActionIntoRow, type BudgetPendingConfirmation, type BudgetTableAction } from '@financial-agent/shared';
import {
  BUDGET_TABLE_STYLES,
  buildBudgetRowSummary,
  formatBudgetAssistantTurn,
  getAssistantMessage,
  getBudgetQuestionForId,
  getNextQuestion,
  normalizeActionRowId,
  sanitizeBudgetQuestion,
} from './budget-modal.helpers';
import {
  type BudgetCompletion,
  type BudgetInsights,
  type BudgetSignals,
  colorForBudgetRow,
} from './budget-modal.shared';
import {
  isBudgetAssistantOverlayMode,
  isBudgetSplitMode,
  resolveBudgetViewDataAttr,
  useBudgetModalLayout,
} from './use-budget-modal-layout';
import { BudgetCloseConfirmDialog } from './BudgetCloseConfirmDialog';
import { BudgetPendingConfirmBanner } from './BudgetPendingConfirmBanner';
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
import { buildBudgetSnapshotHtmlAndCss } from './budget-modal.snapshot';
import { useBudgetCloseConfirm } from './use-budget-close-confirm';

export function BudgetModal(props: {
  isOpen: boolean;
  onClose: () => void;
  budgetTotals: { income: number; expenses: number; balance: number };
  budgetInsights: BudgetInsights;
  budgetRows: BudgetRow[];
  budgetProductOptions: string[];
  budgetCompletion: BudgetCompletion;
  budgetSignals: BudgetSignals;
  updateBudgetRow: (id: string, field: keyof BudgetRow, value: string | number) => void;
  upsertBudgetRow: (row: BudgetRow) => void;
  applyBudgetTemplate: () => void;
  addBudgetRow: (type: 'income' | 'expense') => void;
  addBudgetSubcategory?: (parentId: string) => void;
  deleteBudgetRow: (id: string) => void;
  sendBudgetToAgent: () => void;
  chatAnswers: Array<{ q: string; a: string }>;
  onChatAnswersChange: (answers: Array<{ q: string; a: string }>) => void;
  sessionInfo?: {
    injectedIntake?: { intake?: Record<string, unknown>; intakeContext?: string } | null;
    name?: string | null;
  } | null;
  bankProducts?: Array<{
    label: string;
    bank: string;
    productType: string;
    dashboardSummary?: string;
    keyMetrics?: {
      inflows_total?: number;
      outflows_total?: number;
      net_flow?: number;
      movement_count?: number;
    };
    topCategories?: Array<{ name: string; amount: number }>;
    alerts?: string[];
  }>;
  onBudgetPdfSaved?: (payload: { title: string; fileUrl: string; createdAt: string }) => void;
}) {

  const [budgetReply, setBudgetReply] = useState('');
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [conversationDone, setConversationDone] = useState(false);
  const [budgetPendingConfirmation, setBudgetPendingConfirmation] = useState<BudgetPendingConfirmation | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [flyingDots, setFlyingDots] = useState<Array<{ id: number; type: 'income' | 'expense' }>>([]);
  const [activeBudgetRowId, setActiveBudgetRowId] = useState<string | null>(null);
  const [assistantBudgetRowId, setAssistantBudgetRowId] = useState<string | null>(null);
  const [assistantNextQuestion, setAssistantNextQuestion] = useState<string | null>(null);
  const [lastUserAnswer, setLastUserAnswer] = useState<string | null>(null);
  const [typewriterTurnKey, setTypewriterTurnKey] = useState(0);
  const {
    isDesktopLayout,
    budgetViewMode,
    setBudgetViewMode,
    cardStyle,
    budgetModeClass,
    tableViewMode,
  } = useBudgetModalLayout(props.isOpen);
  const isAssistantOverlayMode = isBudgetAssistantOverlayMode(isDesktopLayout, budgetViewMode);
  const isSplitMode = isBudgetSplitMode(isDesktopLayout, budgetViewMode);
  const isMobileShell = !isDesktopLayout;
  const isMobileManualTable = isMobileShell && budgetViewMode === tableViewMode;
  const [budgetTableStyle, setBudgetTableStyle] = useState<'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon'>('terminal');
  const [isGeneratingBudgetPdf, setIsGeneratingBudgetPdf] = useState(false);
  const budgetPdfRef = useRef<HTMLDivElement | null>(null);
  const budgetTableScrollRef = useRef<HTMLDivElement | null>(null);
  const budgetModalRef = useRef<HTMLDivElement | null>(null);
  const budgetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const flyingDotCounter = useRef(0);
  const isOpenRef = useRef(props.isOpen);
  const askingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetActionTimersRef = useRef<number[]>([]);
  const budgetDotTimersRef = useRef<number[]>([]);
  const replySubmitLockRef = useRef(false);
  const initAbortRef = useRef<AbortController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const resumeAbortRef = useRef<AbortController | null>(null);
  const budgetViewModeRef = useRef(budgetViewMode);
  const prevMobileViewModeRef = useRef(budgetViewMode);
  const budgetReplyInputRef = useRef<HTMLInputElement | null>(null);
  const isBudgetChatBusy = isAskingAI || isInitializing;
  const {
    closeConfirmKind,
    dismissCloseConfirm,
    requestClose,
    confirmClose,
    forceClose,
  } = useBudgetCloseConfirm({
    isOpen: props.isOpen,
    onClose: props.onClose,
    isBusy: isBudgetChatBusy,
    hasPendingConfirmation: Boolean(budgetPendingConfirmation),
    clearPendingConfirmation: () => setBudgetPendingConfirmation(null),
  });
  const formatBudgetAmount = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const focusBudgetField = (target: EventTarget | null) => {
    const el = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    focusMobileInput(el);
  };
  const activeQuestion = assistantNextQuestion ?? assistantQuestion ?? '…';
  const agentTypewriterText = formatBudgetAssistantTurn({
    assistant_reply: assistantQuestion ?? undefined,
    next_question: assistantNextQuestion,
  }) || activeQuestion;
  const activeStyleIndex = BUDGET_TABLE_STYLES.findIndex((style) => style.id === budgetTableStyle);
  const activeStyleLabel = BUDGET_TABLE_STYLES[Math.max(0, activeStyleIndex)]?.label ?? 'Nocturno';
  const heroToneClass =
    props.budgetSignals.balanceTone === 'surplus'
      ? 'is-positive'
      : props.budgetSignals.balanceTone === 'deficit'
        ? 'is-negative'
        : 'is-neutral';
  const templateAppliedRef = useRef(false);
  useEffect(() => {
    if (!props.isOpen) {
      templateAppliedRef.current = false;
      return;
    }
    if (props.budgetRows.length > 0 || templateAppliedRef.current) return;
    templateAppliedRef.current = true;
    props.applyBudgetTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, props.budgetRows.length]);

  const inferredBudgetRowId =
    inferBudgetFocusRowId(assistantNextQuestion ?? activeQuestion) ?? null;
  const focusedBudgetRowId = activeBudgetRowId ?? assistantBudgetRowId ?? inferredBudgetRowId;
  const tableDisplayFocusRowId = isMobileManualTable ? activeBudgetRowId : focusedBudgetRowId;
  const activeBudgetRow = props.budgetRows.find((row) => row.id === focusedBudgetRowId) ?? null;

  const orderedBudgetRows = props.budgetRows;

  function applyAssistantTurn(payload: BudgetChatApiPayload, previousQuestion: string) {
    const reply = getAssistantMessage(payload);
    setAssistantQuestion(reply || previousQuestion);
    const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
    setAssistantNextQuestion(nextQuestion || null);
    setLastUserAnswer(null);
    setTypewriterTurnKey((prev) => prev + 1);
  }

  useEffect(() => {
    if (activeBudgetRowId && !props.budgetRows.some((row) => row.id === activeBudgetRowId)) {
      setActiveBudgetRowId(null);
    }
  }, [activeBudgetRowId, props.budgetRows]);

  useEffect(() => {
    budgetViewModeRef.current = budgetViewMode;
  }, [budgetViewMode]);

  useEffect(() => {
    if (!assistantBudgetRowId || isMobileManualTable) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLSelectElement ||
      active instanceof HTMLTextAreaElement
    ) {
      if (active.closest('.budget-table')) return;
    }
    setActiveBudgetRowId(assistantBudgetRowId);
    const row = document.getElementById(`budget-row-${assistantBudgetRowId}`);
    if (!row) return;
    const wrap =
      budgetTableScrollRef.current ??
      (row.closest('.budget-table-wrap') as HTMLElement | null);
    if (wrap) {
      const wrapRect = wrap.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const nextTop = wrap.scrollTop + (rowRect.top - wrapRect.top) - wrap.clientHeight * 0.35;
      wrap.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    } else {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    row.animate(
      [
        { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,255,255,0)' },
        { transform: 'scale(1.01)', boxShadow: '0 0 0 2px rgba(255,255,255,0.55)' },
        { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,255,255,0)' },
      ],
      { duration: 650, easing: 'ease-out' },
    );
  }, [assistantBudgetRowId, isMobileManualTable]);

  function focusBudgetRow(rowId: string) {
    setActiveBudgetRowId(rowId);
    if (isMobileManualTable) return;
    setAssistantBudgetRowId(rowId);
    setAssistantNextQuestion(getBudgetQuestionForId(rowId));
  }

  function applyBudgetAction(action: Record<string, unknown> | null | undefined) {
    if (!isOpenRef.current || !action || typeof action !== 'object') return;
    const kind = String(action.kind ?? '');
    const rowId = normalizeActionRowId(action.id);
    if (!rowId) return;

    const existingRow =
      props.budgetRows.find((row) => normalizeActionRowId(row.id) === rowId) ?? null;
    const rowExists = Boolean(existingRow);

    if (kind === 'delete') {
      if (!rowExists) return;
      props.deleteBudgetRow(rowId);
      if (activeBudgetRowId === rowId) setActiveBudgetRowId(null);
      return;
    }
    if (kind !== 'add' && kind !== 'update') return;
    if (kind === 'update' && !rowExists) return;

    const tableAction: BudgetTableAction = {
      kind: kind === 'add' && rowExists ? 'update' : (kind as BudgetTableAction['kind']),
      id: rowId,
      category: typeof action.category === 'string' ? action.category : undefined,
      type: action.type === 'income' || action.type === 'expense' ? action.type : undefined,
      amount: action.amount === undefined ? undefined : Math.max(0, Math.round(Number(action.amount ?? 0))),
      cadence:
        action.cadence === 'fixed' || action.cadence === 'variable'
          ? action.cadence
          : action.cadence === 'oneoff'
            ? 'variable'
            : undefined,
      payment_method:
        action.payment_method === 'transfer' ||
        action.payment_method === 'debit' ||
        action.payment_method === 'credit' ||
        action.payment_method === 'cash' ||
        action.payment_method === 'prepaid' ||
        action.payment_method === 'other'
          ? action.payment_method
          : undefined,
      paymentMethod:
        action.paymentMethod === 'transfer' ||
        action.paymentMethod === 'debit' ||
        action.paymentMethod === 'credit' ||
        action.paymentMethod === 'cash' ||
        action.paymentMethod === 'prepaid' ||
        action.paymentMethod === 'other'
          ? action.paymentMethod
          : undefined,
      movement_type:
        typeof action.movement_type === 'string' ? (action.movement_type as BudgetTableAction['movement_type']) : undefined,
      movementType:
        typeof action.movementType === 'string' ? (action.movementType as BudgetTableAction['movementType']) : undefined,
    };

    const merged = mergeBudgetActionIntoRow(existingRow, tableAction);
    if (!merged) return;

    props.upsertBudgetRow(merged);
    const skipAssistantTableFx = !isDesktopLayout && budgetViewModeRef.current === tableViewMode;
    if (!skipAssistantTableFx) {
      budgetActionTimersRef.current.push(
        window.setTimeout(() => {
          const el = document.getElementById(`budget-row-${merged.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'center' });
            el.animate(
              [
                { boxShadow: '0 0 0 2px rgba(255,255,255,0.7)', transform: 'scale(1.012)' },
                { boxShadow: '0 0 0 0px rgba(255,255,255,0)', transform: 'scale(1)' },
              ],
              { duration: 600, easing: 'ease-out' },
            );
          }
        }, 80),
      );
      const dotId = ++flyingDotCounter.current;
      setFlyingDots((prev) => [...prev, { id: dotId, type: merged.type }]);
      budgetDotTimersRef.current.push(
        window.setTimeout(() => setFlyingDots((prev) => prev.filter((d) => d.id !== dotId)), 750),
      );
    }
  }

  function applyBudgetActions(actions: Array<Record<string, unknown>>): string | null {
    if (!isOpenRef.current || !Array.isArray(actions)) return null;
    let lastTouchedRowId: string | null = null;
    actions.forEach((a) => {
      const kind = String(a?.kind ?? '');
      if (kind === 'add' || kind === 'update') {
        const normalizedId = normalizeActionRowId(a?.id);
        if (normalizedId) lastTouchedRowId = normalizedId;
      }
      applyBudgetAction(a);
    });
    return lastTouchedRowId;
  }

  function cycleBudgetTableStyle() {
    const nextStyle = BUDGET_TABLE_STYLES[(activeStyleIndex + 1) % BUDGET_TABLE_STYLES.length];
    if (nextStyle) setBudgetTableStyle(nextStyle.id);
  }

  async function downloadBudgetPdf() {
    const element = budgetPdfRef.current;
    if (!element || isGeneratingBudgetPdf) return;

    setIsGeneratingBudgetPdf(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    try {
      const snapshot = buildBudgetSnapshotHtmlAndCss(element, activeStyleLabel);
      const result = await saveBubbleSnapshotPdfArtifact({
        title: `Presupuesto mensual · ${activeStyleLabel}`,
        subtitle: 'Tabla exportada con el diseño activo del presupuesto.',
        html: snapshot.html,
        css: snapshot.css,
      });
      const artifact = result.artifact;
      if (artifact.fileUrl) {
        await downloadArtifactFile(artifact.fileUrl, 'presupuesto-financieramente.pdf');
      }
      props.onBudgetPdfSaved?.({
        title: artifact.title || `Presupuesto mensual · ${activeStyleLabel}`,
        fileUrl: artifact.fileUrl ?? '',
        createdAt: artifact.createdAt || new Date().toISOString(),
      });
      setAiError(null);
    } catch {
      setAiError('No se pudo generar el PDF del presupuesto. Intenta nuevamente.');
    } finally {
      setIsGeneratingBudgetPdf(false);
    }
  }

  function consumeBudgetChatPayload(payload: BudgetChatApiPayload, questionForTurn: string) {
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
      lastTouchedRowId = applyBudgetActions(rawActions);
    }
    setConversationDone(Boolean(payload.done));
    applyAssistantTurn(payload, questionForTurn);
    const explicitFocus = normalizeActionRowId(payload.focus_row_id);
    const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
    setAssistantNextQuestion(nextQuestion || null);
    if (explicitFocus || lastTouchedRowId) {
      setAssistantBudgetRowId(explicitFocus ?? lastTouchedRowId ?? null);
    } else if (nextQuestion) {
      setAssistantBudgetRowId(inferBudgetFocusRowId(nextQuestion));
    }
  }

  async function handleBudgetAgentReplySubmit(forcedAnswer?: string) {
    const answer = (forcedAnswer ?? budgetReply).trim();
    if (!answer || !props.isOpen || isAskingAI || isInitializing || replySubmitLockRef.current) return;
    replySubmitLockRef.current = true;

    const manualFocusRowId = activeBudgetRowId;
    const questionForTurn =
      (manualFocusRowId ? getBudgetQuestionForId(manualFocusRowId) : null) ??
      assistantNextQuestion ??
      extractInferenceQuestionText(assistantQuestion ?? '') ??
      assistantQuestion ??
      activeQuestion;
    const newChatAnswers = [...props.chatAnswers, { q: questionForTurn, a: answer }];
    if (!forcedAnswer) setBudgetReply('');
    setAiError(null);
    setLastUserAnswer(answer);

    const chatTargetRow =
      resolveBudgetChatTargetRow(props.budgetRows, questionForTurn, {
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
          question: assistantQuestion ?? activeQuestion,
          nextQuestion: questionForTurn,
          answer,
          budgetRows: props.budgetRows.slice(0, 30),
          chatAnswers: newChatAnswers.slice(-20),
          products: props.bankProducts ?? [],
          manualFocusRowId,
          assistantFocusRowId: assistantBudgetRowId,
          activeRowId: chatTargetRow?.id ?? null,
          activeRow: chatTargetRow ? buildBudgetRowSummary(chatTargetRow) : null,
          pendingConfirmation: budgetPendingConfirmation,
          intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
          intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
        }),
      });
      const raw = await res.json();
      if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
      if (!isOpenRef.current || replySignal.aborted) return;

      const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
      if (payload) {
        props.onChatAnswersChange(newChatAnswers);
        consumeBudgetChatPayload(payload, questionForTurn);
      } else if (isOpenRef.current) {
        setAssistantQuestion('No recibí respuesta. Reformula con monto o categoría.');
        setAssistantNextQuestion(null);
      }
    } catch (error) {
      if (isBudgetChatAbortError(error)) {
        if (isOpenRef.current) {
          if (!forcedAnswer) setBudgetReply(answer);
          setAiError(BUDGET_CHAT_ABORT_MESSAGE);
        }
        return;
      }
      if (isOpenRef.current) {
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
  }

  useEffect(() => {
    isOpenRef.current = props.isOpen;
    if (!props.isOpen) {
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
      resumeAbortRef.current?.abort();
      initAbortRef.current = null;
      replyAbortRef.current = null;
      resumeAbortRef.current = null;
    }
  }, [props.isOpen]);

  useEffect(
    () => () => {
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      budgetActionTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetDotTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetActionTimersRef.current = [];
      budgetDotTimersRef.current = [];
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
      resumeAbortRef.current?.abort();
    },
    [],
  );

  // On open: reset conversation state and fetch first personalized question from AI
  useEffect(() => {
    if (!props.isOpen) return;

    const budgetRowsForInit = props.budgetRows.slice(0, 30);
    setBudgetReply('');
    setConversationDone(false);
    setAiError(null);
    setBudgetPendingConfirmation(null);
    setAssistantQuestion(null);
    setAssistantNextQuestion(null);
    setLastUserAnswer(null);
    setTypewriterTurnKey(0);
    setIsInitializing(true);
    setActiveBudgetRowId(null);
    setAssistantBudgetRowId(null);

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
            chatAnswers: props.chatAnswers.slice(-20),
            products: props.bankProducts ?? [],
            activeRowId: null,
            activeRow: null,
            intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
            intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
          }),
        });
        const raw = await res.json();
        if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
        if (!isOpenRef.current || initSignal.aborted) return;

        const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
        if (payload) {
          applyAssistantTurn(payload, getBudgetQuestionForId('income_salary'));
          const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
          setAssistantNextQuestion(nextQuestion || null);
          setAssistantBudgetRowId(payload.focus_row_id ?? inferBudgetFocusRowId(nextQuestion));
        } else {
          setAssistantQuestion(getBudgetQuestionForId('income_salary'));
          setAssistantNextQuestion(getBudgetQuestionForId('income_salary'));
          setAssistantBudgetRowId('income_salary');
        }
      } catch (err) {
        if (isBudgetChatAbortError(err) || !isOpenRef.current) return;
        setAssistantQuestion(getBudgetQuestionForId('income_salary'));
        setAssistantNextQuestion(getBudgetQuestionForId('income_salary'));
        setAssistantBudgetRowId('income_salary');
        setAiError(budgetChatErrorMessage(err));
      } finally {
        if (!initSignal.aborted && isOpenRef.current) setIsInitializing(false);
      }
    })();

    return () => {
      initController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout) return;

    const measureMobileRowSlot = () => {
      const root = budgetModalRef.current;
      const scrollHost = budgetTableScrollRef.current;
      if (!root || !scrollHost) return;
      const rows = root.querySelectorAll<HTMLElement>('.budget-table-pro tbody tr');
      if (rows.length === 0) return;

      const tableCard = scrollHost.closest<HTMLElement>('.budget-card-table');
      const stage = root.querySelector<HTMLElement>('.budget-mobile-stage');
      const modalBody = root.querySelector<HTMLElement>('.budget-modal-body');
      const tableHead = tableCard?.querySelector<HTMLElement>('.budget-table-head');
      const bottomActions =
        root.querySelector<HTMLElement>('[data-budget-mobile-footer="true"]') ??
        tableCard?.querySelector<HTMLElement>('.budget-table-bottom-actions');
      const tabs = root.querySelector<HTMLElement>('.budget-mode-tabs');
      const header = root.querySelector<HTMLElement>('.bcc-modal-header');
      const mobileSummary = tableCard?.querySelector<HTMLElement>('.budget-mobile-intel-summary');
      const tableWrap = scrollHost.querySelector<HTMLElement>('.budget-table-wrap');
      const rowButtonGap = 6;

      const intelChrome = mobileSummary?.offsetHeight ?? 0;
      const chrome = (tableHead?.offsetHeight ?? 0) + intelChrome + rowButtonGap;
      const hostHeight = stage?.clientHeight ?? scrollHost.clientHeight ?? 0;
      const scrollHostHeight = scrollHost.clientHeight;
      const slotHeight = scrollHostHeight > 96
        ? Math.max(240, scrollHostHeight - 2)
        : hostHeight > 0
          ? Math.max(240, hostHeight - chrome)
          : Math.max(240, (tableWrap?.clientHeight ?? 0) - rowButtonGap);

      if (slotHeight <= 0) return;
      scrollHost.style.setProperty('--budget-mobile-row-slot', `${slotHeight}px`);
      root.style.setProperty('--budget-mobile-row-slot', `${slotHeight}px`);
    };

    measureMobileRowSlot();
    const timer = window.setTimeout(measureMobileRowSlot, 120);
    const rafId = window.requestAnimationFrame(measureMobileRowSlot);

    const scrollHost = budgetTableScrollRef.current;
    const tableCard = scrollHost?.closest<HTMLElement>('.budget-card-table') ?? null;
    const stage = budgetModalRef.current?.querySelector<HTMLElement>('.budget-mobile-stage') ?? null;
    const layoutObserver =
      scrollHost && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measureMobileRowSlot)
        : null;
    if (layoutObserver && scrollHost) {
      layoutObserver.observe(scrollHost);
      if (tableCard) layoutObserver.observe(tableCard);
      if (stage) layoutObserver.observe(stage);
      const footer = budgetModalRef.current?.querySelector<HTMLElement>('[data-budget-mobile-footer="true"]');
      if (footer) layoutObserver.observe(footer);
      const modalRoot = budgetModalRef.current;
      if (modalRoot) layoutObserver.observe(modalRoot);
    }

    window.addEventListener('resize', measureMobileRowSlot);
    window.addEventListener('orientationchange', measureMobileRowSlot);
    if (document.fonts?.ready) {
      void document.fonts.ready.then(measureMobileRowSlot);
    }

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(rafId);
      layoutObserver?.disconnect();
      window.removeEventListener('resize', measureMobileRowSlot);
      window.removeEventListener('orientationchange', measureMobileRowSlot);
    };
  }, [props.isOpen, isDesktopLayout, budgetViewMode, props.budgetRows.length, budgetTableStyle, focusedBudgetRowId]);

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout || isMobileManualTable || !focusedBudgetRowId) return;
    const row = budgetModalRef.current?.querySelector<HTMLElement>(`#budget-row-${focusedBudgetRowId}`);
    const wrap = budgetTableScrollRef.current?.querySelector<HTMLElement>('.budget-table-wrap');
    if (!row || !wrap) return;
    const top = row.offsetTop;
    const useAutoTableScroll =
      isAssistantOverlayMode ||
      (isDesktopLayout && budgetViewMode === 2) ||
      (!isDesktopLayout && budgetViewMode === 1);
    wrap.scrollTo({ top, behavior: useAutoTableScroll ? 'auto' : 'smooth' });
  }, [isAssistantOverlayMode, isMobileManualTable, props.isOpen, isDesktopLayout, budgetViewMode, focusedBudgetRowId, props.budgetRows.length]);

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout) {
      prevMobileViewModeRef.current = budgetViewMode;
      return;
    }

    const previousMode = prevMobileViewModeRef.current;
    prevMobileViewModeRef.current = budgetViewMode;

    if (budgetViewMode === tableViewMode) {
      setActiveBudgetRowId(null);
      return;
    }

    if (previousMode === tableViewMode && budgetViewMode === 1) {
      resumeAbortRef.current?.abort();
      const resumeController = new AbortController();
      resumeAbortRef.current = resumeController;
      const resumeSignal = resumeController.signal;

      void (async () => {
        setIsInitializing(true);
        setAiError(null);
        try {
          const csrfToken = getCsrfToken();
          const res = await fetch('/api/budget-chat', {
            method: 'POST',
            signal: resumeSignal,
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({
              intent: 'init',
              budgetRows: props.budgetRows.slice(0, 30),
              chatAnswers: props.chatAnswers.slice(-20),
              products: props.bankProducts ?? [],
              activeRowId: null,
              activeRow: null,
              intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
              intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
            }),
          });
          const raw = await res.json();
          if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
          if (!isOpenRef.current || resumeSignal.aborted) return;

          const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
          if (payload) {
            applyAssistantTurn(payload, assistantQuestion ?? getBudgetQuestionForId('income_salary'));
            const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
            setAssistantNextQuestion(nextQuestion || null);
            const focusId = payload.focus_row_id ?? inferBudgetFocusRowId(nextQuestion);
            setAssistantBudgetRowId(focusId);
            setActiveBudgetRowId(focusId);
          }
        } catch (err) {
          if (isBudgetChatAbortError(err) || !isOpenRef.current) return;
          setAiError(budgetChatErrorMessage(err));
        } finally {
          if (!resumeSignal.aborted && isOpenRef.current) setIsInitializing(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetViewMode, props.isOpen, isDesktopLayout, tableViewMode, props.budgetRows.length]);

  const maxExpense = Math.max(
    1,
    ...props.budgetRows.filter((r) => r.type === 'expense').map((r) => r.amount),
  );
  const maxIncome = Math.max(
    1,
    ...props.budgetRows.filter((r) => r.type === 'income').map((r) => r.amount),
  );

  function rowStyle(row: BudgetRow): React.CSSProperties {
    const t = Math.max(0, Math.min(1, row.amount / (row.type === 'expense' ? maxExpense : maxIncome)));
    const alpha = row.type === 'expense' ? 0.16 + t * 0.60 : 0.14 + t * 0.56;
    const bg =
      row.type === 'expense'
        ? `rgba(118, 26, 36, ${alpha.toFixed(2)})`
        : `rgba(62, 84, 22, ${alpha.toFixed(2)})`;
    return { '--row-bg': bg } as React.CSSProperties;
  }

  const { isOpen } = props;

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileShell && event.target === event.currentTarget) {
      requestClose();
    }
  };

  const handleSendBudgetToAgent = () => {
    props.sendBudgetToAgent();
    forceClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    budgetRestoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getBudgetFocusable = () => {
      const root = budgetModalRef.current;
      if (!root) return [] as HTMLElement[];
      const sel = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
        (n) => !n.hasAttribute('aria-hidden'),
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      budgetModalRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (closeConfirmKind) dismissCloseConfirm();
        else requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getBudgetFocusable();
      if (focusables.length === 0) {
        event.preventDefault();
        budgetModalRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && budgetModalRef.current?.contains(active));
      if (!inside) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); return; }
      if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      const el = budgetRestoreFocusRef.current;
      if (el && document.contains(el)) window.requestAnimationFrame(() => el.focus());
    };
  }, [closeConfirmKind, dismissCloseConfirm, isOpen, requestClose]);

  const budgetTableBottomActions = (
    <div
      className={`budget-table-bottom-actions${isMobileShell ? ' budget-mobile-bottom-actions' : ''}`}
      data-budget-mobile-footer={isMobileShell ? 'true' : undefined}
    >
      <button type="button" className="budget-style-button" onClick={cycleBudgetTableStyle}>
        Estilos · {activeStyleLabel}
      </button>
      <button
        type="button"
        className="budget-pdf-button"
        onClick={() => void downloadBudgetPdf()}
        disabled={isGeneratingBudgetPdf || props.budgetRows.length === 0}
      >
        {isGeneratingBudgetPdf ? 'Preparando PDF…' : 'Guardar como PDF'}
      </button>
      {isSplitMode ? (
        <button
          type="button"
          className="budget-chat-sync-button"
          onClick={handleSendBudgetToAgent}
          disabled={props.budgetRows.length === 0}
        >
          Informe en chat
        </button>
      ) : null}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className="agent-modal-overlay budget-modal-overlay"
      onPointerDown={handleOverlayPointerDown}
    >
      <div
        className={`agent-modal budget-modal${isMobileShell ? ' is-mobile-shell' : ''}`}
        data-budget-mobile={isMobileShell ? 'true' : undefined}
        data-budget-view={resolveBudgetViewDataAttr(isDesktopLayout, budgetViewMode)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-modal-title"
        tabIndex={-1}
        ref={budgetModalRef}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="budget-modal-title" className="bcc-modal-title">Presupuesto</h3>
          </div>
          <button
            type="button"
            className="agent-modal-close"
            onClick={requestClose}
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Flying dot animations */}
        {flyingDots.map((dot) => (
          <div
            key={dot.id}
            className={`budget-dot-fly budget-dot-fly-${dot.type}`}
          />
        ))}

        <div className={`budget-modal-body${isDesktopLayout ? ' is-desktop' : ''}`}>
          {!isMobileShell && (
          <section
            className={`budget-cockpit-banner ${heroToneClass}`}
          >
            <div className="budget-cockpit-copy">
              <span className="budget-section-eyebrow">Cockpit financiero</span>
              <h4>{props.budgetSignals.balanceLabel}</h4>
              <p>{props.budgetSignals.balanceHint}</p>
              <strong>{props.budgetSignals.nextAction}</strong>
            </div>
            <div className="budget-cockpit-metrics">
              <div className="budget-cockpit-metric">
                <span>Preparación</span>
                <strong>{props.budgetSignals.readinessScore}/100</strong>
              </div>
              <div className="budget-cockpit-metric">
                <span>Cobertura base</span>
                <strong>{props.budgetSignals.coreFilledCount}/{props.budgetSignals.coreTotal}</strong>
              </div>
              <div className="budget-cockpit-metric">
                <span>Completitud</span>
                <strong>{props.budgetCompletion.fillRate}%</strong>
              </div>
              <div className="budget-cockpit-metric">
                <span>Rubros al alza</span>
                <strong>{props.budgetSignals.risingExpenseCount}</strong>
              </div>
              <div className="budget-cockpit-metric">
                <span>Optimizable</span>
                <strong>{formatBudgetAmount(props.budgetSignals.optimizePotential)}</strong>
              </div>
            </div>
          </section>
          )}

          <div className="budget-mode-tabs" role="tablist" aria-label="Modo de presupuesto">
            <button
              type="button"
              role="tab"
              aria-selected={budgetViewMode === 1}
              className={`budget-mode-tab${budgetViewMode === 1 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(1)}
            >
              Asistente
            </button>
            {isDesktopLayout ? (
              <button
                type="button"
                role="tab"
                aria-selected={budgetViewMode === 2}
                className={`budget-mode-tab${budgetViewMode === 2 ? ' is-active' : ''}`}
                onClick={() => setBudgetViewMode(2)}
              >
                Asistente + Tabla
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={budgetViewMode === tableViewMode}
              className={`budget-mode-tab${budgetViewMode === tableViewMode ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(tableViewMode)}
            >
              Tabla
            </button>
          </div>

          <div
            className={`budget-executive-grid budget-main-carousel mode-${budgetModeClass}${isDesktopLayout ? ' is-desktop' : ' is-mobile-budget'}`}
          >
            <div className={isMobileShell ? 'budget-mobile-stage' : 'budget-desktop-stage'}>
            <section
              data-main-card="table"
              className={`budget-table-section budget-card-table${isDesktopLayout ? '' : ' is-mobile-table-compact'}${isMobileManualTable ? ' is-mobile-manual-table' : ''}`}
              style={cardStyle('table')}
            >
              <div className="budget-table-head">
                {isDesktopLayout && (
                  <div>
                    <span className="budget-section-eyebrow">Tabla</span>
                    <h4>Presupuesto mensual</h4>
                    <p className="budget-table-help">
                      Completa Movimiento, Tipo, Monto, Recurrencia, Medio de pago y Tipo de movimiento. Impacto se calcula automático por fila.
                    </p>
                  </div>
                )}
                <div className="budget-table-top-actions">
                  <button type="button" className="continue-ghost is-income-action" onClick={() => props.addBudgetRow('income')}>Ingreso</button>
                  <button type="button" className="continue-ghost is-expense-action" onClick={() => props.addBudgetRow('expense')}>Gasto</button>
                </div>
              </div>

              {!isDesktopLayout ? (
                <BudgetMobileIntelSummary
                  budgetTotals={props.budgetTotals}
                  activeStyleLabel={activeStyleLabel}
                  formatBudgetAmount={formatBudgetAmount}
                />
              ) : null}

              <div
                ref={budgetTableScrollRef}
                className={isDesktopLayout ? 'budget-table-scroll-host budget-table-scroll-host--desktop' : 'budget-table-scroll-host'}
              >
              {props.budgetRows.length > 0 ? (
                <BudgetIntelligenceTable
                  orderedBudgetRows={orderedBudgetRows}
                  budgetRows={props.budgetRows}
                  focusedBudgetRowId={tableDisplayFocusRowId}
                  budgetTotals={props.budgetTotals}
                  activeStyleLabel={activeStyleLabel}
                  budgetTableStyle={budgetTableStyle}
                  budgetPdfRef={budgetPdfRef}
                  formatBudgetAmount={formatBudgetAmount}
                  rowStyle={rowStyle}
                  colorForBudgetRow={colorForBudgetRow}
                  focusBudgetRow={focusBudgetRow}
                  focusBudgetField={focusBudgetField}
                  updateBudgetRow={props.updateBudgetRow}
                  deleteBudgetRow={props.deleteBudgetRow}
                  compactMobile={!isDesktopLayout}
                  suppressInlineSummary={!isDesktopLayout}
                />
              ) : (
                <div className="budget-empty-state">
                  <strong>No hay filas todavía.</strong>
                  <p>Cargando estructura base de presupuesto…</p>
                </div>
              )}
              </div>
              {isDesktopLayout ? budgetTableBottomActions : null}
            </section>

            {isAssistantOverlayMode ? (
              <div className="budget-assistant-blur-veil" aria-hidden="true" />
            ) : null}

            <section
              data-main-card="agent"
              className={`budget-assistant-panel budget-card-agent${!isDesktopLayout && budgetViewMode !== tableViewMode ? ' is-mobile-assistant-glass' : ''}`}
              style={cardStyle('agent')}
            >
              <div className="bcc-hero">
                <div className="bcc-hero-top" aria-live="polite" aria-relevant="additions text">
                  {lastUserAnswer ? (
                    <p className="bcc-hero-reply">{lastUserAnswer}</p>
                  ) : null}
                  {isAskingAI || isInitializing ? (
                    <span className="bcc-hero-thinking" aria-hidden="true">
                      <span className="bcc-dot-pulse" />
                      <span className="bcc-dot-pulse" />
                      <span className="bcc-dot-pulse" />
                    </span>
                  ) : null}
                  {isInitializing ? (
                    <p className="bcc-hero-question">Preparando asistente…</p>
                  ) : isAskingAI ? (
                    <p className="bcc-hero-question bcc-hero-question--pending">
                      {lastUserAnswer ? 'Analizando lo que dijiste…' : 'Un momento…'}
                    </p>
                  ) : (
                    <AgentHeroText
                      turnKey={typewriterTurnKey}
                      text={agentTypewriterText}
                      speed={isDesktopLayout ? 28 : 34}
                      focusRow={activeBudgetRow}
                      budgetRows={props.budgetRows}
                      question={assistantNextQuestion ?? assistantQuestion}
                    />
                  )}
                  <span className="sr-only">{agentTypewriterText}</span>
                </div>
                {conversationDone && (
                  <p className="bcc-hero-done">Presupuesto completo. Puedes seguir ajustando la tabla.</p>
                )}

                <div className="bcc-hero-input-wrap">
                  <input
                    ref={budgetReplyInputRef}
                    className="bcc-hero-input"
                    value={budgetReply}
                    onChange={(e) => setBudgetReply(e.target.value)}
                    placeholder="Escribe tu respuesta…"
                    onMouseDownCapture={(e) => focusBudgetField(e.currentTarget)}
                    onPointerDownCapture={(e) => focusBudgetField(e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleBudgetAgentReplySubmit();
                    }}
                  />
                  <button
                    type="button"
                    className="bcc-hero-send"
                    onClick={() => void handleBudgetAgentReplySubmit()}
                    disabled={isInitializing || isAskingAI || !budgetReply.trim()}
                    aria-label="Enviar mensaje"
                    title="Enviar mensaje"
                  >
                    <svg className="bcc-hero-send-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 8h10M9 4l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {budgetPendingConfirmation ? (
                  <BudgetPendingConfirmBanner
                    summary={budgetPendingConfirmation.summary}
                    disabled={isAskingAI || isInitializing}
                    onConfirm={() => void handleBudgetAgentReplySubmit('sí')}
                    onReject={() => void handleBudgetAgentReplySubmit('no')}
                  />
                ) : null}

                {aiError ? <p className="bcc-hero-error">{aiError}</p> : null}

                {isSplitMode ? (
                  <button
                    type="button"
                    className="budget-chat-sync-button is-assistant-action"
                    onClick={handleSendBudgetToAgent}
                    disabled={props.budgetRows.length === 0}
                  >
                    Generar informe en chat
                  </button>
                ) : null}
              </div>
            </section>
            </div>

            {isMobileShell ? budgetTableBottomActions : null}
          </div>
        </div>{/* /budget-modal-body */}

        {closeConfirmKind ? (
          <BudgetCloseConfirmDialog
            kind={closeConfirmKind}
            onDismiss={dismissCloseConfirm}
            onConfirm={confirmClose}
          />
        ) : null}
      </div>
    </div>
  );
}
