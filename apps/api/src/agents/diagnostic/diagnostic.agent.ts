// apps/api/src/agents/diagnostic/diagnostic.agent.ts

import { z } from 'zod';

import {
  FinancialDiagnosticProfile,
  InterviewBlockEvidence,
} from '../../schemas/profile.schema';

import { InterviewBlockId } from '../../orchestrator/interview.flow';

import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import { complete } from '../../services/llm.service';
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

  const raw = await complete(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.2,
  });

  let parsed: DiagnosticLLMResponse;

  try {
    parsed = DiagnosticLLMResponseSchema.parse(
      JSON.parse(raw)
    );
  } catch (err) {
    getLogger().error({
      msg: '[DiagnosticAgent] Invalid LLM response',
      raw,
      error: err,
    });
    throw new Error(
      'Respuesta inválida del agente diagnóstico'
    );
  }

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
  };
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
  return `
A continuación se presenta información estructurada de un usuario.

### 1. Intake inicial
${JSON.stringify(intake, null, 2)}

### 2. Evidencia validada por bloques
${JSON.stringify(blocks, null, 2)}

---

Con base EXCLUSIVA en esta información:

1. Redacta una **narrativa diagnóstica integrada**
   - Máx 2–3 párrafos
   - Lenguaje descriptivo
   - Enfocada en cómo el usuario vive y estructura su situación financiera

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
