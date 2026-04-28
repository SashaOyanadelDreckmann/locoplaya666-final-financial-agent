'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import 'katex/dist/katex.min.css';

import { getSessionId } from '@/lib/session';
import { sendToAgent } from '@/lib/agent';
import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';
import {
  getSessionInfo,
  removeInjectedIntake,
  removeInjectedProfile,
  loadSheets,
  saveSheets,
  loadPanelState,
  savePanelState,
  getWelcomeMessage,
  parseDocuments,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import {
  buildInitialAgentSuggestions,
  buildProductCardDescriptor,
  buildTransactionIntelligence,
  firstNameOf,
  inferInstitutionFromText,
  inferProductTypeFromText,
  resolveDocumentUrl,
  sanitizeChatItems,
  sanitizeMessageText,
} from './page.utils';

import type {
  AgentBlock,
  AgentResponse,
  ChatItem,
} from '@/lib/agent.response.types';
import { toChatItemsFromAgentResponse } from '@/lib/agent.response.types';
import { BudgetModal, QuestionnaireModal, TransactionsModal } from './modals';
import { SidePanels } from './side-panels';
import { ChatThreadView } from './chat-thread-view';
import { ChatHeader } from './chat-header';
import { buildPanelBaseCards } from './panel-cards';

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
  createdAt: string;
};

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  note: string;
};

type BankProduct = {
  id: string;
  label: string;
  bank: string;
  username: string;
  password: string;
  connected: boolean;
  randomMode: boolean;
  uploadedFiles: string[];
  parsedDocuments: Array<{ name: string; text: string }>;
};

