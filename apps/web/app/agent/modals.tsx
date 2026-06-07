import { useEffect, useRef, useState } from 'react';
import { shouldUseMobileShell } from '@/lib/viewport-mode';
import { focusMobileInput } from '@/lib/mobile-viewport-sync';
import { getCsrfToken } from '@/lib/csrf';
import { downloadFile, saveBubbleSnapshotPdfArtifact } from '@/lib/artifacts';
import { BudgetIntelligenceTable } from '@/components/ui/budget-intelligence-table';

import type { BudgetRow } from '@/lib/budget-rows.helpers';
import { inferBudgetFocusRowId, extractInferenceQuestionText, resolveBudgetChatTargetRow } from '@/lib/budget-rows.helpers';
import {
  BUDGET_TABLE_STYLES,
  buildBudgetRowSummary,
  getAssistantMessage,
  getBudgetQuestionForId,
  getNextQuestion,
  normalizeActionRowId,
  sanitizeBudgetQuestion,
} from './budget-modal.helpers';
import { useBudgetModalLayout } from './use-budget-modal-layout';

type BudgetTopExpense = { id: string; label: string; amount: number; pct: number };
type BudgetInsights = {
  savingsRate: number;
  healthScore: number;
  fixedTotal: number;
  variableTotal: number;
  topExpenses: BudgetTopExpense[];
  nonZeroRows: unknown[];
  risingExpenseCount?: number;
  optimizePotential?: number;
};
function collectBudgetSnapshotCss(rootEl: HTMLElement) {
  const cssParts: string[] = [];
  const seen = new Set<string>();
  const selectors = new Set<string>([
    ':root',
    'html',
    'body',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'svg',
    'path',
    'line',
    'small',
    'strong',
    'span',
    'div',
    'article',
  ]);

  rootEl.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
    node.classList.forEach((className) => selectors.add(`.${className}`));
  });

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selector = rule.selectorText || '';
        if (Array.from(selectors).some((entry) => selector.includes(entry)) && !seen.has(rule.cssText)) {
          seen.add(rule.cssText);
          cssParts.push(rule.cssText);
        }
        continue;
      }

      if (rule instanceof CSSMediaRule) {
        const nested: string[] = [];
        for (const nestedRule of Array.from(rule.cssRules)) {
          if (!(nestedRule instanceof CSSStyleRule)) continue;
          const selector = nestedRule.selectorText || '';
          if (Array.from(selectors).some((entry) => selector.includes(entry)) && !seen.has(nestedRule.cssText)) {
            seen.add(nestedRule.cssText);
            nested.push(nestedRule.cssText);
          }
        }
        if (nested.length > 0) cssParts.push(`@media ${rule.conditionText}{${nested.join('\n')}}`);
        continue;
      }

      if (rule instanceof CSSKeyframesRule && !seen.has(rule.cssText)) {
        seen.add(rule.cssText);
        cssParts.push(rule.cssText);
      }
    }
  }

  return cssParts.join('\n');
}

