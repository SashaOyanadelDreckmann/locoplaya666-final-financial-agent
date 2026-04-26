'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

import { getSessionId } from '@/lib/session';
import { sendToAgent } from '@/lib/agent';
import { savePdfArtifact } from '@/lib/artifacts';
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
import { getApiBaseUrl } from '@/lib/apiBase';

import PanelCard from '../../components/PanelCard';
import ProfileCard from '../../components/ProfileCard';

import type {
  AgentBlock,
  AgentResponse,
  ChatItem,
} from '@/lib/agent.response.types';
import { toChatItemsFromAgentResponse } from '@/lib/agent.response.types';
import { DocumentBubble } from '@/components/conversation/DocumentBubble';
import { AgentBlocksRenderer } from '@/components/agent/AgentBlocksRenderer';
import { CitationBubble } from '@/components/conversation/CitationBubble';

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

const CHAT_GAME_INSTRUCTION =
  'Para aprovechar al maximo este juego: 1) define un objetivo financiero concreto, 2) usa los 3 chats en paralelo para explorar escenarios, 3) pide primero grafico o simulacion y luego informe PDF, 4) guarda documentos clave para compararlos, 5) ajusta riesgo, plazo y aporte en cada iteracion para subir tu nivel de conocimiento.';

const FALLBACK_WELCOME =
  'Ya tengo una lectura inicial de tu situación. Podemos partir por ordenar el flujo, revisar riesgos y definir el primer movimiento útil.';

function buildInitialAgentSuggestions(intakeLike: unknown): string[] {
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

  const root = asRecord(intakeLike);
  const intake = asRecord(root?.intake) ?? root;

  const hasDebt = typeof intake?.hasDebt === 'boolean' ? intake.hasDebt : null;
  const hasSavings =
    typeof intake?.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
  const tracksExpenses = typeof intake?.tracksExpenses === 'string' ? intake.tracksExpenses : '';
  const riskReaction = typeof intake?.riskReaction === 'string' ? intake.riskReaction : '';
  const incomeBand = typeof intake?.incomeBand === 'string' ? intake.incomeBand : '';

  const suggestions: string[] = [
    'Diagnóstico express de mi situación financiera',
    'Construir plan de 90 días para ordenar mis finanzas',
    'Simular ahorro mensual con mi perfil actual',
    'Qué ajustar primero para mejorar mi flujo mensual',
  ];

  if (hasDebt === true) {
    suggestions.push(
      'Priorizar mis deudas con estrategia avalancha',
      'Simular prepago vs invertir mes a mes'
    );
  } else {
    suggestions.push(
      'Diseñar fondo de emergencia ideal para mi caso',
      'Elegir entre ahorro conservador vs balanceado'
    );
  }

  if (hasSavings === true) {
    suggestions.push('Optimizar mis ahorros actuales con metas claras');
  } else {
    suggestions.push('Crear hábito de ahorro automático sin ahogarme');
  }

  if (tracksExpenses === 'no' || tracksExpenses === 'sometimes') {
    suggestions.push('Armar presupuesto base 50/30/20 personalizado');
  } else {
    suggestions.push('Detectar gastos hormiga y recuperar margen');
  }

  if (riskReaction === 'sell' || riskReaction === 'never_invest') {
    suggestions.push('Plan de inversión conservador paso a paso');
  } else if (riskReaction === 'buy_more') {
    suggestions.push('Simular cartera más agresiva con límites de riesgo');
  } else {
    suggestions.push('Comparar perfil conservador vs balanceado vs agresivo');
  }

  if (incomeBand === 'variable' || incomeBand === 'no_income') {
    suggestions.push('Plan financiero para ingresos variables');
  } else {
    suggestions.push('Proyección anual de ahorro con mis ingresos actuales');
  }

  suggestions.push(
    'Ver tasas actuales en Chile (UF, TPM, hipotecario)',
    'Checklist de decisiones para este mes'
  );

  return Array.from(new Set(suggestions)).slice(0, 12);
}

function sanitizeMessageText(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const cleaned = raw
    .replace(/(?:^|\n)\s*SUGERENCIAS\s*:\s*\[[\s\S]*?\]\s*(?=\n|$)/gi, '\n')
    .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/gi, '\n')
    .replace(/\bundefined\b/gi, '')
    .replace(/\bnull\b/gi, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/([.,;:!?])([^\s])/g, '$1 $2')
    .replace(/([a-záéíóúñ])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-záéíóúñ])/gi, '$1 $2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned || fallback.trim();
}

function sanitizeChatItems(items: ChatItem[]): ChatItem[] {
  return items
    .map((item) => {
      if (item.type !== 'message') return item;
      const content = sanitizeMessageText(item.content, item.role === 'assistant' ? '—' : '');
      if (!content && item.role !== 'assistant') return null;
      return { ...item, content };
    })
    .filter((item): item is ChatItem => Boolean(item));
}

