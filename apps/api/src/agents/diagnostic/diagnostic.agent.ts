// apps/api/src/agents/diagnostic/diagnostic.agent.ts

import { z } from 'zod';

import {
  FinancialDiagnosticProfile,
  DiagnosticEditorialLayer,
  InterviewBlockEvidence,
} from '../../schemas/profile.schema';

import { InterviewBlockId } from '../../orchestrator/interview.flow';

import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import { completeStructured } from '../../services/llm.service';
import { getLogger } from '../../logger';

/* ────────────────────────────── */
/* Input del agente diagnóstico   */
/* ────────────────────────────── */

export interface DiagnosticAgentInput {
  intake: IntakeQuestionnaire;

  blocks: Partial<
    Record<InterviewBlockId, InterviewBlockEvidence>
  >;
}

/* ────────────────────────────── */
/* Schema de salida (Zod)         */
/* ────────────────────────────── */

const DiagnosticLLMResponseSchema = z.object({
  diagnosticNarrative: z.string().min(10),
  editorial: z
    .object({
      headline: z.string().min(8),
      dek: z.string().min(8),
      keySignals: z.array(z.string()).max(6),
    })
    .optional(),

  profile: z.object({
    financialClarity: z.enum(['low', 'medium', 'high']),
    decisionStyle: z.enum([
      'reactive',
      'analytical',
      'avoidant',
      'delegated',
      'mixed',
    ]),
    timeHorizon: z.enum(['short_term', 'mixed', 'long_term']),
    financialPressure: z.enum(['low', 'moderate', 'high']),
    emotionalPattern: z.enum([
      'neutral',
      'anxious',
      'avoidant',
      'controlling',
      'conflicted',
    ]),
    coherenceScore: z.number().min(0).max(1),
  }),

  tensions: z.array(z.string()),
  hypotheses: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

type DiagnosticLLMResponse = z.infer<
  typeof DiagnosticLLMResponseSchema
>;

/* ────────────────────────────── */
/* Agente Diagnóstico             */
/* ────────────────────────────── */

export async function runDiagnosticAgent(
  input: DiagnosticAgentInput
): Promise<FinancialDiagnosticProfile> {
  const { intake, blocks } = input;

  const prompt = buildDiagnosticPrompt(intake, blocks);

  try {
    const parsed = DiagnosticLLMResponseSchema.parse(
      await completeStructured<DiagnosticLLMResponse>({
        system: SYSTEM_PROMPT,
        user: prompt,
        temperature: 0.2,
        model: process.env.OPENAI_MODEL_DIAGNOSTIC ?? 'gpt-5-mini',
        maxCompletionTokens: 1400,
      })
    );

    return {
      version: 'v2',

      meta: {
        completeness: estimateCompleteness(blocks),
        blocksExplored: Object.keys(blocks) as InterviewBlockId[],
        blocksSkipped: [],
        completedAt: new Date().toISOString(),
      },

      blocks,

      diagnosticNarrative: parsed.diagnosticNarrative,

      profile: parsed.profile,

      tensions: parsed.tensions,

      hypotheses: parsed.hypotheses,

      openQuestions: parsed.openQuestions,

      editorial: mergeEditorialLayer(
        buildFallbackEditorial(intake, parsed, blocks),
        parsed.editorial,
      ),
    };
  } catch (err) {
    getLogger().error({
      msg: '[DiagnosticAgent] Invalid LLM response',
      error: err,
    });
    throw new Error(
      'Respuesta inválida del agente diagnóstico'
    );
  }
}

/* ────────────────────────────── */
/* Prompt del sistema             */
/* ────────────────────────────── */

const SYSTEM_PROMPT = `
Eres un agente diagnóstico financiero de nivel experto.

Tu función NO es:
- recomendar productos
- sugerir acciones
- optimizar resultados
- dar consejos financieros

Tu función SÍ es:
- integrar información validada por el usuario
- detectar patrones financieros y emocionales
- formular hipótesis interpretativas
- construir un perfil financiero descriptivo

Hablas con tono:
- clínico
- sobrio
- no moralizante
- no prescriptivo

Nunca usas imperativos.
Nunca sugieres qué debería hacer el usuario.
Nunca juzgas decisiones.

Todo lo que produces es descriptivo e interpretativo.
`.trim();

/* ────────────────────────────── */
/* Prompt principal               */
/* ────────────────────────────── */

function buildDiagnosticPrompt(
  intake: IntakeQuestionnaire,
  blocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>>
): string {
  const enrichedContext = buildEnrichedContext(intake);

  return `
A continuación se presenta información estructurada de un usuario.

### 1. Intake inicial
${JSON.stringify(intake, null, 2)}

### 2. Evidencia validada por bloques
${JSON.stringify(blocks, null, 2)}

### 3. Contexto financiero derivado
${JSON.stringify(enrichedContext, null, 2)}

---

Con base EXCLUSIVA en esta información:

1. Redacta una **narrativa diagnóstica integrada**
   - Máx 2–3 párrafos
   - Lenguaje descriptivo
   - Enfocada en cómo el usuario vive y estructura su situación financiera

1.b) Construye una **capa editorial premium**:
   - headline: una frase ejecutiva, breve y elegante
   - dek: una bajada sobria de 1 frase
   - keySignals: 3 a 5 señales potentes derivadas de intake, presupuesto, productos y entrevista

2. Construye un **perfil financiero inferido** con los siguientes campos:
   - financialClarity: low | medium | high
   - decisionStyle: reactive | analytical | avoidant | delegated | mixed
   - timeHorizon: short_term | mixed | long_term
   - financialPressure: low | moderate | high
   - emotionalPattern: neutral | anxious | avoidant | controlling | conflicted
   - coherenceScore: número entre 0 y 1

3. Identifica **tensiones internas** entre bloques
   (ej: estabilidad operativa vs ansiedad emocional)

4. Formula **hipótesis interpretativas**
   - NO recomendaciones
   - NO consejos
   - NO acciones

5. Lista **preguntas abiertas relevantes**
   - Ambigüedades
   - Vacíos
   - Información insuficiente

---

Responde EXCLUSIVAMENTE en JSON con la forma:

{
  "diagnosticNarrative": string,
  "editorial": {
    "headline": string,
    "dek": string,
    "keySignals": string[]
  },
  "profile": {
    "financialClarity": "low | medium | high",
    "decisionStyle": "reactive | analytical | avoidant | delegated | mixed",
    "timeHorizon": "short_term | mixed | long_term",
    "financialPressure": "low | moderate | high",
    "emotionalPattern": "neutral | anxious | avoidant | controlling | conflicted",
    "coherenceScore": number
  },
  "tensions": string[],
  "hypotheses": string[],
  "openQuestions": string[]
}
`.trim();
}

function buildEnrichedContext(intake: IntakeQuestionnaire) {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const products = source.__productsContext as Record<string, unknown> | undefined;

  return {
    budget: budget
      ? {
          income: Number(budget.income ?? 0),
          expenses: Number(budget.expenses ?? 0),
          balance: Number(budget.balance ?? 0),
          rowsCount: Number(budget.rowsCount ?? 0),
          rows: Array.isArray(budget.rows)
            ? budget.rows
                .slice(0, 8)
                .map((row) => {
                  const item = row as Record<string, unknown>;
                  return {
                    category: String(item.category ?? 'item'),
                    type: String(item.type ?? 'na'),
                    amount: Number(item.amount ?? 0),
                  };
                })
            : [],
        }
      : null,
    products: products
      ? {
          productsCount: Number(products.productsCount ?? 0),
          activeProductLabel: String(products.activeProductLabel ?? ''),
          transactionSummary:
            products.transactionSummary && typeof products.transactionSummary === 'object'
              ? products.transactionSummary
              : null,
        }
      : null,
  };
}

function buildFallbackEditorial(
  intake: IntakeQuestionnaire,
  parsed: DiagnosticLLMResponse,
  blocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>>,
): DiagnosticEditorialLayer {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const products = source.__productsContext as Record<string, unknown> | undefined;

  const income = Math.max(0, Number(budget?.income ?? source.exactMonthlyIncome ?? 0));
  const expenses = Math.max(0, Number(budget?.expenses ?? 0));
  const balance = Number(budget?.balance ?? income - expenses);
  const stress = clamp01(Number(source.moneyStressLevel ?? 0) / 10);
  const coherence = clamp01(Number(parsed.profile.coherenceScore ?? 0));
  const debtPressure = source.hasDebt ? 0.72 : 0.24;
  const planning = source.tracksExpenses ? 0.74 : 0.34;
  const productFit = Math.min(1, Math.max(0.18, Number(products?.productsCount ?? 0) * 0.18));
  const rows = Array.isArray(budget?.rows) ? budget.rows : [];
  const topExpenseRows = rows
    .filter((row) => {
      const item = row as Record<string, unknown>;
      return item.type === 'expense' && Number(item.amount ?? 0) > 0;
    })
    .sort((a, b) => Number((b as Record<string, unknown>).amount ?? 0) - Number((a as Record<string, unknown>).amount ?? 0))
    .slice(0, 4);

  const pressurePoints = topExpenseRows.length
    ? topExpenseRows.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          label: String(item.category ?? 'Gasto'),
          value: Math.round(Number(item.amount ?? 0)),
        };
      })
    : [
        { label: 'Deuda', value: source.hasDebt ? 72 : 24 },
        { label: 'Estres', value: Math.round(stress * 100) },
        { label: 'Holgura', value: Math.max(0, Math.round(((income - expenses) / Math.max(1, income)) * 100)) },
      ];

  const scorecard = [
    {
      id: 'clarity',
      label: 'Claridad financiera',
      value: scoreFromBand(parsed.profile.financialClarity),
      tone: toneForScore(scoreFromBand(parsed.profile.financialClarity)),
      caption: 'Capacidad de ordenar la realidad financiera sin ruido.',
    },
    {
      id: 'coherence',
      label: 'Coherencia real',
      value: Math.round(coherence * 100),
      tone: toneForScore(Math.round(coherence * 100)),
      caption: 'Nivel de alineacion entre discurso, estructura y decisiones.',
    },
    {
      id: 'planning',
      label: 'Disciplina operativa',
      value: Math.round(planning * 100),
      tone: toneForScore(Math.round(planning * 100)),
      caption: 'Grado de seguimiento y control del flujo mensual.',
    },
    {
      id: 'stress',
      label: 'Tension financiera',
      value: Math.round(stress * 100),
      tone: inverseToneForScore(Math.round(stress * 100)),
      caption: 'Carga emocional visible alrededor del dinero.',
    },
  ];

  const signals = [
    ...parsed.tensions.slice(0, 2),
    ...parsed.hypotheses.slice(0, 2),
    ...Object.values(blocks)
      .flatMap((block) => block?.signalsDetected ?? [])
      .slice(0, 2),
  ]
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    headline:
      parsed.editorial?.headline?.trim() ||
      'El cuadro financiero muestra mas estructura que tranquilidad.',
    dek:
      parsed.editorial?.dek?.trim() ||
      'La lectura integra flujo, presion, productos y relato para estimar la calidad real de ejecucion financiera.',
    keySignals: parsed.editorial?.keySignals?.length ? parsed.editorial.keySignals : signals,
    scorecard,
    cashflowBuckets: [
      { label: 'Ingreso', value: Math.round(income) },
      { label: 'Gasto', value: Math.round(expenses) },
      { label: 'Balance', value: Math.round(balance) },
      { label: 'Productos', value: Math.round(Number(products?.productsCount ?? 0)) },
    ],
    pressurePoints,
  };
}

