'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Send } from 'lucide-react';
import 'katex/dist/katex.min.css';

import {
  clearComposerTypingVisual,
  focusMobileInput,
  restoreAgentShellViewport,
} from '@/lib/interfaz/mobile-viewport-sync';
import { dismissMobileKeyboard } from '@/lib/interfaz/mobile-keyboard-focus';
import {
  applyVisualModeToDocument,
  clearStoredVisualMode,
  cycleVisualMode,
  isVisualModeActive,
  isVisualModeTransitionActive,
  readStoredVisualMode,
  runVisualModeTransition,
  storeVisualMode,
  type VisualMode,
} from '@/lib/interfaz/visual-mode';
import { flushSync } from 'react-dom';
import { getSessionId } from '@/lib/sesion/session';
import type { CoreAgentResponseSideEffects } from '@/lib/agente/nucleo/applyCoreAgentResponse';
import type { CoreAgentRequestContext } from '@/lib/agente/nucleo/buildCoreAgentContext';
import { useCoreAgentSend } from './hooks/useCoreAgentSend';
import { useAgentPersistence } from './hooks/use-agent-persistence';
import { buildOnboardingFlowCta } from './flujo/onboarding-flow.helpers';
import { clearPersistedInterviewState, useInterviewStore } from '@/state/interview.store';
import { syncDiagnosisSession } from '@/lib/diagnostico/sesion';
import { useProfileStore } from '@/state/profile.store';
import { useSessionStore } from '@/state/session.store';
import {
  getSessionInfo,
  logoutUser,
  deleteAccount,
  loadSheets,
  deletePdfArtifact,
  parseDocuments,
  mergeProductsContextToIntake,
} from '@/lib/api/cliente';
import { ApiHttpError } from '@/lib/api/envelope';
import { toUserFacingError } from '@/lib/compartido/userError';
import { localizeDisplayValue } from '@/lib/display/localized-display';
import {
  isProductsStepSatisfied,
  isTransactionsEvidenceSatisfied,
  productsHaveAnalyzedMovements,
  resolveTxWizardStep,
} from '@/lib/transacciones/flujo.helpers';
import {
  deriveTransactionAuthorizationState,
  buildTransactionAuthorizationBlockMessage,
} from '@/lib/transacciones/autorizacion.helpers';
import { MAX_BUDGET_ROWS } from '@/lib/presupuesto/filas.helpers';
import { buildBudgetAssistantProductsFromBankSimulation } from '@/lib/presupuesto/budget-assistant-movement-feed';
import { canOpenInterview as computeCanOpenInterview } from './flujo/interview-gate.helpers';
import {
  aggregateCanonicalMovements,
  aggregateParsedDocuments,
  aggregateUploadedFiles,
  buildPersistableProductsContext,
  getSimulationSnapshot,
} from '@/lib/compartido/products-context.helpers';
import {
  applyUploadToTargetProduct,
  normalizeParsedUploadDocuments,
} from '@/lib/transacciones/estado-upload.helpers';
import {
  panelStateBackupKeyForUser,
} from '@/lib/compartido/panel-state.helpers';
import { normalizeProductAssistantState } from '@/lib/compartido/product-normalization.helpers';
import {
  IDLE_PARSE_PROGRESS,
  type DocumentsParseProgress,
} from '@/lib/transacciones/progreso-parse.helpers';
import {
  DEFAULT_BANK_SIMULATION,
  FALLBACK_WELCOME,
  KNOWLEDGE_MILESTONE_DEFS,
  MAX_EVIDENCE_FILES_PER_PRODUCT,
  MAX_CHAT_UPLOAD_FILES,
  MAX_TRANSACTION_PRODUCTS,
  MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL,
  MAX_TRANSACTION_EVIDENCE_RESETS,
  PRIMARY_CHAT_ID,
  type BankSimulation,
} from './utilidades/agent-page.constants';
import { alignProductDashboard } from './modales/transacciones/align-product-dashboard';
import {
  buildTransactionProductSavedAgentBlocks,
  buildTransactionProductSavedAgentMessage,
  buildTransactionProductSavedPanelMessage,
} from './modales/transacciones/product-saved-agent.helpers';
import type { BankProduct, TransactionTaxonomyOverride, UploadStatementResult } from './modales/transacciones/types';
import type { TxWizardStep } from '@/lib/transacciones/flujo.helpers';
import { normalizeTaxonomyKey, normalizeTransactionTaxonomyOverride } from './modales/transacciones/taxonomy';
import secureStorage from '@/lib/compartido/secureStorage';
import { clearCsrfToken } from '@/lib/sesion/csrf';
import {
  clearInterviewVoiceState,
  readInterviewVoiceState,
} from '@/lib/sesion/interviewVoiceState';
import {
  buildProductCardDescriptor,
  buildTransactionIntelligence,
  buildChatClosureSummary,
  firstNameOf,
  dedupeConsecutiveAssistantMessages,
  sanitizeChatThreadMessages,
  getMaxChatInteractions,
  getClosingInteractionThreshold,
  getChat1UxCopy,
  resolveUnlockedChatIds,
  hasAssistantMessage,
  sanitizeChatItems,
  sanitizeMessageText,
  resolveChat1UxState,
  resolveActiveActionPlanStage,
  resolveActiveSocialConsciousnessStage,
  scrollChatThreadAfterUpdate,
  type ChatClosureSummary,
  type ScrollChatThreadOptions,
} from './utilidades/page.utils';
import {
  CHAT_CLOSED_SEND_MESSAGE,
  isChatOnboardingLocked,
  listNavigableChatIds,
  resolveChatThreadAccessState,
  resolveChatTurnCount,
} from './utilidades/chat-lifecycle.helpers';
import {
  buildWelcomeChatItem,
  isWelcomeShellMessageContent,
  normalizeChat1WelcomeShellItems,
  repairChat1WelcomeItems,
  shouldSeedWelcomeMessage,
} from './flujo/welcome-intro.shared';
import { buildChatIntroShellItem, repairChatIntroItems, shouldSeedChatIntroMessage } from './flujo/chat-intro.shared';
import { readSocialReflectionSession, hydrateSocialReflectionSessionFromServer } from '@/lib/agente/nucleo/social-consciousness-reflections';
import { ensureLeadingIntroShell } from '@/lib/agente/nucleo/stream-session';
import { resolvePanelDiagnosisProfile } from '@/lib/diagnostico/sesion';
import { AgentBootSequence } from './arranque/AgentBootSequence';
import { PanelCardsIntroSequence } from './paneles/PanelCardsIntroSequence';
import { PanelIntroGridSlot } from './paneles/PanelIntroGridSlot';
import { PanelIntroLayoutGroup } from './paneles/PanelIntroLayoutGroup';
import { shouldShowAgentBootSequence } from './arranque/agent-boot-sequence.helpers';
import { shouldPresentPanelIntro } from './paneles/panel-intro.prefs';

import type {
  AgentResponse,
  ChatItem,
} from '@/lib/agente/agent.response.types';
import { AccountModal, BudgetModal, QuestionnaireModal, TransactionsModal } from './modales';
import { InterviewModal } from './modales/entrevista/InterviewModal';
import { FincoinUsageModal } from './modales/fincoins/FincoinUsageModal';
import { useFincoinUsage } from './modales/fincoins/use-fincoin-usage';
import { useFincoinSpendGate } from './modales/fincoins/use-fincoin-spend-gate';
import type { FincoinUsageApiPayload } from '@/lib/api/cliente';
import { SocialConsciousnessModal } from './modales/conciencia-social/SocialConsciousnessModal';
import { SidePanels } from './paneles/side-panels';
import { PanelCalloutBanner } from './paneles/panel-callout-banner';
import { ContextConflictBanner } from './paneles/context-conflict-banner';
import { useContextConflictBanner } from './hooks/use-context-conflict-banner';
import type { ContextConflictUiAction } from '@/lib/context/context-conflict-ui';
import type { MobilePanelDeckHandle } from './paneles/mobile-panel-compact-carousel';
import { ChatThreadView } from './chat/chat-thread-view';
import { ChatHeader } from './chat/chat-header';
import { buildPanelBaseCards } from './paneles/panel-cards';
import { useBudgetRows } from './hooks/use-budget-rows';
import { useBudgetTablePending } from './hooks/use-budget-table-pending';
import { BudgetPendingConfirmBanner } from './modales/presupuesto/BudgetPendingConfirmBanner';
import { buildBudgetTablePatch, legacyBudgetUpdatesToActions } from '@financial-agent/shared';
import { useAgentShell } from './hooks/use-agent-shell';
import { buildEvidenceResetPatch, mergeBankProductPatch } from './modales/transacciones/state.helpers';
import { TX_MAX_TOTAL_FILE_BYTES } from './modales/transacciones/constants';
import { getEvidenceUploadCapacity } from '@/lib/transacciones/evidencia.helpers';
import { resolveUploadEvidenceSourceHint } from '@/lib/compartido/evidence-fidelity.helpers';
import { alignEvidenceUploadFormat } from '@/lib/compartido/evidence-format.helpers';
import { normalizeUploadFormat } from './modales/transacciones/tx-assistant.helpers';
import {
  buildChatUploadAgentPrompt,
  buildChatUploadFiles,
} from './chat/chat-upload.helpers';
import { buildPanelSnapshotPayload } from './page.flow';
import { clearPanelStateBackups, hydratePanelState } from './utilidades/panel-state.service';

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
  documentProfile?: unknown;
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
  userMessageCount: number;  // local counter for UX telemetry
  createdAt: string;
  completedAt?: string;
  closureSummary?: ChatClosureSummary | null;
  generalChatStarted?: boolean;
};

type ProductLifecycle = {
  phase?: string;
  unlockedChats?: string[];
  closedChats?: string[];
  chatTurns?: Record<string, number>;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  socialConsciousnessFunnelStage?: 'explore' | 'tension' | 'synthesis' | null;
  closingMode?: boolean;
};

type ChatSpecialization = {
  title: string;
  shortTitle: string;
  accentClass: string;
  subtitle: string;
};

function isStaleSessionErrorMessage(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    normalized === 'tu sesión expiró. inicia sesión nuevamente para continuar.' ||
    normalized.includes('tu sesión expiró. inicia sesión nuevamente para continuar.') ||
    normalized.includes('tu sesión expiró') ||
    normalized.includes('inicia sesión nuevamente para continuar')
  );
}

function containsStaleSessionError(item: ChatItem): boolean {
  try {
    return isStaleSessionErrorMessage(JSON.stringify(item));
  } catch {
    return false;
  }
}

