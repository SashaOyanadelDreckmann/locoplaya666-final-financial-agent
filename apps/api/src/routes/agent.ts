import { Router } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { runCoreAgent } from '../agents/core.agent/core-agent-orchestrator';
import { ChatAgentInputSchema } from '../agents/core.agent/chat.types';
import {
  attachProfileToUser,
  removeInjectedProfileFromUser,
  attachIntakeToUser,
  removeInjectedIntakeFromUser,
  saveUserSheets,
  loadUserSheets,
  loadUserPanelState,
  saveUserPanelState,
  saveUserMemoryBlob,
} from '../services/user.service';
import { complete, completeWithClaude } from '../services/llm.service';
import {
  appendTurnToMemoryRealtime,
  buildAgentMemoryContextRealtime,
} from '../services/memory.service';
import {
  applyLifecycleAfterResponse,
  buildLifecycleDecision,
  getLifecycleFromMemory,
  lifecycleMeta,
} from '../services/product-lifecycle.service';
import {
  ingestGeneratedReportDocument,
  reportSpecToSearchableText,
  searchUserDocumentContext,
} from '../services/document-intelligence.service';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requirePermission } from '../middleware/auth';
import { badRequest, forbidden, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { hasPermission, PERMISSIONS, type UserRole } from '../auth/rbac';
import {
  generateProfessionalReportPdf,
  type ProfessionalPdfInput,
} from '../services/reports/professionalPdf.service';
import { listAdminUsersFullDump } from '../services/admin.service';
import { getConfig } from '../config';
import { fetchIndicador } from '../mcp/tools/market/mindicadorClient';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
  INTERVIEW_REALTIME_VOICES,
  INTERVIEW_REALTIME_VOICE_DEFAULT,
  INTERVIEW_REALTIME_VOICE_SPEED,
} from '@financial-agent/shared';

const router = Router();
const config = getConfig();
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-mini';
const OPENAI_REALTIME_VOICE = (() => {
  const requested = process.env.OPENAI_REALTIME_VOICE?.trim().toLowerCase();
  if (requested && (INTERVIEW_REALTIME_VOICES as readonly string[]).includes(requested)) {
    return requested;
  }
  return INTERVIEW_REALTIME_VOICE_DEFAULT;
})();

function shouldAttachLiveMarketContext(params: { userMessage: string; activeChatId?: unknown }) {
  const userMessage = String(params.userMessage ?? '').toLowerCase();
  const activeChatId = String(params.activeChatId ?? 'chat-1');
  if (activeChatId === 'chat-2') return true;
  return /\b(apv|inversion|invertir|fondo|etf|acciones|banco|institucion|tasa|mercado|uf|tpm|dolar|credito|hipotec)/.test(
    userMessage,
  );
}

