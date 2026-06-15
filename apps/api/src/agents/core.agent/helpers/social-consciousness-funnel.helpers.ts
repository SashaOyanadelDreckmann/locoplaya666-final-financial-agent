import {
  SOCIAL_SYNTHESIS_SECTIONS,
  type SocialConsciousnessFunnelStage,
} from '@financial-agent/shared';

export {
  SOCIAL_SYNTHESIS_SECTIONS,
  buildSocialConsciousnessFallbackMessage,
  buildSocialConsciousnessSuggestedReplies,
  enforceSocialSynthesisStructure,
  resolveSocialConsciousnessFunnelStage,
  socialFunnelStageLabel,
  socialFunnelStageStepIndex,
  type SocialConsciousnessFunnelStage,
} from '@financial-agent/shared';

export function buildSocialConsciousnessFunnelDirective(
  stage: SocialConsciousnessFunnelStage,
): string {
  if (stage === 'explore') {
    return [
      'ETAPA EMBUDO — EXPLORACION (inicio):',
      '- Modo filosofo socratico: apertura existencial breve + una pregunta profunda.',
      '- Conecta la pregunta del usuario con valores, identidad y contexto social.',
      '- Puedes citar perspectivas filosoficas o sociologicas como marco, no como verdad absoluta.',
      '- NO des recomendaciones financieras directas ni simulaciones numericas.',
      '- Cierra siempre con UNA pregunta existencial abierta.',
    ].join('\n');
  }
  if (stage === 'tension') {
    return [
      'ETAPA EMBUDO — TENSION (medio):',
      '- Señala la contradiccion o dilema etico que emerge en la situacion del usuario.',
      '- Contrasta 2 posturas filosoficas aplicadas al tema concreto.',
      '- Integra diagnostico o presupuesto solo como espejo de valores, no como plan financiero.',
      '- Pide al usuario que elija o refine una postura antes del cierre.',
      '- Cierra con UNA pregunta que profundice la tension, no con acciones financieras.',
    ].join('\n');
  }
  return [
    'ETAPA EMBUDO — SINTESIS REFLEXIVA (cierre):',
    '- Este mensaje DEBE consolidar la lectura filosofica de la conversacion.',
    '- Estructura OBLIGATORIA (markdown, en este orden, con contenido sustantivo):',
    ...SOCIAL_SYNTHESIS_SECTIONS.map((s) => `  ${s}`),
    '- Tono: contemplativo, sobrio, provocador con elegancia; nunca condescendiente.',
    '- No prometas rentabilidades ni ejecutes decisiones por el usuario.',
    '- La ultima linea debe ser una pregunta existencial abierta para seguir pensando.',
  ].join('\n');
}

export function buildSocialConsciousnessFormatInstructions(
  stage: SocialConsciousnessFunnelStage,
): string {
  if (stage === 'explore') {
    return [
      'Chat 3 — Conciencia social | ETAPA 1/3 EXPLORACION.',
      'Apertura existencial + pregunta socratica; sin plan financiero ni cifras salvo peticion explicita.',
    ].join(' ');
  }
  if (stage === 'tension') {
    return [
      'Chat 3 — Conciencia social | ETAPA 2/3 TENSION.',
      'Contrasta posturas; dilema etico personal; una pregunta de cierre profunda.',
    ].join(' ');
  }
  return [
    'Chat 3 — Conciencia social | ETAPA 3/3 SINTESIS REFLEXIVA.',
    'Documento reflexivo con todas las secciones ## obligatorias y pregunta abierta final.',
  ].join(' ');
}
