import { z } from 'zod';
import type { UIEvent as SharedUIEvent } from '@financial-agent/shared/src/ui-events';

/* ────────────────────────────────────────────── */
/* Reasoning Modes                                */
/* ────────────────────────────────────────────── */
export const ReasoningModeSchema = z.enum([
  'education',
  'information',
  'comparison',
  'simulation',
  'budgeting',
  'planification',
  'decision_support',
  'regulation',
  'containment',
]);

export type ReasoningMode = z.infer<typeof ReasoningModeSchema>;

/* ────────────────────────────────────────────── */
/* Compliance                                    */
/* ────────────────────────────────────────────── */
export const ComplianceSchema = z.object({
  mode: ReasoningModeSchema,

  no_auto_execution: z.boolean().default(true),

  includes_recommendation: z.boolean().default(false),
  includes_simulation: z.boolean().default(false),
  includes_regulation: z.boolean().default(false),

  missing_information: z.array(z.string()).default([]),
  disclaimers_shown: z.array(z.string()).default([]),

  risk_score: z.number().min(0).max(1).default(0),

  blocked: z
    .object({
      is_blocked: z.boolean().default(false),
      reason: z.string().optional(),
    })
    .default({ is_blocked: false }),
});

export type Compliance = z.infer<typeof ComplianceSchema>;