async function buildLiveMarketContext() {
  const [ufResult, tpmResult, usdResult] = await Promise.allSettled([
    fetchIndicador('uf'),
    fetchIndicador('tpm'),
    fetchIndicador('dolar'),
  ]);

  const normalize = (result: PromiseSettledResult<Awaited<ReturnType<typeof fetchIndicador>>>) =>
    result.status === 'fulfilled'
      ? {
          value: result.value.valor,
          unit: result.value.unidad,
          date: result.value.fecha,
          source: result.value.url,
        }
      : { value: null, unit: null, date: null, source: null };

  const uf = normalize(ufResult);
  const tpm = normalize(tpmResult);
  const usd = normalize(usdResult);

  return {
    uf,
    tpm,
    usd,
    summary: [
      uf.value !== null ? `UF ${Number(uf.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
      tpm.value !== null ? `TPM ${Number(tpm.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null,
      usd.value !== null ? `USD/CLP ${Number(usd.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

function normalizeForSimilarity(text: string) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTooSimilarMessage(a: string, b: string) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aWords = new Set(na.split(' ').filter((w) => w.length > 3));
  const bWords = new Set(nb.split(' ').filter((w) => w.length > 3));
  if (aWords.size === 0 || bWords.size === 0) return false;
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap += 1;
  }
  const ratio = overlap / Math.max(aWords.size, bWords.size);
  return ratio >= 0.72;
}

function buildBudgetPanelGuidance() {
  return [
    'Para actualizar tu presupuesto en el panel, haz esto en 60 segundos:',
    '1) Abre el panel lateral y entra a Presupuesto.',
    '2) Edita o agrega filas de ingresos y gastos con monto mensual.',
    '3) Guarda y vuelve al chat para que recalculamos tu diagnóstico al instante.',
    '',
    'Si quieres, te guío categoría por categoría ahora mismo.',
  ].join('\n');
}

function buildResilientFallbackMessage(params: {
  userMessage: string;
  phase?: unknown;
  activeChatId?: unknown;
}) {
  const userMessage = String(params.userMessage ?? '').trim();
  if (/\b(c[oó]mo|como).*\b(actualiz|editar|cambiar|completar).*\b(presupuesto)\b/i.test(userMessage)) {
    return buildBudgetPanelGuidance();
  }
  if (/\b(presupuesto|ingresos|gastos|flujo)\b/i.test(userMessage)) {
    return [
      'Vamos directo a algo útil: primero actualizamos tu presupuesto en el panel y luego te doy una lectura ejecutiva de balance, tasa de ahorro y riesgos.',
      'Si me compartes ingreso mensual, gastos fijos y gastos variables, lo dejamos estructurado ahora.',
    ].join('\n\n');
  }
  if (/\b(cartola|transacci[oó]n|movimientos?|estado de cuenta)\b/i.test(userMessage)) {
    return [
      'Perfecto. Sube tu cartola o transacciones del mes en el panel y te devuelvo un informe ejecutivo con patrones de gasto, alertas y próximos pasos.',
      'En cuanto esté cargada, sigo desde ahí sin repetir contexto.',
    ].join('\n\n');
  }

  const phase = String(params.phase ?? '');
  const activeChatId = String(params.activeChatId ?? 'chat-1');
  if (activeChatId === 'chat-2') {
    return [
      'Tuvimos una intermitencia breve, pero seguimos en el embudo del plan de accion.',
      'Retomemos: dime si quieres seguir explorando ideas, afilar prioridades o cerrar ya el plan estructurado.',
    ].join('\n\n');
  }
  if (activeChatId === 'chat-3') {
    return [
      'Se produjo una intermitencia breve. Retomemos el analisis de conciencia social con foco legal y regulatorio.',
      'Si te parece, sigo con una postura concreta y aplicable a tus decisiones financieras.',
    ].join('\n\n');
  }
  if (phase === 'budget_needed') return buildBudgetPanelGuidance();
  if (phase === 'transactions_needed') {
    return 'Siguiente paso recomendado: sube cartola o transacciones del mes en el panel. Con eso preparo un análisis ejecutivo y pasamos a entrevista breve.';
  }

  return [
    'Hubo una intermitencia técnica puntual, pero sigo contigo en el flujo.',
    'Para avanzar sin perder tiempo, dime cuál de estos pasos quieres ejecutar ahora: presupuesto, cartola o entrevista breve.',
  ].join('\n\n');
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim();
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function buildAgenticPremiumPdfSpec(params: {
  userMessage: string;
  history: Array<{ role?: string; content?: string }>;
  citations?: Array<{ source?: string; title?: string; url?: string }>;
}) {
  const compactHistory = params.history
    .slice(-10)
    .map((h) => ({
      role: h.role ?? 'user',
      content: String(h.content ?? '').slice(0, 900),
    }));
  const compactCitations = (params.citations ?? []).slice(0, 8).map((c) => ({
    source: c.source,
    title: c.title,
    url: c.url,
  }));

  const raw = await completeWithClaude(
    [
      'Devuelve SOLO JSON válido con:',
      '{ "title": string, "subtitle": string, "sections": [{ "heading": string, "body": string }], "charts"?: [{ "title": string, "subtitle"?: string, "kind"?: "line"|"bar"|"area", "labels": string[], "values": number[] }], "tables"?: [{ "title": string, "columns": string[], "rows": (string|number)[][] }] }',
      'Reglas:',
      '- 5 a 8 secciones útiles y accionables.',
      '- Español profesional, claro y concreto.',
      '- Incluir síntesis de conversación y próximos pasos.',
      '- Si aporta claridad, incluye 1 a 3 gráficos y/o 1 a 2 tablas con datos coherentes.',
      '- Si hay fuentes, incluir una sección "Fuentes y contexto externo".',
      '',
      `Solicitud actual: ${params.userMessage}`,
      `Historial reciente: ${JSON.stringify(compactHistory)}`,
      `Fuentes disponibles: ${JSON.stringify(compactCitations)}`,
    ].join('\n'),
    {
      systemPrompt:
        'Eres un director editorial financiero premium. Estructuras informes profesionales de alta claridad y utilidad.',
      temperature: 0.3,
    }
  );

  const parsed = extractJsonObject(raw);
  const title = typeof parsed?.title === 'string' && parsed.title.trim().length > 0
    ? parsed.title.trim()
    : 'Informe financiero premium';
  const subtitle = typeof parsed?.subtitle === 'string' && parsed.subtitle.trim().length > 0
    ? parsed.subtitle.trim()
    : 'Documento generado automáticamente con síntesis accionable';
  const sections = Array.isArray(parsed?.sections)
    ? parsed.sections
        .map((s) => ({
          heading:
            s && typeof s === 'object' && typeof (s as any).heading === 'string'
              ? String((s as any).heading).trim()
              : '',
          body:
            s && typeof s === 'object' && typeof (s as any).body === 'string'
              ? String((s as any).body).trim()
              : '',
        }))
        .filter((s) => s.heading.length >= 2 && s.body.length >= 8)
        .slice(0, 10)
    : [];
  const charts = Array.isArray(parsed?.charts)
    ? parsed.charts
        .map((c) => {
          const obj = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
          const labels = Array.isArray(obj.labels)
            ? obj.labels
                .map((x) => String(x ?? '').trim())
                .filter((x) => x.length > 0)
                .slice(0, 48)
            : [];
          const values = Array.isArray(obj.values)
            ? obj.values
                .map((x) => Number(x))
                .filter((x) => Number.isFinite(x))
                .slice(0, labels.length || 48)
            : [];
          const n = Math.min(labels.length, values.length);
          return {
            title: typeof obj.title === 'string' ? obj.title.trim() : '',
            subtitle: typeof obj.subtitle === 'string' ? obj.subtitle.trim() : undefined,
            kind:
              obj.kind === 'bar' || obj.kind === 'area' || obj.kind === 'line'
                ? obj.kind
                : ('line' as const),
            labels: labels.slice(0, n),
            values: values.slice(0, n),
          };
        })
        .filter((c) => c.title.length > 2 && c.labels.length >= 2 && c.values.length >= 2)
        .slice(0, 3)
    : [];
  const tables = Array.isArray(parsed?.tables)
    ? parsed.tables
        .map((t) => {
          const obj = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
          const columns = Array.isArray(obj.columns)
            ? obj.columns
                .map((x) => String(x ?? '').trim())
                .filter((x) => x.length > 0)
                .slice(0, 6)
            : [];
          const rows = Array.isArray(obj.rows)
            ? obj.rows
                .filter((r) => Array.isArray(r))
                .map((r) =>
                  (r as unknown[])
                    .slice(0, columns.length || 6)
                    .map((x) => (typeof x === 'number' ? x : String(x ?? '')))
                )
                .filter((r) => r.length > 0)
                .slice(0, 20)
            : [];
          return {
            title: typeof obj.title === 'string' ? obj.title.trim() : '',
            columns,
            rows,
          };
        })
        .filter((t) => t.title.length > 2 && t.columns.length >= 2 && t.rows.length >= 1)
        .slice(0, 2)
    : [];

  return {
    title,
    subtitle,
    charts,
    tables,
    sections:
      sections.length > 0
        ? sections
        : [
            {
              heading: 'Resumen ejecutivo',
              body: params.userMessage,
            },
            {
              heading: 'Siguientes pasos',
              body: 'Validar supuestos, contrastar indicadores y ejecutar el plan recomendado en hitos semanales.',
            },
          ],
  };
}

const InjectProfileSchema = z.object({
  profile: z.record(z.unknown()),
});

const InjectIntakeSchema = z.object({
  intake: z.record(z.unknown()),
  llmSummary: z.unknown().optional(),
  intakeContext: z.record(z.unknown()).optional(),
  productsContext: z.record(z.unknown()).optional(),
  budgetContext: z.record(z.unknown()).optional(),
});

const MergeProductsContextSchema = z.object({
  productsContext: z.record(z.unknown()),
  budgetContext: z.record(z.unknown()).optional(),
});

const SaveSheetsSchema = z.object({
  sheets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      autoNamed: z.boolean(),
      items: z.array(z.unknown()),
      draft: z.string(),
      status: z.enum(['active', 'context']),
      contextScore: z.number(),
      userMessageCount: z.number(),
      createdAt: z.string(),
      completedAt: z.string().optional(),
    }),
  ),
});

const PersistedDocumentSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    name: z.string(),
    text: z.string(),
    summary: z.unknown().optional(),
    structuredData: z.unknown().optional(),
    indexed: z.boolean().optional(),
    insight: z
      .object({
        format: z.string().optional(),
        reliability: z.number().optional(),
        extracted_rows: z.number().optional(),
        key_findings: z.array(z.string()).optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const PersistedAssistantMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['assistant', 'user']),
    text: z.string(),
    createdAt: z.string(),
    attachments: z.array(z.string()).optional(),
  })
  .passthrough();

const PersistedDashboardSchema = z
  .object({
    period: z.object({ from: z.string().optional(), to: z.string().optional() }).partial().optional(),
    currency: z.string().optional(),
    keyMetrics: z.record(z.string(), z.union([z.number(), z.null()])).optional(),
    topCategories: z.array(z.object({ name: z.string(), amount: z.number() }).passthrough()).optional(),
    categoryExamples: z
      .array(z.object({ name: z.string(), amount: z.number(), examples: z.array(z.string()) }).passthrough())
      .optional(),
    spendClusters: z.array(z.record(z.string(), z.unknown())).optional(),
    topExpenses: z.array(z.record(z.string(), z.unknown())).optional(),
    topIncome: z.array(z.record(z.string(), z.unknown())).optional(),
    alerts: z.array(z.string()).optional(),
    alertDetails: z.array(z.record(z.string(), z.unknown())).optional(),
    opportunities: z.array(z.string()).optional(),
    metricExplanations: z.array(z.record(z.string(), z.unknown())).optional(),
    movements: z.array(z.record(z.string(), z.unknown())).optional(),
    summary: z.string().optional(),
  })
  .passthrough();

const PersistedBankProductSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    bank: z.string(),
    productType: z.string(),
    simulationAccepted: z.boolean().optional(),
    connected: z.boolean().optional(),
    randomMode: z.boolean().optional(),
    uploadedFiles: z.array(z.string()).optional(),
    parsedDocuments: z.array(PersistedDocumentSchema).optional(),
    assistant: z
      .object({
        messages: z.array(PersistedAssistantMessageSchema).optional(),
        uploadFormat: z.string().nullable().optional(),
        summaryText: z.string().nullable().optional(),
        summaryModel: z.string().nullable().optional(),
        summaryGeneratedAt: z.string().nullable().optional(),
        summaryRegenerationsUsed: z.number().optional(),
        lastSummaryFeedback: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    dashboard: PersistedDashboardSchema.optional(),
  })
  .passthrough();

const SavePanelStateSchema = z.object({
  panelState: z.object({
    budgetRows: z.array(
      z.object({
        id: z.string(),
        category: z.string(),
        type: z.enum(['income', 'expense']),
        amount: z.number(),
        note: z.string(),
      }).passthrough(),
    ),
    budgetChatAnswers: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    bankSimulation: z
      .object({
        products: z.array(PersistedBankProductSchema).optional(),
        activeProductId: z.string().nullable().optional(),
        lockedMonth: z.string().nullable().optional(),
        connected: z.boolean().optional(),
        randomMode: z.boolean().optional(),
        uploadedFiles: z.array(z.string()).optional(),
        parsedDocuments: z.array(PersistedDocumentSchema).optional(),
      })
      .passthrough(),
    savedReports: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        group: z.enum(['plan_action', 'simulation', 'budget', 'diagnosis', 'other']),
        fileUrl: z.string(),
        createdAt: z.string(),
      }).passthrough(),
    ),
    updatedAt: z.string(),
  }).passthrough(),
});

type IntakeEnvelope = {
  intake?: Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
  productsContext?: Record<string, unknown>;
  budgetContext?: Record<string, unknown>;
  llmSummary?: unknown;
  [key: string]: unknown;
};

function allowDevInjection(req: { headers?: Record<string, string | string[] | undefined> }) {
  if (process.env.ENABLE_DEV_INJECTION !== 'true') return false;

  const token = process.env.DEV_ADMIN_TOKEN;
  if (!token) return false;

  const header = req.headers?.['x-dev-admin-token'];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value) return false;

  // SECURITY: Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(token));
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    // This is expected for invalid tokens, return false
    return false;
  }
}

function requireDevInjectionAllowed(params: {
  req: Parameters<typeof allowDevInjection>[0];
  role?: UserRole;
}) {
  // SECURITY: Disable dev injection endpoints entirely in production
  if (process.env.NODE_ENV === 'production') {
    throw forbidden('Dev injection endpoints are disabled in production');
  }

  const byToken = allowDevInjection(params.req);
  const byRole = params.role ? hasPermission(params.role, PERMISSIONS.DEV_INJECT) : false;
  if (!byToken && !byRole) {
    throw forbidden('Dev injection endpoint is disabled');
  }
}

router.post(
  '/inject-profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const { profile } = parseBody(InjectProfileSchema, req.body);
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await attachProfileToUser(user.id, profile);
    if (!ok) throw badRequest('Failed to attach profile');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/inject-intake',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const { intake, llmSummary, intakeContext, productsContext, budgetContext } = parseBody(InjectIntakeSchema, req.body);
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await attachIntakeToUser(user.id, {
      intake,
      llmSummary,
      intakeContext,
      productsContext,
      budgetContext,
    });
    if (!ok) throw badRequest('Failed to attach intake');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/merge-products-context',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const { productsContext, budgetContext } = parseBody(MergeProductsContextSchema, req.body);
    const currentEnvelope =
      user.injectedIntake && typeof user.injectedIntake === 'object'
        ? (user.injectedIntake as IntakeEnvelope)
        : {};
    const nextEnvelope: IntakeEnvelope = {
      ...currentEnvelope,
      intake:
        currentEnvelope.intake && typeof currentEnvelope.intake === 'object'
          ? currentEnvelope.intake
          : {},
      intakeContext:
        currentEnvelope.intakeContext && typeof currentEnvelope.intakeContext === 'object'
          ? currentEnvelope.intakeContext
          : {},
      productsContext,
      budgetContext:
        budgetContext && typeof budgetContext === 'object'
          ? budgetContext
          : currentEnvelope.budgetContext,
    };

    const ok = await attachIntakeToUser(user.id, {
      intake: nextEnvelope.intake ?? {},
      llmSummary: nextEnvelope.llmSummary,
      intakeContext: nextEnvelope.intakeContext,
      productsContext: nextEnvelope.productsContext,
      budgetContext: nextEnvelope.budgetContext,
    });
    if (!ok) throw badRequest('Failed to merge financial context into intake');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/remove-injected-intake',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await removeInjectedIntakeFromUser(user.id);
    if (!ok) throw badRequest('Failed to remove injected intake');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/remove-injected-profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await removeInjectedProfileFromUser(user.id);
    if (!ok) throw badRequest('Failed to remove injected profile');

    return sendSuccess(res, { updated: true });
  }),
);

router.get(
  '/sheets',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const sheets = await loadUserSheets(user.id);
    return sendSuccess(res, { sheets: sheets ?? [] });
  }),
);

router.post(
  '/sheets',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const { sheets } = parseBody(SaveSheetsSchema, req.body);
    const ok = await saveUserSheets(user.id, sheets);
    return sendSuccess(res, { saved: ok });
  }),
);

router.get(
  '/panel-state',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const panelState = await loadUserPanelState(user.id);
    return sendSuccess(res, { panelState: panelState ?? null });
  }),
);

router.post(
  '/panel-state',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const { panelState } = parseBody(SavePanelStateSchema, req.body);
    const ok = await saveUserPanelState(user.id, panelState);
    return sendSuccess(res, { saved: ok });
  }),
);

router.get(
  '/interview/realtime/token',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');
    if (!config.OPENAI_API_KEY) throw forbidden('Realtime voice is not configured');
    const memoryBlob =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : {};
    const callsStarted = Number(interviewVoice.callsStarted ?? 0);
    const activeCallId =
      typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
        ? interviewVoice.activeCallId
        : null;
    const hasCompletedVoiceInterview =
      Boolean(user.latestDiagnosticProfileId) ||
      interviewVoice.status === 'completed' ||
      Boolean(interviewVoice.lastFinalizedAt) ||
      Boolean(interviewVoice.lastReport);
    const totalUsedSec = Number(interviewVoice.totalUsedSec ?? 0);
    const remainingSec = Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - totalUsedSec);
    if (remainingSec <= 0) {
      throw forbidden(
        `Límite alcanzado: la entrevista en llamada permite máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos totales por usuario.`
      );
    }
    if (hasCompletedVoiceInterview) {
      throw forbidden('La entrevista senior por llamada ya fue usada para este usuario.');
    }
    if (!activeCallId && callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
      throw forbidden('Esta entrevista permite una sola llamada por usuario.');
    }
    const callId = activeCallId ?? `call_${Date.now()}`;
    const nextCallsStarted = activeCallId ? Math.max(1, callsStarted) : callsStarted + 1;

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: OPENAI_REALTIME_MODEL,
          audio: {
            input: {
              transcription: {
                language: 'es',
              },
              turn_detection: {
                type: 'server_vad',
              },
            },
            output: {
              voice: OPENAI_REALTIME_VOICE,
              speed: INTERVIEW_REALTIME_VOICE_SPEED,
            },
          },
          instructions:
            [
              'Eres el entrevistador financiero senior de Financieramente — nivel family office, criterio ejecutivo.',
              'Habla en español chileno profesional: claro, sobrio, cálido. Usa tú; nunca voseo ni tono rioplatense.',
              'Conoces el intake, presupuesto y cartolas del usuario. Cita cifras y categorías reales; no pidas lo que ya tienes.',
              'Una pregunta precisa por turno. Microlecturas ejecutivas cada pocos turnos.',
              `Máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos; cierra ${INTERVIEW_CLOSEOUT_BUFFER_SEC}s antes con <<CALL_COMPLETE>> y síntesis breve.`,
            ].join(' '),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw badRequest(`No se pudo crear client_secret para Realtime: ${text}`);
    }

    const data = await response.json();
    const value =
      typeof data?.client_secret?.value === 'string' && data.client_secret.value.length > 0
        ? data.client_secret.value
        : typeof data?.value === 'string' && data.value.length > 0
        ? data.value
        : null;
    const expiresAt =
      typeof data?.client_secret?.expires_at === 'number'
        ? data.client_secret.expires_at
        : typeof data?.expires_at === 'number'
        ? data.expires_at
        : undefined;
    if (typeof value !== 'string' || value.length === 0) {
      throw badRequest(
        `OpenAI no devolvió client_secret usable para Realtime. Respuesta recibida: ${JSON.stringify(data).slice(0, 500)}`
      );
    }

    await saveUserMemoryBlob(user.id, {
      ...memoryBlob,
      interviewVoice: {
        ...interviewVoice,
        callsStarted: nextCallsStarted,
        activeCallId: callId,
        pauseLimit: 1,
        maxDurationSec: remainingSec,
        totalUsedSec,
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
      },
    });

    return sendSuccess(res, {
      value,
      expires_at: expiresAt,
      session_id: typeof data?.id === 'string' ? data.id : undefined,
      call_id: callId,
      calls_used: nextCallsStarted,
      calls_left: Math.max(0, INTERVIEW_MAX_CALLS_PER_USER - nextCallsStarted),
      max_duration_sec: remainingSec,
      total_used_sec: totalUsedSec,
      remaining_total_sec: remainingSec,
      pause_limit: 1,
      voice: OPENAI_REALTIME_VOICE,
      voice_speed: INTERVIEW_REALTIME_VOICE_SPEED,
    });
  }),
);

/**
 * POST /api/interview/realtime/abort
 *
 * Called by the client when WebRTC setup fails AFTER a token was already issued.
 * Rolls back the callsStarted increment so the user does not burn their single
 * allowed call due to a mic/network failure that was never the user's fault.
 *
 * Idempotent and safe: only acts if activeCallId is still set (not yet confirmed).
 */
router.post(
  '/interview/realtime/abort',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const memoryBlob =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : {};

    const callsStarted = Number(interviewVoice.callsStarted ?? 0);
    const activeCallId =
      typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
        ? interviewVoice.activeCallId
        : null;
    const totalUsedSec = Number(interviewVoice.totalUsedSec ?? 0);

    // Only roll back if a pending call exists and no time was actually consumed
    if (!activeCallId || callsStarted <= 0 || totalUsedSec > 0) {
      return sendSuccess(res, { rolled_back: false });
    }

    await saveUserMemoryBlob(user.id, {
      ...memoryBlob,
      interviewVoice: {
        ...interviewVoice,
        callsStarted: Math.max(0, callsStarted - 1),
        activeCallId: null,
        status: 'idle',
        updatedAt: new Date().toISOString(),
      },
    });

    req.logger?.info({
      msg: 'interview.voice.token.aborted',
      userId: user.id,
      previousCallsStarted: callsStarted,
    });

    return sendSuccess(res, { rolled_back: true });
  }),
);

router.get(
  '/welcome',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const injectedIntake = user.injectedIntake;
    const userName = user.name?.split(' ')[0] ?? 'amigo';

    const SYSTEM_ONBOARDING = 'Eres un asesor financiero chileno sobrio, premium y muy claro. Escribes con calidez, precisión y cero tono promocional. Nunca usas emojis ni listas de capacidades. Nunca suenas como onboarding de producto.';

    if (!injectedIntake) {
      return sendSuccess(res, {
        message: `${userName}, antes de avanzar necesito una base mínima de contexto. Completa tu perfil financiero y partimos con una lectura útil de tu situación.`,
      });
    }

    try {
      const intakeEnvelope = injectedIntake as IntakeEnvelope;
      const intakeRaw = (intakeEnvelope.intake ?? intakeEnvelope) as Record<string, unknown>;
      const ctx = (intakeEnvelope.intakeContext ?? {}) as Record<string, unknown>;
      const age = intakeRaw.age ?? 'no especificada';
      const income = intakeRaw.incomeBand ?? 'variable';
      const hasDebt = intakeRaw.hasDebt ? 'con deudas activas' : 'sin deudas activas';
      const hasSavings = intakeRaw.hasSavingsOrInvestments
        ? 'con ahorros o inversiones'
        : 'sin ahorros actualmente';
      const literacy = ctx.financialLiteracy ?? 'medium';
      const stress = intakeRaw.moneyStressLevel ?? 5;
      const risk = intakeRaw.riskReaction ?? 'hold';

      const prompt = `Escribe un mensaje inicial breve para ${userName}, persona chilena de ${age} años, ${String(intakeRaw.employmentStatus ?? 'empleado')}, ingresos en rango ${income}, ${hasSavings}, ${hasDebt}. Nivel financiero: ${literacy}. Estrés financiero: ${stress}/10. Reacción al riesgo: ${risk}.

Reglas:
- Máximo 3 oraciones y 70 palabras
- Debe sentirse humano, sobrio y nada prefabricado
- Reconoce una lectura concreta de su situación sin repetir el intake literalmente
- Propón como primer paso completar o subir su presupuesto en el panel
- Cierra con una pregunta corta y natural
- No menciones desbloqueos, informes, capacidades ni sistema
- No uses frases como "puedo hacer 3 cosas contigo", "ya tengo tu contexto cargado", "partamos con una acción simple"

Devuelve solo el mensaje final.`;

      const message = await complete(
        [{ role: 'system', content: SYSTEM_ONBOARDING }, { role: 'user', content: prompt }],
        { temperature: 0.65 },
      );

      return sendSuccess(res, {
        message:
          message?.trim() ||
          `${userName}, veo espacio para ordenar mejor tu situación y elegir un primer frente con criterio. El primer paso es completar tu presupuesto en el panel para leer tu flujo real. ¿Lo armamos ahora?`,
      });
    } catch (err) {
      req.logger?.warn({ msg: 'Welcome message error', error: err });
      return sendSuccess(res, {
        message: `${userName}, tu perfil financiero está listo. El primer paso es completar tu presupuesto en el panel para ordenar ingresos, gastos y capacidad real de avance. ¿Lo armamos ahora?`,
      });
    }
  }),
);

router.get(
  '/session',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const injectedIntake = user.injectedIntake
      ? {
          intake: (user.injectedIntake as IntakeEnvelope).intake,
          intakeContext: (user.injectedIntake as IntakeEnvelope).intakeContext,
          productsContext: (user.injectedIntake as IntakeEnvelope).productsContext,
          budgetContext: (user.injectedIntake as IntakeEnvelope).budgetContext,
        }
      : undefined;
    const memoryBlob =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : null;

    const lifecycleState = getLifecycleFromMemory(user.memoryBlob);

    return sendSuccess(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      injectedProfile: user.injectedProfile,
      injectedIntake,
      interviewVoice,
      latestDiagnosticProfileId: user.latestDiagnosticProfileId,
      latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt,
      knowledgeBaseScore: user.knowledgeBaseScore ?? 0,
      knowledgeScore: user.knowledgeScore ?? 0,
      knowledgeLastUpdated: user.knowledgeLastUpdated,
      productLifecycle: lifecycleState,
    });
  }),
);

router.get(
  '/admin/users/full',
  requireAuth,
  requirePermission(PERMISSIONS.DEV_INJECT),
  asyncHandler(async (_req, res) => {
    const payload = await listAdminUsersFullDump();
    return sendSuccess(res, payload);
  }),
);

router.post(
  '/agent',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const authedUser = req.authenticatedUser;
    if (!authedUser) {
      throw unauthorized('Authentication required');
    }
    if (!authedUser.injectedIntake) {
      throw forbidden('INTAKE_REQUIRED');
    }

    if (process.env.NODE_ENV !== 'production') {
      try {
        req.logger?.debug({
          msg: '[API /agent] received body',
          body: req.body,
        });
      } catch {
        req.logger?.debug({ msg: '[API /agent] received body (non-serializable)' });
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const normalizedInput: Record<string, unknown> = {
      user_id: authedUser.id,
      user_name: body.user_name,
      session_id: body.session_id,
      user_message: body.user_message ?? body.message,
      history: body.history ?? [],
      context: body.context,
      ui_state: body.ui_state,
      preferences: body.preferences,
    };

    normalizedInput.user_name = normalizedInput.user_name ?? authedUser.name;

    if (authedUser.injectedProfile) {
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        injected_profile: authedUser.injectedProfile,
      };
    }

    if (authedUser.injectedIntake) {
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        injected_intake: authedUser.injectedIntake,
        intake_context: (authedUser.injectedIntake as IntakeEnvelope | undefined)?.intakeContext,
      };
    }

    if (typeof authedUser.knowledgeScore === 'number') {
      normalizedInput.ui_state = {
        ...((normalizedInput.ui_state as Record<string, unknown>) ?? {}),
        knowledge_score: authedUser.knowledgeScore,
      };
    }

    try {
      const activeChatId = (normalizedInput.ui_state as Record<string, unknown> | undefined)?.active_chat
        ? ((normalizedInput.ui_state as Record<string, unknown>).active_chat as Record<string, unknown>)?.id
        : undefined;
      const userMessage = String(normalizedInput.user_message ?? '');
      if (shouldAttachLiveMarketContext({ userMessage, activeChatId })) {
        const marketSnapshot = await buildLiveMarketContext();
        normalizedInput.context = {
          ...((normalizedInput.context as Record<string, unknown>) ?? {}),
          market_snapshot: marketSnapshot,
        };
      }
    } catch (marketErr) {
      req.logger?.warn({ msg: 'Error loading market snapshot', error: marketErr });
    }

    try {
      const sessionId =
        typeof normalizedInput.session_id === 'string' ? normalizedInput.session_id : undefined;
      const query =
        typeof normalizedInput.user_message === 'string' ? normalizedInput.user_message : '';
      const memoryContext = await buildAgentMemoryContextRealtime(authedUser.id, {
        sessionId,
        query,
      });
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        persistent_memory: memoryContext.user_memory,
        session_memory: memoryContext.session_memory,
        realtime_memory: memoryContext.session_memory,
        system_memory: memoryContext.system_memory,
      };

      normalizedInput.ui_state = {
        ...((normalizedInput.ui_state as Record<string, unknown>) ?? {}),
        memory_profile_summary: memoryContext.user_memory.profile_summary,
        memory_timeline_count: memoryContext.user_memory.recent_timeline.length,
        memory_session_turn_count: memoryContext.session_memory?.turn_count ?? 0,
      };
    } catch (memoryErr) {
      req.logger?.warn({ msg: 'Error loading persistent memory', error: memoryErr });
    }

    try {
      const userMessage = String(normalizedInput.user_message ?? '');
      if (userMessage.trim().length > 0) {
        const documentHits = await searchUserDocumentContext(authedUser.id, userMessage, 6);
        if (documentHits.length > 0) {
          const currentContext = ((normalizedInput.context as Record<string, unknown>) ?? {});
          const uploadedDocuments = Array.isArray(currentContext.uploaded_documents)
            ? currentContext.uploaded_documents
            : [];
          normalizedInput.context = {
            ...currentContext,
            document_memory: documentHits,
            uploaded_documents: [
              ...uploadedDocuments,
              ...documentHits.map((hit) => ({
                name: hit.title,
                text: hit.text,
                documentId: hit.documentId,
                source: hit.source,
              })),
            ].slice(-10),
          };
        }
      }
    } catch (documentErr) {
      req.logger?.warn({
        msg: 'Error loading document context',
        error: documentErr,
        userId: authedUser.id,
      });
    }

    let input = ChatAgentInputSchema.parse(normalizedInput);
    const lifecycleDecision = buildLifecycleDecision({
      input,
      memoryBlob: authedUser.memoryBlob,
      hasIntake: Boolean(authedUser.injectedIntake),
    });

    if (lifecycleDecision.blocked) {
      return sendSuccess(res, {
        message:
          lifecycleDecision.reason ??
          'Este espacio aun no esta disponible. Terminemos primero el diagnostico base en el Chat 1.',
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
        suggested_replies: ['Volver al Chat 1', 'Subir presupuesto', 'Subir cartola'],
        panel_action: {
          section: 'budget',
          message: 'Completa presupuesto y cartolas para desbloquear los chats especializados.',
        },
        compliance: {
          mode: 'information',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0,
          blocked: { is_blocked: true, reason: lifecycleDecision.reason },
        },
        state_updates: {},
        meta: lifecycleMeta(lifecycleDecision.state, lifecycleDecision.activeChatId),
      });
    }

    input = {
      ...input,
      context: {
        ...(input.context ?? {}),
        product_lifecycle: lifecycleDecision.state,
        product_directive: lifecycleDecision.systemDirective,
      },
      ui_state: {
        ...(input.ui_state ?? {}),
        product_phase: lifecycleDecision.state.phase,
        product_turn_count: lifecycleDecision.state.chatTurns[lifecycleDecision.activeChatId] ?? 0,
        product_closing_mode: lifecycleDecision.closingMode,
      },
    };
    let response: any;
    try {
      response = await runCoreAgent(input);
    } catch (agentErr) {
      req.logger?.error({
        msg: 'Core agent failed; returning conversational fallback',
        error: agentErr,
        userId: authedUser.id,
      });

      response = {
        message: buildResilientFallbackMessage({
          userMessage: String(input.user_message ?? ''),
          phase: lifecycleDecision.state.phase,
          activeChatId: lifecycleDecision.activeChatId,
        }),
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
        suggested_replies: [
          'Revisemos mi presupuesto',
          'Hazme una simulación simple',
          'Genera un resumen de mi perfil',
        ],
        compliance: {
          mode: 'information',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0,
          blocked: { is_blocked: false },
        },
        state_updates: {},
      };
    }

    const recentAssistantMessages = (Array.isArray(input.history) ? input.history : [])
      .filter((h) => h && typeof h === 'object' && (h as Record<string, unknown>).role === 'assistant')
      .map((h) => String((h as Record<string, unknown>).content ?? ''))
      .filter((x) => x.trim().length > 0)
      .slice(-2);
    if (
      typeof response?.message === 'string' &&
      recentAssistantMessages.some((msg) => isTooSimilarMessage(msg, response.message))
    ) {
      response.message = buildResilientFallbackMessage({
        userMessage: String(input.user_message ?? ''),
        phase: lifecycleDecision.state.phase,
        activeChatId: lifecycleDecision.activeChatId,
      });
      response.suggested_replies = [
        'Abrir presupuesto',
        'Subir cartola',
        'Continuar con entrevista',
      ];
    }

    const asksPdf =
      typeof input.user_message === 'string' &&
      /\b(pdf|reporte|informe|documento|descargable|archivo|adjunto|descargar|exportar|guardarlo)\b/i.test(
        input.user_message
      );
    if (asksPdf) {
      try {
        const spec = await buildAgenticPremiumPdfSpec({
          userMessage: String(input.user_message),
          history: Array.isArray(input.history) ? input.history : [],
          citations: Array.isArray(response.citations) ? (response.citations as any) : [],
        });
        const pdfInput: ProfessionalPdfInput = {
          title: spec.title,
          subtitle: spec.subtitle,
          style: 'premium_dark' as const,
          source: 'analysis' as const,
          sections: spec.sections,
          charts: spec.charts.map((chart) => ({
            ...chart,
            kind:
              chart.kind === 'line' || chart.kind === 'bar' || chart.kind === 'area'
                ? chart.kind
                : 'line',
          })),
          tables: spec.tables,
        };
        const fallbackArtifact = await generateProfessionalReportPdf(pdfInput, authedUser.id, {
          userMessage: String(input.user_message),
          history: Array.isArray(input.history) ? input.history : [],
          citations: Array.isArray(response.citations) ? (response.citations as any) : [],
        });

        try {
          await ingestGeneratedReportDocument({
            userId: authedUser.id,
            title: spec.title,
            text: reportSpecToSearchableText(spec),
          });
        } catch (documentErr) {
          req.logger?.warn({
            msg: 'Generated report document ingestion failed',
            error: documentErr,
            userId: authedUser.id,
          });
        }

        const nonPdfArtifacts = (response.artifacts ?? []).filter(
          (a: { type?: string }) => a?.type !== 'pdf',
        );
        response.artifacts = [fallbackArtifact, ...nonPdfArtifacts];
        response.message = `${response.message ?? ''}\n\nGeneré un PDF profesional y ya está listo para abrir/guardar/descargar.`;
      } catch (pdfErr) {
        req.logger?.warn({
          msg: 'Agentic premium PDF generation failed in /api/agent',
          error: pdfErr,
          userId: authedUser.id,
        });
      }
    }

    try {
      await appendTurnToMemoryRealtime({
        input,
        response,
        authenticatedUser: authedUser,
      });
    } catch (memoryErr) {
      req.logger?.warn({ msg: 'Error persisting turn memory', error: memoryErr });
    }

    try {
      const currentMemory =
        authedUser.memoryBlob && typeof authedUser.memoryBlob === 'object'
          ? (authedUser.memoryBlob as Record<string, unknown>)
          : {};
      const nextLifecycle = applyLifecycleAfterResponse({
        state: lifecycleDecision.state,
        activeChatId: lifecycleDecision.activeChatId,
        input,
        response,
      });
      await saveUserMemoryBlob(authedUser.id, {
        ...currentMemory,
        productLifecycle: nextLifecycle,
      });
      response.meta = {
        ...((response.meta as Record<string, unknown>) ?? {}),
        ...lifecycleMeta(nextLifecycle, lifecycleDecision.activeChatId),
      };
    } catch (lifecycleErr) {
      req.logger?.warn({ msg: 'Error persisting product lifecycle', error: lifecycleErr });
      response.meta = {
        ...((response.meta as Record<string, unknown>) ?? {}),
        ...lifecycleMeta(lifecycleDecision.state, lifecycleDecision.activeChatId),
      };
    }

    if (response.budget_updates && response.budget_updates.length > 0 && input.user_id) {
      try {
        const currentSheets = (await loadUserSheets(authedUser.id)) ?? [];
        const uiState = (input.ui_state ?? {}) as Record<string, unknown>;
        const activeChat = (uiState.active_chat ?? null) as Record<string, unknown> | null;
        const activeSheetId =
          activeChat && typeof activeChat.id === 'string' ? activeChat.id : undefined;

        const activeSheet =
          (activeSheetId
            ? currentSheets.find((sheet) => sheet.id === activeSheetId)
            : undefined) ??
          currentSheets.find((sheet) => sheet.status === 'active') ??
          currentSheets[0];

        if (activeSheet) {
          const updatedItems =
            activeSheet.items?.map((item) => {
              if (!item || typeof item !== 'object') return item;
              const itemRecord = item as Record<string, unknown>;
              const label = typeof itemRecord.label === 'string' ? itemRecord.label : undefined;
              const update = response.budget_updates?.find(
                (entry: { label: string }) => entry.label === label,
              );
              return update ? { ...itemRecord, amount: update.amount } : item;
            }) ?? [];

          const newItems = response.budget_updates?.filter((entry: { label: string }) => {
            return !activeSheet.items?.some((item) => {
              const label =
                item &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).label === 'string'
                  ? ((item as Record<string, unknown>).label as string)
                  : undefined;
              return label === entry.label;
            });
          }) ?? [];

          const nextItems = [...updatedItems, ...newItems];
          const updatedSheet = {
            ...activeSheet,
            items: nextItems,
            draft: response.message ?? activeSheet.draft,
            updatedAt: new Date().toISOString(),
          };

          const nextSheets = currentSheets.map((sheet) =>
            sheet.id === updatedSheet.id ? updatedSheet : sheet,
          );

          await saveUserSheets(authedUser.id, nextSheets);

          (response as Record<string, unknown>).persistence_status = {
            persisted: true,
            timestamp: new Date().toISOString(),
            affected_sheet_id: activeSheet.id,
            items_modified: nextItems.length,
          };
        }
      } catch (persistErr) {
        req.logger?.warn({
          msg: 'Budget persistence failed (non-blocking)',
          error: persistErr,
        });
      }
    }

    return sendSuccess(res, response);
  }),
);

export default router;