function mergeEditorialLayer(
  fallback: DiagnosticEditorialLayer,
  editorial?: { headline: string; dek: string; keySignals: string[] },
): DiagnosticEditorialLayer {
  if (!editorial) return fallback;
  return {
    ...fallback,
    headline: editorial.headline?.trim() || fallback.headline,
    dek: editorial.dek?.trim() || fallback.dek,
    keySignals: editorial.keySignals?.length ? editorial.keySignals : fallback.keySignals,
  };
}

function scoreFromBand(value: 'low' | 'medium' | 'high') {
  if (value === 'high') return 82;
  if (value === 'medium') return 58;
  return 34;
}

function toneForScore(value: number): 'critical' | 'watch' | 'strong' {
  if (value >= 70) return 'strong';
  if (value >= 45) return 'watch';
  return 'critical';
}

function inverseToneForScore(value: number): 'critical' | 'watch' | 'strong' {
  if (value >= 70) return 'critical';
  if (value >= 45) return 'watch';
  return 'strong';
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/* ────────────────────────────── */
/* Utilidades                     */
/* ────────────────────────────── */

function estimateCompleteness(
  blocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>>
): number {
  const total = Object.keys(blocks).length;
  const validated = Object.values(blocks).filter(
    (b) => b?.userValidated
  ).length;

  if (total === 0) return 0;
  return Math.min(1, validated / total);
}
