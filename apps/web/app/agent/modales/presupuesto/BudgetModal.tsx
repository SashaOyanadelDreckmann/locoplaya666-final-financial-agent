'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type LegacyRef, type ReactNode, type RefObject } from 'react';
import {
  applyMobileViewportTokens,
  focusMobileInput,
  isBudgetModalElement,
  isMobileBrowserViewport,
  setMobileInputEngaged,
} from '@/lib/interfaz/mobile-viewport-sync';
import { downloadArtifactFile, saveBubbleSnapshotPdfArtifact } from '@/lib/compartido/artifacts';
import { FINCOIN_SPEND_BLOCKED_MESSAGE } from '@/lib/compartido/fincoin-gate';
import { BudgetIntelligenceTable, BudgetMobileIntelSummary } from '@/components/ui/budget-intelligence-table';
import { AgentHeroText } from '@/components/ui/agent-hero-text';

import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import { inferBudgetFocusRowId } from '@/lib/presupuesto/filas.helpers';
import {
  mergeBudgetActionIntoRow,
  validateBudgetTableActions,
  type BudgetTableAction,
  type BudgetProductSnapshot,
} from '@financial-agent/shared';
import {
  BUDGET_TABLE_STYLES,
  DEFAULT_BUDGET_TABLE_STYLE,
  type BudgetTableStyleId,
  normalizeActionRowId,
} from './budget-modal.helpers';
import {
  type BudgetCompletion,
  type BudgetSignals,
  colorForBudgetRow,
} from './budget-modal.shared';
import {
  isBudgetAssistantOverlayMode,
  isBudgetSplitMode,
  resolveBudgetViewDataAttr,
  useBudgetModalLayout,
} from './use-budget-modal-layout';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import { BudgetCloseConfirmDialog } from '../comunes/BudgetCloseConfirmDialog';
import { BudgetPendingConfirmBanner } from './BudgetPendingConfirmBanner';
import { buildBudgetSnapshotHtmlAndCss } from './budget-modal.snapshot';
import { useBudgetCloseConfirm } from '../presupuesto/use-budget-close-confirm';
import { BudgetViewNav } from './BudgetViewNav';
import { useBudgetMobileRowGestures } from './use-budget-mobile-row-gestures';
import { useBudgetViewSwipe } from './use-budget-view-swipe';
import { resolveBudgetAssistantHeroToneClass } from './budget-modal.assistant-tone';
import {
  buildBudgetAssistantContextInput,
  resolveBudgetQuestionForRow,
  useBudgetChat,
} from './use-budget-chat';