type BankSimulation = {
  products: BankProduct[];
  activeProductId: string | null;
  lockedMonth: string | null;
  username: string;
  password: string;
  connected: boolean;
  randomMode: boolean;
  uploadedFiles: string[];
  parsedDocuments: Array<{ name: string; text: string }>;
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

type ChatThread = {
  id: string;
  label: string;
  name: string;
  autoNamed: boolean;
  items: ChatItem[];
  draft: string;
  status: 'active' | 'context';
  contextScore: number;      // 0-100, agent-driven
  userMessageCount: number;  // track for 70-msg limit
  createdAt: string;
  completedAt?: string;
};

type ProductLifecycle = {
  phase?: string;
  unlockedChats?: string[];
  closedChats?: string[];
  chatTurns?: Record<string, number>;
  actionReminders?: Array<{
    id: string;
    title: string;
    proposedDate: string;
    sourceChatId: string;
    status: 'proposed' | 'queued';
    createdAt: string;
  }>;
};

type ChatSpecialization = {
  title: string;
  shortTitle: string;
  accentClass: string;
  subtitle: string;
};

const CHAT_GAME_INSTRUCTION =
  'Para aprovechar al maximo este juego: 1) define un objetivo financiero concreto, 2) usa los 3 chats en paralelo para explorar escenarios, 3) pide primero grafico o simulacion y luego informe PDF, 4) guarda documentos clave para compararlos, 5) ajusta riesgo, plazo y aporte en cada iteracion para subir tu nivel de conocimiento.';

const FALLBACK_WELCOME =
  'Ya tengo una lectura inicial de tu situación. Podemos partir por ordenar el flujo, revisar riesgos y definir el primer movimiento útil.';

const DEFAULT_BUDGET_ROWS: BudgetRow[] = [
  {
    id: 'income-salary',
    category: 'Sueldo liquido',
    type: 'income',
    amount: 0,
    note: '',
  },
  {
    id: 'expense-rent',
    category: 'Vivienda / arriendo',
    type: 'expense',
    amount: 0,
    note: '',
  },
  {
    id: 'expense-food',
    category: 'Alimentacion',
    type: 'expense',
    amount: 0,
    note: '',
  },
];

const DEFAULT_BANK_SIMULATION: BankSimulation = {
  products: [],
  activeProductId: null,
  lockedMonth: null,
  username: '',
  password: '',
  connected: false,
  randomMode: false,
  uploadedFiles: [],
  parsedDocuments: [],
};

const KNOWLEDGE_MILESTONE_DEFS = [
  { id: 'intake', label: 'Cuestionario y perfil base', threshold: 20 },
  { id: 'budget_base', label: 'Presupuesto personalizado', threshold: 40 },
  { id: 'budget_panel', label: 'Panel de presupuesto', threshold: 55 },
  { id: 'debt_analysis', label: 'Análisis de deuda', threshold: 70 },
  { id: 'transactions_panel', label: 'Panel de cartolas', threshold: 74 },
  { id: 'advanced', label: 'Estrategias avanzadas', threshold: 85 },
  { id: 'expert', label: 'Nivel experto', threshold: 100 },
] as const;

export default function AgentPage() {
  const router = useRouter();
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

  function randomBankCredential(prefix: 'usr' | 'pwd') {
    const seed = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${seed}`;
  }

  function monthKeyOf(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

    let read = 'hay base para ordenar mejor tu mapa financiero.';
    if (hasSavings === false && hasDebt === false) {
      read = 'hoy el foco parece estar en construir base y liquidez, más que en apagar incendios.';
    } else if (hasDebt === true && hasSavings === false) {
      read = 'hay presión entre caja corta y deuda, así que conviene priorizar secuencia y oxígeno financiero.';
    } else if (hasSavings === true) {
      read = 'ya existe una base sobre la cual conviene decidir mejor cómo asignar flujo y riesgo.';
    }

    const incomeHint = incomeBand ? ` Tu tramo de ingresos declarado es ${incomeBand}.` : '';

    return `${firstName}, ${read}${incomeHint} Si quieres, partimos por definir el primer frente: liquidez, presupuesto o decisiones de inversión.`;
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
        title: 'Diagnóstico',
        shortTitle: 'Diag',
        accentClass: 'chat-specialization-1',
        subtitle: 'Lectura base y tensiones',
      };
    }
    if (threadId === 'chat-2') {
      return {
        title: 'Estrategia',
        shortTitle: 'Plan',
        accentClass: 'chat-specialization-2',
        subtitle: 'Escenarios y estructura',
      };
    }
    if (threadId === 'chat-3') {
      return {
        title: 'Ejecución',
        shortTitle: 'Move',
        accentClass: 'chat-specialization-3',
        subtitle: 'Acciones y seguimiento',
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
    makeInitialThread('chat-1', '1', 'Nueva conversación'),
    makeInitialThread('chat-2', '2', 'Nueva conversación'),
    makeInitialThread('chat-3', '3', 'Nueva conversación'),
  ]);
  const [activeChatId, setActiveChatId] = useState('chat-1');
  const [sheetsLoaded, setSheetsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [panelStage, setPanelStage] = useState(3);
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMonochrome, setIsMonochrome] = useState(false);
  const [progressPulse, setProgressPulse] = useState(false);
  const [isRailMorphing, setIsRailMorphing] = useState(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);
  const [knowledgePopupOpen, setKnowledgePopupOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isQuestionnaireModalOpen, setIsQuestionnaireModalOpen] = useState(false);
  const [txWizardStep, setTxWizardStep] = useState<'products' | 'credentials' | 'upload' | 'dashboard' | 'locked'>('products');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>(DEFAULT_BUDGET_ROWS);
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
  const panelLoopRafRef = useRef<number | null>(null);
  const panelLoopResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelLoopPhaseRef = useRef(0);
  const [newReportId, setNewReportId] = useState<string | null>(null);
  const [isLandingRecents, setIsLandingRecents] = useState(false);
  const [panelCallout, setPanelCallout] = useState<{ section: string; message: string } | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [expandedCitationsByMessage, setExpandedCitationsByMessage] = useState<Record<number, boolean>>({});
  const panelCalloutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatBodyRef = useRef<HTMLElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const mobilePanelHandleRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const loadProfileIfNeeded = useProfileStore((s) => s.loadProfileIfNeeded);
  const profile = useProfileStore((s) => s.profile);

  const activeThread = useMemo(
    () =>
      chatThreads.find((thread) => thread.id === activeChatId) ??
      chatThreads[0],
    [chatThreads, activeChatId]
  );

  const items = activeThread?.items ?? [];
  const input = activeThread?.draft ?? '';
  const activeThreadThemeClass =
    activeThread?.id === 'chat-2'
      ? 'chat-theme-2'
      : activeThread?.id === 'chat-3'
      ? 'chat-theme-3'
      : activeThread?.id === 'meta-sheet'
      ? 'chat-theme-meta'
      : 'chat-theme-1';
  const unlockedChatIds = productLifecycle?.unlockedChats ?? ['chat-1'];
  const closedChatIds = productLifecycle?.closedChats ?? [];
  const activeTurnCount =
    productLifecycle?.chatTurns?.[activeChatId] ??
    activeThread?.userMessageCount ??
    0;
  const activeTurnsRemaining = Math.max(0, 50 - activeTurnCount);
  const isActiveChatLocked =
    !unlockedChatIds.includes(activeChatId) || closedChatIds.includes(activeChatId);
  const latestActionReminder =
    productLifecycle?.actionReminders?.find((item) => item.sourceChatId === activeChatId) ??
    productLifecycle?.actionReminders?.[0] ??
    null;

  function isThreadLocked(threadId: string) {
    return !unlockedChatIds.includes(threadId) || closedChatIds.includes(threadId);
  }

  function phaseLabel(phase?: string) {
    if (phase === 'budget_needed') return 'Completar presupuesto';
    if (phase === 'transactions_needed') return 'Subir cartolas';
    if (phase === 'interview_needed') return 'Entrevista de 4 minutos';
    if (phase === 'diagnosis_ready') return 'Diagnóstico listo';
    if (phase === 'advisory_unlocked') return 'Chats especializados activos';
    return 'Diagnóstico inicial';
  }

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const info = await getSessionInfo();
        if (cancelled) return;
        setSessionInfo(info);
        setProductLifecycle((info?.productLifecycle ?? null) as ProductLifecycle | null);
        setIsAuthenticated(true);
      } catch (error) {
        if (cancelled) return;
        setIsAuthenticated(false);
        if (error instanceof ApiHttpError && error.status === 401) {
          router.replace('/login');
        }
      } finally {
        if (!cancelled) setAuthBootstrapped(true);
      }
    };

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Mobile panel carousel loop: when reaching the end, jump back to start.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth <= 767);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const el = panelGridRef.current;
    if (!el || !isMobileViewport) return;

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

    const resetToRealSegment = () => {
      const metrics = getMetrics();
      if (!metrics) return;
      el.scrollLeft = metrics.firstRealLeft;
    };

    resetToRealSegment();

    let disposed = false;
    let lastTs = 0;

    const pauseLoop = (resumeDelay = 2200) => {
      panelLoopPausedRef.current = true;
      if (panelLoopResumeTimerRef.current) clearTimeout(panelLoopResumeTimerRef.current);
      panelLoopResumeTimerRef.current = setTimeout(() => {
        panelLoopPausedRef.current = false;
      }, resumeDelay);
    };

    const normalizeLoop = () => {
      const metrics = getMetrics();
      if (!metrics || metrics.segmentWidth <= 0) return;
      if (el.scrollLeft >= metrics.firstAppendLeft - 4) {
        el.scrollLeft -= metrics.segmentWidth;
      } else if (el.scrollLeft <= metrics.firstRealLeft - metrics.segmentWidth + 4) {
        el.scrollLeft += metrics.segmentWidth;
      }
    };

    const tick = (ts: number) => {
      if (disposed) return;
      if (!lastTs) lastTs = ts;
      const dt = Math.min(32, ts - lastTs);
      lastTs = ts;

      if (!panelLoopPausedRef.current && !mobilePanelExpanded) {
        panelLoopPhaseRef.current += dt * 0.0008;
        const pulse = Math.sin(panelLoopPhaseRef.current) * 0.15 + Math.sin(panelLoopPhaseRef.current * 0.37) * 0.08;
        const pxPerFrame = Math.max(0.6, 1.1 + pulse) * (dt / 16.67);
        el.scrollLeft += pxPerFrame;
        normalizeLoop();
      }

      panelLoopRafRef.current = window.requestAnimationFrame(tick);
    };

    const onPointerDown = () => pauseLoop(2600);
    const onTouchStart = () => pauseLoop(2600);
    const onMouseEnter = () => pauseLoop(1400);
    const onScroll = () => normalizeLoop();

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('scroll', onScroll, { passive: true });
    panelLoopRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('scroll', onScroll);
      if (panelLoopRafRef.current) cancelAnimationFrame(panelLoopRafRef.current);
      if (panelLoopResumeTimerRef.current) clearTimeout(panelLoopResumeTimerRef.current);
      panelLoopRafRef.current = null;
      panelLoopResumeTimerRef.current = null;
      panelLoopPausedRef.current = false;
    };
  }, [isMobileViewport, panelStage, mobilePanelExpanded, savedReports.length]);

  // Bloquear TODO scroll/bounce/swipe/zoom en la pagina del agente
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Estilos para bloquear scroll y bounce
    html.style.overflow = 'hidden';
    html.style.position = 'fixed';
    html.style.inset = '0';
    html.style.width = '100%';
    html.style.height = '100%';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.inset = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.overscrollBehavior = 'none';

    // Prevenir touchmove en el document (el bounce de iOS)
    // Solo permite scroll dentro de elementos que tienen overflow scroll
    const preventBounce = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        if (overflowY === 'auto' || overflowY === 'scroll' ||
            overflowX === 'auto' || overflowX === 'scroll') {
          // Permitir scroll dentro de este elemento
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
      html.style.overflow = '';
      html.style.position = '';
      html.style.inset = '';
      html.style.width = '';
      html.style.height = '';
      html.style.overscrollBehavior = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.inset = '';
      body.style.width = '';
      body.style.height = '';
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

  // Drag continuo en panel mobile: arrastra el handle para ajustar altura
  useEffect(() => {
    const handle = mobilePanelHandleRef.current;
    const panel = panelScrollRef.current;
    if (!handle || !panel) return;

    const SNAP_CLOSED = 92;
    const SNAP_OPEN = Math.round(window.innerHeight * 0.52);

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentH = panel.getBoundingClientRect().height;
      panelDragRef.current = { startY: touch.clientY, startH: currentH };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!panelDragRef.current) return;
      const touch = e.touches[0];
      const dy = panelDragRef.current.startY - touch.clientY; // positivo = arrastrar hacia arriba
      const newH = Math.max(80, Math.min(SNAP_OPEN + 20, panelDragRef.current.startH + dy));
      (panel as HTMLElement).style.setProperty('--mobile-panel-h', `${newH}px`);
      (panel as HTMLElement).style.flexBasis = `${newH}px`;
    };

    const onTouchEnd = () => {
      if (!panelDragRef.current) return;
      const currentH = panel.getBoundingClientRect().height;
      const snapToOpen = currentH > (SNAP_CLOSED + SNAP_OPEN) / 2;
      const finalH = snapToOpen ? SNAP_OPEN : SNAP_CLOSED;
      (panel as HTMLElement).style.flexBasis = '';
      (panel as HTMLElement).style.removeProperty('--mobile-panel-h');
      setMobilePanelExpanded(snapToOpen);
      // Actualizar la variable CSS en el layout
      const layout = panel.closest('.agent-layout') as HTMLElement | null;
      if (layout) {
        layout.classList.toggle('mobile-panel-expanded', snapToOpen);
      }
      panelDragRef.current = null;
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);
    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      handle.removeEventListener('touchmove', onTouchMove);
      handle.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

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
            ? sanitizeChatItems(
                s.items.filter((it: any) => it.type !== 'message' || it.content !== undefined)
              )
            : [],
          draft: s.draft ?? '',
          status: s.status ?? 'active',
          contextScore: s.contextScore ?? 0,
          userMessageCount: s.userMessageCount ?? 0,
          createdAt: s.createdAt ?? new Date().toISOString(),
          completedAt: s.completedAt,
        }));
        // Ensure base sheets chat-1..3 always exist (pad missing ones)
        const BASE_IDS = ['chat-1', 'chat-2', 'chat-3'] as const;
        for (const bid of BASE_IDS) {
          if (!restored.find((s) => s.id === bid)) {
            const idx = BASE_IDS.indexOf(bid);
            restored.splice(idx, 0, makeInitialThread(bid, String(idx + 1), 'Nueva conversación'));
          }
        }
        setChatThreads(restored);
        const activeSheet = restored.find((s) => s.status === 'active');
        if (activeSheet) setActiveChatId(activeSheet.id);
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
    getWelcomeMessage().then((data) => {
      if (data?.message) {
        const incomingWelcome = sanitizeMessageText(data.message, FALLBACK_WELCOME);
        const initialSuggestions = buildInitialAgentSuggestions(sessionInfo?.injectedIntake);
        setChatThreads((prev) =>
          prev.map((t) => {
            if (t.id !== activeChatId) return t;

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
                  buildEditorialWelcome(sessionInfo),
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
                  suggested_replies: initialSuggestions,
                } as ChatItem,
                ...t.items,
              ],
            };
          })
        );
      }
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
        items: t.items,
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

  function deleteThreadById(threadId: string) {
    const target = chatThreads.find((thread) => thread.id === threadId);
    if (!target) return;

    const confirmText =
      target.items.length > 0
        ? `¿Eliminar el chat "${target.name}"? Esta acción limpiará su contenido.`
        : `¿Eliminar el chat "${target.name}"?`;
    if (!window.confirm(confirmText)) return;

    const BASE_IDS = ['chat-1', 'chat-2', 'chat-3'] as const;
    const isBaseThread = BASE_IDS.includes(threadId as (typeof BASE_IDS)[number]);

    setChatThreads((prev) => {
      if (isBaseThread) {
        const resetThread = makeInitialThread(target.id, target.label, 'Nueva conversación');
        return prev.map((thread) => (thread.id === threadId ? resetThread : thread));
      }

      const filtered = prev.filter((thread) => thread.id !== threadId);
      if (filtered.length === 0) {
        return [makeInitialThread('chat-1', '1', 'Nueva conversación')];
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
        { id: 'chat-1' };
      return candidate.id;
    });

    welcomeInjectedThreadsRef.current.delete(threadId);
  }

  useEffect(() => {
    setChatThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
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
  }, [chatThreads]);

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

  const engagedChatsCount = useMemo(
    () =>
      chatThreads.filter((thread) => {
        const userTurns = thread.items.filter(
          (it) => it.type === 'message' && it.role === 'user'
        ).length;
        return userTurns >= 3;
      }).length,
    [chatThreads]
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

    // 10% uso de múltiples chats (3/3 chats activos con contexto real)
    const multiChat = (engagedChatsCount / 3) * 10;

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
    engagedChatsCount,
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

  // Sheet-based progress: 3 base sheets × 50 msgs each = 100%
  const sheetProgress = useMemo(() => {
    const BASE_IDS = ['chat-1', 'chat-2', 'chat-3'];
    const baseSheets = chatThreads.filter((t) => BASE_IDS.includes(t.id));
    const completedCount = baseSheets.filter((t) => t.status === 'context').length;
    const activeSheet = baseSheets.find((t) => t.status === 'active');
    const activeContrib = activeSheet ? Math.min(activeSheet.userMessageCount / 50, 1) / 3 : 0;
    return Math.min(100, Math.round((completedCount / 3 + activeContrib) * 100));
  }, [chatThreads]);

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
  const nextMilestone = milestones.find((m) => !m.done);

  const unlockedPanelBlocks = useMemo(() => {
    const budgetUnlocked =
      knowledgeScore >= 55 ||
      budgetRows.some((row) => row.amount > 0) ||
      allItems.some(
        (it) =>
          it.type === 'message' &&
          it.role === 'user' &&
          /presupuesto|gasto|ingreso|deuda|ahorro/i.test(it.content)
      );

    const transactionsUnlocked =
      knowledgeScore >= 74 ||
      bankSimulation.uploadedFiles.length > 0 ||
      bankSimulation.parsedDocuments.length > 0 ||
      allItems.some(
        (it) =>
          it.type === 'message' &&
          it.role === 'user' &&
          /transaccion|cartola|banco|cuenta|movimiento/i.test(it.content)
      );

    return { budgetUnlocked, transactionsUnlocked };
  }, [
    knowledgeScore,
    allItems,
    budgetRows,
    bankSimulation.uploadedFiles.length,
    bankSimulation.parsedDocuments.length,
  ]);

  const budgetTotals = useMemo(() => {
    const income = budgetRows
      .filter((r) => r.type === 'income')
      .reduce((acc, r) => acc + r.amount, 0);
    const expenses = budgetRows
      .filter((r) => r.type === 'expense')
      .reduce((acc, r) => acc + r.amount, 0);
    return { income, expenses, balance: income - expenses };
  }, [budgetRows]);

  const budgetInsights = useMemo(() => {
    const nonZeroRows = budgetRows.filter((row) => row.amount > 0);
    const expenseRows = nonZeroRows.filter((row) => row.type === 'expense');
    const fixedLike = expenseRows.filter((row) =>
      /(arriendo|hipoteca|luz|agua|internet|suscrip|colegio|seguro|deuda)/i.test(
        `${row.category} ${row.note ?? ''}`
      )
    );
    const variableLike = expenseRows.filter((row) => !fixedLike.some((f) => f.id === row.id));
    const fixedTotal = fixedLike.reduce((sum, row) => sum + row.amount, 0);
    const variableTotal = variableLike.reduce((sum, row) => sum + row.amount, 0);
    const savingsRate =
      budgetTotals.income > 0
        ? Math.max(0, (budgetTotals.balance / budgetTotals.income) * 100)
        : 0;
    const healthScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (budgetTotals.balance >= 0 ? 45 : 15) +
            Math.min(30, savingsRate * 1.2) +
            Math.min(25, nonZeroRows.length * 2.5)
        )
      )
    );

    const topExpenses = expenseRows
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4)
      .map((row) => ({
        id: row.id,
        label: row.category || 'Sin categoria',
        amount: row.amount,
        pct:
          budgetTotals.expenses > 0
            ? Math.round((row.amount / budgetTotals.expenses) * 100)
            : 0,
      }));

    return {
      nonZeroRows,
      expenseRows,
      fixedTotal,
      variableTotal,
      savingsRate,
      healthScore,
      topExpenses,
    };
  }, [budgetRows, budgetTotals.balance, budgetTotals.expenses, budgetTotals.income]);

  const intakeData = useMemo(
    () => (sessionInfo?.injectedIntake?.intake ?? null) as Record<string, unknown> | null,
    [sessionInfo?.injectedIntake]
  );

  const intakeContextData = useMemo(
    () => (sessionInfo?.injectedIntake?.intakeContext ?? null) as Record<string, unknown> | null,
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
        intel: buildTransactionIntelligence(product.parsedDocuments),
      })),
    [bankSimulation.products]
  );

  const isTransactionsLockedThisMonth = useMemo(
    () => bankSimulation.lockedMonth === monthKeyOf(),
    [bankSimulation.lockedMonth]
  );

  const continuityCard = useMemo(() => {
    const incomeRows = budgetRows.filter((row) => row.type === 'income' && row.amount > 0).length;
    const expenseRows = budgetRows.filter((row) => row.type === 'expense' && row.amount > 0).length;
    const docs = bankSimulation.parsedDocuments.length;
    const activeModules = [
      sessionInfo?.injectedIntake ? 'intake' : null,
      profile ? 'perfil' : null,
      incomeRows + expenseRows > 0 ? 'presupuesto' : null,
      docs > 0 ? 'transacciones' : null,
    ].filter(Boolean).length;

    const headline =
      activeModules >= 4
        ? 'Motor conectado de punta a punta'
        : activeModules === 3
        ? 'Flujo muy bien conectado'
        : activeModules === 2
        ? 'Base útil, falta profundidad'
        : 'Aún hay piezas sueltas';

    const details = [
      sessionInfo?.injectedIntake
        ? `Intake activo con foco ${String(intakeContextData?.financialLiteracy ?? 'personalizado')}.`
        : 'Falta intake para calibrar lenguaje, riesgo y profundidad.',
      incomeRows + expenseRows > 0
        ? `Presupuesto vivo con ${incomeRows + expenseRows} filas útiles y balance ${budgetTotals.balance >= 0 ? 'positivo' : 'presionado'}.`
        : 'Todavía no hay presupuesto suficiente para detectar patrón mensual.',
      docs > 0
        ? `${docs} cartola(s) o evidencia(s) listas para lectura transaccional.`
        : 'Sin cartolas procesadas todavía para análisis fino.',
    ];

    return { headline, details };
  }, [
    bankSimulation.parsedDocuments.length,
    budgetRows,
    budgetTotals.balance,
    intakeContextData,
    profile,
    sessionInfo?.injectedIntake,
  ]);

  const interviewCard = useMemo(() => {
    const name = firstNameOf(sessionInfo?.name);
    const stress = typeof intakeData?.moneyStressLevel === 'number' ? intakeData.moneyStressLevel : null;
    const understanding =
      typeof intakeData?.selfRatedUnderstanding === 'number' ? intakeData.selfRatedUnderstanding : null;
    const prompt =
      stress !== null && stress >= 7
        ? 'Conviene una llamada breve para bajar ruido, mapear presión financiera y priorizar decisiones.'
        : understanding !== null && understanding <= 4
        ? 'Conviene una llamada guiada para traducir conceptos y cerrar vacíos antes de recomendar.'
        : 'Conviene una llamada de profundización para pasar de contexto general a decisiones concretas.';

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
  }, [intakeData, sessionInfo?.name]);

  const transactionIntel = useMemo(
    () => buildTransactionIntelligence(bankSimulation.parsedDocuments),
    [bankSimulation.parsedDocuments]
  );

  const questionnaireDashboard = useMemo(() => {
    if (!intakeData) return null;
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
      { label: 'Profesión', value: String(intakeData.profession ?? 'No declarado') },
      { label: 'Situación laboral', value: String(intakeData.employmentStatus ?? 'No declarado') },
      { label: 'Ingreso mensual', value: String(intakeData.incomeBand ?? 'No declarado') },
      { label: 'Cobertura de gastos', value: String(intakeData.expensesCoverage ?? 'No declarado') },
      { label: 'Control de gastos', value: String(intakeData.tracksExpenses ?? 'No declarado') },
      { label: 'Deuda activa', value: hasDebt ? 'Sí' : 'No' },
      { label: 'Ahorro / inversión', value: hasSavings ? 'Sí' : 'No' },
      { label: 'Reacción al riesgo', value: String(intakeData.riskReaction ?? 'No declarado') },
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
    if (engagedChatsCount < 3) {
      return `Tip: activa los 3 chats (actual ${engagedChatsCount}/3) para sumar progreso real.`;
    }
    if (!unlockedPanelBlocks.budgetUnlocked) {
      return 'Tip: cuentame ingresos y gastos para desbloquear Presupuesto.';
    }
    if (!unlockedPanelBlocks.transactionsUnlocked) {
      return 'Tip: habla de cartolas, cuentas o banco para desbloquear Transacciones.';
    }
    if (knowledgeScore < 85) {
      return 'Tip: usa presupuesto, deuda, simulaciones o APV para seguir subiendo tu barra de conocimiento.';
    }
    return 'Tu barra ya refleja aprendizaje avanzado. Ahora conviene consolidar evidencia y planes accionables.';
  }, [
    knowledgeScore,
    engagedChatsCount,
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
    if (!authBootstrapped || !isAuthenticated) return;
    let alive = true;

    loadPanelState()
      .then((data) => {
        if (!alive) return;
        const panelState = data?.panelState;
        if (panelState && typeof panelState === 'object') {
          if (Array.isArray(panelState.budgetRows) && panelState.budgetRows.length > 0) {
            setBudgetRows(panelState.budgetRows);
          }
          if (Array.isArray(panelState.savedReports)) {
            setSavedReports(panelState.savedReports);
          }
          if (panelState.bankSimulation && typeof panelState.bankSimulation === 'object') {
            setBankSimulation((prev) => ({
              ...prev,
              products: Array.isArray(panelState.bankSimulation.products)
                ? panelState.bankSimulation.products
                : prev.products,
              activeProductId:
                typeof panelState.bankSimulation.activeProductId === 'string'
                  ? panelState.bankSimulation.activeProductId
                  : prev.activeProductId,
              lockedMonth:
                typeof panelState.bankSimulation.lockedMonth === 'string'
                  ? panelState.bankSimulation.lockedMonth
                  : prev.lockedMonth,
              username:
                typeof panelState.bankSimulation.username === 'string'
                  ? panelState.bankSimulation.username
                  : prev.username,
              connected: Boolean(panelState.bankSimulation.connected),
              randomMode: Boolean(panelState.bankSimulation.randomMode),
              uploadedFiles: Array.isArray(panelState.bankSimulation.uploadedFiles)
                ? panelState.bankSimulation.uploadedFiles
                : prev.uploadedFiles,
              parsedDocuments: Array.isArray(panelState.bankSimulation.parsedDocuments)
                ? panelState.bankSimulation.parsedDocuments
                : prev.parsedDocuments,
            }));
          }
        }
        setPanelStateLoaded(true);
      })
      .catch(() => {
        if (alive) setPanelStateLoaded(true);
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
      savePanelState({
        budgetRows,
        bankSimulation: {
          products: bankSimulation.products,
          activeProductId: bankSimulation.activeProductId,
          lockedMonth: bankSimulation.lockedMonth,
          username: bankSimulation.username,
          connected: bankSimulation.connected,
          randomMode: bankSimulation.randomMode,
          uploadedFiles: bankSimulation.uploadedFiles,
          parsedDocuments: bankSimulation.parsedDocuments,
        },
        savedReports,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }, 1200);

    return () => {
      if (panelSaveTimerRef.current) clearTimeout(panelSaveTimerRef.current);
    };
  }, [budgetRows, bankSimulation, savedReports, panelStateLoaded]);

  useEffect(() => {
    // Monthly reset for transaction flow (allows uploading previous month once each new month).
    if (!bankSimulation.lockedMonth) return;
    if (bankSimulation.lockedMonth === monthKeyOf()) return;
    setBankSimulation((prev) => ({
      ...prev,
      lockedMonth: null,
      connected: false,
      randomMode: false,
      uploadedFiles: [],
      parsedDocuments: [],
      products: prev.products.map((p) => ({
        ...p,
        connected: false,
        randomMode: false,
        uploadedFiles: [],
        parsedDocuments: [],
      })),
    }));
    setTxWizardStep('products');
  }, [bankSimulation.lockedMonth]);

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
    const intake = sessionInfo?.injectedIntake?.intake;
    if (!panelStateLoaded || !intake) return;
    if (budgetRows.some((row) => row.amount > 0)) return;

    const monthlyIncome = Number(intake.exactMonthlyIncome ?? 0);
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return;

    setBudgetRows((prev) =>
      prev.map((row) => {
        if (row.id === 'income-salary') {
          return {
            ...row,
            amount: monthlyIncome,
            note: intake.profession ? `Ingreso declarado por ${intake.profession}` : 'Ingreso declarado en intake',
          };
        }
        if (row.id === 'expense-debt' && intake.hasDebt) {
          return {
            ...row,
            note: 'Deuda declarada en intake',
          };
        }
        return row;
      })
    );
  }, [panelStateLoaded, sessionInfo?.injectedIntake, budgetRows]);

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
    const outgoingText = String(messageOverride ?? input ?? '').trim();
    if (!outgoingText || loading) return;
    if (isActiveChatLocked) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'Este chat todavia esta bloqueado. Terminemos primero el flujo base en el Chat 1: presupuesto, cartolas y entrevista breve para construir el diagnostico.',
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
      const res = (await sendToAgent({
        user_message: enrichedUserMessage,
        session_id: getSessionId(),
        history: historySnapshot,
        context: {
          recent_artifacts: recentArtifacts,
          recent_chart_summaries: recentChartSummaries,
          uploaded_documents: bankSimulation.parsedDocuments.slice(-3),
          uploaded_evidence_files: bankSimulation.uploadedFiles.slice(-6),
          consolidated_context: {
            transactions: {
              connected: bankSimulation.connected,
              uploadedFiles: bankSimulation.uploadedFiles.slice(-6),
            },
          },
        },
        ui_state: {
          panel_stage: panelStage,
          panel_collapsed: isPanelCollapsed,
          active_chat: {
            id: activeThread?.id,
            label: activeThread?.label,
            name: activeThread?.name,
          },
          unlocked_modules: {
            budget: unlockedPanelBlocks.budgetUnlocked,
            transactions: unlockedPanelBlocks.transactionsUnlocked,
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
          actionReminders: metaLifecycle.latest_action_reminder
            ? [
                metaLifecycle.latest_action_reminder,
                ...(prev?.actionReminders ?? []).filter(
                  (item) => item.id !== metaLifecycle.latest_action_reminder?.id
                ),
              ]
            : prev?.actionReminders,
        }));
      }
      forceRender((x) => x + 1);

      // Handle panel action from agent
      if (res?.panel_action && (res.panel_action.section || res.panel_action.message)) {
        handlePanelAction(res.panel_action);
      }

      // Handle budget updates inferred by agent from conversation
      if (Array.isArray(res?.budget_updates) && res.budget_updates.length > 0) {
        setBudgetRows((prev) => {
          const updated = [...prev];
          for (const upd of res.budget_updates!) {
            // Try to find existing row with same label (case-insensitive)
            const existingIdx = updated.findIndex(
              (r) => r.type === upd.type && r.note.toLowerCase().includes(upd.label.toLowerCase())
            );
            if (existingIdx >= 0) {
              // Update existing row amount
              updated[existingIdx] = { ...updated[existingIdx], amount: upd.amount };
            } else {
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
          return updated;
        });
      }

      // Update context score + check sheet cycling (50-message limit per sheet)
      if (typeof res?.context_score === 'number') {
        setChatThreads((prev) => {
          const updated = prev.map((t) => {
            if (t.id !== activeChatId) return t;
            const newScore = Math.max(t.contextScore, res.context_score!);
            const shouldCycle = t.userMessageCount >= 50 && t.status === 'active';
            if (shouldCycle) {
              // Auto-switch to next available base sheet (chat-1/2/3)
              const BASE_IDS = ['chat-1', 'chat-2', 'chat-3'];
              const nextSheet = prev.find((s) => BASE_IDS.includes(s.id) && s.status === 'active' && s.id !== t.id);
              if (nextSheet) {
                setTimeout(() => setActiveChatId(nextSheet.id), 0);
              } else {
                // All 3 base sheets complete — trigger meta-sheet after brief delay
                setTimeout(() => generateMetaSheet(prev), 600);
              }
              return { ...t, status: 'context' as const, contextScore: newScore, completedAt: new Date().toISOString() };
            }
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
    const uploadFiles = selected.map((file) => ({
      name: file.name,
      mime: file.type || undefined,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setItemsForActive((prev) => [
      ...prev,
      { type: 'upload', role: 'user', files: uploadFiles },
    ]);

    const parsedDocuments = await onUploadStatement(files);

    const names = selected.map((f) => f.name);
    if (!parsedDocuments || parsedDocuments.length === 0) {
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

    const docsSummary = parsedDocuments.map((doc) => ({
      name: doc.name,
      preview: String(doc.text || '').slice(0, 500),
    }));
    const message = `Cargué y procesé estos archivos para analizarlos contigo: ${names.join(
      ', '
    )}. Contexto extraído: ${JSON.stringify(docsSummary)}. Úsalos para el diagnóstico y próximos cálculos.`;
    void onSend(message);
  }

  function updateBudgetRow(
    id: string,
    field: keyof BudgetRow,
    value: string | number
  ) {
    setBudgetRows((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                field === 'amount'
                  ? Number(value) || 0
                  : value,
            }
          : row
      )
    );
  }

  function addBudgetRow(type: 'income' | 'expense') {
    setBudgetRows((rows) => [
      ...rows,
      {
        id: `${type}-${Date.now()}`,
        category: type === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto',
        type,
        amount: 0,
        note: '',
      },
    ]);
  }

  function upsertBudgetRow(row: BudgetRow) {
    setBudgetRows((rows) => {
      const idx = rows.findIndex((item) => item.id === row.id);
      if (idx >= 0) {
        return rows.map((item) => (item.id === row.id ? { ...item, ...row } : item));
      }
      return [...rows, row];
    });
  }

  function sendBudgetToAgent() {
    const budgetSummary = budgetRows
      .filter((r) => r.amount > 0 || (r.category ?? '').trim().length > 0)
      .slice(0, 18)
      .map((r) => ({
        c: (r.category ?? '').trim().slice(0, 48) || 'sin_categoria',
        t: r.type === 'income' ? 'I' : 'E',
        m: Math.round(Number(r.amount) || 0),
      }));
    const intakeCompact = (() => {
      const intake = (intakeData ?? {}) as Record<string, unknown>;
      return {
        incomeBand: intake.incomeBand ?? null,
        hasDebt: intake.hasDebt ?? null,
        hasSavings: intake.hasSavingsOrInvestments ?? null,
        riskReaction: intake.riskReaction ?? null,
      };
    })();
    const message = [
      'Modo presupuesto: analiza y optimiza.',
      `KPIs ingreso=${Math.round(budgetTotals.income)} gasto=${Math.round(
        budgetTotals.expenses
      )} balance=${Math.round(budgetTotals.balance)} ahorro_pct=${Math.round(
        budgetInsights.savingsRate
      )} salud=${budgetInsights.healthScore}`,
      `Contexto intake compacto=${JSON.stringify(intakeCompact)}`,
      `Filas presupuesto=${JSON.stringify(budgetSummary)}`,
      'Entrega SOLO: 1) diagnostico corto, 2) 3 ajustes priorizados con monto sugerido, 3) una meta de ahorro mensual.',
    ].join('\n');
    setIsBudgetModalOpen(false);
    void onSend('Configurar presupuesto', {
      agentPayload: message,
      assistantPendingLabel:
        'Configurando presupuesto con Financiera mente… preparando lectura ejecutiva y recomendaciones.',
      hideUserMessage: true,
    });
  }

  function openTransactionsPanel() {
    if (!unlockedPanelBlocks.transactionsUnlocked) return;
    if (isTransactionsLockedThisMonth) {
      setTxWizardStep('locked');
      setIsTransactionsModalOpen(true);
      return;
    }
    setTxWizardStep('products');
    setIsTransactionsModalOpen(true);
  }

  function addTransactionProduct() {
    const id = `prod-${Date.now()}`;
    const product: BankProduct = {
      id,
      label: `Producto ${bankSimulation.products.length + 1}`,
      bank: '',
      username: '',
      password: '',
      connected: false,
      randomMode: false,
      uploadedFiles: [],
      parsedDocuments: [],
    };
    setBankSimulation((prev) => ({
      ...prev,
      products: [...prev.products, product],
      activeProductId: id,
      username: '',
      password: '',
      connected: false,
      randomMode: false,
      uploadedFiles: [],
      parsedDocuments: [],
    }));
    setTxWizardStep('credentials');
  }

  function selectTransactionProduct(productId: string) {
    const selectedProduct = bankSimulation.products.find((p) => p.id === productId) ?? null;
    setBankSimulation((prev) => {
      const product = prev.products.find((p) => p.id === productId);
      if (!product) return prev;
      return {
        ...prev,
        activeProductId: product.id,
        username: product.username,
        password: product.password,
        connected: product.connected,
        randomMode: product.randomMode,
        uploadedFiles: product.uploadedFiles,
        parsedDocuments: product.parsedDocuments,
        };
    });
    if (isTransactionsLockedThisMonth) {
      setTxWizardStep('locked');
    } else if (!selectedProduct?.connected) {
      setTxWizardStep('credentials');
    } else if ((selectedProduct.parsedDocuments.length ?? 0) === 0) {
      setTxWizardStep('upload');
    } else {
      setTxWizardStep('dashboard');
    }
  }

  function updateActiveProduct(updates: Partial<BankProduct>) {
    setBankSimulation((prev) => {
      if (!prev.activeProductId) return prev;
      const products = prev.products.map((p) =>
        p.id === prev.activeProductId ? { ...p, ...updates } : p
      );
      const active = products.find((p) => p.id === prev.activeProductId);
      if (!active) return prev;
      return {
        ...prev,
        products,
        username: active.username,
        password: active.password,
        connected: active.connected,
        randomMode: active.randomMode,
        uploadedFiles: active.uploadedFiles,
        parsedDocuments: active.parsedDocuments,
      };
    });
  }

  function deleteTransactionProduct(productId: string) {
    setBankSimulation((prev) => {
      const products = prev.products.filter((p) => p.id !== productId);
      const nextActiveId =
        prev.activeProductId === productId ? products[0]?.id ?? null : prev.activeProductId;
      const nextActive = nextActiveId ? products.find((p) => p.id === nextActiveId) ?? null : null;
      return {
        ...prev,
        products,
        activeProductId: nextActiveId,
        username: nextActive?.username ?? '',
        password: nextActive?.password ?? '',
        connected: nextActive?.connected ?? false,
        randomMode: nextActive?.randomMode ?? false,
        uploadedFiles: nextActive?.uploadedFiles ?? [],
        parsedDocuments: nextActive?.parsedDocuments ?? [],
      };
    });
    setTxWizardStep('products');
  }

  function simulateBankLogin(randomMode = false) {
    if (!activeBankProduct || isTransactionsLockedThisMonth) return;
    if (randomMode) {
      updateActiveProduct({
        username: randomBankCredential('usr'),
        password: randomBankCredential('pwd'),
        randomMode: true,
        connected: true,
      });
      setTxWizardStep('upload');
      return;
    }
    updateActiveProduct({
      connected:
        activeBankProduct.username.trim().length > 0 &&
        activeBankProduct.password.trim().length > 0 &&
        activeBankProduct.bank.trim().length > 0,
      randomMode: false,
    });
    setTxWizardStep('upload');
  }

  async function onUploadStatement(files: FileList | null): Promise<Array<{ name: string; text: string }>> {
    if (!isAuthenticated) {
      router.replace('/login');
      return [];
    }
    if (!files || files.length === 0) return [];
    if (!activeBankProduct || isTransactionsLockedThisMonth) return [];

    const selectedFiles = Array.from(files);
    const names = selectedFiles.map((f) => f.name);
    setDocumentsLoading(true);

    try {
      const encodedFiles = await Promise.all(
        selectedFiles.map(
          (file) =>
            new Promise<{ name: string; base64: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const raw = typeof reader.result === 'string' ? reader.result : '';
                const base64 = raw.includes(',') ? raw.split(',')[1] ?? '' : raw;
                resolve({ name: file.name, base64 });
              };
              reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
              reader.readAsDataURL(file);
            })
        )
      );

      const parsed = await parseDocuments(encodedFiles);
      const parsedDocs = Array.isArray(parsed?.documents) ? parsed.documents : [];
      setBankSimulation((prev) => {
        if (!prev.activeProductId) return prev;
        const active = prev.products.find((p) => p.id === prev.activeProductId);
        if (!active) return prev;
        const nextDocs = [...active.parsedDocuments];
        for (const doc of parsedDocs) {
          const existingIdx = nextDocs.findIndex((existing) => existing.name === doc.name);
          if (existingIdx >= 0) {
            nextDocs[existingIdx] = doc;
          } else {
            nextDocs.push(doc);
          }
        }

        const nextFiles = Array.from(new Set([...active.uploadedFiles, ...names]));
        const provisionalProduct: BankProduct = {
          ...active,
          uploadedFiles: nextFiles,
          parsedDocuments: nextDocs,
        };
        const descriptor = buildProductCardDescriptor(provisionalProduct);
        const inferredInstitution = inferInstitutionFromText(
          nextDocs.map((d) => d.text ?? '').join('\n'),
          active.bank
        );
        const inferredType = inferProductTypeFromText(nextDocs.map((d) => d.text ?? '').join('\n'));
        const generatedLabel =
          inferredInstitution !== 'Institución no identificada'
            ? `${inferredInstitution} · ${inferredType}`
            : active.label;

        const products = prev.products.map((p) =>
          p.id === active.id
            ? {
                ...p,
                uploadedFiles: nextFiles,
                parsedDocuments: nextDocs,
                bank: p.bank.trim() ? p.bank : inferredInstitution,
                label: generatedLabel || descriptor.title || p.label,
              }
            : p
        );

        return {
          ...prev,
          products,
          uploadedFiles: nextFiles,
          parsedDocuments: nextDocs,
        };
      });
      setTxWizardStep('dashboard');
      return parsedDocs;
    } catch {
      setBankSimulation((prev) => {
        if (!prev.activeProductId) return prev;
        const active = prev.products.find((p) => p.id === prev.activeProductId);
        if (!active) return prev;
        const nextFiles = Array.from(new Set([...active.uploadedFiles, ...names]));
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === active.id ? { ...p, uploadedFiles: nextFiles } : p
          ),
          uploadedFiles: nextFiles,
        };
      });
      return [];
    } finally {
      setDocumentsLoading(false);
    }
  }

  function sendTransactionsToAgent() {
    if (!activeBankProduct || activeBankProduct.parsedDocuments.length === 0) return;

    const documentsSummary = activeBankProduct.parsedDocuments.map((doc) => ({
      name: doc.name,
      preview: doc.text.slice(0, 600),
    }));

    const compactTopKeywords = transactionIntel.topKeywords.slice(0, 8).map((k) => ({
      l: k.label,
      c: k.count,
    }));
    const compactDocs = documentsSummary.slice(0, 6).map((d) => ({
      n: d.name,
      p: d.preview.slice(0, 220),
    }));

    const message = [
      'Modo transacciones: analisis mensual premium.',
      `Producto=${activeBankProduct.label} banco=${activeBankProduct.bank}`,
      `Mes objetivo=${monthKeyOf(new Date(Date.now() - 20 * 24 * 3600 * 1000))}`,
      `KPIs docs=${transactionIntel.docs} rows=${transactionIntel.rows} total=${Math.round(
        transactionIntel.totalDetected
      )} avg=${Math.round(transactionIntel.averageDetected)} max=${Math.round(
        transactionIntel.maxDetected
      )}`,
      `Keywords=${JSON.stringify(compactTopKeywords)}`,
      `Contexto presupuesto=${JSON.stringify({
        income: Math.round(budgetTotals.income),
        expenses: Math.round(budgetTotals.expenses),
        balance: Math.round(budgetTotals.balance),
      })}`,
      `Documentos=${JSON.stringify(compactDocs)}`,
      'Entrega: dashboard ejecutivo resumido + hallazgos + 3 acciones concretas.',
    ].join('\n');

    setIsTransactionsModalOpen(false);
    setBankSimulation((prev) => ({
      ...prev,
      lockedMonth: monthKeyOf(),
    }));
    setTxWizardStep('locked');
    void onSend('Configurar transacciones', {
      agentPayload: message,
      assistantPendingLabel:
        'Configurando transacciones con Financiera mente… consolidando cartolas y hallazgos ejecutivos.',
      hideUserMessage: true,
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

  async function generateMetaSheet(sheets: ChatThread[]) {
    const BASE_IDS = ['chat-1', 'chat-2', 'chat-3'];
    const contextSheets = sheets.filter((s) => BASE_IDS.includes(s.id) && s.status === 'context');
    if (contextSheets.length < 3) return;
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
        user_message: `SISTEMA: Se han completado las 3 hojas de conversación. Genera un resumen ejecutivo personalizado que integre todo el contexto recopilado, los objetivos identificados, el perfil financiero del usuario y una hoja de ruta de recomendaciones de alto impacto para esta nueva hoja maestra. Contexto de las 3 hojas:\n${contextSummary}`,
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
    removeInjectedIntake,
    removeInjectedProfile,
    agentMetaRef,
    nextMilestone,
    knowledgeScore,
    continuityCard,
    engagementScore,
    interviewCard,
    setInterviewIntake,
    router,
    unlockedPanelBlocks,
    setIsBudgetModalOpen,
    budgetTotals,
    budgetInsights,
    openTransactionsPanel,
    transactionIntel,
    reportsByGroup,
    librarySummary,
    savedReports,
    recentLibraryRef,
    isLandingRecents,
    recentReports,
    newReportId,
    docVisualOffset,
  });

  const panelRenderedCards = isMobileViewport
    ? [
        ...panelBaseCards.map((card, index) =>
          React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
            key: `prepend-${card.key}`,
            'data-loop-segment': 'prepend',
            'data-loop-origin': String(index),
            className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
          })
        ),
        ...panelBaseCards.map((card, index) =>
          React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
            key: `real-${card.key}`,
            'data-loop-segment': 'real',
            'data-loop-origin': String(index),
            className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
          })
        ),
        ...panelBaseCards.map((card, index) =>
          React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
            key: `append-${card.key}`,
            'data-loop-segment': 'append',
            'data-loop-origin': String(index),
            className: `${((card.node.props as { className?: string }).className ?? '')} mobile-loop-card`,
          })
        ),
      ]
    : panelBaseCards.map((card) =>
        React.cloneElement(card.node, {
          key: `real-${card.key}`,
        })
      );

  return (
    <main
      className={`agent-layout ${activeThreadThemeClass} ${
        isRailMorphing ? 'is-mode-12-morphing' : ''
      } ${
        isMonochrome ? 'is-monochrome' : ''
      } ${
        mobilePanelExpanded ? 'mobile-panel-expanded' : ''
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
          isMonochrome={isMonochrome}
          setIsMonochrome={setIsMonochrome}
          phaseLabel={phaseLabel}
          productLifecycle={productLifecycle as any}
          activeTurnsRemaining={activeTurnsRemaining}
          setNameForActive={setNameForActive}
          deleteThreadById={deleteThreadById}
          isActiveChatLocked={isActiveChatLocked}
          activeTurnCount={activeTurnCount}
          knowledgePopupOpen={knowledgePopupOpen}
          knowledgeStage={knowledgeStage}
          completedMilestones={completedMilestones}
          milestones={milestones}
          coachHint={coachHint}
        />

        <div className="agent-chat-body">
          <ChatThreadView
            items={items}
            loading={loading}
            activeThreadId={activeThread?.id}
            activeThreadLabel={activeThread?.label}
            expandedCitationsByMessage={expandedCitationsByMessage}
            setExpandedCitationsByMessage={setExpandedCitationsByMessage}
            onSend={onSend}
            setDraftForActive={setDraftForActive}
            sessionInjectedIntake={sessionInfo?.injectedIntake}
            chatThreadRef={chatThreadRef as React.RefObject<HTMLDivElement>}
            latestActionReminder={latestActionReminder}
            activeChatId={activeChatId}
            setProductLifecycle={setProductLifecycle}
            setItemsForActive={setItemsForActive}
            classifyReportGroup={classifyReportGroup}
            setSavedReports={setSavedReports}
            launchDocToLibraryAnimation={launchDocToLibraryAnimation}
          />

          <div className="agent-input">
            <textarea
              placeholder={isActiveChatLocked ? 'Chat bloqueado hasta completar el diagnóstico' : 'Escribe tu mensaje...'}
              value={input}
              disabled={isActiveChatLocked}
              onChange={(e) => setDraftForActive(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />

            <div className="controls">
              <input
                ref={chatUploadInputRef}
                type="file"
                accept=".pdf,.xls,.xlsx,.csv,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  void onUploadFromChat(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                className="continue-button"
                disabled={isActiveChatLocked}
                onClick={() => chatUploadInputRef.current?.click()}
                title="Adjuntar imagen, PDF o Excel"
              >
                Adjuntar archivo
              </button>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                className="continue-button"
                disabled={isActiveChatLocked}
                onClick={() => {
                  void onSend();
                }}
              >
                Enviar
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
        updateBudgetRow={updateBudgetRow}
        upsertBudgetRow={upsertBudgetRow}
        coachHint={coachHint}
        addBudgetRow={addBudgetRow}
        sendBudgetToAgent={sendBudgetToAgent}
      />

      <QuestionnaireModal
        isOpen={isQuestionnaireModalOpen}
        questionnaireDashboard={questionnaireDashboard}
        onClose={() => setIsQuestionnaireModalOpen(false)}
      />

      <TransactionsModal
        isOpen={isTransactionsModalOpen}
        onClose={() => setIsTransactionsModalOpen(false)}
        txWizardStep={txWizardStep}
        setTxWizardStep={setTxWizardStep}
        bankSimulationProductsCount={bankSimulation.products.length}
        transactionIntel={transactionIntel}
        isTransactionsLockedThisMonth={isTransactionsLockedThisMonth}
        activeBankProduct={activeBankProduct}
        transactionProductCards={transactionProductCards}
        selectedProductId={bankSimulation.activeProductId}
        selectTransactionProduct={selectTransactionProduct}
        deleteTransactionProduct={deleteTransactionProduct}
        addTransactionProduct={addTransactionProduct}
        updateActiveProduct={updateActiveProduct}
        simulateBankLogin={simulateBankLogin}
        onUploadStatement={onUploadStatement}
        documentsLoading={documentsLoading}
        sendTransactionsToAgent={sendTransactionsToAgent}
      />
    </main>
  );
}
