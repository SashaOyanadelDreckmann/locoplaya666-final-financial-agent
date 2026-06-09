export type InterviewFinalizeEndedBy = 'timeout' | 'agent' | 'user';

export type InterviewFinalizeCoverageTier = 'minimal' | 'partial' | 'substantial' | 'complete';

export type InterviewFinalizeDepth = {
  tier: InterviewFinalizeCoverageTier;
  maxKeyFindings: number;
  maxCompletionTokens: number;
  maxBlocks: number;
  confidenceCeiling: 'high' | 'medium' | 'low';
  defaultHasEnoughInformation: boolean;
};

export function resolveInterviewFinalizeDepth(input: {
  endedBy: InterviewFinalizeEndedBy;
  durationSec: number;
  minuteSummariesCount: number;
  hasFinalSummary: boolean;
}): InterviewFinalizeDepth {
  const durationSec = Math.max(0, Math.floor(Number.isFinite(input.durationSec) ? input.durationSec : 0));
  const minuteSummariesCount = Math.max(0, Math.floor(input.minuteSummariesCount));
  const hasFinalSummary = input.hasFinalSummary === true;

  if (input.endedBy === 'timeout' || input.endedBy === 'agent') {
    if (durationSec < 25 && minuteSummariesCount === 0 && !hasFinalSummary) {
      return {
        tier: 'minimal',
        maxKeyFindings: 2,
        maxCompletionTokens: 180,
        maxBlocks: 2,
        confidenceCeiling: 'low',
        defaultHasEnoughInformation: false,
      };
    }

    if (durationSec < 75 || minuteSummariesCount < 2) {
      return {
        tier: 'partial',
        maxKeyFindings: 3,
        maxCompletionTokens: 300,
        maxBlocks: 4,
        confidenceCeiling: 'medium',
        defaultHasEnoughInformation: false,
      };
    }

    if (durationSec < 140 || minuteSummariesCount < 3 || !hasFinalSummary) {
      return {
        tier: 'substantial',
        maxKeyFindings: 4,
        maxCompletionTokens: 360,
        maxBlocks: 6,
        confidenceCeiling: 'medium',
        defaultHasEnoughInformation: minuteSummariesCount >= 2,
      };
    }

    return {
      tier: 'complete',
      maxKeyFindings: 5,
      maxCompletionTokens: 420,
      maxBlocks: 99,
      confidenceCeiling: 'high',
      defaultHasEnoughInformation: true,
    };
  }

  if (durationSec < 25 && minuteSummariesCount === 0 && !hasFinalSummary) {
    return {
      tier: 'minimal',
      maxKeyFindings: 2,
      maxCompletionTokens: 180,
      maxBlocks: 2,
      confidenceCeiling: 'low',
      defaultHasEnoughInformation: false,
    };
  }

  if (durationSec < 75 || minuteSummariesCount < 2) {
    return {
      tier: 'partial',
      maxKeyFindings: 3,
      maxCompletionTokens: 280,
      maxBlocks: 4,
      confidenceCeiling: 'medium',
      defaultHasEnoughInformation: false,
    };
  }

  return {
    tier: 'substantial',
    maxKeyFindings: 4,
    maxCompletionTokens: 360,
    maxBlocks: 6,
    confidenceCeiling: 'medium',
    defaultHasEnoughInformation: true,
  };
}

export function buildInterviewFinalizePromptLines(input: {
  depth: InterviewFinalizeDepth;
  endedBy: InterviewFinalizeEndedBy;
  durationSec: number;
  diagnosticIntakeJson: string;
  condensedSummaries: string;
  finalSummaryText: string;
  transcriptSnippet?: string;
}): string[] {
  const scopeRule =
    input.depth.tier === 'minimal'
      ? '- entrevista muy breve: diagnóstico preliminar, máximo 2 hallazgos, sin extrapolar'
      : input.depth.tier === 'partial'
        ? '- cobertura parcial: prioriza 2-3 hallazgos verificables y marca límites explícitos'
        : input.depth.tier === 'substantial'
          ? '- cobertura sustancial pero no completa: integra evidencia disponible sin rellenar vacíos'
          : '- cobertura completa: diagnóstico ejecutivo integral con priorización clara';

  const endedByRule =
    input.endedBy === 'user'
      ? '- el usuario finalizó la llamada antes de tiempo; ajusta profundidad al avance real'
      : input.endedBy === 'timeout'
        ? '- la llamada terminó por límite de tiempo'
        : '- la llamada cerró cuando el entrevistador consolidó el contexto';

  return [
    'Devuelve un JSON con formato:',
    '{"executive_report":"string","key_findings":["string"],"confidence":"high|medium|low","stop_reason":"string","has_enough_information":true|false}',
    'Reglas:',
    '- español chileno profesional',
    '- enfoque diagnóstico senior, ejecutivo y honesto sobre límites de evidencia',
    scopeRule,
    endedByRule,
    `- máximo ${input.depth.maxKeyFindings} hallazgos`,
    `- confianza máxima permitida: ${input.depth.confidenceCeiling}`,
    '- integra SOLO intake, productos, presupuesto y síntesis provistas abajo',
    '- PROHIBIDO inventar montos, productos, deudas, categorías o hechos no presentes en el material',
    '- las síntesis por minuto son orientativas; prioriza intake y contexto estructurado ante contradicciones',
    '- si la evidencia es insuficiente, decláralo explícitamente en executive_report y has_enough_information=false',
    '- sin mencionar sistema ni herramientas',
    `Motivo término llamada: ${input.endedBy}`,
    `Cobertura estimada: ${input.depth.tier}`,
    `Duración activa (segundos): ${input.durationSec}`,
    `Intake usuario: ${input.diagnosticIntakeJson}`,
    `Síntesis por minuto:\n${input.condensedSummaries || 'Sin síntesis por minuto.'}`,
    `Síntesis final de llamada:\n${input.finalSummaryText || 'Sin síntesis final.'}`,
    ...(input.transcriptSnippet
      ? [`Fragmentos de conversación disponibles:\n${input.transcriptSnippet}`]
      : []),
  ];
}

export function buildVoiceInterviewSyntheticBlocks(input: {
  blockIds: string[];
  depth: InterviewFinalizeDepth;
  executiveReport: string;
  keyFindings: string[];
  confidence: 'high' | 'medium' | 'low';
}): Record<
  string,
  {
    blockId: string;
    summary: string;
    signalsDetected: string[];
    confidence: 'high' | 'medium' | 'low';
    userValidated: boolean;
  }
> {
  const cappedConfidence = clampInterviewConfidence(input.confidence, input.depth.confidenceCeiling);
  return Object.fromEntries(
    input.blockIds.map((blockId, index) => {
      const finding = input.keyFindings[index] ?? input.keyFindings[0] ?? '';
      return [
        blockId,
        {
          blockId,
          summary:
            finding ||
            `Cobertura ${input.depth.tier} en entrevista voz; sin validación explícita bloque a bloque.`,
          signalsDetected: finding ? [finding] : input.keyFindings.slice(0, 2),
          confidence: cappedConfidence,
          userValidated: false,
        },
      ];
    }),
  );
}

export function clampInterviewConfidence(
  value: unknown,
  ceiling: InterviewFinalizeDepth['confidenceCeiling'],
): 'high' | 'medium' | 'low' {
  const parsed =
    value === 'high' || value === 'medium' || value === 'low' ? value : ceiling;
  if (ceiling === 'low') return parsed === 'high' ? 'medium' : parsed;
  if (ceiling === 'medium') return parsed === 'high' ? 'medium' : parsed;
  return parsed;
}