function BudgetCarouselStage({
  mobile,
  stageRef,
  children,
}: {
  mobile: boolean;
  stageRef?: LegacyRef<HTMLDivElement>;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <div className="budget-mobile-stage" ref={stageRef}>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

export function BudgetModal(props: {
  isOpen: boolean;
  fincoinSpendBlocked?: boolean;
  onClose: () => void;
  budgetTotals: { income: number; expenses: number; balance: number };
  budgetRows: BudgetRow[];
  budgetCompletion: BudgetCompletion;
  budgetSignals: BudgetSignals;
  updateBudgetRow: (id: string, field: keyof BudgetRow, value: string | number) => void;
  applyBudgetTableActions: (actions: BudgetTableAction[]) => void;
  applyBudgetTemplate: (products?: BudgetProductSnapshot[]) => void;
  addBudgetRow: (type: 'income' | 'expense') => void;
  deleteBudgetRow: (id: string) => void;
  sendBudgetToAgent: () => void;
  chatAnswers: Array<{ q: string; a: string }>;
  onChatAnswersChange: (answers: Array<{ q: string; a: string }>) => void;
  bankProducts?: BudgetProductSnapshot[];
  onBudgetPdfSaved?: (payload: {
    title: string;
    fileUrl: string;
    previewImageUrl?: string;
    createdAt: string;
    sourceRect?: DOMRect | null;
  }) => void;
  budgetPendingConfirmation?: import('@financial-agent/shared').BudgetPendingConfirmation | null;
  onBudgetPendingConfirmationChange?: (
    pending: import('@financial-agent/shared').BudgetPendingConfirmation | null,
  ) => void;
}) {

  const [flyingDots, setFlyingDots] = useState<Array<{ id: number; type: 'income' | 'expense' }>>([]);
  const [activeBudgetRowId, setActiveBudgetRowId] = useState<string | null>(null);
  const [assistantBudgetRowId, setAssistantBudgetRowId] = useState<string | null>(null);
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
  const isTableOnlyDesktop = isDesktopLayout && budgetViewMode === tableViewMode;
  const showAssistantInformeAction =
    isAssistantOverlayMode ||
    (!isDesktopLayout && budgetViewMode !== tableViewMode);
  const isMobileShell = !isDesktopLayout;
  const isMobileAssistantOverlay = isMobileShell && budgetViewMode === 1;
  const isMobileManualTable = isMobileShell && budgetViewMode === tableViewMode;
  const [budgetTableStyle, setBudgetTableStyle] = useState<BudgetTableStyleId>(DEFAULT_BUDGET_TABLE_STYLE);
  const [isGeneratingBudgetPdf, setIsGeneratingBudgetPdf] = useState(false);
  const budgetPdfRef = useRef<HTMLDivElement | null>(null);
  const budgetTableScrollRef = useRef<HTMLDivElement | null>(null);
  const budgetModalRef = useRef<HTMLDivElement | null>(null);
  const budgetMobileStageRef = useRef<HTMLDivElement | null>(null);
  const budgetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const flyingDotCounter = useRef(0);
  const isOpenRef = useRef(props.isOpen);
  const budgetActionTimersRef = useRef<number[]>([]);
  const budgetDotTimersRef = useRef<number[]>([]);
  const budgetViewModeRef = useRef(budgetViewMode);
  const prevMobileViewModeRef = useRef(budgetViewMode);
  const budgetReplyInputRef = useRef<HTMLInputElement | null>(null);
  const mobileTableSnapSuppressedRef = useRef(false);
  const templateAppliedRef = useRef(false);

  function isBudgetInteractiveFieldFocused(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    return Boolean(
      active.closest(
        '.budget-table input, .budget-table select, .budget-table textarea, .budget-table .budget-pill-button, .bcc-hero-input',
      ),
    );
  }

  const budgetAssistantContextInput = useMemo(
    () => buildBudgetAssistantContextInput(props.budgetRows, props.chatAnswers),
    [props.budgetRows, props.chatAnswers],
  );

  const resolveLocalBudgetQuestion = useCallback(
    (rowId: string | null) => {
      const row = rowId ? props.budgetRows.find((item) => item.id === rowId) ?? null : null;
      return resolveBudgetQuestionForRow(row, budgetAssistantContextInput, rowId);
    },
    [budgetAssistantContextInput, props.budgetRows],
  );

  const applyBudgetActions = useCallback(
    (actions: Array<Record<string, unknown>>): string | null => {
      if (!isOpenRef.current || !Array.isArray(actions) || actions.length === 0) return null;

      const tableActions = validateBudgetTableActions(
        actions as BudgetTableAction[],
        props.budgetRows,
      );
      if (tableActions.length === 0) return null;

      let lastMergedRow: BudgetRow | null = null;
      for (const parsed of tableActions) {
        if (parsed.kind === 'delete') {
          if (activeBudgetRowId === parsed.id) setActiveBudgetRowId(null);
          continue;
        }
        const existingRow =
          props.budgetRows.find((row) => normalizeActionRowId(row.id) === normalizeActionRowId(parsed.id)) ??
          null;
        const merged = mergeBudgetActionIntoRow(existingRow, parsed);
        if (merged) lastMergedRow = merged;
      }

      props.applyBudgetTableActions(tableActions);

      const lastAction = tableActions[tableActions.length - 1];
      const lastTouchedRowId = lastMergedRow?.id ?? normalizeActionRowId(lastAction?.id) ?? null;
      const skipAssistantTableFx =
        isBudgetInteractiveFieldFocused() ||
        (!isDesktopLayout && budgetViewModeRef.current === tableViewMode);
      if (lastMergedRow && !skipAssistantTableFx) {
        budgetActionTimersRef.current.push(
          window.setTimeout(() => {
            const el = document.getElementById(`budget-row-${lastMergedRow!.id}`);
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
        setFlyingDots((prev) => [...prev, { id: dotId, type: lastMergedRow!.type }]);
        budgetDotTimersRef.current.push(
          window.setTimeout(() => setFlyingDots((prev) => prev.filter((d) => d.id !== dotId)), 750),
        );
      }
      return lastTouchedRowId;
    },
    [activeBudgetRowId, isDesktopLayout, props, tableViewMode],
  );

  const resetBudgetChatFocus = useCallback(() => {
    setActiveBudgetRowId(null);
    setAssistantBudgetRowId(null);
  }, []);

  const {
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
  } = useBudgetChat({
    isOpen: props.isOpen,
    fincoinSpendBlocked: props.fincoinSpendBlocked,
    budgetRows: props.budgetRows,
    chatAnswers: props.chatAnswers,
    onChatAnswersChange: props.onChatAnswersChange,
    bankProducts: props.bankProducts,
    activeBudgetRowId,
    assistantBudgetRowId,
    setAssistantBudgetRowId,
    resolveLocalBudgetQuestion,
    onApplyTableActions: applyBudgetActions,
    onInitFocusReset: resetBudgetChatFocus,
    pendingConfirmation: props.budgetPendingConfirmation,
    onPendingConfirmationChange: props.onBudgetPendingConfirmationChange,
  });

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

  useBudgetMobileRowGestures({
    enabled: props.isOpen && isMobileManualTable,
    scrollHostRef: budgetTableScrollRef,
    suppressRef: mobileTableSnapSuppressedRef,
    onActiveRowChange: setActiveBudgetRowId,
  });

  useBudgetViewSwipe({
    enabled: props.isOpen && isMobileShell,
    stageRef: budgetMobileStageRef,
    budgetViewMode,
    isDesktopLayout,
    onViewModeChange: setBudgetViewMode,
  });

  const formatBudgetAmount = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const focusBudgetField = (target: EventTarget | null) => {
    const el = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el || typeof el.focus !== 'function') return;
    focusMobileInput(el);
  };
  const activeStyleIndex = BUDGET_TABLE_STYLES.findIndex((style) => style.id === budgetTableStyle);
  const activeStyleLabel = BUDGET_TABLE_STYLES[Math.max(0, activeStyleIndex)]?.label ?? 'Carbono';
  const heroToneClass =
    props.budgetSignals.balanceTone === 'surplus'
      ? 'is-positive'
      : props.budgetSignals.balanceTone === 'deficit'
        ? 'is-negative'
        : 'is-neutral';

  useEffect(() => {
    isOpenRef.current = props.isOpen;
  }, [props.isOpen]);

  useEffect(() => {
    if (props.isOpen) return;
    if (isBudgetModalElement(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
      setMobileInputEngaged(false);
      applyMobileViewportTokens();
    }
    templateAppliedRef.current = false;
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen) {
      return;
    }
    if (props.budgetRows.length > 0 || templateAppliedRef.current) return;
    templateAppliedRef.current = true;
    props.applyBudgetTemplate(props.bankProducts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, props.budgetRows.length, props.bankProducts]);

  useEffect(
    () => () => {
      budgetActionTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetDotTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetActionTimersRef.current = [];
      budgetDotTimersRef.current = [];
    },
    [],
  );

  const inferredBudgetRowId =
    inferBudgetFocusRowId(assistantNextQuestion ?? activeQuestion) ?? null;
  const focusedBudgetRowId = activeBudgetRowId ?? assistantBudgetRowId ?? inferredBudgetRowId;
  const tableDisplayFocusRowId = isMobileManualTable ? activeBudgetRowId : focusedBudgetRowId;
  const activeBudgetRow = props.budgetRows.find((row) => row.id === focusedBudgetRowId) ?? null;
  const assistantHeroContextText = [
    agentTypewriterText,
    assistantNextQuestion,
    lastUserAnswer,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
  const mobileAssistantHeroToneClass = resolveBudgetAssistantHeroToneClass(
    activeBudgetRow?.type,
    assistantHeroContextText,
  );

  const orderedBudgetRows = props.budgetRows;

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
    if (isBudgetInteractiveFieldFocused()) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLSelectElement ||
      active instanceof HTMLTextAreaElement
    ) {
      if (active.closest('.budget-table, .bcc-hero-compose')) return;
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
    setAssistantNextQuestion(resolveLocalBudgetQuestion(rowId));
  }

  function cycleBudgetTableStyle() {
    const nextStyle = BUDGET_TABLE_STYLES[(activeStyleIndex + 1) % BUDGET_TABLE_STYLES.length];
    if (nextStyle) setBudgetTableStyle(nextStyle.id);
  }

  async function downloadBudgetPdf(trigger?: HTMLElement | null) {
    const element = budgetPdfRef.current;
    if (!element) {
      setAiError('No se encontró la tabla del presupuesto para exportar. Cambia a la vista Tabla e intenta de nuevo.');
      return;
    }
    if (isGeneratingBudgetPdf) return;

    const sourceRect = trigger?.getBoundingClientRect() ?? null;
    setIsGeneratingBudgetPdf(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    try {
      const snapshot = buildBudgetSnapshotHtmlAndCss(
        element,
        activeStyleLabel,
        budgetTableStyle,
        props.budgetTotals,
        formatBudgetAmount,
      );
      const result = await saveBubbleSnapshotPdfArtifact({
        title: `Presupuesto mensual · ${activeStyleLabel}`,
        subtitle: 'Tabla exportada con el diseño activo del presupuesto.',
        html: snapshot.html,
        css: snapshot.css,
        pageLayout: 'content',
      });
      const artifact = result.artifact;
      if (artifact.fileUrl) {
        await downloadArtifactFile(artifact.fileUrl, 'presupuesto-financieramente.pdf');
      }
      props.onBudgetPdfSaved?.({
        title: artifact.title || `Presupuesto mensual · ${activeStyleLabel}`,
        fileUrl: artifact.fileUrl ?? '',
        previewImageUrl: artifact.previewImageUrl,
        createdAt: artifact.createdAt || new Date().toISOString(),
        sourceRect,
      });
      setAiError(null);
    } catch (error) {
      const detail =
        error instanceof Error && error.message ? error.message : 'Error desconocido';
      setAiError(`No se pudo generar el PDF del presupuesto. ${detail}`);
    } finally {
      setIsGeneratingBudgetPdf(false);
    }
  }

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout) return;

    const measureMobileRowSlot = () => {
      if (isBudgetInteractiveFieldFocused()) return;
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
      const tabs = root.querySelector<HTMLElement>('.budget-view-nav');
      const mobileSummary = tableCard?.querySelector<HTMLElement>('.budget-mobile-intel-summary');
      const tableWrap = scrollHost.querySelector<HTMLElement>('.budget-table-wrap');
      const rowButtonGap = 4;

      const intelChrome = mobileSummary?.offsetHeight ?? 0;
      const tableChrome = (tableHead?.offsetHeight ?? 0) + intelChrome + rowButtonGap;
      const carousel = root.querySelector<HTMLElement>('.budget-main-carousel');
      const footerHeight = bottomActions?.offsetHeight ?? 0;
      const footerInsideTable = Boolean(bottomActions?.closest('.budget-card-table'));
      const footerGap = 12;
      const footerChrome = footerInsideTable ? footerHeight + footerGap : 0;
      const tableChromeWithFooter = tableChrome + footerChrome;
      const browserLayoutTrim = isMobileBrowserViewport() ? 16 : 0;
      const stageHeight = stage?.clientHeight ?? 0;
      const carouselHeight = carousel?.clientHeight ?? 0;
      const stageScrollBudget = stageHeight > 0
        ? stageHeight - tableChromeWithFooter - browserLayoutTrim
        : carouselHeight > 0
          ? carouselHeight - (footerInsideTable ? 0 : footerHeight) - tableChromeWithFooter - browserLayoutTrim
          : 0;
      const scrollAreaHeight = Math.max(200, stageScrollBudget);
      const slotHeight = Math.max(240, scrollAreaHeight - 2);

      if (slotHeight <= 0) return;
      scrollHost.style.setProperty('--budget-mobile-scroll-host-height', `${scrollAreaHeight}px`);
      scrollHost.style.removeProperty('min-height');
      scrollHost.style.setProperty('--budget-mobile-row-slot', `${slotHeight}px`);
      root.style.setProperty('--budget-mobile-row-slot', `${slotHeight}px`);
    };

    measureMobileRowSlot();
    const timer = window.setTimeout(measureMobileRowSlot, 120);
    const timerLate = window.setTimeout(measureMobileRowSlot, 320);
    const rafId = window.requestAnimationFrame(measureMobileRowSlot);

    const scrollHost = budgetTableScrollRef.current;
    const tableCard = scrollHost?.closest<HTMLElement>('.budget-card-table') ?? null;
    const stage = budgetModalRef.current?.querySelector<HTMLElement>('.budget-mobile-stage') ?? null;
    const carousel = budgetModalRef.current?.querySelector<HTMLElement>('.budget-main-carousel') ?? null;
    const modeTabs = budgetModalRef.current?.querySelector<HTMLElement>('.budget-view-nav') ?? null;
    const layoutObserver =
      scrollHost && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measureMobileRowSlot)
        : null;
    if (layoutObserver && scrollHost) {
      layoutObserver.observe(scrollHost);
      if (tableCard) layoutObserver.observe(tableCard);
      if (stage) layoutObserver.observe(stage);
      if (carousel) layoutObserver.observe(carousel);
      if (modeTabs) layoutObserver.observe(modeTabs);
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
      window.clearTimeout(timerLate);
      window.cancelAnimationFrame(rafId);
      layoutObserver?.disconnect();
      window.removeEventListener('resize', measureMobileRowSlot);
      window.removeEventListener('orientationchange', measureMobileRowSlot);
    };
  }, [props.isOpen, isDesktopLayout, budgetViewMode, props.budgetRows.length, budgetTableStyle]);

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout || isMobileManualTable || !focusedBudgetRowId) return;
    if (isBudgetInteractiveFieldFocused()) return;
    const row = budgetModalRef.current?.querySelector<HTMLElement>(`#budget-row-${focusedBudgetRowId}`);
    const wrap = budgetTableScrollRef.current?.querySelector<HTMLElement>('.budget-table-wrap');
    if (!row || !wrap) return;
    const top = row.offsetTop;
    const useAutoTableScroll =
      isAssistantOverlayMode ||
      (isDesktopLayout && budgetViewMode === 2) ||
      (!isDesktopLayout && budgetViewMode === 1);
    mobileTableSnapSuppressedRef.current = true;
    wrap.scrollTo({ top, behavior: useAutoTableScroll ? 'auto' : 'smooth' });
    window.setTimeout(() => {
      mobileTableSnapSuppressedRef.current = false;
    }, 420);
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
      if (props.fincoinSpendBlocked) {
        setAiError(FINCOIN_SPEND_BLOCKED_MESSAGE);
        return;
      }
      const focusId = assistantBudgetRowId ?? activeBudgetRowId ?? inferBudgetFocusRowId(assistantNextQuestion ?? '');
      if (focusId) {
        setActiveBudgetRowId(focusId);
        setAssistantBudgetRowId(focusId);
        const localQuestion = resolveLocalBudgetQuestion(focusId);
        setAssistantNextQuestion(localQuestion);
      }
    }
  }, [budgetViewMode, props.isOpen, isDesktopLayout, tableViewMode, props.fincoinSpendBlocked]);

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
        onClick={(event) => void downloadBudgetPdf(event.currentTarget)}
        disabled={isGeneratingBudgetPdf || props.budgetRows.length === 0}
      >
        {isGeneratingBudgetPdf ? 'Preparando PDF…' : 'Guardar como PDF'}
      </button>
    </div>
  );

  const budgetSplitDesktopToolbar = isSplitMode ? (
    <div className="budget-split-agent-toolbar" data-budget-split-toolbar="true">
      <div className="budget-split-toolbar-leading">
        <button type="button" className="budget-split-toolbar-btn" onClick={cycleBudgetTableStyle}>
          Estilos · {activeStyleLabel}
        </button>
        <button
          type="button"
          className="budget-split-toolbar-btn"
          onClick={(event) => void downloadBudgetPdf(event.currentTarget)}
          disabled={isGeneratingBudgetPdf || props.budgetRows.length === 0}
        >
          {isGeneratingBudgetPdf ? 'Preparando PDF…' : 'Guardar como PDF'}
        </button>
        <button
          type="button"
          className="budget-split-toolbar-btn"
          onClick={handleSendBudgetToAgent}
          disabled={props.budgetRows.length === 0}
        >
          Informe en chat
        </button>
      </div>
      <div className="budget-split-toolbar-trailing">
        <button type="button" className="budget-split-toolbar-btn is-income" onClick={() => props.addBudgetRow('income')}>
          Ingreso
        </button>
        <button type="button" className="budget-split-toolbar-btn is-expense" onClick={() => props.addBudgetRow('expense')}>
          Gasto
        </button>
      </div>
    </div>
  ) : null;

  const showTableBottomActionsAtFooter =
    !isSplitMode &&
    !isTableOnlyDesktop &&
    (isDesktopLayout || isMobileShell);

  if (!isOpen) return null;

  const budgetIncomeExpenseActions = (
    <div className="budget-table-top-actions">
      <button type="button" className="continue-ghost is-income-action" onClick={() => props.addBudgetRow('income')}>
        Ingreso
      </button>
      <button type="button" className="continue-ghost is-expense-action" onClick={() => props.addBudgetRow('expense')}>
        Gasto
      </button>
    </div>
  );

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
        {/* Flying dot animations */}
        {flyingDots.map((dot) => (
          <div
            key={dot.id}
            className={`budget-dot-fly budget-dot-fly-${dot.type}`}
          />
        ))}

        <div className={`budget-modal-body${isDesktopLayout ? ' is-desktop' : ''}`}>
        <div className="bcc-modal-header budget-modal-header-layer">
          <div className="budget-modal-header-stack">
            <div className="budget-modal-header-title-row">
              <div className="bcc-modal-title-wrap">
                <span className="bcc-modal-eyebrow">Financieramente</span>
                <h3 id="budget-modal-title" className="bcc-modal-title">
                  Presupuesto
                </h3>
              </div>
              <BudgetViewNav
                isDesktopLayout={isDesktopLayout}
                budgetViewMode={budgetViewMode}
                onChange={setBudgetViewMode}
              />
              <AgentModalCloseButton
                onClick={requestClose}
                aria-label="Cerrar panel de presupuesto"
              />
            </div>
          </div>
        </div>
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

          <div
            className={`budget-executive-grid budget-main-carousel mode-${budgetModeClass}${isDesktopLayout ? ' is-desktop' : ' is-mobile-budget'}`}
          >
            <BudgetCarouselStage mobile={isMobileShell} stageRef={budgetMobileStageRef}>
            {budgetSplitDesktopToolbar}

            <section
              data-main-card="table"
              data-budget-table-style={budgetTableStyle}
              className={`budget-table-section budget-card-table${isDesktopLayout ? '' : ' is-mobile-table-compact'}${isMobileManualTable ? ' is-mobile-manual-table' : ''}`}
              style={cardStyle('table')}
            >
              {isTableOnlyDesktop ? (
                <div className="budget-table-head is-table-only-toolbar">
                  {budgetIncomeExpenseActions}
                  {budgetTableBottomActions}
                </div>
              ) : isSplitMode ? null : (
                <div className="budget-table-head">
                  {isDesktopLayout ? (
                    <div>
                      <p className="budget-table-help">
                        Completa Movimiento, Tipo, Monto, Recurrencia, Medio de pago y Tipo de movimiento. Impacto se calcula automático por fila.
                      </p>
                    </div>
                  ) : null}
                  {budgetIncomeExpenseActions}
                </div>
              )}

              {!isDesktopLayout ? (
                <BudgetMobileIntelSummary
                  budgetTotals={props.budgetTotals}
                  tableStyle={budgetTableStyle}
                  formatBudgetAmount={formatBudgetAmount}
                  fillRate={props.budgetCompletion.fillRate}
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
                  suppressRowClickFocus={isMobileManualTable}
                />
              ) : (
                <div className="budget-empty-state">
                  <strong>No hay filas todavía.</strong>
                  <p>Cargando estructura base de presupuesto…</p>
                </div>
              )}
              </div>
              {showTableBottomActionsAtFooter ? budgetTableBottomActions : null}
            </section>

            {isAssistantOverlayMode || isMobileAssistantOverlay ? (
              <div className="budget-assistant-blur-veil" aria-hidden="true" />
            ) : null}

            <section
              data-main-card="agent"
              className={`budget-assistant-panel budget-card-agent${!isDesktopLayout && budgetViewMode !== tableViewMode ? ' is-mobile-assistant-glass' : ''}`}
              style={cardStyle('agent')}
            >
              <div className={`bcc-hero ${mobileAssistantHeroToneClass}`}>
                <div
                  className={`bcc-hero-top${isBudgetChatBusy ? ' is-assistant-busy' : ''}`}
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-busy={isBudgetChatBusy}
                >
                  {isBudgetChatBusy ? (
                    <>
                      <span
                        className="bcc-hero-thinking"
                        role="status"
                        aria-label={
                          isInitializing
                            ? 'Preparando asistente'
                            : lastUserAnswer
                              ? 'Analizando lo que dijiste'
                              : 'Un momento'
                        }
                      >
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                      </span>
                      <span className="sr-only">
                        {isInitializing
                          ? 'Preparando asistente'
                          : lastUserAnswer
                            ? 'Analizando lo que dijiste'
                            : 'Un momento'}
                      </span>
                    </>
                  ) : (
                    <>
                      {resumedSession && !lastUserAnswer ? (
                        <p className="bcc-hero-resume-hint">Retomamos donde quedaste.</p>
                      ) : null}
                      {lastUserAnswer ? (
                        <p className="bcc-hero-reply">{lastUserAnswer}</p>
                      ) : null}
                      <AgentHeroText
                        turnKey={typewriterTurnKey}
                        text={agentTypewriterText}
                        speed={isDesktopLayout ? 8 : 12}
                        focusRow={activeBudgetRow}
                        budgetRows={props.budgetRows}
                        question={assistantNextQuestion}
                        assistantToneClass={mobileAssistantHeroToneClass}
                        questionId="budget-assistant-question"
                      />
                    </>
                  )}
                </div>
                {conversationDone && (
                  <p className="bcc-hero-done">Presupuesto completo. Puedes seguir ajustando la tabla.</p>
                )}

                <div className="bcc-hero-compose">
                  <div className="bcc-hero-input-wrap">
                    <input
                      ref={budgetReplyInputRef}
                      className="bcc-hero-input"
                      value={budgetReply}
                      onChange={(e) => setBudgetReply(e.target.value)}
                      placeholder="Escribe tu respuesta…"
                      aria-describedby="budget-assistant-question"
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

                  {showAssistantInformeAction ? (
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

                {budgetPendingConfirmation ? (
                  <BudgetPendingConfirmBanner
                    pending={budgetPendingConfirmation}
                    budgetRows={props.budgetRows}
                    budgetTotals={props.budgetTotals}
                    budgetTableStyle={budgetTableStyle}
                    formatBudgetAmount={formatBudgetAmount}
                    disabled={isAskingAI || isInitializing}
                    onPendingChange={setBudgetPendingConfirmation}
                    focusBudgetField={focusBudgetField}
                    onConfirm={handleBudgetPendingConfirm}
                    onReject={handleBudgetPendingReject}
                  />
                ) : null}

                {aiError ? <p className="bcc-hero-error">{aiError}</p> : null}
              </div>
            </section>
            </BudgetCarouselStage>
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