function buildBudgetSnapshotHtmlAndCss(rootEl: HTMLElement, styleLabel: string) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const cloned = rootEl.cloneNode(true) as HTMLElement;
  cloned.classList.add('budget-pdf-paper');

  cloned.querySelectorAll('.continue-ghost.danger').forEach((el) => el.remove());

  cloned.querySelectorAll('.budget-pill-group').forEach((group) => {
    const active = group.querySelector('.budget-pill-button.is-active') as HTMLElement | null;
    const span = document.createElement('span');
    span.className = 'budget-static-pill';
    span.textContent = active?.textContent?.trim() || '';
    group.replaceWith(span);
  });

  cloned.querySelectorAll('select').forEach((selectEl) => {
    const select = selectEl as HTMLSelectElement;
    const span = document.createElement('span');
    span.className = `budget-static-field budget-static-select ${select.className}`.trim();
    span.textContent = select.options[select.selectedIndex]?.text?.trim() || select.value || '';
    select.replaceWith(span);
  });

  cloned.querySelectorAll('input, textarea').forEach((inputEl) => {
    const input = inputEl as HTMLInputElement | HTMLTextAreaElement;
    const span = document.createElement('span');
    span.className = `budget-static-field ${input.className}`.trim();
    span.textContent = input.value?.trim() || input.getAttribute('placeholder') || '0';
    const inlineStyle = input.getAttribute('style');
    if (inlineStyle) span.setAttribute('style', inlineStyle);
    input.replaceWith(span);
  });

  cloned.querySelectorAll('button').forEach((buttonEl) => {
    const button = buttonEl as HTMLButtonElement;
    if (button.closest('.budget-intel-kpis')) return;
    const span = document.createElement('span');
    span.className = `budget-static-button ${button.className}`.trim();
    span.textContent = button.textContent?.trim() || '';
    button.replaceWith(span);
  });

  const exportCss = `
@page {
  size: A4;
  margin: 0;
}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #f5f1e8 !important;
}

.budget-pdf-snapshot {
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 12mm !important;
  background: #f5f1e8 !important;
}

.budget-pdf-running-brand {
  display: block;
  margin: 0 0 3mm 0;
  text-align: center;
  font-size: 10px;
  color: #1a3047;
  font-weight: 600;
  font-family: "Times New Roman", Times, Georgia, serif;
}

.budget-pdf-running-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 8mm 0;
  padding: 0 2px 4px 2px;
  border-bottom: 1px solid rgba(28, 49, 69, 0.1);
  background: #f5f1e8 !important;
}

.budget-pdf-running-kicker {
  margin: 0 0 3mm 0;
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: #46698f !important;
  font-weight: 700;
}

.budget-pdf-running-title {
  margin: 0 0 1.5mm 0;
  font-size: 21px;
  line-height: 1.1;
  color: #132b40 !important;
  font-weight: 700;
}

.budget-pdf-running-subtitle {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: #2b3f53 !important;
  max-width: 70ch;
}

.budget-pdf-running-badge {
  border: 1px solid rgba(53, 94, 137, 0.9);
  border-radius: 999px;
  padding: 1.4mm 3.4mm;
  font-size: 9px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #355f89 !important;
  font-weight: 700;
  white-space: nowrap;
}

.budget-pdf-paper,
.budget-pdf-paper * {
  opacity: 1 !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.budget-pdf-paper {
  overflow: visible !important;
  box-shadow: none !important;
}

.budget-pdf-paper .budget-table-wrap,
.budget-pdf-paper .budget-table {
  overflow: visible !important;
}

.budget-static-field,
.budget-static-pill,
.budget-static-button {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  box-sizing: border-box;
}

.budget-static-field {
  width: 100%;
  white-space: normal;
}

.budget-static-pill {
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
}

.budget-pdf-paper .budget-impact-shell {
  min-width: 118px;
}
`;

  return {
    html: `<div class="budget-pdf-snapshot">
      <div class="budget-pdf-running-brand">Financieramente</div>
      <header class="budget-pdf-running-header">
        <div class="budget-pdf-running-header-copy">
          <p class="budget-pdf-running-kicker">PRESUPUESTO</p>
          <h1 class="budget-pdf-running-title">Budget intelligence</h1>
          <p class="budget-pdf-running-subtitle">Tabla exportada con el estilo visual activo y los valores actuales del presupuesto.</p>
        </div>
        <div class="budget-pdf-running-badge">${escapeHtml(styleLabel)}</div>
      </header>
      ${cloned.outerHTML}
    </div>`,
    css: `${collectBudgetSnapshotCss(rootEl)}\n${exportCss}`,
  };
}

export { TransactionsModal } from './transactions';


