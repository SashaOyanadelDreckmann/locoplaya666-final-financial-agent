import {
  ACTION_PLAN_DELIVER_SECTIONS,
  FUNNEL_ANSWER_USER_FIRST_DIRECTIVE,
  FUNNEL_ANTI_REPETITION_DIRECTIVE,
  FUNNEL_CONCISENESS_DIRECTIVE,
  FUNNEL_EVIDENCE_JUSTIFICATION_DIRECTIVE,
  type ActionPlanFunnelStage,
} from '@financial-agent/shared';

export {
  ACTION_PLAN_DELIVER_SECTIONS,
  buildActionPlanSuggestedReplies,
  buildClosingModeDirective,
  closingTurnForChat,
  enforceDeliverPlanStructure,
  funnelStageLabel,
  funnelStageStepIndex,
  getActionPlanFullDeliverFrom,
  maxTurnsForChat,
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from '@financial-agent/shared';

export function buildActionPlanFunnelDirective(stage: ActionPlanFunnelStage): string {
  const stageBody =
    stage === 'brainstorm'
      ? buildActionPlanBrainstormDirective()
      : stage === 'converge'
        ? buildActionPlanConvergeDirective()
        : buildActionPlanDeliverDirective();

  return [
    FUNNEL_ANSWER_USER_FIRST_DIRECTIVE,
    FUNNEL_EVIDENCE_JUSTIFICATION_DIRECTIVE,
    FUNNEL_CONCISENESS_DIRECTIVE,
    FUNNEL_ANTI_REPETITION_DIRECTIVE,
    stageBody,
  ].join('\n');
}

function buildActionPlanBrainstormDirective(): string {
  return [
    'ETAPA EMBUDO — LLUVIA DE IDEAS (inicio):',
    '- Maximo ~120 palabras en total.',
    '- 3 hipotesis accionables (1 linea cada una): accion → evidencia concreta del usuario → por que importa ahora.',
    '- Usa cifras del presupuesto/cartola/diagnostico cuando existan; si no, marca el vacio en 1 frase.',
    '- Mercado vivo: 1 dato maximo y solo si cambia la decision del turno (con fuente breve).',
    '- Cierra con UNA pregunta concreta de alto impacto (prioridad, horizonte o riesgo).',
    '- No entregues plan final ni prometas rentabilidades.',
  ].join('\n');
}

function buildActionPlanConvergeDirective(): string {
  return [
    'ETAPA EMBUDO — CONVERGENCIA (medio):',
    '- Maximo ~150 palabras en total.',
    '- 1 linea: prioridad que el usuario acabo de expresar, citando su evidencia (monto, plazo o tension).',
    '- 2 rutas viables: cada una con trade-off explicito anclado a caja/deuda/ahorro/inversion del caso.',
    '- 1 linea: recomendacion tentativa con razon verificable (no opinion generica).',
    '- UNA pregunta de validacion sobre el punto critico; no repitas preguntas del hilo.',
    '- No emitas el documento ejecutivo completo salvo peticion explicita o ultimas 2 interacciones.',
  ].join('\n');
}

function buildActionPlanDeliverDirective(): string {
  return [
    'ETAPA EMBUDO — ENTREGA FINAL (cierre ejecutivo):',
    '- Solo en las ultimas 2 interacciones o cuando el usuario pida el plan final.',
    '- Plan profesional completo, personalizado y ejecutable; cada seccion con datos del usuario o vacios declarados.',
    '- Estructura OBLIGATORIA (markdown, en este orden, con contenido sustantivo en cada seccion):',
    ...ACTION_PLAN_DELIVER_SECTIONS.map((s) => `  ${s}`),
    '- En Prioridades y Secuencia: numeracion, plazos (semana/mes/trimestre), responsable (usuario) y cifra cuando exista.',
    '- En Trade-offs: que NO se recomienda y por que (suitability), con evidencia del caso.',
    '- Tono: analista senior wealth advisory Chile; preciso, sobrio, sin hype.',
    '- La decision final ejecutable depende 100% del usuario.',
  ].join('\n');
}

export function buildActionPlanFormatInstructions(stage: ActionPlanFunnelStage): string {
  const userFirst =
    'Responde primero lo que el usuario escribio o pregunto; justifica con evidencia verificable; sin relleno.';

  if (stage === 'brainstorm') {
    return [
      'Chat 2 — Plan de accion | ETAPA 1/3 LLUVIA DE IDEAS.',
      userFirst,
      'Max ~120 palabras: 3 bullets con evidencia + 1 pregunta. SUGERENCIAS = respuestas a tu pregunta.',
    ].join(' ');
  }
  if (stage === 'converge') {
    return [
      'Chat 2 — Plan de accion | ETAPA 2/3 CONVERGENCIA.',
      userFirst,
      'Max ~150 palabras: prioridad + 2 rutas justificadas + 1 pregunta. SUGERENCIAS alineadas.',
    ].join(' ');
  }
  return [
    'Chat 2 — Plan de accion | ETAPA 3/3 PLAN EJECUTIVO FINAL.',
    userFirst,
    'Documento completo con secciones ##; cada bloque con datos del usuario o vacio explicito.',
    'Sin correos ni recordatorios externos.',
  ].join(' ');
}
