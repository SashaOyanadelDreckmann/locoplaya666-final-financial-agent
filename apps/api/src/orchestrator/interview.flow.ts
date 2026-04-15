// apps/api/src/orchestrator/conversationFlow.ts
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

/**
 * Identificadores canónicos de bloques de entrevista.
 */
export type InterviewBlockId =
  | 'warmup' 
  | 'cashflow'
  | 'resilience'
  | 'debt'
  | 'products'
  | 'goals'
  | 'knowledge'
  | 'risk'
  | 'emotional';

/**
 * Estados finitos posibles de la entrevista.
 */
export type InterviewPhase =
  | 'intake_complete'
  | 'block_in_progress'
  | 'block_summary_validation'
  | 'interview_complete';

/**
 * Definición clínica de un bloque de entrevista.
 */
export interface InterviewBlockDefinition {
  id: InterviewBlockId;
  objective: string;
  signals: string[];
  closingCriteria: string[];
  requiresBlockSummaryValidation: boolean;
}

/**
 * Contrato global de bloques disponibles.
 */
export const INTERVIEW_CONTRACT: Record<
  InterviewBlockId,
  InterviewBlockDefinition
> = {
  warmup: {
    id: 'warmup',
    objective:
      'Romper fricción inicial y detectar predisposición cognitiva frente al dinero.',
    signals: [
      'relato espontáneo sobre dinero',
      'tono emocional inicial (ansiedad, indiferencia, interés)',
      'nivel de reflexión vs respuestas automáticas',
    ],
    closingCriteria: [
      'dice si o no, o cualquier cosa',
    ],
    requiresBlockSummaryValidation: false,
  },

  cashflow: {
    id: 'cashflow',
    objective:
      'Identificar estructura real del flujo mensual y puntos de fricción operativa.',
    signals: [
      'desfase entre ingresos y gastos',
      'ausencia de presupuesto explícito',
      'dependencia del crédito para cerrar el mes',
      'gastos rígidos vs flexibles',
    ],
    closingCriteria: [
      'describe fuentes de ingreso y principales categorías de gasto',
      'se infiere grado de previsibilidad mensual',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  resilience: {
    id: 'resilience',
    objective:
      'Medir capacidad de absorción ante shocks financieros de corto plazo.',
    signals: [
      'existencia y tamaño del fondo de emergencia',
      'tiempo de cobertura ante pérdida de ingresos',
      'uso de deuda como colchón',
    ],
    closingCriteria: [
      'explica cómo financiaría un imprevisto concreto',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  debt: {
    id: 'debt',
    objective:
      'Evaluar carga financiera, costo efectivo y presión psicológica de la deuda.',
    signals: [
      'proporción de ingresos destinada a deuda',
      'uso recurrente de pago mínimo',
      'sensación de ahogo o normalización de la deuda',
    ],
    closingCriteria: [
      'identifica tipos de deuda y su prioridad percibida',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  products: {
    id: 'products',
    objective:
      'Detectar desalineación entre productos financieros y necesidades reales.',
    signals: [
      'productos duplicados o subutilizados',
      'desconocimiento de comisiones y tasas',
      'contratación por conveniencia o marketing',
    ],
    closingCriteria: [
      'enumera productos clave y su uso principal',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  goals: {
    id: 'goals',
    objective:
      'Clarificar metas financieras accionables y sus trade-offs temporales.',
    signals: [
      'metas abstractas sin horizonte',
      'conflicto entre disfrute presente y seguridad futura',
      'prioridades implícitas no declaradas',
    ],
    closingCriteria: [
      'define al menos una meta concreta con plazo aproximado',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  knowledge: {
    id: 'knowledge',
    objective:
      'Inferir alfabetización financiera funcional para la toma de decisiones.',
    signals: [
      'confusión entre conceptos básicos (tasa, riesgo, liquidez)',
      'dependencia de recomendaciones externas',
      'exceso o déficit de confianza',
    ],
    closingCriteria: [
      'se estima nivel práctico de comprensión financiera',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  risk: {
    id: 'risk',
    objective:
      'Identificar tolerancia al riesgo basada en comportamiento, no discurso.',
    signals: [
      'reacción ante pérdidas pasadas',
      'asimetría entre miedo y ambición',
      'inconsistencia entre discurso y acción',
    ],
    closingCriteria: [
      'describe una experiencia real frente a incertidumbre',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },

  emotional: {
    id: 'emotional',
    objective:
      'Revelar patrones emocionales y narrativas internas asociadas al dinero.',
    signals: [
      'evitación activa del tema financiero',
      'culpa, vergüenza o hipercontrol',
      'creencias heredadas o narrativas familiares',
    ],
    closingCriteria: [
      'reconoce emociones o patrones dominantes',
      'usuario valida el resumen',
    ],
    requiresBlockSummaryValidation: true,
  },
};


/**
 * Decisión de inclusión u omisión de un bloque.
 */
export interface BlockDecision {
  blockId: InterviewBlockId;
  include: boolean;
  reason: string;
}

/**
 * Resultado del análisis inicial del cuestionario.
 */
export interface InterviewPlan {
  blocksToExplore: InterviewBlockId[];
  blocksSkipped: BlockDecision[];
}

/**
 * Orden canónico base de la entrevista.
 * 🔑 warmup SIEMPRE va primero.
 */
export const BLOCK_ORDER: InterviewBlockId[] = [
  'warmup',
  'cashflow',
  'resilience',
  'debt',
  'products',
  'goals',
  'knowledge',
  'risk',
  'emotional',
];

/**
 * PASO 2: decidir qué bloques entrevistar.
 */
export function buildInterviewPlan(
  intake: IntakeQuestionnaire
): InterviewPlan {
  const decisions: BlockDecision[] = [];

  // 🟣 Warmup siempre incluido
  decisions.push({
    blockId: 'warmup',
    include: true,
    reason: 'Bloque inicial de activación y confianza.',
  });

  decisions.push({
    blockId: 'cashflow',
    include: true,
    reason: 'Flujo mensual es crítico.',
  });

  decisions.push({
    blockId: 'resilience',
    include: true,
    reason: intake.hasSavingsOrInvestments
      ? 'Usuario declara ahorro.'
      : 'Usuario no tiene ahorro.',
  });

  decisions.push({
    blockId: 'debt',
    include: intake.hasDebt,
    reason: intake.hasDebt
      ? 'Usuario declara deudas.'
      : 'Usuario declara no tener deudas.',
  });

  decisions.push({
    blockId: 'products',
    include: intake.financialProducts.length > 0,
    reason:
      intake.financialProducts.length > 0
        ? 'Tiene productos financieros.'
        : 'No tiene productos financieros.',
  });

  decisions.push({
    blockId: 'goals',
    include: true,
    reason: 'Metas siempre relevantes.',
  });

  decisions.push({
    blockId: 'knowledge',
    include: true,
    reason: 'Evaluar comprensión financiera.',
  });

  decisions.push({
    blockId: 'risk',
    include: true,
    reason: 'Explorar tolerancia al riesgo.',
  });

  decisions.push({
    blockId: 'emotional',
    include: true,
    reason: 'Explorar dimensión emocional.',
  });

  return {
    blocksToExplore: BLOCK_ORDER.filter(
      (b) => decisions.find((d) => d.blockId === b)?.include
    ),
    blocksSkipped: decisions.filter((d) => !d.include),
  };
}

/**
 * PASO 3: obtener el siguiente bloque no completado.
 */
export function getNextBlockId(
  plan: InterviewPlan,
  completedBlocks: Partial<Record<InterviewBlockId, unknown>>
): InterviewBlockId | null {
  return (
    plan.blocksToExplore.find(
      (blockId) => !completedBlocks[blockId]
    ) ?? null
  );
}
