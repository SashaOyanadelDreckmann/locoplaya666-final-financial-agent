import { completeStructured } from '../../services/llm.service';
import { InterviewBlockId, buildInterviewPlan } from '../../orchestrator/interview.flow';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

/**
 * Resultado del análisis LLM del intake
 */
export interface IntakeLLMAnalysis {
  summary: string;
  suggested_blocks: InterviewBlockId[];
  highlights: string[];
}

const SYSTEM_PROMPT = `
Eres un analista financiero que resume un cuestionario (intake) para preparar una entrevista.

Tu salida debe ser UN JSON válido con el siguiente formato:
{
  "summary": string, // una síntesis breve (1-3 frases)
  "suggested_blocks": ["warmup" | "cashflow" | "resilience" | "debt" | "products" | "goals" | "knowledge" | "risk" | "emotional"],
  "highlights": [string] // 3-6 puntos clave detectados
}

Criterios:
- Resume sólo lo que aparece en el intake.
- Prioriza problemas operativos y señales que justifiquen preguntas en entrevista.
- "suggested_blocks" debe ser un SUBCONJUNTO de los bloques que tiene sentido explorar (no inventes bloques).
- No incluyas texto fuera del JSON.
`;

export async function analyzeIntakeWithLLM(
  intake: IntakeQuestionnaire
): Promise<IntakeLLMAnalysis> {
  const plan = buildInterviewPlan(intake);

  const user = `json\nIntake: ${JSON.stringify(intake, null, 2)}\n\nPlan de entrevistas sugerido por reglas locales: ${JSON.stringify(
    plan.blocksToExplore
  )}`;

  const parsed = await completeStructured<IntakeLLMAnalysis>({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.2,
  });

  // Asegura formato mínimo
  return {
    summary: parsed.summary ?? '',
    suggested_blocks: Array.isArray(parsed.suggested_blocks)
      ? parsed.suggested_blocks
      : plan.blocksToExplore,
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}
