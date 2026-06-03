import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getCsrfToken } from '@/lib/csrf';
import { CHILE_FINANCIAL_INSTITUTIONS, FINANCIAL_SERVICE_OPTIONS } from '@/lib/financialCatalog';
import { BudgetIntelligenceTable } from '@/components/ui/budget-intelligence-table';
import ModalNumbersCanvas from '@/components/agent/ModalNumbersCanvas';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

const darkTooltipStyle = {
  background: 'rgba(10,14,20,0.95)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  color: '#ffffff',
};
const TX_SECONDARY_COLORS = ['#425d7d', '#8ea7bf', '#c6a052', '#823232'];

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  product?: string;
  institution?: string;
  note?: string;
  detail?: string;
  cadence?: 'fixed' | 'variable' | 'oneoff';
  paymentMethod?: 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
  movementType?:
    | 'income_main'
    | 'income_extra'
    | 'housing'
    | 'home_services'
    | 'food'
    | 'transport'
    | 'health'
    | 'education'
    | 'debt'
    | 'savings_investment'
    | 'taxes_fees'
    | 'leisure_other';
  momentum?: 'up' | 'steady' | 'down';
  strategy?: 'shield' | 'review' | 'optimize';
};

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
type BudgetTableStyleId = 'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon';

const BUDGET_TABLE_STYLES: Array<{ id: BudgetTableStyleId; label: string }> = [
  { id: 'midnight', label: 'Nocturno' },
  { id: 'ledger', label: 'Editorial' },
  { id: 'atelier', label: 'Atelier' },
  { id: 'terminal', label: 'Mercado' },
  { id: 'carbon', label: 'Carbono' },
];