/* ────────────────────────────────────────────── */
/* Citations (canónico MCP + Core)                */
/* ────────────────────────────────────────────── */
export const CitationSchema = z.object({
  doc_id: z.string().optional(),
  source: z.string().optional(),
  doc_title: z.string().optional(),
  chunk_id: z.string().optional(),
  section: z.string().optional(),

  supporting_span: z.string().optional(),

  supports: z
    .enum(['claim', 'definition', 'constraint', 'procedure', 'comparison'])
    .default('claim'),

  confidence: z.number().min(0).max(1).default(0.7),

  url: z.string().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

/* ────────────────────────────────────────────── */
/* Artifacts (PDFs, archivos descargables, etc.)  */
/* ────────────────────────────────────────────── */
export const ArtifactSchema = z.object({
  id: z.string(),

  // pdf | table | future-proof
  type: z.string(),

  title: z.string(),
  description: z.string().optional(),

  fileUrl: z.string().optional(),
  previewImageUrl: z.string().optional(),

  // simulation | analysis | plan | diagnostic | etc.
  source: z.string().optional(),

  createdAt: z.string().optional(),
  saved: z.boolean().optional(),

  meta: z.record(z.string(), z.any()).optional(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

/* ────────────────────────────────────────────── */
/* UI Events                                     */
/* ────────────────────────────────────────────── */
export type UIEvent = SharedUIEvent;

/* ────────────────────────────────────────────── */
/* Tool Calls (canónico MCP ↔ Core)               */
/* ────────────────────────────────────────────── */
export const ToolCallSchema = z.object({
  id: z.string().optional(),
  tool: z.string(),
  args: z.record(z.string(), z.any()).default({}),

  status: z.enum(['pending', 'success', 'error']).default('pending'),

  result: z.record(z.string(), z.any()).optional(),
  error_message: z.string().optional(),

  latency_ms: z.number().int().nonnegative().optional(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/* ────────────────────────────────────────────── */
/* ReAct Trace (auditoría / debugging)            */
/* ────────────────────────────────────────────── */
export const ReActStepSchema = z.object({
  step: z.number().int().nonnegative(),
  goal: z.string(),

  tool_call_id: z.string().optional(),
  tool: z.string().optional(),

  observation: z.string().optional(),
  decision: z.string().optional(),
});

export const ReActTraceSchema = z.object({
  objective: z.string().optional(),
  steps: z.array(ReActStepSchema).default([]),
});

export type ReActTrace = z.infer<typeof ReActTraceSchema>;

/* ────────────────────────────────────────────── */
/* Agent Blocks (contrato visual canónico)        */
/* ────────────────────────────────────────────── */

/**
 * 📊 Chart Block
 * Describe un gráfico renderizable por la UI del chat.
 * NO contiene lógica ni implementación visual.
 */
export const ChartBlockSchema = z.object({
  type: z.literal('chart'),

  chart: z.object({
    kind: z.enum(['line', 'bar', 'area']),
    title: z.string(),
    subtitle: z.string().optional(),

    xKey: z.string(),          // ej: "month"
    yKey: z.string(),          // ej: "balance"

    data: z.array(z.record(z.string(), z.union([z.number(), z.string()]))),

    // hints opcionales para la UI
    format: z.enum(['currency', 'percentage', 'number']).optional(),
    currency: z.string().optional(), // ej: "CLP"
  }),
});

export type ChartBlock = z.infer<typeof ChartBlockSchema>;

/**
 * 📄 Document Block
 * Documento estructurado renderizable por la UI.
 */
export const DocumentBlockSchema = z.object({
  type: z.literal('document'),
  title: z.string().optional(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

/**
 * 📋 Table Block
 * Tabla comparativa renderizable en el chat.
 */
export const TableBlockSchema = z.object({
  type: z.literal('table'),
  table: z.object({
    title: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    note: z.string().optional(),
  }),
});

export type TableBlock = z.infer<typeof TableBlockSchema>;

/**
 * ❓ Questionnaire Block
 * Preguntas interactivas para responder en la burbuja del chat.
 */
export const QuestionnaireBlockSchema = z.object({
  type: z.literal('questionnaire'),
  questionnaire: z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    submit_label: z.string().optional(),
    questions: z
      .array(
        z.object({
          id: z.string().min(1),
          question: z.string().min(1),
          choices: z.array(z.string().min(1)).max(4).default([]),
          allow_free_text: z.boolean().default(true),
          free_text_placeholder: z.string().optional(),
          required: z.boolean().default(true),
        })
      )
      .min(1)
      .max(3),
  }),
});

export type QuestionnaireBlock = z.infer<typeof QuestionnaireBlockSchema>;

/**
 * 🧩 Union de bloques soportados por el agente.
 * Se puede extender sin romper compatibilidad.
 */
export const AgentBlockSchema = z.union([
  DocumentBlockSchema,
  ChartBlockSchema,
  TableBlockSchema,
  QuestionnaireBlockSchema,
]);

export type AgentBlock = z.infer<typeof AgentBlockSchema>;

/* ────────────────────────────────────────────── */
/* Chat Agent Response (OUTPUT canónico)          */
/* ────────────────────────────────────────────── */
export const ChatAgentResponseSchema = z.object({
  message: z.string(),

  mode: ReasoningModeSchema,

  tool_calls: z.array(ToolCallSchema).default([]),

  react: ReActTraceSchema.optional(),

  // 🧱 Bloques semántico-visuales (chat pro)
  agent_blocks: z.array(AgentBlockSchema).default([]),

  // 📦 Artefactos descargables (PDFs, etc.)
  artifacts: z.array(ArtifactSchema).default([]),

  citations: z.array(CitationSchema).default([]),

  compliance: ComplianceSchema,

  state_updates: z.record(z.string(), z.any()).default({}),

  suggested_replies: z.array(z.string()).optional(),

  panel_action: z.object({
    section: z.enum(['budget', 'transactions', 'library', 'recents', 'profile', 'news', 'objective', 'mode']).optional(),
    message: z.string().optional(),
  }).optional(),

  meta: z.record(z.string(), z.any()).optional(),

  // Puntuación 0-100 del contexto acumulado de esta hoja (generado por el agente)
  context_score: z.number().min(0).max(100).optional(),

  // Actualizaciones de presupuesto inferidas por el agente de la conversación
  budget_updates: z.array(z.object({
    label: z.string(),
    type: z.enum(['income', 'expense']),
    amount: z.number(),
    category: z.string().optional(),
  })).optional(),

  // PHASE 9.2: Knowledge tracking fields
  knowledge_score: z.number().min(0).max(100).optional(),
  knowledge_event_detected: z.boolean().optional(),
  milestone_unlocked: z.object({
    threshold: z.number(),
    feature: z.string(),
  }).optional(),
});

export type ChatAgentResponse = z.infer<typeof ChatAgentResponseSchema>;

/* ────────────────────────────────────────────── */
/* Chat Agent Input (INPUT canónico)              */
/* ────────────────────────────────────────────── */
export const ChatAgentInputSchema = z.object({
  user_id: z.string(),

  user_name: z.string().optional(),
  session_id: z.string().optional(),

  // SECURITY: Limit message length to prevent DoS via token exhaustion
  user_message: z.string().max(10000, 'Message must not exceed 10,000 characters (approximately 10KB)'),

  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        created_at: z.string().optional(),
      })
    )
    .default([]),

  context: z.record(z.string(), z.any()).optional(),
  ui_state: z.record(z.string(), z.any()).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
});

export type ChatAgentInput = z.infer<typeof ChatAgentInputSchema>;
