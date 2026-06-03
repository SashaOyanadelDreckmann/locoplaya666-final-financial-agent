import {
  ACTION_PLAN_DELIVER_SECTIONS,
  type ActionPlanFunnelStage,
} from '@financial-agent/shared';

export {
  ACTION_PLAN_DELIVER_SECTIONS,
  closingTurnForChat,
  enforceDeliverPlanStructure,
  funnelStageLabel,
  funnelStageStepIndex,
  maxTurnsForChat,
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from '@financial-agent/shared';

export function buildActionPlanFunnelDirective(stage: ActionPlanFunnelStage): string {
  if (stage === 'brainstorm') {
    return [
      'ETAPA EMBUDO — LLUVIA DE IDEAS (inicio):',
      '- Parte del diagnostico, presupuesto, cartolas, intake y mercado vivo del dia.',
      '- Abre con 4-7 hipotesis accionables (bullets), cada una con "por que importa" en una linea.',
      '- Cruza señal de mercado solo como contexto verificable, sin especular.',
      '- Cierra con 1-2 preguntas de alto impacto (prioridad, horizonte, riesgo).',
      '- No entregues aun el plan final estructurado.',
    ].join('\n');
  }
  if (stage === 'converge') {
    return [
      'ETAPA EMBUDO — CONVERGENCIA (medio):',
      '- Resume en 2 lineas lo que el usuario acaba de priorizar.',
      '- Presenta 2-3 rutas viables con trade-off explicito (caja, deuda, ahorro, inversion).',
      '- Recomienda una ruta tentativa con criterio senior y nivel de conviccion moderado.',
      '- Pide validacion de un solo punto critico antes del cierre.',
      '- No cierres con el informe final completo salvo peticion explicita del usuario.',
    ].join('\n');
  }
  return [
    'ETAPA EMBUDO — ENTREGA FINAL (cierre ejecutivo):',
    '- Este mensaje DEBE ser el plan de accion profesional completo, personalizado y listo para ejecutar.',
    '- Estructura OBLIGATORIA (markdown, en este orden, con contenido sustantivo en cada seccion):',
    ...ACTION_PLAN_DELIVER_SECTIONS.map((s) => `  ${s}`),
    '- En Prioridades y Secuencia usa numeracion, plazos (semana/mes/trimestre) y responsable (usuario).',
    '- En Trade-offs explicita que NO se recomienda si aplica (suitability).',
    '- Tono: analista senior de wealth advisory en Chile; preciso, sobrio, sin hype.',
    '- La decision final ejecutable depende 100% del usuario.',
  ].join('\n');
}

export function buildActionPlanFormatInstructions(stage: ActionPlanFunnelStage): string {
  if (stage === 'brainstorm') {
    return [
      'Chat 2 — Plan de accion | ETAPA 1/3 LLUVIA DE IDEAS.',
      'Hipotesis ancladas a perfil + mercado vivo; bullets; 1-2 preguntas; sin plan final.',
    ].join(' ');
  }
  if (stage === 'converge') {
    return [
      'Chat 2 — Plan de accion | ETAPA 2/3 CONVERGENCIA.',
      'Sintetiza prioridad del usuario; 2-3 rutas con trade-offs; recomendacion tentativa; 1 pregunta de cierre.',
    ].join(' ');
  }
  return [
    'Chat 2 — Plan de accion | ETAPA 3/3 PLAN EJECUTIVO FINAL.',
    'Documento completo con todas las secciones ## obligatorias, contenido denso y personalizado.',
    'Sin correos ni recordatorios externos.',
  ].join(' ');
}