function sanitizeChatThreadItems(items: ChatItem[]): ChatItem[] {
  return sanitizeChatThreadMessages(items).filter((item) => !containsStaleSessionError(item));
}

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

  const buildChat1WelcomeItem = useCallback(() => {
    return buildWelcomeChatItem({});
  }, []);

  function makeInitialThread(id: string, label: string, name: string): ChatThread {
    return {
      id,
      label,
      name,
      autoNamed: false,
      items: [],
      draft: '',
      status: 'active',
      userMessageCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  function getThreadSpecialization(threadId: string): ChatSpecialization {
    if (threadId === 'chat-1') {
      const chat1Thread = chatThreads.find((thread) => thread.id === PRIMARY_CHAT_ID);
      const chat1Ux = resolveChat1UxState({
        chatId: threadId,
        diagnosisCompleted: interviewCompleted,
        generalChatStarted: Boolean(chat1Thread?.generalChatStarted),
        canOpenInterview,
      });
      const copy = getChat1UxCopy(chat1Ux);
      return {
        title: copy.title,
        shortTitle: chat1Ux === 'diagnosisCompleted' ? 'Gen' : chat1Ux === 'interviewAvailable' ? 'Disp' : 'Base',
        accentClass: 'chat-specialization-1',
        subtitle: copy.subtitle,
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
    {
      ...makeInitialThread(PRIMARY_CHAT_ID, '1', 'Diagnóstico financiero'),
      items: [buildWelcomeChatItem({}) as ChatItem],
    },
    {
      ...makeInitialThread('chat-2', '2', 'Plan post-diagnóstico'),
      items: [buildChatIntroShellItem('chat-2') as ChatItem],
    },
    {
      ...makeInitialThread('chat-3', '3', 'Conciencia social post-diagnóstico'),
      items: [buildChatIntroShellItem('chat-3') as ChatItem],
    },
  ]);
  const [chat1IntroMode, setChat1IntroMode] = useState<'default' | 'deepen'>('default');
  const [diagnosisDeepenVoiceFindings, setDiagnosisDeepenVoiceFindings] = useState<string[] | undefined>(
    undefined,
  );
  const [activeChatId, setActiveChatId] = useState(PRIMARY_CHAT_ID);
  const [sheetsLoaded, setSheetsLoaded] = useState(false);
  const chatThreadsRef = useRef(chatThreads);
  const welcomeInjectedThreadsRef = useRef<Set<string>>(new Set());
  const [panelStage, setPanelStage] = useState(2);
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const {
    sessionInfo,
    setSessionInfo,
    authBootstrapped,
    isAuthenticated,
    isMobileViewport,
    isStandaloneDisplayMode,
  } = useAgentShell();
  const contextConflictBanner = useContextConflictBanner({
    contextFabric: sessionInfo?.contextFabric,
    userId: sessionInfo?.id ?? sessionInfo?.userId ?? null,
  });
  const [visualMode, setVisualMode] = useState<VisualMode>('off');
  const visualModeRef = useRef<VisualMode>('off');
  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);

  const handleCycleVisualMode = useCallback((origin?: { x: number; y: number }) => {
    const next = cycleVisualMode(visualModeRef.current);
    runVisualModeTransition(origin, () => {
      flushSync(() => {
        setVisualMode(next);
        applyVisualModeToDocument(next);
      });
    });
  }, []);
  const [progressPulse, setProgressPulse] = useState(false);
  const [isRailMorphing] = useState(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);
  const [knowledgePopupOpen, setKnowledgePopupOpen] = useState(false);
  const [fincoinUsageOpen, setFincoinUsageOpen] = useState(false);
  const {
    usage: fincoinUsage,
    loading: fincoinUsageLoading,
    refresh: refreshFincoinUsage,
    applyUsagePayload,
    isDepleted: fincoinDepleted,
    isLowBalance: fincoinLowBalance,
  } = useFincoinUsage(isAuthenticated);
  const { blockSpend: blockFincoinSpend, spendBlocked: fincoinSpendBlocked } = useFincoinSpendGate({
    depleted: fincoinDepleted,
    onOpenUsage: () => {
      setFincoinUsageOpen(true);
      void refreshFincoinUsage();
    },
    onNotify: (message) => {
      setPanelCallout({ section: 'chat', message });
    },
  });
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isQuestionnaireModalOpen, setIsQuestionnaireModalOpen] = useState(false);
  const [questionnaireModalMode, setQuestionnaireModalMode] = useState<'view' | 'edit'>('view');
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
    applyBudgetTableActions,
    buildPersistableBudgetContext,
  } = useBudgetRows();
  const {
    pending: budgetTablePending,
    setPending: setBudgetTablePending,
    consumeBudgetTablePatch,
    confirmPending: confirmBudgetTablePending,
    rejectPending: rejectBudgetTablePending,
    tryResolvePendingFromAnswer: tryResolveBudgetPendingFromAnswer,
    hasPending: hasBudgetTablePending,
  } = useBudgetTablePending(applyBudgetTableActions);
  const [budgetChatAnswers, setBudgetChatAnswers] = useState<Array<{ q: string; a: string }>>([]);
  const [bankSimulation, setBankSimulation] = useState<BankSimulation>(DEFAULT_BANK_SIMULATION);
  const [docFlight, setDocFlight] = useState<DocFlight | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const panelHydrateOwnerRef = useRef<string | null>(null);

  const [panelStateLoaded, setPanelStateLoaded] = useState(false);
  const [persistentKnowledgeScore, setPersistentKnowledgeScore] = useState<number | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsParseProgress, setDocumentsParseProgress] = useState<DocumentsParseProgress>(IDLE_PARSE_PROGRESS);
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
  const compactPanelDeckRef = useRef<MobilePanelDeckHandle | null>(null);
  const [newReportId, setNewReportId] = useState<string | null>(null);
  const [isLandingRecents, setIsLandingRecents] = useState(false);
  const [panelCallout, setPanelCallout] = useState<{ section: string; message: string } | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [expandedCitationsByMessage, setExpandedCitationsByMessage] = useState<Record<number, boolean>>({});
  const [interviewResumePending, setInterviewResumePending] = useState(false);
  const panelCalloutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatBodyRef = useRef<HTMLElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const prevThreadScrollTurnRef = useRef('');
  const mobilePanelHandleRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewAutoOpenHandledRef = useRef(false);
  const [bootSequenceActive, setBootSequenceActive] = useState(false);
  const [panelIntroActive, setPanelIntroActive] = useState(false);
  const [panelIntroPhase, setPanelIntroPhase] = useState<
    'morph' | 'shell' | 'assemble' | 'settle'
  >('morph');
  const [panelIntroRevealedCount, setPanelIntroRevealedCount] = useState(0);
  const [panelIntroSettled, setPanelIntroSettled] = useState(false);
  const [panelIntroHandoffOrigin, setPanelIntroHandoffOrigin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const panelIntroStartRef = useRef(false);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    if (shouldShowAgentBootSequence()) {
      setBootSequenceActive(true);
    }
  }, [authBootstrapped, isAuthenticated]);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    if (bootSequenceActive || panelIntroActive) return;
    if (!shouldPresentPanelIntro()) return;
    if (panelIntroStartRef.current) return;

    const delay = panelIntroHandoffOrigin ? 72 : 200;
    const timer = window.setTimeout(() => {
      if (!shouldPresentPanelIntro() || panelIntroStartRef.current) return;
      panelIntroStartRef.current = true;
      setPanelIntroPhase('morph');
      setPanelIntroRevealedCount(0);
      setPanelIntroSettled(false);
      setPanelIntroActive(true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    authBootstrapped,
    isAuthenticated,
    bootSequenceActive,
    panelIntroActive,
    panelIntroHandoffOrigin,
  ]);

  const loadProfileIfNeeded = useProfileStore((s) => s.loadProfileIfNeeded);
  const profile = useProfileStore((s) => s.profile);
  const resolvedDiagnosisProfile = useMemo(
    () => resolvePanelDiagnosisProfile(sessionInfo?.injectedProfile, profile),
    [sessionInfo?.injectedProfile, profile],
  );
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
  const threadScrollAnchor = useMemo(() => {
    const last = items[items.length - 1];
    if (last?.type === 'message' && last.role === 'assistant' && last.stream) {
      return `${items.length}:${last.stream.phase ?? ''}:${last.stream.streaming ? 1 : 0}:${(last.content ?? '').length}`;
    }
    return String(items.length);
  }, [items]);
  const input = activeThread?.draft ?? '';
  const hasBlockingModalOpen =
    isTransactionsModalOpen ||
    isBudgetModalOpen ||
    isQuestionnaireModalOpen ||
    isAccountModalOpen ||
    isInterviewModalOpen ||
    isSocialConsciousnessModalOpen;
  const blockingModalWasOpenRef = useRef(hasBlockingModalOpen);
  const interviewCompleted = Boolean(sessionInfo?.latestDiagnosticCompletedAt);
  const chat1Thread = useMemo(
    () => chatThreads.find((thread) => thread.id === PRIMARY_CHAT_ID),
    [chatThreads],
  );
  const chat1GeneralDeepened = Boolean(chat1Thread?.generalChatStarted) || chat1IntroMode === 'deepen';
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
  const closedChatIds = productLifecycle?.closedChats ?? [];
  const lifecycleLoaded = productLifecycle !== null;
  const activeTurnCount = resolveChatTurnCount({
    chatId: activeChatId,
    chatTurns: productLifecycle?.chatTurns,
    lifecycleLoaded,
    fallbackUserMessageCount: activeThread?.userMessageCount,
  });
  const activeMaxTurns = getMaxChatInteractions(activeChatId);
  const activeTurnsRemaining = Math.max(0, activeMaxTurns - activeTurnCount);
  const activeClosingMode =
    productLifecycle?.closingMode ??
    activeTurnCount >= getClosingInteractionThreshold(activeChatId);
  const lastUserMessageInThread = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.type === 'message' && item.role === 'user') {
        return String(item.content ?? '');
      }
    }
    return '';
  }, [items]);
  const isActiveChatClosed =
    closedChatIds.includes(activeChatId) || activeTurnsRemaining === 0;
  const isActiveChatCloseoutWindow = activeTurnsRemaining > 0 && activeTurnsRemaining <= 2;
  const activeThreadClosureSummary =
    activeThread?.closureSummary ??
    (isActiveChatClosed
      ? buildChatClosureSummary({
          chatId: activeChatId as 'chat-1' | 'chat-2' | 'chat-3',
          userMessage:
            [...items]
              .reverse()
              .find((item): item is Extract<ChatItem, { type: 'message'; role: 'user' }> =>
                item.type === 'message' && item.role === 'user',
              )?.content,
          assistantMessage:
            [...items]
              .reverse()
              .find((item): item is Extract<ChatItem, { type: 'message'; role: 'assistant' }> =>
                item.type === 'message' && item.role === 'assistant',
              )?.content,
          turnsRemaining: activeTurnsRemaining,
        })
      : null);
  const [showFullClosedChat, setShowFullClosedChat] = useState(false);
  const [socialReflectionRevision, setSocialReflectionRevision] = useState(0);

  useEffect(() => {
    if (!sessionInfo?.id) return;
    const before = readSocialReflectionSession(sessionInfo.id);
    hydrateSocialReflectionSessionFromServer(
      sessionInfo.id,
      sessionInfo.socialConsciousnessReflections ?? null,
    );
    const after = readSocialReflectionSession(sessionInfo.id);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      setSocialReflectionRevision((value) => value + 1);
    }
  }, [sessionInfo?.id, sessionInfo?.socialConsciousnessReflections]);

  const socialReflectionSession = useMemo(
    () => readSocialReflectionSession(sessionInfo?.id),
    [sessionInfo?.id, socialReflectionRevision],
  );

  const activeActionPlanStage = useMemo(() => {
    if (activeChatId !== 'chat-2') return null;
    return resolveActiveActionPlanStage({
      chatId: activeChatId,
      turnCount: activeTurnCount,
      closingMode: activeClosingMode,
      userMessage: lastUserMessageInThread,
    });
  }, [
    activeChatId,
    activeTurnCount,
    activeClosingMode,
    lastUserMessageInThread,
  ]);
  const activeSocialConsciousnessStage = useMemo(() => {
    if (activeChatId !== 'chat-3') return null;
    return (
      productLifecycle?.socialConsciousnessFunnelStage ??
      resolveActiveSocialConsciousnessStage({
        chatId: activeChatId,
        turnCount: activeTurnCount,
        closingMode: activeClosingMode,
        userMessage: lastUserMessageInThread,
      })
    );
  }, [
    activeChatId,
    activeTurnCount,
    activeClosingMode,
    lastUserMessageInThread,
    productLifecycle?.socialConsciousnessFunnelStage,
  ]);
  const isActiveChatLocked = isChatOnboardingLocked({
    chatId: activeChatId,
    unlockedChatIds,
  });
  const resolveThreadAccessState = useCallback(
    (chatId: string) =>
      resolveChatThreadAccessState({
        chatId,
        unlockedChatIds,
        closedChatIds,
        chatTurns: productLifecycle?.chatTurns,
        lifecycleLoaded,
      }),
    [unlockedChatIds, closedChatIds, productLifecycle?.chatTurns, lifecycleLoaded],
  );

  useEffect(() => {
    if (!lifecycleLoaded || closedChatIds.length === 0) return;
    setChatThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
        if (!closedChatIds.includes(thread.id)) return thread;
        if (thread.status === 'context') return thread;
        changed = true;
        return {
          ...thread,
          status: 'context' as const,
          completedAt: thread.completedAt ?? new Date().toISOString(),
        };
      });
      return changed ? next : prev;
    });
  }, [closedChatIds, lifecycleLoaded]);

  useEffect(() => {
    setShowFullClosedChat(false);
  }, [activeChatId, isActiveChatClosed]);

  function clearComposerFocusTimer() {
    if (composerFocusTimerRef.current) {
      clearTimeout(composerFocusTimerRef.current);
      composerFocusTimerRef.current = null;
    }
  }

  function collapseMobilePanelForComposer() {
    if (!isMobileViewport) return;
    if (!mobilePanelExpanded) return;
    setMobilePanelExpanded(false);
    const layout = panelScrollRef.current?.closest('.agent-layout') as HTMLElement | null;
    layout?.classList.remove('mobile-panel-expanded');
  }

  function openComposerFromGesture() {
    if (isActiveChatLocked || isActiveChatClosed || !isMobileViewport) return;
    collapseMobilePanelForComposer();
    focusMobileInput(chatComposerRef.current);
  }

  function focusComposerAfterLayout(_options?: { collapsePanelFirst?: boolean }) {
    if (isActiveChatLocked || isActiveChatClosed) return;
    clearComposerFocusTimer();
    if (isMobileViewport) {
      openComposerFromGesture();
      return;
    }
    chatComposerRef.current?.focus({ preventScroll: true });
  }

  useEffect(
    () => () => {
      clearComposerFocusTimer();
    },
    []
  );

  // Haptic feedback — usa Vibration API si esta disponible (Android/algunos iOS PWA)
  const haptic = useCallback((pattern: number | number[] = 10) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Drag continuo en panel mobile: arrastra el handle para ajustar altura
  useEffect(() => {
    const handle = mobilePanelHandleRef.current;
    const panel = panelScrollRef.current;
    if (!handle || !panel || !isMobileViewport) return;

    const layout = panel.closest('.agent-layout') as HTMLElement | null;
    const viewportH = () => window.visualViewport?.height ?? window.innerHeight;
    const snapClosed = () => Math.round(Math.min(162, viewportH() * 0.19));
    const snapOpen = () => Math.round(viewportH() * 0.46);

    // Velocity ring buffer for momentum-aware snap
    let velSamples: Array<{ y: number; t: number }> = [];
    let snapAnimRaf = 0;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Cancel any in-progress snap animation
      if (snapAnimRaf) {
        cancelAnimationFrame(snapAnimRaf);
        snapAnimRaf = 0;
        panel.style.removeProperty('transition');
        panel.style.removeProperty('transform');
      }
      const currentH = panel.getBoundingClientRect().height;
      panelDragRef.current = { startY: touch.clientY, startH: currentH, moved: false };
      velSamples = [];
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

      // Track velocity (last 80ms window)
      const now = performance.now();
      velSamples.push({ y: touch.clientY, t: now });
      velSamples = velSamples.filter((s) => now - s.t < 80);

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
      const beforeH = panel.getBoundingClientRect().height;
      const dragged = panelDragRef.current.moved;

      // Determine snap direction — velocity can override the midpoint threshold
      let velY = 0;
      if (velSamples.length >= 2) {
        const oldest = velSamples[0];
        const newest = velSamples[velSamples.length - 1];
        const dt = Math.max(1, newest.t - oldest.t);
        velY = (newest.y - oldest.y) / dt; // px/ms — positive = finger moving down
      }
      velSamples = [];

      let snapToOpen: boolean;
      if (dragged) {
        const mid = (closed + open) / 2;
        if (Math.abs(velY) > 0.5) {
          // Velocity dominant: flick up (negative velY) → open, flick down → close
          snapToOpen = velY < -0.5;
        } else {
          snapToOpen = beforeH > mid;
        }
      } else {
        snapToOpen = !mobilePanelExpanded;
      }

      if (!dragged) haptic(10);

      // Clear drag inline styles
      panel.style.flexBasis = '';
      panel.style.maxHeight = '';
      panel.style.removeProperty('--mobile-panel-h');
      panel.classList.remove('is-dragging');
      layout?.classList.remove('is-panel-dragging');

      // Apply new expanded/collapsed state
      setMobilePanelExpanded(snapToOpen);
      layout?.classList.toggle('mobile-panel-expanded', snapToOpen);
      panelDragRef.current = null;

      // FLIP animation: compute delta between current visual and new layout position,
      // apply inverse transform, then spring-animate to zero. No layout reflow during animation.
      // We use setProperty('...', '...', 'important') to win over the CSS's transition: none !important
      snapAnimRaf = requestAnimationFrame(() => {
        const afterH = panel.getBoundingClientRect().height;
        const delta = beforeH - afterH; // positive = was taller (shrinks); negative = was shorter (grows)
        if (Math.abs(delta) < 3) { snapAnimRaf = 0; return; }

        // Hold visual at the drag-released position via transform
        panel.style.setProperty('transition', 'none', 'important');
        panel.style.setProperty('transform', `translateY(${delta}px)`, 'important');

        snapAnimRaf = requestAnimationFrame(() => {
          // Spring-like cubic-bezier — bouncy on expand, snappy on collapse
          const ease = snapToOpen
            ? 'cubic-bezier(0.34, 1.42, 0.64, 1)'
            : 'cubic-bezier(0.32, 0, 0.67, 0)';
          const duration = snapToOpen ? 440 : 300;
          panel.style.setProperty('transition', `transform ${duration}ms ${ease}`, 'important');
          panel.style.removeProperty('transform');

          const cleanup = () => {
            panel.style.removeProperty('transition');
            panel.style.removeProperty('transform');
            snapAnimRaf = 0;
          };
          panel.addEventListener('transitionend', cleanup, { once: true });
          // Fallback in case transitionend doesn't fire
          snapAnimRaf = window.setTimeout(cleanup, duration + 60) as unknown as number;
        });
      });
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
      if (snapAnimRaf) cancelAnimationFrame(snapAnimRaf);
      panel.style.removeProperty('transition');
      panel.style.removeProperty('transform');
      panel.classList.remove('is-dragging');
      layout?.classList.remove('is-panel-dragging');
    };
  }, [isMobileViewport, mobilePanelExpanded, haptic]);

  useLayoutEffect(() => {
    if (!isMobileViewport) return;
    clearComposerTypingVisual();
    setMobilePanelExpanded(false);
    const layout = panelScrollRef.current?.closest('.agent-layout') as HTMLElement | null;
    layout?.classList.remove('mobile-panel-expanded');
  }, [isMobileViewport]);

  useEffect(() => {
    if (isMobileViewport || !mobilePanelExpanded) return;
    setMobilePanelExpanded(false);
  }, [isMobileViewport, mobilePanelExpanded]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const panel = panelScrollRef.current;
    const grid = panelGridRef.current;
    if (!panel) return;

    panel.style.flexBasis = '';
    panel.style.maxHeight = '';
    panel.style.removeProperty('--mobile-panel-h');
    panel.classList.remove('is-dragging');
    panel.closest('.agent-layout')?.classList.remove('is-panel-dragging');

    if (mobilePanelExpanded) {
      const resetExpandedPanelScroll = () => {
        panel.scrollTop = 0;
        if (!grid) return;
        grid.scrollTop = 0;
        grid.scrollLeft = 0;
        const profileCard = grid.querySelector('.panel-pos-profile') as HTMLElement | null;
        if (!profileCard) return;

        const scrollToProfile = (scrollEl: HTMLElement) => {
          const containerRect = scrollEl.getBoundingClientRect();
          const profileRect = profileCard.getBoundingClientRect();
          scrollEl.scrollTop += profileRect.top - containerRect.top - 8;
        };

        if (grid.scrollHeight > grid.clientHeight) {
          scrollToProfile(grid);
          return;
        }
        if (panel.scrollHeight > panel.clientHeight) {
          scrollToProfile(panel);
        }
      };
      requestAnimationFrame(() => {
        resetExpandedPanelScroll();
        requestAnimationFrame(resetExpandedPanelScroll);
      });
    }
  }, [mobilePanelExpanded, isMobileViewport]);

  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);

  // Load sheets from API on mount
  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    loadSheets().then((data) => {
      if (data?.sheets && Array.isArray(data.sheets) && data.sheets.length > 0) {
        // Migrate saved sheets to current type
        const sheets = data.sheets as Array<Record<string, unknown>>;
        const restored: ChatThread[] = sheets.map((s) => ({
          id: String(s.id ?? `chat-${Date.now()}`),
          label: String(s.label ?? '1'),
          name: String(s.name ?? 'Conversación'),
          autoNamed: Boolean(s.autoNamed ?? false),
          items: Array.isArray(s.items)
            ? (() => {
                const sanitized = normalizeChat1WelcomeShellItems(
                  sanitizeChatThreadMessages(
                    (s.items as any[]).filter((it) => it.type !== 'message' || it.content !== undefined),
                  ).filter((it) => {
                    if (it.type !== 'message' || it.role !== 'assistant') return true;
                    return !isStaleSessionErrorMessage(String(it.content ?? ''));
                  }),
                );
                const threadId = String(s.id);
                const repaired =
                  threadId === 'chat-1'
                    ? repairChat1WelcomeItems(sanitized)
                    : repairChatIntroItems(threadId, sanitized);
                return ensureLeadingIntroShell(threadId, repaired);
              })()
            : [],
          draft: String(s.draft ?? ''),
          status: (String(s.status ?? 'active') as ChatThread['status']),
          userMessageCount: Number(s.userMessageCount ?? 0),
          createdAt: String(s.createdAt ?? new Date().toISOString()),
          completedAt: s.completedAt == null ? undefined : String(s.completedAt),
          closureSummary:
            s.closureSummary &&
            typeof s.closureSummary === 'object' &&
            'kicker' in s.closureSummary &&
            'title' in s.closureSummary &&
            'subtitle' in s.closureSummary &&
            'sections' in s.closureSummary
              ? (s.closureSummary as ChatClosureSummary)
              : null,
          generalChatStarted: Boolean(s.generalChatStarted ?? false),
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
            status:
              existing?.closureSummary || existing?.status === 'context'
                ? ('context' as const)
                : ('active' as const),
          };
        });
        normalized.forEach((thread) => {
          if (
            !shouldSeedWelcomeMessage(thread.id, thread.items) &&
            !shouldSeedChatIntroMessage(thread.id, thread.items)
          ) {
            welcomeInjectedThreadsRef.current.add(thread.id);
          }
        });
        setChatThreads(normalized);
        setActiveChatId(PRIMARY_CHAT_ID);
      }
      setSheetsLoaded(true);
    }).catch(() => setSheetsLoaded(true));
  }, [authBootstrapped, isAuthenticated]);

  // Seed welcome openings for every thread that still has no assistant message.
  useEffect(() => {
    if (!sheetsLoaded) return;

    setChatThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
        if (welcomeInjectedThreadsRef.current.has(thread.id)) return thread;
        if (
          !shouldSeedWelcomeMessage(thread.id, thread.items) &&
          !shouldSeedChatIntroMessage(thread.id, thread.items)
        ) {
          welcomeInjectedThreadsRef.current.add(thread.id);
          return thread;
        }

        const firstAssistantIdx = thread.items.findIndex(
          (it) => it.type === 'message' && it.role === 'assistant',
        );
        const firstAssistant =
          firstAssistantIdx >= 0
            ? (thread.items[firstAssistantIdx] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>)
            : null;
        const alreadyPersonalizedWelcome =
          firstAssistantIdx === 0 &&
          firstAssistant &&
          thread.id === 'chat-1' &&
          isWelcomeShellMessageContent(firstAssistant.content);

        if (alreadyPersonalizedWelcome) {
          welcomeInjectedThreadsRef.current.add(thread.id);
          return thread;
        }

        welcomeInjectedThreadsRef.current.add(thread.id);
        changed = true;

        if (thread.id !== 'chat-1') {
          return {
            ...thread,
            items: repairChatIntroItems(thread.id, thread.items),
          };
        }

        return {
          ...thread,
          items: repairChat1WelcomeItems(thread.items),
        };
      });
      return changed ? next : prev;
    });
  }, [buildChat1WelcomeItem, sessionInfo, sheetsLoaded]);

  const setDraftForActive = useCallback((nextDraft: string) => {
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeChatId
          ? { ...thread, draft: nextDraft }
          : thread
      )
    );
  }, [activeChatId]);

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

  function clearLocalAgentState() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('agent_session_id');
    localStorage.removeItem('agent.panel.stage.v3');
    localStorage.removeItem('agent.panel.collapsed.v1');
    clearStoredVisualMode();
    localStorage.removeItem('agent.prefill_prompt');
    clearInterviewVoiceState();
    clearPersistedInterviewState();
    clearCsrfToken();
    secureStorage.clear();
  }

  function clearAllLocalAgentState() {
    clearLocalAgentState();
    clearPanelStateBackups();
  }

  const buildPanelSnapshot = useCallback(() => {
    return buildPanelSnapshotPayload({
      budgetRows,
      budgetChatAnswers,
      bankSimulation,
      txProductsCreatedTotal,
      savedReports,
    });
  }, [bankSimulation, budgetChatAnswers, budgetRows, savedReports, txProductsCreatedTotal]);

  const {
    scheduleSheetsSave,
    schedulePanelSave,
    persistSheetsNow,
    persistPanelNow,
    flushNow,
  } = useAgentPersistence({
    sheetsEnabled: isAuthenticated && sheetsLoaded,
    panelEnabled: isAuthenticated && panelStateLoaded,
    flushEnabled: isAuthenticated,
    panelStateBackupKey,
    getChatThreads: () => chatThreadsRef.current,
    getPanelSnapshot: buildPanelSnapshot,
    getSocialReflections: () =>
      readSocialReflectionSession(sessionInfo?.userId ?? sessionInfo?.email ?? null),
  });

  useEffect(() => {
    if (!sheetsLoaded) return;
    scheduleSheetsSave();
  }, [chatThreads, scheduleSheetsSave, sheetsLoaded]);

  async function persistPanelSnapshotNow() {
    await persistPanelNow();
  }

  async function persistAgentStateNow() {
    await flushNow();
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
      await persistAgentStateNow();
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

    // 10% entrevista y resultado final (flujo externo)
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
      isTransactionsEvidenceSatisfied(bankSimulation.products, bankSimulation.productsModuleSkipped) ||
      (bankSimulation.products.length > 0 && aggregateDocs.length > 0);
    const budgetUnlocked = hasTransactionsData;
    // Productos y transacciones debe estar disponible desde el inicio.
    const transactionsUnlocked = true;

    return { budgetUnlocked, transactionsUnlocked };
  }, [bankSimulation.products, bankSimulation.productsModuleSkipped]);

  const canOpenInterview = useMemo(
    () =>
      computeCanOpenInterview({
        products: bankSimulation.products,
        productsModuleSkipped: bankSimulation.productsModuleSkipped,
        budgetRows,
        interviewCompleted,
      }),
    [bankSimulation.products, bankSimulation.productsModuleSkipped, budgetRows, interviewCompleted],
  );

  function getFlowStatus() {
    const productsCompleted = isProductsStepSatisfied(
      bankSimulation.products,
      bankSimulation.productsModuleSkipped,
    );
    const transactionsCompleted =
      productsCompleted &&
      isTransactionsEvidenceSatisfied(bankSimulation.products, bankSimulation.productsModuleSkipped);
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

  const onboardingFlowStatus = useMemo(() => getFlowStatus(), [
    bankSimulation.products,
    bankSimulation.productsModuleSkipped,
    budgetRows,
    interviewCompleted,
  ]);

  function normalizePanelActionForCurrentFlow(
    action?: AgentResponse['panel_action']
  ): AgentResponse['panel_action'] | undefined {
    if (!action) return undefined;
    const normalizedSection =
      action.section === 'products_transactions' ? 'transactions' : action.section;
    const flow = getFlowStatus();
    if (normalizedSection === 'budget' && !flow.budgetUnlocked) {
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
    if (activeChatId === 'chat-1' && !flow.diagnosisCompleted && normalizedSection === 'profile') {
      return undefined;
    }
    return { ...action, section: normalizedSection };
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
      badge: canOpenInterview ? 'Llamada guiada' : 'En espera',
      title: intakeData ? `Entrevista estratégica para ${name}` : 'Entrevista estratégica',
      meta: prompt,
      detail:
        stress !== null && understanding !== null
          ? `Prioridad actual: estrés ${stress}/10 y comprensión ${understanding}/10.`
          : canOpenInterview
            ? 'Contexto integrado de presupuesto y productos. Inicia la llamada para cerrar el diagnóstico.'
            : 'Completa productos, transacciones y presupuesto para desbloquear la entrevista.',
    };
  }, [intakeData, sessionInfo?.name, interviewCompleted, canOpenInterview]);

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
    const formatQuestionnaireValue = (value: unknown, fieldKey?: string) =>
      localizeDisplayValue(value, fieldKey);
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
      { label: 'Profesión', value: formatQuestionnaireValue(intakeData.profession ?? 'No declarado', 'profession') },
      { label: 'Situación laboral', value: formatQuestionnaireValue(intakeData.employmentStatus ?? 'No declarado', 'employmentStatus') },
      { label: 'Ingreso mensual', value: formatQuestionnaireValue(intakeData.incomeBand ?? 'No declarado', 'incomeBand') },
      { label: 'Cobertura de gastos', value: formatQuestionnaireValue(intakeData.expensesCoverage ?? 'No declarado', 'expensesCoverage') },
      { label: 'Control de gastos', value: formatQuestionnaireValue(intakeData.tracksExpenses ?? 'No declarado', 'tracksExpenses') },
      { label: 'Deuda activa', value: hasDebt ? 'Sí' : 'No' },
      { label: 'Ahorro / inversión', value: hasSavings ? 'Sí' : 'No' },
      { label: 'Reacción al riesgo', value: formatQuestionnaireValue(intakeData.riskReaction ?? 'No declarado', 'riskReaction') },
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
      return 'Aún no hay documentos guardados. Usa Guardar PDF en una burbuja del chat para archivar análisis aquí.';
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
    if (
      !bankSimulation.productsModuleSkipped &&
      aggregateParsedDocuments(bankSimulation.products).length === 0 &&
      aggregateUploadedFiles(bankSimulation.products).length === 0
    ) {
      return 'Tip: agrega un producto y sube respaldos, o continúa sin productos si prefieres avanzar ya.';
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

  const applyFincoinClosureSummaries = useCallback(
    (summaries?: Record<string, unknown> | null) => {
      if (!summaries || typeof summaries !== 'object') return;
      setChatThreads((prev) =>
        prev.map((thread) => {
          const candidate = summaries[thread.id];
          if (!candidate || typeof candidate !== 'object') return thread;
          if (!('title' in candidate) || !('sections' in candidate)) return thread;
          return {
            ...thread,
            closureSummary: candidate as ChatClosureSummary,
            status: 'context' as const,
          };
        }),
      );
    },
    [],
  );

  const buildCoreAgentRequestContext = useCallback((): CoreAgentRequestContext => ({
    items,
    activeChatId,
    activeThread: activeThread
      ? { id: activeThread.id, label: activeThread.label, name: activeThread.name }
      : undefined,
    panelStage,
    isPanelCollapsed,
    products: bankSimulation.products,
    activeProductId: bankSimulation.activeProductId,
    taxonomyOverrides: bankSimulation.taxonomyOverrides,
    budgetRows,
    budgetTotals,
    unlockedPanelBlocks,
    canOpenInterview,
    interviewCompleted,
    knowledgeScore,
    engagementScore,
    completedMilestones,
    milestones,
    savedReportsCount: savedReports.length,
    hasProfile: Boolean(sessionInfo?.injectedProfile || profile),
    hasIntake: Boolean(sessionInfo?.injectedIntake),
    flowStatus: getFlowStatus(),
    productTurnCount: activeTurnCount,
    productTurnsRemaining: activeTurnsRemaining,
    productClosingMode: activeClosingMode,
    socialReflectionSession,
  }), [
    items,
    activeChatId,
    activeThread,
    panelStage,
    isPanelCollapsed,
    bankSimulation.products,
    bankSimulation.activeProductId,
    bankSimulation.taxonomyOverrides,
    budgetRows,
    budgetTotals,
    unlockedPanelBlocks,
    canOpenInterview,
    interviewCompleted,
    knowledgeScore,
    engagementScore,
    completedMilestones,
    milestones,
    savedReports.length,
    sessionInfo?.injectedProfile,
    sessionInfo?.injectedIntake,
    profile,
    socialReflectionSession,
    activeTurnCount,
    activeTurnsRemaining,
    activeClosingMode,
  ]);

  const applyCoreAgentSideEffects = useCallback((
    effects: CoreAgentResponseSideEffects,
    res: AgentResponse,
  ) => {
    if (effects.agentMeta?.objective) {
      agentMetaRef.current.objective = effects.agentMeta.objective;
    }
    if (effects.agentMeta?.mode) {
      agentMetaRef.current.mode = effects.agentMeta.mode;
    }
    if (typeof effects.knowledgeScore === 'number') {
      setPersistentKnowledgeScore(effects.knowledgeScore);
    }
    if (effects.milestoneUnlocked) {
      setLevelUpText(`Hito desbloqueado: ${effects.milestoneUnlocked}`);
    }
    if (effects.productLifecyclePatch) {
      setProductLifecycle((prev) => ({
        ...(prev ?? {}),
        ...effects.productLifecyclePatch,
        chatTurns: {
          ...(prev?.chatTurns ?? {}),
          ...(effects.productLifecyclePatch?.chatTurns ?? {}),
        },
      }));
    }
    if (effects.closureSummary || effects.productLifecyclePatch?.closedChats?.includes(activeChatId)) {
      setChatThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeChatId
            ? {
                ...thread,
                closureSummary: effects.closureSummary ?? thread.closureSummary ?? null,
                status: 'context' as const,
                completedAt: thread.completedAt ?? new Date().toISOString(),
              }
            : thread,
        ),
      );
    }
    if (effects.fincoinUsage) {
      applyUsagePayload(effects.fincoinUsage);
    }
    if (effects.closureSummaries) {
      applyFincoinClosureSummaries(effects.closureSummaries);
    }
    forceRender((x) => x + 1);

    if (effects.panelAction && (effects.panelAction.section || effects.panelAction.message)) {
      handlePanelAction(effects.panelAction);
    }

    if (effects.budgetTablePatch) {
      consumeBudgetTablePatch(effects.budgetTablePatch);
      if (effects.budgetTablePatch.requires_confirmation) {
        setIsBudgetModalOpen(true);
      }
    } else if (effects.budgetUpdates && effects.budgetUpdates.length > 0) {
      consumeBudgetTablePatch(
        buildBudgetTablePatch(budgetRows, legacyBudgetUpdatesToActions(budgetRows, effects.budgetUpdates)),
      );
    }

    window.setTimeout(() => {
      void persistSheetsNow();
      void persistPanelNow();
    }, 0);

    void res;
  }, [
    activeChatId,
    applyFincoinClosureSummaries,
    applyUsagePayload,
    budgetRows,
    consumeBudgetTablePatch,
    handlePanelAction,
    persistPanelNow,
    persistSheetsNow,
  ]);

  const { loading, sendCoreAgentMessage } = useCoreAgentSend({
    setItemsForActive,
    incrementUserMessageCount: () => {
      setChatThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeChatId
            ? { ...thread, userMessageCount: thread.userMessageCount + 1 }
            : thread,
        ),
      );
    },
    clearDraft: () => setDraftForActive(''),
    getActiveThreadId: () => activeChatId,
    buildRequestContext: buildCoreAgentRequestContext,
    getSessionId,
    prepareSend: async () => {
      await syncFinancialContextToIntake().catch(() => {});
    },
    onSideEffects: applyCoreAgentSideEffects,
    onTransientError: (message) => {
      setPanelCallout({ section: 'chat', message });
    },
    normalizePanelAction: normalizePanelActionForCurrentFlow,
  });

  useEffect(() => {
    try {
      const rawStage = localStorage.getItem('agent.panel.stage.v3');
      if (rawStage !== null) {
        const parsed = Number(rawStage);
        if (!Number.isNaN(parsed)) {
          const stage = Math.max(1, Math.min(3, parsed));
          // Stage 3 se persistió como default antes de mostrar el panel en desktop.
          setPanelStage(stage === 3 ? 2 : stage);
          return;
        }
      }
      // Compat con versiones anteriores (colapsado booleano).
      const rawCollapsed = localStorage.getItem('agent.panel.collapsed.v1');
      if (rawCollapsed === '1') setPanelStage(2);
    } catch {}
  }, []);

  useEffect(() => {
    setVisualMode(readStoredVisualMode());
  }, []);

  useEffect(() => {
    const syncInterviewResume = () => {
      try {
        if (interviewCompleted) {
          setInterviewResumePending(false);
          return;
        }

        const saved = readInterviewVoiceState();
        const serverVoice = sessionInfo?.interviewVoice as Record<string, unknown> | null | undefined;
        const voiceSnapshot =
          saved && typeof saved === 'object'
            ? saved
            : serverVoice && typeof serverVoice === 'object'
              ? serverVoice
              : null;

        if (!voiceSnapshot) {
          setInterviewResumePending(false);
          return;
        }

        const status = String(voiceSnapshot.status ?? '');
        if (status === 'completed') {
          setInterviewResumePending(false);
          return;
        }

        const hasSummary =
          Array.isArray(voiceSnapshot.minuteSummaries) && voiceSnapshot.minuteSummaries.length > 0
            ? true
            : String(
                (voiceSnapshot.finalSummary as { summary?: string } | undefined)?.summary ?? '',
              ).trim().length > 0;
        const hasTime = Number(voiceSnapshot.callSeconds ?? voiceSnapshot.totalUsedSec ?? 0) > 0;
        const hasReport =
          Boolean(voiceSnapshot.voiceReport && typeof voiceSnapshot.voiceReport === 'object') ||
          Boolean(voiceSnapshot.lastReport);
        setInterviewResumePending((hasSummary || hasTime) && !hasReport);
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
  }, [interviewCompleted, sessionInfo?.interviewVoice]);

  useEffect(() => {
    try {
      localStorage.setItem('agent.panel.stage.v3', String(panelStage));
      localStorage.setItem(
        'agent.panel.collapsed.v1',
        panelStage === 3 ? '1' : '0'
      );
    } catch {}
  }, [panelStage]);

  // Mantener el hilo anclado: durante streaming seguir el final del mensaje sin bloquear scroll manual.
  useEffect(() => {
    const el = chatThreadRef.current;
    if (!el) return;

    const last = items[items.length - 1];
    const followStreamingTail =
      loading ||
      (last?.type === 'message' &&
        last.role === 'assistant' &&
        Boolean(last.stream?.streaming));
    const turnKey = `${activeChatId}:${items.length}`;
    const userJustSent =
      turnKey !== prevThreadScrollTurnRef.current &&
      last?.type === 'message' &&
      last.role === 'user';
    prevThreadScrollTurnRef.current = turnKey;

    const scrollOptions: ScrollChatThreadOptions = {
      followStreamingTail,
      respectUserScroll: followStreamingTail,
      force: userJustSent,
    };

    requestAnimationFrame(() => {
      scrollChatThreadAfterUpdate(el, scrollOptions);
    });
  }, [threadScrollAnchor, activeChatId, loading, onboardingFlowStatus, items]);

  useEffect(() => {
    if (!isMobileViewport || !interviewCompleted) return;
    const el = chatBodyRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

      const unlockedIds = listNavigableChatIds({
        chatIds: chatThreads.map((thread) => thread.id),
        unlockedChatIds,
      });
      const currentIndex = unlockedIds.indexOf(activeChatId);
      if (currentIndex < 0) return;

      if (deltaX < 0 && currentIndex < unlockedIds.length - 1) {
        setChatSlideDir('left');
        setActiveChatId(unlockedIds[currentIndex + 1]);
        return;
      }
      if (deltaX > 0 && currentIndex > 0) {
        setChatSlideDir('right');
        setActiveChatId(unlockedIds[currentIndex - 1]);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [activeChatId, chatThreads, closedChatIds, interviewCompleted, isMobileViewport, unlockedChatIds]);

  useEffect(() => {
    if (!chatSlideDir) return;
    const timer = window.setTimeout(() => setChatSlideDir(null), 320);
    return () => window.clearTimeout(timer);
  }, [activeChatId, chatSlideDir]);

  useEffect(() => {
    storeVisualMode(visualMode);
  }, [visualMode]);

  useEffect(() => {
    if (isVisualModeTransitionActive()) return;
    applyVisualModeToDocument(visualMode);
  }, [visualMode]);

  useEffect(() => {
    return () => {
      applyVisualModeToDocument('off');
    };
  }, []);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) {
      panelHydrateOwnerRef.current = null;
      return;
    }
    if (panelHydrateOwnerRef.current === panelStateBackupKey) return;
    panelHydrateOwnerRef.current = panelStateBackupKey;

    setPanelStateLoaded(false);
    let alive = true;

    void hydratePanelState({
      panelStateBackupKey,
      budgetRows: [],
      budgetChatAnswers: [],
      savedReports: [],
      txProductsCreatedTotal: 0,
      bankSimulation: DEFAULT_BANK_SIMULATION,
    })
      .then((result) => {
        if (!alive) return;
        if (result?.restored) {
          const { restored } = result;
          if (restored.budgetRows) setBudgetRows(restored.budgetRows);
          if (restored.budgetChatAnswers) setBudgetChatAnswers(restored.budgetChatAnswers);
          if (restored.savedReports) setSavedReports(restored.savedReports as SavedReport[]);
          if (typeof restored.txProductsCreatedTotal === 'number') {
            setTxProductsCreatedTotal(
              Math.max(0, Math.min(MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL, restored.txProductsCreatedTotal))
            );
          }
          if (restored.bankSimulation) setBankSimulation(restored.bankSimulation);
        }
        setPanelStateLoaded(true);
      })
      .catch(() => {
        if (alive) setPanelStateLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, [authBootstrapped, isAuthenticated, panelStateBackupKey]);

  useEffect(() => {
    if (!panelStateLoaded) return;
    schedulePanelSave();
  }, [
    bankSimulation,
    budgetChatAnswers,
    budgetRows,
    buildPanelSnapshot,
    panelStateLoaded,
    savedReports,
    schedulePanelSave,
    txProductsCreatedTotal,
  ]);

  const syncFinancialContextToIntake = useCallback(async () => {
    await mergeProductsContextToIntake({
      productsContext: buildPersistableProductsContext(
        bankSimulation.products,
        bankSimulation.activeProductId,
        bankSimulation.taxonomyOverrides,
      ),
      budgetContext: buildPersistableBudgetContext(),
    });
    try {
      const info = await getSessionInfo();
      setSessionInfo(info);
    } catch {
      // Session refresh is best-effort after context merge.
    }
  }, [
    bankSimulation.activeProductId,
    bankSimulation.products,
    bankSimulation.taxonomyOverrides,
    buildPersistableBudgetContext,
    setSessionInfo,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !panelStateLoaded) return;
    const hasPanelContext =
      bankSimulation.products.length > 0 ||
      budgetRows.some((row) => row.amount > 0 || row.category.trim().length > 0);
    if (!hasPanelContext) return;

    const timer = window.setTimeout(() => {
      void syncFinancialContextToIntake().catch(() => {});
    }, 600);

    return () => window.clearTimeout(timer);
  }, [bankSimulation, budgetRows, isAuthenticated, panelStateLoaded, syncFinancialContextToIntake]);

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
    if (typeof sessionInfo?.knowledgeScore === 'number') {
      setPersistentKnowledgeScore(sessionInfo.knowledgeScore);
    }
  }, [sessionInfo?.knowledgeScore]);

  useEffect(() => {
    setProductLifecycle((sessionInfo?.productLifecycle ?? null) as ProductLifecycle | null);
  }, [sessionInfo?.productLifecycle]);

  useEffect(() => {
    if (sessionInfo?.fincoinUsage) {
      applyUsagePayload(sessionInfo.fincoinUsage as FincoinUsageApiPayload);
    }
  }, [sessionInfo?.fincoinUsage, applyUsagePayload]);

  useEffect(() => {
    if (!fincoinSpendBlocked) return;
    setIsBudgetModalOpen(false);
    setIsTransactionsModalOpen(false);
    setIsInterviewModalOpen(false);
  }, [fincoinSpendBlocked]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProfileIfNeeded().catch(() => {});
  }, [isAuthenticated, loadProfileIfNeeded]);

  // Re-focus composer after a blocking modal closes
  useEffect(() => {
    if (!hasBlockingModalOpen && !isActiveChatLocked && !isActiveChatClosed && !isMobileViewport) {
      setTimeout(() => chatComposerRef.current?.focus(), 80);
    }
  }, [hasBlockingModalOpen, isActiveChatLocked, isActiveChatClosed, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) {
      blockingModalWasOpenRef.current = hasBlockingModalOpen;
      return;
    }
    if (blockingModalWasOpenRef.current && !hasBlockingModalOpen) {
      restoreAgentShellViewport();
    }
    blockingModalWasOpenRef.current = hasBlockingModalOpen;
  }, [hasBlockingModalOpen, isMobileViewport]);

  async function onSend(
    messageOverride?: string,
    options?: {
      agentPayload?: string;
      assistantPendingLabel?: string;
      hideUserMessage?: boolean;
      ignoreLoadingGuard?: boolean;
    }
  ): Promise<boolean> {
    if (!isAuthenticated) {
      router.replace('/login');
      return false;
    }
    const liveComposerText = chatComposerRef.current?.value ?? '';
    const outgoingText = String(messageOverride ?? liveComposerText ?? input ?? '').trim();
    if (!outgoingText || (loading && !options?.ignoreLoadingGuard)) return false;
    if (tryResolveBudgetPendingFromAnswer(outgoingText)) {
      if (!messageOverride) setDraftForActive('');
      return true;
    }
    if (activeChatId === PRIMARY_CHAT_ID && chat1IntroMode === 'deepen') {
      setChat1IntroMode('default');
      setDiagnosisDeepenVoiceFindings(undefined);
    }
    if (isActiveChatLocked) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
          'Este chat todavía está bloqueado. Terminemos primero el flujo base en el Chat 1: productos/transacciones, presupuesto y entrevista breve para construir el diagnóstico final.',
          mode: 'information',
        },
      ]);
      return false;
    }
    if (isActiveChatClosed) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: CHAT_CLOSED_SEND_MESSAGE,
          mode: 'information',
        },
      ]);
      return false;
    }
    if (fincoinSpendBlocked) {
      blockFincoinSpend({ context: 'chat', silent: true });
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'Tus Fincoins se agotaron. El agente quedó en pausa: puedes revisar los resúmenes finales, pero no se procesan nuevas solicitudes con costo.',
          mode: 'information',
        },
      ]);
      return false;
    }
    haptic(8);
    if (isMobileViewport) dismissMobileKeyboard();

    const result = await sendCoreAgentMessage(outgoingText, {
      agentPayload: options?.agentPayload,
      hideUserMessage: options?.hideUserMessage,
      ignoreLoadingGuard: options?.ignoreLoadingGuard,
    });
    return result.ok;
  }

  function patchUploadItem(
    uploadId: string,
    patch: Partial<Extract<ChatItem, { type: 'upload' }>>
  ) {
    setItemsForActive((prev) =>
      prev.map((item) =>
        item.type === 'upload' && item.uploadId === uploadId ? { ...item, ...patch } : item
      )
    );
  }

  async function onUploadFromChat(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (blockFincoinSpend({ context: 'upload' })) return;
    if (isActiveChatLocked || isActiveChatClosed) return;

    let selected = Array.from(files);
    if (selected.length > MAX_CHAT_UPLOAD_FILES) {
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: `Solo puedes adjuntar hasta ${MAX_CHAT_UPLOAD_FILES} archivos por envío. Tomé los primeros ${MAX_CHAT_UPLOAD_FILES}.`,
        },
      ]);
      selected = selected.slice(0, MAX_CHAT_UPLOAD_FILES);
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

    const evidenceSourceHint = resolveUploadEvidenceSourceHint({
      uploadFormat: activeBankProduct?.assistant?.uploadFormat ?? null,
      files: accepted,
    });
    const looseTextEvidence =
      evidenceSourceHint === 'text' ||
      accepted.every((file) => /\.(txt|md|log)$/i.test(file.name));
    const topNameHints = {
      ...(activeBankProduct
        ? {
            institutionHint: activeBankProduct.bank,
            serviceHint: activeBankProduct.label,
            productTypeHint: activeBankProduct.productType,
            productLabelHint: activeBankProduct.label,
          }
        : {}),
      evidenceSourceHint,
      looseTextEvidence,
    };
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadFiles = buildChatUploadFiles(accepted);
    setItemsForActive((prev) => [
      ...prev,
      { type: 'upload', role: 'user', uploadId, status: 'processing', files: uploadFiles },
    ]);

    let encodedFiles: Array<{ name: string; base64: string; mimeType?: string }>;
    try {
      encodedFiles = await Promise.all(
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
    } catch {
      patchUploadItem(uploadId, { status: 'error' });
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: 'No pude leer uno o más archivos en el dispositivo. Vuelve a intentar.',
        },
      ]);
      return;
    }

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
      patchUploadItem(uploadId, { status: 'error' });
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

    patchUploadItem(uploadId, { status: 'ready' });

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
    const agentPayload = buildChatUploadAgentPrompt({
      fileNames: names,
      docsSummary,
      analysisEnvelope,
    });
    const dispatched = await onSend(`Analiza los archivos adjuntos (${names.join(', ')})`, {
      agentPayload,
      hideUserMessage: true,
      ignoreLoadingGuard: true,
      assistantPendingLabel: 'Escaneando y analizando tus archivos…',
    });
    if (!dispatched) {
      patchUploadItem(uploadId, { status: 'error' });
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content:
            'Procesé los archivos, pero el chat estaba ocupado. Envía un mensaje corto para que analice lo adjunto.',
        },
      ]);
    }
  }

  const buildInterviewIntakePayload = useCallback(() => {
    const baseIntake =
      sessionInfo?.injectedIntake?.intake && typeof sessionInfo.injectedIntake.intake === 'object'
        ? (sessionInfo.injectedIntake.intake as Record<string, unknown>)
        : ((intakeData ?? {}) as Record<string, unknown>);

    return {
      ...baseIntake,
      __productsContext: buildPersistableProductsContext(
        bankSimulation.products,
        bankSimulation.activeProductId,
        bankSimulation.taxonomyOverrides,
      ),
      __budgetContext: buildPersistableBudgetContext(),
    };
  }, [bankSimulation.activeProductId, bankSimulation.products, buildPersistableBudgetContext, intakeData, sessionInfo]);

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
    void syncFinancialContextToIntake().catch(() => {});
    void onSend('Configurar presupuesto', {
      agentPayload: message,
      assistantPendingLabel:
        'Configurando presupuesto con Financieramente… construyendo informe ejecutivo premium con gráficos.',
      hideUserMessage: true,
    });
  }

  function continueWithoutProducts() {
    setBankSimulation((prev) => ({ ...prev, productsModuleSkipped: true }));
    setTxCreationNotice(
      'Continuaste sin conectar productos. Puedes usar el agente y el presupuesto; vuelve cuando quieras a subir antecedentes.',
    );
    setIsTransactionsModalOpen(false);
  }

  function openTransactionsPanel() {
    if (blockFincoinSpend({ context: 'modal' })) return;
    if (!unlockedPanelBlocks.transactionsUnlocked) return;
    const activeProduct =
      bankSimulation.products.find((product) => product.id === bankSimulation.activeProductId) ?? null;
    setTxWizardStep(resolveTxWizardStep(activeProduct));
    setTransactionUploadError(null);
    setIsTransactionsModalOpen(true);
  }

  const beginDiagnosisDeepenChat = useCallback((context?: { voiceFindings?: string[] }) => {
    setIsInterviewModalOpen(false);
    setActiveChatId(PRIMARY_CHAT_ID);
    setChat1IntroMode('deepen');
    setDiagnosisDeepenVoiceFindings(context?.voiceFindings?.filter(Boolean));
    welcomeInjectedThreadsRef.current.add(PRIMARY_CHAT_ID);
    void syncFinancialContextToIntake().catch(() => {});
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.id === PRIMARY_CHAT_ID
          ? {
              ...thread,
              name: 'Chat general',
              autoNamed: true,
              generalChatStarted: true,
              draft: '',
              status: 'active',
              completedAt: undefined,
              closureSummary: null,
              userMessageCount: 0,
              items: [buildChatIntroShellItem('chat-1') as ChatItem],
            }
          : thread,
      ),
    );
  }, [syncFinancialContextToIntake]);

  const openInterviewModal = useCallback(async () => {
    if (blockFincoinSpend({ context: 'modal' })) return;
    try {
      await syncFinancialContextToIntake();
    } catch {
      // El modal sigue abriendo con el payload local enriquecido; la llamada no debe bloquearse por un sync tardío.
    }
    if (interviewCompleted) {
      await syncDiagnosisSession({
        onSession: (info) => setSessionInfo(info),
      }).catch(() => {});
    }
    setInterviewIntake(buildInterviewIntakePayload());
    setIsInterviewModalOpen(true);
  }, [blockFincoinSpend, buildInterviewIntakePayload, interviewCompleted, setInterviewIntake, setSessionInfo, syncFinancialContextToIntake]);

  const openBudgetModal = useCallback(() => {
    if (blockFincoinSpend({ context: 'modal' })) return;
    void syncFinancialContextToIntake().catch(() => {});
    setIsBudgetModalOpen(true);
  }, [blockFincoinSpend, syncFinancialContextToIntake]);

  const handleContextConflictAction = useCallback(
    (action: ContextConflictUiAction) => {
      if (!action) return;
      if (action === 'budget') {
        openBudgetModal();
        return;
      }
      if (action === 'transactions') {
        openTransactionsPanel();
        return;
      }
      if (action === 'questionnaire') {
        setQuestionnaireModalMode('edit');
        setIsQuestionnaireModalOpen(true);
        return;
      }
      if (action === 'interview') {
        void openInterviewModal();
      }
    },
    [openBudgetModal, openInterviewModal, openTransactionsPanel],
  );

  function openDiagnosisView() {
    void openInterviewModal();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (interviewAutoOpenHandledRef.current) return;
    if (searchParams?.get('openInterview') !== '1') return;
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
      openBudgetModal();
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
        return;
      }
      openInterviewModal();
    }
  }

  function addTransactionProduct(seed?: Partial<BankProduct>) {
    if (txProductsCreatedTotal >= MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL) {
      const limitMessage = `Ya creaste ${MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL} productos en total.`;
      setTransactionUploadError(limitMessage);
      setTxCreationNotice(limitMessage);
      return;
    }
    if (bankSimulation.products.length >= MAX_TRANSACTION_PRODUCTS) {
      const limitMessage = `Solo puedes crear ${MAX_TRANSACTION_PRODUCTS} productos por usuario.`;
      setTransactionUploadError(limitMessage);
      setTxCreationNotice(limitMessage);
      return;
    }
    setTxCreationNotice(null);
    const id = `prod-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
    const seededLabel = String(seed?.label ?? '').trim();
    const seededBank = String(seed?.bank ?? '').trim();
    const product: BankProduct = {
      id,
      label: seededLabel || `Producto ${bankSimulation.products.length + 1}`,
      bank: seededBank,
      assistant: {
        messages: [],
        uploadFormat: null,
        summaryText: null,
        summaryModel: null,
        summaryGeneratedAt: null,
        summaryRegenerationsUsed: 0,
        lastSummaryFeedback: null,
      },
      productType: seed?.productType ?? 'checking_account',
      simulationAccepted: Boolean(seed?.simulationAccepted),
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
    if (!activeBankProduct) return false;
    if (!activeBankProduct.connected) {
      setTransactionUploadError('Autoriza y conecta el producto antes de guardarlo.');
      return false;
    }
    const alreadySaved = savedProductsForBatch.includes(activeBankProduct.id);
    const productSnapshot = activeBankProduct;
    setSavedProductsForBatch((prev) =>
      prev.includes(productSnapshot.id) ? prev : [...prev, productSnapshot.id],
    );
    setTransactionUploadError(null);

    if (!alreadySaved) {
      const chartBlocks = buildTransactionProductSavedAgentBlocks(
        productSnapshot,
        bankSimulation.taxonomyOverrides,
      );
      setItemsForActive((prev) => [
        ...prev,
        {
          type: 'message',
          role: 'assistant',
          content: buildTransactionProductSavedAgentMessage(
            productSnapshot,
            bankSimulation.taxonomyOverrides,
          ),
          mode: 'information',
          agent_blocks: chartBlocks.length > 0 ? chartBlocks : undefined,
          panel_action: {
            section: 'products_transactions',
            message: buildTransactionProductSavedPanelMessage(productSnapshot),
          },
        },
      ]);
      void syncFinancialContextToIntake().catch(() => {});
      handlePanelAction({
        section: 'products_transactions',
        message: buildTransactionProductSavedPanelMessage(productSnapshot),
      });
      setIsTransactionsModalOpen(false);
    }

    return true;
  }

  function resetTransactionProductEvidence(): boolean {
    if (!activeBankProduct) return false;
    if ((activeBankProduct.parsedDocuments?.length ?? 0) === 0) return false;

    const resetsUsed = activeBankProduct.evidenceResetsUsed ?? 0;
    if (resetsUsed >= MAX_TRANSACTION_EVIDENCE_RESETS) {
      setTransactionUploadError(
        `Alcanzaste el límite de ${MAX_TRANSACTION_EVIDENCE_RESETS} reinicios de evidencia para este producto.`,
      );
      return false;
    }

    const productId = activeBankProduct.id;
    updateProductById(productId, buildEvidenceResetPatch(resetsUsed + 1));
    setSavedProductsForBatch((prev) => prev.filter((id) => id !== productId));
    setTxWizardStep('upload');
    setTransactionUploadError(null);
    setDocumentsParseProgress({ stage: 'idle', percent: 0, detail: '' });
    setDocumentsLoading(false);
    return true;
  }

  function selectTransactionProduct(productId: string) {
    const selectedProduct = bankSimulation.products.find((p) => p.id === productId) ?? null;
    if (!selectedProduct) return;
    const nextTxWizardStep = resolveTxWizardStep(selectedProduct);
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
    setTxWizardStep(nextTxWizardStep);
    setTransactionUploadError(null);
  }

  function updateActiveProduct(updates: Partial<BankProduct>) {
    setBankSimulation((prev) => {
      if (!prev.activeProductId) return prev;
      const products = prev.products.map((p) =>
        p.id === prev.activeProductId ? mergeBankProductPatch(p, updates) : p
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

  function updateProductById(productId: string, updates: Partial<BankProduct>) {
    setBankSimulation((prev) => {
      if (!prev.products.some((p) => p.id === productId)) return prev;
      const products = prev.products.map((p) => (p.id === productId ? mergeBankProductPatch(p, updates) : p));
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
    let nextTxWizardStep = txWizardStep;
    setBankSimulation((prev) => {
      const products = prev.products.filter((p) => p.id !== productId);
      const nextActiveId =
        prev.activeProductId === productId ? products[0]?.id ?? null : prev.activeProductId;
      const snapshot = getSimulationSnapshot(products, nextActiveId);
      const nextActive = nextActiveId ? products.find((p) => p.id === nextActiveId) ?? null : null;
      nextTxWizardStep = resolveTxWizardStep(nextActive);
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
    setTxWizardStep(nextTxWizardStep);
    setTransactionUploadError(null);
  }

  function simulateBankLogin(nextConfig?: {
    bank?: string;
    label?: string;
    productType?: BankProduct['productType'];
    simulationAccepted?: boolean;
  }): boolean {
    if (!activeBankProduct) return false;
    const authorizationState = deriveTransactionAuthorizationState(activeBankProduct, {
      bank: nextConfig?.bank,
      label: nextConfig?.label,
      simulationAccepted: nextConfig?.simulationAccepted,
    });
    if (!authorizationState.canContinue) {
      setTransactionUploadError(buildTransactionAuthorizationBlockMessage(authorizationState));
      return false;
    }
    const nextBank = authorizationState.bank;
    const nextLabel = authorizationState.label;
    const nextProductType = nextConfig?.productType ?? activeBankProduct.productType;
    updateActiveProduct({
      bank: nextBank,
      label: nextLabel || activeBankProduct.label,
      productType: nextProductType,
      connected: nextBank.length > 0,
      simulationAccepted: authorizationState.simulationAccepted,
      randomMode: false,
    });
    setTxCreationNotice(
      `Producto configurado: ${(nextLabel || activeBankProduct.label).trim()} · ${(nextBank || 'institución por definir').trim()}. Sube una cartola o respaldo para continuar.`,
    );
    setTransactionUploadError(null);
    setTxWizardStep('upload');
    return true;
  }

  async function onUploadStatement(
    files: File[] | FileList | null
  ): Promise<UploadStatementResult | null> {
    if (!isAuthenticated) {
      router.replace('/login');
      return null;
    }
    if (blockFincoinSpend({ context: 'upload' })) return null;
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
    const videoFiles = fileArray.filter(
      (file) => file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name),
    );
    if (videoFiles.length > 0) {
      setTransactionUploadError(
        'El formato video ya no está disponible. Usa capturas, PDF, Excel o texto.',
      );
      return null;
    }
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
    if (totalBytes > TX_MAX_TOTAL_FILE_BYTES) {
      setTransactionUploadError(
        `El total adjunto supera ${Math.round(TX_MAX_TOTAL_FILE_BYTES / (1024 * 1024))} MB. Divide la carga en bloques más pequeños.`,
      );
      return null;
    }
    const availableSlots = getEvidenceUploadCapacity(MAX_EVIDENCE_FILES_PER_PRODUCT, activeBankProduct.uploadedFiles.length);
    if (availableSlots <= 0) {
      setTransactionUploadError(`Este producto ya alcanzó el límite de ${MAX_EVIDENCE_FILES_PER_PRODUCT} archivos.`);
      return null;
    }
    const cappedFiles = selectedFiles.slice(0, availableSlots);
    if (cappedFiles.length < selectedFiles.length) {
      setTxCreationNotice(`Se cargaron ${cappedFiles.length} archivos. Límite por producto: ${MAX_EVIDENCE_FILES_PER_PRODUCT}.`);
    }

    const uploadAlignment = alignEvidenceUploadFormat({
      uploadFormat: normalizeUploadFormat(activeBankProduct.assistant?.uploadFormat ?? null),
      files: cappedFiles,
    });
    if (!uploadAlignment.ok) {
      setTransactionUploadError(uploadAlignment.error);
      return null;
    }
    if (
      uploadAlignment.realigned ||
      !normalizeUploadFormat(activeBankProduct.assistant?.uploadFormat ?? null)
    ) {
      updateProductById(targetProductId, {
        assistant: {
          ...normalizeProductAssistantState(activeBankProduct.assistant),
          uploadFormat: uploadAlignment.effectiveFormat,
        },
      });
    }
    if (uploadAlignment.notice) {
      setTxCreationNotice(uploadAlignment.notice);
    }

    const names = cappedFiles.map((f) => f.name);
    setTransactionUploadError(null);
    setDocumentsLoading(true);
    setDocumentsParseProgress({
      stage: 'reading',
      percent: 8,
      detail: 'Leyendo archivos en tu dispositivo.',
    });

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

      setDocumentsParseProgress({
        stage: 'uploading',
        percent: 22,
        detail: 'Enviando respaldos al analizador.',
      });

      const evidenceSourceHint = resolveUploadEvidenceSourceHint({
        uploadFormat: activeBankProduct.assistant?.uploadFormat ?? null,
        files: cappedFiles,
      });
      const looseTextEvidence =
        evidenceSourceHint === 'text' ||
        cappedFiles.every((file) => /\.(txt|md|log)$/i.test(file.name));

      const callParseDocuments = async () =>
        parseDocuments(encodedFiles, {
          institutionHint: activeBankProduct.bank,
          serviceHint: activeBankProduct.label,
          productTypeHint: activeBankProduct.productType,
          productLabelHint: activeBankProduct.label,
          evidenceSourceHint,
          looseTextEvidence,
          fastParse: true,
        });
      setDocumentsParseProgress({
        stage: 'extracting',
        percent: 36,
        detail: 'Extrayendo movimientos con OCR y parser financiero.',
      });
      let parsed = await callParseDocuments();
      const parsedDocsFirstTry = Array.isArray(parsed?.documents) ? parsed.documents : [];
      if (parsedDocsFirstTry.length === 0) {
        // One safe retry to absorb transient backend/OCR timeouts in deploy.
        await new Promise((resolve) => setTimeout(resolve, 700));
        parsed = await callParseDocuments();
      }
      setDocumentsParseProgress({
        stage: 'structuring',
        percent: 88,
        detail: 'Organizando categorías, totales y alertas.',
      });
      const parsedDocs = Array.isArray(parsed?.documents) ? parsed.documents : [];
      const transactionAnalysis = parsed?.transactionAnalysis as
        | {
            product_profile?: {
              institution?: string;
              service?: string;
              product_type?: BankProduct['productType'];
              product_label?: string;
              resolved_bank?: string;
              resolved_product_type?: BankProduct['productType'];
              document_profile_confidence?: number;
              document_profile_sign_convention?: string;
              document_profile_direction_basis?: string;
              document_profile_warnings?: string[];
              document_profile_correction_reason?: string | null;
              document_profile_auto_corrected?: boolean;
              document_profile_correction_level?: 'auto' | 'suggest' | 'keep';
              period?: { from?: string; to?: string };
              currency?: string;
              key_metrics?: {
                inflows_total: number;
                abonos_total?: number;
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
              evidence_fidelity?: 'authoritative' | 'indicative';
              evidence_fidelity_reason?: string | null;
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
              amount_signed?: number;
              direction: 'expense' | 'income';
              movement_kind?: 'expense' | 'income' | 'abono';
              direction_basis?: string;
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
      const profileResolvedInstitution = String(profile?.resolved_bank ?? profile?.institution ?? '').trim();
      const profileLabel = String(profile?.product_label ?? '').trim();
      const profileType = profile?.product_type;
      const profileResolvedType = profile?.resolved_product_type || profileType;
      const profileConfidence = Number(profile?.document_profile_confidence ?? 0) || 0;
      const profileAutoCorrected = Boolean(profile?.document_profile_auto_corrected);
      const profileCorrectionLevel = profile?.document_profile_correction_level ?? 'keep';
      const profileWarnings = Array.isArray(profile?.document_profile_warnings)
        ? profile?.document_profile_warnings?.filter((item): item is string => Boolean(item && String(item).trim())) ?? []
        : [];
      const profileCorrectionReason = String(profile?.document_profile_correction_reason ?? '').trim();
      const resolutionSuffix = [profileCorrectionReason, profileWarnings[0]].filter(Boolean).join(' ');
      const normalizedBankHint = String(activeBankProduct.bank ?? '')
        .replace(/\s*\(simulacion\)\s*/gi, '')
        .trim();
      const normalizedLabelHint = String(activeBankProduct.label ?? '').trim();
      const normalizeComparable = (value: string) =>
        String(value ?? '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const bankMismatch =
        Boolean(profileResolvedInstitution) &&
        normalizeComparable(profileResolvedInstitution) !== normalizeComparable(normalizedBankHint);
      const productMismatch =
        Boolean(profileResolvedType) && profileResolvedType !== activeBankProduct.productType;
      const shouldAutoCorrect =
        profileAutoCorrected ||
        (profileConfidence >= 0.86 && (bankMismatch || productMismatch || profileCorrectionLevel === 'auto'));
      const shouldSuggestCorrection =
        !shouldAutoCorrect && profileConfidence >= 0.6 && (bankMismatch || productMismatch);
      const finalBank = shouldAutoCorrect
        ? profileResolvedInstitution || normalizedBankHint || activeBankProduct.bank
        : normalizedBankHint || activeBankProduct.bank;
      const finalProductType = shouldAutoCorrect
        ? (profileResolvedType || activeBankProduct.productType)
        : activeBankProduct.productType;
      const finalLabel = shouldAutoCorrect
        ? `${finalBank} · ${profileLabel || finalProductType}`
        : normalizedLabelHint || activeBankProduct.label;
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

      const buildParsedDashboard = () =>
        profile
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
              evidenceFidelity: profile.evidence_fidelity,
              evidenceFidelityReason: profile.evidence_fidelity_reason ?? null,
            }
          : undefined;

      setBankSimulation((prev) => {
        const uploadApplied = applyUploadToTargetProduct(prev.products, targetProductId, fallbackParsedDocs, names);
        const active = uploadApplied.targetProduct;
        if (!active) return prev;
        const provisionalProduct: BankProduct = {
          ...active,
        };
        const descriptor = buildProductCardDescriptor(provisionalProduct);
        const generatedLabel = finalLabel || descriptor.title || active.label;
        const parsedDashboard = buildParsedDashboard();
        const alignedDashboard =
          parsedDashboard &&
          alignProductDashboard(
            { dashboard: parsedDashboard, productType: finalProductType || active.productType },
            prev.taxonomyOverrides,
          );

        const products = uploadApplied.products.map((p) =>
          p.id === active.id
            ? {
                ...p,
                assistant: normalizeProductAssistantState(p.assistant),
                bank: finalBank || p.bank.trim() || active.bank,
                productType: finalProductType || p.productType,
                label: generatedLabel || descriptor.title || p.label,
                dashboard: alignedDashboard ?? parsedDashboard ?? p.dashboard,
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
      setTxCreationNotice(
        shouldAutoCorrect
          ? `${names.length} respaldo(s) procesado(s) para ${finalLabel}. El producto se ajustó automáticamente según la evidencia.${resolutionSuffix ? ` ${resolutionSuffix}` : ''}`
          : shouldSuggestCorrection
            ? `${names.length} respaldo(s) procesado(s) para ${normalizedLabelHint || activeBankProduct.label}. La evidencia sugiere ${profileResolvedInstitution || profileInstitution || finalBank} · ${profileResolvedType || finalProductType}; revisa antes de continuar.${resolutionSuffix ? ` ${resolutionSuffix}` : ''}`
            : `${names.length} respaldo(s) procesado(s) para ${normalizedLabelHint || activeBankProduct.label}. Ya puedes revisar el resumen o inyectar el producto al agente.${resolutionSuffix ? ` ${resolutionSuffix}` : ''}`,
      );
      const parsedDashboardForReturn = buildParsedDashboard();
      const alignedDashboardForReturn =
        parsedDashboardForReturn &&
        alignProductDashboard(
          { dashboard: parsedDashboardForReturn, productType: finalProductType || activeBankProduct.productType },
          bankSimulation.taxonomyOverrides,
        );

      return {
        documents: fallbackParsedDocs,
        dashboard: alignedDashboardForReturn ?? parsedDashboardForReturn,
        product: {
          bank: finalBank,
          label: finalLabel || normalizedLabelHint || profileLabel || activeBankProduct.label,
          productType: finalProductType,
        },
      };
    } catch (error) {
      const isFiveHundred = error instanceof ApiHttpError && error.status >= 500;
      const errorText = isFiveHundred
        ? `Error al procesar archivos: ${error.detail || error.message || 'error interno'}. Intenta nuevamente.`
        : toUserFacingError(error, 'generic');
      setTransactionUploadError(errorText);
      setDocumentsParseProgress(IDLE_PARSE_PROGRESS);
      return null;
    } finally {
      setDocumentsLoading(false);
    }
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

        // On mobile compact, rotate the circular deck to recents (single instance, no clone scroll).
        if (isMobileViewport && !mobilePanelExpanded) {
          const panelEl = panelScrollRef.current as HTMLElement | null;
          if (panelEl) {
            panelEl.style.flexBasis = '';
            panelEl.style.removeProperty('--mobile-panel-h');
          }
          compactPanelDeckRef.current?.focusByKey('recents');
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

  function handleBudgetPdfSaved(payload: {
    title: string;
    fileUrl: string;
    previewImageUrl?: string;
    createdAt: string;
    sourceRect?: DOMRect | null;
  }) {
    const reportId = `budget-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const report: SavedReport = {
      id: reportId,
      title: payload.title || 'Presupuesto mensual',
      group: 'budget',
      fileUrl: payload.fileUrl,
      previewImageUrl: payload.previewImageUrl,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
    setSavedReports((prev) => [report, ...prev].slice(0, 120));
    launchDocToLibraryAnimation(
      report.title,
      payload.sourceRect ?? null,
      payload.previewImageUrl ?? payload.fileUrl,
      report.id,
    );
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


  const panelBaseCards: Array<{ key: string; node: ReactElement }> = buildPanelBaseCards({
    highlightedSection,
    sessionInfo,
    profile,
    openQuestionnaireModal: intakeData
      ? () => {
          setQuestionnaireModalMode('view');
          setIsQuestionnaireModalOpen(true);
        }
      : undefined,
    setIsAccountModalOpen,
    agentMetaRef,
    interviewCard,
    interviewCompleted,
    canOpenInterview,
    setInterviewIntake: () => {
      void syncFinancialContextToIntake().catch(() => {});
      setInterviewIntake(buildInterviewIntakePayload());
    },
    setPanelCallout,
    unlockedPanelBlocks,
    budgetTotals,
    budgetInsights,
    openBudgetModal,
    openTransactionsPanel,
    openInterviewModal,
    openDiagnosisView,
    fincoinSpendBlocked,
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
  const compactPanelLoopResetKey =
    (isMobileViewport ? 1 : 0) * 10000 + panelStage * 1000 + savedReports.length;
  const panelIntroLayoutSync =
    panelIntroActive &&
    (panelIntroPhase === 'assemble' || panelIntroPhase === 'settle' || panelIntroSettled);

  const panelRenderedCards = compactPanelCards.map((card, index) => {
    const cloned = React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
      'data-loop-segment': 'real',
      'data-loop-origin': String(index),
      ...(panelIntroActive ? {} : { 'data-panel-intro-slot': card.key }),
    });

    if (!panelIntroActive) {
      return React.cloneElement(cloned, { key: `real-${card.key}-${index}` });
    }

    return (
      <PanelIntroGridSlot
        key={`real-${card.key}-${index}`}
        cardKey={card.key}
        cardIndex={index}
        introPhase={panelIntroPhase}
        revealedCount={panelIntroRevealedCount}
        syncLayout={panelIntroLayoutSync}
      >
        {cloned}
      </PanelIntroGridSlot>
    );
  });

  if (!authBootstrapped || !isAuthenticated) {
    return null;
  }

  const terminalComposerShell = (
    <div className="agent-composer-stack">
      {hasBudgetTablePending && budgetTablePending && !isBudgetModalOpen ? (
        <BudgetPendingConfirmBanner
          summary={budgetTablePending.summary}
          disabled={loading}
          onConfirm={confirmBudgetTablePending}
          onReject={rejectBudgetTablePending}
        />
      ) : null}
      <div
      className={`agent-input-shell terminal-composer-shell${
        input.trim() ? ' has-composer-text' : ''
      }${isComposerFocused ? ' composer-focused' : ''}`}
    >
      <div
        className="agent-input terminal-composer"
        onClick={() => {
          if (isActiveChatLocked || isActiveChatClosed || isMobileViewport) return;
          focusComposerAfterLayout({ collapsePanelFirst: true });
        }}
        style={{ cursor: isActiveChatLocked || isActiveChatClosed ? 'default' : 'text' }}
      >
        <div
          className="terminal-composer-head"
          onPointerDown={(e) => {
            if (isActiveChatLocked || isActiveChatClosed || !isMobileViewport) return;
            if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
            /* iOS: prevent ghost click on the label from stealing focus back. */
            e.preventDefault();
            openComposerFromGesture();
          }}
        >
          $ escribir_mensaje
        </div>
        <textarea
          ref={chatComposerRef}
          className="terminal-composer-input"
          placeholder={
            fincoinSpendBlocked
              ? 'Fincoins agotados · agente en pausa'
              : isActiveChatClosed
                ? 'Chat cerrado · solo lectura'
              : isActiveChatLocked
                ? 'Chat bloqueado hasta completar la entrevista'
                : ''
          }
          value={input}
          disabled={isActiveChatLocked || isActiveChatClosed || fincoinSpendBlocked}
          autoFocus={!hasBlockingModalOpen && !isMobileViewport}
          enterKeyHint="send"
          inputMode="text"
          onFocus={() => {
            collapseMobilePanelForComposer();
            setIsComposerFocused(true);
          }}
          onBlur={() => {
            setIsComposerFocused(false);
          }}
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
          disabled={isActiveChatLocked || isActiveChatClosed || fincoinSpendBlocked}
          onClick={() => chatUploadInputRef.current?.click()}
          title={`Adjuntar archivos (máx. ${MAX_CHAT_UPLOAD_FILES}: PDF, imagen, Excel, texto y más)`}
          aria-label={`Adjuntar archivo, hasta ${MAX_CHAT_UPLOAD_FILES} por envío`}
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
          className={`composer-send-btn${input.trim() ? ' is-send-ready' : ''}`}
          disabled={isActiveChatLocked || isActiveChatClosed || fincoinSpendBlocked}
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
  );

  return (
    <PanelIntroLayoutGroup>
    <>
      <main
      className={`agent-layout ${activeThreadThemeClass} ${
        bootSequenceActive ? 'is-boot-sequence-active' : ''
      } ${
        panelIntroActive ? 'is-panel-intro-active' : ''
      } ${
        panelIntroPhase === 'shell' ? 'is-panel-intro-shell' : ''
      } ${
        panelIntroPhase === 'assemble' || panelIntroPhase === 'settle'
          ? 'is-panel-intro-assemble'
          : ''
      } ${
        panelIntroSettled ? 'is-panel-intro-settled' : ''
      } ${
        isRailMorphing ? 'is-mode-12-morphing' : ''
      } ${
        isVisualModeActive(visualMode) ? 'is-monochrome' : ''
      } ${
        visualMode !== 'off' ? `is-visual-mode-${visualMode}` : ''
      } ${
        isMobileViewport && mobilePanelExpanded ? 'mobile-panel-expanded' : ''
      } ${
        isMobileViewport ? 'is-mobile-viewport' : ''
      } ${
        isMobileViewport && isStandaloneDisplayMode ? 'is-mobile-standalone' : ''
      } ${
        !isMobileViewport
          ? panelStage === 1
            ? 'is-panel-stage-1'
            : panelStage === 3
              ? 'is-panel-collapsed'
              : 'is-panel-stage-2'
          : ''
      }`}
    >
      <section
        ref={chatBodyRef as React.RefObject<HTMLElement>}
        className={`agent-chat active-chat-${activeThread?.label ?? '1'}${chatSlideDir ? ` chat-slide-${chatSlideDir}` : ''}${isMobileViewport && !interviewCompleted ? ' is-chat-swipe-locked' : ''}`}
      >
        <ChatHeader
          chatThreads={chatThreads}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          getThreadSpecialization={getThreadSpecialization}
          resolveThreadAccessState={resolveThreadAccessState}
          setPanelCallout={setPanelCallout}
          setKnowledgePopupOpen={setKnowledgePopupOpen}
          knowledgeScore={knowledgeScore}
          activeThread={activeThread}
          isActiveChatLocked={isActiveChatLocked}
          isActiveChatClosed={isActiveChatClosed}
          activeTurnCount={activeTurnCount}
          diagnosisUnlocked={interviewCompleted}
          knowledgePopupOpen={knowledgePopupOpen}
          knowledgeStage={knowledgeStage}
          completedMilestones={completedMilestones}
          milestones={milestones}
          coachHint={coachHint}
          visualMode={visualMode}
          cycleVisualMode={handleCycleVisualMode}
          isMobileViewport={isMobileViewport}
          actionPlanFunnelStage={activeActionPlanStage}
          socialConsciousnessFunnelStage={activeSocialConsciousnessStage}
          fincoinRemaining={fincoinUsage.remainingFincoins}
          fincoinDepleted={fincoinSpendBlocked}
          fincoinLowBalance={fincoinLowBalance}
          onOpenFincoinUsage={() => {
            setFincoinUsageOpen(true);
            void refreshFincoinUsage();
          }}
        />
        {interviewResumePending && canOpenInterview && !interviewCompleted && !fincoinSpendBlocked ? (
          <div className="interview-resume-banner">
            <div className="interview-resume-copy">
              <strong>Entrevista pendiente</strong>
              <span>Tu llamada quedó guardada. Retómala cuando quieras.</span>
            </div>
            <button
              type="button"
              className="interview-resume-banner__btn"
              onClick={() => {
                void openInterviewModal();
              }}
            >
              Retomar
            </button>
          </div>
        ) : null}

        {contextConflictBanner.shouldRender ? (
          <ContextConflictBanner
            conflicts={contextConflictBanner.primaryConflicts}
            hiddenCount={contextConflictBanner.hiddenCount}
            onDismiss={contextConflictBanner.dismissConflict}
            onAction={handleContextConflictAction}
          />
        ) : null}

        {isActiveChatClosed ? (
          <div className="agent-chat-closure-bar">
            <button
              type="button"
              className="agent-chat-closure-toggle"
              onClick={() => setShowFullClosedChat((prev) => !prev)}
            >
              {showFullClosedChat ? 'Volver al cierre' : 'Ver chat completo'}
            </button>
          </div>
        ) : isActiveChatCloseoutWindow ? (
          <div className="agent-chat-closure-bar">
            <span className="agent-chat-closure-hint">
              Quedan {activeTurnsRemaining} interacciones. Vamos a cerrar con precisión.
            </span>
          </div>
        ) : null}

        <div className="agent-chat-body">
          <ChatThreadView
            items={items}
            loading={loading}
            diagnosisUnlocked={interviewCompleted}
            canOpenInterview={canOpenInterview}
            isMobileViewport={isMobileViewport}
            sessionUserName={sessionInfo?.name}
            activeThreadId={activeThread?.id}
            activeThreadLabel={activeThread?.label}
            expandedCitationsByMessage={expandedCitationsByMessage}
            setExpandedCitationsByMessage={setExpandedCitationsByMessage}
            onSend={onSend}
            setDraftForActive={setDraftForActive}
            sessionInjectedIntake={sessionInfo?.injectedIntake}
            diagnosisProfile={resolvedDiagnosisProfile}
            chatThreadRef={chatThreadRef as React.RefObject<HTMLDivElement>}
            activeChatId={activeChatId}
            actionPlanFunnelStage={activeActionPlanStage}
            socialConsciousnessFunnelStage={activeSocialConsciousnessStage}
            setItemsForActive={setItemsForActive}
            classifyReportGroup={classifyReportGroup}
            setSavedReports={setSavedReports}
            launchDocToLibraryAnimation={launchDocToLibraryAnimation}
            onPanelAction={openPanelSectionFromChat}
            onboardingFlowStatus={onboardingFlowStatus}
            visualMode={visualMode}
            compactClosedView={isActiveChatClosed}
            showFullChat={showFullClosedChat}
            sendDisabled={isActiveChatClosed || isActiveChatLocked || fincoinSpendBlocked}
            closingSummary={activeThreadClosureSummary}
            chat1IntroMode={chat1IntroMode}
            chat1GeneralDeepened={chat1GeneralDeepened}
            diagnosisDeepenVoiceFindings={diagnosisDeepenVoiceFindings}
          />

          {activeChatId === 'chat-3' && !isActiveChatClosed && !isActiveChatLocked ? (
            <div className="social-philosophy-trigger-wrap">
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
          ) : null}

          {!isMobileViewport && !isActiveChatClosed ? terminalComposerShell : null}
        </div>
      </section>

      {isMobileViewport ? (
        !isActiveChatClosed ? (
          <>
            {panelCallout && !mobilePanelExpanded ? (
              <PanelCalloutBanner
                callout={panelCallout}
                onClose={() => setPanelCallout(null)}
                variant="mobile-composer"
              />
            ) : null}
            <div
              className={`agent-mobile-composer-dock${input.trim() ? ' has-composer-text' : ''}${isComposerFocused ? ' composer-focused' : ''}`}
            >
              {terminalComposerShell}
            </div>
          </>
        ) : null
      ) : null}

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
        isMobileViewport={isMobileViewport}
        mobilePanelHandleRef={mobilePanelHandleRef}
        mobilePanelExpanded={mobilePanelExpanded}
        setMobilePanelExpanded={setMobilePanelExpanded}
        haptic={haptic}
        panelCallout={panelCallout}
        setPanelCallout={setPanelCallout}
        panelGridRef={panelGridRef}
        panelScrollRef={panelScrollRef as React.RefObject<HTMLElement>}
        compactPanelCards={compactPanelCards}
        compactPanelLoopResetKey={compactPanelLoopResetKey}
        compactPanelDeckRef={compactPanelDeckRef}
        panelRenderedCards={panelRenderedCards}
        panelIntroActive={panelIntroActive}
        panelIntroPhase={panelIntroPhase}
        panelIntroSettled={panelIntroSettled}
      />

      {docFlight && (
        <div
          className={`doc-flight-chip${docFlight.running ? ' is-running' : ''}`}
          style={{
            left: `${docFlight.startX}px`,
            top: `${docFlight.startY}px`,
            ['--dx']: `${docFlight.endX - docFlight.startX}px`,
            ['--dy']: `${docFlight.endY - docFlight.startY}px`,
          } as React.CSSProperties & Record<'--dx' | '--dy', string>}
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


      <QuestionnaireModal
        isOpen={isQuestionnaireModalOpen}
        mode={questionnaireModalMode}
        questionnaireDashboard={questionnaireDashboard}
        intakeData={intakeData}
        sessionUserName={sessionInfo?.name}
        onClose={() => {
          setIsQuestionnaireModalOpen(false);
          setQuestionnaireModalMode('view');
        }}
        onUpdated={async () => {
          const info = await getSessionInfo();
          setSessionInfo(info);
        }}
      />

      <TransactionsModal
        isOpen={isTransactionsModalOpen}
        fincoinSpendBlocked={fincoinSpendBlocked}
        onClose={() => setIsTransactionsModalOpen(false)}
        txWizardStep={txWizardStep}
        setTxWizardStep={setTxWizardStep}
        activeBankProduct={activeBankProduct}
        transactionProductCards={transactionProductCards}
        selectedProductId={bankSimulation.activeProductId}
        selectTransactionProduct={selectTransactionProduct}
        deleteTransactionProduct={deleteTransactionProduct}
        addTransactionProduct={addTransactionProduct}
        updateActiveProduct={updateActiveProduct}
        updateProductById={updateProductById}
        transactionTaxonomyOverrides={bankSimulation.taxonomyOverrides}
        upsertTransactionTaxonomyOverride={upsertTransactionTaxonomyOverride}
        removeTransactionTaxonomyOverride={removeTransactionTaxonomyOverride}
        simulateBankLogin={simulateBankLogin}
        onUploadStatement={onUploadStatement}
        documentsLoading={documentsLoading}
        documentsParseProgress={documentsParseProgress}
        onDocumentsParseProgress={setDocumentsParseProgress}
        transactionUploadError={transactionUploadError}
        saveTransactionProductForBatch={saveTransactionProductForBatch}
        savedProductIds={savedProductsForBatch}
        maxProducts={MAX_TRANSACTION_PRODUCTS}
        maxEvidenceFilesPerProduct={MAX_EVIDENCE_FILES_PER_PRODUCT}
        productsCreatedTotal={txProductsCreatedTotal}
        creationNotice={txCreationNotice}
        productsModuleSkipped={bankSimulation.productsModuleSkipped}
        onContinueWithoutProducts={continueWithoutProducts}
        resetTransactionProductEvidence={resetTransactionProductEvidence}
        maxEvidenceResets={MAX_TRANSACTION_EVIDENCE_RESETS}
      />

      <BudgetModal
        isOpen={isBudgetModalOpen}
        fincoinSpendBlocked={fincoinSpendBlocked}
        onClose={() => setIsBudgetModalOpen(false)}
        budgetTotals={budgetTotals}
        budgetRows={budgetRows}
        budgetCompletion={budgetCompletion}
        budgetSignals={budgetSignals}
        updateBudgetRow={updateBudgetRow}
        applyBudgetTableActions={applyBudgetTableActions}
        applyBudgetTemplate={applyBudgetTemplate}
        addBudgetRow={addBudgetRow}
        deleteBudgetRow={deleteBudgetRow}
        sendBudgetToAgent={sendBudgetToAgent}
        chatAnswers={budgetChatAnswers}
        onChatAnswersChange={setBudgetChatAnswers}
        bankProducts={buildBudgetAssistantProductsFromBankSimulation(
          bankSimulation.products,
          bankSimulation.taxonomyOverrides,
        )}
        onBudgetPdfSaved={handleBudgetPdfSaved}
        budgetPendingConfirmation={budgetTablePending}
        onBudgetPendingConfirmationChange={setBudgetTablePending}
      />

      <InterviewModal
        isOpen={isInterviewModalOpen}
        fincoinSpendBlocked={fincoinSpendBlocked}
        onClose={() => setIsInterviewModalOpen(false)}
        onDeepenInChat={beginDiagnosisDeepenChat}
        deepenInChatDisabled={chat1GeneralDeepened}
        onDiagnosisComplete={() => {
          void syncDiagnosisSession({
            onSession: (info) => setSessionInfo(info),
          });
        }}
      />

      <SocialConsciousnessModal
        isOpen={isSocialConsciousnessModalOpen}
        onClose={() => setIsSocialConsciousnessModalOpen(false)}
        onSendToChat={(message) => {
          setIsSocialConsciousnessModalOpen(false);
          void onSend(message);
        }}
        sessionUserId={sessionInfo?.id}
        onReflectionsPersisted={() => setSocialReflectionRevision((value) => value + 1)}
        sessionUserName={sessionInfo?.name}
      />

      <FincoinUsageModal
        isOpen={fincoinUsageOpen}
        onClose={() => setFincoinUsageOpen(false)}
        usage={fincoinUsage}
        loading={fincoinUsageLoading}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        sessionUserName={sessionInfo?.name}
        sessionEmail={sessionInfo?.email}
        isLoading={isAccountActionLoading}
        error={accountActionError}
        onClose={closeAccountModal}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />
    </main>

      {bootSequenceActive && sessionInfo ? (
        <AgentBootSequence
          session={sessionInfo}
          onHandoff={(origin) => {
            setPanelIntroHandoffOrigin(origin);
          }}
          onComplete={() => {
            setBootSequenceActive(false);
          }}
        />
      ) : null}

      {panelIntroActive ? (
        <PanelCardsIntroSequence
          panelGridRef={panelGridRef}
          panelCards={compactPanelCards}
          isMobileViewport={isMobileViewport}
          handoffOrigin={panelIntroHandoffOrigin}
          onPhaseChange={setPanelIntroPhase}
          onRevealCountChange={setPanelIntroRevealedCount}
          onSettled={() => setPanelIntroSettled(true)}
          onPanelReveal={() => {
            if (isMobileViewport) {
              compactPanelDeckRef.current?.resetHome();
            } else {
              panelScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          onHaptic={haptic}
          onComplete={() => {
            panelIntroStartRef.current = false;
            setPanelIntroActive(false);
            setPanelIntroPhase('morph');
            setPanelIntroRevealedCount(0);
            setPanelIntroSettled(false);
            setPanelIntroHandoffOrigin(null);
            if (isMobileViewport) {
              compactPanelDeckRef.current?.resetHome();
            }
          }}
        />
      ) : null}
    </>
    </PanelIntroLayoutGroup>
  );
}
