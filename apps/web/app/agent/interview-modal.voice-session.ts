import {
  buildVoiceSessionInstructions,
  type VoiceSessionContext,
} from './interview-modal.context';

export function emitVoiceSessionContext(
  sendVoiceEvent: ((payload: Record<string, unknown>) => void) | null,
  ctx: VoiceSessionContext,
  options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  },
) {
  if (!sendVoiceEvent) return;
  sendVoiceEvent({
    type: 'session.update',
    session: {
      instructions: buildVoiceSessionInstructions({
        intake: ctx.intake,
        transcriptEntries: ctx.transcriptEntries,
        minuteSummaries: ctx.minuteSummaries,
        finalSummary: ctx.finalSummary,
        completedBlocks: ctx.completedBlocks,
        currentQuestion: ctx.currentQuestion,
        latestUserSnippet: options?.latestUserSnippet,
        callPhase: options?.callPhase ?? 'exploration',
      }),
    },
  });
  if (!options?.triggerResponse) return;
  const focus =
    options.startingFocus ||
    ctx.currentQuestion ||
    'Profundiza la tensión más relevante entre intake, presupuesto y cartolas.';
  sendVoiceEvent({
    type: 'response.create',
    response: {
      output_modalities: ['audio'],
      instructions: [
        'Inicia con tono ejecutivo chileno, sobrio y preciso.',
        'Demuestra dominio del caso citando un dato concreto del presupuesto, cartola o intake.',
        'Formula una sola pregunta de alto valor para profundizar el diagnóstico.',
        `Foco: ${focus}`,
      ].join(' '),
    },
  });
}

export function resolveVoiceCapabilityIssue() {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) {
    return 'La llamada en tiempo real requiere un contexto seguro (HTTPS o localhost).';
  }
  return null;
}
