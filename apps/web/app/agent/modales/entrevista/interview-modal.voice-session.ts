import { detectPwaStandalone } from '@/lib/interfaz/viewport-mode';

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
    instructionsOverride?: string | null;
  },
) {
  if (!sendVoiceEvent) return;
  const instructions =
    typeof options?.instructionsOverride === 'string' && options.instructionsOverride.trim().length > 0
      ? options.instructionsOverride
      : buildVoiceSessionInstructions({
          intake: ctx.intake,
          minuteSummaries: ctx.minuteSummaries,
          finalSummary: ctx.finalSummary,
          latestUserSnippet: options?.latestUserSnippet,
          callPhase: options?.callPhase ?? 'exploration',
        });
  sendVoiceEvent({
    type: 'session.update',
    session: {
      instructions,
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
    return detectPwaStandalone()
      ? 'La entrevista por voz requiere HTTPS. Reinstala el acceso directo desde una URL segura o usa Safari con https://.'
      : 'La entrevista por voz requiere HTTPS (o localhost). En desarrollo móvil, abre la app con https:// en tu red local.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Tu navegador no soporta captura de micrófono para esta entrevista.';
  }
  if (typeof window.RTCPeerConnection === 'undefined') {
    return 'Tu navegador no soporta la conexión de voz en tiempo real para esta entrevista.';
  }
  return null;
}

export function resolveMicrophonePermissionHint(): string {
  if (typeof window === 'undefined') {
    return 'El sistema pedirá permiso de micrófono al iniciar la llamada.';
  }
  if (detectPwaStandalone()) {
    return 'Al iniciar, iOS/Android pedirán permiso de micrófono. Si no aparece, abre Ajustes > FinMente > Micrófono.';
  }
  return 'Tu navegador pedirá permiso para usar el micrófono. El tiempo de entrevista solo empieza cuando la llamada quede conectada.';
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

export const INTERVIEW_REALTIME_TURN_DETECTION = {
  type: 'server_vad' as const,
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 650,
};

export function sendRealtimeCallPauseEvents(
  sendVoiceEvent: ((payload: Record<string, unknown>) => void) | null,
  paused: boolean,
) {
  if (!sendVoiceEvent) return;
  if (paused) {
    sendVoiceEvent({ type: 'response.cancel' });
    sendVoiceEvent({ type: 'output_audio_buffer.clear' });
    sendVoiceEvent({ type: 'input_audio_buffer.clear' });
    sendVoiceEvent({
      type: 'session.update',
      session: {
        audio: {
          input: {
            turn_detection: null,
          },
        },
      },
    });
    return;
  }

  sendVoiceEvent({
    type: 'session.update',
    session: {
      audio: {
        input: {
          turn_detection: INTERVIEW_REALTIME_TURN_DETECTION,
        },
      },
    },
  });
}

export function setRemotePlaybackPaused(audio: HTMLAudioElement | null, paused: boolean) {
  if (!audio) return;
  audio.muted = paused;
  if (paused) {
    audio.pause();
    return;
  }
  void audio.play().catch(() => {});
}

export function setPeerConnectionAudioPaused(
  peerConnection: RTCPeerConnection | null,
  paused: boolean,
) {
  if (!peerConnection) return;
  for (const sender of peerConnection.getSenders()) {
    if (sender.track?.kind === 'audio') sender.track.enabled = !paused;
  }
  for (const receiver of peerConnection.getReceivers()) {
    if (receiver.track?.kind === 'audio') receiver.track.enabled = !paused;
  }
}

export function mapMicrophoneAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    /microphone is not allowed in this document/i.test(message) ||
    /Permission denied/i.test(message) ||
    /Permission dismissed/i.test(message) ||
    /NotAllowedError/i.test(message)
  ) {
    if (detectPwaStandalone()) {
      return 'El micrófono está bloqueado. Ve a Ajustes > FinMente > Micrófono (o Safari > Sitios web) y actívalo, luego reintenta.';
    }
    return 'El navegador bloqueó el micrófono. Actívalo en el banner o en los permisos del sitio y vuelve a intentar.';
  }
  if (/NotFoundError|DevicesNotFoundError/i.test(message)) {
    return 'No detectamos un micrófono disponible. Conecta uno e intenta de nuevo.';
  }
  return 'No se pudo acceder al micrófono. Verifica permisos del navegador e intenta de nuevo.';
}