function normalizeBudgetText(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type TxDockTransitionPhase = 'idle' | 'authorizing' | 'flood' | 'library-reveal' | 'chat-reveal';

function NumericDust({
  scope,
  pulse,
  active = true,
  count = 24,
}: {
  scope: string;
  pulse: number;
  active?: boolean;
  count?: number;
}) {
  return (
    <div
      className={`tx-digit-dust tx-digit-dust--${scope}${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, idx) => {
        const digit = (idx * 3 + pulse * 7 + scope.length) % 10;
        const style = {
          ['--dust-x' as any]: `${(idx * 37 + pulse * 11) % 100}%`,
          ['--dust-y' as any]: `${(idx * 19 + pulse * 13) % 100}%`,
          ['--dust-delay' as any]: `${(idx % 9) * 0.08}s`,
          ['--dust-duration' as any]: `${4.2 + (idx % 5) * 0.55}s`,
          ['--dust-depth' as any]: `${((idx % 7) - 3) * 16}px`,
          ['--dust-scale' as any]: `${0.7 + (idx % 4) * 0.12}`,
          ['--dust-rotate' as any]: `${(idx % 6) * 14 - 28}deg`,
        } as CSSProperties;
        return (
          <span key={`${scope}-${idx}-${pulse}`} style={style}>
            {digit}
          </span>
        );
      })}
    </div>
  );
}

function buildEditorialSummaryBlocks(text: string | null | undefined) {
  return String(text ?? '')
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\s*\n+\s*/g, ' ').trim())
    .filter(Boolean)
    .map((block, index) => {
      const match = block.match(/^([^:]{12,96}):\s*(.+)$/);
      if (match && index > 0) {
        return {
          lead: false,
          kicker: match[1].trim(),
          body: match[2].trim(),
        };
      }
      return {
        lead: index === 0,
        kicker: null,
        body: block,
      };
    });
}

function EditorialSummary({
  text,
  compact = false,
}: {
  text: string | null | undefined;
  compact?: boolean;
}) {
  const blocks = buildEditorialSummaryBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div className={`tx-summary-editorial${compact ? ' is-compact' : ''}`}>
      {blocks.map((block, index) => (
        <article
          key={`${block.kicker ?? 'block'}-${index}`}
          className={`tx-summary-editorial-block${block.lead ? ' is-lead' : ''}`}
        >
          {block.kicker ? <span className="tx-summary-editorial-kicker">{block.kicker}</span> : null}
          <p className="tx-summary-editorial-body">{block.body}</p>
        </article>
      ))}
    </div>
  );
}

function getFormatLabel(format: 'photos' | 'pdf' | 'spreadsheet' | 'text'): string {
  if (format === 'photos') return 'Fotos';
  if (format === 'pdf') return 'PDF';
  if (format === 'spreadsheet') return 'Excel / CSV';
  return 'Texto';
}

function formatPercentCompact(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 'N/D';
  return `${Number(value).toFixed(1)}%`;
}

function confidenceBand(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (numeric >= 0.92) return 'Alta';
  if (numeric >= 0.8) return 'Media';
  return 'Baja';
}

function movementSourceLabel(value?: string | null) {
  return value === 'table' ? 'Tabla' : 'Texto';
}

function getFormatMicrocopy(format: 'photos' | 'pdf' | 'spreadsheet' | 'text'): string {
  if (format === 'photos') return 'capturas limpias';
  if (format === 'pdf') return 'cartola completa';
  if (format === 'spreadsheet') return 'filas estructuradas';
  return 'entrada manual';
}

function renderFormatIcon(format: 'photos' | 'pdf' | 'spreadsheet' | 'text') {
  if (format === 'photos') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.5" y="6" width="15" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        <path d="M7.5 15l3-3 2.5 2.5 2-2 1.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (format === 'pdf') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4.5h6l4 4V18a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 017 18V6a1.5 1.5 0 011.5-1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 4.5V9h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (format === 'spreadsheet') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="5.5" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 5.5v13M14.5 5.5v13M5 10h14M5 14h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8.5h10M7 12h7M7 15.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="4.5" y="5" width="15" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function buildRefinementPromptForRow(row: { id: string; category: string; type: 'income' | 'expense' }): string {
  const category = normalizeBudgetText(row.category);
  if (row.type === 'income' || row.id === 'income_salary' || /ingreso|sueldo|salario|honorario|freelance|comision/.test(category)) {
    return `Para este movimiento "${row.category}", dime fuentes y montos. Ej: sueldo 900000, freelance 250000`;
  }
  if (row.id === 'expense_savings' || /ahorr|inversion|invertir|apv|fondo/.test(category)) {
    return `Para este movimiento "${row.category}", dime aportes reales con monto. Ej: APV 120000, fondo mutuo 80000`;
  }
  if (row.id === 'expense_debt' || /deuda|cuota|credito|tarjeta|prestamo|hipoteca/.test(category)) {
    return `Para este movimiento "${row.category}", dime pagos reales con monto. Ej: cuota tarjeta 90000, credito consumo 140000`;
  }
  if (row.id === 'expense_services' || /servicios|luz|agua|gas|internet|telefono/.test(category)) {
    return `Para este movimiento "${row.category}", dime servicios y montos. Ej: electricidad 45000, internet 28000`;
  }
  if (row.id === 'expense_transport' || /transporte|bencina|metro|bus|uber|peaje/.test(category)) {
    return `Para este movimiento "${row.category}", dime gastos de movilidad. Ej: bencina 90000, metro 35000`;
  }
  if (row.id === 'expense_food' || /alimenta|comida|supermercado|feria|restaurante/.test(category)) {
    return `Para este movimiento "${row.category}", dime gastos de comida. Ej: supermercado 120000, feria 35000`;
  }
  return `Para este movimiento "${row.category}", dime 2-4 gastos reales con monto. Ej: supermercado 120000, farmacia 35000`;
}

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
  const [assistantCoachMessage, setAssistantCoachMessage] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [flyingDots, setFlyingDots] = useState<Array<{ id: number; type: 'income' | 'expense' }>>([]);
  const [activeBudgetRowId, setActiveBudgetRowId] = useState<string | null>(null);
  const [assistantBudgetRowId, setAssistantBudgetRowId] = useState<string | null>(null);
  const [budgetViewMode, setBudgetViewMode] = useState<1 | 2 | 3>(1);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [budgetTableStyle, setBudgetTableStyle] = useState<BudgetTableStyleId>('terminal');
  const [isGeneratingBudgetPdf, setIsGeneratingBudgetPdf] = useState(false);
  const budgetPdfRef = useRef<HTMLDivElement | null>(null);
  const budgetModalRef = useRef<HTMLDivElement | null>(null);
  const budgetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const flyingDotCounter = useRef(0);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initAbortRef = useRef<AbortController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const budgetReplyInputRef = useRef<HTMLInputElement | null>(null);
  const formatBudgetAmount = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const focusBudgetField = (
    target: EventTarget | null,
  ) => {
    const el = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el || typeof el.focus !== 'function') return;
    requestAnimationFrame(() => {
      el.focus();
      if (el instanceof HTMLInputElement && typeof el.select === 'function' && el.type !== 'number') {
        el.select();
      }
    });
  };
  const activeQuestion = assistantQuestion ?? '…';
  const activeStyleIndex = BUDGET_TABLE_STYLES.findIndex((style) => style.id === budgetTableStyle);
  const activeStyleLabel = BUDGET_TABLE_STYLES[Math.max(0, activeStyleIndex)]?.label ?? 'Nocturno';
  const completedRowsCount = props.budgetCompletion.filledRows.length;
  const heroToneClass =
    props.budgetSignals.balanceTone === 'surplus'
      ? 'is-positive'
      : props.budgetSignals.balanceTone === 'deficit'
        ? 'is-negative'
        : 'is-neutral';

  useEffect(() => {
    const check = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktopLayout(desktop);
      // If shrinking to mobile while on mode 3 (desktop-only), fall back to mode 2
      if (!desktop) setBudgetViewMode((prev) => (prev === 3 ? 2 : prev));
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  function moveBudgetView(direction: 'next' | 'prev') {
    const maxMode = isDesktopLayout ? 3 : 2;
    setBudgetViewMode((prev) => {
      if (direction === 'next') return (prev >= maxMode ? 1 : prev + 1) as 1 | 2 | 3;
      return (prev <= 1 ? maxMode : prev - 1) as 1 | 2 | 3;
    });
  }

  // CSS handles layout for desktop modes 2/3 via .is-desktop class — no inline style fights needed
  const carouselStyle: React.CSSProperties = { display: 'block', position: 'relative', height: 'auto', minHeight: 0, overflow: 'visible', padding: '0' };

  function cardStyle(card: 'agent' | 'table'): React.CSSProperties {
    // Desktop modes 2/3: CSS rules with higher specificity take over completely
    if (isDesktopLayout && (budgetViewMode === 2 || budgetViewMode === 3)) {
      return {};
    }
    // Carousel mode: mode 1 = agent front, mode 2/3 on mobile = table front
    const effectiveIsAgentFront = budgetViewMode === 1;
    const isActive = effectiveIsAgentFront ? card === 'agent' : card === 'table';
    const isBackground = effectiveIsAgentFront ? card === 'table' : card === 'agent';
    return {
      position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0,
      width: '100%', maxWidth: '100%', height: '100%', margin: 0,
      opacity: isActive ? 1 : isBackground ? 0.42 : 0,
      transform: isActive ? 'none' : isBackground ? 'translateY(12px) scale(0.985)' : 'translateY(14px) scale(0.97)',
      filter: isActive ? 'none' : isBackground ? 'blur(3px) saturate(0.82)' : 'none',
      pointerEvents: isActive ? 'auto' : 'none',
      zIndex: isActive ? 4 : 3,
      transition: 'opacity 260ms ease, transform 260ms ease, filter 260ms ease',
    };
  }

  const budgetModeClass =
    budgetViewMode === 1
      ? 'agent-front'
      : isDesktopLayout
        ? budgetViewMode === 2
          ? 'split'
          : 'table-only'
        : 'table-front';

  function inferBudgetFocusRowId(question: string | null): string | null {
    const q = String(question ?? '').toLowerCase();
    if (!q || q === '…') return null;
    if (/ingreso|sueldo/.test(q)) return 'income_salary';
    if (/arriendo|vivienda|hogar/.test(q)) return 'expense_rent';
    if (/aliment/.test(q)) return 'expense_food';
    if (/transporte|bencina|metro|uber/.test(q)) return 'expense_transport';
    if (/servicios|luz|agua|internet|telefon/.test(q)) return 'expense_services';
    if (/deuda|cuota|cr[eé]dito/.test(q)) return 'expense_debt';
    if (/ahorr|inviert/.test(q)) return 'expense_savings';
    if (/otros?|gasto adicional|variab/.test(q)) return 'expense_other';
    return null;
  }

  const inferredBudgetRowId = inferBudgetFocusRowId(activeQuestion) ?? null;
  const focusedBudgetRowId = activeBudgetRowId ?? assistantBudgetRowId ?? inferredBudgetRowId;
  const activeBudgetRow = props.budgetRows.find((row) => row.id === focusedBudgetRowId) ?? null;
  function budgetQuestionForId(rowId: string | null) {
    switch (rowId) {
      case 'income_salary':
        return '¿Cuál es tu ingreso mensual promedio en pesos?';
      case 'expense_rent':
        return '¿Cuánto pagas al mes en vivienda o arriendo?';
      case 'expense_food':
        return '¿Cuánto gastas mensualmente en alimentación?';
      case 'expense_transport':
        return '¿Cuánto gastas mensualmente en transporte?';
      case 'expense_services':
        return '¿Cuánto pagas al mes en servicios básicos?';
      case 'expense_debt':
        return '¿Cuánto pagas al mes en deudas o cuotas?';
      case 'expense_savings':
        return '¿Cuánto ahorras o inviertes mensualmente?';
      case 'expense_other':
        return '¿Qué otro gasto mensual recurrente quieres agregar?';
      default:
        return '¿Cuál es tu ingreso mensual promedio en pesos?';
    }
  }
  const fallbackQuestionForCurrentFlow = '¿Qué categoría o monto quieres agregar al presupuesto?';
  const orderedBudgetRows = props.budgetRows;
  function sanitizeBudgetQuestion(question: string) {
    return String(question ?? '').trim();
  }

  useEffect(() => {
    if (activeBudgetRowId && !props.budgetRows.some((row) => row.id === activeBudgetRowId)) {
      setActiveBudgetRowId(null);
    }
  }, [activeBudgetRowId, props.budgetRows]);

  useEffect(() => {
    if (!assistantBudgetRowId) return;
    setActiveBudgetRowId(assistantBudgetRowId);
    const row = document.getElementById(`budget-row-${assistantBudgetRowId}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.animate(
      [
        { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,255,255,0)' },
        { transform: 'scale(1.01)', boxShadow: '0 0 0 2px rgba(255,255,255,0.55)' },
        { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,255,255,0)' },
      ],
      { duration: 650, easing: 'ease-out' },
    );
  }, [assistantBudgetRowId, props.budgetRows]);

  function focusBudgetRow(rowId: string) {
    const row = props.budgetRows.find((r) => r.id === rowId) ?? null;
    const contextualQuestion = (() => {
      if (!row) return null;
      if (
        row.id === 'income_salary' ||
        row.id === 'expense_rent' ||
        row.id === 'expense_food' ||
        row.id === 'expense_transport' ||
        row.id === 'expense_services' ||
        row.id === 'expense_debt' ||
        row.id === 'expense_savings' ||
        row.id === 'expense_other'
      ) {
        return budgetQuestionForId(row.id);
      }
      if (row.type === 'income') {
        return `Para el movimiento "${row.category}", ¿cuál es el monto mensual actual?`;
      }
      return buildRefinementPromptForRow(row);
    })();
    setAssistantBudgetRowId(rowId);
    setActiveBudgetRowId(rowId);
    if (contextualQuestion) setAssistantQuestion(contextualQuestion);
    window.setTimeout(() => {
      document.getElementById(`budget-row-${rowId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  }

  function applyBudgetAction(action: Record<string, unknown> | null | undefined) {
    if (!action || typeof action !== 'object') return;
    const kind = action.kind;
    const rowId = String(action.id ?? '').trim();
    const rowType = action.type === 'income' ? 'income' : action.type === 'expense' ? 'expense' : null;
    const amount = Math.max(0, Math.round(Number(action.amount ?? 0)));
    const category = String(action.category ?? '').trim();
    const detail = String(action.detail ?? '').trim();
    const cadence =
      action.cadence === 'fixed' || action.cadence === 'variable'
        ? action.cadence
        : action.cadence === 'oneoff'
          ? 'variable'
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
          : undefined;
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
          : undefined;
    if (!rowId) return;

    if (kind === 'delete') {
      props.deleteBudgetRow(rowId);
      if (activeBudgetRowId === rowId) setActiveBudgetRowId(null);
      return;
    }
    if (kind !== 'add' && kind !== 'update') return;
    if (!rowType || !category) return;

    const canonicalId = rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
    const row: BudgetRow = {
      id: canonicalId,
      type: rowType,
      category,
      amount,
      detail: detail || undefined,
      cadence,
      paymentMethod,
      movementType,
    };
    props.upsertBudgetRow(row);
    // Animate the updated row directly without touching assistantBudgetRowId (caller sets it for next question)
    window.setTimeout(() => {
      const el = document.getElementById(`budget-row-${row.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.animate(
          [
            { boxShadow: '0 0 0 2px rgba(255,255,255,0.7)', transform: 'scale(1.012)' },
            { boxShadow: '0 0 0 0px rgba(255,255,255,0)', transform: 'scale(1)' },
          ],
          { duration: 600, easing: 'ease-out' },
        );
      }
    }, 80);
    // Trigger flying dot animation
    const dotId = ++flyingDotCounter.current;
    setFlyingDots((prev) => [...prev, { id: dotId, type: rowType }]);
    setTimeout(() => setFlyingDots((prev) => prev.filter((d) => d.id !== dotId)), 750);
  }

  function normalizeActionRowId(rawId: unknown): string | null {
    const rowId = String(rawId ?? '').trim();
    if (!rowId) return null;
    return rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
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
      const html2pdf = (await import('html2pdf.js')).default;
      const exportWidth = Math.max(960, Math.ceil(element.getBoundingClientRect().width));
      const exportHeight = Math.max(
        element.scrollHeight,
        Math.ceil(element.getBoundingClientRect().height),
      );
      const runExport = async (scale: number, lightMode: boolean) => {
        const pdfOptions: Record<string, unknown> = {
          margin: [10, 10, 10, 10],
          filename: 'presupuesto-financieramente.pdf',
          image: { type: 'jpeg', quality: lightMode ? 0.9 : 0.98 },
          html2canvas: {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            windowWidth: exportWidth,
            ...(lightMode
              ? {}
              : {
                  windowHeight: exportHeight,
                  height: exportHeight,
                }),
            scrollX: 0,
            scrollY: 0,
            logging: false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        };
        const worker = html2pdf()
          .set(pdfOptions)
          .from(element);
        const pdfBlob = await worker.outputPdf('blob');
        const fileUrl = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement('a');
        anchor.href = fileUrl;
        anchor.download = 'presupuesto-financieramente.pdf';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(fileUrl), 10_000);
        props.onBudgetPdfSaved?.({
          title: `Presupuesto mensual · ${activeStyleLabel}`,
          fileUrl,
          createdAt: new Date().toISOString(),
        });
      };

      try {
        await runExport(exportHeight > 7000 ? 1.1 : 1.5, false);
      } catch {
        await runExport(1, true);
      }

      setAiError(null);
    } catch {
      setAiError('No se pudo generar el PDF. Intenta nuevamente; si persiste, exporta desde vista compacta.');
    } finally {
      setIsGeneratingBudgetPdf(false);
    }
  }

  function unwrapApiData<T>(payload: any): T | null {
    if (!payload || typeof payload !== 'object') return null;
    if ('data' in payload && payload.ok === true) return (payload.data ?? null) as T | null;
    return payload as T;
  }

  async function handleBudgetAgentReplySubmit() {
    const answer = budgetReply.trim();
    if (!answer || isAskingAI) return;

    const fallbackNextQuestion = fallbackQuestionForCurrentFlow;
    const newChatAnswers = [...props.chatAnswers, { q: activeQuestion, a: answer }];
    props.onChatAnswersChange(newChatAnswers);
    setBudgetReply('');
    setAiError(null);

    // Call AI to get precise row update + next personalized question
    try {
      setIsAskingAI(true);
      replyAbortRef.current?.abort();
      replyAbortRef.current = new AbortController();
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      askingWatchdogRef.current = setTimeout(() => {
        replyAbortRef.current?.abort();
        setIsAskingAI(false);
      }, 12000);
      const csrfToken = getCsrfToken();
      const res = await fetch(`${getApiBaseUrl()}/api/budget-chat`, {
        method: 'POST',
        signal: replyAbortRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
          body: JSON.stringify({
            intent: 'reply',
            question: activeQuestion,
            answer,
            budgetRows: props.budgetRows.slice(0, 30),
            chatAnswers: newChatAnswers.slice(-6),
            products: props.bankProducts ?? [],
            activeRowId: activeBudgetRow?.id ?? null,
            activeRow: activeBudgetRow
                ? {
                    id: activeBudgetRow.id,
                    category: activeBudgetRow.category,
                    type: activeBudgetRow.type,
                    amount: activeBudgetRow.amount,
                    detail: activeBudgetRow.detail ?? null,
                    product: activeBudgetRow.product ?? null,
                    institution: activeBudgetRow.institution ?? null,
                    cadence: activeBudgetRow.cadence ?? null,
                    paymentMethod: activeBudgetRow.paymentMethod ?? null,
                    movementType: activeBudgetRow.movementType ?? null,
                    momentum: activeBudgetRow.momentum ?? null,
                    strategy: activeBudgetRow.strategy ?? null,
                  }
              : null,
            intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
            intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
          }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const payload = unwrapApiData<{
        ok?: boolean;
        actions?: Array<Record<string, unknown>>;
        action?: Record<string, unknown>;
        done?: boolean;
        next_question?: string;
        focus_row_id?: string | null;
        coach_message?: string;
        assistant_reply?: string;
      }>(raw);
      if (payload) {
        const rawActions = payload.actions ?? (payload.action ? [payload.action] : []);
        const lastTouchedRowId = applyBudgetActions(rawActions);
        setConversationDone(Boolean(payload.done));
        setAssistantCoachMessage(typeof payload.coach_message === 'string' ? payload.coach_message : null);
        const explicitFocus = normalizeActionRowId(payload.focus_row_id);
        const replyText =
          typeof payload.assistant_reply === 'string' && payload.assistant_reply.trim()
            ? payload.assistant_reply.trim()
            : typeof payload.next_question === 'string'
              ? payload.next_question.trim()
              : '';
        if (replyText) {
          const safeQuestion = sanitizeBudgetQuestion(replyText);
          const nextQuestion =
            normalizeBudgetText(safeQuestion) === normalizeBudgetText(activeQuestion)
              ? fallbackNextQuestion
              : safeQuestion;
          setAssistantQuestion(nextQuestion);
          setAssistantBudgetRowId(explicitFocus ?? lastTouchedRowId ?? inferBudgetFocusRowId(safeQuestion));
        } else if (lastTouchedRowId || explicitFocus) {
          setAssistantBudgetRowId(explicitFocus ?? lastTouchedRowId);
        }
      } else {
        setAssistantQuestion(fallbackNextQuestion);
        setAssistantBudgetRowId(inferBudgetFocusRowId(fallbackNextQuestion));
        setAssistantCoachMessage(null);
      }
    } catch {
      setAssistantQuestion(fallbackNextQuestion);
      setAssistantBudgetRowId(inferBudgetFocusRowId(fallbackNextQuestion));
      setAssistantCoachMessage(null);
      setAiError('Sin conexión con IA — fila guardada con categoría estimada.');
    } finally {
      if (askingWatchdogRef.current) {
        clearTimeout(askingWatchdogRef.current);
        askingWatchdogRef.current = null;
      }
      setIsAskingAI(false);
    }
  }

  useEffect(
    () => () => {
      if (askingWatchdogRef.current) clearTimeout(askingWatchdogRef.current);
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
      initAbortRef.current?.abort();
      replyAbortRef.current?.abort();
    },
    [],
  );

  // On open: reset conversation and fetch first personalized question from AI
  useEffect(() => {
    if (!props.isOpen) return;
    setBudgetViewMode(1);
    const budgetRowsForInit = props.budgetRows.slice(0, 30);
    setBudgetReply('');
    setConversationDone(false);
    setAiError(null);
    setAssistantQuestion(null);
    setAssistantCoachMessage(null);
    setIsInitializing(true);
    setActiveBudgetRowId(null);
    setAssistantBudgetRowId(null);

    initAbortRef.current?.abort();
    initAbortRef.current = new AbortController();
    const initSignal = initAbortRef.current.signal;

    void (async () => {
      try {
        const csrfToken = getCsrfToken();
        const res = await fetch(`${getApiBaseUrl()}/api/budget-chat`, {
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
            chatAnswers: props.chatAnswers.slice(-6),
            products: props.bankProducts ?? [],
            activeRowId: activeBudgetRow?.id ?? null,
            activeRow: activeBudgetRow
                ? {
                    id: activeBudgetRow.id,
                    category: activeBudgetRow.category,
                    type: activeBudgetRow.type,
                    amount: activeBudgetRow.amount,
                    detail: activeBudgetRow.detail ?? null,
                    product: activeBudgetRow.product ?? null,
                    institution: activeBudgetRow.institution ?? null,
                    cadence: activeBudgetRow.cadence ?? null,
                    paymentMethod: activeBudgetRow.paymentMethod ?? null,
                    movementType: activeBudgetRow.movementType ?? null,
                    momentum: activeBudgetRow.momentum ?? null,
                    strategy: activeBudgetRow.strategy ?? null,
                  }
              : null,
            intakeContext: props.sessionInfo?.injectedIntake?.intakeContext ?? null,
            intakeData: props.sessionInfo?.injectedIntake?.intake ?? null,
          }),
        });
        const raw = res.ok ? await res.json() : null;
        const payload = unwrapApiData<{
          next_question?: string;
          focus_row_id?: string | null;
          coach_message?: string;
          assistant_reply?: string;
        }>(raw);
        const initReply = payload?.assistant_reply || payload?.next_question || '';
        if (initReply) {
          const safeQuestion = sanitizeBudgetQuestion(initReply);
          const nextQuestion =
            normalizeBudgetText(safeQuestion) === normalizeBudgetText(activeQuestion)
              ? budgetQuestionForId('income_salary')
              : safeQuestion;
          setAssistantQuestion(nextQuestion);
          setAssistantBudgetRowId(payload?.focus_row_id ?? inferBudgetFocusRowId(safeQuestion));
          setAssistantCoachMessage(typeof payload?.coach_message === 'string' ? payload.coach_message : null);
        } else {
          setAssistantQuestion(budgetQuestionForId('income_salary'));
          setAssistantBudgetRowId('income_salary');
          setAssistantCoachMessage(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAssistantQuestion(budgetQuestionForId('income_salary'));
        setAssistantBudgetRowId('income_salary');
        setAssistantCoachMessage(null);
      } finally {
        if (!initSignal.aborted) setIsInitializing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen || !isDesktopLayout) return;
    const timer = window.setTimeout(() => {
      budgetReplyInputRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [props.isOpen, isDesktopLayout]);


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
    return { ['--row-bg' as any]: bg };
  }

  useEffect(() => {
    if (!props.isOpen) return;

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
      const focusables = getBudgetFocusable();
      (focusables[0] ?? budgetModalRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
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
  }, [props.isOpen, props.onClose]);

  if (!props.isOpen) return null;

  return (
    <div className="agent-modal-overlay budget-modal-overlay" onClick={props.onClose}>
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

          {/* Desktop-only mode tabs — sit above the carousel, below on mobile (hidden) */}
          <div className="budget-mode-tabs" aria-label="Modo de presupuesto">
            <button
              type="button"
              className={`budget-mode-tab${budgetViewMode === 1 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(1)}
            >
              Asistente
            </button>
            <button
              type="button"
              className={`budget-mode-tab${budgetViewMode === 2 ? ' is-active' : ''}`}
              onClick={() => setBudgetViewMode(2)}
            >
              {isDesktopLayout ? 'Asistente + Tabla' : 'Tabla'}
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
            className={`budget-executive-grid budget-main-carousel mode-${budgetModeClass}${isDesktopLayout ? ' is-desktop' : ''}`}
            style={carouselStyle}
          >
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
            <section
              data-main-card="agent"
              className="budget-assistant-panel budget-card-agent"
              style={cardStyle('agent')}
            >
              <div className="bcc-hero">
                <div className="bcc-hero-top">
                  <div className="bcc-hero-label-row">
                    <span className="bcc-hero-label">Asistente de presupuesto</span>
                    {props.sessionInfo?.injectedIntake && <span className="bcc-hero-pill">Perfil activo</span>}
                    {isAskingAI && (
                      <span className="bcc-hero-thinking">
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                        <span className="bcc-dot-pulse" />
                      </span>
                    )}
                  </div>
                  <p className="bcc-hero-question">
                    {isInitializing ? 'Preparando conversación con contexto de tabla…' : isAskingAI ? 'Analizando tabla y mensaje…' : activeQuestion}
                  </p>
                  {conversationDone && (
                    <p className="bcc-hero-done">✓ Presupuesto completo — puedes ajustar la tabla cuando quieras.</p>
                  )}
                  {assistantCoachMessage && <p className="bcc-hero-coach">{assistantCoachMessage}</p>}
                  {props.coachHint && !assistantCoachMessage && !conversationDone && (
                    <p className="bcc-hero-tip">{props.coachHint}</p>
                  )}
                </div>

                <div className="bcc-hero-input-wrap">
                  <input
                    ref={budgetReplyInputRef}
                    className="bcc-hero-input"
                    value={budgetReply}
                    onChange={(e) => setBudgetReply(e.target.value)}
                    placeholder="Habla con el agente o pídele modificar la tabla"
                    autoFocus
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
                    <span className="bcc-hero-send-icon" aria-hidden="true">➤</span>
                  </button>
                </div>

                {aiError && <p className="bcc-hero-error">{aiError}</p>}

                <div className="budget-quick-actions budget-agent-actions">
                  <button type="button" className="button-primary" onClick={props.sendBudgetToAgent}>Inyectar a Financieramente</button>
                </div>
              </div>
            </section>

            <section
              data-main-card="table"
              className="budget-table-section budget-card-table"
              style={cardStyle('table')}
            >
              <div className="budget-table-head">
                <div>
                  <span className="budget-section-eyebrow">Tabla</span>
                  <h4>Presupuesto mensual</h4>
                  <p className="budget-table-help">
                    Completa Movimiento, Tipo, Monto, Recurrencia, Medio de pago y Tipo de movimiento. Impacto se calcula automático por fila.
                  </p>
                </div>
                <div className="budget-table-top-actions">
                  <button type="button" className="continue-ghost is-income-action" onClick={() => props.addBudgetRow('income')}>Ingreso</button>
                  <button type="button" className="continue-ghost is-expense-action" onClick={() => props.addBudgetRow('expense')}>Gasto</button>
                </div>
              </div>

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
                />
              ) : (
                <div className="budget-empty-state">
                  <strong>No hay filas todavía.</strong>
                  <p>Cargando estructura base de presupuesto…</p>
                </div>
              )}
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

type TxWizardStep = 'products' | 'credentials' | 'upload' | 'dashboard';
type TxUploadOnboardingStep = 'format' | 'details' | 'upload';
type BankProduct = {
  id: string; label: string; bank: string; simulationAccepted: boolean; connected: boolean; randomMode: boolean;
  assistant?: {
    messages: Array<{
      id: string;
      role: 'assistant' | 'user';
      text: string;
      createdAt: string;
      attachments?: string[];
    }>;
    uploadFormat?: 'photos' | 'pdf' | 'spreadsheet' | 'text' | null;
    summaryText?: string | null;
    summaryModel?: string | null;
    summaryGeneratedAt?: string | null;
    summaryRegenerationsUsed?: number;
    lastSummaryFeedback?: string | null;
  };
  productType: 'credit_card' | 'debit_account' | 'checking_account' | 'savings_account' | 'consumer_loan' | 'mortgage' | 'investment_account';
  uploadedFiles: string[];
  parsedDocuments: Array<{
    documentId?: string;
    name: string;
    text: string;
    summary?: unknown;
    structuredData?: unknown;
    insight?: {
      format?: string;
      reliability?: number;
      extracted_rows?: number;
      key_findings?: string[];
    };
  }>;
  dashboard?: {
    period?: { from?: string; to?: string };
    currency?: string;
    keyMetrics?: {
      inflows_total: number;
      outflows_total: number;
      net_flow: number;
      avg_movement: number;
      movement_count: number;
      median_movement?: number;
      p90_movement?: number;
      max_income?: number;
      max_expense?: number;
      expense_to_income_ratio?: number;
      table_rows_processed?: number;
      movement_coverage_pct?: number;
      table_rows_verified?: number;
      high_confidence_movement_count?: number;
    };
    topCategories?: Array<{ name: string; amount: number }>;
    categoryExamples?: Array<{ name: string; amount: number; examples: string[] }>;
    spendClusters?: Array<{
      name: string;
      amount: number;
      tx_count: number;
      avg_ticket: number;
      share_pct: number;
      examples: string[];
    }>;
    topExpenses?: Array<{ label: string; amount: number; date?: string }>;
    topIncome?: Array<{ label: string; amount: number; date?: string }>;
    alerts?: string[];
    alertDetails?: Array<{ title: string; severity: 'high' | 'medium' | 'low'; reason: string }>;
    opportunities?: string[];
    metricExplanations?: Array<{ metric: string; value: string; explanation: string }>;
    movements?: Array<{
      date?: string;
      description: string;
      amount: number;
      direction: 'expense' | 'income';
      source_line?: string;
      category?: string;
      confidence?: number;
      source_kind?: 'table' | 'line';
    }>;
    summary?: string;
  };
};

type UploadStatementResult = {
  documents: Array<{
    name: string;
    text: string;
    summary?: unknown;
    structuredData?: unknown;
    insight?: {
      format?: string;
      reliability?: number;
      extracted_rows?: number;
      key_findings?: string[];
    };
  }>;
  dashboard?: BankProduct['dashboard'];
  product: {
    bank: string;
    label: string;
    productType: BankProduct['productType'];
  };
};

const CHILEAN_PRODUCT_TEMPLATES: Array<{
  label: string;
  productType: BankProduct['productType'];
}> = [
  { label: 'Cuenta corriente', productType: 'checking_account' },
  { label: 'Cuenta vista', productType: 'debit_account' },
  { label: 'Cuenta RUT', productType: 'debit_account' },
  { label: 'Tarjeta de débito', productType: 'debit_account' },
  { label: 'Tarjeta de crédito', productType: 'credit_card' },
  { label: 'Línea de crédito', productType: 'consumer_loan' },
  { label: 'Crédito de consumo', productType: 'consumer_loan' },
  { label: 'Crédito automotriz', productType: 'consumer_loan' },
  { label: 'Crédito hipotecario', productType: 'mortgage' },
  { label: 'Cuenta de ahorro', productType: 'savings_account' },
  { label: 'Depósito a plazo', productType: 'savings_account' },
  { label: 'Fondo mutuo', productType: 'investment_account' },
  { label: 'Cuenta 2 / ahorro previsional voluntario', productType: 'investment_account' },
  { label: 'APV', productType: 'investment_account' },
  { label: 'Cuenta de inversión / brokerage', productType: 'investment_account' },
  { label: 'Billetera prepago', productType: 'debit_account' },
  { label: 'Cuenta empresa / pyme', productType: 'checking_account' },
  { label: 'POS / adquirencia comercio', productType: 'checking_account' },
  { label: 'Remesas / cuenta global', productType: 'debit_account' },
  { label: 'Seguros', productType: 'investment_account' },
  { label: 'Acciones / ETF', productType: 'investment_account' },
] as const;

function mapServiceToProductType(serviceId: string): BankProduct['productType'] {
  if (serviceId === 'credit-card') return 'credit_card';
  if (serviceId === 'debit-card' || serviceId === 'vista-account') return 'debit_account';
  if (serviceId === 'checking-account') return 'checking_account';
  if (serviceId === 'consumer-loan' || serviceId === 'line-of-credit' || serviceId === 'auto-loan') return 'consumer_loan';
  if (serviceId === 'mortgage-loan') return 'mortgage';
  if (serviceId === 'term-deposit') return 'savings_account';
  return 'investment_account';
}

const SERVICE_TEMPLATES = FINANCIAL_SERVICE_OPTIONS.map((service) => ({
  label: service.label,
  productType: mapServiceToProductType(service.id),
}));

const ALL_PRODUCT_TEMPLATES: Array<{
  label: string;
  productType: BankProduct['productType'];
}> = [...CHILEAN_PRODUCT_TEMPLATES, ...SERVICE_TEMPLATES].filter(
  (item, idx, arr) => arr.findIndex((other) => other.label.toLowerCase() === item.label.toLowerCase()) === idx
);

export function TransactionsModal(props: {
  isOpen: boolean;
  onClose: () => void;
  txWizardStep: TxWizardStep;
  setTxWizardStep: (step: TxWizardStep) => void;
  bankSimulationProductsCount: number;
  transactionIntel: { docs: number; amounts: number[]; summary: string; topKeywords: Array<{ label: string; count: number }>; averageDetected: number; maxDetected: number; totalDetected: number; rows: number };
  activeBankProduct: BankProduct | null;
  transactionProductCards: Array<{ product: BankProduct; descriptor: { title: string; description: string; insights: string[]; themeColor: string }; intel: { docs: number; amounts: number[] } }>;
  selectedProductId: string | null;
  selectTransactionProduct: (id: string) => void;
  deleteTransactionProduct: (id: string) => void;
  addTransactionProduct: () => void;
  updateActiveProduct: (patch: Partial<BankProduct>) => void;
  simulateBankLogin: (config?: {
    bank?: string;
    label?: string;
    productType?: BankProduct['productType'];
    simulationAccepted?: boolean;
  }) => void;
  onUploadStatement: (files: File[] | FileList | null) => Promise<UploadStatementResult | null>;
  documentsLoading: boolean;
  transactionUploadError?: string | null;
  sendTransactionsToAgent: () => void;
  saveTransactionProductForBatch: () => void;
  savedProductIds: string[];
  maxProducts: number;
  maxEvidenceFilesPerProduct: number;
  maxRecreations: number;
  recreationUsed: number;
  creationNotice?: string | null;
}) {
  const TX_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
  const TX_MAX_TOTAL_FILE_BYTES = 35 * 1024 * 1024;
  const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace('#', '').trim();
    if (!/^[\da-f]{6}$/i.test(normalized)) return `rgba(59, 91, 122, ${alpha})`;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<File[]>([]);
  const [manualEvidenceDraft, setManualEvidenceDraft] = useState('');
  const [txAssistantInput, setTxAssistantInput] = useState('');
  const [txAssistantLoading, setTxAssistantLoading] = useState(false);
  const [txAssistantError, setTxAssistantError] = useState<string | null>(null);
  const [showInjectProductsConfirm, setShowInjectProductsConfirm] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const transactionsModalRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const txSendLockRef = useRef(false);
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: props.activeBankProduct?.dashboard?.currency || 'CLP',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  const dashboardMetrics = props.activeBankProduct?.dashboard?.keyMetrics;
  const isCreditCardProduct = props.activeBankProduct?.productType === 'credit_card';
  const dashboardCategories = props.activeBankProduct?.dashboard?.topCategories ?? [];
  const dashboardClusters = props.activeBankProduct?.dashboard?.spendClusters ?? [];
  const alertDetails = props.activeBankProduct?.dashboard?.alertDetails ?? [];
  const metricExplanations = props.activeBankProduct?.dashboard?.metricExplanations ?? [];
  const dashboardPeriod = props.activeBankProduct?.dashboard?.period;
  const documentQualityRows = (props.activeBankProduct?.parsedDocuments ?? [])
    .filter((doc) => doc.insight)
    .map((doc) => ({
      name: doc.name,
      reliabilityPct: Math.round((doc.insight?.reliability ?? 0) * 100),
      extractedRows: Number(doc.insight?.extracted_rows ?? 0),
      findings: Array.isArray(doc.insight?.key_findings) ? doc.insight!.key_findings!.slice(0, 3) : [],
    }));
  const qualityAverage =
    documentQualityRows.length > 0
      ? Math.round(
          documentQualityRows.reduce((acc, item) => acc + item.reliabilityPct, 0) /
            documentQualityRows.length,
        )
      : 0;
  const totalCategoryAmount = dashboardCategories.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const categoryShareData = dashboardCategories.slice(0, 6).map((category) => ({
    category: category.name,
    amount: category.amount,
    share: totalCategoryAmount > 0 ? Number(((category.amount / totalCategoryAmount) * 100).toFixed(2)) : 0,
  }));
  const qualityRowsChart = documentQualityRows.map((row) => ({
    document: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
    reliability: row.reliabilityPct,
    rows: row.extractedRows,
  }));
  const normalizeMovementText = (value: string) =>
    value
      .toUpperCase()
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, ' ')
      .replace(/\b(?:INTERNET|CENTRAL)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const isMissingDate = (value?: string | null) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized.length === 0 || normalized === 'N/D' || normalized === 'ND';
  };
  const extractDateTokens = (value: string): string[] => {
    const source = String(value ?? '').trim();
    if (!source) return [];
    const tokens = new Set<string>();
    const isoMatch = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      const mm = isoMatch[2];
      const dd = isoMatch[3];
      tokens.add(`${dd}/${mm}`);
      tokens.add(`${isoMatch[1]}-${mm}-${dd}`);
    }
    const dmMatch = source.match(/\b(\d{2})[/-](\d{2})(?:[/-](\d{2,4}))?\b/);
    if (dmMatch) {
      const dd = dmMatch[1];
      const mm = dmMatch[2];
      tokens.add(`${dd}/${mm}`);
      if (dmMatch[3]) {
        const yyyy = dmMatch[3].length === 2 ? `20${dmMatch[3]}` : dmMatch[3];
        tokens.add(`${yyyy}-${mm}-${dd}`);
      }
    }
    return Array.from(tokens);
  };
  const buildDedupKey = (dateToken: string, direction: 'income' | 'expense', amountAbs: number, label: string) =>
    `${dateToken}|${direction}|${Math.round(amountAbs)}|${normalizeMovementText(label)}`;
  const dashboardMovements = (props.activeBankProduct?.dashboard?.movements ?? []).map((movement) => ({
    label: movement.description,
    amount: Number(movement.amount) || 0,
    direction: movement.direction,
    date: movement.date ?? '',
    sourceLine: movement.source_line ?? '',
    category: movement.category ?? '',
    confidence: Number(movement.confidence ?? 0) || 0,
    sourceKind: movement.source_kind ?? 'line',
  }));
  const topMovements = [...dashboardMovements].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    if (a.direction !== b.direction) return a.direction === 'expense' ? -1 : 1;
    return a.label.localeCompare(b.label, 'es');
  });
  const movementTableRows = dashboardMovements.length > 0 ? dashboardMovements : topMovements;
  const normalizedMovementRows = movementTableRows.map((movement) => {
    const rawAmount = Number(movement.amount) || 0;
    const hasDeclaredDirection = movement.direction === 'income' || movement.direction === 'expense';
    const normalizedDirection = hasDeclaredDirection
      ? movement.direction
      : rawAmount < 0
        ? 'expense'
        : rawAmount > 0
          ? 'income'
          : 'expense';
    return {
      ...movement,
      rawAmount,
      directionForTotals: normalizedDirection,
      amount: Math.abs(rawAmount),
    };
  });
  const datedMovementKeys = new Set<string>();
  normalizedMovementRows.forEach((movement) => {
    if (isMissingDate(movement.date)) return;
    const explicitDateTokens = extractDateTokens(movement.date);
    if (explicitDateTokens.length === 0) return;
    explicitDateTokens.forEach((token) => {
      datedMovementKeys.add(buildDedupKey(token, movement.directionForTotals, movement.amount, movement.label));
    });
  });
  const dedupedMovementRows = normalizedMovementRows.filter((movement) => {
    if (!isMissingDate(movement.date)) return true;
    const embeddedDateTokens = extractDateTokens(movement.label);
    if (embeddedDateTokens.length === 0) return true;
    const hasDatedTwin = embeddedDateTokens.some((token) =>
      datedMovementKeys.has(buildDedupKey(token, movement.directionForTotals, movement.amount, movement.label))
    );
    return !hasDatedTwin;
  });
  const incomeOrAbonoRows = dedupedMovementRows.filter((movement) => movement.directionForTotals === 'income');
  const expenseRows = dedupedMovementRows.filter((movement) => movement.directionForTotals === 'expense');
  const incomeOrAbonoTotal = incomeOrAbonoRows.reduce((acc, movement) => acc + movement.amount, 0);
  const expenseTotal = expenseRows.reduce((acc, movement) => acc + movement.amount, 0);
  const tableDerivedMetrics = dedupedMovementRows.reduce(
    (acc, movement) => {
      if (movement.directionForTotals === 'income') {
        acc.inflowsTotal += movement.amount;
      } else {
        acc.outflowsTotal += movement.amount;
      }
      return acc;
    },
    { inflowsTotal: 0, outflowsTotal: 0 },
  );
  const movementCount = dedupedMovementRows.length;
  const netFlowFromTable = tableDerivedMetrics.inflowsTotal - tableDerivedMetrics.outflowsTotal;
  const avgMovementFromTable = movementCount > 0 ? (tableDerivedMetrics.inflowsTotal + tableDerivedMetrics.outflowsTotal) / movementCount : 0;
  const flowRatioFromTable = tableDerivedMetrics.inflowsTotal > 0 ? tableDerivedMetrics.outflowsTotal / tableDerivedMetrics.inflowsTotal : 0;
  const datedRows = dedupedMovementRows
    .map((movement) => movement.date?.trim() ?? '')
    .filter((date) => date.length > 0)
    .sort((a, b) => a.localeCompare(b, 'es'));
  const tablePeriod = {
    from: datedRows[0] || dashboardPeriod?.from || 'N/D',
    to: datedRows[datedRows.length - 1] || dashboardPeriod?.to || 'N/D',
  };
  const summaryFromTable =
    movementCount > 0
      ? `Se analizaron ${movementCount.toLocaleString('es-CL')} movimientos sobre cartola de ${isCreditCardProduct ? 'tarjeta' : 'producto'}. Totales detectados desde tabla extraída: ${formatCurrency(tableDerivedMetrics.outflowsTotal)} en egresos y ${formatCurrency(tableDerivedMetrics.inflowsTotal)} en ${isCreditCardProduct ? 'abonos' : 'ingresos'}; flujo neto ${formatCurrency(netFlowFromTable)}.`
      : 'Aún no hay suficientes filas extraídas para construir un resumen analítico confiable.';
  const verifiedTableRows = Number(dashboardMetrics?.table_rows_verified ?? 0) || dedupedMovementRows.filter((movement) => movement.sourceKind === 'table').length;
  const highConfidenceMovementCount = Number(dashboardMetrics?.high_confidence_movement_count ?? 0) || dedupedMovementRows.filter((movement) => (movement.confidence ?? 0) >= 0.85).length;
  const movementCoverageDisplay =
    Number(dashboardMetrics?.movement_coverage_pct ?? 0) > 0
      ? Number(dashboardMetrics?.movement_coverage_pct ?? 0)
      : movementCount > 0 && dashboardMetrics?.table_rows_processed && dashboardMetrics.table_rows_processed > 0
        ? Math.min(100, (movementCount / dashboardMetrics.table_rows_processed) * 100)
        : 0;
  const enrichedCategoryData = useMemo(() => {
    const byCategory = new Map<string, { amount: number; count: number }>();
    dedupedMovementRows
      .filter((movement) => movement.directionForTotals === 'expense')
      .forEach((movement) => {
        const key = movement.category?.trim() || 'Otros';
        const current = byCategory.get(key) ?? { amount: 0, count: 0 };
        current.amount += movement.amount;
        current.count += 1;
        byCategory.set(key, current);
      });
    return Array.from(byCategory.entries())
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        count: data.count,
        share: expenseTotal > 0 ? (data.amount / expenseTotal) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 6);
  }, [dedupedMovementRows, expenseTotal]);
  const txNarrative = useMemo(() => {
    const dominantCategory = enrichedCategoryData[0];
    const concentration = dominantCategory?.share ?? 0;
    const fidelityPct = movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0;
    const confidencePct = movementCount > 0 ? (highConfidenceMovementCount / movementCount) * 100 : 0;
    const largestExpense = expenseRows[0];
    const largestIncome = incomeOrAbonoRows[0];
    return {
      marketAngle:
        dominantCategory && concentration >= 28
          ? `${dominantCategory.name} está marcando el ritmo del período con ${formatPercentCompact(concentration)} del gasto detectado.`
          : 'El gasto está más repartido, sin una sola categoría dominando de forma extrema.',
      fidelityAngle:
        fidelityPct >= 70
          ? `La lectura es mayoritariamente tabular: ${formatPercentCompact(fidelityPct)} de los movimientos proviene de filas estructuradas.`
          : 'Una parte relevante del análisis todavía depende de texto libre; conviene reforzar cartolas nítidas o planillas.',
      confidenceAngle:
        confidencePct >= 75
          ? `La muestra viene sólida: ${formatPercentCompact(confidencePct)} de los movimientos quedó en banda alta/media-alta de confianza.`
          : 'La confianza del set todavía es mixta; el resumen debe leerse con cautela operativa.',
      cashAngle:
        netFlowFromTable >= 0
          ? `El flujo neto quedó positivo en ${formatCurrency(netFlowFromTable)}.`
          : `El flujo neto quedó presionado en ${formatCurrency(netFlowFromTable)}.`,
      anchors: [largestExpense?.label, largestIncome?.label].filter(Boolean) as string[],
    };
  }, [enrichedCategoryData, movementCount, verifiedTableRows, highConfidenceMovementCount, expenseRows, incomeOrAbonoRows, netFlowFromTable, formatCurrency]);
  const categoryChartData =
    enrichedCategoryData.length > 0
      ? enrichedCategoryData.map((category) => ({
          category: category.name,
          amount: category.amount,
          share: Number(category.share.toFixed(2)),
        }))
      : categoryShareData;
  const [showAllMovements, setShowAllMovements] = useState(false);

  const [quickBank, setQuickBank] = useState('');
  const [productTemplate, setProductTemplate] = useState('');
  const [showInstitutionCatalog, setShowInstitutionCatalog] = useState(false);
  const [showTemplateCatalog, setShowTemplateCatalog] = useState(false);
  const [showTxCarousel, setShowTxCarousel] = useState(false);
  const [recentlyDockedProductId, setRecentlyDockedProductId] = useState<string | null>(null);
  const [isDockingToLibrary, setIsDockingToLibrary] = useState(false);
  const [dockTransitionPhase, setDockTransitionPhase] = useState<TxDockTransitionPhase>('idle');
  const [transitionPulse, setTransitionPulse] = useState(0);
  const [txSummaryScrollDepth, setTxSummaryScrollDepth] = useState(0);
  const [txUploadOnboardingStep, setTxUploadOnboardingStep] = useState<TxUploadOnboardingStep>('format');
  const PRODUCT_STACK_PALETTE = ['#3b5068', '#6e2929', '#9e7228', '#364818', '#111111'] as const;
  const PRODUCT_STACK_TEXT_PALETTE = ['#8ea7bf', '#c89191', '#d8b266', '#86a06f', '#111111'] as const;
  const productStackColor = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
    return PRODUCT_STACK_PALETTE[Math.abs(hash) % PRODUCT_STACK_PALETTE.length];
  };
  const productVisualPalette = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    const glowHue = (hue + 24) % 360;
    return {
      base: `hsl(${hue} 44% 22%)`,
      glow: `hsla(${glowHue} 90% 70% / 0.26)`,
      edge: `hsla(${hue} 86% 84% / 0.2)`,
      tint: `hsla(${glowHue} 100% 95% / 0.94)`,
    };
  };
  const groupCarouselRef = useRef<HTMLDivElement | null>(null);
  const insightCarouselRef = useRef<HTMLDivElement | null>(null);
  const txSummaryScrollRef = useRef<HTMLDivElement | null>(null);
  const previousConnectedRef = useRef<Record<string, boolean>>({});
  const dockTransitionTimersRef = useRef<number[]>([]);
  const selectedTemplate = ALL_PRODUCT_TEMPLATES.find((item) => item.label === productTemplate);
  const derivedProductType: BankProduct['productType'] =
    selectedTemplate?.productType ??
    props.activeBankProduct?.productType ??
    'credit_card';

  const txCardLikeTypes: Array<BankProduct['productType']> = [
    'credit_card',
    'debit_account',
    'checking_account',
    'savings_account',
  ];
  const isCardLikeProduct = txCardLikeTypes.includes(derivedProductType);
  const txVisualStage =
    props.txWizardStep === 'upload' ? 'evidence' : props.txWizardStep === 'dashboard' ? 'analyst' : 'consent';
  const txVisualScale =
    txVisualStage === 'consent' ? 1 : txVisualStage === 'evidence' ? 0.9 : 0.82;
  const txVisualY =
    txVisualStage === 'consent'
      ? 0
      : txVisualStage === 'evidence'
        ? -22
        : Math.round(10 + txSummaryScrollDepth * 72);
  const txVisualRotateX =
    txVisualStage === 'consent'
      ? 14
      : txVisualStage === 'evidence'
        ? 10
        : Math.max(-6, 6 - txSummaryScrollDepth * 26);
  const txVisualRotateY =
    txVisualStage === 'consent'
      ? -10
      : txVisualStage === 'evidence'
        ? -4
        : Math.min(4, -2 + txSummaryScrollDepth * 8);
  const txVisualTone =
    derivedProductType === 'credit_card'
      ? 'is-credit'
      : derivedProductType === 'debit_account' || derivedProductType === 'checking_account'
        ? 'is-account'
        : 'is-generic';

  const resolvedBank = quickBank.trim();
  const resolvedProductLabel = productTemplate.trim();
  const activeProductVisualPalette = productVisualPalette(
    `${props.activeBankProduct?.id ?? 'active'}-${resolvedProductLabel || props.activeBankProduct?.label || 'producto'}-${resolvedBank || props.activeBankProduct?.bank || 'bank'}`
  );

  const currentStage: 'consent' | 'evidence' | 'analyst' =
    props.txWizardStep === 'upload' ? 'evidence' : props.txWizardStep === 'dashboard' ? 'analyst' : 'consent';

  const applyOnboarding = () => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      label: resolvedProductLabel,
      bank: resolvedBank,
      productType: derivedProductType,
      connected: Boolean(resolvedBank) && consentAccepted,
      randomMode: false,
    });
  };

  const requiredEvidenceText =
    derivedProductType === 'credit_card'
      ? 'Obligatorio: cartola de tarjeta (imagen o PDF). También puedes agregar un antecedente escrito manual si no quieres subir fotos.'
      : 'Recomendado: estado de cuenta/cartola en imagen, PDF, Excel o CSV. También puedes pegar un antecedente escrito manual.';

  const appendPendingEvidence = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (analysisAlreadyDone) {
      setTxAssistantError('Este producto ya fue analizado. Para nuevos antecedentes debes recrear el producto.');
      return;
    }
    const availableSlots = Math.max(
      0,
      props.maxEvidenceFilesPerProduct - (props.activeBankProduct?.uploadedFiles.length ?? 0),
    );
    if (availableSlots <= 0) {
      setTxAssistantError(
        `Este producto ya alcanzó el límite de ${props.maxEvidenceFilesPerProduct} archivos.`,
      );
      return;
    }
    const next = Array.from(files);
    const merged = [...pendingEvidenceFiles];
    const oversizeNames: string[] = [];
    let exceededSlots = false;
    let exceededTotalBytes = false;
    let rollingBytes = merged.reduce((acc, file) => acc + file.size, 0);

    for (const file of next) {
      if (file.size > TX_MAX_SINGLE_FILE_BYTES) {
        oversizeNames.push(file.name);
        continue;
      }
      if (merged.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
      if (merged.length >= availableSlots) {
        exceededSlots = true;
        continue;
      }
      if (rollingBytes + file.size > TX_MAX_TOTAL_FILE_BYTES) {
        exceededTotalBytes = true;
        continue;
      }
      merged.push(file);
      rollingBytes += file.size;
    }

    setPendingEvidenceFiles(merged);

    const notices: string[] = [];
    if (oversizeNames.length > 0) {
      const mbLimit = Math.round(TX_MAX_SINGLE_FILE_BYTES / (1024 * 1024));
      const preview = oversizeNames.slice(0, 2).join(', ');
      notices.push(
        `Algunos archivos superan ${mbLimit} MB por archivo (${preview}${oversizeNames.length > 2 ? ', ...' : ''}).`,
      );
    }
    if (exceededTotalBytes) {
      const mbLimit = Math.round(TX_MAX_TOTAL_FILE_BYTES / (1024 * 1024));
      notices.push(`El total adjunto no puede superar ${mbLimit} MB.`);
    }
    if (exceededSlots) {
      notices.push(`Límite por producto: ${props.maxEvidenceFilesPerProduct} archivos.`);
    }
    setTxAssistantError(notices.length > 0 ? notices.join(' ') : null);
  };

  const clearPendingEvidence = () => {
    setPendingEvidenceFiles([]);
    setManualEvidenceDraft('');
  };

  const assistantMessages = props.activeBankProduct?.assistant?.messages ?? [];
  const summaryText = props.activeBankProduct?.assistant?.summaryText ?? null;
  const summaryGeneratedAt = props.activeBankProduct?.assistant?.summaryGeneratedAt ?? null;
  const summaryModel = props.activeBankProduct?.assistant?.summaryModel ?? null;
  const summaryRegenerationsUsed = Math.max(0, props.activeBankProduct?.assistant?.summaryRegenerationsUsed ?? 0);
  const summaryRegenerationsLeft = Math.max(0, 3 - summaryRegenerationsUsed);
  const selectedUploadFormat = props.activeBankProduct?.assistant?.uploadFormat ?? null;
  const hasSummary = Boolean(summaryText?.trim());
  const processingModeLabel = props.documentsLoading ? 'Procesando evidencia' : 'Pensando respuesta';
  const processingMetaLabel = props.documentsLoading ? 'OCR, normalización y conciliación' : 'Contexto, consistencia y respuesta';
  const processingPrimaryCopy = props.documentsLoading
    ? 'Leyendo archivos, detectando montos y consolidando movimientos.'
    : 'Revisando contexto del producto para responder mejor.';
  const processingSteps = props.documentsLoading
    ? ['Ingesta', 'Extracción', 'Validación']
    : ['Contexto', 'Consistencia', 'Respuesta'];

  const appendAssistantMessages = (
    nextMessages: Array<{ role: 'assistant' | 'user'; text: string; attachments?: string[] }>,
    extraPatch?: Partial<NonNullable<BankProduct['assistant']>>,
  ) => {
    if (!props.activeBankProduct || nextMessages.length === 0) return;
    const baseMessages = props.activeBankProduct.assistant?.messages ?? [];
    props.updateActiveProduct({
      assistant: {
        messages: [
          ...baseMessages,
          ...nextMessages.map((message, index) => ({
            id: `${Date.now()}-${index}-${message.role}`,
            role: message.role,
            text: message.text,
            createdAt: new Date().toISOString(),
            attachments: message.attachments,
          })),
        ],
        uploadFormat: props.activeBankProduct.assistant?.uploadFormat ?? null,
        summaryText: props.activeBankProduct.assistant?.summaryText ?? null,
        summaryModel: props.activeBankProduct.assistant?.summaryModel ?? null,
        summaryGeneratedAt: props.activeBankProduct.assistant?.summaryGeneratedAt ?? null,
        summaryRegenerationsUsed: props.activeBankProduct.assistant?.summaryRegenerationsUsed ?? 0,
        lastSummaryFeedback: props.activeBankProduct.assistant?.lastSummaryFeedback ?? null,
        ...extraPatch,
      },
    });
  };
  const patchAssistant = (extraPatch: Partial<NonNullable<BankProduct['assistant']>>) => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      assistant: {
        messages: props.activeBankProduct.assistant?.messages ?? [],
        uploadFormat: props.activeBankProduct.assistant?.uploadFormat ?? null,
        summaryText: props.activeBankProduct.assistant?.summaryText ?? null,
        summaryModel: props.activeBankProduct.assistant?.summaryModel ?? null,
        summaryGeneratedAt: props.activeBankProduct.assistant?.summaryGeneratedAt ?? null,
        summaryRegenerationsUsed: props.activeBankProduct.assistant?.summaryRegenerationsUsed ?? 0,
        lastSummaryFeedback: props.activeBankProduct.assistant?.lastSummaryFeedback ?? null,
        ...extraPatch,
      },
    });
  };

  const formatChoiceLabel = (format: 'photos' | 'pdf' | 'spreadsheet' | 'text') =>
    format === 'photos' ? 'fotos' : format === 'pdf' ? 'PDF' : format === 'spreadsheet' ? 'Excel/CSV' : 'texto';

  const buildUploadGuidance = (format: 'photos' | 'pdf' | 'spreadsheet' | 'text', productType: BankProduct['productType']) => {
    const productLabel = productType === 'credit_card' ? 'tu tarjeta' : 'tu producto';
    if (format === 'photos') {
      return `Perfecto. Para fotos de ${productLabel}: 1) usa capturas nítidas, 2) no repitas un movimiento en dos pantallazos, 3) el siguiente pantallazo debe partir mostrando el último movimiento visible abajo en el anterior, 4) la última captura puede cortar al final. Cuando las tengas, súbelas y presiona Enviar.`;
    }
    if (format === 'pdf') {
      return `Perfecto. Sube el PDF completo de ${productLabel}. Si tiene clave o mala extracción, mejor usa capturas nítidas del mismo período. Luego presiona Enviar.`;
    }
    if (format === 'spreadsheet') {
      return `Ideal. Excel o CSV suele ser el formato más limpio. Mantén fecha, detalle y monto por fila, evita celdas combinadas y sube el archivo con Enviar.`;
    }
    return `Puedes pegar texto manual si no tienes archivo. Incluye fecha, detalle y monto por línea. Si luego consigues PDF o Excel, mejor aún. Cuando estés listo, usa Enviar.`;
  };

  const buildManualEvidenceFile = (text: string) =>
    new File([text], `antecedente-manual-${Date.now()}.txt`, { type: 'text/plain' });

  const pendingManualEvidence = manualEvidenceDraft.trim();

  const hasTemplateChoice =
    productTemplate.trim().length > 0;
  const canContinueAuto =
    Boolean(resolvedBank.trim()) &&
    hasTemplateChoice &&
    consentAccepted;
  const hasEvidence = Boolean(props.activeBankProduct?.parsedDocuments.length);
  const parsedDocumentCount = props.activeBankProduct?.parsedDocuments.length ?? 0;
  const isSavedForBatch = Boolean(
    props.activeBankProduct &&
    props.activeBankProduct.connected &&
    props.savedProductIds.includes(props.activeBankProduct.id)
  );
  const analysisAlreadyDone = parsedDocumentCount > 0;
  const recreationsLeft = Math.max(0, props.maxRecreations - props.recreationUsed);
  const canAddMoreProducts = props.bankSimulationProductsCount < props.maxProducts && recreationsLeft > 0;
  const consentLocked = Boolean(props.activeBankProduct?.connected);
  const recommendedTxProducts: Array<{ title: string; bank: string; template: string }> = [
    { title: 'Tarjeta de crédito', bank: 'Banco BICE', template: 'Tarjeta de crédito' },
    { title: 'Cuenta corriente', bank: 'Banco de Chile', template: 'Cuenta corriente' },
    { title: 'Cuenta vista', bank: 'BancoEstado', template: 'Cuenta vista' },
  ];

  function openAuthorizationWithPreset(preset?: { bank: string; template: string }) {
    if (preset) {
      setQuickBank('');
      setProductTemplate(preset.template);
    }
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
    setShowTxCarousel(true);
    props.setTxWizardStep('credentials');
  }
  function clearDockTransitionTimers() {
    dockTransitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    dockTransitionTimersRef.current = [];
  }
  function queueDockTransitionTimeout(callback: () => void, delay: number) {
    const timerId = window.setTimeout(callback, delay);
    dockTransitionTimersRef.current.push(timerId);
  }
  function startAuthorizationTransition() {
    if (!canContinueAuto || isDockingToLibrary || !props.activeBankProduct) return;
    clearDockTransitionTimers();
    const productId = props.activeBankProduct.id;
    setIsDockingToLibrary(true);
    setDockTransitionPhase('authorizing');
    setTransitionPulse((value) => value + 1);
    setShuffleTrigger((value) => value + 1);
    queueDockTransitionTimeout(() => setDockTransitionPhase('flood'), 220);
    queueDockTransitionTimeout(() => {
      applyOnboarding();
      setRecentlyDockedProductId(productId);
      props.simulateBankLogin({
        bank: resolvedBank,
        label: resolvedProductLabel,
        productType: derivedProductType,
        simulationAccepted: consentAccepted,
      });
    }, 520);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('library-reveal');
      setShowTxCarousel(true);
      setActiveTxCard(1);
      props.setTxWizardStep('upload');
      setShuffleTrigger((value) => value + 1);
    }, 940);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('chat-reveal');
      setShuffleTrigger((value) => value + 1);
    }, 1320);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('idle');
      setIsDockingToLibrary(false);
      setRecentlyDockedProductId((current) => (current === productId ? null : current));
    }, 1960);
  }
  useEffect(() => {
    if (!props.isOpen) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () => {
      const root = transactionsModalRef.current;
      if (!root) return [] as HTMLElement[];
      const selector = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (node) => !node.hasAttribute('aria-hidden'),
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      (focusables[0] ?? transactionsModalRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        transactionsModalRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && transactionsModalRef.current?.contains(active));

      if (!inside) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      const elementToRestore = restoreFocusRef.current;
      if (elementToRestore && document.contains(elementToRestore)) {
        window.requestAnimationFrame(() => elementToRestore.focus());
      }
    };
  }, [props.isOpen, props.onClose]);
  useEffect(() => {
    if (!props.isOpen) return;
    // Start with preset selection before opening authorization.
    clearDockTransitionTimers();
    setDockTransitionPhase('idle');
    setShowTxCarousel(false);
    props.setTxWizardStep('credentials');
  }, [props.isOpen, props.setTxWizardStep]);
  useEffect(() => {
    const currentLabel = String(props.activeBankProduct?.label ?? '').trim();
    const looksLikeGenericLabel = /^producto\s+\d+$/i.test(currentLabel);
    setQuickBank(props.activeBankProduct?.bank ?? '');
    setProductTemplate(looksLikeGenericLabel ? '' : currentLabel);
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.activeBankProduct?.id]);
  useEffect(() => {
    if (!props.isOpen || currentStage !== 'consent' || !showTxCarousel) return;
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.isOpen, currentStage, showTxCarousel, props.activeBankProduct?.id]);
  const matchingInstitutions = CHILE_FINANCIAL_INSTITUTIONS
    .filter((institution) =>
      quickBank.trim().length === 0
        ? true
        : institution.toLowerCase().includes(quickBank.toLowerCase().replace(/\s*\(simulacion\)\s*/gi, '').trim())
    );
  const filteredInstitutions =
    (matchingInstitutions.length > 0 ? matchingInstitutions : CHILE_FINANCIAL_INSTITUTIONS).slice(0, 24);
  const matchingTemplates = ALL_PRODUCT_TEMPLATES
    .filter((template) =>
      productTemplate.trim().length === 0
        ? true
        : template.label.toLowerCase().includes(productTemplate.toLowerCase().trim())
    );
  const filteredTemplates =
    (matchingTemplates.length > 0 ? matchingTemplates : ALL_PRODUCT_TEMPLATES).slice(0, 24);

  const activeDescriptor = props.transactionProductCards.find((entry) => entry.product.id === props.selectedProductId);
  const [productCarouselIndex, setProductCarouselIndex] = useState(0);
  const productCards = props.transactionProductCards;
  const libraryProductCards = productCards.filter(
    ({ product }) => product.connected || product.uploadedFiles.length > 0 || product.parsedDocuments.length > 0
  );
  const activeProductIndex = Math.max(
    0,
    libraryProductCards.findIndex((entry) => entry.product.id === props.selectedProductId),
  );
  const orderedProductCards =
    libraryProductCards.length === 0
      ? []
      : Array.from(
          { length: libraryProductCards.length },
          (_, offset) => libraryProductCards[(productCarouselIndex + offset) % libraryProductCards.length]
        );
  const txStages = [
    {
      key: 'consent' as const,
      title: '1. Autorización',
      copy: 'Conecta institución y autoriza.',
      disabled: consentLocked,
      go: () => props.setTxWizardStep('credentials'),
    },
    {
      key: 'evidence' as const,
      title: '2. Evidencias',
      copy: 'Sube cartolas y respaldos.',
      disabled: !consentLocked,
      go: () => props.setTxWizardStep('upload'),
    },
    {
      key: 'analyst' as const,
      title: '3. Resumen',
      copy: 'Revisa la ficha analítica.',
      disabled: !consentLocked || !hasEvidence,
      go: () => hasEvidence && props.setTxWizardStep('dashboard'),
    },
  ];
  const [activeTxCard, setActiveTxCard] = useState(0);
  const currentTxStageIndex = txStages.findIndex((stage) => stage.key === currentStage);
  useEffect(() => {
    if (currentTxStageIndex >= 0) setActiveTxCard(currentTxStageIndex);
  }, [currentTxStageIndex]);
  useEffect(() => {
    const stage = txStages[activeTxCard];
    if (stage && !stage.disabled) stage.go();
  }, [activeTxCard]);

  const goToTxStage = (stageKey: 'consent' | 'evidence' | 'analyst') => {
    const nextIndex = txStages.findIndex((stage) => stage.key === stageKey);
    const nextStage = nextIndex >= 0 ? txStages[nextIndex] : null;
    if (!nextStage || nextStage.disabled) return;
    setShowTxCarousel(true);
    setActiveTxCard(nextIndex);
    nextStage.go();
  };
  useEffect(() => {
    if (libraryProductCards.length === 0) {
      setProductCarouselIndex(0);
      return;
    }
    setProductCarouselIndex(activeProductIndex);
  }, [activeProductIndex, libraryProductCards.length]);
  useEffect(() => {
    const nextMap: Record<string, boolean> = {};
    productCards.forEach(({ product }) => {
      nextMap[product.id] = Boolean(product.connected);
      if (!previousConnectedRef.current[product.id] && product.connected) {
        setRecentlyDockedProductId(product.id);
        window.setTimeout(() => setRecentlyDockedProductId((current) => (current === product.id ? null : current)), 900);
      }
    });
    previousConnectedRef.current = nextMap;
  }, [productCards]);
  useEffect(() => () => clearDockTransitionTimers(), []);
  useEffect(() => {
    if (!props.isOpen || activeTxCard !== 2) return;
    const tickCarousel = (container: HTMLDivElement | null) => {
      if (!container) return;
      const firstCard = container.firstElementChild as HTMLElement | null;
      if (!firstCard) return;
      const step = firstCard.offsetWidth + 10;
      const nextLeft = container.scrollLeft + step;
      const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const shouldLoop = nextLeft >= maxLeft - 4;
      container.scrollTo({
        left: shouldLoop ? 0 : nextLeft,
        behavior: 'smooth',
      });
    };
    const intervalId = window.setInterval(() => {
      tickCarousel(groupCarouselRef.current);
      tickCarousel(insightCarouselRef.current);
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [props.isOpen, activeTxCard, dashboardClusters.length, alertDetails.length, metricExplanations.length]);
  useEffect(() => {
    if (!props.isOpen) setShowInjectProductsConfirm(false);
  }, [props.isOpen]);
  useEffect(() => {
    if (!props.isOpen) {
      clearDockTransitionTimers();
      setIsDockingToLibrary(false);
      setDockTransitionPhase('idle');
    }
  }, [props.isOpen]);
  useEffect(() => {
    const el = txSummaryScrollRef.current;
    if (!el || !props.isOpen) return;
    const onScroll = () => {
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      setTxSummaryScrollDepth(Math.min(1, Math.max(0, el.scrollTop / maxScroll)));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [props.isOpen, summaryText, activeTxCard]);
  useEffect(() => {
    if (!props.isOpen) return;
    setConsentAccepted(Boolean(props.activeBankProduct?.simulationAccepted));
  }, [props.isOpen, props.activeBankProduct?.id, props.activeBankProduct?.simulationAccepted]);
  useEffect(() => {
    if (!props.isOpen || props.txWizardStep !== 'upload') return;
    if (analysisAlreadyDone) {
      setTxUploadOnboardingStep('upload');
      return;
    }
    if (selectedUploadFormat) {
      setTxUploadOnboardingStep('details');
      return;
    }
    setTxUploadOnboardingStep('format');
  }, [props.isOpen, props.txWizardStep, props.activeBankProduct?.id, analysisAlreadyDone, selectedUploadFormat]);
  useEffect(() => {
    if (props.isOpen) return;
    setTxAssistantLoading(false);
    setTxAssistantError(null);
    txSendLockRef.current = false;
  }, [props.isOpen]);

  async function requestTransactionAssistant(payload: Record<string, unknown>) {
    const res = await fetch('/api/transactions-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() || '' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo responder');
    return data;
  }

  async function generateTransactionSummary(options?: { feedback?: string; uploadResult?: UploadStatementResult | null; isRegeneration?: boolean }) {
    if (!props.activeBankProduct) return;
    setTxAssistantLoading(true);
    setTxAssistantError(null);
    try {
      const uploadResult = options?.uploadResult ?? null;
      const response = await requestTransactionAssistant({
        mode: 'summary',
        product: {
          bank: uploadResult?.product.bank ?? props.activeBankProduct.bank,
          label: uploadResult?.product.label ?? props.activeBankProduct.label,
          productType: uploadResult?.product.productType ?? props.activeBankProduct.productType,
        },
        parsedDocuments: uploadResult?.documents ?? props.activeBankProduct.parsedDocuments ?? [],
        dashboard: uploadResult?.dashboard ?? props.activeBankProduct.dashboard ?? null,
        currentSummary: summaryText,
        feedback: options?.feedback ?? '',
      });
      props.updateActiveProduct({
        assistant: {
          messages: [
            ...(props.activeBankProduct.assistant?.messages ?? []),
            {
              id: `${Date.now()}-assistant-summary`,
              role: 'assistant',
              text: options?.isRegeneration
                ? 'Revisé el producto de nuevo y actualicé el resumen de abajo.'
                : 'Ya recibí tus antecedentes. Preparé el resumen ejecutivo aquí abajo y puedo responder dudas sobre tus movimientos.',
              createdAt: new Date().toISOString(),
            },
          ],
          uploadFormat: props.activeBankProduct.assistant?.uploadFormat ?? null,
          summaryText: String(response.summary ?? '').trim(),
          summaryModel: typeof response.model === 'string' ? response.model : null,
          summaryGeneratedAt: new Date().toISOString(),
          summaryRegenerationsUsed: options?.isRegeneration ? summaryRegenerationsUsed + 1 : summaryRegenerationsUsed,
          lastSummaryFeedback: options?.feedback ?? null,
        },
        label: uploadResult?.product.label ?? props.activeBankProduct.label,
        bank: uploadResult?.product.bank ?? props.activeBankProduct.bank,
        productType: uploadResult?.product.productType ?? props.activeBankProduct.productType,
      });
      if (!options?.isRegeneration) {
        setActiveTxCard(2);
        props.setTxWizardStep('dashboard');
      }
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo generar el resumen.');
    } finally {
      setTxAssistantLoading(false);
    }
  }

  async function handleAssistantUploadSend(messageText: string) {
    if (!props.activeBankProduct) return;
    const manualFile =
      pendingManualEvidence.length > 0 ? buildManualEvidenceFile(pendingManualEvidence) : null;
    const filesToUpload = manualFile ? [...pendingEvidenceFiles, manualFile] : pendingEvidenceFiles;
    if (filesToUpload.length === 0) return;

    setTxAssistantLoading(true);
    setTxAssistantError(null);
    try {
      appendAssistantMessages([
        {
          role: 'user',
          text: messageText || 'Te envío antecedentes de transacciones.',
          attachments: filesToUpload.map((file) => file.name),
        },
      ]);
      const result = await props.onUploadStatement(filesToUpload);
      if (result?.documents?.length) {
        await generateTransactionSummary({ uploadResult: result, isRegeneration: false });
      }
      setTxAssistantInput('');
      clearPendingEvidence();
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo enviar evidencia.');
    } finally {
      setTxAssistantLoading(false);
    }
  }

  async function handleAssistantTextSend() {
    if (!props.activeBankProduct || txAssistantLoading || txSendLockRef.current) return;
    const text = txAssistantInput.trim();
    const hasFiles = pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0;
    if (!text && !hasFiles) return;
    txSendLockRef.current = true;
    try {
      const normalized = text.toLowerCase();
      const chosenFormat =
        /excel|csv|xlsx|planilla/.test(normalized)
          ? 'spreadsheet'
          : /\bpdf\b/.test(normalized)
            ? 'pdf'
            : /foto|captura|pantallazo|imagen/.test(normalized)
              ? 'photos'
              : /texto|manual|escrito/.test(normalized)
                ? 'text'
                : null;

      if (hasFiles) {
        await handleAssistantUploadSend(text);
        return;
      }

      appendAssistantMessages([{ role: 'user', text }]);
      setTxAssistantInput('');
      setTxAssistantError(null);

      if (chosenFormat) {
        appendAssistantMessages(
          [{ role: 'assistant', text: buildUploadGuidance(chosenFormat, props.activeBankProduct.productType) }],
          { uploadFormat: chosenFormat },
        );
        return;
      }

      const asksForRegeneration =
        Boolean(summaryText) &&
        /(error|corrige|corregir|revisa|revisar|regenera|regenerar|rehace|rehacer)/i.test(text);
      if (asksForRegeneration && summaryRegenerationsLeft > 0) {
        await generateTransactionSummary({ feedback: text, isRegeneration: true });
        return;
      }

      setTxAssistantLoading(true);
      const response = await requestTransactionAssistant({
        mode: 'chat',
        product: {
          bank: props.activeBankProduct.bank,
          label: props.activeBankProduct.label,
          productType: props.activeBankProduct.productType,
        },
        currentSummary: summaryText,
        dashboard: props.activeBankProduct.dashboard ?? null,
        parsedDocuments: props.activeBankProduct.parsedDocuments ?? [],
        messages: [...assistantMessages, { role: 'user', text }],
      });
      appendAssistantMessages([{ role: 'assistant', text: String(response.assistant_text ?? 'Listo.') }]);
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo responder.');
    } finally {
      setTxAssistantLoading(false);
      txSendLockRef.current = false;
    }
  }
  if (!props.isOpen) return null;

  return (
    <div className="agent-modal-overlay transactions-modal-overlay" onClick={props.onClose}>
      <div
        className="agent-modal transactions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transactions-modal-title"
        aria-describedby="transactions-modal-intro"
        tabIndex={-1}
        ref={transactionsModalRef}
        onClick={(e) => e.stopPropagation()}
        onClickCapture={() => {
          setShuffleTrigger((n) => n + 1);
          setTransitionPulse((n) => n + 1);
        }}
        data-ui-version="v2"
        data-dock-phase={dockTransitionPhase}
        data-stage={currentStage}
      >
        <ModalNumbersCanvas
          shuffleTrigger={shuffleTrigger}
          transitionPhase={dockTransitionPhase}
          pulse={transitionPulse}
        />
        <div className="tx-transition-flood-layer" aria-hidden="true">
          <NumericDust scope="flood" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} count={42} />
        </div>
        <div className="bcc-modal-header tx-modal-header-layer">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="transactions-modal-title" className="bcc-modal-title">Transacciones</h3>
          </div>
          <button
            type="button"
            className="agent-modal-close tx-close-minimal"
            onClick={props.onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="tx-scroll-body">
        <p id="transactions-modal-intro" className="agent-modal-intro tx-modal-header-layer">Flujo breve: autoriza, sube evidencias y obtén un análisis ejecutivo confiable.</p>
        <section className="pt-shell tx-stage-shell tx-modal-header-layer">
          <aside className="pt-left tx-panel-surface tx-panel-surface--library">
            <NumericDust scope="library" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} />
            <div className="pt-list-head">
              <h4>Biblioteca de productos</h4>
              <div className="pt-list-head-actions">
                <button type="button" className="continue-ghost" onClick={props.addTransactionProduct} disabled={!canAddMoreProducts}>+ Nuevo</button>
                <button
                  type="button"
                  className="continue-ghost tx-inject-products-btn"
                  onClick={() => setShowInjectProductsConfirm(true)}
                  disabled={props.documentsLoading}
                >
                  Inyectar
                </button>
              </div>
            </div>
            <div className="tx-meta-stack" aria-label="Estado y límites del módulo">
              {props.creationNotice ? (
                <div className="tx-meta-card is-warning" role="status">
                  <span className="tx-meta-card-kicker">Estado de recreación</span>
                  <p>{props.creationNotice}</p>
                </div>
              ) : null}
              <div className="tx-meta-card is-neutral">
                <span className="tx-meta-card-kicker">Límites operativos</span>
                <p>{props.maxProducts} productos · {props.maxEvidenceFilesPerProduct} archivos por producto · 1 análisis + 3 revisiones de resumen por producto</p>
              </div>
              {showInjectProductsConfirm ? (
                <div className="tx-batch-recommendation-banner" role="status" aria-live="polite">
                  <p>Recomendado: enviar cuando hayas subido todos tus productos financieros para un mejor análisis consolidado.</p>
                  <div className="tx-batch-recommendation-actions">
                    <button
                      type="button"
                      className="continue-ghost"
                      onClick={() => setShowInjectProductsConfirm(false)}
                      disabled={props.documentsLoading}
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => {
                        setShowInjectProductsConfirm(false);
                        props.sendTransactionsToAgent();
                      }}
                      disabled={props.documentsLoading}
                    >
                      Enviar productos
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="pt-list">
              {libraryProductCards.length > 0 ? (
                <>
                  <div className="pt-stack-carousel tx-library-is-saved">
                    {orderedProductCards.slice(0, 4).map(({ product, descriptor, intel }, stackIndex) => {
                      const isTop = stackIndex === 0;
                      const paletteIndex = (productCarouselIndex + stackIndex) % PRODUCT_STACK_PALETTE.length;
                      const color = PRODUCT_STACK_PALETTE[paletteIndex];
                      const textAccent = PRODUCT_STACK_TEXT_PALETTE[(paletteIndex + 1) % PRODUCT_STACK_TEXT_PALETTE.length];
                      const visualPalette = productVisualPalette(`${product.id}-${product.label}-${product.bank}`);
                      return (
                        <div
                          key={product.id}
                          role="button"
                          tabIndex={0}
                          className={`pt-item pt-item-stack tx-lib-card ${isTop ? 'is-active is-top' : ''} ${recentlyDockedProductId === product.id ? 'tx-lib-enter' : ''}`}
                          data-docked={recentlyDockedProductId === product.id ? 'true' : 'false'}
                          onClick={() => {
                            setShowTxCarousel(true);
                            props.selectTransactionProduct(product.id);
                            setProductCarouselIndex((productCarouselIndex + stackIndex) % libraryProductCards.length);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            setShowTxCarousel(true);
                            props.selectTransactionProduct(product.id);
                            setProductCarouselIndex((productCarouselIndex + stackIndex) % libraryProductCards.length);
                          }}
                          style={{
                            ['--pt-card-active-bg' as any]: color,
                            ['--pt-card-active-border' as any]: color,
                            ['--pt-card-active-shadow' as any]: color,
                            ['--pt-stack-color' as any]: color,
                            ['--pt-stack-bg' as any]: color,
                            ['--pt-stack-border' as any]: color,
                            ['--pt-stack-accent' as any]: textAccent,
                            ['--pt-stack-idx' as any]: stackIndex,
                            ['--tx-lib-base' as any]: visualPalette.base,
                            ['--tx-lib-glow' as any]: visualPalette.glow,
                            ['--tx-lib-edge' as any]: visualPalette.edge,
                            ['--tx-lib-tint' as any]: visualPalette.tint,
                          }}
                        >
                          {recentlyDockedProductId === product.id ? (
                            <NumericDust scope="library-card" pulse={transitionPulse} active count={18} />
                          ) : null}
                          {isTop ? (
                            <button
                              type="button"
                              className="pt-item-delete-mini"
                              aria-label={`Eliminar ${product.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.deleteTransactionProduct(product.id);
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                          <div className="tx-lib-card-sheen" aria-hidden="true" />
                          <div className="pt-item-top tx-lib-card-top">
                            <div className="tx-lib-card-copy">
                              <span className="tx-lib-card-eyebrow">
                                {product.productType === 'credit_card' ? 'Tarjeta autorizada' : 'Producto conectado'}
                              </span>
                              <span className="pt-item-name">{product.label}</span>
                            </div>
                            <span className="pt-item-status">{product.connected ? 'Autorizado' : 'Pendiente'}</span>
                          </div>
                          <span className="pt-item-bank">{product.bank || 'Institución por definir'}</span>
                          <div className="pt-item-meta">
                            <span>{intel.docs} respaldo(s)</span>
                            <span>{intel.amounts.length} movimiento(s)</span>
                          </div>
                          <div className="tx-lib-card-chip" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                  {libraryProductCards.length > 1 ? (
                    <div className="pt-stack-nav">
                      <button
                        type="button"
                        className="continue-ghost"
                        onClick={() => {
                          const next = (productCarouselIndex - 1 + libraryProductCards.length) % libraryProductCards.length;
                          setProductCarouselIndex(next);
                          props.selectTransactionProduct(libraryProductCards[next].product.id);
                        }}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="continue-ghost"
                        onClick={() => {
                          const next = (productCarouselIndex + 1) % libraryProductCards.length;
                          setProductCarouselIndex(next);
                          props.selectTransactionProduct(libraryProductCards[next].product.id);
                        }}
                      >
                        →
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="tx-library-empty">
                  <span className="tx-library-empty-kicker">Biblioteca vacía</span>
                  <p>Las cards aparecen aquí cuando el producto ya quedó guardado en el flujo.</p>
                </div>
              )}
            </div>
          </aside>

          <div className={`pt-right tx-panel-surface tx-panel-surface--workspace ${!props.activeBankProduct || showTxCarousel ? '' : 'tx-only-cta'}`}>
            <NumericDust scope="workspace" pulse={transitionPulse} active={dockTransitionPhase !== 'idle' || currentStage !== 'consent'} />
            {!props.activeBankProduct ? (
              <div className="transactions-summary-card pt-empty-state">
                <div className="pt-empty-head">
                  <span className="transactions-summary-title">Comienza aquí</span>
                  <h4>Activa tu primera ficha financiera</h4>
                  <p>Crea un producto para iniciar un flujo simple y validable.</p>
                </div>
                <div className="pt-empty-grid" role="list" aria-label="Capacidades del panel">
                  <article className="pt-empty-item" role="listitem">
                    <span>1</span>
                    <div>
                      <strong>Configura producto</strong>
                      <p>Define banco, tipo y alias para organizar tu biblioteca.</p>
                    </div>
                  </article>
                  <article className="pt-empty-item" role="listitem">
                    <span>2</span>
                    <div>
                      <strong>Sube evidencias</strong>
                      <p>Adjunta cartolas o respaldos y el sistema extrae datos clave.</p>
                    </div>
                  </article>
                  <article className="pt-empty-item" role="listitem">
                    <span>3</span>
                    <div>
                      <strong>Obtén insights</strong>
                      <p>Recibe indicadores y hallazgos listos para el agente core.</p>
                    </div>
                  </article>
                </div>
                <div className="agent-modal-actions pt-empty-actions">
                  <button type="button" className="continue-ghost" onClick={props.addTransactionProduct} disabled={!canAddMoreProducts}>Crear primer producto</button>
                </div>
              </div>
            ) : (
              <>
                {!showTxCarousel ? (
                  <div className="tx-carousel-gate tx-preset-gate">
                    <div className="tx-preset-shell">
                      <p className="tx-preset-title">Agregar movimiento de:</p>
                      <div className="tx-preset-grid">
                        {recommendedTxProducts.map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            className="tx-preset-btn"
                            onClick={() => openAuthorizationWithPreset(preset)}
                          >
                            {preset.title}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="tx-preset-btn tx-preset-btn-add"
                          onClick={() => {
                            props.addTransactionProduct();
                            setQuickBank('');
                            setProductTemplate('');
                            setShowInstitutionCatalog(false);
                            setShowTemplateCatalog(false);
                            setShowTxCarousel(true);
                            props.setTxWizardStep('credentials');
                          }}
                        >
                          + Agregar otro producto
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="tx-content-carousel">
                  {(activeTxCard === 0 || isDockingToLibrary) && (
                  <div className="tx-3d-hero-shell" aria-hidden="true">
                    <div className="relative w-full flex items-center justify-center p-0">
                      <div className="relative w-full py-0">
                      <div className={`tx-3d-sway-wrap${txVisualStage === 'consent' && !isDockingToLibrary ? ' is-floating' : ''}`}>
                      <div
                        className={`tx-3d-hero ${txVisualTone} ${isCardLikeProduct ? 'is-card-like' : 'is-generic-like'} ${activeTxCard % 2 === 1 ? 'is-solid-step' : 'is-anim-step'} ${isDockingToLibrary ? 'is-docking-out' : ''}`}
                        style={{
                          ['--tx-hero-base' as any]: activeProductVisualPalette.base,
                          ['--tx-hero-glow' as any]: activeProductVisualPalette.glow,
                          ['--tx-hero-edge' as any]: activeProductVisualPalette.edge,
                          ['--tx-hero-tint' as any]: activeProductVisualPalette.tint,
                          transform: `translate3d(0, ${txVisualY}px, 0) rotateX(${txVisualRotateX}deg) rotateY(${txVisualRotateY}deg) scale(${txVisualScale})`,
                        }}
                      >
                        <NumericDust scope="hero" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} />
                        <div className="tx-3d-hero-sheen" />
                        <div className="tx-3d-hero-core">
                          <span className="tx-3d-hero-eyebrow">
                            {isCardLikeProduct ? 'Producto financiero' : 'Instrumento financiero'}
                          </span>
                          <strong>{resolvedProductLabel || props.activeBankProduct.label || 'Producto activo'}</strong>
                          <span>{resolvedBank || props.activeBankProduct.bank || 'Institución por definir'}</span>
                        </div>
                        <div className="tx-3d-hero-chip" />
                      </div>
                      </div>
                      </div>
                    </div>
                  </div>
                  )}
                  {activeTxCard === 0 && (
                  <section className="tx-content-card is-main-center tx-summary-clean tx-step-reveal">
                    <div className="pt-stage-header">
                      <span className="pt-stage-eyebrow">Paso 1</span>
                      <h4>Autorización del producto</h4>
                      <p>Define institución, tipo y consentimiento para iniciar el flujo simulado.</p>
                    </div>
                    <div className="transactions-summary-card tx-consent-card">
                    <span className="transactions-summary-title">Consentimiento Open Finance (simulado)</span>
                    <div className="bank-sim-grid">
                      <label>Institución (sugerida)
                        <div className="tx-picker-field">
                          <input
                            value={quickBank}
                            onChange={(e) => {
                              setQuickBank(e.target.value);
                              setShowInstitutionCatalog(true);
                            }}
                            onFocus={() => setShowInstitutionCatalog(true)}
                            placeholder="Busca o escribe una institución"
                          />
                          <button
                            type="button"
                            className="tx-picker-toggle"
                            onClick={() => setShowInstitutionCatalog((prev) => !prev)}
                          >
                            {showInstitutionCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
                          </button>
                          {showInstitutionCatalog && (
                            <div className="tx-picker-catalog">
                              {filteredInstitutions.map((institution) => (
                                <button
                                  key={institution}
                                  type="button"
                                  className="tx-picker-option"
                                  onClick={() => {
                                    setQuickBank(`${institution} (simulacion)`);
                                    setShowInstitutionCatalog(false);
                                  }}
                                >
                                  {institution}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                      <label>Plantilla de producto o servicio
                        <div className="tx-picker-field">
                          <input
                            value={productTemplate}
                            onChange={(e) => {
                              setProductTemplate(e.target.value);
                              setShowTemplateCatalog(true);
                            }}
                            onFocus={() => setShowTemplateCatalog(true)}
                            placeholder="Busca o escribe una plantilla"
                          />
                          <button
                            type="button"
                            className="tx-picker-toggle"
                            onClick={() => setShowTemplateCatalog((prev) => !prev)}
                          >
                            {showTemplateCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
                          </button>
                          {showTemplateCatalog && (
                            <div className="tx-picker-catalog">
                              {filteredTemplates.map((template) => (
                                <button
                                  key={template.label}
                                  type="button"
                                  className="tx-picker-option"
                                  onClick={() => {
                                    setProductTemplate(template.label);
                                    setShowTemplateCatalog(false);
                                  }}
                                >
                                  {template.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        className={`tx-consent-toggle ${consentAccepted ? 'is-checked' : ''}`}
                        role="checkbox"
                        aria-checked={consentAccepted}
                        onClick={() => {
                          const nextAccepted = !consentAccepted;
                          setConsentAccepted(nextAccepted);
                          props.updateActiveProduct({
                            simulationAccepted: nextAccepted,
                            connected: false,
                          });
                        }}
                      >
                        <span className="tx-consent-toggle-box" aria-hidden="true" />
                        <span className="tx-consent-toggle-copy">
                          Autorizo el análisis de datos en ambiente simulado (sin credenciales reales).
                        </span>
                      </button>
                      <div className="tx-consent-inline-actions">
                        <button
                          type="button"
                          className="continue-ghost tx-consent-inline-continue"
                          disabled={!canContinueAuto || isDockingToLibrary}
                          onClick={startAuthorizationTransition}
                        >
                          Continuar
                        </button>
                      </div>
                    </div>
                    <div className="agent-modal-actions tx-consent-actions-row">
                      <button type="button" className="continue-ghost tx-delete-product-btn" onClick={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}>Eliminar producto</button>
                      <button
                        type="button"
                        className="continue-ghost tx-consent-continue-main"
                        disabled={!canContinueAuto || isDockingToLibrary}
                        onClick={startAuthorizationTransition}
                      >
                        {isDockingToLibrary ? 'Autorizando…' : 'Conectar y continuar'}
                      </button>
                    </div>
                    </div>
                  </section>
                  )}

                  {activeTxCard === 1 && (
                  <section className="tx-content-card tx-content-card--agent is-main-center tx-step-reveal">
                    <div className="pt-stage-header tx-agent-stage-header">
                      <span
                        className="pt-stage-eyebrow tx-agent-stage-tag"
                        style={{
                          color: 'rgba(84, 145, 214, 0.88)',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Análisis guiado
                      </span>
                      <h4
                        className="tx-agent-stage-title"
                        style={{
                          fontFamily: 'Georgia, "Times New Roman", serif',
                          fontSize: 'clamp(46px, 5.1vw, 82px)',
                          fontWeight: 400,
                          letterSpacing: '-0.045em',
                          lineHeight: 0.96,
                          color: '#f0f0f5',
                          margin: 0,
                          maxWidth: '12ch',
                          textWrap: 'balance',
                          textShadow: '0 20px 70px rgba(0, 0, 0, 0.46)',
                        }}
                      >
                        Sube tus movimientos
                      </h4>
                      <p
                        className="tx-agent-stage-note"
                        style={{
                          maxWidth: '460px',
                          fontSize: 'clamp(12px, 0.92vw, 14px)',
                          lineHeight: 1.4,
                          color: 'rgba(238, 242, 247, 0.46)',
                          marginTop: '2px',
                          letterSpacing: '0.005em',
                        }}
                      >
                        Adjunta cartola, PDF, Excel o texto. El agente ordena la evidencia y devuelve una lectura ejecutiva clara.
                      </p>
                    </div>
                    <div ref={txSummaryScrollRef} className="transactions-summary-card tx-evidence-card tx-evidence-card--premium tx-chat-minimal-body">
                      <NumericDust scope="chat" pulse={transitionPulse} active={dockTransitionPhase === 'chat-reveal' || currentStage !== 'consent'} count={28} />
                      <div className="tx-editorial-intro tx-editorial-intro--agent">
                        <span className="transactions-summary-title">Mesa de evidencia</span>
                        <div className="tx-editorial-meta-row">
                          <span>Hasta {props.maxEvidenceFilesPerProduct} respaldos</span>
                          <span>{summaryRegenerationsLeft} iteraciones</span>
                        </div>
                      </div>

                      {!analysisAlreadyDone && (
                        <div className="tx-upload-onboarding tx-upload-onboarding--agent tx-upload-onboarding--bare">
                          {txUploadOnboardingStep === 'format' && (
                            <div className="tx-onboarding-card tx-onboarding-card--compact tx-onboarding-card--bare">
                              <div className="tx-onboarding-card-head tx-onboarding-card-head--stack">
                                <span className="tx-onboarding-kicker">Formato</span>
                                <div className="tx-onboarding-copy">Selecciona la fuente.</div>
                              </div>
                              <div className="tx-chat-format-pills tx-chat-format-pills--premium tx-chat-format-pills--deck">
                                {([
                                  ['photos', 'Fotos'],
                                  ['pdf', 'PDF'],
                                  ['spreadsheet', 'Excel / CSV'],
                                  ['text', 'Texto'],
                                ] as const).map(([value, label]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    className={`continue-ghost tx-format-choice ${selectedUploadFormat === value ? 'is-active' : ''}`}
                                    onClick={() => {
                                      patchAssistant({ uploadFormat: value });
                                      setTxUploadOnboardingStep('details');
                                    }}
                                  >
                                    <span className="tx-format-choice-icon">{renderFormatIcon(value)}</span>
                                    <span className="tx-format-choice-main">{label}</span>
                                    <span className="tx-format-choice-sub">{getFormatMicrocopy(value)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {txUploadOnboardingStep === 'details' && selectedUploadFormat && (
                            <div className="tx-onboarding-card tx-onboarding-card--guidance tx-onboarding-card--compact tx-onboarding-card--bare">
                              <div className="tx-onboarding-card-head">
                                <div className="tx-onboarding-card-head tx-onboarding-card-head--stack">
                                  <span className="tx-onboarding-kicker">Detalle</span>
                                  <div className="tx-onboarding-detail-chip">{getFormatLabel(selectedUploadFormat)}</div>
                                </div>
                                <button
                                  type="button"
                                  className="tx-onboarding-reset"
                                  onClick={() => {
                                    patchAssistant({ uploadFormat: null });
                                    setTxUploadOnboardingStep('format');
                                  }}
                                >
                                  Cambiar
                                </button>
                              </div>
                              <div className="tx-onboarding-copy">
                                {buildUploadGuidance(selectedUploadFormat, props.activeBankProduct!.productType)}
                              </div>
                              <button
                                type="button"
                                className="tx-onboarding-next tx-onboarding-next--edge"
                                onClick={() => {
                                  setTransitionPulse((value) => value + 1);
                                  setTxUploadOnboardingStep('upload');
                                }}
                                aria-label="Continuar a carga"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {assistantMessages.length > 0 && (
                      <div className="tx-chat-thread">
                        {assistantMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`tx-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                          >
                            <div className="tx-chat-bubble-role">
                              {message.role === 'user' ? 'Tú' : 'Asistente'}
                            </div>
                            <div className="tx-chat-bubble-text">{message.text}</div>
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="tx-chat-bubble-attachments">
                                {message.attachments.map((attachment) => (
                                  <span key={attachment} className="upload-file-pill">{attachment}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      )}

                      {(analysisAlreadyDone || txUploadOnboardingStep === 'upload') && (
                      <div className="upload-zone tx-upload-zone-premium tx-upload-zone-premium--rail tx-upload-zone-premium--inline">
                        <label className="upload-label upload-label--minimal">
                          <span>Adjuntar</span>
                          <span className="upload-trigger-minimal" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M15.5 7.5L9 14a3 3 0 104.24 4.24l7.07-7.07a5 5 0 10-7.07-7.07L5.46 11.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <input
                            type="file"
                            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.pdf,.xls,.xlsx,.csv,.txt,.md"
                            multiple
                            onChange={(e: ChangeEvent<HTMLInputElement>) => appendPendingEvidence(e.target.files)}
                          />
                        </label>
                        <label className="manual-evidence-block">
                          <span className="manual-evidence-label">Nota opcional</span>
                          <textarea
                            className="manual-evidence-textarea"
                            value={manualEvidenceDraft}
                            onChange={(e) => setManualEvidenceDraft(e.target.value)}
                            placeholder="Contexto adicional."
                            rows={2}
                          />
                        </label>
                        {pendingEvidenceFiles.length > 0 && (
                          <div className="transactions-product-insights">
                            {pendingEvidenceFiles.slice(0, 12).map((file) => (
                              <span key={`${file.name}-${file.size}`}>{file.name}</span>
                            ))}
                          </div>
                        )}
                        <div className="upload-files">
                          {props.activeBankProduct.uploadedFiles.length === 0 && <span>Aún no hay archivos cargados.</span>}
                          {props.activeBankProduct.uploadedFiles.map((name, idx) => <span key={`${name}-${idx}`} className="upload-file-pill">{name}</span>)}
                        </div>
                      </div>
                      )}

                      {(analysisAlreadyDone || txUploadOnboardingStep === 'upload') && (
                      <div className="bcc-hero-input-wrap tx-chat-composer-wrap tx-chat-composer-wrap--premium">
                        <input
                          className="bcc-hero-input"
                          value={txAssistantInput}
                          onChange={(e) => setTxAssistantInput(e.target.value)}
                          placeholder={analysisAlreadyDone ? 'Pregúntame sobre tus movimientos o pide revisar el resumen' : 'Escribe o adjunta archivos para enviarlos'}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleAssistantTextSend();
                          }}
                        />
                        <button
                          type="button"
                          className="bcc-hero-send"
                          onClick={() => void handleAssistantTextSend()}
                          disabled={
                            txAssistantLoading ||
                            props.documentsLoading ||
                            (
                              !txAssistantInput.trim() &&
                              pendingEvidenceFiles.length === 0 &&
                              pendingManualEvidence.length === 0
                            ) ||
                            (
                              analysisAlreadyDone &&
                              (pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0)
                            )
                          }
                          aria-label="Enviar"
                          title="Enviar"
                        >
                          Enviar
                        </button>
                      </div>
                      )}

                      {(pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0) && analysisAlreadyDone && (
                        <p className="manual-evidence-hint">Este producto ya tiene análisis. Para nuevos antecedentes debes recrear el producto.</p>
                      )}
                      {txAssistantError && <p className="bcc-hero-error">{txAssistantError}</p>}
                      {props.transactionUploadError && <p className="bcc-hero-error">{props.transactionUploadError}</p>}
                      {(props.documentsLoading || txAssistantLoading) && (
                        <div className="tx-analysis-live" role="status" aria-live="polite">
                          <div className="tx-analysis-console-kicker">
                            <span className="tx-analysis-console-dot" aria-hidden="true" />
                            <span className="tx-analysis-badge">{processingModeLabel}</span>
                            <span className="tx-analysis-meta">{processingMetaLabel}</span>
                          </div>
                          <div className="tx-analysis-track" aria-hidden="true">
                            <span className="tx-analysis-fill" />
                          </div>
                        </div>
                      )}

                      {summaryText && (
                        <div className="transactions-summary-card tx-doc-intel-grid tx-chat-summary-pro tx-chat-summary-bridge">
                          <div className="tx-chat-summary-bridge-head">
                            <div>
                              <span className="transactions-summary-title">Resumen listo</span>
                              <EditorialSummary text={summaryText} compact />
                            </div>
                            <div className="tx-chat-summary-meta">
                              <span className="tx-meta-card-kicker">
                                {summaryGeneratedAt ? `Actualizado ${new Date(summaryGeneratedAt).toLocaleString('es-CL')}` : 'Resumen listo'}
                              </span>
                              {summaryModel ? <span className="tx-meta-card-kicker">Modelo: {summaryModel}</span> : null}
                              <span className="tx-meta-card-kicker">Revisiones restantes: {summaryRegenerationsLeft}</span>
                            </div>
                          </div>
                          <div className="agent-modal-actions tx-flow-inline-actions">
                            <button
                              type="button"
                              className="continue-ghost"
                              onClick={() => goToTxStage('analyst')}
                            >
                              Ver resumen completo
                            </button>
                            <button
                              type="button"
                              className="button-primary"
                              disabled={txAssistantLoading || summaryRegenerationsLeft <= 0}
                              onClick={() => void generateTransactionSummary({ feedback: 'Revisar nuevamente consistencia de movimientos y resumen.', isRegeneration: true })}
                            >
                              {summaryRegenerationsLeft > 0 ? 'Revisar resumen' : 'Resumen final'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                  )}

                  {activeTxCard === 2 && (
                  <section className="tx-content-card is-main-center tx-summary-stage tx-step-reveal">
                    <div className="pt-stage-header">
                      <span className="pt-stage-eyebrow">Paso 3</span>
                      <h4>Resumen analítico</h4>
                      <p>Consolida señales, métricas y hallazgos antes de enviarlos al agente core.</p>
                    </div>
                    <div className="transactions-summary-card tx-premium-sheet tx-summary-executive-shell">
                      <div className="tx-story-hero">
                        <div className="tx-summary-executive-head">
                          <div className="tx-summary-executive-copy">
                            <span className="transactions-summary-title">Resumen ejecutivo</span>
                            <EditorialSummary text={hasSummary ? summaryText : summaryFromTable} />
                          </div>
                          <div className="tx-chat-summary-meta">
                            <span className="tx-meta-card-kicker">{summaryGeneratedAt ? `Actualizado ${new Date(summaryGeneratedAt).toLocaleString('es-CL')}` : 'En preparación'}</span>
                            {summaryModel ? <span className="tx-meta-card-kicker">Modelo: {summaryModel}</span> : null}
                            <span className="tx-meta-card-kicker">Revisiones restantes: {summaryRegenerationsLeft}</span>
                          </div>
                        </div>
                        <div className="tx-story-chips" aria-label="Indicadores de fidelidad">
                          <span className="tx-story-chip">Periodo {tablePeriod.from} → {tablePeriod.to}</span>
                          <span className="tx-story-chip">Cobertura {formatPercentCompact(movementCoverageDisplay)}</span>
                          <span className="tx-story-chip">Fidelidad tabular {formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}</span>
                          <span className="tx-story-chip">Confianza {confidenceBand(movementCount > 0 ? highConfidenceMovementCount / movementCount : 0)}</span>
                        </div>
                        <div className="tx-story-grid">
                          <article className="tx-story-card is-positive">
                            <span>Pulso de caja</span>
                            <strong>{formatCurrency(netFlowFromTable)}</strong>
                            <p>{txNarrative.cashAngle}</p>
                          </article>
                          <article className="tx-story-card">
                            <span>Motor del gasto</span>
                            <strong>{enrichedCategoryData[0]?.name || dashboardClusters[0]?.name || 'Sin patrón dominante'}</strong>
                            <p>{txNarrative.marketAngle}</p>
                          </article>
                          <article className="tx-story-card">
                            <span>Fidelidad del set</span>
                            <strong>{formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}</strong>
                            <p>{txNarrative.fidelityAngle}</p>
                          </article>
                          <article className="tx-story-card">
                            <span>Confianza operativa</span>
                            <strong>{formatPercentCompact(movementCount > 0 ? (highConfidenceMovementCount / movementCount) * 100 : 0)}</strong>
                            <p>{txNarrative.confidenceAngle}</p>
                          </article>
                        </div>
                      </div>
                      <div className="agent-modal-actions tx-summary-executive-actions">
                        <button
                          type="button"
                          className="continue-ghost"
                          onClick={() => setShowAllMovements((prev) => !prev)}
                        >
                          {showAllMovements ? 'Ocultar tabla' : 'Ver tabla'}
                        </button>
                      </div>
                    </div>
                    {showAllMovements ? (
                      <>
                        <div className="transactions-summary-card tx-doc-intel-grid">
                          <span className="transactions-summary-title">Tabla completa de movimientos</span>
                          <div className="tx-movements-table-shell">
                            <table className="tx-movements-table" aria-label="Tabla completa de movimientos detectados">
                              <thead>
                                <tr>
                                  <th>Tipo</th>
                                  <th>Fecha</th>
                                  <th>Detalle</th>
                                  <th>Categoría</th>
                                  <th>Monto</th>
                                  <th>Fuente</th>
                                  <th>Conf.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dedupedMovementRows.length === 0 ? (
                                  <tr>
                                    <td colSpan={7}>No hay movimientos detectados aún. Sube una cartola más nítida o archivo XLSX/PDF.</td>
                                  </tr>
                                ) : (
                                  dedupedMovementRows.map((movement, idx) => (
                                    <tr key={`mv-all-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}>
                                      <td>
                                        <span className={movement.directionForTotals === 'income' ? 'tx-type-income' : 'tx-type-expense'}>
                                          {movement.directionForTotals === 'income'
                                            ? isCreditCardProduct ? 'Abono' : 'Ingreso'
                                            : 'Egreso'}
                                        </span>
                                      </td>
                                      <td>{movement.date || 'N/D'}</td>
                                      <td>{movement.label}</td>
                                      <td>{movement.category || 'Otros'}</td>
                                      <td>{formatCurrency(movement.amount)}</td>
                                      <td>{movementSourceLabel(movement.sourceKind)}</td>
                                      <td>{movement.confidence ? formatPercentCompact(movement.confidence * 100) : 'N/D'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="tx-pro-analysis-grid">
                          <div className="transactions-summary-card tx-doc-intel-grid">
                            <span className="transactions-summary-title">{isCreditCardProduct ? 'Tabla de abonos' : 'Tabla de ingresos'}</span>
                            <div className="tx-movements-table-shell">
                              <table className="tx-movements-table" aria-label="Tabla de ingresos y abonos">
                                <thead>
                                  <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Detalle</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {incomeOrAbonoRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={5}>No hay ingresos/abonos detectados.</td>
                                    </tr>
                                  ) : (
                                    incomeOrAbonoRows.map((movement, idx) => (
                                        <tr key={`mv-in-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}>
                                          <td><span className="tx-type-income">{isCreditCardProduct ? 'Abono' : 'Ingreso'}</span></td>
                                          <td>{movement.date || 'N/D'}</td>
                                          <td>{movement.label}</td>
                                          <td>{movement.category || 'Otros'}</td>
                                          <td>{formatCurrency(movement.amount)}</td>
                                        </tr>
                                      ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="tx-table-total-box is-income" role="status" aria-live="polite">
                              <span>{isCreditCardProduct ? 'Total abonos' : 'Total ingresos'}</span>
                              <strong>{formatCurrency(incomeOrAbonoTotal)}</strong>
                            </div>
                          </div>
                          <div className="transactions-summary-card tx-doc-intel-grid">
                            <span className="transactions-summary-title">Tabla de egresos</span>
                            <div className="tx-movements-table-shell">
                              <table className="tx-movements-table" aria-label="Tabla de egresos">
                                <thead>
                                  <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Detalle</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expenseRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={5}>No hay egresos detectados.</td>
                                    </tr>
                                  ) : (
                                    expenseRows.map((movement, idx) => (
                                        <tr key={`mv-out-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}>
                                          <td><span className="tx-type-expense">Egreso</span></td>
                                          <td>{movement.date || 'N/D'}</td>
                                          <td>{movement.label}</td>
                                          <td>{movement.category || 'Otros'}</td>
                                          <td>{formatCurrency(movement.amount)}</td>
                                        </tr>
                                      ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="tx-table-total-box is-expense" role="status" aria-live="polite">
                              <span>Total egresos</span>
                              <strong>{formatCurrency(expenseTotal)}</strong>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div className="tx-pro-analysis-grid">
                      <div className="transactions-summary-card tx-doc-intel-grid">
                        <span className="transactions-summary-title">Grupos de gasto</span>
                        <div className="tx-group-list tx-mini-carousel" aria-label="Carrusel de grupos de gasto" ref={groupCarouselRef}>
                          {dashboardClusters.length === 0 ? (
                            <p>No hay grupos suficientes para segmentar. Sube una cartola con más movimientos.</p>
                          ) : (
                            dashboardClusters.slice(0, 6).map((cluster) => (
                              <article key={cluster.name} className="tx-group-item">
                                <header>
                                  <strong>{cluster.name}</strong>
                                  <span>{cluster.share_pct.toFixed(1)}%</span>
                                </header>
                                <div className="tx-group-bar" aria-hidden="true">
                                  <span style={{ width: `${Math.min(100, Math.max(4, cluster.share_pct))}%` }} />
                                </div>
                                <p>
                                  {formatCurrency(cluster.amount)} en {cluster.tx_count} movimiento(s), ticket medio {formatCurrency(cluster.avg_ticket)}.
                                </p>
                                {cluster.examples.length > 0 ? (
                                  <div className="transactions-product-insights tx-mini-tags">
                                    {cluster.examples.slice(0, 3).map((example) => (
                                      <span key={`${cluster.name}-${example}`}>{example}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="transactions-summary-card tx-doc-intel-grid">
                        <span className="transactions-summary-title">Lectura fina</span>
                        <div className="tx-insight-stack tx-mini-carousel" aria-label="Carrusel de lectura fina" ref={insightCarouselRef}>
                          {(alertDetails.length > 0 ? alertDetails : []).slice(0, 4).map((alert) => (
                            <article key={`${alert.title}-${alert.reason}`} className={`tx-insight-row is-${alert.severity}`}>
                              <strong>{alert.title}</strong>
                              <p>{alert.reason}</p>
                            </article>
                          ))}
                          {metricExplanations.slice(0, 4).map((metric) => (
                            <article key={`${metric.metric}-${metric.value}`} className="tx-insight-row">
                              <strong>{metric.metric}: {metric.value}</strong>
                              <p>{metric.explanation}</p>
                            </article>
                          ))}
                          {alertDetails.length === 0 && metricExplanations.length === 0 ? (
                            <p>Aún no hay señales analíticas suficientes para priorizar acciones.</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="transactions-summary-card tx-premium-chart-shell">
                      <div className="tx-chart-toolbar">
                        <span className="transactions-summary-title">Gráficos clave (máximo 3)</span>
                      </div>
                      <div className="tx-chart-grid">
                        <article className="tx-chart-card">
                          <h5>Flujo financiero</h5>
                          <div style={{ width: '100%', height: 210 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[
                                  { metric: isCreditCardProduct ? 'Abonos' : 'Ingresos', value: tableDerivedMetrics.inflowsTotal },
                                  { metric: 'Egresos', value: tableDerivedMetrics.outflowsTotal },
                                  { metric: 'Flujo neto', value: netFlowFromTable },
                                ]}
                                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(110,125,150,0.24)" />
                                <XAxis dataKey="metric" interval={0} tick={{ fill: '#42566d', fontSize: 11 }} />
                                <YAxis tickFormatter={(value) => formatCurrency(Number(value))} tick={{ fill: '#42566d', fontSize: 11 }} />
                                <Tooltip
                                  formatter={(value) => formatCurrency(Number(value))}
                                  contentStyle={darkTooltipStyle}
                                  labelStyle={{ color: '#ffffff' }}
                                  itemStyle={{ color: '#ffffff' }}
                                />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                  {[
                                    { metric: isCreditCardProduct ? 'Abonos' : 'Ingresos', value: tableDerivedMetrics.inflowsTotal },
                                    { metric: 'Egresos', value: tableDerivedMetrics.outflowsTotal },
                                    { metric: 'Flujo neto', value: netFlowFromTable },
                                  ].map((entry, idx) => (
                                    <Cell
                                      key={`flow-bar-${entry.metric}`}
                                      fill={entry.value >= 0 ? TX_SECONDARY_COLORS[idx % TX_SECONDARY_COLORS.length] : '#823232'}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </article>
                        <article className="tx-chart-card">
                          <h5>Categorías (monto)</h5>
                          <div style={{ width: '100%', height: 210 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={categoryChartData} layout="vertical" margin={{ top: 8, right: 8, left: 20, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(110,125,150,0.24)" />
                                <XAxis type="number" tickFormatter={(value) => formatCurrency(Number(value))} tick={{ fill: '#42566d', fontSize: 11 }} />
                                <YAxis dataKey="category" type="category" width={120} tick={{ fill: '#42566d', fontSize: 11 }} />
                                <Tooltip
                                  formatter={(value) => formatCurrency(Number(value))}
                                  contentStyle={darkTooltipStyle}
                                  labelStyle={{ color: '#ffffff' }}
                                  itemStyle={{ color: '#ffffff' }}
                                />
                                <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                                  {categoryChartData.map((entry, idx) => (
                                    <Cell key={`cat-bar-${entry.category}`} fill={TX_SECONDARY_COLORS[idx % TX_SECONDARY_COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </article>
                        <article className="tx-chart-card tx-chart-card-with-note">
                          <h5>Calidad vs filas extraídas</h5>
                          <div className="tx-chart-card-note-layout">
                            <div style={{ width: '100%', height: 210 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={qualityRowsChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(110,125,150,0.24)" />
                                  <XAxis dataKey="document" interval={0} tick={{ fill: '#42566d', fontSize: 10 }} />
                                  <YAxis yAxisId="left" tickFormatter={(value) => `${Number(value)}%`} tick={{ fill: '#42566d', fontSize: 11 }} domain={[0, 100]} />
                                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => new Intl.NumberFormat('es-CL').format(Number(value))} tick={{ fill: '#42566d', fontSize: 11 }} />
                                  <Tooltip contentStyle={darkTooltipStyle} labelStyle={{ color: '#ffffff' }} itemStyle={{ color: '#ffffff' }} />
                                  <Legend />
                                  <Line yAxisId="left" type="monotone" dataKey="reliability" stroke="#8ea7bf" strokeWidth={2} dot={false} name="Confiabilidad %" />
                                  <Line yAxisId="right" type="monotone" dataKey="rows" stroke="#c6a052" strokeWidth={2} dot={false} name="Filas extraídas" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <aside className="tx-chart-note" aria-label="Explicación del gráfico">
                              <strong>Qué muestra</strong>
                              <p>Confiabilidad (%) indica la calidad de extracción por respaldo. Filas extraídas mide volumen de datos detectados.</p>
                              <strong>Cómo leerlo</strong>
                              <p>Ideal: confiabilidad alta y filas suficientes. Si suben filas pero baja confiabilidad, conviene mejorar nitidez o formato del respaldo.</p>
                            </aside>
                          </div>
                        </article>
                      </div>
                    </div>
                    <div className="transactions-summary-card tx-premium-sheet">
                      <span className="transactions-summary-title">Ficha analítica del producto</span>
                      <p>{summaryFromTable}</p>
                      <div className="tx-period-row">
                        <span className="tx-period-pill">
                          Periodo: {tablePeriod.from} → {tablePeriod.to}
                        </span>
                        <span className="tx-period-pill">
                          Moneda: {props.activeBankProduct.dashboard?.currency || 'CLP'}
                        </span>
                        <span className="tx-period-pill">
                          Calidad promedio: {qualityAverage > 0 ? `${qualityAverage}%` : 'N/D'}
                        </span>
                      </div>
                      <div className="tx-kpi-pro-grid tx-kpi-pro-carousel">
                        <article className="tx-kpi-pro-card is-income">
                          <span>{isCreditCardProduct ? 'Abonos totales' : 'Ingresos totales'}</span>
                          <strong>{formatCurrency(tableDerivedMetrics.inflowsTotal)}</strong>
                        </article>
                        <article className="tx-kpi-pro-card is-expense">
                          <span>Egresos totales</span>
                          <strong>{formatCurrency(tableDerivedMetrics.outflowsTotal)}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Flujo neto</span>
                          <strong>{formatCurrency(netFlowFromTable)}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Movimientos</span>
                          <strong>{movementCount.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Ticket promedio</span>
                          <strong>{formatCurrency(avgMovementFromTable)}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Ratio gasto/ingreso</span>
                          <strong>{flowRatioFromTable > 0 ? `${(flowRatioFromTable * 100).toFixed(1)}%` : 'N/D'}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Filas tabulares fieles</span>
                          <strong>{verifiedTableRows.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Cobertura detectada</span>
                          <strong>{formatPercentCompact(movementCoverageDisplay)}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Movimientos alta confianza</span>
                          <strong>{highConfidenceMovementCount.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-kpi-pro-card">
                          <span>Origen tabular</span>
                          <strong>{formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}</strong>
                        </article>
                      </div>
                    </div>
                    <div className="transactions-summary-card tx-summary-chat-dock">
                      <span className="transactions-summary-title">Seguir conversación</span>
                      {assistantMessages.length > 0 && (
                        <div className="tx-chat-thread tx-summary-chat-thread">
                          {assistantMessages.slice(-2).map((message) => (
                            <div
                              key={`summary-${message.id}`}
                              className={`tx-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                            >
                              <div className="tx-chat-bubble-role">
                                {message.role === 'user' ? 'Tú' : 'Asistente'}
                              </div>
                              <div className="tx-chat-bubble-text">{message.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bcc-hero-input-wrap tx-chat-composer-wrap tx-chat-composer-wrap--premium tx-summary-chat-composer">
                        <input
                          className="bcc-hero-input"
                          value={txAssistantInput}
                          onChange={(e) => setTxAssistantInput(e.target.value)}
                          placeholder="Pregúntame algo sobre este resumen"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleAssistantTextSend();
                          }}
                        />
                        <button
                          type="button"
                          className="bcc-hero-send"
                          onClick={() => void handleAssistantTextSend()}
                          disabled={txAssistantLoading || props.documentsLoading || !txAssistantInput.trim()}
                          aria-label="Enviar"
                          title="Enviar"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                    <div className="agent-modal-actions tx-summary-stage-actions">
                      <button type="button" className="continue-ghost tx-delete-product-btn" onClick={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}>Eliminar producto</button>
                      <button
                        type="button"
                        className="continue-ghost"
                        onClick={() => goToTxStage('evidence')}
                      >
                        Volver a evidencia
                      </button>
                      <button
                        type="button"
                        className={`button-primary ${isSavedForBatch ? 'is-saved-product' : ''}`}
                        onClick={() => {
                          props.saveTransactionProductForBatch();
                          setShowTxCarousel(false);
                        }}
                        disabled={props.documentsLoading}
                      >
                        {isSavedForBatch ? 'Producto guardado' : 'Guardar producto'}
                      </button>
                    </div>
                  </section>
                  )}
                </div>

                  </>
                )}
              </>
            )}
          </div>
        </section>
        </div>{/* /tx-scroll-body */}
      </div>
    </div>
  );
}