export function BudgetModal(props: {
  isOpen: boolean;
  onClose: () => void;
  budgetTotals: { income: number; expenses: number; balance: number };
  budgetInsights: BudgetInsights;
  budgetRows: BudgetRow[];
  budgetProductOptions: string[];
  budgetCompletion: {
    fillRate: number;
    totalRows: number;
    filledRows: BudgetRow[];
  };
  budgetSignals: {
    balanceTone: 'surplus' | 'deficit' | 'balanced';
    balanceLabel: string;
    balanceHint: string;
    coreFilledCount: number;
    coreTotal: number;
    coreFillRate: number;
    readinessScore: number;
    nextAction: string;
    risingExpenseCount: number;
    optimizePotential: number;
  };
  updateBudgetRow: (id: string, field: keyof BudgetRow, value: string | number) => void;
  upsertBudgetRow: (row: BudgetRow) => void;
  applyBudgetTemplate: () => void;
  coachHint: string;
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

  const MATTE_GRAY_PALETTE = [
    '#8b949d',
    '#7f8992',
    '#9098a0',
    '#76818b',
    '#9aa2a9',
    '#868f98',
    '#727d88',
    '#9ea5ac',
  ] as const;

  function colorForBudgetRow(rowId: string) {
    let hash = 0;
    for (let i = 0; i < rowId.length; i += 1) {
      hash = (hash << 5) - hash + rowId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % MATTE_GRAY_PALETTE.length;
    return MATTE_GRAY_PALETTE[idx];
  }

  const [budgetReply, setBudgetReply] = useState('');
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [conversationDone, setConversationDone] = useState(false);
  const [assistantMarketSnapshot, setAssistantMarketSnapshot] = useState<{
    uf: { value: number | null; unit: string | null; date: string | null; source: string | null };
    tpm: { value: number | null; unit: string | null; date: string | null; source: string | null };
    usd: { value: number | null; unit: string | null; date: string | null; source: string | null };
    summary: string;
  } | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [flyingDots, setFlyingDots] = useState<Array<{ id: number; type: 'income' | 'expense' }>>([]);
  const [activeBudgetRowId, setActiveBudgetRowId] = useState<string | null>(null);
  const [assistantBudgetRowId, setAssistantBudgetRowId] = useState<string | null>(null);
  const [assistantNextQuestion, setAssistantNextQuestion] = useState<string | null>(null);
  const { isDesktopLayout, budgetViewMode, setBudgetViewMode, moveBudgetView, cardStyle, budgetModeClass } =
    useBudgetModalLayout(props.isOpen);
  const [budgetTableStyle, setBudgetTableStyle] = useState<'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon'>('terminal');
  const [isGeneratingBudgetPdf, setIsGeneratingBudgetPdf] = useState(false);
  const budgetPdfRef = useRef<HTMLDivElement | null>(null);
  const budgetTableScrollRef = useRef<HTMLDivElement | null>(null);
  const budgetModalRef = useRef<HTMLDivElement | null>(null);
  const budgetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const flyingDotCounter = useRef(0);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetActionTimersRef = useRef<number[]>([]);
  const budgetDotTimersRef = useRef<number[]>([]);
  const replySubmitLockRef = useRef(false);
  const initAbortRef = useRef<AbortController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const budgetReplyInputRef = useRef<HTMLInputElement | null>(null);
  const formatBudgetAmount = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const formatMarketValue = (value: number, decimals = 0) =>
    Number(value).toLocaleString('es-CL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const focusBudgetField = (target: EventTarget | null) => {
    const el = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    focusMobileInput(el);
  };
  const activeQuestion = assistantNextQuestion ?? assistantQuestion ?? '…';
  const agentStatusText = isInitializing
    ? 'Preparando asistente…'
    : isAskingAI
      ? 'Analizando…'
      : activeQuestion;
  const activeStyleIndex = BUDGET_TABLE_STYLES.findIndex((style) => style.id === budgetTableStyle);
  const activeStyleLabel = BUDGET_TABLE_STYLES[Math.max(0, activeStyleIndex)]?.label ?? 'Nocturno';
  const heroToneClass =
    props.budgetSignals.balanceTone === 'surplus'
      ? 'is-positive'
      : props.budgetSignals.balanceTone === 'deficit'
        ? 'is-negative'
        : 'is-neutral';
  const marketSnapshotChips = assistantMarketSnapshot
    ? [
        assistantMarketSnapshot.uf.value !== null ? `UF ${formatMarketValue(assistantMarketSnapshot.uf.value, 2)}` : null,
        assistantMarketSnapshot.tpm.value !== null ? `TPM ${formatMarketValue(assistantMarketSnapshot.tpm.value, 2)}%` : null,
        assistantMarketSnapshot.usd.value !== null ? `USD/CLP ${formatMarketValue(assistantMarketSnapshot.usd.value, 2)}` : null,
      ].filter((value): value is string => Boolean(value))
    : [];

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
  const activeBudgetRow = props.budgetRows.find((row) => row.id === focusedBudgetRowId) ?? null;

  const orderedBudgetRows = props.budgetRows;

  function applyAssistantTurn(payload: BudgetChatApiPayload, previousQuestion: string) {
    const reply = getAssistantMessage(payload);
    setAssistantQuestion(reply || previousQuestion);
    const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
    setAssistantNextQuestion(nextQuestion || null);
  }

  useEffect(() => {
    if (activeBudgetRowId && !props.budgetRows.some((row) => row.id === activeBudgetRowId)) {
      setActiveBudgetRowId(null);
    }
  }, [activeBudgetRowId, props.budgetRows]);

  useEffect(() => {
    if (!assistantBudgetRowId) return;
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
  }, [assistantBudgetRowId]);

  function focusBudgetRow(rowId: string) {
    setActiveBudgetRowId(rowId);
    setAssistantBudgetRowId(rowId);
    setAssistantNextQuestion(getBudgetQuestionForId(rowId));
  }

  function applyBudgetAction(action: Record<string, unknown> | null | undefined) {
    if (!action || typeof action !== 'object') return;
    let kind = action.kind;
    const rowId = normalizeActionRowId(action.id);
    const existingRow =
      rowId ? props.budgetRows.find((row) => normalizeActionRowId(row.id) === rowId) ?? null : null;
    const rowType =
      action.type === 'income'
        ? 'income'
        : action.type === 'expense'
          ? 'expense'
          : existingRow?.type ?? null;
    const amount =
      action.amount === undefined
        ? existingRow?.amount ?? 0
        : Math.max(0, Math.round(Number(action.amount ?? 0)));
    const category = String(action.category ?? existingRow?.category ?? '').trim();
    const cadence =
      action.cadence === 'fixed' || action.cadence === 'variable'
        ? action.cadence
        : action.cadence === 'oneoff'
          ? 'variable'
          : existingRow?.cadence === 'fixed' || existingRow?.cadence === 'variable'
            ? existingRow.cadence
            : undefined;
    const paymentMethod =
      action.payment_method === 'transfer' ||
      action.payment_method === 'debit' ||
      action.payment_method === 'credit' ||
      action.payment_method === 'cash' ||
      action.payment_method === 'prepaid' ||
      action.payment_method === 'other'
        ? action.payment_method
        : action.paymentMethod === 'transfer' ||
            action.paymentMethod === 'debit' ||
            action.paymentMethod === 'credit' ||
            action.paymentMethod === 'cash' ||
            action.paymentMethod === 'prepaid' ||
            action.paymentMethod === 'other'
          ? action.paymentMethod
          : existingRow?.paymentMethod;
    const movementType =
      action.movement_type === 'income_main' ||
      action.movement_type === 'income_extra' ||
      action.movement_type === 'housing' ||
      action.movement_type === 'home_services' ||
      action.movement_type === 'food' ||
      action.movement_type === 'transport' ||
      action.movement_type === 'health' ||
      action.movement_type === 'education' ||
      action.movement_type === 'debt' ||
      action.movement_type === 'savings_investment' ||
      action.movement_type === 'taxes_fees' ||
      action.movement_type === 'leisure_other'
        ? action.movement_type
        : action.movementType === 'income_main' ||
            action.movementType === 'income_extra' ||
            action.movementType === 'housing' ||
            action.movementType === 'home_services' ||
            action.movementType === 'food' ||
            action.movementType === 'transport' ||
            action.movementType === 'health' ||
            action.movementType === 'education' ||
            action.movementType === 'debt' ||
            action.movementType === 'savings_investment' ||
            action.movementType === 'taxes_fees' ||
            action.movementType === 'leisure_other'
          ? action.movementType
          : existingRow?.movementType;
    if (!rowId) return;
    const existingRowIds = new Set(props.budgetRows.map((row) => normalizeActionRowId(row.id)).filter(Boolean));
    const rowExists = existingRowIds.has(rowId);

    if (kind === 'delete') {
      if (!rowExists) return;
      props.deleteBudgetRow(rowId);
      if (activeBudgetRowId === rowId) setActiveBudgetRowId(null);
      return;
    }
    if (kind !== 'add' && kind !== 'update') return;
    if (!rowType || !category) return;
    if (kind === 'update' && !rowExists) return;
    if (kind === 'add' && rowExists) kind = 'update';

    const row: BudgetRow = {
      id: rowId,
      type: rowType,
      category,
      amount,
      cadence,
      paymentMethod,
      movementType,
    };
    props.upsertBudgetRow(row);
    // Animate the updated row directly without touching assistantBudgetRowId (caller sets it for next question)
    budgetActionTimersRef.current.push(
      window.setTimeout(() => {
        const el = document.getElementById(`budget-row-${row.id}`);
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
    // Trigger flying dot animation
    const dotId = ++flyingDotCounter.current;
    setFlyingDots((prev) => [...prev, { id: dotId, type: rowType }]);
    budgetDotTimersRef.current.push(
      window.setTimeout(() => setFlyingDots((prev) => prev.filter((d) => d.id !== dotId)), 750),
    );
  }

  function applyBudgetActions(actions: Array<Record<string, unknown>>): string | null {
    if (!Array.isArray(actions)) return null;
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
        downloadFile(artifact.fileUrl, 'presupuesto-financieramente.pdf');
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

  function unwrapApiData<T>(payload: unknown): T | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as { ok?: boolean; data?: unknown };
    if ('data' in candidate && candidate.ok === true) return (candidate.data ?? null) as T | null;
    return payload as T;
  }

  type BudgetChatApiPayload = {
    ok?: boolean;
    error?: string;
    detail?: string;
    source?: string;
    next_question?: string | null;
    focus_row_id?: string | null;
    coach_message?: string;
    assistant_reply?: string;
    assistant_text?: string;
    done?: boolean;
    market_snapshot?: {
      uf?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
      tpm?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
      usd?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
      summary?: string;
    };
    actions?: Array<Record<string, unknown>>;
    action?: Record<string, unknown>;
  };

  function normalizeBudgetChatPayload(payload: unknown): BudgetChatApiPayload | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as BudgetChatApiPayload;
    const marketSnapshot =
      candidate.market_snapshot && typeof candidate.market_snapshot === 'object'
        ? {
            uf:
              candidate.market_snapshot.uf && typeof candidate.market_snapshot.uf === 'object'
                ? {
                    value:
                      typeof candidate.market_snapshot.uf.value === 'number'
                        ? candidate.market_snapshot.uf.value
                        : null,
                    unit:
                      typeof candidate.market_snapshot.uf.unit === 'string'
                        ? candidate.market_snapshot.uf.unit
                        : null,
                    date:
                      typeof candidate.market_snapshot.uf.date === 'string'
                        ? candidate.market_snapshot.uf.date
                        : null,
                    source:
                      typeof candidate.market_snapshot.uf.source === 'string'
                        ? candidate.market_snapshot.uf.source
                        : null,
                  }
                : undefined,
            tpm:
              candidate.market_snapshot.tpm && typeof candidate.market_snapshot.tpm === 'object'
                ? {
                    value:
                      typeof candidate.market_snapshot.tpm.value === 'number'
                        ? candidate.market_snapshot.tpm.value
                        : null,
                    unit:
                      typeof candidate.market_snapshot.tpm.unit === 'string'
                        ? candidate.market_snapshot.tpm.unit
                        : null,
                    date:
                      typeof candidate.market_snapshot.tpm.date === 'string'
                        ? candidate.market_snapshot.tpm.date
                        : null,
                    source:
                      typeof candidate.market_snapshot.tpm.source === 'string'
                        ? candidate.market_snapshot.tpm.source
                        : null,
                  }
                : undefined,
            usd:
              candidate.market_snapshot.usd && typeof candidate.market_snapshot.usd === 'object'
                ? {
                    value:
                      typeof candidate.market_snapshot.usd.value === 'number'
                        ? candidate.market_snapshot.usd.value
                        : null,
                    unit:
                      typeof candidate.market_snapshot.usd.unit === 'string'
                        ? candidate.market_snapshot.usd.unit
                        : null,
                    date:
                      typeof candidate.market_snapshot.usd.date === 'string'
                        ? candidate.market_snapshot.usd.date
                        : null,
                    source:
                      typeof candidate.market_snapshot.usd.source === 'string'
                        ? candidate.market_snapshot.usd.source
                        : null,
                  }
                : undefined,
            summary:
              typeof candidate.market_snapshot.summary === 'string' ? candidate.market_snapshot.summary : '',
          }
        : undefined;

    return {
      ok: candidate.ok === true,
      error: typeof candidate.error === 'string' ? candidate.error : undefined,
      detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
      source: typeof candidate.source === 'string' ? candidate.source : undefined,
      next_question:
        candidate.next_question === null
          ? null
          : typeof candidate.next_question === 'string'
            ? candidate.next_question
            : undefined,
      focus_row_id:
        typeof candidate.focus_row_id === 'string' && candidate.focus_row_id.trim()
          ? candidate.focus_row_id
          : null,
      coach_message: typeof candidate.coach_message === 'string' ? candidate.coach_message : undefined,
      assistant_reply: typeof candidate.assistant_reply === 'string' ? candidate.assistant_reply : undefined,
      assistant_text: typeof candidate.assistant_text === 'string' ? candidate.assistant_text : undefined,
      done: typeof candidate.done === 'boolean' ? candidate.done : undefined,
      market_snapshot: marketSnapshot,
      actions: Array.isArray(candidate.actions)
        ? candidate.actions.filter((action): action is Record<string, unknown> => Boolean(action && typeof action === 'object'))
        : undefined,
      action:
        candidate.action && typeof candidate.action === 'object'
          ? (candidate.action as Record<string, unknown>)
          : undefined,
    };
  }

  function isBudgetChatAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  function createBudgetChatHttpError(status: number, payload: BudgetChatApiPayload | null) {
    const detail = typeof payload?.error === 'string' ? payload.error : typeof payload?.detail === 'string' ? payload.detail : '';
    return new Error(`HTTP ${status}${detail ? ` ${detail}` : ''}`);
  }

  function budgetChatErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('HTTP 401')) {
      return 'Sesion expirada o no iniciada. Vuelve a entrar para usar el asistente.';
    }
    if (message.includes('HTTP 429')) {
      return 'Demasiadas solicitudes al asistente. Espera un momento e intenta otra vez.';
    }
    if (message.includes('HTTP 5')) {
      return 'El servicio del asistente no esta disponible ahora. Intenta nuevamente en unos segundos.';
    }
    return 'No se pudo conectar con el asistente. No se aplicaron cambios automaticos.';
  }

  async function handleBudgetAgentReplySubmit() {
    const answer = budgetReply.trim();
    if (!answer || isAskingAI || replySubmitLockRef.current) return;
    replySubmitLockRef.current = true;

    const manualFocusRowId = activeBudgetRowId;
    const questionForTurn =
      (manualFocusRowId ? getBudgetQuestionForId(manualFocusRowId) : null) ??
      assistantNextQuestion ??
      extractInferenceQuestionText(assistantQuestion ?? '') ??
      assistantQuestion ??
      activeQuestion;
    const newChatAnswers = [...props.chatAnswers, { q: questionForTurn, a: answer }];
    props.onChatAnswersChange(newChatAnswers);
    setBudgetReply('');
    setAiError(null);

    const chatTargetRow =
      resolveBudgetChatTargetRow(props.budgetRows, questionForTurn, {
        manualFocusRowId,
        assistantFocusRowId: assistantBudgetRowId,
        activeRow: activeBudgetRow,
      }) ?? null;

    // Call AI to get precise row update + next personalized question
    try {
      setIsAskingAI(true);
      replyAbortRef.current?.abort();
      replyAbortRef.current = new AbortController();
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      askingWatchdogRef.current = setTimeout(() => {
        replyAbortRef.current?.abort();
        setIsAskingAI(false);
      }, 20000);
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/budget-chat', {
        method: 'POST',
        signal: replyAbortRef.current.signal,
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
          chatAnswers: newChatAnswers.slice(-6),
          products: props.bankProducts ?? [],
          manualFocusRowId,
          assistantFocusRowId: assistantBudgetRowId,
          activeRowId: chatTargetRow?.id ?? null,
          activeRow: chatTargetRow ? buildBudgetRowSummary(chatTargetRow) : null,
          intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
          intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
        }),
      });
      const raw = await res.json();
      if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
      const payload = normalizeBudgetChatPayload(unwrapApiData<BudgetChatApiPayload>(raw));
      if (payload) {
        const rawActions = payload.actions ?? (payload.action ? [payload.action] : []);
        const lastTouchedRowId = applyBudgetActions(rawActions);
        setConversationDone(Boolean(payload.done));
        applyAssistantTurn(payload, questionForTurn);
        setAssistantMarketSnapshot(
          payload.market_snapshot
            ? {
                uf: {
                  value: payload.market_snapshot.uf?.value ?? null,
                  unit: payload.market_snapshot.uf?.unit ?? null,
                  date: payload.market_snapshot.uf?.date ?? null,
                  source: payload.market_snapshot.uf?.source ?? null,
                },
                tpm: {
                  value: payload.market_snapshot.tpm?.value ?? null,
                  unit: payload.market_snapshot.tpm?.unit ?? null,
                  date: payload.market_snapshot.tpm?.date ?? null,
                  source: payload.market_snapshot.tpm?.source ?? null,
                },
                usd: {
                  value: payload.market_snapshot.usd?.value ?? null,
                  unit: payload.market_snapshot.usd?.unit ?? null,
                  date: payload.market_snapshot.usd?.date ?? null,
                  source: payload.market_snapshot.usd?.source ?? null,
                },
                summary: typeof payload.market_snapshot.summary === 'string' ? payload.market_snapshot.summary : '',
            }
            : null,
        );
        const explicitFocus = normalizeActionRowId(payload.focus_row_id);
        const nextQuestion = sanitizeBudgetQuestion(getNextQuestion(payload, ''));
        setAssistantNextQuestion(nextQuestion || null);
        if (explicitFocus || lastTouchedRowId) {
          setAssistantBudgetRowId(explicitFocus ?? lastTouchedRowId ?? null);
        } else if (nextQuestion) {
          setAssistantBudgetRowId(inferBudgetFocusRowId(nextQuestion));
        }
      } else {
        setAssistantQuestion('No recibí respuesta. Reformula con monto o categoría.');
        setAssistantNextQuestion(null);
        setAssistantMarketSnapshot(null);
      }
    } catch (error) {
      if (isBudgetChatAbortError(error)) return;
      setAiError(budgetChatErrorMessage(error));
    } finally {
      if (askingWatchdogRef.current) {
        clearTimeout(askingWatchdogRef.current);
        askingWatchdogRef.current = null;
      }
      setIsAskingAI(false);
      replySubmitLockRef.current = false;
    }
  }

  useEffect(
    () => () => {
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
      budgetActionTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetDotTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      budgetActionTimersRef.current = [];
      budgetDotTimersRef.current = [];
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
    },
    [],
  );

  // On open: reset conversation state and fetch first personalized question from AI
  useEffect(() => {
    if (!props.isOpen) return;
    setBudgetViewMode(!shouldUseMobileShell() ? 2 : 1);
    const budgetRowsForInit = props.budgetRows.slice(0, 30);
    setBudgetReply('');
    setConversationDone(false);
    setAiError(null);
    setAssistantQuestion(null);
    setAssistantNextQuestion(null);
    setAssistantMarketSnapshot(null);
    setIsInitializing(true);
    setActiveBudgetRowId(null);
    setAssistantBudgetRowId(null);

    initAbortRef.current?.abort();
    initAbortRef.current = new AbortController();
    const initSignal = initAbortRef.current.signal;

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
            chatAnswers: [],
            products: props.bankProducts ?? [],
            activeRowId: null,
            activeRow: null,
            intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
            intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
          }),
        });
        const raw = await res.json();
        if (!res.ok) throw createBudgetChatHttpError(res.status, normalizeBudgetChatPayload(raw));
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
          setAssistantMarketSnapshot(null);
        }
        setAssistantMarketSnapshot(
          payload?.market_snapshot
            ? {
                uf: {
                  value: payload.market_snapshot.uf?.value ?? null,
                  unit: payload.market_snapshot.uf?.unit ?? null,
                  date: payload.market_snapshot.uf?.date ?? null,
                  source: payload.market_snapshot.uf?.source ?? null,
                },
                tpm: {
                  value: payload.market_snapshot.tpm?.value ?? null,
                  unit: payload.market_snapshot.tpm?.unit ?? null,
                  date: payload.market_snapshot.tpm?.date ?? null,
                  source: payload.market_snapshot.tpm?.source ?? null,
                },
                usd: {
                  value: payload.market_snapshot.usd?.value ?? null,
                  unit: payload.market_snapshot.usd?.unit ?? null,
                  date: payload.market_snapshot.usd?.date ?? null,
                  source: payload.market_snapshot.usd?.source ?? null,
                },
                summary: typeof payload.market_snapshot.summary === 'string' ? payload.market_snapshot.summary : '',
              }
            : null,
        );
      } catch (err) {
        if (isBudgetChatAbortError(err)) return;
        setAssistantQuestion(getBudgetQuestionForId('income_salary'));
        setAssistantNextQuestion(getBudgetQuestionForId('income_salary'));
        setAssistantBudgetRowId('income_salary');
        setAssistantMarketSnapshot(null);
        setAiError(budgetChatErrorMessage(err));
      } finally {
        if (!initSignal.aborted) setIsInitializing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen || isDesktopLayout) return;
    const selector = budgetViewMode === 1 ? '[data-main-card="agent"]' : '[data-main-card="table"]';
    const target = budgetModalRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [budgetViewMode, isDesktopLayout, props.isOpen]);


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

  const { isOpen, onClose } = props;

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
        onClose();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="agent-modal-overlay budget-modal-overlay" onClick={onClose}>
      <div
        className="agent-modal budget-modal"
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
            onClick={props.onClose}
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
          {!( !isDesktopLayout && budgetViewMode === 2 ) && (
          <section className={`budget-cockpit-banner ${heroToneClass}`}>
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

          <div className="budget-mode-tabs" aria-label="Modo de presupuesto">
            <button
              type="button"
              className={`budget-mode-tab${budgetViewMode === 1 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(1)}
            >
              {isDesktopLayout ? 'Asistente + Tabla' : 'Asistente'}
            </button>
            <button
              type="button"
              className={`budget-mode-tab${budgetViewMode === 2 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(2)}
            >
              {isDesktopLayout ? 'Panel dividido' : 'Tabla'}
            </button>
            <button
              type="button"
              className={`budget-mode-tab is-desktop-only${budgetViewMode === 3 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(3)}
            >
              Solo tabla
            </button>
          </div>

          <div
            className={`budget-executive-grid budget-main-carousel mode-${budgetModeClass}${isDesktopLayout ? ' is-desktop' : ' is-mobile-budget'}`}
          >
            {isDesktopLayout && (
              <>
                <button
                  type="button"
                  className="budget-carousel-arrow is-left"
                  aria-label="Vista anterior"
                  onClick={() => moveBudgetView('prev')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className="budget-carousel-arrow is-right"
                  aria-label="Vista siguiente"
                  onClick={() => moveBudgetView('next')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}
            <section
              data-main-card="agent"
              className="budget-assistant-panel budget-card-agent"
              style={cardStyle('agent')}
            >
              <div className="bcc-hero">
                <div className="bcc-hero-top">
                  <div className="bcc-hero-label-row">
                    <span className="bcc-hero-label">Asistente financiero</span>
                    {props.sessionInfo?.injectedIntake && <span className="bcc-hero-pill">Perfil activo</span>}
                    {isAskingAI && (
                      <span className="bcc-hero-thinking">
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                      </span>
                    )}
                  </div>

                  <p className="bcc-hero-question">{agentStatusText}</p>
                  {conversationDone && (
                    <p className="bcc-hero-done">Presupuesto completo. Puedes seguir ajustando la tabla.</p>
                  )}
                  {marketSnapshotChips.length > 0 && (
                    <div className="budget-market-strip" aria-label="Contexto de mercado">
                      {marketSnapshotChips.map((chip) => (
                        <span key={chip} className="budget-market-chip">
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

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

                {aiError && <p className="bcc-hero-error">{aiError}</p>}
              </div>
            </section>

            <section
              data-main-card="table"
              className={`budget-table-section budget-card-table${isDesktopLayout ? '' : ' is-mobile-table-compact'}`}
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

              <div
                ref={budgetTableScrollRef}
                className={isDesktopLayout ? 'budget-table-scroll-host budget-table-scroll-host--desktop' : 'budget-table-scroll-host'}
              >
              {props.budgetRows.length > 0 ? (
                <BudgetIntelligenceTable
                  orderedBudgetRows={orderedBudgetRows}
                  budgetRows={props.budgetRows}
                  focusedBudgetRowId={focusedBudgetRowId}
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
                />
              ) : (
                <div className="budget-empty-state">
                  <strong>No hay filas todavía.</strong>
                  <p>Cargando estructura base de presupuesto…</p>
                </div>
              )}
              </div>
              <div className="budget-table-bottom-actions">
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
              </div>
            </section>

          </div>
        </div>{/* /budget-modal-body */}
      </div>
    </div>
  );
}

type QuestionnaireDashboard = {
  readinessScore: number;
  understanding: number | null;
  stress: number | null;
  responsePairs: Array<{ label: string; value: string }>;
  insights: string[];
};

export function QuestionnaireModal(props: {
  isOpen: boolean;
  questionnaireDashboard: QuestionnaireDashboard | null;
  sessionUserName?: string | null;
  onClose: () => void;
}) {
  if (!props.isOpen || !props.questionnaireDashboard) return null;
  const userName = String(props.sessionUserName ?? '').trim();
  const responseVariantClass = (item: { label: string; value: string }, index: number) => {
    const seed = `${item.label}:${item.value}:${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const variants = ['is-black', 'is-blue', 'is-gold', 'is-red', 'is-light', 'is-black'];
    return variants[hash % variants.length];
  };
  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal questionnaire-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 className="bcc-modal-title">Cuestionario y lectura ejecutiva</h3>
            {userName ? <p className="questionnaire-user-name">{userName}</p> : null}
          </div>
          <button type="button" className="agent-modal-close" onClick={props.onClose}>×</button>
        </div>
        <p className="agent-modal-intro">Resumen de respuestas del intake con una lectura breve para decisiones tácticas.</p>
        <div className="questionnaire-dashboard">
          <div className="questionnaire-kpi-grid">
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Preparación</span><strong>{props.questionnaireDashboard.readinessScore}%</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Comprensión</span><strong>{props.questionnaireDashboard.understanding !== null ? `${props.questionnaireDashboard.understanding}/10` : 'N/D'}</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Estrés</span><strong>{props.questionnaireDashboard.stress !== null ? `${props.questionnaireDashboard.stress}/10` : 'N/D'}</strong></article>
          </div>
          <div className="questionnaire-response-grid">
            {props.questionnaireDashboard.responsePairs.map((item, index) => (
              <div
                key={item.label}
                className={`questionnaire-response-item ${responseVariantClass(item, index)}`}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="questionnaire-insights">
            <span className="questionnaire-kpi-label">Lecturas</span>
            <ul>{props.questionnaireDashboard.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountModal(props: {
  isOpen: boolean;
  sessionUserName?: string | null;
  sessionEmail?: string | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
}) {
  if (!props.isOpen) return null;

  const userName = String(props.sessionUserName ?? '').trim();

  return (
    <div className="agent-modal-overlay account-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 className="bcc-modal-title">Cuenta</h3>
            {userName ? <p className="questionnaire-user-name">{userName}</p> : null}
          </div>
          <button type="button" className="agent-modal-close" onClick={props.onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <p className="agent-modal-intro account-modal-intro">
          Gestiona tu sesión actual. Cerrar sesión te devuelve al acceso; borrar cuenta elimina tus datos de forma permanente.
        </p>
        <div className="account-modal-dashboard questionnaire-dashboard">
          {props.error ? (
            <div className="account-modal-alert" role="alert">
              <span className="account-modal-alert-title">No se pudo completar la acción</span>
              <p>{props.error}</p>
            </div>
          ) : null}
          <div className="questionnaire-response-grid account-modal-info-grid">
            <div className="questionnaire-response-item is-blue">
              <span>Usuario</span>
              <strong>{props.sessionUserName || 'Cuenta activa'}</strong>
            </div>
            <div className="questionnaire-response-item is-gold">
              <span>Email</span>
              <strong>{props.sessionEmail || 'Sesión autenticada'}</strong>
            </div>
          </div>
          <div className="account-modal-actions">
            <button
              type="button"
              className="continue-button account-modal-logout"
              onClick={() => void props.onLogout()}
              disabled={props.isLoading}
            >
              {props.isLoading ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
            <button
              type="button"
              className="continue-button danger account-modal-delete"
              onClick={() => void props.onDeleteAccount()}
              disabled={props.isLoading}
            >
              {props.isLoading ? 'Eliminando…' : 'Borrar cuenta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
