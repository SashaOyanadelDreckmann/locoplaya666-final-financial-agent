'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Send } from 'lucide-react';
import 'katex/dist/katex.min.css';

import { getSessionId } from '@/lib/session';
import { sendToAgent } from '@/lib/agent';
import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';
import { useSessionStore } from '@/state/session.store';
import {
  getSessionInfo,
  logoutUser,
  deleteAccount,
  removeInjectedIntake,
  removeInjectedProfile,
  loadSheets,
  saveSheets,
  loadPanelState,
  savePanelState,
  deletePdfArtifact,
  getWelcomeMessage,
  parseDocuments,
  mergeProductsContextToIntake,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import {
  productHasAnalyzedMovements,
  productsHaveAnalyzedMovements,
  resolveTxWizardStep,
} from '@/lib/transactions-flow.helpers';
import {
  MAX_BUDGET_ROWS,
  normalizeBudgetRow,
  type BudgetRow,
} from '@/lib/budget-rows.helpers';
import {
  aggregateCanonicalMovements,
  aggregateParsedDocuments,
  aggregateUploadedFiles,
  buildPersistableProductsContext,
  buildScopedTransactionsContext,
  getSimulationSnapshot,
} from '@/lib/products-context.helpers';
import {
  applyUploadToTargetProduct,
  normalizeParsedUploadDocuments,
} from '@/lib/transactions-upload-state.helpers';
import {
  clearAllPanelStateBackups,
  hasMeaningfulPanelState,
  panelStateBackupKeyForUser,
} from '@/lib/panel-state.helpers';
import { normalizeProductAssistantState } from '@/lib/product-normalization.helpers';
import {
  CHAT_GAME_INSTRUCTION,
  DEFAULT_BANK_SIMULATION,
  FALLBACK_WELCOME,
  KNOWLEDGE_MILESTONE_DEFS,
  MAX_EVIDENCE_FILES_PER_PRODUCT,
  MAX_TRANSACTION_PRODUCTS,
  POST_DIAGNOSIS_CHAT_IDS,
  PRIMARY_CHAT_ID,
  type BankSimulation,
} from './agent-page.constants';
import type { BankProduct, TransactionTaxonomyOverride, UploadStatementResult } from './transactions/types';
import { normalizeTaxonomyKey, normalizeTransactionTaxonomyOverride } from './transactions/taxonomy';
import secureStorage from '@/lib/secureStorage';
import { clearCsrfToken } from '@/lib/csrf';
import {
  INTERVIEW_UI_STATE_KEY,
  clearInterviewVoiceState,
  readInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import {
  buildProductCardDescriptor,
  buildTransactionIntelligence,
  firstNameOf,
  inferInstitutionFromText,
  inferProductTypeFromText,
  dedupeConsecutiveAssistantMessages,
  resolveDocumentUrl,
  resolveUnlockedChatIds,
  hasAssistantMessage,
  sanitizeChatItems,
  sanitizeMessageText,
  resolveActiveActionPlanStage,
  hasCompletedIntakeAccess,
  resolveAuthRedirectPath,
} from './page.utils';

import type {
  AgentBlock,
  AgentResponse,
  ChatItem,
} from '@/lib/agent.response.types';
import { toChatItemsFromAgentResponse } from '@/lib/agent.response.types';
import { BudgetModal, QuestionnaireModal, TransactionsModal } from './modals';
import { InterviewModal } from './InterviewModal';
import { SocialConsciousnessModal } from './SocialConsciousnessModal';
import { SidePanels } from './side-panels';
import { ChatThreadView } from './chat-thread-view';
import { ChatHeader } from './chat-header';
import { buildPanelBaseCards } from './panel-cards';
import { useBudgetRows } from './hooks/use-budget-rows';

type AgentMeta = {
  objective?: string;
  mode?: string;
};

type ReportGroup = 'plan_action' | 'simulation' | 'budget' | 'diagnosis' | 'other';

type SavedReport = {
  id: string;
  title: string;
  group: ReportGroup;
  fileUrl: string;
  previewImageUrl?: string;
  createdAt: string;
};

type SavedReportLike = {
  id: string;
  title: string;
  fileUrl: string;
  previewImageUrl?: string;
  group?: string;
  createdAt?: string;
};

type DocFlight = {
  id: string;
  label: string;
  previewUrl?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  running: boolean;
};

type ParsedUploadDocument = {
  documentId?: string;
  name: string;
  text?: string;
  summary?: unknown;
  structuredData?: unknown;
  insight?: {
    format?: string;
    reliability?: number;
    extracted_rows?: number;
    key_findings?: string[];
  };
};

type ChatThread = {
  id: string;
  label: string;
  name: string;
  autoNamed: boolean;
  items: ChatItem[];
  draft: string;
  status: 'active' | 'context';
  contextScore: number;      // 0-100, agent-driven
  userMessageCount: number;  // local counter for UX telemetry
  createdAt: string;
  completedAt?: string;
};

type ProductLifecycle = {
  phase?: string;
  unlockedChats?: string[];
  closedChats?: string[];
  chatTurns?: Record<string, number>;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  closingMode?: boolean;
};

type ChatSpecialization = {
  title: string;
  shortTitle: string;
  accentClass: string;
  subtitle: string;
};

export default function AgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setInterviewIntake = useInterviewStore((s) => s.setIntake);

  function buildContextualChatName(items: ChatItem[]): string {
    const userTexts = items
      .filter((it) => it.type === 'message' && it.role === 'user')
      .map((it) => (it as Extract<ChatItem, { type: 'message'; role: 'user' }>).content.toLowerCase())
      .slice(-6);

    const full = userTexts.join(' ');
    if (/(presupuesto|gasto|ingreso|deuda|balance|flujo)/i.test(full)) return 'Presupuesto y flujo';
    if (/(simul|escenario|rentabilidad|proyecci|retorno|aport)/i.test(full)) return 'Simulacion y escenarios';
    if (/(riesgo|volatil|drawdown|perdida|stress)/i.test(full)) return 'Riesgo y control';
    if (/(cmf|fintec|ley|regulaci|norma|compliance)/i.test(full)) return 'Marco regulatorio';
    if (/(pdf|informe|reporte|documento)/i.test(full)) return 'Informes y reportes';
    if (/(portafolio|cartera|acciones|fondos|etf|bonos)/i.test(full)) return 'Portafolio e inversion';
    if (/(ahorro|meta|objetivo|plan|plazo)/i.test(full)) return 'Plan financiero';
    return 'Analisis financiero';
  }

  function docVisualOffset(id: string, index: number) {
    let hash = 0;
    const seed = `${id}:${index}`;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }

    // Rotaciones y desplazamientos leves, controlados para mantener orden.
    const rotation = ((hash % 31) - 15) / 10; // -1.5deg .. +1.5deg
    const yShift = ((hash >> 4) % 5) - 2; // -2px .. +2px
    return { rotation, yShift };
  }

  function classifyReportGroup(title: string, source?: string): ReportGroup {
    const t = (title || '').toLowerCase();
    const s = (source || '').toLowerCase();
    if (t.includes('plan') || t.includes('accion')) return 'plan_action';
    if (t.includes('simul') || s.includes('simulation')) return 'simulation';
    if (t.includes('presupuesto') || t.includes('budget')) return 'budget';
    if (t.includes('diagnos') || t.includes('perfil')) return 'diagnosis';
    return 'other';
  }

  function isGenericOnboardingMessage(text: string): boolean {
    const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    return (
      normalized.includes('hola, bienvenido. soy tu agente financiero personal en chile') ||
      normalized.includes('aquí podemos hacer tres cosas concretas juntos') ||
      normalized.includes('puedo hacer 3 cosas contigo') ||
      normalized.includes('en el panel lateral vas a ver herramientas') ||
      normalized.includes('se van desbloqueando a medida que avanzamos') ||
      normalized.includes('generar informes') ||
      normalized.includes('partamos con una acción simple')
    );
  }

  function isLegacyDiagnosisOpeningMessage(text: string): boolean {
    const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const isDiagnosisOpening = normalized.includes('informe inicial de diagnóstico');
    const missingDeepFinanceContext =
      isDiagnosisOpening && !normalized.includes('las finanzas personales no son solo números');
    return (
      missingDeepFinanceContext ||
      normalized.includes('hoy sin colchón') ||
      normalized.includes('completa o sube tu presupuesto en el panel') ||
      normalized.includes('¿te acomoda armarlo por semana o por mes?') ||
      normalized.includes('ingresos variables y deudas activas') ||
      normalized.includes('completar o subir tu presupuesto') ||
      normalized.includes('¿lo armamos con números de este mes o del anterior?') ||
      normalized.includes('el objetivo del sistema es darte una lectura financiera clara, trazable y accionable') ||
      normalized.includes('en chile, la ley fintech (ley n° 21.521) impulsa estándares de finanzas abiertas')
    );
  }

  function isAnyDiagnosisOpeningMessage(text: string): boolean {
    const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    return normalized.includes('informe inicial de diagnóstico');
  }

  function buildEditorialWelcome(session: { name?: string | null; injectedIntake?: unknown } | null | undefined) {
    const firstName = String(session?.name ?? '').split(' ')[0]?.trim() || 'Hola';
    const intakeRoot =
      session?.injectedIntake && typeof session.injectedIntake === 'object'
        ? (session.injectedIntake as Record<string, unknown>)
        : null;
    const intake =
      intakeRoot && typeof intakeRoot.intake === 'object' && intakeRoot.intake
        ? (intakeRoot.intake as Record<string, unknown>)
        : intakeRoot;

    const hasSavings =
      typeof intake?.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
    const hasDebt = typeof intake?.hasDebt === 'boolean' ? intake.hasDebt : null;
    const incomeBand = typeof intake?.incomeBand === 'string' ? intake.incomeBand : '';
    const city = typeof intake?.city === 'string' ? intake.city.trim() : '';

    let read = 'hay base para ordenar mejor tu mapa financiero.';
    if (hasSavings === false && hasDebt === false) {
      read = 'hoy el foco parece estar en construir base y liquidez, más que en apagar incendios.';
    } else if (hasDebt === true && hasSavings === false) {
      read = 'hay presión entre caja corta y deuda, así que conviene priorizar secuencia y oxígeno financiero.';
    } else if (hasSavings === true) {
      read = 'ya existe una base sobre la cual conviene decidir mejor cómo asignar flujo y riesgo.';
    }

    const incomeHint = incomeBand ? ` Tu tramo de ingresos declarado es ${incomeBand}.` : '';
    const cityHint = city ? ` Estás operando desde ${city}.` : '';

    return [
      `# Informe inicial de diagnóstico`,
      ``,
      `${firstName}, ${read}${cityHint}${incomeHint}`,
      ``,
      `## Marco de trabajo`,
      `Este espacio convierte información financiera dispersa en un diagnóstico claro, verificable y accionable.`,
      `La lógica es simple: evidencia real primero, recomendaciones después.`,
      ``,
      `## Estándar regulatorio`,
      `Bajo la **Ley Fintech (Ley N° 21.521)**, el intercambio de datos ocurre con consentimiento, trazabilidad y control del usuario.`,
      ``,
      `## Método`,
      `1. **Productos y transacciones** (fuente primaria de evidencia)`,
      `2. **Presupuesto** (estructura de ingresos, gastos y balance)`,
      `3. **Entrevista breve** (criterio, prioridad y tolerancia al riesgo)`,
      ``,
      `## Resultado`,
      `Se construye un diagnóstico financiero personal con prioridades concretas y una ruta de decisión.`,
      ``,
      `¿Partimos por **Productos y transacciones**?`,
    ].join('\n');
  }

  function buildOpeningMessageByChat(
    chatId: string,
    session: { name?: string | null; injectedIntake?: unknown } | null | undefined
  ) {
    const firstName = String(session?.name ?? '').split(' ')[0]?.trim() || 'Hola';
    if (chatId === 'chat-2') {
      return `${firstName}, abrimos con una lluvia de ideas senior: cruzamos tu diagnóstico, presupuesto, cartolas y el mercado de hoy. En este chat convergemos hasta dejar un **plan de acción ejecutivo** completo — sin atajos ni correos automáticos. ¿Priorizamos primero caja, deuda, ahorro o inversión?`;
    }
    if (chatId === 'chat-3') {
      return `*"El precio de todo y el valor de nada."* — Oscar Wilde\n\n${firstName}, este espacio no es sobre números. Es sobre lo que los números revelan de ti.\n\nCada peso que ganas, gastas o acumulas es una decisión moral —aunque nunca la hayas pensado así.\n\n**¿Tu dinero trabaja para el mundo que quieres vivir, o para el mundo que te tocó?**`;
    }
    return buildEditorialWelcome(session);
  }

  function makeInitialThread(id: string, label: string, name: string): ChatThread {
    return {
      id,
      label,
      name,
      autoNamed: false,
      items: [],
      draft: '',
      status: 'active',
      contextScore: 0,
      userMessageCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  function getThreadSpecialization(threadId: string): ChatSpecialization {
    if (threadId === 'chat-1') {
      return {
        title: interviewCompleted ? 'General' : 'Diagnóstico',
        shortTitle: interviewCompleted ? 'Gen' : 'Diag',
        accentClass: 'chat-specialization-1',
        subtitle: interviewCompleted ? 'chat general' : 'Lectura base y tensiones',
      };
    }
    if (threadId === 'chat-2') {
      return {
        title: 'Estrategia',
        shortTitle: 'Plan',
        accentClass: 'chat-specialization-2',
        subtitle: 'Embudo ejecutivo · ideas → plan',
      };
    }
    if (threadId === 'chat-3') {
      return {
        title: 'Conciencia social',
        shortTitle: 'φ',
        accentClass: 'chat-specialization-3',
        subtitle: 'Filosofía del dinero · sociedad · existencia',
      };
    }
    return {
      title: 'Síntesis',
      shortTitle: 'Meta',
      accentClass: 'chat-specialization-meta',
      subtitle: 'Integración maestra',
    };
  }

  const [chatThreads, setChatThreads] = useState<ChatThread[]>([
    makeInitialThread(PRIMARY_CHAT_ID, '1', 'Diagnóstico financiero'),
    makeInitialThread('chat-2', '2', 'Plan post-diagnóstico'),
    makeInitialThread('chat-3', '3', 'Conciencia social post-diagnóstico'),
  ]);
  const [activeChatId, setActiveChatId] = useState(PRIMARY_CHAT_ID);
  const [sheetsLoaded, setSheetsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [panelStage, setPanelStage] = useState(3);
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isStandaloneDisplayMode, setIsStandaloneDisplayMode] = useState(false);
  const [isMonochrome, setIsMonochrome] = useState(false);
  const [progressPulse, setProgressPulse] = useState(false);
  const [isRailMorphing, setIsRailMorphing] = useState(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);
  const [knowledgePopupOpen, setKnowledgePopupOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isQuestionnaireModalOpen, setIsQuestionnaireModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [isSocialConsciousnessModalOpen, setIsSocialConsciousnessModalOpen] = useState(false);
  const [isAccountActionLoading, setIsAccountActionLoading] = useState(false);
  const [txWizardStep, setTxWizardStep] = useState<'products' | 'credentials' | 'upload' | 'dashboard'>('products');
  const [txProductsCreatedTotal, setTxProductsCreatedTotal] = useState(0);
  const [txCreationNotice, setTxCreationNotice] = useState<string | null>(null);
  const [savedProductsForBatch, setSavedProductsForBatch] = useState<string[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [deletingReportIds, setDeletingReportIds] = useState<Record<string, boolean>>({});
  const {
    budgetRows,
    setBudgetRows,
    budgetTotals,
    budgetInsights,
    budgetCompletion,
    budgetSignals,
    updateBudgetRow,
    applyBudgetTemplate,
    addBudgetRow,
    addBudgetSubcategory,
    deleteBudgetRow,
    upsertBudgetRow,
    buildPersistableBudgetContext,
  } = useBudgetRows();
  const [budgetChatAnswers, setBudgetChatAnswers] = useState<Array<{ q: string; a: string }>>([]);
  const [bankSimulation, setBankSimulation] = useState<BankSimulation>(DEFAULT_BANK_SIMULATION);
  const [docFlight, setDocFlight] = useState<DocFlight | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const panelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [panelStateLoaded, setPanelStateLoaded] = useState(false);
  const [persistentKnowledgeScore, setPersistentKnowledgeScore] = useState<number | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [transactionUploadError, setTransactionUploadError] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [productLifecycle, setProductLifecycle] = useState<ProductLifecycle | null>(null);
  const agentMetaRef = useRef<AgentMeta>({});
  const [, forceRender] = useState(0);
  const [chatSlideDir, setChatSlideDir] = useState<'left' | 'right' | null>(null);
  const previousKnowledgeScoreRef = useRef(0);
  const previousMilestoneDoneIdsRef = useRef<Set<string>>(new Set());
  const recentLibraryRef = useRef<HTMLDivElement | null>(null);
  const panelScrollRef = useRef<HTMLElement | null>(null);
  const panelGridRef = useRef<HTMLDivElement | null>(null);
  const panelLoopPausedRef = useRef(false);
  const panelLoopAutoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelLoopResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disableMobilePanelHorizontalMotion = true;
  const [newReportId, setNewReportId] = useState<string | null>(null);
  const [isLandingRecents, setIsLandingRecents] = useState(false);
  const [panelCallout, setPanelCallout] = useState<{ section: string; message: string } | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [expandedCitationsByMessage, setExpandedCitationsByMessage] = useState<Record<number, boolean>>({});
  const [interviewResumePending, setInterviewResumePending] = useState(false);
  const panelCalloutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatBodyRef = useRef<HTMLElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const mobilePanelHandleRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const interviewAutoOpenHandledRef = useRef(false);

  const loadProfileIfNeeded = useProfileStore((s) => s.loadProfileIfNeeded);
  const profile = useProfileStore((s) => s.profile);
  const clearAuthenticated = useSessionStore((s) => s.clearAuthenticated);
  const panelStateBackupKey = useMemo(
    () => panelStateBackupKeyForUser(sessionInfo?.userId ?? sessionInfo?.email ?? sessionInfo?.name),
    [sessionInfo?.userId, sessionInfo?.email, sessionInfo?.name]
  );

  const activeThread = useMemo(
    () =>
      chatThreads.find((thread) => thread.id === activeChatId) ??
      chatThreads[0],
    [chatThreads, activeChatId]
  );

  const items = activeThread?.items ?? [];
  const input = activeThread?.draft ?? '';
  const hasBlockingModalOpen =
    isBudgetModalOpen || isTransactionsModalOpen || isQuestionnaireModalOpen || isAccountModalOpen || isInterviewModalOpen || isSocialConsciousnessModalOpen;
  const interviewCompleted =
    savedReports.some((report) => report.group === 'diagnosis') ||
    Boolean(sessionInfo?.latestDiagnosticCompletedAt);
  const activeThreadThemeClass =
    activeThread?.id === 'chat-2'
      ? 'chat-theme-2'
      : activeThread?.id === 'chat-3'
      ? 'chat-theme-3'
      : activeThread?.id === 'meta-sheet'
      ? 'chat-theme-meta'
      : 'chat-theme-1';
  const unlockedChatIds = resolveUnlockedChatIds({
    unlockedChats: productLifecycle?.unlockedChats ?? null,
    interviewCompleted,
  });
  const closedChatIds = interviewCompleted ? [] : productLifecycle?.closedChats ?? [];
  const activeTurnCount =
    productLifecycle?.chatTurns?.[activeChatId] ??
    activeThread?.userMessageCount ??
    0;
  const activeActionPlanStage = useMemo(() => {
    if (activeChatId !== 'chat-2') return null;
    return (
      resolveActiveActionPlanStage({
        chatId: activeChatId,
        turnCount: activeTurnCount,
        closingMode: productLifecycle?.closingMode,
      }) ??
      productLifecycle?.actionPlanFunnelStage ??
      null
    );
  }, [
    activeChatId,
    activeTurnCount,
    productLifecycle?.closingMode,
    productLifecycle?.actionPlanFunnelStage,
  ]);
  const isActiveChatLocked =
    activeChatId === PRIMARY_CHAT_ID
      ? false
      : !unlockedChatIds.includes(activeChatId as any) || closedChatIds.includes(activeChatId);
  function isThreadLocked(threadId: string) {
    if (threadId === PRIMARY_CHAT_ID) return false;
    return !unlockedChatIds.includes(threadId as any) || closedChatIds.includes(threadId);
  }

  function phaseLabel(phase?: string) {
    if (phase === 'transactions_needed') return 'Agregar productos y respaldos';
    if (phase === 'budget_needed') return 'Completar presupuesto';
    if (phase === 'interview_needed') return 'Entrevista breve';
    if (phase === 'diagnosis_ready') return 'Diagnóstico listo';
    if (phase === 'advisory_unlocked') return 'Asesoría continua activa';
    return 'Diagnóstico inicial';
  }

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const info = await getSessionInfo();
        if (cancelled) return;
        if (!info?.id) {
          setIsAuthenticated(false);
          router.replace('/login');
          return;
        }
        if (!hasCompletedIntakeAccess(info?.injectedIntake)) {
          setIsAuthenticated(false);
          router.replace('/intake');
          return;
        }
        setSessionInfo(info);
        setProductLifecycle((info?.productLifecycle ?? null) as ProductLifecycle | null);
        setIsAuthenticated(true);
      } catch (error) {
        if (cancelled) return;
        setIsAuthenticated(false);
        router.replace(resolveAuthRedirectPath(error));
      } finally {
        if (!cancelled) setAuthBootstrapped(true);
      }
    };

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Mobile panel carousel loop + idle autoplay (every 5s).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth <= 767);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(display-mode: standalone)');
    const syncStandalone = () => {
      const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsStandaloneDisplayMode(media.matches || iosStandalone);
    };
    syncStandalone();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncStandalone);
    } else {
      media.addListener(syncStandalone);
    }
    window.addEventListener('focus', syncStandalone);
    document.addEventListener('visibilitychange', syncStandalone);
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', syncStandalone);
      } else {
        media.removeListener(syncStandalone);
      }
      window.removeEventListener('focus', syncStandalone);
      document.removeEventListener('visibilitychange', syncStandalone);
    };
  }, []);

  useEffect(() => {
    const el = panelGridRef.current;
    if (!el || !isMobileViewport || disableMobilePanelHorizontalMotion) return;

    const getMetrics = () => {
      const firstReal = el.querySelector<HTMLElement>('[data-loop-segment="real"][data-loop-origin="0"]');
      const firstAppend = el.querySelector<HTMLElement>('[data-loop-segment="append"][data-loop-origin="0"]');
      if (!firstReal || !firstAppend) return null;
      return {
        firstRealLeft: firstReal.offsetLeft,
        firstAppendLeft: firstAppend.offsetLeft,
        segmentWidth: firstAppend.offsetLeft - firstReal.offsetLeft,
      };
    };

    const hasLoopSegments = () =>
      Boolean(
        el.querySelector<HTMLElement>('[data-loop-segment="prepend"]') &&
        el.querySelector<HTMLElement>('[data-loop-segment="append"]')
      );

    const resetToRealSegment = () => {
      if (!hasLoopSegments()) return;
      const metrics = getMetrics();
      if (!metrics) return;
      el.scrollLeft = metrics.firstRealLeft;
    };

    resetToRealSegment();

    const pauseLoop = (resumeDelay = 3000) => {
      panelLoopPausedRef.current = true;
      if (panelLoopResumeTimerRef.current) clearTimeout(panelLoopResumeTimerRef.current);
      panelLoopResumeTimerRef.current = setTimeout(() => {
        panelLoopPausedRef.current = false;
      }, resumeDelay);
    };

    const syncFrontCard = () => {
      if (mobilePanelExpanded) return;
      const cards = Array.from(el.children) as HTMLElement[];
      if (cards.length === 0) return;
      const viewportCenter = el.scrollLeft + el.clientWidth / 2;
      let closest: HTMLElement | null = null;
      let minDistance = Number.POSITIVE_INFINITY;
      for (const card of cards) {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closest = card;
        }
      }
      for (const card of cards) {
        card.classList.remove('is-mobile-front', 'is-mobile-left', 'is-mobile-right');
        if (!closest) continue;
        if (card === closest) {
          card.classList.add('is-mobile-front');
        } else if (card.offsetLeft < closest.offsetLeft) {
          card.classList.add('is-mobile-left');
        } else {
          card.classList.add('is-mobile-right');
        }
      }
    };

    const normalizeLoop = () => {
      if (!hasLoopSegments()) {
        syncFrontCard();
        return;
      }
      const metrics = getMetrics();
      if (!metrics || metrics.segmentWidth <= 0) return;
      if (el.scrollLeft >= metrics.firstAppendLeft - 4) {
        el.scrollLeft -= metrics.segmentWidth;
      } else if (el.scrollLeft <= metrics.firstRealLeft - metrics.segmentWidth + 4) {
        el.scrollLeft += metrics.segmentWidth;
      }
      syncFrontCard();
    };

    const advanceToNextCard = () => {
      if (panelLoopPausedRef.current || mobilePanelExpanded || !hasLoopSegments()) return;
      const cards = Array.from(el.children) as HTMLElement[];
      if (cards.length === 0) return;
      const viewportCenter = el.scrollLeft + el.clientWidth / 2;
      let closestIndex = 0;
      let minDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i];
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }
      const next = cards[Math.min(closestIndex + 1, cards.length - 1)];
      if (!next) return;
      const targetLeft = Math.max(0, next.offsetLeft - Math.max(0, (el.clientWidth - next.offsetWidth) / 2));
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
      window.setTimeout(normalizeLoop, 650);
    };

    const onPointerDown = () => pauseLoop(3000);
    const onTouchStart = () => pauseLoop(3000);
    const onMouseEnter = () => pauseLoop(3000);
    const onScroll = () => normalizeLoop();

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('scroll', onScroll, { passive: true });
    syncFrontCard();
    if (panelLoopAutoTimerRef.current) clearInterval(panelLoopAutoTimerRef.current);
    panelLoopAutoTimerRef.current = setInterval(advanceToNextCard, 3000);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('scroll', onScroll);
      if (panelLoopAutoTimerRef.current) clearInterval(panelLoopAutoTimerRef.current);
      if (panelLoopResumeTimerRef.current) clearTimeout(panelLoopResumeTimerRef.current);
      panelLoopAutoTimerRef.current = null;
      panelLoopResumeTimerRef.current = null;
      panelLoopPausedRef.current = false;
    };
  }, [isMobileViewport, panelStage, mobilePanelExpanded, savedReports.length, disableMobilePanelHorizontalMotion]);

  // Bloquear TODO scroll/bounce/swipe/zoom en la pagina del agente
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('agent-route-active');
    body.classList.add('agent-route-active');

    // Keep the page visually continuous while preventing browser-level bounce.
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    // Prevenir touchmove en el document (el bounce de iOS)
    // Solo permite scroll dentro de elementos que tienen overflow scroll
    const preventBounce = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (
          target.classList.contains('mobile-panel-handle') ||
          target.closest('.mobile-panel-handle') ||
          target.closest('.agent-panel.is-dragging') ||
          target.closest('.agent-panel')
        ) {
          return;
        }
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        if (
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowX === 'auto' ||
          overflowX === 'scroll'
        ) {
          return;
        }
        target = target.parentElement;
      }
      e.preventDefault();
    };

    // Prevenir gesture zoom (pinch)
    const preventGesture = (e: Event) => e.preventDefault();

    document.addEventListener('touchmove', preventBounce, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false } as any);
    document.addEventListener('gesturechange', preventGesture, { passive: false } as any);
    document.addEventListener('gestureend', preventGesture, { passive: false } as any);

    return () => {
      html.classList.remove('agent-route-active');
      body.classList.remove('agent-route-active');
      html.style.overflow = '';
      html.style.overscrollBehavior = '';
      body.style.overflow = '';
      body.style.overscrollBehavior = '';
      document.removeEventListener('touchmove', preventBounce);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  // Fix teclado virtual iOS/Android: ajusta --visual-vh al viewport visible real
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty('--visual-vh', `${vv.height}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!isBudgetModalOpen) return;
    chatComposerRef.current?.blur();
  }, [isBudgetModalOpen]);

  // Drag continuo en panel mobile: arrastra el handle para ajustar altura
  useEffect(() => {
    const handle = mobilePanelHandleRef.current;
    const panel = panelScrollRef.current;
    if (!handle || !panel || !isMobileViewport) return;

    const layout = panel.closest('.agent-layout') as HTMLElement | null;
    const viewportH = () => window.visualViewport?.height ?? window.innerHeight;
    const snapClosed = () => Math.round(Math.min(108, viewportH() * 0.16));
    const snapOpen = () => Math.round(viewportH() * 0.46);

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const currentH = panel.getBoundingClientRect().height;
      panelDragRef.current = { startY: touch.clientY, startH: currentH, moved: false };
      panel.classList.add('is-dragging');
      layout?.classList.add('is-panel-dragging');
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!panelDragRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      const dy = panelDragRef.current.startY - touch.clientY;
      if (Math.abs(dy) > 6) panelDragRef.current.moved = true;
      const openMax = snapOpen() + 24;
      const newH = Math.max(72, Math.min(openMax, panelDragRef.current.startH + dy));
      panel.style.setProperty('--mobile-panel-h', `${newH}px`);
      panel.style.flexBasis = `${newH}px`;
      panel.style.maxHeight = `${newH}px`;
    };

    const onTouchEnd = () => {
      if (!panelDragRef.current) return;
      const closed = snapClosed();
      const open = snapOpen();
      const currentH = panel.getBoundingClientRect().height;
      const dragged = panelDragRef.current.moved;
      const snapToOpen = dragged
        ? currentH > (closed + open) / 2
        : !mobilePanelExpanded;
      if (!dragged) {
        haptic(10);
      }
      panel.style.flexBasis = '';
      panel.style.maxHeight = '';
      panel.style.removeProperty('--mobile-panel-h');
      panel.classList.remove('is-dragging');
      layout?.classList.remove('is-panel-dragging');
      setMobilePanelExpanded(snapToOpen);
      layout?.classList.toggle('mobile-panel-expanded', snapToOpen);
      panelDragRef.current = null;
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('touchend', onTouchEnd);
    handle.addEventListener('touchcancel', onTouchEnd);
    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      handle.removeEventListener('touchmove', onTouchMove);
      handle.removeEventListener('touchend', onTouchEnd);
      handle.removeEventListener('touchcancel', onTouchEnd);
      panel.classList.remove('is-dragging');
      layout?.classList.remove('is-panel-dragging');
    };
  }, [isMobileViewport, mobilePanelExpanded, haptic]);

  // Load sheets from API on mount
  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    loadSheets().then((data) => {
      if (data?.sheets && Array.isArray(data.sheets) && data.sheets.length > 0) {
        // Migrate saved sheets to current type
        const restored: ChatThread[] = data.sheets.map((s: any) => ({
          id: s.id ?? `chat-${Date.now()}`,
          label: s.label ?? '1',
          name: s.name ?? 'Conversación',
          autoNamed: s.autoNamed ?? false,
          items: Array.isArray(s.items)
            ? dedupeConsecutiveAssistantMessages(
                sanitizeChatItems(
                  s.items.filter((it: any) => it.type !== 'message' || it.content !== undefined)
                )
              )
            : [],
          draft: s.draft ?? '',
          status: s.status ?? 'active',
          contextScore: s.contextScore ?? 0,
          userMessageCount: s.userMessageCount ?? 0,
          createdAt: s.createdAt ?? new Date().toISOString(),
          completedAt: s.completedAt,
        }));
        const baseDefs = [
          { id: 'chat-1', label: '1', name: 'Diagnóstico financiero' },
          { id: 'chat-2', label: '2', name: 'Plan post-diagnóstico' },
          { id: 'chat-3', label: '3', name: 'Conciencia social post-diagnóstico' },
        ];
        const normalized = baseDefs.map((def) => {
          const existing = restored.find((s) => s.id === def.id);
          return {
            ...(existing ?? makeInitialThread(def.id, def.label, def.name)),
            id: def.id,
            label: def.label,
            name:
              existing?.name && existing.name !== 'Nueva conversación'
                ? existing.name
                : def.name,
            status: 'active' as const,
          };
        });
        setChatThreads(normalized);
        setActiveChatId(PRIMARY_CHAT_ID);
      }
      setSheetsLoaded(true);
    }).catch(() => setSheetsLoaded(true));
  }, [authBootstrapped, isAuthenticated]);

  // Ensure each thread starts with a personalized welcome as the first assistant message.
  const welcomeInjectedThreadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sheetsLoaded) return;
    const active = chatThreads.find((t) => t.id === activeChatId);
    if (!active) return;
    if (welcomeInjectedThreadsRef.current.has(active.id)) return;
    if (hasAssistantMessage(active.items)) {
      if (active.id === 'chat-1') {
        const firstAssistantIdx = active.items.findIndex(
          (it) => it.type === 'message' && it.role === 'assistant'
        );
        const firstAssistant =
          firstAssistantIdx >= 0
            ? (active.items[firstAssistantIdx] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>)
            : null;
        if (
          firstAssistant &&
          (isAnyDiagnosisOpeningMessage(String(firstAssistant.content ?? '')) ||
            isLegacyDiagnosisOpeningMessage(String(firstAssistant.content ?? '')))
        ) {
          const replacement = sanitizeMessageText(
            buildOpeningMessageByChat('chat-1', sessionInfo),
            FALLBACK_WELCOME
          );
          setChatThreads((prev) =>
            prev.map((t) => {
              if (t.id !== activeChatId) return t;
              const cloned = [...t.items];
              const idx = cloned.findIndex((it) => it.type === 'message' && it.role === 'assistant');
              if (idx >= 0) {
                const current = cloned[idx] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>;
                if (String(current.content ?? '') !== replacement) {
                  cloned[idx] = { ...current, content: replacement };
                }
              }
              return { ...t, items: cloned };
            })
          );
        }
      }
      welcomeInjectedThreadsRef.current.add(active.id);
      return;
    }

    const firstAssistantIdx = active.items.findIndex(
      (it) => it.type === 'message' && it.role === 'assistant'
    );
    const firstAssistant =
      firstAssistantIdx >= 0
        ? (active.items[firstAssistantIdx] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>)
        : null;
    const firstText = String(firstAssistant?.content ?? '').toLowerCase();
    const userFirstName = String(sessionInfo?.name ?? '').split(' ')[0]?.toLowerCase() ?? '';
    const alreadyPersonalizedWelcome =
      firstAssistantIdx === 0 &&
      (firstText.includes('soy tu asesor financiero') ||
        firstText.includes('ya carg') ||
        (userFirstName.length >= 2 && firstText.includes(userFirstName)));

    if (alreadyPersonalizedWelcome) {
      welcomeInjectedThreadsRef.current.add(active.id);
      return;
    }

    welcomeInjectedThreadsRef.current.add(active.id);
    if (active.id !== 'chat-1') {
      const opening = sanitizeMessageText(
        buildOpeningMessageByChat(active.id, sessionInfo),
        FALLBACK_WELCOME
      );
      setChatThreads((prev) =>
        prev.map((t) => {
          if (t.id !== activeChatId) return t;
          return {
            ...t,
            items: [
              {
                type: 'message',
                role: 'assistant',
                content: opening,
                mode: 'information',
              } as ChatItem,
              ...t.items,
            ],
          };
        })
      );
      return;
    }

    const initialPrimaryPanelAction: AgentResponse['panel_action'] = {
      section: 'transactions',
      message: 'Primer paso: abre productos y transacciones para cargar respaldos y activar el siguiente desbloqueo.',
    };

    getWelcomeMessage().then(() => {
      const incomingWelcome = sanitizeMessageText(
        buildOpeningMessageByChat('chat-1', sessionInfo),
        FALLBACK_WELCOME
      );
      setChatThreads((prev) =>
        prev.map((t) => {
          if (t.id !== activeChatId) return t;
          if (hasAssistantMessage(t.items)) return t;

          const hasPersonalizedAsFirst =
            t.items.length > 0 &&
            t.items[0]?.type === 'message' &&
            (t.items[0] as Extract<ChatItem, { type: 'message' }>).role === 'assistant' &&
            String((t.items[0] as Extract<ChatItem, { type: 'message' }>).content ?? '')
              .toLowerCase()
              .includes(userFirstName);
          if (hasPersonalizedAsFirst) return t;

          const hasAssistantAlready = t.items.some(
            (it) => it.type === 'message' && it.role === 'assistant'
          );
          const shouldSkipGenericWelcome =
            hasAssistantAlready && isGenericOnboardingMessage(incomingWelcome);
          const finalWelcome = shouldSkipGenericWelcome
            ? sanitizeMessageText(
                buildOpeningMessageByChat('chat-1', sessionInfo),
                FALLBACK_WELCOME
              )
            : incomingWelcome;

          return {
            ...t,
            items: [
              {
                type: 'message',
                role: 'assistant',
                content: finalWelcome,
                mode: 'information',
                panel_action: initialPrimaryPanelAction,
              } as ChatItem,
              ...t.items,
            ],
          };
        })
      );
    }).catch(() => {
      // allow retry on next render if welcome request fails
      welcomeInjectedThreadsRef.current.delete(active.id);
    });
  }, [sheetsLoaded, chatThreads, activeChatId, sessionInfo?.name, sessionInfo?.injectedIntake]);

  // Save sheets to API with debounce whenever they change
  useEffect(() => {
    if (!sheetsLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Save only serializable parts (no functions)
      const toSave = chatThreads.map((t) => ({
        id: t.id,
        label: t.label,
        name: t.name,
        autoNamed: t.autoNamed,
        items: dedupeConsecutiveAssistantMessages(t.items),
        draft: t.draft,
        status: t.status,
        contextScore: t.contextScore,
        userMessageCount: t.userMessageCount,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      }));
      saveSheets(toSave).catch(() => {});
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [chatThreads, sheetsLoaded]);

  function setDraftForActive(nextDraft: string) {
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeChatId
          ? { ...thread, draft: nextDraft }
          : thread
      )
    );
  }

  function setItemsForActive(
    updater: ChatItem[] | ((prevItems: ChatItem[]) => ChatItem[])
  ) {
    setChatThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== activeChatId) return thread;
        const nextItems =
          typeof updater === 'function'
            ? (updater as (prevItems: ChatItem[]) => ChatItem[])(thread.items)
            : updater;
        return { ...thread, items: nextItems };
      })
    );
  }

  function setNameForActive(nextName: string) {
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeChatId
          ? { ...thread, name: nextName, autoNamed: true }
          : thread
      )
    );
  }

  function clearLocalAgentState() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('agent_session_id');
    localStorage.removeItem('agent.panel.stage.v3');
    localStorage.removeItem('agent.panel.collapsed.v1');
    localStorage.removeItem('agent.ui.monochrome.v1');
    localStorage.removeItem('agent.prefill_prompt');
    clearInterviewVoiceState();
    clearCsrfToken();
    secureStorage.clear();
  }

  function clearAllLocalAgentState() {
    clearLocalAgentState();
    clearAllPanelStateBackups();
  }

  function buildPanelSnapshot() {
    return {
      budgetRows,
      budgetChatAnswers,
      bankSimulation: {
        products: bankSimulation.products.map((product) => ({
          ...product,
          randomMode: false,
        })),
        taxonomyOverrides: bankSimulation.taxonomyOverrides,
        activeProductId: bankSimulation.activeProductId,
        lockedMonth: bankSimulation.lockedMonth,
        connected: bankSimulation.connected,
        randomMode: bankSimulation.randomMode,
        uploadedFiles: aggregateUploadedFiles(bankSimulation.products),
        parsedDocuments: aggregateParsedDocuments(bankSimulation.products),
      },
      txProductsCreatedTotal,
      savedReports,
      updatedAt: new Date().toISOString(),
    };
  }

  async function persistPanelSnapshotNow() {
    const snapshot = buildPanelSnapshot();
    try {
      localStorage.setItem(panelStateBackupKey, JSON.stringify(snapshot));
    } catch {}
    try {
      await savePanelState(snapshot);
    } catch {}
  }

  function closeAccountModal() {
    setAccountActionError(null);
    setIsAccountModalOpen(false);
  }

  async function handleLogout() {
    if (isAccountActionLoading) return;
    try {
      setIsAccountActionLoading(true);
      setAccountActionError(null);
      await persistPanelSnapshotNow();
      await logoutUser();
      clearAuthenticated();
      clearLocalAgentState();
      closeAccountModal();
      router.replace('/login');
      router.refresh();
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.location.assign('/login');
        }, 20);
      }
    } catch {
      setAccountActionError('No se pudo cerrar sesión. Inténtalo nuevamente.');
    } finally {
      setIsAccountActionLoading(false);
    }
  }

  async function handleDeleteReport(report: SavedReportLike) {
    if (deletingReportIds[report.id]) return;
    const confirmed = window.confirm(`¿Eliminar "${report.title}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setDeletingReportIds((current) => ({ ...current, [report.id]: true }));
    try {
      await deletePdfArtifact({ fileUrl: report.fileUrl, previewImageUrl: report.previewImageUrl });
      setSavedReports((current) => current.filter((item) => item.id !== report.id));
      setNewReportId((current) => (current === report.id ? null : current));
    } finally {
      setDeletingReportIds((current) => {
        const next = { ...current };
        delete next[report.id];
        return next;
      });
    }
  }

  async function handleDeleteAccount() {
    if (isAccountActionLoading) return;
    const confirmHardDelete = window.confirm(
      '¿Seguro que quieres borrar tu cuenta? Esta acción elimina todos tus datos y no se puede deshacer.'
    );
    if (!confirmHardDelete) return;

    try {
      setIsAccountActionLoading(true);
      setAccountActionError(null);
      await deleteAccount();
      clearAuthenticated();
      clearAllLocalAgentState();
      closeAccountModal();
      router.replace('/register');
      router.refresh();
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.location.assign('/register');
        }, 20);
      }
    } catch {
      setAccountActionError('No se pudo borrar la cuenta. Inténtalo nuevamente.');
    } finally {
      setIsAccountActionLoading(false);
    }
  }

  function deleteThreadById(threadId: string) {
    const target = chatThreads.find((thread) => thread.id === threadId);
    if (!target) return;

    const confirmText =
      target.items.length > 0
        ? `¿Eliminar el chat "${target.name}"? Esta acción limpiará su contenido.`
        : `¿Eliminar el chat "${target.name}"?`;
    if (!window.confirm(confirmText)) return;

    const isBaseThread = POST_DIAGNOSIS_CHAT_IDS.includes(threadId as any);

    setChatThreads((prev) => {
      if (isBaseThread) {
        const resetThread = makeInitialThread(target.id, target.label, target.name || 'Nueva conversación');
        return prev.map((thread) => (thread.id === threadId ? resetThread : thread));
      }

      const filtered = prev.filter((thread) => thread.id !== threadId);
      if (filtered.length === 0) {
        return [makeInitialThread(PRIMARY_CHAT_ID, 'Core', 'Diagnóstico financiero')];
      }

      if (!filtered.some((thread) => thread.status === 'active')) {
        filtered[0] = { ...filtered[0], status: 'active', completedAt: undefined };
      }
      return filtered;
    });

    setActiveChatId((prevActive) => {
      if (prevActive !== threadId) return prevActive;
      if (isBaseThread) return threadId;
      const candidate =
        chatThreads.find((thread) => thread.id !== threadId && thread.status === 'active') ??
        chatThreads.find((thread) => thread.id !== threadId) ??
        { id: PRIMARY_CHAT_ID };
      return candidate.id;
    });

    welcomeInjectedThreadsRef.current.delete(threadId);
  }

  useEffect(() => {
    setChatThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
        if (thread.id === 'chat-1' && interviewCompleted && thread.name !== 'Chat general') {
          changed = true;
          return {
            ...thread,
            name: 'Chat general',
            autoNamed: true,
          };
        }
        if (thread.autoNamed) return thread;
        const userTurns = thread.items.filter(
          (it) => it.type === 'message' && it.role === 'user'
        ).length;
        if (userTurns < 4) return thread;
        changed = true;
        return {
          ...thread,
          name: buildContextualChatName(thread.items),
          autoNamed: true,
        };
      });
      return changed ? next : prev;
    });
  }, [chatThreads, interviewCompleted]);

  const allItems = useMemo(
    () => chatThreads.flatMap((thread) => thread.items),
    [chatThreads]
  );

  const userMessagesCount = useMemo(
    () =>
      items.filter(
        (it) => it.type === 'message' && it.role === 'user'
      ).length,
    [items]
  );

  const totalUserMessagesCount = useMemo(
    () =>
      allItems.filter(
        (it) => it.type === 'message' && it.role === 'user'
      ).length,
    [allItems]
  );

  const totalAssistantMessagesCount = useMemo(
    () =>
      allItems.filter(
        (it) => it.type === 'message' && it.role === 'assistant'
      ).length,
    [allItems]
  );

  const citationsCount = useMemo(
    () => allItems.filter((it) => it.type === 'citation').length,
    [allItems]
  );

  const artifactsCount = useMemo(
    () => allItems.filter((it) => it.type === 'artifact').length,
    [allItems]
  );

  const allAssistantBlocksCount = useMemo(
    () =>
      allItems.reduce((acc, item) => {
        if (item.type === 'message' && item.role === 'assistant') {
          return acc + (item.agent_blocks?.length ?? 0);
        }
        return acc;
      }, 0),
    [allItems]
  );

  const diagnosisReportsCount = useMemo(
    () =>
      savedReports.filter((report) => report.group === 'diagnosis').length,
    [savedReports]
  );

  const progressBreakdown = useMemo(() => {
    // 30% chat (densidad de conversación total)
    const chatSignal =
      totalUserMessagesCount * 1.35 + totalAssistantMessagesCount * 0.7;
    const chatDepth = Math.min(30, (chatSignal / 92) * 30);

    // 10% continuidad en el chat principal.
    const multiChat = Math.min(10, totalUserMessagesCount * 0.8);

    // 10% evidencia (citas, artefactos, bloques estructurados)
    const evidenceSignal =
      Math.min(citationsCount * 1.4, 4) +
      Math.min(artifactsCount * 2.1, 3) +
      Math.min(allAssistantBlocksCount * 0.35, 3);
    const evidence = Math.min(10, evidenceSignal);

    // 10% comprensión de intención/modo
    const meta =
      (agentMetaRef.current.objective ? 5 : 0) +
      (agentMetaRef.current.mode ? 5 : 0);

    // 10% perfil/contexto de sesión
    const profileContext =
      (sessionInfo?.name ? 2 : 0) +
      (sessionInfo?.injectedIntake ? 3 : 0) +
      (sessionInfo?.injectedProfile || profile ? 5 : 0);

    // 10% presupuesto (desbloqueado + estructura útil)
    const budgetDataRows = budgetRows.filter((r) => r.amount > 0).length;
    const budget = Math.min(
      10,
      (budgetDataRows >= 8 ? 6 : (budgetDataRows / 8) * 6) +
        (budgetRows.length >= 6 ? 4 : 0)
    );

    // 10% transacciones (desbloqueo + conexión + evidencias)
    const transactions = Math.min(
      10,
      (bankSimulation.connected ? 4 : 0) +
        Math.min(bankSimulation.uploadedFiles.length * 2, 4) +
        (bankSimulation.randomMode ? 2 : 0)
    );

    // 10% entrevista/diagnóstico (flujo externo y resultados)
    const interviewDiagnosis = Math.min(
      10,
      (sessionInfo?.injectedIntake ? 5 : 0) +
        Math.min(diagnosisReportsCount * 2.5, 5)
    );

    const total =
      chatDepth +
      multiChat +
      evidence +
      meta +
      profileContext +
      budget +
      transactions +
      interviewDiagnosis;

    return {
      chatDepth,
      multiChat,
      evidence,
      meta,
      profileContext,
      budget,
      transactions,
      interviewDiagnosis,
      total: Math.max(0, Math.min(100, Math.round(total))),
    };
  }, [
    totalUserMessagesCount,
    totalAssistantMessagesCount,
    citationsCount,
    artifactsCount,
    allAssistantBlocksCount,
    sessionInfo?.name,
    sessionInfo?.injectedIntake,
    sessionInfo?.injectedProfile,
    profile,
    budgetRows,
    bankSimulation.connected,
    bankSimulation.uploadedFiles.length,
    bankSimulation.randomMode,
    diagnosisReportsCount,
  ]);

  const engagementScore = progressBreakdown.total;
  const knowledgeScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        persistentKnowledgeScore ??
          (typeof sessionInfo?.knowledgeScore === 'number'
            ? sessionInfo.knowledgeScore
            : 0)
      )
    )
  );

  const knowledgeStage = useMemo(() => {
    if (knowledgeScore < 30) return 'Explorando';
    if (knowledgeScore < 60) return 'Perfilando';
    if (knowledgeScore < 85) return 'Consolidando';
    return 'Alta resolucion';
  }, [knowledgeScore]);

  const milestones = useMemo(
    () =>
      KNOWLEDGE_MILESTONE_DEFS.map((milestone) => ({
        ...milestone,
        done: knowledgeScore >= milestone.threshold,
      })),
    [knowledgeScore]
  );

  const completedMilestones = milestones.filter((m) => m.done).length;

  const unlockedPanelBlocks = useMemo(() => {
    const hasAnalyzedMovements = productsHaveAnalyzedMovements(bankSimulation.products);
    const aggregateDocs = aggregateParsedDocuments(bankSimulation.products);
    const hasTransactionsData =
      bankSimulation.products.length > 0 &&
      (hasAnalyzedMovements || aggregateDocs.length > 0);
    const budgetUnlocked = hasTransactionsData;
    // Productos y transacciones debe estar disponible desde el inicio.
    const transactionsUnlocked = true;

    return { budgetUnlocked, transactionsUnlocked };
  }, [bankSimulation.products]);

  const canOpenInterview = useMemo(() => {
    const hasBudgetData = budgetRows.filter((row) => row.amount > 0).length >= 3;
    const hasTransactionsData = productsHaveAnalyzedMovements(bankSimulation.products);
    return interviewCompleted || (hasTransactionsData && hasBudgetData);
  }, [bankSimulation.products, budgetRows, interviewCompleted]);

  function getFlowStatus() {
    const productsCompleted = bankSimulation.products.length > 0;
    const transactionsCompleted =
      productsCompleted && productsHaveAnalyzedMovements(bankSimulation.products);
    const budgetRowsCompleted = budgetRows.filter((row) => row.amount > 0).length;
    const budgetCompleted = transactionsCompleted && budgetRowsCompleted >= 3;
    return {
      productsCompleted,
      transactionsCompleted,
      budgetUnlocked: transactionsCompleted,
      budgetCompleted,
      budgetRowsCompleted,
      interviewUnlocked: budgetCompleted,
      diagnosisCompleted: interviewCompleted,
    };
  }

  function getNextFlowPanelAction(): AgentResponse['panel_action'] | undefined {
    const flow = getFlowStatus();
    if (!flow.transactionsCompleted) {
      return {
        section: 'transactions',
        message: 'Siguiente desbloqueo: agrega productos y respaldos para activar el presupuesto.',
      };
    }
    if (!flow.budgetCompleted) {
      return {
        section: 'budget',
        message: 'Ya hay evidencia. Completa al menos 3 filas reales de presupuesto para abrir entrevista.',
      };
    }
    if (!flow.diagnosisCompleted) {
      return {
        section: 'interview',
        message: 'Presupuesto listo. Cierra la entrevista breve para desbloquear los chats superiores.',
      };
    }
    return undefined;
  }

  function normalizePanelActionForCurrentFlow(
    action?: AgentResponse['panel_action']
  ): AgentResponse['panel_action'] | undefined {
    const flow = getFlowStatus();
    if (action?.section === 'budget' && !flow.budgetUnlocked) {
      return {
        section: 'transactions',
        message: 'Presupuesto está bloqueado hasta completar Productos y Transacciones.',
      };
    }
    if (action?.section === 'interview' && !flow.interviewUnlocked) {
      return flow.budgetUnlocked
        ? {
            section: 'budget',
            message: 'Entrevista está bloqueada hasta completar el presupuesto.',
          }
        : {
            section: 'transactions',
            message: 'Primero completa Productos y Transacciones; después se abre Presupuesto y luego Entrevista.',
          };
    }
    return action ?? getNextFlowPanelAction();
  }

  const intakeData = useMemo(
    () => (sessionInfo?.injectedIntake?.intake ?? null) as Record<string, unknown> | null,
    [sessionInfo?.injectedIntake]
  );

  const activeBankProduct = useMemo(
    () =>
      bankSimulation.activeProductId
        ? bankSimulation.products.find((p) => p.id === bankSimulation.activeProductId) ?? null
        : null,
    [bankSimulation.activeProductId, bankSimulation.products]
  );

  const transactionProductCards = useMemo(
    () =>
      bankSimulation.products.map((product) => ({
        product,
        descriptor: buildProductCardDescriptor(product),
        intel: buildTransactionIntelligence(product.parsedDocuments, product.dashboard?.movements ?? []),
      })),
    [bankSimulation.products]
  );

  const interviewCard = useMemo(() => {
    const name = firstNameOf(sessionInfo?.name);
    const stress = typeof intakeData?.moneyStressLevel === 'number' ? intakeData.moneyStressLevel : null;
    const understanding =
      typeof intakeData?.selfRatedUnderstanding === 'number' ? intakeData.selfRatedUnderstanding : null;
    const interviewDone = interviewCompleted;
    const prompt =
      stress !== null && stress >= 7
        ? 'Conviene una llamada breve para bajar ruido, mapear presión financiera y priorizar decisiones.'
        : understanding !== null && understanding <= 4
        ? 'Conviene una llamada guiada para traducir conceptos y cerrar vacíos antes de recomendar.'
        : 'Conviene una llamada de profundización para pasar de contexto general a decisiones concretas.';

    if (interviewDone) {
      return {
        badge: 'Diagnóstico final',
        title: `Diagnóstico financiero completo de ${name}`,
        meta: 'La entrevista se cerró y este bloque ahora es informe permanente.',
        detail: 'Revísalo en detalle y expórtalo en PDF.',
      };
    }

    return {
      badge: intakeData ? 'Llamada guiada' : 'Activación',
      title: intakeData
        ? `Entrevista estratégica para ${name}`
        : 'Entrevista diagnóstica inicial',
      meta: prompt,
      detail:
        stress !== null && understanding !== null
          ? `Prioridad actual: estrés ${stress}/10 y comprensión ${understanding}/10.`
          : 'Usa esta capa para transformar contexto disperso en diagnóstico accionable.',
    };
  }, [intakeData, sessionInfo?.name, interviewCompleted]);

  const transactionIntel = useMemo(
    () =>
      buildTransactionIntelligence(
        aggregateParsedDocuments(bankSimulation.products),
        aggregateCanonicalMovements(bankSimulation.products),
      ),
    [bankSimulation.products]
  );

  const questionnaireDashboard = useMemo(() => {
    if (!intakeData) return null;
    const formatQuestionnaireValue = (value: unknown): string => {
      const raw = String(value ?? '').trim();
      const normalized = raw.toLowerCase();
      const labels: Record<string, string> = {
        yes: 'Sí',
        no: 'No',
        true: 'Sí',
        false: 'No',
        hold: 'Mantener',
        reduce: 'Reducir',
        increase: 'Aumentar',
        conservative: 'Conservador',
        moderate: 'Moderado',
        aggressive: 'Agresivo',
        employed: 'Dependiente',
        employee: 'Dependiente',
        freelance: 'Independiente',
        self_employed: 'Independiente',
        student: 'Estudiante',
        freelance_student: 'Independiente / estudiante',
        unemployed: 'Sin empleo',
        retired: 'Jubilado',
        none: 'No declarado',
        unknown: 'No declarado',
      };
      return labels[normalized] ?? raw.replace(/_/g, ' ');
    };
    const stress =
      typeof intakeData.moneyStressLevel === 'number' ? intakeData.moneyStressLevel : null;
    const understanding =
      typeof intakeData.selfRatedUnderstanding === 'number'
        ? intakeData.selfRatedUnderstanding
        : null;
    const hasDebt = intakeData.hasDebt === true;
    const hasSavings = intakeData.hasSavingsOrInvestments === true;
    const readinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          50 +
            (understanding !== null ? (understanding - 5) * 8 : 0) +
            (stress !== null ? (5 - stress) * 5 : 0) +
            (hasDebt ? -8 : 6) +
            (hasSavings ? 12 : -4)
        )
      )
    );
    const responsePairs: Array<{ label: string; value: string }> = [
      { label: 'Profesión', value: formatQuestionnaireValue(intakeData.profession ?? 'No declarado') },
      { label: 'Situación laboral', value: formatQuestionnaireValue(intakeData.employmentStatus ?? 'No declarado') },
      { label: 'Ingreso mensual', value: formatQuestionnaireValue(intakeData.incomeBand ?? 'No declarado') },
      { label: 'Cobertura de gastos', value: formatQuestionnaireValue(intakeData.expensesCoverage ?? 'No declarado') },
      { label: 'Control de gastos', value: formatQuestionnaireValue(intakeData.tracksExpenses ?? 'No declarado') },
      { label: 'Deuda activa', value: hasDebt ? 'Sí' : 'No' },
      { label: 'Ahorro / inversión', value: hasSavings ? 'Sí' : 'No' },
      { label: 'Reacción al riesgo', value: formatQuestionnaireValue(intakeData.riskReaction ?? 'No declarado') },
      {
        label: 'Comprensión financiera',
        value: understanding !== null ? `${understanding}/10` : 'No declarado',
      },
      { label: 'Estrés financiero', value: stress !== null ? `${stress}/10` : 'No declarado' },
    ];
    const insights = [
      stress !== null && stress >= 7
        ? 'Prioridad alta: bajar presión de caja y definir un colchón mínimo de liquidez.'
        : 'Presión manejable: se puede combinar orden financiero con decisiones de crecimiento.',
      understanding !== null && understanding <= 4
        ? 'Insight: conviene operar con explicaciones simples y pasos cortos para mantener continuidad.'
        : 'Insight: hay base para ejecutar recomendaciones más analíticas.',
      hasDebt
        ? 'Deuda activa detectada: primero optimizar costo financiero antes de aumentar riesgo.'
        : 'Sin deuda relevante: mayor espacio para construir estrategia de inversión gradual.',
      hasSavings
        ? 'Ya existe ahorro/inversión: palanca para acelerar objetivos con mejor asignación.'
        : 'Sin ahorro declarado: foco inicial en hábito automático de ahorro y control mensual.',
    ];
    return {
      readinessScore,
      responsePairs,
      insights,
      understanding,
      stress,
    };
  }, [intakeData]);

  const reportsByGroup = useMemo(() => {
    const base: Record<ReportGroup, SavedReport[]> = {
      plan_action: [],
      simulation: [],
      budget: [],
      diagnosis: [],
      other: [],
    };
    for (const report of savedReports) {
      base[report.group].push(report);
    }
    return base;
  }, [savedReports]);

  const librarySummary = useMemo(() => {
    const total =
      reportsByGroup.plan_action.length +
      reportsByGroup.simulation.length +
      reportsByGroup.budget.length +
      reportsByGroup.diagnosis.length;

    if (total === 0) {
      return 'Aún no hay documentos guardados. Cuando el agente genere PDFs o informes, aparecerán aquí listos para consulta.';
    }

    const strongestGroup = ([
      ['plan de acción', reportsByGroup.plan_action.length],
      ['simulación', reportsByGroup.simulation.length],
      ['presupuesto', reportsByGroup.budget.length],
      ['diagnóstico', reportsByGroup.diagnosis.length],
    ] as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];

    return `Hay ${total} documento(s) activos. Mayor densidad actual en ${strongestGroup[0]} con ${strongestGroup[1]} pieza(s).`;
  }, [reportsByGroup]);

  const recentReports = useMemo(
    () =>
      [...savedReports]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        )
        .slice(0, 6),
    [savedReports]
  );

  const coachHint = useMemo(() => {
    if (knowledgeScore < 20) {
      return 'Tip: completa tu intake para calibrar lenguaje, riesgo y desbloqueos del panel.';
    }
    if (aggregateParsedDocuments(bankSimulation.products).length === 0 && aggregateUploadedFiles(bankSimulation.products).length === 0) {
      return 'Tip: agrega un producto y sube respaldos para que el presupuesto nazca de evidencia real.';
    }
    if (!unlockedPanelBlocks.budgetUnlocked) {
      return 'Tip: cuentame ingresos y gastos para desbloquear Presupuesto.';
    }
    if (!unlockedPanelBlocks.transactionsUnlocked) {
      return 'Tip: habla de productos, cartolas, cuentas o banco para desbloquear Productos y Transacciones.';
    }
    if (knowledgeScore < 85) {
      return 'Tip: usa presupuesto, deuda, simulaciones o APV para enriquecer el diagnóstico.';
    }
    return 'Ya hay aprendizaje avanzado. Ahora conviene consolidar evidencia y planes accionables.';
  }, [
    knowledgeScore,
    bankSimulation.products,
    unlockedPanelBlocks.budgetUnlocked,
    unlockedPanelBlocks.transactionsUnlocked,
  ]);

  const isPanelCollapsed = panelStage === 3;

  useEffect(() => {
    try {
      const rawStage = localStorage.getItem('agent.panel.stage.v3');
      if (rawStage !== null) {
        const parsed = Number(rawStage);
        if (!Number.isNaN(parsed)) {
          setPanelStage(Math.max(1, Math.min(3, parsed)));
          return;
        }
      }
      // Compat con versiones anteriores (colapsado booleano).
      const rawCollapsed = localStorage.getItem('agent.panel.collapsed.v1');
      if (rawCollapsed === '1') setPanelStage(3);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('agent.ui.monochrome.v1');
      if (raw === '1') setIsMonochrome(true);
    } catch {}
  }, []);

  useEffect(() => {
    const syncInterviewResume = () => {
      try {
        const saved = readInterviewVoiceState();
        if (!saved) {
          setInterviewResumePending(false);
          return;
        }
        const hasTranscript =
          String(saved.voiceAgentTranscript ?? '').trim().length > 0 ||
          String(saved.voiceUserTranscript ?? '').trim().length > 0;
        const hasTime = Number(saved.callSeconds ?? 0) > 0;
        const hasReport = Boolean(saved.voiceReport && typeof saved.voiceReport === 'object');
        setInterviewResumePending((hasTranscript || hasTime) && !hasReport);
      } catch {
        setInterviewResumePending(false);
      }
    };
    syncInterviewResume();
    window.addEventListener('focus', syncInterviewResume);
    window.addEventListener('storage', syncInterviewResume);
    return () => {
      window.removeEventListener('focus', syncInterviewResume);
      window.removeEventListener('storage', syncInterviewResume);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('agent.panel.stage.v3', String(panelStage));
      localStorage.setItem(
        'agent.panel.collapsed.v1',
        panelStage === 3 ? '1' : '0'
      );
    } catch {}
  }, [panelStage]);

  // Mantener el chat pegado abajo (flujo vertical continuo)
  useEffect(() => {
    const el = chatThreadRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [items.length, activeChatId, loading]);

  useEffect(() => {
    try {
      localStorage.setItem('agent.ui.monochrome.v1', isMonochrome ? '1' : '0');
    } catch {}
  }, [isMonochrome]);

  useEffect(() => {
    document.documentElement.classList.toggle('agent-global-monochrome', isMonochrome);
    return () => {
      document.documentElement.classList.remove('agent-global-monochrome');
    };
  }, [isMonochrome]);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    let alive = true;

    loadPanelState()
      .then((data) => {
        if (!alive) return;
        let panelState = data?.panelState;
        if (!hasMeaningfulPanelState(panelState)) {
          try {
            const localBackupRaw = localStorage.getItem(panelStateBackupKey);
            if (localBackupRaw) {
              const localBackupParsed = JSON.parse(localBackupRaw);
              if (hasMeaningfulPanelState(localBackupParsed)) panelState = localBackupParsed;
            }
          } catch {}
        }
        if (panelState && typeof panelState === 'object') {
          if (Array.isArray(panelState.budgetRows) && panelState.budgetRows.length > 0) {
            setBudgetRows(
              panelState.budgetRows.map((row: any) =>
                normalizeBudgetRow({
                  ...(row as BudgetRow),
                  note: typeof row?.note === 'string' ? row.note : '',
                })
              )
            );
          }
          if (Array.isArray(panelState.budgetChatAnswers)) {
            setBudgetChatAnswers(
              (panelState.budgetChatAnswers as Array<{ q: string; a: string }>)
                .filter((item) => typeof item?.q === 'string' && typeof item?.a === 'string')
                .slice(0, 30)
            );
          }
          if (Array.isArray(panelState.savedReports)) {
            setSavedReports(panelState.savedReports);
          }
          if (typeof panelState.txProductsCreatedTotal === 'number') {
            setTxProductsCreatedTotal(
              Math.max(0, Math.min(MAX_TRANSACTION_PRODUCTS, Math.floor(panelState.txProductsCreatedTotal))),
            );
          }
          if (panelState.bankSimulation && typeof panelState.bankSimulation === 'object') {
            if (Array.isArray(panelState.bankSimulation.products)) {
              setTxProductsCreatedTotal((prev) =>
                Math.max(prev, Math.min(MAX_TRANSACTION_PRODUCTS, panelState.bankSimulation.products.length)),
              );
            }
            setBankSimulation((prev) => {
              const products: BankProduct[] = Array.isArray(panelState.bankSimulation.products)
                ? panelState.bankSimulation.products.map((product: unknown) => {
                    const raw = product as Partial<BankProduct>;
                    return {
                      ...(raw as BankProduct),
                      assistant: normalizeProductAssistantState(raw.assistant),
                      productType:
                        raw.productType === 'debit_account' ||
                        raw.productType === 'checking_account' ||
                        raw.productType === 'savings_account' ||
                        raw.productType === 'consumer_loan' ||
                        raw.productType === 'mortgage' ||
                        raw.productType === 'investment_account'
                          ? raw.productType
                          : 'credit_card',
                      simulationAccepted: Boolean(raw.simulationAccepted),
                      connected: Boolean(raw.connected),
                      randomMode: false,
                      uploadedFiles: Array.isArray(raw.uploadedFiles) ? raw.uploadedFiles : [],
                      parsedDocuments: Array.isArray(raw.parsedDocuments) ? raw.parsedDocuments : [],
                    };
                  })
                : prev.products;
              const taxonomyOverrides = Array.isArray((panelState.bankSimulation as any).taxonomyOverrides)
                ? ((panelState.bankSimulation as any).taxonomyOverrides as unknown[])
                    .map(normalizeTransactionTaxonomyOverride)
                    .filter((item): item is TransactionTaxonomyOverride => Boolean(item))
                : prev.taxonomyOverrides;
              const requestedActiveProductId =
                typeof panelState.bankSimulation.activeProductId === 'string'
                  ? panelState.bankSimulation.activeProductId
                  : prev.activeProductId;
              const activeProductId =
                requestedActiveProductId && products.some((product) => product.id === requestedActiveProductId)
                  ? requestedActiveProductId
                  : products[0]?.id ?? null;
              const snapshot = getSimulationSnapshot(products, activeProductId);

              return {
                ...prev,
                products,
                taxonomyOverrides,
                activeProductId,
                lockedMonth:
                  typeof panelState.bankSimulation.lockedMonth === 'string'
                    ? panelState.bankSimulation.lockedMonth
                    : prev.lockedMonth,
                connected: snapshot.connected,
                randomMode: snapshot.randomMode,
                uploadedFiles: snapshot.uploadedFiles,
                parsedDocuments: snapshot.parsedDocuments,
              };
            });
          }
        }
        setPanelStateLoaded(true);
      })
      .catch(() => {
        if (alive) {
          try {
            const localBackupRaw = localStorage.getItem(panelStateBackupKey);
            if (localBackupRaw) {
              const localBackupParsed = JSON.parse(localBackupRaw);
              if (hasMeaningfulPanelState(localBackupParsed)) {
                const panelState = localBackupParsed;
                if (Array.isArray(panelState.budgetRows) && panelState.budgetRows.length > 0) {
                  setBudgetRows(
                    panelState.budgetRows.map((row: any) =>
                      normalizeBudgetRow({
                        ...(row as BudgetRow),
                        note: typeof row?.note === 'string' ? row.note : '',
                      })
                    )
                  );
                }
                if (Array.isArray(panelState.budgetChatAnswers)) {
                  setBudgetChatAnswers(
                    (panelState.budgetChatAnswers as Array<{ q: string; a: string }>)
                      .filter((item) => typeof item?.q === 'string' && typeof item?.a === 'string')
                      .slice(0, 30)
                  );
                }
                if (Array.isArray(panelState.savedReports)) {
                  setSavedReports(panelState.savedReports);
                }
                if (typeof panelState.txProductsCreatedTotal === 'number') {
                  setTxProductsCreatedTotal(
                    Math.max(0, Math.min(MAX_TRANSACTION_PRODUCTS, Math.floor(panelState.txProductsCreatedTotal))),
                  );
                }
                if (panelState.bankSimulation && typeof panelState.bankSimulation === 'object') {
                  if (Array.isArray(panelState.bankSimulation.products)) {
                    setTxProductsCreatedTotal((prev) =>
                      Math.max(prev, Math.min(MAX_TRANSACTION_PRODUCTS, panelState.bankSimulation.products.length)),
                    );
                  }
                  setBankSimulation((prev) => {
                    const products: BankProduct[] = Array.isArray(panelState.bankSimulation.products)
                      ? panelState.bankSimulation.products.map((product: unknown) => {
                          const raw = product as Partial<BankProduct>;
                          return {
                            ...(raw as BankProduct),
                            assistant: normalizeProductAssistantState(raw.assistant),
                            productType:
                              raw.productType === 'debit_account' ||
                              raw.productType === 'checking_account' ||
                              raw.productType === 'savings_account' ||
                              raw.productType === 'consumer_loan' ||
                              raw.productType === 'mortgage' ||
                              raw.productType === 'investment_account'
                                ? raw.productType
                                : 'credit_card',
                            simulationAccepted: Boolean(raw.simulationAccepted),
                            connected: Boolean(raw.connected),
                            randomMode: false,
                            uploadedFiles: Array.isArray(raw.uploadedFiles) ? raw.uploadedFiles : [],
                            parsedDocuments: Array.isArray(raw.parsedDocuments) ? raw.parsedDocuments : [],
                          };
                        })
                      : prev.products;
                    const taxonomyOverrides = Array.isArray((panelState.bankSimulation as any).taxonomyOverrides)
                      ? ((panelState.bankSimulation as any).taxonomyOverrides as unknown[])
                          .map(normalizeTransactionTaxonomyOverride)
                          .filter((item): item is TransactionTaxonomyOverride => Boolean(item))
                      : prev.taxonomyOverrides;
                    const requestedActiveProductId =
                      typeof panelState.bankSimulation.activeProductId === 'string'
                        ? panelState.bankSimulation.activeProductId
                        : prev.activeProductId;
                    const activeProductId =
                      requestedActiveProductId && products.some((product) => product.id === requestedActiveProductId)
                        ? requestedActiveProductId
                        : products[0]?.id ?? null;
                    const snapshot = getSimulationSnapshot(products, activeProductId);

                    return {
                      ...prev,
                      products,
                      taxonomyOverrides,
                      activeProductId,
                      lockedMonth:
                        typeof panelState.bankSimulation.lockedMonth === 'string'
                          ? panelState.bankSimulation.lockedMonth
                          : prev.lockedMonth,
                      connected: snapshot.connected,
                      randomMode: snapshot.randomMode,
                      uploadedFiles: snapshot.uploadedFiles,
                      parsedDocuments: snapshot.parsedDocuments,
                    };
                  });
                }
              }
            }
          } catch {}
          setPanelStateLoaded(true);
        }
      });

    return () => {
      alive = false;
    };
  }, [authBootstrapped, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!panelStateLoaded) return;
    if (panelSaveTimerRef.current) clearTimeout(panelSaveTimerRef.current);

    panelSaveTimerRef.current = setTimeout(() => {
      const snapshot = buildPanelSnapshot();
      try {
        localStorage.setItem(panelStateBackupKey, JSON.stringify(snapshot));
      } catch {}
      savePanelState(snapshot).catch(() => {});
    }, 1200);

    return () => {
      if (panelSaveTimerRef.current) clearTimeout(panelSaveTimerRef.current);
    };
  }, [budgetRows, budgetChatAnswers, bankSimulation, txProductsCreatedTotal, savedReports, panelStateLoaded, panelStateBackupKey]);

  useEffect(() => {
    if (!isAuthenticated || !panelStateLoaded) return;
    const hasPanelContext =
      bankSimulation.products.length > 0 ||
      budgetRows.some((row) => row.amount > 0 || row.category.trim().length > 0);
    if (!hasPanelContext) return;

    const timer = window.setTimeout(() => {
      void syncFinancialContextToIntake().catch(() => {});
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, panelStateLoaded, bankSimulation.products, bankSimulation.activeProductId, budgetRows]);

  useEffect(() => {
    const prevScore = previousKnowledgeScoreRef.current;
    const scoreDelta = knowledgeScore - prevScore;
    const prevDone = previousMilestoneDoneIdsRef.current;
    const nowDone = new Set(milestones.filter((m) => m.done).map((m) => m.id));
    const newlyUnlocked = milestones
      .filter((m) => m.done && !prevDone.has(m.id))
      .map((m) => m.id);

    previousKnowledgeScoreRef.current = knowledgeScore;
    previousMilestoneDoneIdsRef.current = nowDone;

    if (prevScore === 0) return;
    if (scoreDelta <= 0 && newlyUnlocked.length === 0) return;

    const levelText =
      newlyUnlocked.length > 0
        ? `Hito desbloqueado: ${milestones.find((m) => m.id === newlyUnlocked[0])?.label ?? 'nuevo avance'}`
        : `+${scoreDelta}% conocimiento`;

    setProgressPulse(true);
    setLevelUpText(levelText);

    const pulseTimer = window.setTimeout(() => setProgressPulse(false), 720);
    const textTimer = window.setTimeout(() => setLevelUpText(null), 2300);

    return () => {
      window.clearTimeout(pulseTimer);
      window.clearTimeout(textTimer);
    };
  }, [knowledgeScore, milestones]);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const schedule = (ms: number) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState !== 'visible') {
        schedule(60000);
        return;
      }
      if (inFlight) {
        schedule(20000);
        return;
      }
      inFlight = true;
      try {
        const info = await getSessionInfo();
        if (alive) setSessionInfo(info);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401 && alive) {
          setIsAuthenticated(false);
          router.replace('/login');
          return;
        }
      }
      finally {
        inFlight = false;
        schedule(20000);
      }
    };

    void tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [authBootstrapped, isAuthenticated, router]);

  useEffect(() => {
    if (typeof sessionInfo?.knowledgeScore === 'number') {
      setPersistentKnowledgeScore(sessionInfo.knowledgeScore);
    }
  }, [sessionInfo?.knowledgeScore]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProfileIfNeeded().catch(() => {});
  }, [isAuthenticated, loadProfileIfNeeded]);

  useEffect(() => {
    try {
      const prefill = localStorage.getItem('agent.prefill_prompt');
      if (!prefill) return;
      setDraftForActive(prefill);
      localStorage.removeItem('agent.prefill_prompt');
    } catch {}
  }, [activeChatId]);

  // Re-focus composer after a blocking modal closes
  useEffect(() => {
    if (!hasBlockingModalOpen && !isActiveChatLocked) {
      setTimeout(() => chatComposerRef.current?.focus(), 80);
    }
  }, [hasBlockingModalOpen, isActiveChatLocked]);

  // Haptic feedback — usa Vibration API si esta disponible (Android/algunos iOS PWA)
  function haptic(pattern: number | number[] = 10) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  async function onSend(
    messageOverride?: string,
    options?: {
      agentPayload?: string;
      assistantPendingLabel?: string;
      hideUserMessage?: boolean;
    }
  ) {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    const liveComposerText = chatComposerRef.current?.value ?? '';
    const outgoingText = String(messageOverride ?? liveComposerText ?? input ?? '').trim();
    if (!outgoingText || loading) return;
    if (isActiveChatLocked) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'Este chat todavia esta bloqueado. Terminemos primero el flujo base en el Chat 1: productos/transacciones, presupuesto y entrevista breve para construir el diagnostico.',
          mode: 'information',
        },
      ]);
      return;
    }
    haptic(8); // feedback al enviar mensaje

    const userMessage = outgoingText;
    const agentMessage = String(options?.agentPayload ?? userMessage).trim();
    const pendingLabel = String(options?.assistantPendingLabel ?? '').trim();
    const hideUserMessage = options?.hideUserMessage === true;

    const removePendingAssistantMessage = (list: ChatItem[]): ChatItem[] => {
      if (!pendingLabel) return list;
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (
          item.type === 'message' &&
          item.role === 'assistant' &&
          String(item.content ?? '').trim() === pendingLabel
        ) {
          return [...list.slice(0, i), ...list.slice(i + 1)];
        }
      }
      return list;
    };
    setDraftForActive('');
    setLoading(true);

    const historySnapshot = items
      .filter((it) => it.type === 'message')
      .map((m) => ({
        role: (m as any).role,
        content: (m as any).content,
      }))
      .slice(-8);
    const recentArtifacts = items
      .filter((it) => it.type === 'artifact')
      .slice(-4)
      .map((it) => {
        const artifact = (it as Extract<ChatItem, { type: 'artifact' }>).artifact;
        return {
          id: artifact.id,
          title: artifact.title,
          description: artifact.description,
          source: artifact.source,
          createdAt: artifact.createdAt,
          meta: artifact.meta,
        };
      });
    const recentChartSummaries = items
      .filter((it) => it.type === 'message' && it.role === 'assistant')
      .slice(-6)
      .flatMap((it) => {
        const blocks = (it as Extract<ChatItem, { type: 'message'; role: 'assistant' }>).agent_blocks ?? [];
        return blocks
          .filter((b): b is AgentBlock & { type: 'chart' } => b.type === 'chart')
          .map((b) => ({
            title: b.chart.title,
            subtitle: b.chart.subtitle,
            kind: b.chart.kind,
            xKey: b.chart.xKey,
            yKey: b.chart.yKey,
            points: Array.isArray(b.chart.data) ? b.chart.data.length : 0,
            lastValue:
              Array.isArray(b.chart.data) && b.chart.data.length > 0
                ? Number(
                    b.chart.data[b.chart.data.length - 1]?.[
                      b.chart.yKey as keyof (typeof b.chart.data)[number]
                    ] ?? 0
                  )
                : undefined,
          }));
      })
      .slice(-4);

    const asksToExplainChart =
      /\b(explica|explicar|interpreta|interpretar|lee|analiza|comenta|desglosa)\b[\s\S]*\b(gr[aá]fic(?:o|os)|chart(?:s)?)\b/i.test(
        agentMessage
      ) ||
      /\b(gr[aá]fic(?:o|os)|chart(?:s)?)\b/i.test(agentMessage);
    const enrichedUserMessage =
      asksToExplainChart && recentChartSummaries.length > 0
        ? `${agentMessage}\n\nContexto del último gráfico en chat: ${JSON.stringify(
            recentChartSummaries.slice(-1)[0]
          )}`
        : agentMessage;

    if (!hideUserMessage) {
      setItemsForActive((prev) => [
        ...prev,
        { type: 'message', role: 'user', content: userMessage },
      ]);
    }
    if (pendingLabel) {
      setItemsForActive((prev) => [
        ...prev,
        { type: 'message', role: 'assistant', content: pendingLabel, mode: 'information' },
      ]);
    }

    // Increment user message count for sheet cycling
    setChatThreads((prev) =>
      prev.map((t) =>
        t.id === activeChatId
          ? { ...t, userMessageCount: t.userMessageCount + 1 }
          : t
      )
    );

    try {
      const scopedTxContext = buildScopedTransactionsContext(
        bankSimulation.products,
        bankSimulation.activeProductId,
      );
      const res = (await sendToAgent({
        user_message: enrichedUserMessage,
        session_id: getSessionId(),
        history: historySnapshot,
        context: {
          recent_artifacts: recentArtifacts,
          recent_chart_summaries: recentChartSummaries,
          uploaded_documents: scopedTxContext.scopedUploadedDocuments,
          uploaded_evidence_files: scopedTxContext.scopedUploadedEvidenceFiles,
          consolidated_context: {
            transactions: {
              scope: 'active_product',
              activeProductId: scopedTxContext.activeProduct?.id ?? null,
              activeProductLabel: scopedTxContext.activeProduct?.label ?? null,
              activeProductBank: scopedTxContext.activeProduct?.bank ?? null,
              activeProductType: scopedTxContext.activeProduct?.productType ?? null,
              connected: Boolean(scopedTxContext.activeProduct?.connected),
              productsCount: bankSimulation.products.length,
              uploadedFiles: scopedTxContext.scopedUploadedEvidenceFiles,
              productsIndex: scopedTxContext.productsIndex,
              activeProduct: scopedTxContext.activeProduct
                ? {
                    id: scopedTxContext.activeProduct.id,
                    label: scopedTxContext.activeProduct.label,
                    bank: scopedTxContext.activeProduct.bank,
                    productType: scopedTxContext.activeProduct.productType,
                    dashboardSummary: scopedTxContext.activeProduct.dashboard?.summary ?? '',
                    keyMetrics: scopedTxContext.activeProduct.dashboard?.keyMetrics ?? null,
                    movements: scopedTxContext.activeProduct.dashboard?.movements?.slice(0, 40) ?? [],
                  }
                : null,
            },
          },
        },
        ui_state: {
          panel_stage: panelStage,
          panel_collapsed: isPanelCollapsed,
          active_chat: {
            id: activeThread?.id ?? activeChatId,
            label: activeThread?.label ?? 'Core',
            name: activeThread?.name ?? 'Diagnóstico financiero',
          },
          unlocked_modules: {
            budget: unlockedPanelBlocks.budgetUnlocked,
            transactions: unlockedPanelBlocks.transactionsUnlocked,
            interview: canOpenInterview,
            post_diagnosis_chats: interviewCompleted,
          },
          knowledge_score: knowledgeScore,
          engagement_score: engagementScore,
          completed_milestones: completedMilestones,
          total_milestones: milestones.length,
          milestone_details: milestones.map((m) => ({ id: m.id, label: m.label, done: m.done })),
          reports_count: savedReports.length,
          has_profile: Boolean(sessionInfo?.injectedProfile || profile),
          has_intake: Boolean(sessionInfo?.injectedIntake),
          budget_summary: {
            income: budgetTotals.income,
            expenses: budgetTotals.expenses,
            balance: budgetTotals.balance,
            rows_count: budgetRows.filter((r) => r.amount > 0).length,
          },
          budget_rows: budgetRows
            .filter((r) => r.amount > 0 || r.category.trim().length > 0)
            .slice(0, 20)
            .map((r) => ({ category: r.category, type: r.type, amount: r.amount, note: r.note })),
          flow_status: getFlowStatus(),
        },
        preferences: {
          response_style: 'professional',
          language: 'es-CL',
        },
      })) as AgentResponse;

      agentMetaRef.current.objective =
        res?.react?.objective ?? agentMetaRef.current.objective;
      agentMetaRef.current.mode = res?.mode ?? agentMetaRef.current.mode;
      if (typeof res?.knowledge_score === 'number') {
        setPersistentKnowledgeScore(res.knowledge_score);
      }
      if (res?.milestone_unlocked?.feature) {
        setLevelUpText(`Hito desbloqueado: ${res.milestone_unlocked.feature}`);
      }
      if (res?.meta?.product_lifecycle) {
        const metaLifecycle = res.meta.product_lifecycle;
        setProductLifecycle((prev) => ({
          ...(prev ?? {}),
          phase: typeof metaLifecycle.phase === 'string' ? metaLifecycle.phase : prev?.phase,
          unlockedChats: Array.isArray(metaLifecycle.unlocked_chats)
            ? metaLifecycle.unlocked_chats
            : prev?.unlockedChats,
          closedChats: Array.isArray(metaLifecycle.closed_chats)
            ? metaLifecycle.closed_chats
            : prev?.closedChats,
          chatTurns: {
            ...(prev?.chatTurns ?? {}),
            ...(typeof metaLifecycle.active_chat_id === 'string' &&
            typeof metaLifecycle.turn_count === 'number'
              ? { [metaLifecycle.active_chat_id]: metaLifecycle.turn_count }
              : {}),
          },
          actionPlanFunnelStage:
            metaLifecycle.action_plan_funnel_stage === 'brainstorm' ||
            metaLifecycle.action_plan_funnel_stage === 'converge' ||
            metaLifecycle.action_plan_funnel_stage === 'deliver'
              ? metaLifecycle.action_plan_funnel_stage
              : prev?.actionPlanFunnelStage,
          closingMode:
            typeof metaLifecycle.closing_mode === 'boolean'
              ? metaLifecycle.closing_mode
              : prev?.closingMode,
        }));
      }
      forceRender((x) => x + 1);

      res.panel_action = normalizePanelActionForCurrentFlow(res.panel_action);

      // Handle panel action from agent
      if (res?.panel_action && (res.panel_action.section || res.panel_action.message)) {
        handlePanelAction(res.panel_action);
      }

      // Handle budget updates inferred by agent from conversation
      if (Array.isArray(res?.budget_updates) && res.budget_updates.length > 0) {
        setBudgetRows((prev) => {
          const updated = [...prev];
          const normalizeBudgetKey = (value: string) =>
            String(value ?? '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^\w\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          for (const upd of res.budget_updates!) {
            const normalizedLabel = normalizeBudgetKey(upd.label);
            const normalizedCategory = normalizeBudgetKey(
              upd.category ?? (upd.type === 'income' ? 'Ingresos' : 'Gastos')
            );
            // Match by type + category/label against category and note (stable, avoids duplicates).
            const existingIdx = updated.findIndex(
              (r) => {
                if (r.type !== upd.type) return false;
                const rowCategory = normalizeBudgetKey(r.category);
                const rowNote = normalizeBudgetKey(r.note ?? '');
                return (
                  rowCategory === normalizedCategory ||
                  rowCategory === normalizedLabel ||
                  rowNote === normalizedLabel ||
                  rowNote.includes(normalizedLabel)
                );
              }
            );
            if (existingIdx >= 0) {
              // Update existing row amount
              updated[existingIdx] = { ...updated[existingIdx], amount: upd.amount };
            } else {
              if (updated.length >= MAX_BUDGET_ROWS) continue;
              // Add new row
              updated.push({
                id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                category: upd.category ?? (upd.type === 'income' ? 'Ingresos' : 'Gastos'),
                type: upd.type,
                amount: upd.amount,
                note: upd.label,
              });
            }
          }
          return updated.slice(0, MAX_BUDGET_ROWS);
        });
      }

      // Update context score + check sheet cycling (50-message limit per sheet)
      if (typeof res?.context_score === 'number') {
        setChatThreads((prev) => {
          const updated = prev.map((t) => {
            if (t.id !== activeChatId) return t;
            const newScore = Math.max(t.contextScore, res.context_score!);
            return { ...t, contextScore: newScore };
          });
          return updated;
        });
      }

      const next = sanitizeChatItems(toChatItemsFromAgentResponse(res));
      const hasAssistantInHistory = items.some(
        (it) => it.type === 'message' && it.role === 'assistant'
      );
      const nextFiltered =
        hasAssistantInHistory
          ? next.filter((it) => {
              if (it.type !== 'message' || it.role !== 'assistant') return true;
              return !isGenericOnboardingMessage(it.content);
            })
          : next;
      if (nextFiltered.length === 0) {
        setItemsForActive((prev) => {
          const base = removePendingAssistantMessage(prev);
          return [
            ...base,
            {
              type: 'message',
              role: 'assistant',
              content: sanitizeMessageText(res.message, '—'),
              mode: res.mode ?? res.reasoning_mode,
              objective: res.react?.objective,
              agent_blocks: res.agent_blocks,
            },
          ];
        });
      } else {
        setItemsForActive((prev) => {
          const base = removePendingAssistantMessage(prev);
          return [...base, ...nextFiltered];
        });
      }
    } catch (err) {
      const errorText = toUserFacingError(err, 'chat.send');
      setItemsForActive((prev) => {
        const base = removePendingAssistantMessage(prev);
        return [
          ...base,
          {
            type: 'message',
            role: 'assistant',
            content: errorText,
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  async function onUploadFromChat(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    const allowedExt = new Set([
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'pdf',
      'xls',
      'xlsx',
      'csv',
      'tsv',
      'txt',
      'md',
      'json',
      'xml',
      'yaml',
      'yml',
      'log',
    ]);
    const accepted = selected.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      return file.type.startsWith('image/') || file.type === 'application/pdf' || allowedExt.has(ext);
    });
    const rejected = selected.filter((file) => !accepted.includes(file));
    const totalBytes = accepted.reduce((sum, file) => sum + file.size, 0);
    if (accepted.length === 0) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'No pude adjuntar esos formatos. Sube PDF, imágenes, Excel, CSV/TSV, TXT/MD, JSON, XML, YAML o LOG.',
        },
      ]);
      return;
    }
    if (totalBytes > 35 * 1024 * 1024) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: 'La carga supera 35 MB. Divide los archivos y vuelve a intentar.',
        },
      ]);
      return;
    }

    if (rejected.length > 0) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: `Omití ${rejected.length} archivo(s) no compatible(s): ${rejected
            .map((f) => f.name)
            .slice(0, 6)
            .join(', ')}.`,
        },
      ]);
    }

    const topNameHints = activeBankProduct
      ? {
          institutionHint: activeBankProduct.bank,
          serviceHint: activeBankProduct.label,
          productTypeHint: activeBankProduct.productType,
          productLabelHint: activeBankProduct.label,
        }
      : undefined;
    const uploadFiles = accepted.map((file) => ({
      name: file.name,
      mime: file.type || undefined,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setItemsForActive((prev) => [
      ...prev,
      { type: 'upload', role: 'user', files: uploadFiles },
    ]);

    const encodedFiles = await Promise.all(
      accepted.map(
        (file) =>
          new Promise<{ name: string; base64: string; mimeType?: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const raw = typeof reader.result === 'string' ? reader.result : '';
              const base64 = raw.includes(',') ? raw.split(',')[1] ?? '' : raw;
              resolve({ name: file.name, base64, mimeType: file.type || undefined });
            };
            reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
            reader.readAsDataURL(file);
          })
      )
    );

    let parsed: { documents?: ParsedUploadDocument[]; transactionAnalysis?: unknown } | null = null;
    try {
      setDocumentsLoading(true);
      parsed = await parseDocuments(encodedFiles, topNameHints);
    } catch {
      parsed = null;
    } finally {
      setDocumentsLoading(false);
    }

    const names = accepted.map((f) => f.name);
    const parsedDocs = Array.isArray(parsed?.documents) ? parsed.documents : [];
    if (parsedDocs.length === 0) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'No pude procesar esos archivos todavía. Vuelve a intentar y, si persiste, prueba con PDF/Excel/imagen más liviano.',
        },
      ]);
      return;
    }

    const docsSummary = parsedDocs.map((doc) => {
      const format = String(doc.insight?.format ?? '').toLowerCase() || (doc.name.split('.').pop()?.toLowerCase() ?? 'unknown');
      const reliability = Number(doc.insight?.reliability ?? 0);
      const extractedRows = Number(doc.insight?.extracted_rows ?? 0);
      const keyFindings = Array.isArray(doc.insight?.key_findings) ? doc.insight!.key_findings!.slice(0, 4) : [];
      return {
        name: doc.name,
        format,
        reliability: Number.isFinite(reliability) ? Number(reliability.toFixed(3)) : undefined,
        extractedRows: Number.isFinite(extractedRows) ? extractedRows : 0,
        keyFindings,
        preview: String(doc.text || '').slice(0, 450),
      };
    });
    const analysisEnvelope =
      parsed?.transactionAnalysis && typeof parsed.transactionAnalysis === 'object'
        ? parsed.transactionAnalysis
        : undefined;
    const message = `Cargué y procesé estos archivos para analizarlos contigo: ${names.join(
      ', '
    )}. Analiza este paquete documental con enfoque profesional, detecta inconsistencias y oportunidades, y cita evidencia exacta por archivo. DOCUMENTOS_JSON=${JSON.stringify(
      docsSummary
    )}${analysisEnvelope ? ` ANALISIS_TRANSACCIONAL_JSON=${JSON.stringify(analysisEnvelope)}` : ''}`;
    void onSend(message);
  }

  async function syncFinancialContextToIntake() {
    await mergeProductsContextToIntake({
      productsContext: buildPersistableProductsContext(
        bankSimulation.products,
        bankSimulation.activeProductId
      ),
      budgetContext: buildPersistableBudgetContext(),
    });
  }

  function buildInterviewIntakePayload() {
    const baseIntake =
      sessionInfo?.injectedIntake?.intake && typeof sessionInfo.injectedIntake.intake === 'object'
        ? (sessionInfo.injectedIntake.intake as Record<string, unknown>)
        : ((intakeData ?? {}) as Record<string, unknown>);

    return {
      ...baseIntake,
      __productsContext: buildPersistableProductsContext(
        bankSimulation.products,
        bankSimulation.activeProductId
      ),
      __budgetContext: buildPersistableBudgetContext(),
    };
  }

  function sendBudgetToAgent() {
    const rowsWithData = budgetRows
      .filter((r) => r.amount > 0 || (r.category ?? '').trim().length > 0)
      .slice(0, 24);
    const budgetSummary = rowsWithData.map((r) => ({
      id: r.id,
      category: (r.category ?? '').trim().slice(0, 64) || 'sin_categoria',
      type: r.type === 'income' ? 'income' : 'expense',
      amount: Math.round(Number(r.amount) || 0),
      parentId: r.parentId ?? null,
    }));
    const intakeCompact = (() => {
      const intake = (intakeData ?? {}) as Record<string, unknown>;
      return {
        age: intake.age ?? null,
        employmentStatus: intake.employmentStatus ?? null,
        exactMonthlyIncome: intake.exactMonthlyIncome ?? null,
        incomeBand: intake.incomeBand ?? null,
        hasDebt: intake.hasDebt ?? null,
        hasSavings: intake.hasSavingsOrInvestments ?? null,
        riskReaction: intake.riskReaction ?? null,
      };
    })();
    const income = Math.round(Number(budgetTotals.income) || 0);
    const expenses = Math.round(Number(budgetTotals.expenses) || 0);
    const balance = Math.round(Number(budgetTotals.balance) || 0);
    const savingsRate = Number.isFinite(budgetInsights.savingsRate) ? Math.round(budgetInsights.savingsRate) : 0;
    const healthScore = Number.isFinite(budgetInsights.healthScore) ? Math.round(budgetInsights.healthScore) : 0;
    const expenseTop3 = rowsWithData
      .filter((r) => r.type === 'expense' && Number(r.amount) > 0)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 3)
      .map((r) => ({
        category: (r.category ?? '').trim() || 'sin_categoria',
        amount: Math.round(Number(r.amount) || 0),
      }));
    const message = [
      'ROL: Analista financiero senior. Objetivo: emitir un informe ejecutivo premium del presupuesto mensual del usuario.',
      'FUENTE DE VERDAD: usa EXCLUSIVAMENTE los datos entregados abajo. No inventes montos, categorías, deudas, ingresos, productos ni metas.',
      `DATOS_CERRADOS=${JSON.stringify({
        kpis: { income, expenses, balance, savingsRatePct: savingsRate, healthScore },
        intake: intakeCompact,
        budgetRows: budgetSummary,
        top3Expenses: expenseTop3,
      })}`,
      'REGLAS ANTI-ALUCINACIÓN:',
      '- Si falta información clave para una recomendación exacta, decláralo explícitamente como "dato faltante".',
      '- No uses supuestos ocultos ni referencias externas.',
      '- Si detectas inconsistencia numérica, señálala con cifras y propone validación.',
      'FORMATO OBLIGATORIO (informe premium):',
      '- Usa markdown editorial y jerarquía clara: 1 título #, secciones ## y subsecciones ###.',
      '- Escribe profesional, sobrio y directo. Sin ruido, sin relleno.',
      '- Máximo 2-4 frases por sección.',
      'SECCIONES OBLIGATORIAS:',
      '1) # Informe Ejecutivo de Presupuesto',
      '2) ## Diagnóstico ejecutivo',
      '3) ## Riesgos y desviaciones clave',
      '4) ## Plan de ajuste priorizado (exactamente 3 acciones con monto CLP e impacto mensual)',
      '5) ## Meta mensual recomendada (CLP y % del ingreso)',
      '6) ## Datos faltantes críticos',
      'BLOQUES VISUALES OBLIGATORIOS (usar tags literales):',
      '- Incluir exactamente 2 bloques <CHART> válidos ANTES de SUGERENCIAS:',
      '  a) Gráfico bar: Ingreso vs Gasto vs Balance.',
      '  b) Gráfico bar: Top 5 gastos por categoría (si faltan, usar las disponibles y declararlo).',
      '- Incluir exactamente 1 bloque <TABLE> válido con columnas:',
      '  ["Categoría","Monto CLP","% del gasto","Prioridad de ajuste","Acción sugerida"]',
      '- Todos los montos en CLP enteros; porcentajes redondeados.',
      'REGLAS DE CONSISTENCIA:',
      '- No uses LaTeX.',
      '- No uses símbolos markdown rotos ni bullets mixtos (ej: "1. •").',
      '- Si un dato no existe en DATOS_CERRADOS, escríbelo como "dato faltante".',
      '- Cierra con SUGERENCIAS accionables y breves.',
    ].join('\n');
    setBudgetChatAnswers([]);
    setIsBudgetModalOpen(false);
    void syncFinancialContextToIntake().catch(() => {});
    void onSend('Configurar presupuesto', {
      agentPayload: message,
      assistantPendingLabel:
        'Configurando presupuesto con Financieramente… construyendo informe ejecutivo premium con gráficos.',
      hideUserMessage: true,
    });
  }

  function openTransactionsPanel() {
    if (!unlockedPanelBlocks.transactionsUnlocked) return;
    const activeProduct =
      bankSimulation.products.find((product) => product.id === bankSimulation.activeProductId) ?? null;
    setTxWizardStep(resolveTxWizardStep(activeProduct));
    setTransactionUploadError(null);
    setIsTransactionsModalOpen(true);
  }

  async function openInterviewModal() {
    await syncFinancialContextToIntake().catch(() => {});
    setInterviewIntake(buildInterviewIntakePayload() as any);
    setIsInterviewModalOpen(true);
  }

  function openDiagnosisView() {
    router.push('/diagnosis');
  }

  useEffect(() => {
    if (interviewAutoOpenHandledRef.current) return;
    if (searchParams.get('openInterview') !== '1') return;
    interviewAutoOpenHandledRef.current = true;
    openInterviewModal();
    router.replace('/agent');
  }, [openInterviewModal, router, searchParams]);

  function openPanelSectionFromChat(action: NonNullable<AgentResponse['panel_action']>) {
    handlePanelAction(action);
    const section = action.section;
    if (section === 'transactions' || section === 'products_transactions') {
      openTransactionsPanel();
      return;
    }
    if (section === 'budget') {
      if (!unlockedPanelBlocks.budgetUnlocked) {
        handlePanelAction({
          section: 'products_transactions',
          message: 'Presupuesto sigue bloqueado: primero completa Productos y Transacciones.',
        });
        openTransactionsPanel();
        return;
      }
      setIsBudgetModalOpen(true);
      return;
    }
    if (section === 'interview') {
      if (!canOpenInterview) {
        const flow = getFlowStatus();
        if (!flow.transactionsCompleted) {
          handlePanelAction({
            section: 'products_transactions',
            message: 'Entrevista está bloqueada: primero completa Productos y Transacciones.',
          });
          openTransactionsPanel();
          return;
        }
        handlePanelAction({
          section: 'budget',
          message: 'Entrevista está bloqueada: completa el presupuesto antes de la llamada.',
        });
        setIsBudgetModalOpen(true);
        return;
      }
      openInterviewModal();
    }
  }

  function addTransactionProduct() {
    if (txProductsCreatedTotal >= MAX_TRANSACTION_PRODUCTS) {
      setTransactionUploadError(`Solo puedes crear ${MAX_TRANSACTION_PRODUCTS} productos por usuario.`);
      return;
    }
    setTxCreationNotice(null);
    const id = `prod-${Date.now()}`;
    const product: BankProduct = {
      id,
      label: `Producto ${bankSimulation.products.length + 1}`,
      bank: '',
      assistant: {
        messages: [],
        uploadFormat: null,
        summaryText: null,
        summaryModel: null,
        summaryGeneratedAt: null,
        summaryRegenerationsUsed: 0,
        lastSummaryFeedback: null,
      },
      productType: 'credit_card',
      simulationAccepted: false,
      connected: false,
      randomMode: false,
      uploadedFiles: [],
      parsedDocuments: [],
    };
    setBankSimulation((prev) => {
      const products = [product, ...prev.products];
      const snapshot = getSimulationSnapshot(products, id);
      return {
        ...prev,
        products,
        activeProductId: id,
        connected: snapshot.connected,
        randomMode: snapshot.randomMode,
        uploadedFiles: snapshot.uploadedFiles,
        parsedDocuments: snapshot.parsedDocuments,
      };
    });
    setTxProductsCreatedTotal((prev) => prev + 1);
    setTransactionUploadError(null);
    setTxWizardStep('credentials');
  }

  function saveTransactionProductForBatch() {
    if (!activeBankProduct) return;
    if (!activeBankProduct.connected) {
      setTransactionUploadError('Autoriza y conecta el producto antes de guardarlo.');
      return;
    }
    setSavedProductsForBatch((prev) =>
      prev.includes(activeBankProduct.id) ? prev : [...prev, activeBankProduct.id]
    );
    setTransactionUploadError(null);
  }

  function selectTransactionProduct(productId: string) {
    const selectedProduct = bankSimulation.products.find((p) => p.id === productId) ?? null;
    setBankSimulation((prev) => {
      const product = prev.products.find((p) => p.id === productId);
      if (!product) return prev;
      const snapshot = getSimulationSnapshot(prev.products, product.id);
      return {
        ...prev,
        activeProductId: product.id,
        connected: snapshot.connected,
        randomMode: snapshot.randomMode,
        uploadedFiles: snapshot.uploadedFiles,
        parsedDocuments: snapshot.parsedDocuments,
      };
    });
    setTransactionUploadError(null);
    setTxWizardStep(resolveTxWizardStep(selectedProduct));
  }

  function updateActiveProduct(updates: Partial<BankProduct>) {
    setBankSimulation((prev) => {
      if (!prev.activeProductId) return prev;
      const products = prev.products.map((p) =>
        p.id === prev.activeProductId ? { ...p, ...updates } : p
      );
      const snapshot = getSimulationSnapshot(products, prev.activeProductId);
      return {
        ...prev,
        products,
        connected: snapshot.connected,
        randomMode: snapshot.randomMode,
        uploadedFiles: snapshot.uploadedFiles,
        parsedDocuments: snapshot.parsedDocuments,
      };
    });
  }

  function upsertTransactionTaxonomyOverride(override: TransactionTaxonomyOverride) {
    const normalized = normalizeTransactionTaxonomyOverride(override);
    if (!normalized) return;
    setBankSimulation((prev) => {
      const nextOverrides = [
        normalized,
        ...prev.taxonomyOverrides.filter((item) => item.matchKey !== normalized.matchKey),
      ].slice(0, 400);
      return {
        ...prev,
        taxonomyOverrides: nextOverrides,
      };
    });
  }

  function removeTransactionTaxonomyOverride(matchKey: string) {
    const normalizedKey = normalizeTaxonomyKey(matchKey);
    if (!normalizedKey) return;
    setBankSimulation((prev) => ({
      ...prev,
      taxonomyOverrides: prev.taxonomyOverrides.filter((item) => item.matchKey !== normalizedKey),
    }));
  }

  function deleteTransactionProduct(productId: string) {
    const products = bankSimulation.products.filter((p) => p.id !== productId);
    const nextActiveId =
      bankSimulation.activeProductId === productId ? products[0]?.id ?? null : bankSimulation.activeProductId;
    const nextActive = nextActiveId ? products.find((p) => p.id === nextActiveId) ?? null : null;
    setBankSimulation((prev) => {
      const snapshot = getSimulationSnapshot(products, nextActiveId);
      return {
        ...prev,
        products,
        activeProductId: nextActiveId,
        connected: snapshot.connected,
        randomMode: snapshot.randomMode,
        uploadedFiles: snapshot.uploadedFiles,
        parsedDocuments: snapshot.parsedDocuments,
      };
    });
    setTransactionUploadError(null);
    setTxWizardStep(resolveTxWizardStep(nextActive));
  }

  function simulateBankLogin(nextConfig?: {
    bank?: string;
    label?: string;
    productType?: BankProduct['productType'];
  }) {
    if (!activeBankProduct) return;
    if (!activeBankProduct.simulationAccepted) {
      setTransactionUploadError('Debes aceptar que este flujo es de simulación y no ingresar credenciales reales.');
      return;
    }
    const nextBank = String(nextConfig?.bank ?? activeBankProduct.bank ?? '').trim();
    const nextLabel = String(nextConfig?.label ?? activeBankProduct.label ?? '').trim();
    const nextProductType = nextConfig?.productType ?? activeBankProduct.productType;
    updateActiveProduct({
      bank: nextBank,
      label: nextLabel || activeBankProduct.label,
      productType: nextProductType,
      connected: nextBank.length > 0,
      randomMode: false,
    });
    setTransactionUploadError(null);
    setTxWizardStep('upload');
  }

  async function onUploadStatement(
    files: File[] | FileList | null
  ): Promise<UploadStatementResult | null> {
    if (!isAuthenticated) {
      router.replace('/login');
      return null;
    }
    if (!files) return null;
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    if (fileArray.length === 0) return null;
    if (!activeBankProduct) return null;
    const targetProductId = activeBankProduct.id;
    if ((activeBankProduct.parsedDocuments?.length ?? 0) > 0) {
      setTransactionUploadError('Este producto ya fue analizado. Solo se permite 1 análisis por producto.');
      return null;
    }

    const allowedExt = new Set([
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'pdf',
      'xls',
      'xlsx',
      'csv',
      'tsv',
      'txt',
      'md',
      'json',
      'xml',
      'yaml',
      'yml',
      'log',
    ]);
    const selectedFiles = fileArray.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      return file.type.startsWith('image/') || file.type === 'application/pdf' || allowedExt.has(ext);
    });
    if (selectedFiles.length === 0) {
      setTransactionUploadError(
        'Formato no soportado. Usa imagen, PDF, XLS/XLSX, CSV/TSV, TXT/MD, JSON, XML, YAML o LOG.',
      );
      return null;
    }
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 35 * 1024 * 1024) {
      setTransactionUploadError('El total adjunto supera 35 MB. Divide la carga en bloques más pequeños.');
      return null;
    }
    const availableSlots = Math.max(0, MAX_EVIDENCE_FILES_PER_PRODUCT - activeBankProduct.uploadedFiles.length);
    if (availableSlots <= 0) {
      setTransactionUploadError(`Este producto ya alcanzó el límite de ${MAX_EVIDENCE_FILES_PER_PRODUCT} archivos.`);
      return null;
    }
    const cappedFiles = selectedFiles.slice(0, availableSlots);
    if (cappedFiles.length < selectedFiles.length) {
      setTxCreationNotice(`Se cargaron ${cappedFiles.length} archivos. Límite por producto: ${MAX_EVIDENCE_FILES_PER_PRODUCT}.`);
    }
    const names = cappedFiles.map((f) => f.name);
    setTransactionUploadError(null);
    setDocumentsLoading(true);

    try {
      const encodedFiles = await Promise.all(
        cappedFiles.map(
          (file) =>
            new Promise<{ name: string; base64: string; mimeType?: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const raw = typeof reader.result === 'string' ? reader.result : '';
                const base64 = raw.includes(',') ? raw.split(',')[1] ?? '' : raw;
                resolve({ name: file.name, base64, mimeType: file.type || undefined });
              };
              reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
              reader.readAsDataURL(file);
            })
        )
      );

      const callParseDocuments = async () =>
        parseDocuments(encodedFiles, {
          institutionHint: activeBankProduct.bank,
          serviceHint: activeBankProduct.label,
          productTypeHint: activeBankProduct.productType,
          productLabelHint: activeBankProduct.label,
        });
      let parsed = await callParseDocuments();
      const parsedDocsFirstTry = Array.isArray(parsed?.documents) ? parsed.documents : [];
      if (parsedDocsFirstTry.length === 0) {
        // One safe retry to absorb transient backend/OCR timeouts in deploy.
        await new Promise((resolve) => setTimeout(resolve, 700));
        parsed = await callParseDocuments();
      }
      const parsedDocs = Array.isArray(parsed?.documents) ? parsed.documents : [];
      const transactionAnalysis = parsed?.transactionAnalysis as
        | {
            product_profile?: {
              institution?: string;
              service?: string;
              product_type?: BankProduct['productType'];
              product_label?: string;
              period?: { from?: string; to?: string };
              currency?: string;
              key_metrics?: {
                inflows_total: number;
                outflows_total: number;
                net_flow: number;
                avg_movement: number;
                movement_count: number;
                avg_category_confidence?: number;
              };
              top_categories?: Array<{ name: string; amount: number }>;
              top_merchants?: Array<{ merchant: string; category: string; amount: number; tx_count: number }>;
              category_examples?: Array<{ name: string; amount: number; examples: string[] }>;
              spend_clusters?: Array<{
                name: string;
                amount: number;
                tx_count: number;
                avg_ticket: number;
                share_pct: number;
                examples: string[];
              }>;
              top_expenses?: Array<{ label: string; amount: number; date?: string }>;
              top_income?: Array<{ label: string; amount: number; date?: string }>;
              alerts?: string[];
              alert_details?: Array<{ title: string; severity: 'high' | 'medium' | 'low'; reason: string }>;
              opportunities?: string[];
              metric_explanations?: Array<{ metric: string; value: string; explanation: string }>;
              executive_summary?: string;
            };
            document_insights?: Array<{
              name: string;
              format?: string;
              reliability?: number;
              extracted_rows?: number;
              key_findings?: string[];
            }>;
            movements?: Array<{
              date?: string;
              description: string;
              amount: number;
              direction: 'expense' | 'income';
              source_line?: string;
              category?: string;
              merchant?: string;
              category_confidence?: number;
              confidence?: number;
              source_kind?: 'table' | 'line';
            }>;
          }
        | undefined;
      const insightByName = new Map(
        Array.isArray(transactionAnalysis?.document_insights)
          ? transactionAnalysis!.document_insights!.map((item) => [item.name, item])
          : [],
      );
      const profile = transactionAnalysis?.product_profile;
      const profileInstitution = String(profile?.institution ?? '').trim();
      const profileLabel = String(profile?.product_label ?? '').trim();
      const profileType = profile?.product_type;
      const canonicalMovements = Array.isArray(transactionAnalysis?.movements)
        ? transactionAnalysis.movements
        : [];
      const normalizedParsedDocs = normalizeParsedUploadDocuments(parsedDocs, insightByName);
      const fallbackParsedDocs =
        normalizedParsedDocs.length > 0
          ? normalizedParsedDocs
          : canonicalMovements.length > 0 || insightByName.size > 0
            ? names.map((name) => ({
                documentId: undefined,
                name,
                text: '',
                summary: null,
                structuredData: null,
                insight: insightByName.get(name) as BankProduct['parsedDocuments'][number]['insight'],
              }))
            : [];
      if (fallbackParsedDocs.length === 0) {
        setTransactionUploadError(
          'No se detectó contenido transaccional en esos archivos. Intenta con un PDF/imagen más nítido o un Excel/CSV con columnas de fecha, descripción y monto.',
        );
        return null;
      }

      setBankSimulation((prev) => {
        const uploadApplied = applyUploadToTargetProduct(prev.products, targetProductId, fallbackParsedDocs, names);
        const active = uploadApplied.targetProduct;
        if (!active) return prev;
        const provisionalProduct: BankProduct = {
          ...active,
        };
        const descriptor = buildProductCardDescriptor(provisionalProduct);
        const inferredInstitution = inferInstitutionFromText(
          provisionalProduct.parsedDocuments.map((d) => d.text ?? '').join('\n'),
          active.bank,
        );
        const inferredType = inferProductTypeFromText(
          provisionalProduct.parsedDocuments.map((d) => d.text ?? '').join('\n'),
        );
        const generatedLabel =
          profileInstitution && profileLabel
            ? `${profileInstitution} · ${profileLabel}`
            : inferredInstitution !== 'Institución no identificada'
            ? `${inferredInstitution} · ${inferredType}`
            : active.label;

        const products = uploadApplied.products.map((p) =>
          p.id === active.id
            ? {
                ...p,
                assistant: normalizeProductAssistantState(p.assistant),
                bank: profileInstitution || p.bank.trim() || inferredInstitution,
                productType: profileType || p.productType,
                label: generatedLabel || descriptor.title || p.label,
                dashboard: profile
                  ? {
                      period: profile.period,
                      currency: profile.currency,
                      keyMetrics: profile.key_metrics,
                      topCategories: profile.top_categories,
                      topMerchants: profile.top_merchants,
                      categoryExamples: profile.category_examples,
                      spendClusters: profile.spend_clusters,
                      topExpenses: profile.top_expenses,
                      topIncome: profile.top_income,
                      alerts: profile.alerts,
                      alertDetails: profile.alert_details,
                      opportunities: profile.opportunities,
                      metricExplanations: profile.metric_explanations,
                      movements: canonicalMovements,
                      summary: profile.executive_summary,
                    }
                  : p.dashboard,
              }
            : p
        );
        const snapshot = getSimulationSnapshot(products, prev.activeProductId);
        return {
          ...prev,
          products,
          uploadedFiles: snapshot.uploadedFiles,
          parsedDocuments: snapshot.parsedDocuments,
          connected: snapshot.connected,
          randomMode: snapshot.randomMode,
        };
      });
      return {
        documents: fallbackParsedDocs,
        dashboard: transactionAnalysis?.product_profile
          ? {
              period: transactionAnalysis.product_profile.period,
              currency: transactionAnalysis.product_profile.currency,
              keyMetrics: transactionAnalysis.product_profile.key_metrics,
              topCategories: transactionAnalysis.product_profile.top_categories,
              topMerchants: transactionAnalysis.product_profile.top_merchants,
              categoryExamples: transactionAnalysis.product_profile.category_examples,
              spendClusters: transactionAnalysis.product_profile.spend_clusters,
              topExpenses: transactionAnalysis.product_profile.top_expenses,
              topIncome: transactionAnalysis.product_profile.top_income,
              alerts: transactionAnalysis.product_profile.alerts,
              alertDetails: transactionAnalysis.product_profile.alert_details,
              opportunities: transactionAnalysis.product_profile.opportunities,
              metricExplanations: transactionAnalysis.product_profile.metric_explanations,
              movements: canonicalMovements,
              summary: transactionAnalysis.product_profile.executive_summary,
            }
          : undefined,
        product: {
          bank: profileInstitution || activeBankProduct.bank,
          label:
            profileInstitution && profileLabel
              ? `${profileInstitution} · ${profileLabel}`
              : profileLabel || activeBankProduct.label,
          productType: profileType || activeBankProduct.productType,
        },
      };
    } catch (error) {
      const isFiveHundred = error instanceof ApiHttpError && error.status >= 500;
      const errorText = isFiveHundred
        ? `Error al procesar archivos: ${error.detail || error.message || 'error interno'}. Intenta nuevamente.`
        : toUserFacingError(error, 'generic');
      setTransactionUploadError(errorText);
      return null;
    } finally {
      setDocumentsLoading(false);
    }
  }

  function hydrateBudgetFromProduct(product: BankProduct) {
    const dashboard = product.dashboard;
    if (!dashboard) return;
    const keyMetrics = dashboard.keyMetrics;
    const categories = dashboard.topCategories ?? [];
    const topIncome = dashboard.topIncome ?? [];
    const expenseRows: BudgetRow[] = categories
      .slice(0, 10)
      .filter((category) => Number(category.amount) > 0)
      .map((category) => ({
        id: `expense-auto-${category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`,
        category: category.name,
        type: 'expense',
        amount: Math.max(0, Math.round(Number(category.amount))),
        product: product.label,
        institution: product.bank,
        note: 'Estimado desde movimientos de producto',
      }));

    const isCardLikeProduct =
      product.productType === 'credit_card' ||
      product.productType === 'consumer_loan' ||
      product.productType === 'mortgage';

    const likelyPayrollOrRealIncome = (label: string) => {
      const normalized = String(label ?? '').toLowerCase();
      if (!normalized) return false;
      // Only whitelist strong income signals to avoid treating transfers/abonos as "ingreso mensual".
      if (/\b(sueldo|remuner|n[oó]mina|payroll|honorari|pensi[oó]n|arriendo|renta|subsidio)\b/.test(normalized)) {
        if (/\b(transfer|traspas|p2p|trf|abono|devoluci[oó]n|reversa|ajuste)\b/.test(normalized)) return false;
        return true;
      }
      return false;
    };

    const inferredIncomeFromSignals = topIncome
      .filter((entry) => entry && typeof entry.amount === 'number' && entry.amount > 0 && likelyPayrollOrRealIncome(entry.label))
      .reduce((acc, entry) => acc + entry.amount, 0);

    // Avoid auto-filling income from `inflows_total` (often includes transfers, card payments, reversals).
    // If we don't have strong signals, keep income at 0 so the user confirms the real monthly liquid income.
    const incomeEstimate = isCardLikeProduct ? 0 : Math.max(0, Math.round(inferredIncomeFromSignals));

    const incomeRow: BudgetRow | null =
      incomeEstimate > 0
        ? {
            id: 'income-derived-products',
            category: 'Ingreso principal (estimado)',
            type: 'income',
            amount: incomeEstimate,
            product: product.label,
            institution: product.bank,
            note: 'Estimado solo desde señales de ingreso (no suma abonos/transferencias)',
          }
        : {
            id: 'income-derived-products',
            category: 'Ingreso principal (completar)',
            type: 'income',
            amount: 0,
            product: product.label,
            institution: product.bank,
            note: isCardLikeProduct
              ? 'Producto tipo tarjeta/crédito: no se infiere ingreso desde abonos.'
              : 'Sin señales claras de sueldo/pensión/honorarios: completa tu ingreso mensual.',
          };

    setBudgetRows((prev) => {
      const next = [...prev];
      const upsert = (candidate: BudgetRow) => {
        const idx = next.findIndex((row) => row.id === candidate.id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...candidate };
        } else {
          next.push(candidate);
        }
      };
      if (incomeRow) upsert(incomeRow);
      for (const row of expenseRows) upsert(row);
      return next;
    });
  }

  async function sendTransactionsToAgent() {
    const defaultEligible = bankSimulation.products.filter((p) => p.connected);
    const selectedSavedProducts = bankSimulation.products.filter((p) => savedProductsForBatch.includes(p.id) && p.connected);
    const selectedProducts = selectedSavedProducts.length > 0 ? selectedSavedProducts : defaultEligible;
    if (selectedProducts.length === 0) {
      setTransactionUploadError('Conecta y autoriza al menos un producto antes de enviar al agente.');
      return;
    }
    const analyzedProducts = selectedProducts.filter((product) => productHasAnalyzedMovements(product));
    if (analyzedProducts.length === 0) {
      setTransactionUploadError(
        'Necesitas al menos un producto con cartola procesada y movimientos detectados. Sube evidencias y espera el análisis antes de inyectar.',
      );
      return;
    }

    setTransactionUploadError(null);
    const aggregateDocuments = analyzedProducts.flatMap((product) =>
      product.parsedDocuments.map((doc) => ({
        product: product.label,
        bank: product.bank,
        name: doc.name,
        preview: doc.text.slice(0, 600),
      }))
    );
    const aggregateMovements = analyzedProducts.flatMap((product) => product.dashboard?.movements ?? []);
    const aggregateIntel = buildTransactionIntelligence(
      aggregateDocuments.map((doc) => ({ name: doc.name, text: doc.preview })),
      aggregateMovements,
    );
    const compactTopKeywords = aggregateIntel.topKeywords.slice(0, 10).map((k) => ({
      l: k.label,
      c: k.count,
    }));
    const compactDocs = aggregateDocuments.slice(0, 10).map((d) => ({
      pr: d.product,
      n: d.name,
      p: d.preview.slice(0, 220),
    }));
    const productsDigest = analyzedProducts.slice(0, 20).map((product) => ({
      label: product.label,
      bank: product.bank,
      type: product.productType,
      keyMetrics: product.dashboard?.keyMetrics ?? null,
      topCategories: product.dashboard?.topCategories?.slice(0, 4) ?? [],
      alerts: product.dashboard?.alerts?.slice(0, 4) ?? [],
      opportunities: product.dashboard?.opportunities?.slice(0, 4) ?? [],
      movements: product.dashboard?.movements?.slice(0, 8) ?? [],
    }));

    const message = [
      'Modo productos y transacciones: análisis consolidado multi-producto, foco principal en mes reciente y comparación con mes anterior.',
      `Productos seleccionados=${analyzedProducts.length}`,
      `Productos=${analyzedProducts.map((p) => `${p.label} (${p.bank})`).join(' | ')}`,
      'Historial adicional permitido: úsalo como antecedente, no como centro del diagnóstico.',
      `KPIs docs=${aggregateIntel.docs} rows=${aggregateIntel.rows} total=${Math.round(
        aggregateIntel.totalDetected
      )} avg=${Math.round(aggregateIntel.averageDetected)} max=${Math.round(
        aggregateIntel.maxDetected
      )}`,
      `DashboardProductos=${JSON.stringify(productsDigest)}`,
      `Keywords=${JSON.stringify(compactTopKeywords)}`,
      `Contexto presupuesto=${JSON.stringify({
        income: Math.round(budgetTotals.income),
        expenses: Math.round(budgetTotals.expenses),
        balance: Math.round(budgetTotals.balance),
      })}`,
      `Documentos=${JSON.stringify(compactDocs)}`,
      'Entrega: dashboard ejecutivo consolidado + hallazgos transversales + 3 acciones concretas.',
    ].join('\n');

    const productsContextPayload = {
      productsContext: buildPersistableProductsContext(
        bankSimulation.products,
        bankSimulation.activeProductId
      ),
      budgetContext: buildPersistableBudgetContext(),
    };
    try {
      await mergeProductsContextToIntake(productsContextPayload);
    } catch {
      // Non-blocking: chat can still continue with runtime context.
    }

    const productsWithMovements = analyzedProducts;
    if (productsWithMovements.length > 0) {
      productsWithMovements.forEach((product) => hydrateBudgetFromProduct(product));
    }

    setActiveChatId(PRIMARY_CHAT_ID);
    setMobilePanelExpanded(false);
    setPanelStage(3);
    setIsTransactionsModalOpen(false);
    if (productsWithMovements.length > 0) {
      setIsBudgetModalOpen(true);
    }
    void onSend('Productos enviados correctamente al agente', {
      agentPayload: message,
      assistantPendingLabel:
        'Configurando productos y transacciones con Financiera mente… consolidando respaldos y hallazgos ejecutivos.',
      hideUserMessage: false,
    });
  }

  function launchDocToLibraryAnimation(
    label: string,
    sourceRect?: DOMRect | null,
    previewUrl?: string,
    reportId?: string
  ) {
    if (!sourceRect) return;

    // 1 — Open the panel if collapsed, pointing to stage 2 (medium)
    setPanelStage((prev) => (prev === 3 ? 2 : prev));

    // Small delay so panel starts opening before we measure target position
    window.setTimeout(() => {
      const targetEl = recentLibraryRef.current;
      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();

      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      // Land in the top-left quadrant of the recents grid (like placing on a stack)
      const endX = targetRect.left + Math.min(80, targetRect.width * 0.28);
      const endY = targetRect.top + targetRect.height * 0.45;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setDocFlight({
        id,
        label,
        previewUrl,
        startX,
        startY,
        endX,
        endY,
        running: false,
      });

      // Start flight on next frame (gives browser time to mount the element)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setDocFlight((prev) =>
            prev && prev.id === id ? { ...prev, running: true } : prev
          );
        });
      });

      // When flight lands: trigger recents landing effect + item entry animation
      window.setTimeout(() => {
        setDocFlight((prev) => (prev && prev.id === id ? null : prev));

        // Highlight the recents block
        setIsLandingRecents(true);
        window.setTimeout(() => setIsLandingRecents(false), 1200);

        // Mark the new item for its entry animation
        if (reportId) {
          setNewReportId(reportId);
          window.setTimeout(() => setNewReportId(null), 1800);
        }

        // On mobile the panel is a horizontal premium rail; glide to recents without breaking its height/state.
        if (isMobileViewport && panelGridRef.current && recentLibraryRef.current) {
          panelLoopPausedRef.current = true;
          const gridEl = panelGridRef.current;
          const panelEl = panelScrollRef.current as HTMLElement | null;
          if (panelEl) {
            panelEl.style.flexBasis = '';
            panelEl.style.removeProperty('--mobile-panel-h');
          }
          const targetCard = recentLibraryRef.current.closest('.mob-col') as HTMLElement | null;
          if (targetCard) {
            gridEl.scrollTo({ left: Math.max(0, targetCard.offsetLeft - 10), behavior: 'smooth' });
          }
          if (panelLoopResumeTimerRef.current) clearTimeout(panelLoopResumeTimerRef.current);
          panelLoopResumeTimerRef.current = setTimeout(() => {
            panelLoopPausedRef.current = false;
          }, 2600);
        } else if (panelScrollRef.current && recentLibraryRef.current) {
          const panelEl = panelScrollRef.current;
          const cardEl = recentLibraryRef.current;
          const panelRect = panelEl.getBoundingClientRect();
          const cardRect = cardEl.getBoundingClientRect();
          const scrollTarget = panelEl.scrollTop + (cardRect.top - panelRect.top) - 16;
          panelEl.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }

        // Desktop can open further; on mobile we keep the cinematic rail stable.
        if (!isMobileViewport) {
          setMobilePanelExpanded(true);
        }
      }, 920);
    }, 80);
  }

  function handleBudgetPdfSaved(payload: { title: string; fileUrl: string; createdAt: string }) {
    const reportId = `budget-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const report: SavedReport = {
      id: reportId,
      title: payload.title || 'Presupuesto mensual',
      group: 'budget',
      fileUrl: payload.fileUrl,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
    setSavedReports((prev) => [report, ...prev].slice(0, 120));
    launchDocToLibraryAnimation(report.title, null, undefined, report.id);
  }

  async function generateMetaSheet(sheets: ChatThread[]) {
    const BASE_IDS = [PRIMARY_CHAT_ID];
    const contextSheets = sheets.filter((s) => BASE_IDS.includes(s.id) && s.status === 'context');
    if (contextSheets.length < 1) return;
    // Already have meta sheet?
    if (sheets.find((s) => s.id === 'meta-sheet')) return;

    const metaSheet = makeInitialThread('meta-sheet', '★', 'Hoja maestra');
    setChatThreads((prev) => [...prev, metaSheet]);
    setActiveChatId('meta-sheet');

    // Build a rich context summary from the 3 sheets
    const contextSummary = contextSheets
      .map((s) => {
        const msgs = s.items
          .filter((it) => it.type === 'message')
          .slice(-6)
          .map((it) => `[${(it as any).role}]: ${((it as any).content ?? '').slice(0, 300)}`)
          .join('\n');
        return `=== Hoja "${s.name}" ===\n${msgs}`;
      })
      .join('\n\n');

    try {
      const res = (await sendToAgent({
        user_message: `SISTEMA: Genera un resumen ejecutivo personalizado que integre todo el contexto recopilado, los objetivos identificados, el perfil financiero del usuario y una hoja de ruta de recomendaciones de alto impacto. Contexto del chat principal:\n${contextSummary}`,
        session_id: getSessionId(),
        history: [],
        context: { meta_sheet_init: true },
        ui_state: { meta_sheet: true },
        preferences: { response_style: 'professional', language: 'es-CL' },
      })) as AgentResponse;

      const items = sanitizeChatItems(toChatItemsFromAgentResponse(res));
      const toAdd = items.length > 0 ? items : [{
        type: 'message' as const,
        role: 'assistant' as const,
        content: sanitizeMessageText(res.message, 'Hoja maestra inicializada.'),
        mode: res.mode ?? 'synthesis',
      }];
      setChatThreads((prev) =>
        prev.map((t) => t.id === 'meta-sheet' ? { ...t, items: toAdd } : t)
      );
    } catch {}
  }


  function handlePanelAction(action: { section?: string; message?: string }) {
    const section = action.section;
    const message = action.message;
    if (!section && !message) return;

    // 1 — Abre el panel si está colapsado (desktop + mobile)
    setPanelStage((prev) => (prev === 3 ? 2 : prev));
    setMobilePanelExpanded(true);

    // 2 — Destaca la sección
    if (section) {
      setHighlightedSection(section);
      window.setTimeout(() => setHighlightedSection(null), 4500);
    }

    // 3 — Muestra callout con mensaje del agente
    if (message && section) {
      // Cancela timer anterior si había uno
      if (panelCalloutTimerRef.current) clearTimeout(panelCalloutTimerRef.current);
      setPanelCallout({ section, message });
      // Auto-dismiss después de 7 segundos
      panelCalloutTimerRef.current = setTimeout(() => {
        setPanelCallout(null);
        panelCalloutTimerRef.current = null;
      }, 7000);
    }

    // 4 — Scroll al bloque objetivo dentro del panel (breve delay para que abra)
    if (section && panelScrollRef.current) {
      window.setTimeout(() => {
        const target = panelScrollRef.current?.querySelector(`[data-panel-section="${section}"]`);
        if (target && panelScrollRef.current) {
          const panelRect = panelScrollRef.current.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const scrollTarget = panelScrollRef.current.scrollTop + (targetRect.top - panelRect.top) - 12;
          panelScrollRef.current.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        }
      }, 180);
    }
  }


  function switchChatBySwipe(direction: 'left' | 'right') {
    const ids = chatThreads.map((t) => t.id);
    if (ids.length <= 1) return;
    const currentIdx = ids.indexOf(activeChatId);
    const nextIdx = direction === 'left'
      ? Math.min(currentIdx + 1, ids.length - 1)
      : Math.max(currentIdx - 1, 0);
    if (nextIdx === currentIdx) return;
    setChatSlideDir(direction);
    setActiveChatId(ids[nextIdx]);
    setTimeout(() => setChatSlideDir(null), 320);
  }


  const panelBaseCards: Array<{ key: string; node: ReactElement }> = buildPanelBaseCards({
    highlightedSection,
    sessionInfo,
    profile,
    setIsQuestionnaireModalOpen,
    setIsAccountModalOpen,
    removeInjectedIntake,
    removeInjectedProfile,
    agentMetaRef,
    interviewCard,
    interviewCompleted,
    canOpenInterview,
    setInterviewIntake: () => {
      void syncFinancialContextToIntake().catch(() => {});
      setInterviewIntake(buildInterviewIntakePayload() as any);
    },
    unlockedPanelBlocks,
    setIsBudgetModalOpen,
    budgetTotals,
    budgetInsights,
    openTransactionsPanel,
    openInterviewModal,
    openDiagnosisView,
    transactionIntel,
    reportsByGroup,
    librarySummary,
    savedReports,
    deletingReportIds,
    recentLibraryRef,
    isLandingRecents,
    recentReports,
    newReportId,
    docVisualOffset,
    handleDeleteReport,
  });

  const compactPanelCards = panelBaseCards;

  const panelRenderedCards =
    isMobileViewport && !mobilePanelExpanded && !disableMobilePanelHorizontalMotion
      ? [
          ...compactPanelCards.map((card, index) =>
            React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
              key: `prepend-${card.key}-${index}`,
              'data-loop-segment': 'prepend',
              'data-loop-origin': String(index),
              className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
            })
          ),
          ...compactPanelCards.map((card, index) =>
            React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
              key: `real-${card.key}-${index}`,
              'data-loop-segment': 'real',
              'data-loop-origin': String(index),
              className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
            })
          ),
          ...compactPanelCards.map((card, index) =>
            React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
              key: `append-${card.key}-${index}`,
              'data-loop-segment': 'append',
              'data-loop-origin': String(index),
              className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
            })
          ),
        ]
      : compactPanelCards.map((card, index) =>
          React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
            key: `real-${card.key}-${index}`,
            'data-loop-segment': 'real',
            'data-loop-origin': String(index),
          })
        );

  if (!authBootstrapped || !isAuthenticated) {
    return null;
  }

  return (
    <main
      className={`agent-layout ${activeThreadThemeClass} ${
        isRailMorphing ? 'is-mode-12-morphing' : ''
      } ${
        isMonochrome ? 'is-monochrome' : ''
      } ${
        mobilePanelExpanded ? 'mobile-panel-expanded' : ''
      } ${
        isMobileViewport && isStandaloneDisplayMode ? 'is-mobile-standalone' : ''
      }`}
    >
      <section
        ref={chatBodyRef as React.RefObject<HTMLElement>}
        className={`agent-chat active-chat-${activeThread?.label ?? '1'}${chatSlideDir ? ` chat-slide-${chatSlideDir}` : ''}`}
      >
        <ChatHeader
          chatThreads={chatThreads as any}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          getThreadSpecialization={getThreadSpecialization as any}
          isThreadLocked={isThreadLocked}
          setPanelCallout={setPanelCallout}
          setKnowledgePopupOpen={setKnowledgePopupOpen}
          knowledgeScore={knowledgeScore}
          activeThread={activeThread as any}
          isActiveChatLocked={isActiveChatLocked}
          activeTurnCount={activeTurnCount}
          diagnosisUnlocked={interviewCompleted}
          knowledgePopupOpen={knowledgePopupOpen}
          knowledgeStage={knowledgeStage}
          completedMilestones={completedMilestones}
          milestones={milestones}
          coachHint={coachHint}
          isMonochrome={isMonochrome}
          toggleMonochrome={() => setIsMonochrome((v) => !v)}
          isMobileViewport={isMobileViewport}
          actionPlanFunnelStage={activeActionPlanStage}
        />
        {interviewResumePending && canOpenInterview && !interviewCompleted ? (
          <div className="interview-resume-banner">
            <div className="interview-resume-copy">
              <strong>Entrevista pendiente</strong>
              <span>Tu llamada quedó guardada. Retómala cuando quieras.</span>
            </div>
            <button
              type="button"
              className="summary-action-btn summary-action-accept"
              onClick={() => {
                const injectedIntake = sessionInfo?.injectedIntake?.intake;
                if (injectedIntake && typeof injectedIntake === 'object') {
                  setInterviewIntake(injectedIntake as any);
                }
                openInterviewModal();
              }}
            >
              Retomar
            </button>
          </div>
        ) : null}

        <div className="agent-chat-body">
          <ChatThreadView
            items={items}
            loading={loading}
            diagnosisUnlocked={interviewCompleted}
            isMobileViewport={isMobileViewport}
            sessionUserName={sessionInfo?.name}
            activeThreadId={activeThread?.id}
            activeThreadLabel={activeThread?.label}
            expandedCitationsByMessage={expandedCitationsByMessage}
            setExpandedCitationsByMessage={setExpandedCitationsByMessage}
            onSend={onSend}
            setDraftForActive={setDraftForActive}
            sessionInjectedIntake={sessionInfo?.injectedIntake}
            chatThreadRef={chatThreadRef as React.RefObject<HTMLDivElement>}
            activeChatId={activeChatId}
            actionPlanFunnelStage={activeActionPlanStage}
            setItemsForActive={setItemsForActive}
            classifyReportGroup={classifyReportGroup}
            setSavedReports={setSavedReports}
            launchDocToLibraryAnimation={launchDocToLibraryAnimation}
            onPanelAction={openPanelSectionFromChat}
            flowPanelAction={getNextFlowPanelAction()}
          />

          {activeChatId === 'chat-3' && (
            <div style={{ padding: '0 0 10px', display: 'flex' }}>
              <button
                type="button"
                className="social-philosophy-trigger"
                onClick={() => setIsSocialConsciousnessModalOpen(true)}
                aria-label="Abrir reflexión filosófica interactiva"
              >
                <span className="social-trigger-phi" aria-hidden="true">φ</span>
                Reflexión interactiva
              </button>
            </div>
          )}

          <div className="agent-input-shell terminal-composer-shell">
            <div
              className="agent-input terminal-composer"
              onClick={() => {
                if (!isActiveChatLocked) chatComposerRef.current?.focus();
              }}
              style={{ cursor: isActiveChatLocked ? 'default' : 'text' }}
            >
              <div className="terminal-composer-head">$ escribir_mensaje</div>
              <textarea
                ref={chatComposerRef}
                className="terminal-composer-input"
                placeholder={isActiveChatLocked ? 'Chat bloqueado hasta completar el diagnóstico' : ''}
                value={input}
                disabled={isActiveChatLocked}
                autoFocus={!hasBlockingModalOpen}
                onChange={(e) => setDraftForActive(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend((e.currentTarget as HTMLTextAreaElement).value);
                  }
                }}
              />
            </div>

            <div className="controls terminal-composer-controls">
              <input
                ref={chatUploadInputRef}
                type="file"
                accept=".pdf,.xls,.xlsx,.csv,.tsv,.txt,.md,.json,.xml,.yaml,.yml,.log,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  void onUploadFromChat(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                className="continue-button composer-icon-btn"
                disabled={isActiveChatLocked}
                onClick={() => chatUploadInputRef.current?.click()}
                title="Adjuntar archivos (PDF, imagen, Excel, texto y más)"
                aria-label="Adjuntar archivo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.5 7.5L9 14a3 3 0 104.24 4.24l7.07-7.07a5 5 0 10-7.07-7.07L5.46 11.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                className={`continue-button composer-icon-btn mobile-panel-toggle-inline${mobilePanelExpanded ? ' is-open' : ''}`}
                onClick={() => {
                  haptic(12);
                  setMobilePanelExpanded((v) => !v);
                }}
                aria-label={mobilePanelExpanded ? 'Minimizar panel' : 'Expandir panel'}
                title={mobilePanelExpanded ? 'Minimizar panel' : 'Expandir panel'}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d={mobilePanelExpanded ? 'M4 6L8 10L12 6' : 'M4 10L8 6L12 10'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                className="composer-send-btn"
                disabled={isActiveChatLocked}
                onClick={() => {
                  void onSend(chatComposerRef.current?.value ?? input);
                }}
                aria-label="Enviar mensaje"
              >
                <Send size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <SidePanels
        knowledgeScore={knowledgeScore}
        progressPulse={progressPulse}
        setKnowledgePopupOpen={setKnowledgePopupOpen}
        knowledgePopupOpen={knowledgePopupOpen}
        knowledgeStage={knowledgeStage}
        completedMilestones={completedMilestones}
        milestones={milestones}
        coachHint={coachHint}
        levelUpText={levelUpText}
        sessionInfoName={sessionInfo?.name}
        hasInjectedIntake={Boolean(sessionInfo?.injectedIntake)}
        mobilePanelHandleRef={mobilePanelHandleRef}
        mobilePanelExpanded={mobilePanelExpanded}
        setMobilePanelExpanded={setMobilePanelExpanded}
        haptic={haptic}
        panelCallout={panelCallout}
        setPanelCallout={setPanelCallout}
        panelGridRef={panelGridRef}
        panelScrollRef={panelScrollRef as React.RefObject<HTMLElement>}
        panelRenderedCards={panelRenderedCards}
      />

      {docFlight && (
        <div
          className={`doc-flight-chip${docFlight.running ? ' is-running' : ''}`}
          style={
            {
              left: `${docFlight.startX}px`,
              top: `${docFlight.startY}px`,
              ['--dx' as any]: `${docFlight.endX - docFlight.startX}px`,
              ['--dy' as any]: `${docFlight.endY - docFlight.startY}px`,
            } as any
          }
        >
          <div className="doc-flight-preview">
            {docFlight.previewUrl ? (
              <embed
                src={`${docFlight.previewUrl}#page=1&view=FitH`}
                type="application/pdf"
                className="doc-flight-embed"
              />
            ) : (
              <div className="doc-flight-placeholder" />
            )}
          </div>
          <span className="doc-flight-label">{docFlight.label}</span>
        </div>
      )}

      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        budgetTotals={budgetTotals}
        budgetInsights={budgetInsights}
        budgetRows={budgetRows}
        budgetProductOptions={Array.from(new Set(
          bankSimulation.products
            .map((product) => String(product.label ?? '').trim())
            .filter((label) => label.length > 0)
        ))}
        budgetCompletion={budgetCompletion}
        budgetSignals={budgetSignals}
        updateBudgetRow={updateBudgetRow}
        upsertBudgetRow={upsertBudgetRow}
        applyBudgetTemplate={applyBudgetTemplate}
        coachHint={coachHint}
        addBudgetRow={addBudgetRow}
        addBudgetSubcategory={addBudgetSubcategory}
        deleteBudgetRow={deleteBudgetRow}
        sendBudgetToAgent={sendBudgetToAgent}
        chatAnswers={budgetChatAnswers}
        onChatAnswersChange={setBudgetChatAnswers}
        sessionInfo={sessionInfo}
        bankProducts={bankSimulation.products.map((p) => ({
          label: p.label,
          bank: p.bank,
          productType: p.productType,
          dashboardSummary: p.dashboard?.summary,
          keyMetrics: p.dashboard?.keyMetrics
            ? {
                inflows_total: p.dashboard.keyMetrics.inflows_total,
                outflows_total: p.dashboard.keyMetrics.outflows_total,
                net_flow: p.dashboard.keyMetrics.net_flow,
                movement_count: p.dashboard.keyMetrics.movement_count,
              }
            : undefined,
          topCategories: p.dashboard?.topCategories?.slice(0, 8),
          alerts: p.dashboard?.alerts?.slice(0, 8),
        }))}
        onBudgetPdfSaved={handleBudgetPdfSaved}
      />

      <QuestionnaireModal
        isOpen={isQuestionnaireModalOpen}
        questionnaireDashboard={questionnaireDashboard}
        sessionUserName={sessionInfo?.name}
        onClose={() => setIsQuestionnaireModalOpen(false)}
      />

      <TransactionsModal
        isOpen={isTransactionsModalOpen}
        onClose={() => setIsTransactionsModalOpen(false)}
        txWizardStep={txWizardStep}
        setTxWizardStep={setTxWizardStep}
        bankSimulationProductsCount={bankSimulation.products.length}
        transactionIntel={transactionIntel}
        activeBankProduct={activeBankProduct}
        transactionProductCards={transactionProductCards}
        selectedProductId={bankSimulation.activeProductId}
        selectTransactionProduct={selectTransactionProduct}
        deleteTransactionProduct={deleteTransactionProduct}
        addTransactionProduct={addTransactionProduct}
        updateActiveProduct={updateActiveProduct}
        transactionTaxonomyOverrides={bankSimulation.taxonomyOverrides}
        upsertTransactionTaxonomyOverride={upsertTransactionTaxonomyOverride}
        removeTransactionTaxonomyOverride={removeTransactionTaxonomyOverride}
        simulateBankLogin={simulateBankLogin}
        onUploadStatement={onUploadStatement}
        documentsLoading={documentsLoading}
        transactionUploadError={transactionUploadError}
        sendTransactionsToAgent={sendTransactionsToAgent}
        saveTransactionProductForBatch={saveTransactionProductForBatch}
        savedProductIds={savedProductsForBatch}
        maxProducts={MAX_TRANSACTION_PRODUCTS}
        maxEvidenceFilesPerProduct={MAX_EVIDENCE_FILES_PER_PRODUCT}
        productsCreatedTotal={txProductsCreatedTotal}
        creationNotice={txCreationNotice}
      />

      <InterviewModal
        isOpen={isInterviewModalOpen}
        onClose={() => setIsInterviewModalOpen(false)}
        onDiagnosisComplete={() => {
          void loadProfileIfNeeded();
          void getSessionInfo()
            .then((info) => {
              if (info) setSessionInfo(info);
            })
            .catch(() => {});
        }}
      />

      <SocialConsciousnessModal
        isOpen={isSocialConsciousnessModalOpen}
        onClose={() => setIsSocialConsciousnessModalOpen(false)}
        onSendToChat={(message) => {
          setIsSocialConsciousnessModalOpen(false);
          void onSend(message);
        }}
        sessionUserName={sessionInfo?.name}
      />

      {isAccountModalOpen && (
        <div className="agent-modal-overlay" onClick={closeAccountModal}>
          <div className="agent-modal account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agent-modal-header">
              <h3>Cuenta</h3>
              <button type="button" className="agent-modal-close" onClick={closeAccountModal}>×</button>
            </div>
            <p className="agent-modal-intro">
              Gestiona tu sesión actual. Cerrar sesión te devuelve al acceso; borrar cuenta elimina tus datos de forma permanente.
            </p>
            {accountActionError ? (
              <div className="transactions-summary-card tx-doc-intel-grid" role="alert">
                <span className="transactions-summary-title">No se pudo completar la acción</span>
                <p>{accountActionError}</p>
              </div>
            ) : null}
            <div className="questionnaire-response-grid">
              <div className="questionnaire-response-item">
                <span>Usuario</span>
                <strong>{sessionInfo?.name || 'Cuenta activa'}</strong>
              </div>
              <div className="questionnaire-response-item">
                <span>Email</span>
                <strong>{sessionInfo?.email || 'Sesión autenticada'}</strong>
              </div>
            </div>
            <div className="account-modal-actions">
              <button
                type="button"
                className="continue-button"
                onClick={() => void handleLogout()}
                disabled={isAccountActionLoading}
              >
                {isAccountActionLoading ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
              <button
                type="button"
                className="continue-button danger"
                onClick={() => void handleDeleteAccount()}
                disabled={isAccountActionLoading}
              >
                {isAccountActionLoading ? 'Eliminando…' : 'Borrar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
