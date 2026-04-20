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
} from '../services/user.service';
import { complete, completeWithClaude } from '../services/llm.service';
import { appendTurnToMemory, buildAgentMemoryContext } from '../services/memory.service';
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
import { generateProfessionalReportPdf } from '../services/reports/professionalPdf.service';
import { getConfig } from '../config';

const router = Router();
const config = getConfig();

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

const SavePanelStateSchema = z.object({
  panelState: z.object({
    budgetRows: z.array(
      z.object({
        id: z.string(),
        category: z.string(),
        type: z.enum(['income', 'expense']),
        amount: z.number(),
        note: z.string(),
      }),
    ),
    bankSimulation: z.object({
      username: z.string(),
      connected: z.boolean(),
      randomMode: z.boolean(),
      uploadedFiles: z.array(z.string()),
      parsedDocuments: z.array(
        z.object({
          name: z.string(),
          text: z.string(),
        }),
      ),
    }),
    savedReports: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        group: z.enum(['plan_action', 'simulation', 'budget', 'diagnosis', 'other']),
        fileUrl: z.string(),
        createdAt: z.string(),
      }),
    ),
    updatedAt: z.string(),
  }),
});

type IntakeEnvelope = {
  intake?: Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
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

    const { intake, llmSummary } = parseBody(InjectIntakeSchema, req.body);
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await attachIntakeToUser(user.id, { intake, llmSummary });
    if (!ok) throw badRequest('Failed to attach intake');

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

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          audio: {
            output: {
              voice: 'marin',
            },
          },
          instructions:
            'Eres una entrevistadora financiera chilena, cálida y precisa. Hablas en español chileno, haces pausas cortas, escuchas con paciencia y mantienes preguntas breves.',
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

    return sendSuccess(res, {
      value,
      expires_at: expiresAt,
      session_id: typeof data?.id === 'string' ? data.id : undefined,
    });
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
- Propón un punto de partida útil
- Cierra con una pregunta corta y natural
- No menciones panel, herramientas, desbloqueos, informes, capacidades ni sistema
- No uses frases como "puedo hacer 3 cosas contigo", "ya tengo tu contexto cargado", "partamos con una acción simple"

Devuelve solo el mensaje final.`;

      const message = await complete(
        [{ role: 'system', content: SYSTEM_ONBOARDING }, { role: 'user', content: prompt }],
        { temperature: 0.65 },
      );

      return sendSuccess(res, {
        message:
          message?.trim() ||
          `${userName}, veo espacio para ordenar mejor tu situación y elegir un primer frente con criterio. Podemos partir por flujo mensual, colchón o decisiones de inversión. ¿Qué quieres destrabar primero?`,
      });
    } catch (err) {
      req.logger?.warn({ msg: 'Welcome message error', error: err });
      return sendSuccess(res, {
        message: `${userName}, tu perfil financiero está listo. Puedo simular proyecciones, analizar tu presupuesto y generar informes PDF. El panel se desbloquea conforme avanzamos. ¿Por dónde empezamos?`,
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
        }
      : undefined;

    return sendSuccess(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      injectedProfile: user.injectedProfile,
      injectedIntake,
      latestDiagnosticProfileId: user.latestDiagnosticProfileId,
      latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt,
      knowledgeBaseScore: user.knowledgeBaseScore ?? 0,
      knowledgeScore: user.knowledgeScore ?? 0,
      knowledgeLastUpdated: user.knowledgeLastUpdated,
    });
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
      const memoryContext = buildAgentMemoryContext(authedUser.id);
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        persistent_memory: memoryContext.user_memory,
        system_memory: memoryContext.system_memory,
      };

      normalizedInput.ui_state = {
        ...((normalizedInput.ui_state as Record<string, unknown>) ?? {}),
        memory_profile_summary: memoryContext.user_memory.profile_summary,
        memory_timeline_count: memoryContext.user_memory.recent_timeline.length,
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

    const input = ChatAgentInputSchema.parse(normalizedInput);
    const response = await runCoreAgent(input);

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
        const pdfInput = {
          title: spec.title,
          subtitle: spec.subtitle,
          style: 'premium_dark' as const,
          source: 'analysis' as const,
          sections: spec.sections,
          charts: spec.charts,
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

        const nonPdfArtifacts = (response.artifacts ?? []).filter((a) => a?.type !== 'pdf');
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
      appendTurnToMemory({
        input,
        response,
        authenticatedUser: authedUser,
      });
    } catch (memoryErr) {
      req.logger?.warn({ msg: 'Error persisting turn memory', error: memoryErr });
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
              const update = response.budget_updates?.find((entry) => entry.label === label);
              return update ? { ...itemRecord, amount: update.amount } : item;
            }) ?? [];

          const newItems = response.budget_updates?.filter((entry) => {
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
