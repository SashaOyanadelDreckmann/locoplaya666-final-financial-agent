// apps/api/src/schemas/profile.schema.ts

import { InterviewBlockId } from '../orchestrator/interview.flow';

/* ────────────────────────────── */
/* Evidencia por bloque           */
/* ────────────────────────────── */

export type EvidenceConfidence = 'low' | 'medium' | 'high';

export interface InterviewBlockEvidence {
  blockId: InterviewBlockId;

  /**
   * Síntesis narrativa validada explícitamente por el usuario.
   */
  summary: string;

  /**
   * Señales efectivamente detectadas (desde el contrato del bloque).
   */
  signalsDetected: string[];

  /**
   * Nivel de confianza del sistema sobre esta evidencia.
   */
  confidence: EvidenceConfidence;

  /**
   * Confirmación explícita del usuario.
   */
  userValidated: boolean;
}

/* ────────────────────────────── */
/* Metadatos de la entrevista     */
/* ────────────────────────────── */

export interface InterviewMeta {
  /**
   * Proporción estimada de información relevante obtenida (0–1).
   */
  completeness: number;

  /**
   * Bloques efectivamente explorados.
   */
  blocksExplored: InterviewBlockId[];

  /**
   * Bloques omitidos y razón explícita.
   */
  blocksSkipped: {
    blockId: InterviewBlockId;
    reason: string;
  }[];

  /**
   * Timestamp de cierre de entrevista.
   */
  completedAt: string; // ISO
}

/* ────────────────────────────── */
/* Perfil financiero inferido     */
/* ────────────────────────────── */

export interface FinancialProfileTraits {
  /**
   * Capacidad del usuario para comprender y estructurar su situación financiera.
   */
  financialClarity: 'low' | 'medium' | 'high';

  /**
   * Forma predominante de tomar decisiones financieras.
   */
  decisionStyle:
    | 'reactive'
    | 'analytical'
    | 'avoidant'
    | 'delegated'
    | 'mixed';

  /**
   * Horizonte temporal dominante en sus decisiones.
   */
  timeHorizon:
    | 'short_term'
    | 'mixed'
    | 'long_term';

  /**
   * Nivel percibido de presión financiera.
   */
  financialPressure:
    | 'low'
    | 'moderate'
    | 'high';

  /**
   * Relación emocional predominante con el dinero.
   */
  emotionalPattern:
    | 'neutral'
    | 'anxious'
    | 'avoidant'
    | 'controlling'
    | 'conflicted';

  /**
   * Coherencia global entre discurso, decisiones y estructura financiera (0–1).
   */
  coherenceScore: number;
}

/* ────────────────────────────── */
/* Diagnóstico financiero final   */
/* ────────────────────────────── */

export interface FinancialDiagnosticProfile {
  /**
   * Versión del esquema diagnóstico.
   */
  version: 'v2';

  /**
   * Metadatos de trazabilidad y calidad.
   */
  meta: InterviewMeta;

  /**
   * Evidencia validada por bloque.
   */
  blocks: Partial<
    Record<InterviewBlockId, InterviewBlockEvidence>
  >;

  /**
   * Narrativa diagnóstica principal.
   * Lectura humana del estado financiero actual.
   */
  diagnosticNarrative: string;

  /**
   * Perfil financiero inferido.
   * NO contiene recomendaciones ni acciones.
   */
  profile: FinancialProfileTraits;

  /**
   * Tensiones internas detectadas entre bloques.
   * Ej: estabilidad operativa vs ansiedad emocional.
   */
  tensions: string[];

  /**
   * Hipótesis interpretativas del sistema.
   * Sujetos a revisión por agentes posteriores.
   */
  hypotheses: string[];

  /**
   * Vacíos relevantes o ambigüedades detectadas.
   * Input directo para agentes de seguimiento.
   */
  openQuestions: string[];
}