function resolveDocumentUrl(raw: string): string {
  if (!raw) return '#';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${getApiBaseUrl()}${raw}`;
  return `${getApiBaseUrl()}/${raw.replace(/^\/+/, '')}`;
}

function firstNameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Usuario';
  return value.trim().split(/\s+/)[0] ?? 'Usuario';
}

function normalizeAmountToken(token: string): number | null {
  const cleaned = token.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/[.\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildTransactionIntelligence(
  parsedDocuments: Array<{ name: string; text: string }>
): {
  docs: number;
  rows: number;
  amounts: number[];
  topKeywords: Array<{ label: string; count: number }>;
  totalDetected: number;
  averageDetected: number;
  maxDetected: number;
  hasBankLanguage: boolean;
  summary: string;
} {
  const keywordMatchers = [
    { label: 'Supermercado', regex: /jumbo|lider|unimarc|tottus|supermercad/gi },
    { label: 'Transporte', regex: /uber|cabify|metro|copec|shell|bencina|combustible/gi },
    { label: 'Transferencias', regex: /transfer|transf|tef|spei|abono|deposito/gi },
    { label: 'Tarjetas', regex: /tarjeta|credito|debito|compra nacional|compra internacional/gi },
    { label: 'Cajero', regex: /giro|cajero|atm|efectivo/gi },
    { label: 'Servicios', regex: /agua|luz|internet|movistar|entel|vtr|wom|enel/gi },
    { label: 'Suscripciones', regex: /spotify|netflix|youtube|apple|google|amazon prime|subscription/gi },
    { label: 'Cuotas', regex: /cuota|cuotas|avance|credito de consumo/gi },
  ];

  const allText = parsedDocuments.map((doc) => doc.text ?? '').join('\n');
  const amounts = Array.from(
    allText.matchAll(/(?:\$|clp|monto|total|cargo|abono)?\s*([\d.]{4,}|\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?)/gi)
  )
    .map((match) => normalizeAmountToken(match[1] ?? ''))
    .filter((value): value is number => value !== null)
    .slice(0, 400);

  const topKeywords = keywordMatchers
    .map((item) => ({
      label: item.label,
      count: (allText.match(item.regex) ?? []).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const rows = parsedDocuments.reduce((acc, doc) => {
    return acc + (doc.text.match(/\n/g)?.length ?? 0);
  }, 0);
  const totalDetected = amounts.reduce((acc, value) => acc + value, 0);
  const averageDetected = amounts.length ? totalDetected / amounts.length : 0;
  const maxDetected = amounts.length ? Math.max(...amounts) : 0;
  const hasBankLanguage = /cartola|saldo|abono|cargo|movimiento|transfer|cuota|pago/gi.test(allText);
  const summary =
    parsedDocuments.length === 0
      ? 'Sin cartolas cargadas todavía.'
      : amounts.length === 0
      ? 'Hay documentos listos, pero aún no se detectan montos estructurados claros.'
      : `Detecté ${amounts.length} montos y ${topKeywords.length > 0 ? topKeywords.map((item) => item.label).join(', ') : 'actividad transaccional'} en ${parsedDocuments.length} documento(s).`;

  return {
    docs: parsedDocuments.length,
    rows,
    amounts,
    topKeywords,
    totalDetected,
    averageDetected,
    maxDetected,
    hasBankLanguage,
    summary,
  };
}

function inferInstitutionFromText(allText: string, bankHint: string): string {
  const source = `${bankHint}\n${allText}`.toLowerCase();
  const institutions = [
    { label: 'Banco de Chile', regex: /\bbanco\s*de\s*chile\b|chile\.cl|edwards/gi },
    { label: 'BancoEstado', regex: /\bbanco\s*estado\b|\bbancoestado\b/gi },
    { label: 'Santander', regex: /\bsantander\b/gi },
    { label: 'BCI', regex: /\bbci\b|credito e inversiones/gi },
    { label: 'Scotiabank', regex: /\bscotiabank\b|scotia/gi },
    { label: 'Itaú', regex: /\bita[uú]\b/gi },
    { label: 'Falabella', regex: /\bfalabella\b|cmr/gi },
    { label: 'Ripley', regex: /\bripley\b|banco ripley|rpay/gi },
  ];
  for (const institution of institutions) {
    if (institution.regex.test(source)) return institution.label;
  }
  return bankHint.trim() || 'Institución no identificada';
}

function inferProductTypeFromText(allText: string): string {
  const source = allText.toLowerCase();
  const productPatterns = [
    { label: 'Cuenta Corriente', regex: /\bcuenta\s*corriente\b/gi },
    { label: 'Cuenta Vista', regex: /\bcuenta\s*vista\b|chequera electronica/gi },
    { label: 'Cuenta RUT', regex: /\bcuenta\s*rut\b/gi },
    { label: 'Tarjeta de Crédito', regex: /\btarjeta\s*de\s*cr[eé]dito\b|estado de cuenta/gi },
    { label: 'Línea de Crédito', regex: /\bl[ií]nea\s*de\s*cr[eé]dito\b|avance en efectivo/gi },
    { label: 'Crédito de Consumo', regex: /\bcr[eé]dito\s*de\s*consumo\b|cuota mensual/gi },
  ];
  for (const product of productPatterns) {
    if (product.regex.test(source)) return product.label;
  }
  return 'Producto financiero';
}

function buildProductCardDescriptor(product: BankProduct): {
  title: string;
  description: string;
  insights: string[];
} {
  const allText = product.parsedDocuments.map((doc) => doc.text ?? '').join('\n');
  const intel = buildTransactionIntelligence(product.parsedDocuments);
  const institution = inferInstitutionFromText(allText, product.bank);
  const productType = inferProductTypeFromText(allText);

  const title = `${institution} · ${productType}`;
  const activityInsight =
    intel.amounts.length > 0
      ? `Movimientos detectados: ${intel.amounts.length} con promedio $${Math.round(
          intel.averageDetected
        ).toLocaleString('es-CL')}.`
      : 'Sin movimientos monetarios estructurados detectados todavía.';
  const categoryInsight =
    intel.topKeywords.length > 0
      ? `Patrones: ${intel.topKeywords.map((k) => `${k.label} (${k.count})`).join(', ')}.`
      : 'Aún no hay categorías suficientes para patrón robusto.';
  const readinessInsight =
    product.parsedDocuments.length > 0
      ? 'Listo para dashboard e insights ejecutivos.'
      : 'Carga una cartola o imagen para activar análisis.';

  return {
    title,
    description:
      product.parsedDocuments.length > 0
        ? `${product.parsedDocuments.length} documento(s) analizado(s). ${activityInsight}`
        : 'Pendiente de cartola para identificar institución, producto y comportamiento mensual.',
    insights: [categoryInsight, readinessInsight],
  };
}

const DEFAULT_BUDGET_ROWS: BudgetRow[] = [
  {
    id: 'income-salary',
    category: 'Sueldo liquido',
    type: 'income',
    amount: 0,
    note: '',
  },
  {
    id: 'income-extra',
    category: 'Ingresos extra',
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
  {
    id: 'expense-transport',
    category: 'Transporte',
    type: 'expense',
    amount: 0,
    note: '',
  },
  {
    id: 'expense-debt',
    category: 'Deuda financiera',
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
  const [mobileTab, setMobileTab] = useState<'chat' | 'panel'>('chat');
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMonochrome, setIsMonochrome] = useState(false);
  const [progressPulse, setProgressPulse] = useState(false);
  const [isRailMorphing, setIsRailMorphing] = useState(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);
  const [knowledgePopupOpen, setKnowledgePopupOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [txWizardStep, setTxWizardStep] = useState<'products' | 'credentials' | 'upload' | 'dashboard' | 'locked'>('products');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>(DEFAULT_BUDGET_ROWS);
  const [bankSimulation, setBankSimulation] = useState<BankSimulation>(DEFAULT_BANK_SIMULATION);
  const [docFlight, setDocFlight] = useState<DocFlight | null>(null);
  const [isRealtimeOpen, setIsRealtimeOpen] = useState(false);
  const [realtimeSpeaking, setRealtimeSpeaking] = useState(false);
  const [realtimeListening, setRealtimeListening] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState('');
  const [realtimeHistory, setRealtimeHistory] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);
  const realtimeRecognitionRef = useRef<any>(null);
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const bubblePosInitRef = useRef(false);
  const bubbleDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const panelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [panelStateLoaded, setPanelStateLoaded] = useState(false);
  const [persistentKnowledgeScore, setPersistentKnowledgeScore] = useState<number | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const agentMetaRef = useRef<AgentMeta>({});
  const [, forceRender] = useState(0);
  const [chatSlideDir, setChatSlideDir] = useState<'left' | 'right' | null>(null);
  const previousKnowledgeScoreRef = useRef(0);
  const previousMilestoneDoneIdsRef = useRef<Set<string>>(new Set());
  const recentLibraryRef = useRef<HTMLDivElement | null>(null);
  const panelScrollRef = useRef<HTMLElement | null>(null);
  const panelGridRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const info = await getSessionInfo();
        if (cancelled) return;
        setSessionInfo(info);
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
    el.scrollLeft = 0;
  }, [isMobileViewport, panelStage]);

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
    };
  }, [intakeData, sessionInfo?.name]);

  const transactionIntel = useMemo(
    () => buildTransactionIntelligence(bankSimulation.parsedDocuments),
    [bankSimulation.parsedDocuments]
  );

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
    const monoClass = 'agent-monochrome-bg';
    const normalClass = 'agent-normal-matte-bg';
    if (isMonochrome) {
      document.body.classList.add(monoClass);
      document.body.classList.remove(normalClass);
    } else {
      document.body.classList.remove(monoClass);
      document.body.classList.add(normalClass);
    }
    return () => {
      document.body.classList.remove(monoClass);
      document.body.classList.remove(normalClass);
    };
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

        // Scroll the panel to show recents
        if (panelScrollRef.current && recentLibraryRef.current) {
          const panelEl = panelScrollRef.current;
          const cardEl = recentLibraryRef.current;
          const panelRect = panelEl.getBoundingClientRect();
          const cardRect = cardEl.getBoundingClientRect();
          const scrollTarget = panelEl.scrollTop + (cardRect.top - panelRect.top) - 16;
          panelEl.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }

        // Auto-expand mobile panel so user sees the PDF land in recents
        setMobilePanelExpanded(true);
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

  function openRealtimeMode() {
    if (!bubblePosInitRef.current) {
      setBubblePos({ x: window.innerWidth - 280, y: window.innerHeight - 120 });
      bubblePosInitRef.current = true;
    }
    setIsRealtimeOpen(true);
    setRealtimeHistory([]);
    setRealtimeTranscript('');
  }

  function onBubbleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only drag on the bubble itself, not on buttons inside
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const orig = { ...bubblePos };
    bubbleDragRef.current = { startX: e.clientX, startY: e.clientY, origX: orig.x, origY: orig.y };

    const onMove = (ev: MouseEvent) => {
      if (!bubbleDragRef.current) return;
      setBubblePos({
        x: bubbleDragRef.current.origX + (ev.clientX - bubbleDragRef.current.startX),
        y: bubbleDragRef.current.origY + (ev.clientY - bubbleDragRef.current.startY),
      });
    };
    const onUp = () => {
      bubbleDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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

  function closeRealtimeMode() {
    setIsRealtimeOpen(false);
    setRealtimeSpeaking(false);
    setRealtimeListening(false);
    if (realtimeRecognitionRef.current) {
      try { realtimeRecognitionRef.current.stop(); } catch {}
      realtimeRecognitionRef.current = null;
    }
  }

  async function sendRealtimeMessage(text: string) {
    if (!text.trim()) return;
    const userText = text.trim();
    setRealtimeHistory((prev) => [...prev, { role: 'user', text: userText }]);
    setRealtimeTranscript('');
    setRealtimeSpeaking(true);

    // Write user message to active chat sheet
    setItemsForActive((prev) => [
      ...prev,
      { type: 'message', role: 'user', content: `🎙 ${userText}` },
    ]);
    setChatThreads((prev) =>
      prev.map((t) => t.id === activeChatId ? { ...t, userMessageCount: t.userMessageCount + 1 } : t)
    );

    try {
      const res = (await sendToAgent({
        user_message: userText,
        session_id: getSessionId(),
        history: realtimeHistory.slice(-6).map((h) => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        })),
        context: {},
        ui_state: { realtime_mode: true },
        preferences: { response_style: 'concise', language: 'es-CL' },
      })) as any;

      const agentText = res?.message ?? 'No pude generar una respuesta.';
      setRealtimeHistory((prev) => [...prev, { role: 'agent', text: agentText }]);

      // Write agent response to active chat sheet
      setItemsForActive((prev) => [
        ...prev,
        { type: 'message', role: 'assistant', content: agentText, mode: 'conversacion' },
      ]);

      // TTS — voz juvenil y simpática (misma configuración que modo entrevista)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utt = new SpeechSynthesisUtterance(agentText.slice(0, 500));
        utt.lang = 'es-CL';
        utt.rate = 1.3;
        utt.pitch = 1.1;
        utt.volume = 1;
        // Prefer Google Neural / Natural / Premium voices — más naturales y juveniles
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => v.lang.startsWith('es') && /Google|Natural|Premium|Paulina/i.test(v.name)) ||
          voices.find((v) => v.lang === 'es-CL') ||
          voices.find((v) => v.lang.startsWith('es')) ||
          null;
        if (preferred) utt.voice = preferred;
        utt.onend = () => setRealtimeSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
      } else {
        setRealtimeSpeaking(false);
      }
    } catch {
      setRealtimeSpeaking(false);
      setRealtimeHistory((prev) => [...prev, { role: 'agent', text: 'Ocurrió un error. Intenta de nuevo.' }]);
    }
  }

  function startRealtimeListen() {
    haptic(realtimeListening ? [10, 10, 10] : 20); // triple para detener, largo para iniciar
    if (realtimeListening) {
      if (realtimeRecognitionRef.current) {
        try { realtimeRecognitionRef.current.stop(); } catch {}
      }
      setRealtimeListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = 'es-CL';
    rec.interimResults = true;
    rec.continuous = false;
    realtimeRecognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setRealtimeTranscript(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        sendRealtimeMessage(transcript);
      }
    };
    rec.onend = () => setRealtimeListening(false);
    rec.start();
    setRealtimeListening(true);
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

  function renderLatexLikeMessage(content: string): ReactNode {
    const sanitized = content
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\\n/g, '\n')
      .trim();
    // Prevent currency-like tokens ($500, $X) from being interpreted as inline math delimiters.
    const safeForMathParser = sanitized.replace(
      /(^|[^\\$])\$(?=(\d|[A-ZÁÉÍÓÚÑ]))/gm,
      '$1\\$'
    );

    const stripEnclosingParens = (input: string) => {
      let expr = input.trim();
      const isBalanced = (s: string) => {
        let depth = 0;
        for (const ch of s) {
          if (ch === '(') depth += 1;
          else if (ch === ')') {
            depth -= 1;
            if (depth < 0) return false;
          }
        }
        return depth === 0;
      };
      while (expr.startsWith('(') && expr.endsWith(')')) {
        const candidate = expr.slice(1, -1).trim();
        if (!candidate || !isBalanced(candidate)) break;
        expr = candidate;
      }
      return expr;
    };

    const toFractionIfDivision = (rawExpr: string) => {
      let expr = rawExpr.trim();
      if (!expr.includes('/')) return expr;
      if (expr.includes('://')) return expr;

      const isTokenChar = (ch: string) => /[A-Za-z0-9_.\\^]/.test(ch);
      const findLeftOperandStart = (input: string, slashIndex: number) => {
        let i = slashIndex - 1;
        while (i >= 0 && /\s/.test(input[i])) i -= 1;
        if (i < 0) return 0;

        if (input[i] === ')' || input[i] === ']' || input[i] === '}') {
          const open = input[i] === ')' ? '(' : input[i] === ']' ? '[' : '{';
          const close = input[i];
          let depth = 1;
          i -= 1;
          while (i >= 0) {
            if (input[i] === close) depth += 1;
            else if (input[i] === open) {
              depth -= 1;
              if (depth === 0) return i;
            }
            i -= 1;
          }
          return 0;
        }

        while (i >= 0 && isTokenChar(input[i])) i -= 1;
        return i + 1;
      };

      const findRightOperandEnd = (input: string, slashIndex: number) => {
        let i = slashIndex + 1;
        while (i < input.length && /\s/.test(input[i])) i += 1;
        if (i >= input.length) return input.length;

        if (input[i] === '(' || input[i] === '[' || input[i] === '{') {
          const open = input[i];
          const close = open === '(' ? ')' : open === '[' ? ']' : '}';
          let depth = 1;
          i += 1;
          while (i < input.length) {
            if (input[i] === open) depth += 1;
            else if (input[i] === close) {
              depth -= 1;
              if (depth === 0) return i + 1;
            }
            i += 1;
          }
          return input.length;
        }

        while (i < input.length && isTokenChar(input[i])) i += 1;
        return i;
      };

      let guard = 0;
      while (guard < 8 && expr.includes('/')) {
        guard += 1;
        const slashIndex = expr.indexOf('/');
        if (slashIndex <= 0 || slashIndex >= expr.length - 1) break;
        if (expr[slashIndex + 1] === '/') {
          expr = `${expr.slice(0, slashIndex + 1)} ${expr.slice(slashIndex + 1)}`;
          continue;
        }

        const leftStart = findLeftOperandStart(expr, slashIndex);
        const rightEnd = findRightOperandEnd(expr, slashIndex);
        const left = stripEnclosingParens(expr.slice(leftStart, slashIndex));
        const right = stripEnclosingParens(expr.slice(slashIndex + 1, rightEnd));
        if (!left || !right) break;

        expr = `${expr.slice(0, leftStart)}\\frac{${left}}{${right}}${expr.slice(rightEnd)}`;
      }
      return expr;
    };

    const normalizeDivisionsToFractions = (line: string) => {
      const expr = line.trim();
      if (!expr.includes('/')) return expr;

      const parts = expr.split('=');
      if (parts.length === 1) {
        return toFractionIfDivision(parts[0]);
      }

      const normalizedParts = parts.map((part, idx) => {
        if (idx === 0) return part.trim();
        return toFractionIfDivision(part);
      });
      return normalizedParts.join(' = ');
    };

    const normalizedForMath = safeForMathParser
      .replace(/\\\[/g, '$$')
      .replace(/\\\]/g, '$$')
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$')
      .replace(/\r\n/g, '\n');

    const compactMath = normalizedForMath
      // common plain forms: VP = PV [r(1+r)^n]/[(1+r)^n - 1]
      .replace(/\$\$\s*([^$]+?)\s*\$\$/g, (_m, expr) => {
        const cleaned = expr
          .replace(/\s+/g, ' ')
          .replace(/\[\s*/g, '\\left(')
          .replace(/\s*\]/g, '\\right)')
          .trim();
        const withFractions = normalizeDivisionsToFractions(cleaned);
        return `$$${withFractions}$$`;
      });

    const normalizeEscapedMarkdown = (input: string) =>
      (() => {
        let inFence = false;
        return input
          .split('\n')
          .map((line) => {
            const raw = line;
            const trimmed = raw.trim();
            if (/^```/.test(trimmed)) {
              inFence = !inFence;
              return raw;
            }
            if (!trimmed) return raw;
            if (raw.includes('$$')) return raw;

            let next = raw;
            // Prevent accidental markdown code blocks from indentation in model output.
            if (!inFence && /^ {4,}\S/.test(next)) {
              next = next.replace(/^ {4}/, '');
            }

            // Common escaped markdown emitted by model/tooling.
            next = next.replace(/\\+([*_`#>\-])/g, '$1');
            next = next.replace(/\\+([“”"'])/g, '$1');

            // Normalize unicode bullets so markdown parser handles lists consistently.
            next = next.replace(/^\s*[•●◦▪]\s+/u, '- ');

            // Normalize malformed bold markers: ** texto ** -> **texto**
            next = next.replace(/\*\*\s+([^*][\s\S]*?)\s+\*\*/g, '**$1**');
            // Remove stray single asterisk often emitted after ":" in lists.
            next = next.replace(/:\s*\*\s+(\d)/g, ': $1');
            // Preserve valid bold pairs, remove orphan "**" artifacts without harming formulas.
            let boldIndex = 0;
            const boldTokens: Array<{ key: string; value: string }> = [];
            next = next.replace(/\*\*([^*\n]+?)\*\*/g, (_m, content) => {
              const key = `@@BOLD_${boldIndex++}@@`;
              boldTokens.push({ key, value: `**${content}**` });
              return key;
            });
            let italicIndex = 0;
            const italicTokens: Array<{ key: string; value: string }> = [];
            next = next.replace(/(^|[^\*])\*([^*\n]+?)\*(?!\*)/g, (_m, prefix, content) => {
              const key = `@@ITALIC_${italicIndex++}@@`;
              italicTokens.push({ key, value: `*${content}*` });
              return `${prefix}${key}`;
            });
            next = next.replace(/\*\*/g, '');
            if (!next.includes('$')) {
              // Remove orphan single '*' that leak at word endings, without touching formulas.
              next = next.replace(/([^\s*])\*(?!\*)(?=\s|$|[.,;:!?])/g, '$1');
            }
            for (const token of boldTokens) {
              next = next.replace(token.key, token.value);
            }
            for (const token of italicTokens) {
              next = next.replace(token.key, token.value);
            }

            // Remove wrapping quotes around markdown lines: "**text**", "## title", "---"
            next = next.replace(
              /^\s*["“”']\s*(\*\*.+\*\*|#{1,6}\s+.+|-{3,})\s*["“”']\s*$/u,
              '$1'
            );

            return next;
          })
          .join('\n');
      })();

    const markdownReady = normalizeEscapedMarkdown(compactMath);
    const polishedMarkdown = (() => {
      const normalized = markdownReady
        // Keep valid bold markdown intact for professional rendering.
        .replace(/\*\*\s+([^*\n][^*\n]*?)\s+\*\*/g, '**$1**');

      // Final safety pass: remove orphan asterisks while preserving valid markdown and LaTeX.
      const mathTokens: Array<{ key: string; value: string }> = [];
      let mathIdx = 0;
      const withMathProtected = normalized.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g, (m) => {
        const key = `@@MATH_${mathIdx++}@@`;
        mathTokens.push({ key, value: m });
        return key;
      });

      const boldTokens: Array<{ key: string; value: string }> = [];
      let boldIdx = 0;
      let text = withMathProtected.replace(/\*\*([^*\n]+?)\*\*/g, (_m, content) => {
        const key = `@@B_${boldIdx++}@@`;
        boldTokens.push({ key, value: `**${content}**` });
        return key;
      });

      const italicTokens: Array<{ key: string; value: string }> = [];
      let italicIdx = 0;
      text = text.replace(/(^|[^\*])\*([^*\n]+?)\*(?!\*)/g, (_m, prefix, content) => {
        const key = `@@I_${italicIdx++}@@`;
        italicTokens.push({ key, value: `*${content}*` });
        return `${prefix}${key}`;
      });

      // Purge any remaining orphan markers.
      text = text.replace(/\*\*/g, '');
      text = text.replace(/([^\s*])\*(?!\*)(?=\s|$|[.,;:!?])/g, '$1');

      for (const token of boldTokens) text = text.replace(token.key, token.value);
      for (const token of italicTokens) text = text.replace(token.key, token.value);
      for (const token of mathTokens) text = text.replace(token.key, token.value);
      return text;
    })();

    const promoteFormulaLikeLines = (input: string) => {
      let inFence = false;
      return input
        .split('\n')
        .map((line) => {
          const raw = line;
          const trimmed = raw.trim();
          if (/^```/.test(trimmed)) {
            inFence = !inFence;
            return raw;
          }
          if (!trimmed || inFence || trimmed.includes('$$')) return raw;

          const bulletPrefix = raw.match(/^(\s*(?:[-*]|\d+\.)\s+)/)?.[1] ?? '';
          const body = bulletPrefix ? raw.slice(bulletPrefix.length).trim() : trimmed;

          const looksFormulaLike =
            /[=Σπμσ√∞∑]/u.test(body) ||
            /\b(?:VAN|VPN|TIR|IRR|WACC|CAPM|ROI|ROE|EBITDA|NPV|beta|alpha|ln|cov|var)\b/i.test(body) ||
            /[A-Za-z][A-Za-z0-9_]*\s*=\s*.+/.test(body) ||
            /\([^)]+\)\^[^\s]+/.test(body) ||
            /\bCF_t\b|\br_f\b|\br_m\b|\bP_final\b|\bP_inicial\b/.test(body);

          const proseHeavy = body.split(/\s+/).length > 18 && !/[=Σ∑]/u.test(body);
          if (!looksFormulaLike || proseHeavy) return raw;

          const formulaBody = body
            .replace(/\*\*/g, '')
            .replace(/\bSigma\b/gi, '\\sum')
            .replace(/Σ/g, '\\sum ')
            .replace(/\bln\s*\(/g, '\\ln(')
            .replace(/\bpi\b/gi, '\\pi ')
            .replace(/\bmu\b/gi, '\\mu ')
            .replace(/\bsigma\b/gi, '\\sigma ')
            .trim();

          if (!formulaBody) return raw;
          return `${bulletPrefix}$$${normalizeDivisionsToFractions(formulaBody)}$$`;
        })
        .join('\n');
    };

    const refinedMarkdown = promoteFormulaLikeLines(polishedMarkdown)
      .split('\n')
      .map((line) => {
        const boldMarkerCount = line.match(/\*\*/g)?.length ?? 0;
        return boldMarkerCount % 2 === 1 ? line.replace(/\*\*/g, '') : line;
      })
      .join('\n')
      .replace(/(^|[\s([{])\*\*(?=\s|$|[.,;:!?])/g, '$1')
      .replace(/\*\*(?=\s|$)/g, '');

    const markdownComponents = {
      h1: ({ node, ...props }: any) => <h1 className="md-h1" {...props} />,
      h2: ({ node, ...props }: any) => <h2 className="md-h2" {...props} />,
      h3: ({ node, ...props }: any) => <h3 className="md-h3" {...props} />,
      h4: ({ node, ...props }: any) => <h4 className="md-h4" {...props} />,
      h5: ({ node, ...props }: any) => <h5 className="md-h5" {...props} />,
      h6: ({ node, ...props }: any) => <h6 className="md-h6" {...props} />,
      p: ({ node, ...props }: any) => <p className="md-paragraph" {...props} />,
      strong: ({ node, ...props }: any) => <strong className="md-bold" {...props} />,
      em: ({ node, ...props }: any) => <em className="md-italic" {...props} />,
      code: ({ node, inline, ...props }: any) =>
        inline ? (
          <code className="md-code" {...props} />
        ) : (
          <code className="md-code-block" {...props} />
        ),
      a: ({ node, ...props }: any) => <a className="md-link" {...props} />,
      ul: ({ node, ...props }: any) => <ul className="md-list" {...props} />,
      ol: ({ node, ...props }: any) => <ol className="md-list-ordered" {...props} />,
      li: ({ node, ...props }: any) => <li className="md-list-item" {...props} />,
      blockquote: ({ node, ...props }: any) => (
        <blockquote className="md-blockquote" {...props} />
      ),
      table: ({ node, ...props }: any) => (
        <table className="md-table" {...props} />
      ),
      math: ({ node, value }: any) => (
        <BlockMath math={value} errorColor="#d7e6f5" />
      ),
      inlineMath: ({ node, value }: any) => (
        <InlineMath math={value} errorColor="#d7e6f5" />
      ),
    };

    const hasBlockMath = /\$\$[\s\S]+?\$\$/.test(refinedMarkdown);
    if (hasBlockMath) {
      const nodes: ReactNode[] = [];
      const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let segmentIndex = 0;

      while ((match = blockMathRegex.exec(refinedMarkdown)) !== null) {
        const before = refinedMarkdown.slice(lastIndex, match.index).trim();
        if (before) {
          nodes.push(
            <ReactMarkdown
              key={`md-before-${segmentIndex}`}
              remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]}
              components={markdownComponents}
            >
              {before}
            </ReactMarkdown>
          );
          segmentIndex += 1;
        }

        const expr = match[1]?.trim();
        if (expr) {
          nodes.push(
            <div key={`math-${segmentIndex}`} className="md-math-block">
              <BlockMath math={expr} errorColor="#d7e6f5" />
            </div>
          );
          segmentIndex += 1;
        }

        lastIndex = match.index + match[0].length;
      }

      const tail = refinedMarkdown.slice(lastIndex).trim();
      if (tail) {
        nodes.push(
          <ReactMarkdown
            key={`md-tail-${segmentIndex}`}
            remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]}
            components={markdownComponents}
          >
            {tail}
          </ReactMarkdown>
        );
      }

      return <div className="markdown-content premium-markdown academic-paper">{nodes}</div>;
    }

    return (
      <div className="markdown-content premium-markdown academic-paper">
        <ReactMarkdown
          remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]}
          components={markdownComponents}
        >
          {refinedMarkdown}
        </ReactMarkdown>
      </div>
    );
  }

  function shouldEnableBubbleScroll(content: string) {
    const normalized = (content || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return false;
    const explicitLines = normalized.split('\n').filter((l) => l.trim().length > 0);
    const estimatedWrappedLines = explicitLines.reduce((acc, line) => {
      const length = line.trim().length;
      return acc + Math.max(1, Math.ceil(length / 72));
    }, 0);
    return estimatedWrappedLines > 2;
  }

  function isExternalCitation(citation: Extract<ChatItem, { type: 'citation' }>['citation']) {
    const raw = citation?.url;
    if (!raw || typeof raw !== 'string') return false;
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const host = parsed.hostname.toLowerCase();
      return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
    } catch {
      return false;
    }
  }

  function renderChatItem(
    it: ChatItem,
    i: number,
    attachedCitations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = []
  ) {
    if (it.type === 'upload') {
      return (
        <div key={i} className="agent-bubble user upload-bubble">
          <div className="agent-upload-list">
            {it.files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="agent-upload-item">
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.previewUrl} alt={file.name} className="agent-upload-thumb" />
                ) : (
                  <div className="agent-upload-fileicon" aria-hidden="true">📄</div>
                )}
                <span className="agent-upload-name">{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (it.type === 'message') {
      if (it.role === 'assistant') {
        const isFirstAssistantCard = !items.slice(0, i).some(
          (entry) => entry.type === 'message' && entry.role === 'assistant'
        );
        const isScrollable = shouldEnableBubbleScroll(it.content ?? '');
        const blocks = Array.isArray(it.agent_blocks) ? it.agent_blocks : [];
        const questionnaireBlocks = blocks.filter((b) => b.type === 'questionnaire');
        const technicalBlocks = blocks.filter((b) => b.type !== 'questionnaire');
        return (
          <div
            key={i}
            className={`agent-bubble assistant latex-doc ${isScrollable ? 'is-scrollable-bubble' : ''}${isFirstAssistantCard ? ' is-intro-doc' : ''}`}
          >
            <div className="latex-doc-head">
              <div className="latex-doc-heading">
                {isFirstAssistantCard ? (
                  <span className="latex-doc-kicker">Punto de partida</span>
                ) : null}
                <span className="latex-doc-title">
                  {isFirstAssistantCard ? 'Lectura inicial del caso' : 'Informe del agente'}
                </span>
                {isFirstAssistantCard ? (
                  <span className="latex-doc-subtitle">
                    Un resumen claro para ordenar la conversación y abrir el siguiente paso.
                  </span>
                ) : null}
              </div>
              <span className="latex-doc-mode">
                {(it.mode ?? agentMetaRef.current.mode ?? 'analysis').toString().replaceAll('_', ' ')}
              </span>
            </div>
            <div className={`latex-doc-body ${isScrollable ? 'is-scrollable-content' : ''}`}>
              {renderLatexLikeMessage(sanitizeMessageText(it.content ?? ''))}
              {questionnaireBlocks.length > 0 && (
                <div className="latex-inline-questionnaire">
                  <AgentBlocksRenderer
                    blocks={questionnaireBlocks}
                    onQuestionnaireSubmit={({ message }) => {
                      void onSend(message);
                    }}
                  />
                </div>
              )}
              {technicalBlocks.length > 0 && (
                <div className="latex-inline-annex">
                  <div className="latex-inline-annex-head">
                    <span>Anexos tecnicos</span>
                    <span>interactive</span>
                  </div>
                  <AgentBlocksRenderer
                    blocks={technicalBlocks}
                    onQuestionnaireSubmit={({ message }) => {
                      void onSend(message);
                    }}
                  />
                </div>
              )}
              {(() => {
                const externalCitations = attachedCitations.filter(isExternalCitation);
                if (externalCitations.length === 0) return null;
                const expanded = Boolean(expandedCitationsByMessage[i]);
                const visibleCitations = expanded ? externalCitations : externalCitations.slice(0, 3);
                const remaining = Math.max(0, externalCitations.length - visibleCitations.length);
                return (
                <div className="latex-inline-annex">
                  <div className="latex-inline-annex-head">
                    <span>Citas</span>
                    <span>{externalCitations.length}</span>
                  </div>
                  <div className="citation-stack">
                    {visibleCitations.map((citation, idx) => (
                      <CitationBubble key={`${i}-citation-${idx}`} citation={citation} />
                    ))}
                  </div>
                  {externalCitations.length > 3 && (
                    <button
                      type="button"
                      className="citation-toggle"
                      onClick={() =>
                        setExpandedCitationsByMessage((prev) => ({
                          ...prev,
                          [i]: !expanded,
                        }))
                      }
                    >
                      {expanded ? 'Ver menos' : `Ver todas${remaining > 0 ? ` (+${remaining})` : ''}`}
                    </button>
                  )}
                </div>
                );
              })()}
            </div>
          </div>
        );
      }
      const isScrollable = shouldEnableBubbleScroll(it.content);
      return (
        <div
          key={i}
          className={`agent-bubble ${it.role} ${isScrollable ? 'is-scrollable-bubble' : ''}`}
        >
          <div className="agent-bubble-text">{sanitizeMessageText(it.content ?? '')}</div>
        </div>
      );
    }
    if (it.type === 'artifact') {
      return (
        <div key={i} className="agent-bubble assistant artifact">
          <DocumentBubble
            artifact={it.artifact}
            onSaved={({ artifact, publicUrl, sourceRect }) => {
              void (async () => {
                let storedUrl = publicUrl;
                try {
                  if (artifact.type === 'pdf' && artifact.fileUrl) {
                    const saved = await savePdfArtifact(artifact);
                    if (saved?.publicUrl) storedUrl = saved.publicUrl;
                  }
                } catch {
                  // Non-blocking: keep UX flow with existing URL if persistent save fails.
                }

                const reportId = `${artifact.id}-${Date.now()}`;
                const report: SavedReport = {
                  id: reportId,
                  title: artifact.title,
                  group: classifyReportGroup(artifact.title, artifact.source),
                  fileUrl: storedUrl,
                  createdAt: new Date().toISOString(),
                };
                setSavedReports((prev) => [report, ...prev.filter((r) => r.fileUrl !== storedUrl)]);
                launchDocToLibraryAnimation(artifact.title, sourceRect, artifact.previewImageUrl ?? storedUrl, reportId);
              })();
            }}
          />
        </div>
      );
    }
    if (it.type === 'citation') {
      if (!isExternalCitation(it.citation)) return null;
      return (
        <div key={i} className="agent-bubble assistant citation">
          <CitationBubble citation={it.citation} />
        </div>
      );
    }
    return null;
  }

  const panelBaseCards: Array<{ key: string; node: ReactElement }> = [
    {
      key: 'profile',
      node: (
        <div className="mob-col mob-col-wide">
          <ProfileCard
            className={`panel-pos-profile glass-card${highlightedSection === 'profile' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="profile"
            userName={sessionInfo?.name ?? undefined}
            intake={sessionInfo?.injectedIntake}
            profile={
              sessionInfo?.injectedProfile
                ? { profile: sessionInfo.injectedProfile }
                : profile
            }
            injected={Boolean(sessionInfo?.injectedProfile)}
            actions={
              sessionInfo?.injectedProfile || sessionInfo?.injectedIntake ? (
                <>
                  {sessionInfo?.injectedIntake ? (
                    <button
                      className="continue-ghost profile-inline-action"
                      onClick={async () => {
                        await removeInjectedIntake();
                        window.location.reload();
                      }}
                    >
                      Remover intake inyectado
                    </button>
                  ) : null}
                  {sessionInfo?.injectedProfile ? (
                    <button
                      className="continue-ghost profile-inline-action"
                      onClick={async () => {
                        await removeInjectedProfile();
                        window.location.reload();
                      }}
                    >
                      Remover perfil inyectado
                    </button>
                  ) : null}
                </>
              ) : null
            }
          />
        </div>
      ),
    },
    {
      key: 'objective',
      node: (
        <div className="mob-col mob-col-wide">
          <PanelCard
            label="Objetivo activo"
            className={`panel-pos-objective panel-flow-gradient glass-card${highlightedSection === 'objective' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="objective"
            bgImage="/fondo8.PNG"
            overlayColor="154,148,148"
            overlayOpacity={0.18}
            bgScale={1.2}
            bgPosition="center"
          >
            {agentMetaRef.current.objective ??
              'Conversa para que el agente defina un objetivo de alto impacto.'}
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'mode',
      node: (
        <div className="mob-col">
          <PanelCard
            label="Modo cognitivo"
            value={agentMetaRef.current.mode ?? 'En calibracion'}
            className={`panel-pos-mode panel-mode-cognitive${highlightedSection === 'mode' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="mode"
            bgImage="/IMG_3611.JPG"
            overlayOpacity={0.28}
            bgScale={1}
            dataMode={agentMetaRef.current.mode ?? 'calibracion'}
          >
            <div className="panel-text">
              Contexto visual activo para lectura estratégica, foco y profundidad analítica.
            </div>
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'next',
      node: (
        <div className="mob-col">
          <PanelCard
            label="Siguiente desbloqueo"
            className="panel-pos-next panel-flow-gradient glass-card"
            bgImage="/fondo8.PNG"
            overlayColor="154,148,148"
            overlayOpacity={0.2}
            bgScale={1.1}
            bgPosition="40% 40%"
          >
            {nextMilestone
              ? `Te faltan ${Math.max(0, nextMilestone.threshold - knowledgeScore)} pts para desbloquear: ${nextMilestone.label}.`
              : 'Mapa completo. Ya tenemos una lectura avanzada de tu perfil.'}
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'continuity',
      node: (
        <div className="mob-col">
          <PanelCard
            label="Continuidad"
            value={`${engagementScore}% operativa`}
            className="panel-flow-gradient glass-card panel-pos-continuity"
            bgImage="/fondo8.PNG"
            overlayColor="154,148,148"
            overlayOpacity={0.2}
            bgScale={1.08}
          >
            <div className="panel-text">{continuityCard.headline}</div>
            <div className="panel-stack-list">
              {continuityCard.details.map((detail) => (
                <span key={detail} className="panel-stack-item">{detail}</span>
              ))}
            </div>
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'interview',
      node: (
        <div className="mob-col mob-col-wide">
          <button
            type="button"
            className="interview-flow-card panel-pos-interview glass-card"
            onClick={() => {
              const injectedIntake = sessionInfo?.injectedIntake?.intake;
              if (injectedIntake && typeof injectedIntake === 'object') {
                setInterviewIntake(injectedIntake as any);
              }
              router.push('/interview');
            }}
            title="Ir a entrevista y diagnóstico"
          >
            <span className="interview-flow-label">{interviewCard.badge}</span>
            <span className="interview-flow-title">{interviewCard.title}</span>
            <span className="interview-flow-meta">{interviewCard.meta}</span>
          </button>
        </div>
      ),
    },
    {
      key: 'budget',
      node: (
        <div className="mob-col">
          <button
            type="button"
            data-panel-section="budget"
            className={`panel-feature-card panel-pos-budget ${unlockedPanelBlocks.budgetUnlocked ? '' : 'is-locked'}${highlightedSection === 'budget' ? ' is-panel-highlighted' : ''}`}
            onClick={() => {
              if (!unlockedPanelBlocks.budgetUnlocked) return;
              setIsBudgetModalOpen(true);
            }}
            title={
              unlockedPanelBlocks.budgetUnlocked
                ? 'Abrir presupuesto inteligente'
                : 'Bloqueado: conversa sobre ingresos y gastos'
            }
          >
            <span className="panel-feature-label">Presupuesto</span>
            <span className="panel-feature-status">
              {unlockedPanelBlocks.budgetUnlocked ? 'Desbloqueado' : 'Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Diagnostico de analista financiero, editable por chat y manual.
            </span>
          </button>
        </div>
      ),
    },
    {
      key: 'transactions',
      node: (
        <div className="mob-col">
          <button
            type="button"
            data-panel-section="transactions"
            className={`panel-feature-card panel-pos-transactions ${unlockedPanelBlocks.transactionsUnlocked ? '' : 'is-locked'}${highlightedSection === 'transactions' ? ' is-panel-highlighted' : ''}`}
            onClick={() => {
              openTransactionsPanel();
            }}
            title={
              unlockedPanelBlocks.transactionsUnlocked
                ? 'Abrir transacciones y finanzas abiertas'
                : 'Bloqueado: conversa sobre cartolas y banco'
            }
          >
            <span className="panel-feature-label">Transacciones</span>
            <span className="panel-feature-status">
              {unlockedPanelBlocks.transactionsUnlocked ? 'Desbloqueado' : 'Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Cartolas, agrupación, patrones, alertas y lectura operativa de movimientos reales.
            </span>
          </button>
        </div>
      ),
    },
    {
      key: 'news',
      node: (
        <div className="mob-col mob-col-wide">
          <PanelCard
            className={`news-card panel-pos-news${highlightedSection === 'news' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="news"
          >
            <a
              href="https://fintualist.com/chile/"
              target="_blank"
              rel="noreferrer"
              className="news-link"
            >
              <div className="news-image">
                <div className="news-overlay">
                  <span className="news-kicker">Radar de mercado</span>
                  <span className="news-title">Noticias y contexto Chile</span>
                  <span className="news-subtitle">
                    Señales macro, tasas y conversación financiera para decidir mejor.
                  </span>
                </div>
              </div>
            </a>
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'library',
      node: (
        <div className="mob-col mob-col-wide">
          <PanelCard
            label="Biblioteca de documentos"
            className={`panel-pos-library panel-flow-gradient${highlightedSection === 'library' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="library"
            bgImage="/fondo8.PNG"
            overlayColor="154,148,148"
            overlayOpacity={0.24}
            bgScale={1.08}
          >
            <div className="reports-grid">
              <div className="report-group">
                <span className="report-group-title">Plan de accion</span>
                <span className="report-group-count">{reportsByGroup.plan_action.length}</span>
              </div>
              <div className="report-group">
                <span className="report-group-title">Simulacion</span>
                <span className="report-group-count">{reportsByGroup.simulation.length}</span>
              </div>
              <div className="report-group">
                <span className="report-group-title">Presupuesto</span>
                <span className="report-group-count">{reportsByGroup.budget.length}</span>
              </div>
              <div className="report-group">
                <span className="report-group-title">Diagnostico</span>
                <span className="report-group-count">{reportsByGroup.diagnosis.length}</span>
              </div>
            </div>
            <div className="report-list">
              {savedReports.length === 0 && (
                <span className="report-empty">Guarda PDFs desde el chat para agruparlos aqui.</span>
              )}
              {savedReports.slice(0, 6).map((report) => (
                <a
                  key={report.id}
                  href={resolveDocumentUrl(report.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="report-item"
                >
                  <span>{report.title}</span>
                  <span className="report-tag">{report.group}</span>
                </a>
              ))}
            </div>
          </PanelCard>
        </div>
      ),
    },
    {
      key: 'recents',
      node: (
        <div className="mob-col mob-col-wide">
          <div
            ref={recentLibraryRef}
            data-panel-section="recents"
            className={`recent-library-card panel-pos-recent${isLandingRecents ? ' is-landing' : ''}${highlightedSection === 'recents' ? ' is-panel-highlighted' : ''}`}
          >
            <div className="recent-library-head">
              <span className="recent-library-title">Documentos recientes</span>
              <span className="recent-library-count">{recentReports.length}</span>
            </div>
            <div className="recent-library-grid">
              {recentReports.length === 0 && (
                <span className="recent-empty">Aqui llegan los PDFs guardados desde el chat.</span>
              )}
              {recentReports.map((report, idx) => (
                <a
                  key={report.id}
                  href={resolveDocumentUrl(report.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className={`recent-item${report.id === newReportId ? ' is-new' : ''}`}
                  style={
                    (() => {
                      const offset = docVisualOffset(report.id, idx);
                      return {
                        ['--doc-rot' as any]: `${offset.rotation}deg`,
                        ['--doc-y' as any]: `${offset.yShift}px`,
                      } as React.CSSProperties;
                    })()
                  }
                >
                  <div className="recent-item-preview-wrap">
                    <embed
                      src={`${resolveDocumentUrl(report.fileUrl)}#page=1&view=FitH&zoom=55`}
                      type="application/pdf"
                      className="recent-item-preview"
                    />
                  </div>
                  <span className="recent-item-name">{report.title}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ];

  const panelRenderedCards = panelBaseCards.map((card) =>
    React.cloneElement(card.node, {
      key: `real-${card.key}`,
    })
  );

  return (
    <main
      className={`agent-layout ${
        isRailMorphing ? 'is-mode-12-morphing' : ''
      } ${
        !isMonochrome ? 'is-normal-matte' : ''
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
        <header className="agent-chat-header">
          <div className="agent-chat-controls-row">
            <div className="chat-switcher" aria-label="Selector de chats">
              {chatThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`chat-sheet-tab${thread.id === activeChatId ? ' is-active' : ''}${thread.status === 'context' ? ' is-context' : ''}`}
                  onClick={() => setActiveChatId(thread.id)}
                  title={thread.status === 'context' ? `Contexto: ${thread.name}` : `Chat ${thread.label}: ${thread.name}`}
                >
                  {thread.status === 'context' ? '◆' : ''}
                </button>
              ))}
              {/* No manual new-sheet button — sheets are fixed to 3 + optional meta sheet */}
            </div>
            <span className="mobile-brand-inline" aria-hidden="true">
              Financiera mente
            </span>
            <button
              type="button"
              className="mobile-progress-pill"
              onClick={() => setKnowledgePopupOpen((v) => !v)}
              aria-label={`Conocimiento ${knowledgeScore}%`}
              title="Ver progreso del conocimiento"
            >
              <span className="mobile-progress-pill-value">{knowledgeScore}%</span>
              <span className="mobile-progress-pill-track">
                <span className="mobile-progress-pill-fill" style={{ width: `${knowledgeScore}%` }} />
              </span>
            </button>
            {/* Context score progress bar */}
            {activeThread && activeThread.contextScore > 0 && (
              <div className="sheet-context-bar" title={`Contexto: ${activeThread.contextScore}%`}>
                <div className="sheet-context-fill" style={{ width: `${activeThread.contextScore}%` }} />
                <span className="sheet-context-label">{activeThread.contextScore}% contexto</span>
                {activeThread.contextScore >= 80 && (
                  <span className="sheet-context-badge">Rico</span>
                )}
              </div>
            )}
            <div className="header-toggle-group">
              <button
                type="button"
                className="layout-mode-toggle monochrome-toggle"
                onClick={() => setIsMonochrome((v) => !v)}
                title={
                  isMonochrome
                    ? 'Desactivar modo blanco y negro'
                    : 'Activar modo blanco y negro'
                }
                aria-label={
                  isMonochrome
                    ? 'Desactivar modo blanco y negro'
                    : 'Activar modo blanco y negro'
                }
              >
                B/N
              </button>
            </div>
          </div>
          <h1>Financiera mente</h1>
          <p className="muted">
            Proyecto de tesis en finanzas abiertas. Entorno seguro y privado para analisis financiero.
          </p>
          <div className="chat-meta-row">
            <span className="chat-id-badge">Chat {activeThread?.label}</span>
            <input
              value={activeThread?.name ?? ''}
              onChange={(e) => setNameForActive(e.target.value)}
              className="chat-name-input"
              placeholder="Nombre del chat"
              aria-label="Nombre del chat activo"
            />
            <button
              type="button"
              className="chat-delete-btn"
              onClick={() => deleteThreadById(activeChatId)}
              title="Eliminar chat activo"
              aria-label="Eliminar chat activo"
            >
              Eliminar
            </button>
          </div>
        </header>

        {knowledgePopupOpen && (
          <div className="mobile-knowledge-popover" role="dialog" aria-label="Mapa de conocimiento mobile">
            <div
              className="knowledge-popup-backdrop mobile-knowledge-backdrop"
              onClick={() => setKnowledgePopupOpen(false)}
            />
            <div className="knowledge-popup mobile-knowledge-sheet">
              <div className="knowledge-popup-header">
                <div className="knowledge-popup-score">
                  <span className="knowledge-popup-pct">{knowledgeScore}%</span>
                  <span className="knowledge-popup-stage">{knowledgeStage}</span>
                  <div className="knowledge-popup-bar">
                    <div
                      className="knowledge-popup-bar-fill"
                      style={{ width: `${knowledgeScore}%` }}
                    />
                  </div>
                </div>
                <span className="knowledge-popup-meta">
                  {completedMilestones}/{milestones.length}<br />hitos
                </span>
              </div>
              <p className="panel-inline-hint">{coachHint}</p>
              <div className="knowledge-popup-milestones">
                {milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`knowledge-popup-milestone ${milestone.done ? 'is-done' : ''}`}
                  >
                    <div className="knowledge-popup-check">
                      <svg className="knowledge-popup-check-icon" viewBox="0 0 10 8">
                        <polyline points="1,4 4,7 9,1" />
                      </svg>
                    </div>
                    <span className="knowledge-popup-milestone-text">
                      {milestone.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="agent-chat-body">
          <div ref={chatThreadRef} className="agent-thread">
            {(() => {
              const rendered: ReactNode[] = [];
              for (let idx = 0; idx < items.length; idx += 1) {
                const it = items[idx];
                if (it.type === 'message' && it.role === 'assistant') {
                  const citations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = [];
                  let j = idx + 1;
                  while (j < items.length && items[j].type === 'citation') {
                    citations.push((items[j] as Extract<ChatItem, { type: 'citation' }>).citation);
                    j += 1;
                  }
                  rendered.push(renderChatItem(it, idx, citations));
                  idx = j - 1;
                  continue;
                }
                if (it.type === 'citation') {
                  const prev = idx > 0 ? items[idx - 1] : null;
                  const groupedWithPrevious =
                    prev && prev.type === 'message' && prev.role === 'assistant';
                  if (groupedWithPrevious) {
                    // Citations are rendered below the previous assistant message when grouped.
                    continue;
                  }
                  rendered.push(renderChatItem(it, idx));
                  continue;
                }
                rendered.push(renderChatItem(it, idx));
              }
              return rendered;
            })()}

            {!loading && (() => {
              const firstAssistant = items.find(
                (it) => it.type === 'message' && it.role === 'assistant'
              ) as Extract<(typeof items)[number], { type: 'message'; role: 'assistant' }> | undefined;
              const userMessagesCount = items.filter(
                (it) => it.type === 'message' && it.role === 'user'
              ).length;
              const assistantMessagesCount = items.filter(
                (it) => it.type === 'message' && it.role === 'assistant'
              ).length;
              const shouldShowOnlyInitialSuggestions =
                userMessagesCount === 0 && assistantMessagesCount === 1;
              if (!shouldShowOnlyInitialSuggestions) return null;

              const replies = [
                ...(firstAssistant?.suggested_replies ?? []),
                ...buildInitialAgentSuggestions(sessionInfo?.injectedIntake),
              ];
              const uniqueReplies = Array.from(new Set(replies)).slice(0, 12);
              if (uniqueReplies.length < 8) return null;
              return (
                <div className="suggested-replies">
                  {uniqueReplies.map((reply, i) => (
                    <button
                      key={`${reply}-${i}`}
                      type="button"
                      className="suggestion-chip"
                      onClick={() => {
                        setDraftForActive(reply);
                        setTimeout(() => onSend(), 80);
                      }}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              );
            })()}

            {loading && (
              <div className="agent-bubble assistant thinking-bubble" aria-live="polite" aria-label="El agente está escribiendo">
                <div className="typing-indicator" aria-hidden="true">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
              </div>
            )}
          </div>

          <div className={`agent-input${isRealtimeOpen ? ' is-realtime' : ''}`}>
            {isRealtimeOpen ? (
              <>
                {/* Modo voz inline — reemplaza el textarea */}
                <div className="realtime-inline">
                  <div className="realtime-inline-row">
                    <div className={`voice-status-dot${realtimeListening ? ' is-listening' : realtimeSpeaking ? ' is-speaking' : ''}`} />
                    <span className="realtime-inline-status">
                      {realtimeListening ? 'Escuchando...' : realtimeSpeaking ? 'Respondiendo...' : 'Listo para hablar'}
                    </span>
                    <button
                      type="button"
                      className={`voice-mic-btn${realtimeListening ? ' is-active' : ''}`}
                      onClick={startRealtimeListen}
                      aria-label={realtimeListening ? 'Detener' : 'Hablar'}
                    >
                      <div className="voice-mic-ring" />
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {realtimeListening ? (
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        ) : (
                          <>
                            <path d="M12 1a3 3 0 0 1 3 3v8a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </>
                        )}
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="realtime-inline-close"
                      onClick={closeRealtimeMode}
                      aria-label="Cerrar modo voz"
                    >
                      ✕
                    </button>
                  </div>
                  {/* Waveform */}
                  <div className={`voice-waveform${realtimeListening ? ' is-listening' : ''}${realtimeSpeaking ? ' is-speaking' : ''}`} aria-hidden="true">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="voice-waveform-bar" />
                    ))}
                  </div>
                  {/* Transcript en vivo */}
                  {realtimeListening && realtimeTranscript && (
                    <div className="realtime-inline-transcript">{realtimeTranscript}</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <textarea
                  placeholder="Escribe tu mensaje..."
                  value={input}
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
                    onClick={() => chatUploadInputRef.current?.click()}
                    title="Adjuntar imagen, PDF o Excel"
                  >
                    Adjuntar archivo
                  </button>

                  <button
                    type="button"
                    className="continue-button realtime-btn"
                    onClick={openRealtimeMode}
                    title="Abrir modo conversación en tiempo real"
                  >
                    Hablar en tiempo real
                  </button>

                  <div style={{ flex: 1 }} />

                  <button
                    type="button"
                    className="continue-button"
                    onClick={() => {
                      void onSend();
                    }}
                  >
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <aside
        className="agent-divider-rail"
        aria-label="Progreso del conocimiento del usuario"
      >
        {/* Compact circular progress button */}
        {/* Full-height interactive rail card */}
        <button
          type="button"
          className={`knowledge-rail-card ${progressPulse ? 'is-level-up' : ''}`}
          onClick={() => setKnowledgePopupOpen((v) => !v)}
          aria-label={`Conocimiento ${knowledgeScore}% — ver hitos`}
          title="Ver mapa de conocimiento"
          style={{ '--rail-glow-h': `${knowledgeScore}%` } as React.CSSProperties}
        >
          {/* Rotated label */}
          <span className="knowledge-rail-label">Conoc.</span>

          {/* Vertical progress track with milestone dots */}
          <div className="knowledge-rail-track-wrap">
            <div className="knowledge-rail-track">
              <div
                className="knowledge-rail-fill"
                style={{ height: `${knowledgeScore}%` }}
              />
              {milestones.map((m, i) => {
                const isNext = !m.done && milestones.slice(0, i).every((prev) => prev.done);
                return (
                  <div
                    key={m.id}
                    className={`knowledge-rail-dot${m.done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}
                    style={{
                      bottom: `${(i / Math.max(milestones.length - 1, 1)) * 100}%`,
                    }}
                    title={m.label}
                  />
                );
              })}
            </div>
          </div>

          {/* Score */}
          <div className="knowledge-rail-score">
            <span className="knowledge-rail-value">{knowledgeScore}%</span>
            <span className="knowledge-rail-stage">{knowledgeStage}</span>
          </div>

          {/* Milestones count */}
          <span className="knowledge-rail-meta">
            {completedMilestones}/{milestones.length}
          </span>

          {/* Click hint */}
          <span className="knowledge-rail-cta">hitos</span>

          {/* Level-up toast */}
          {levelUpText && (
            <span className="knowledge-level-up" role="status">
              {levelUpText}
            </span>
          )}
        </button>

        {/* Floating popup */}
        {knowledgePopupOpen && (
          <>
            <div
              className="knowledge-popup-backdrop"
              onClick={() => setKnowledgePopupOpen(false)}
            />
            <div className="knowledge-popup" role="dialog" aria-label="Mapa de conocimiento">
            <div className="knowledge-popup-header">
                <div className="knowledge-popup-score">
                  <span className="knowledge-popup-pct">{knowledgeScore}%</span>
                  <span className="knowledge-popup-stage">{knowledgeStage}</span>
                  <div className="knowledge-popup-bar">
                    <div
                      className="knowledge-popup-bar-fill"
                      style={{ width: `${knowledgeScore}%` }}
                    />
                  </div>
                </div>
                <span className="knowledge-popup-meta">
                  {completedMilestones}/{milestones.length}<br />hitos
                </span>
              </div>
              <p className="panel-inline-hint">{coachHint}</p>
              <div className="knowledge-popup-milestones">
                {milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`knowledge-popup-milestone ${milestone.done ? 'is-done' : ''}`}
                  >
                    <div className="knowledge-popup-check">
                      <svg className="knowledge-popup-check-icon" viewBox="0 0 10 8">
                        <polyline points="1,4 4,7 9,1" />
                      </svg>
                    </div>
                    <span className="knowledge-popup-milestone-text">
                      {milestone.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Mobile subtitle — visible only on mobile via CSS */}
        <div className="mobile-rail-subtitle">
          <span className="mobile-rail-subtitle-title">
            {sessionInfo?.name?.split(' ')[0] ?? 'Financieramente'}
          </span>
          <span className="mobile-rail-subtitle-badge">{knowledgeStage}</span>
          {sessionInfo?.injectedIntake && (
            <span className="mobile-rail-subtitle-memory">● perfil activo</span>
          )}
        </div>
      </aside>

      <aside className="agent-panel" ref={panelScrollRef as React.RefObject<HTMLElement>}>
        {/* Mobile: always-visible strip handle + expand toggle */}
        <div
          ref={mobilePanelHandleRef}
          className="mobile-panel-handle"
          onClick={() => { haptic(12); setMobilePanelExpanded((v) => !v); }}
          role="button"
          tabIndex={0}
          aria-label={mobilePanelExpanded ? 'Minimizar panel' : 'Expandir panel'}
        >
          <span className="mobile-panel-handle-title">⊞ Panel</span>
          <svg
            className={`mobile-panel-chevron${mobilePanelExpanded ? ' rotated' : ''}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            aria-hidden="true"
          >
            <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {/* Desktop: close button (hidden on mobile) */}
        <div className="mobile-panel-close">
          <button
            type="button"
            className="mobile-panel-close-btn"
            onClick={() => setMobileTab('chat')}
            aria-label="Volver al chat"
          >
            ← Chat
          </button>
          <span className="mobile-panel-close-title">Panel</span>
        </div>
        {/* Panel callout — mensaje del agente señalando una sección */}
        {panelCallout && (
          <div className={`panel-callout panel-callout-${panelCallout.section}`}>
            <div className="panel-callout-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="10" cy="10" r="8" />
                <path d="M10 6v4l2.5 2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="panel-callout-content">
              <span className="panel-callout-tag">Agente</span>
              <p className="panel-callout-msg">{panelCallout.message}</p>
            </div>
            <button
              type="button"
              className="panel-callout-close"
              onClick={() => setPanelCallout(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
            <div className="panel-callout-progress" />
          </div>
        )}

        <div
          ref={panelGridRef}
          className="panel-grid"
        >
          {panelRenderedCards}
        </div>
      </aside>

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

      {isBudgetModalOpen && (
        <div className="agent-modal-overlay" onClick={() => setIsBudgetModalOpen(false)}>
          <div className="agent-modal budget-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agent-modal-header">
              <h3>Budget Studio</h3>
              <button type="button" className="agent-modal-close" onClick={() => setIsBudgetModalOpen(false)}>
                ×
              </button>
            </div>
            <p className="agent-modal-intro">
              Flujo optimizado para ajustar ingresos/gastos y disparar un diagnóstico corto, accionable y estable.
            </p>

            <div className="budget-kpi-grid">
              <div className="budget-kpi-card">
                <span className="budget-kpi-label">Ingreso mensual</span>
                <strong>${Math.round(budgetTotals.income).toLocaleString('es-CL')}</strong>
              </div>
              <div className="budget-kpi-card">
                <span className="budget-kpi-label">Gasto mensual</span>
                <strong>${Math.round(budgetTotals.expenses).toLocaleString('es-CL')}</strong>
              </div>
              <div className="budget-kpi-card">
                <span className="budget-kpi-label">Ahorro estimado</span>
                <strong>{Math.round(budgetInsights.savingsRate)}%</strong>
              </div>
              <div className="budget-kpi-card">
                <span className="budget-kpi-label">Health score</span>
                <strong>{budgetInsights.healthScore}/100</strong>
              </div>
            </div>

            <div className="budget-health">
              <div className="budget-health-head">
                <span>Salud financiera actual</span>
                <span>{budgetInsights.healthScore}/100</span>
              </div>
              <div className="budget-health-track">
                <div
                  className="budget-health-fill"
                  style={{ width: `${budgetInsights.healthScore}%` }}
                />
              </div>
              <div className="budget-health-legend">
                <span>Fijos: ${Math.round(budgetInsights.fixedTotal).toLocaleString('es-CL')}</span>
                <span>Variables: ${Math.round(budgetInsights.variableTotal).toLocaleString('es-CL')}</span>
              </div>
            </div>

            {budgetInsights.topExpenses.length > 0 && (
              <div className="budget-top-expenses">
                <span className="budget-top-title">Top gastos</span>
                {budgetInsights.topExpenses.map((row) => (
                  <div key={row.id} className="budget-top-row">
                    <div className="budget-top-meta">
                      <span>{row.label}</span>
                      <span>${Math.round(row.amount).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="budget-top-track">
                      <div className="budget-top-fill" style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="budget-table-wrap">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Tipo</th>
                    <th>Monto mensual</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={row.category}
                          onChange={(e) =>
                            updateBudgetRow(row.id, 'category', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={row.type}
                          onChange={(e) =>
                            updateBudgetRow(
                              row.id,
                              'type',
                              e.target.value as 'income' | 'expense'
                            )
                          }
                        >
                          <option value="income">Ingreso</option>
                          <option value="expense">Gasto</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.amount}
                          onChange={(e) =>
                            updateBudgetRow(row.id, 'amount', Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.note}
                          onChange={(e) =>
                            updateBudgetRow(row.id, 'note', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="budget-summary">
              <span>Filas activas: {budgetInsights.nonZeroRows.length}</span>
              <span>Coach hint: {coachHint}</span>
              <span className={budgetTotals.balance >= 0 ? 'is-positive' : 'is-negative'}>
                Balance: ${budgetTotals.balance.toLocaleString('es-CL')}
              </span>
            </div>

            <div className="agent-modal-actions">
              <button type="button" className="continue-ghost" onClick={() => addBudgetRow('income')}>
                + Ingreso
              </button>
              <button type="button" className="continue-ghost" onClick={() => addBudgetRow('expense')}>
                + Gasto
              </button>
              <button type="button" className="button-primary" onClick={sendBudgetToAgent}>
                Generar diagnóstico pro
              </button>
            </div>
          </div>
        </div>
      )}

      {isTransactionsModalOpen && (
        <div className="agent-modal-overlay" onClick={() => setIsTransactionsModalOpen(false)}>
          <div className="agent-modal transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="agent-modal-header">
              <h3>Panel de productos transaccionales</h3>
              <button type="button" className="agent-modal-close" onClick={() => setIsTransactionsModalOpen(false)}>
                ×
              </button>
            </div>
            {txWizardStep !== 'products' && (
              <p className="agent-modal-intro">
                Flujo mensual ejecutivo para simulación de productos bancarios, lectura de cartolas y análisis inteligente. No ingreses credenciales ni contraseñas reales.
              </p>
            )}

            {txWizardStep !== 'products' && (
              <div className="transactions-intelligence">
                <div className="transactions-stat-card">
                  <span className="transactions-stat-label">Productos</span>
                  <strong>{bankSimulation.products.length}</strong>
                </div>
                <div className="transactions-stat-card">
                  <span className="transactions-stat-label">Documentos</span>
                  <strong>{transactionIntel.docs}</strong>
                </div>
                <div className="transactions-stat-card">
                  <span className="transactions-stat-label">Montos detectados</span>
                  <strong>{transactionIntel.amounts.length}</strong>
                </div>
                <div className="transactions-stat-card">
                  <span className="transactions-stat-label">Estado</span>
                  <strong>
                    {isTransactionsLockedThisMonth
                      ? 'Ciclo enviado'
                      : activeBankProduct?.connected
                      ? 'Conectado'
                      : 'Pendiente'}
                  </strong>
                </div>
              </div>
            )}

            {txWizardStep === 'products' && (
              <>
                <div className="transactions-products-column">
                  {transactionProductCards.map(({ product, descriptor, intel }) => (
                    <article
                      key={product.id}
                      className={`transactions-product-card${
                        bankSimulation.activeProductId === product.id ? ' is-active' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="transactions-product-main"
                        onClick={() => selectTransactionProduct(product.id)}
                      >
                        <span className="transactions-product-eyebrow">{product.label}</span>
                        <strong>{descriptor.title}</strong>
                        <p>{descriptor.description}</p>
                        <div className="transactions-keywords">
                          <span className="transactions-keyword-pill">
                            {product.connected ? 'Conectado (simulado)' : 'Pendiente conexión'}
                          </span>
                          <span className="transactions-keyword-pill">
                            {intel.docs > 0 ? `${intel.docs} cartola(s)` : 'Sin cartola'}
                          </span>
                          <span className="transactions-keyword-pill">
                            {intel.amounts.length > 0 ? `${intel.amounts.length} movimientos` : 'Sin movimientos'}
                          </span>
                        </div>
                        <div className="transactions-product-insights">
                          {descriptor.insights.map((insight, idx) => (
                            <span key={`${product.id}-insight-${idx}`}>{insight}</span>
                          ))}
                        </div>
                      </button>
                      <div className="transactions-product-actions">
                        <button
                          type="button"
                          className="continue-ghost"
                          onClick={() => selectTransactionProduct(product.id)}
                        >
                          Abrir producto
                        </button>
                        <button
                          type="button"
                          className="continue-ghost danger"
                          onClick={() => deleteTransactionProduct(product.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}

                  <button
                    type="button"
                    className="transactions-product-card add-card"
                    onClick={addTransactionProduct}
                  >
                    <span className="transactions-product-eyebrow">Nuevo producto</span>
                    <strong>Agregar producto</strong>
                    <p>
                      Selecciona banco, usa credenciales simuladas y sube cartola en imagen/PDF para análisis
                      automático.
                    </p>
                  </button>
                </div>
                {transactionProductCards.length === 0 && (
                  <div className="transactions-summary-card">
                    <span className="transactions-summary-title">Sin productos</span>
                    <p>
                      Empieza agregando un producto. Luego el sistema identificará institución, tipo de producto e
                      insights desde la cartola.
                    </p>
                  </div>
                )}
              </>
            )}

            {txWizardStep === 'credentials' && activeBankProduct && (
              <>
                <div className="transactions-summary-card">
                  <span className="transactions-summary-title">Paso 1 · Banco y credenciales simuladas</span>
                  <p>
                    Simulación de conexión: usa datos ficticios. Nunca ingreses usuario, contraseña o claves reales.
                  </p>
                </div>
                <div className="bank-sim-grid">
                  <label>
                    Nombre del producto
                    <input
                      value={activeBankProduct.label}
                      onChange={(e) => updateActiveProduct({ label: e.target.value, connected: false })}
                    />
                  </label>
                  <label>
                    Banco (simulado)
                    <select
                      value={activeBankProduct.bank}
                      onChange={(e) =>
                        updateActiveProduct({
                          bank: e.target.value,
                          connected: false,
                          randomMode: false,
                        })
                      }
                    >
                      <option value="">Selecciona un banco</option>
                      <option value="Banco de Chile (simulación)">Banco de Chile</option>
                      <option value="Santander (simulación)">Santander</option>
                      <option value="BCI (simulación)">BCI</option>
                      <option value="Scotiabank (simulación)">Scotiabank</option>
                      <option value="BancoEstado (simulación)">BancoEstado</option>
                    </select>
                  </label>
                  <label>
                    Usuario demo
                    <input
                      value={activeBankProduct.username}
                      onChange={(e) =>
                        updateActiveProduct({
                          username: e.target.value,
                          connected: false,
                          randomMode: false,
                        })
                      }
                    />
                  </label>
                  <label>
                    Password demo
                    <input
                      type="password"
                      value={activeBankProduct.password}
                      onChange={(e) =>
                        updateActiveProduct({
                          password: e.target.value,
                          connected: false,
                          randomMode: false,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="bank-sim-status">
                  Estado:{' '}
                  <strong>
                    {activeBankProduct.connected
                      ? `conectado (simulado${activeBankProduct.randomMode ? ' aleatorio' : ''})`
                      : 'desconectado'}
                  </strong>
                </div>
                <div className="agent-modal-actions">
                  <button type="button" className="continue-ghost" onClick={() => setTxWizardStep('products')}>
                    Volver a productos
                  </button>
                  <button type="button" className="continue-ghost" onClick={() => simulateBankLogin(true)}>
                    Credenciales aleatorias
                  </button>
                  <button type="button" className="button-primary" onClick={() => simulateBankLogin(false)}>
                    Continuar a carga
                  </button>
                </div>
              </>
            )}

            {txWizardStep === 'upload' && activeBankProduct && (
              <>
                <div className="transactions-summary-card">
                  <span className="transactions-summary-title">Paso 2 · Cargar cartola del mes</span>
                  <p>
                    Sube cartola o archivo de movimientos. Un agente especializado de bajo costo procesará el mes y
                    te devolverá dashboard y hallazgos.
                  </p>
                </div>
                <div className="upload-zone">
                  <label className="upload-label">
                    Subir cartola o evidencia (imagen/PDF/Excel)
                    <input
                      type="file"
                      accept=".pdf,.xls,.xlsx,.csv,image/*"
                      multiple
                      onChange={(e) => onUploadStatement(e.target.files)}
                    />
                  </label>
                  <div className="upload-files">
                    {documentsLoading && <span>Extrayendo texto y estructura de tus documentos…</span>}
                    {activeBankProduct.uploadedFiles.length === 0 && <span>Aun no hay cartolas cargadas.</span>}
                    {activeBankProduct.uploadedFiles.map((name, idx) => (
                      <span key={`${name}-${idx}`} className="upload-file-pill">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="agent-modal-actions">
                  <button type="button" className="continue-ghost" onClick={() => setTxWizardStep('credentials')}>
                    Volver a credenciales
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={documentsLoading || activeBankProduct.parsedDocuments.length === 0}
                    onClick={() => setTxWizardStep('dashboard')}
                  >
                    Ver dashboard
                  </button>
                </div>
              </>
            )}

            {txWizardStep === 'dashboard' && activeBankProduct && (
              <>
                <div className="transactions-summary-card">
                  <span className="transactions-summary-title">Paso 3 · Dashboard mensual</span>
                  <p>{transactionIntel.summary}</p>
                  {transactionIntel.topKeywords.length > 0 ? (
                    <div className="transactions-keywords">
                      {transactionIntel.topKeywords.map((item) => (
                        <span key={item.label} className="transactions-keyword-pill">
                          {item.label} · {item.count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="transactions-intelligence">
                  <div className="transactions-stat-card">
                    <span className="transactions-stat-label">Promedio</span>
                    <strong>
                      {transactionIntel.averageDetected > 0
                        ? `$${Math.round(transactionIntel.averageDetected).toLocaleString('es-CL')}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="transactions-stat-card">
                    <span className="transactions-stat-label">Mayor monto</span>
                    <strong>
                      {transactionIntel.maxDetected > 0
                        ? `$${Math.round(transactionIntel.maxDetected).toLocaleString('es-CL')}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="transactions-stat-card">
                    <span className="transactions-stat-label">Total detectado</span>
                    <strong>
                      {transactionIntel.totalDetected > 0
                        ? `$${Math.round(transactionIntel.totalDetected).toLocaleString('es-CL')}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="transactions-stat-card">
                    <span className="transactions-stat-label">Filas leídas</span>
                    <strong>{transactionIntel.rows.toLocaleString('es-CL')}</strong>
                  </div>
                </div>
                <div className="agent-modal-actions">
                  <button type="button" className="continue-ghost" onClick={() => setTxWizardStep('products')}>
                    Volver a productos
                  </button>
                  <button type="button" className="continue-ghost" onClick={() => setTxWizardStep('upload')}>
                    Cargar más archivos
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={sendTransactionsToAgent}
                    disabled={documentsLoading || activeBankProduct.parsedDocuments.length === 0}
                  >
                    Enviar a Financiera mente
                  </button>
                </div>
              </>
            )}

            {txWizardStep === 'locked' && (
              <>
                <div className="transactions-summary-card">
                  <span className="transactions-summary-title">Ciclo mensual enviado</span>
                  <p>
                    Este mes ya fue enviado a Financiera mente. Solo puedes volver al panel o ir al chat. El flujo se
                    reabre automáticamente en el próximo mes para subir cartolas del mes anterior.
                  </p>
                </div>
                <div className="agent-modal-actions">
                  <button type="button" className="continue-ghost" onClick={() => setIsTransactionsModalOpen(false)}>
                    Volver atrás
                  </button>
                  <button type="button" className="button-primary" onClick={() => setIsTransactionsModalOpen(false)}>
                    Ir al chat
                  </button>
                </div>
              </>
            )}

            {!activeBankProduct && txWizardStep !== 'products' && txWizardStep !== 'locked' && (
              <div className="transactions-summary-card">
                <span className="transactions-summary-title">Selecciona un producto</span>
                <p>
                  Primero agrega o selecciona un producto para continuar con el flujo de simulación y análisis.
                </p>
                <div className="agent-modal-actions">
                  <button type="button" className="button-primary" onClick={() => setTxWizardStep('products')}>
                    Ir a productos
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
