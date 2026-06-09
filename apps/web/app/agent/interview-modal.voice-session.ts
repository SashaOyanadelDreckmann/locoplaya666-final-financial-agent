import {
  buildVoiceSessionInstructions,
  INTERVIEW_VOICE_OPENING_FOCUS,
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
        minuteSummaries: ctx.minuteSummaries,
        finalSummary: ctx.finalSummary,
        latestUserSnippet: options?.latestUserSnippet,
        callPhase: options?.callPhase ?? 'exploration',
      }),
    },
  });
  if (!options?.triggerResponse) return;
  const focus = options.startingFocus || INTERVIEW_VOICE_OPENING_FOCUS;
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
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Tu navegador no soporta captura de micrófono para esta entrevista.';
  }
  return null;
}

export async function ensureMicrophoneAccess(existingStream: MediaStream | null): Promise<MediaStream> {
  const liveTrack = existingStream?.getAudioTracks().find((track) => track.readyState === 'live');
  if (liveTrack) {
    liveTrack.enabled = true;
    return existingStream as MediaStream;
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function mapMicrophoneAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    /microphone is not allowed in this document/i.test(message) ||
    /Permission denied/i.test(message) ||
    /Permission dismissed/i.test(message) ||
    /NotAllowedError/i.test(message)
  ) {
    return 'El navegador bloqueó el micrófono. Actívalo en el banner o en los permisos del sitio y vuelve a intentar.';
  }
  if (/NotFoundError|DevicesNotFoundError/i.test(message)) {
    return 'No detectamos un micrófono disponible. Conecta uno e intenta de nuevo.';
  }
  return 'No se pudo acceder al micrófono. Verifica permisos del navegador e intenta de nuevo.';
}
