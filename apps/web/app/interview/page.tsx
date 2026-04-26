// apps/web/app/interview/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import {
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
  getSessionInfo,
  nextConversationStep,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';

export default function InterviewPage() {
  const router = useRouter();
  const bootedRef = useRef(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventIdRef = useRef(0);

  const {
    intake,
    answersByBlock,
    completedBlocks,
    lastResponse,
    addAnswer,
    resetBlock,
    setIntake,
    setResponse,
  } = useInterviewStore();

  const { setProfile } = useProfileStore();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceAgentTranscript, setVoiceAgentTranscript] = useState('');
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voicePartialTranscript, setVoicePartialTranscript] = useState('');
  const [voicePaused, setVoicePaused] = useState(false);
  const [pauseUsed, setPauseUsed] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [maxCallDurationSec, setMaxCallDurationSec] = useState(120);
  const [remainingTotalSec, setRemainingTotalSec] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callsLeft, setCallsLeft] = useState<number | null>(null);
  const [isFinalizingCall, setIsFinalizingCall] = useState(false);
  const [voiceReport, setVoiceReport] = useState<{
    executive_report: string;
    key_findings: string[];
    stop_reason?: string;
  } | null>(null);
  const [intakeReady, setIntakeReady] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';

  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 401) {
      router.replace('/login');
      return true;
    }
    return false;
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateInterviewContext() {
      if (intake) {
        if (!cancelled) setIntakeReady(true);
        return;
      }

      try {
        const session = await getSessionInfo();
        const sessionIntake = session?.injectedIntake?.intake;

        if (!cancelled && sessionIntake && typeof sessionIntake === 'object') {
          setIntake(sessionIntake);
        } else if (!cancelled) {
          router.replace('/intake');
        }
      } catch (error) {
        if (!cancelled && handleUnauthorized(error)) return;
        if (!cancelled) router.replace('/intake');
      } finally {
        if (!cancelled) setIntakeReady(true);
      }
    }

    void hydrateInterviewContext();

    return () => {
      cancelled = true;
    };
  }, [intake, router, setIntake]);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Boot
  useEffect(() => {
    if (!intakeReady || !intake || bootedRef.current || lastResponse) return;
    bootedRef.current = true;

    nextConversationStep({
      intake,
      completedBlocks,
    })
      .then(setResponse)
      .catch((error) => {
        if (handleUnauthorized(error)) return;
      });
  }, [intakeReady, intake, completedBlocks, lastResponse, setResponse]);

  // Avance automático
  useEffect(() => {
    if (lastResponse?.type !== 'block_completed') return;

    const updatedCompleted =
      lastResponse.completedBlocks ?? completedBlocks;

    nextConversationStep({
      intake,
      completedBlocks: updatedCompleted,
    })
      .then((res) => {
        if (res?.blockId) resetBlock(res.blockId);
        setResponse(res);
      })
      .catch((error) => {
        if (handleUnauthorized(error)) return;
      });
  }, [lastResponse, intake, completedBlocks, resetBlock, setResponse]);

  useEffect(() => {
    return () => {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.close();
        } catch {}
      }
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch {}
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!voiceConnected || voicePaused) return;
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => {
        const next = prev + 1;
        if (next >= maxCallDurationSec) {
          window.clearInterval(timer);
          void finalizeCallAndGenerateReport('timeout');
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [voiceConnected, voicePaused, maxCallDurationSec]);

  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected]);

  useEffect(() => {
    if (!voiceConnected || !currentQuestion) return;
    primeVoiceQuestion(currentQuestion);
  }, [voiceConnected, currentQuestion]);

  if (!intakeReady || !intake || !lastResponse) return null;

  const blockId = lastResponse.blockId;
  const answersInBlock = blockId
    ? answersByBlock[blockId] ?? []
    : [];

  const stageLabel =
    lastResponse.type === 'question'
      ? 'En llamada'
      : lastResponse.type === 'block_summary'
      ? 'Validando'
      : 'Cerrando';
  const callTimeLabel = `${Math.floor(callSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(callSeconds % 60).toString().padStart(2, '0')}`;
  const maxCallTimeLabel = `${Math.floor(maxCallDurationSec / 60)
    .toString()
    .padStart(2, '0')}:${(maxCallDurationSec % 60).toString().padStart(2, '0')}`;

  const intakeSnapshot = [
    intake.profession ? String(intake.profession) : null,
    intake.employmentStatus ? String(intake.employmentStatus).replace(/_/g, ' / ') : null,
    intake.incomeBand ? String(intake.incomeBand) : null,
    typeof intake.moneyStressLevel === 'number' ? `Estrés ${intake.moneyStressLevel}/10` : null,
  ].filter(Boolean) as string[];

  function nextVoiceEventId() {
    eventIdRef.current += 1;
    return `voice-event-${eventIdRef.current}`;
  }

  function cleanupVoiceSession() {
    setVoiceConnected(false);
    setVoiceConnecting(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoicePaused(false);
    setMicrophoneReady(false);
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.close();
      } catch {}
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
  }

  function sendVoiceEvent(payload: Record<string, unknown>) {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ event_id: nextVoiceEventId(), ...payload }));
  }

  function primeVoiceQuestion(question: string) {
    if (!question) return;
    setVoiceAgentTranscript('');
    setVoiceUserTranscript('');
    setVoicePartialTranscript('');
    sendVoiceEvent({
      type: 'session.update',
      session: {
        instructions: [
          'Eres una entrevistadora financiera premium en una llamada breve.',
          'Habla en español chileno.',
          'Haz solo una pregunta a la vez y profundiza con precisión.',
          'No expliques el sistema ni el contexto técnico.',
          'La llamada dura máximo 2 minutos y busca un diagnóstico profundo basado en intake y respuestas del usuario.',
          'Si ya tienes información suficiente, inicia tu cierre con <<CALL_COMPLETE>> y resume el porqué en 2 frases.',
          `Pregunta de arranque que debes formular con calidez y precisión: ${question}`,
        ].join(' '),
      },
    });
    sendVoiceEvent({
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: `Inicia con esta pregunta y luego continúa entrevistando en profundidad: ${question}`,
      },
    });
  }

  function resolveVoiceCapabilityIssue() {
    if (typeof window === 'undefined') return null;
    if (!window.isSecureContext) {
      return 'La llamada en tiempo real requiere un contexto seguro (HTTPS o localhost).';
    }
    if (window.self !== window.top) {
      return 'El micrófono está bloqueado dentro de esta vista embebida. Abre la entrevista en una pestaña normal para usar voz en tiempo real.';
    }
    return null;
  }

  async function activateMicrophone() {
    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) {
      setVoiceError(capabilityIssue);
      return;
    }

    try {
      setVoiceError(null);
      const stream =
        localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      setMicrophoneReady(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo activar el micrófono';
      if (
        /microphone is not allowed in this document/i.test(message) ||
        /Permission denied/i.test(message) ||
        /Permission dismissed/i.test(message)
      ) {
        setVoiceError(
          'El navegador bloqueó el micrófono en esta vista. Prueba abrir la entrevista directamente en una pestaña del navegador y concede permiso de micrófono.'
        );
        return;
      }
      setVoiceError(toUserFacingError(error, 'generic'));
    }
  }

  async function startVoiceSession() {
    if (!voiceSupported || voiceConnecting || voiceConnected || !currentQuestion) return;

    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) {
      setVoiceError(capabilityIssue);
      return;
    }

    setVoiceError(null);
    setVoiceConnecting(true);
    setVoiceReport(null);

    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');
      setCallId(typeof token?.call_id === 'string' ? token.call_id : null);
      if (typeof token?.calls_left === 'number') setCallsLeft(token.calls_left);
      if (typeof token?.max_duration_sec === 'number' && token.max_duration_sec > 0) {
        setMaxCallDurationSec(Math.max(1, Math.floor(token.max_duration_sec)));
      } else {
        setMaxCallDurationSec(120);
      }
      if (typeof token?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(token.remaining_total_sec)));
      } else {
        setRemainingTotalSec(null);
      }
      setCallSeconds(0);
      setPauseUsed(false);

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const stream =
        localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      setMicrophoneReady(true);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('open', () => {
        setVoiceConnected(true);
        setVoiceConnecting(false);
        primeVoiceQuestion(currentQuestion);
      });

      dc.addEventListener('close', () => {
        cleanupVoiceSession();
      });

      dc.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = String(payload?.type ?? '');

          if (type === 'input_audio_buffer.speech_started') {
            setVoiceListening(true);
          }
          if (type === 'input_audio_buffer.speech_stopped') {
            setVoiceListening(false);
          }
          if (type === 'response.created') {
            setVoiceSpeaking(true);
          }
          if (type === 'response.done') {
            setVoiceSpeaking(false);
          }
          if (type === 'response.audio_transcript.delta' && typeof payload.delta === 'string') {
            setVoiceAgentTranscript((prev) => `${prev}${payload.delta}`);
          }
          if (
            type === 'conversation.item.input_audio_transcription.completed' &&
            typeof payload.transcript === 'string'
          ) {
            setVoiceUserTranscript(payload.transcript.trim());
            setVoicePartialTranscript('');
          }
          if (
            type === 'conversation.item.input_audio_transcription.delta' &&
            typeof payload.delta === 'string'
          ) {
            setVoicePartialTranscript((prev) => `${prev}${payload.delta}`);
          }
        } catch {}
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      const answer = {
        type: 'answer' as RTCSdpType,
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      cleanupVoiceSession();
      setVoiceConnecting(false);
      const message =
        error instanceof Error ? error.message : 'No se pudo iniciar la llamada';
      if (
        /microphone is not allowed in this document/i.test(message) ||
        /Permission denied/i.test(message) ||
        /Permission dismissed/i.test(message)
      ) {
        setVoiceError(
          'El navegador bloqueó el micrófono en esta vista. Prueba abrir la entrevista directamente en una pestaña del navegador y concede permiso de micrófono.'
        );
        return;
      }
      setVoiceError(toUserFacingError(error, 'generic'));
    }
  }

  function stopVoiceSession() {
    cleanupVoiceSession();
  }

  function toggleCallPause() {
    if (!voiceConnected) return;
    if (voicePaused) {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setVoicePaused(false);
      return;
    }
    if (pauseUsed) return;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    setVoicePaused(true);
    setPauseUsed(true);
  }

  async function finalizeCallAndGenerateReport(endedBy: 'timeout' | 'agent' | 'user') {
    if (isFinalizingCall) return;
    setIsFinalizingCall(true);
    cleanupVoiceSession();
    try {
      const transcript = [
        voiceAgentTranscript ? `AGENTE:\n${voiceAgentTranscript}` : '',
        voiceUserTranscript ? `USUARIO:\n${voiceUserTranscript}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      if (!transcript || transcript.length < 10) {
        setVoiceError('No hay suficiente transcripción para generar informe ejecutivo.');
        return;
      }

      const result = await finalizeInterviewVoiceCall({
        intake,
        transcript,
        endedBy,
        durationSec: callSeconds,
        callId: callId ?? undefined,
      });

      if (result?.profile) {
        setProfile(result.profile);
      }
      if (result?.type === 'interview_complete') {
        setResponse(result);
      }
      const interviewVoice = result?.interview_voice;
      if (typeof interviewVoice?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(interviewVoice.remaining_total_sec)));
      }
      const report = result?.voice_report;
      if (report?.executive_report) {
        setVoiceReport({
          executive_report: String(report.executive_report),
          key_findings: Array.isArray(report.key_findings)
            ? report.key_findings.map((item: unknown) => String(item))
            : [],
          stop_reason: typeof report.stop_reason === 'string' ? report.stop_reason : endedBy,
        });
      }
    } catch (error) {
      if (handleUnauthorized(error)) return;
      setVoiceError(toUserFacingError(error, 'generic'));
    } finally {
      setIsFinalizingCall(false);
    }
  }

  async function useVoiceTranscriptAsAnswer() {
    const clean = (voiceUserTranscript || voicePartialTranscript).trim();
    if (!clean || !blockId) return;

    addAnswer(blockId, clean);

    try {
      const res = await nextConversationStep({
        intake,
        blockId,
        answersInCurrentBlock: [...answersInBlock, clean],
        completedBlocks,
      });

      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
      setResponse(res);
    } catch (error) {
      if (handleUnauthorized(error)) return;
    }
  }

  return (
    <div className="interview-shell pro-interview-shell">
      <div className="interview-column pro-interview-column">
        <section className="voice-call-shell">
          <div className="voice-call-topbar">
            <div>
              <span className="voice-call-label">Voice diagnostic session</span>
              <h1>Entrevista estratégica en tiempo real</h1>
            </div>
            <div className="voice-call-status">
              <span className="voice-call-status-dot" />
              {voiceConnecting
                ? 'Conectando'
                : voiceConnected
                ? voicePaused
                  ? 'Pausada'
                  : voiceListening
                  ? 'Escuchando'
                  : voiceSpeaking
                  ? 'Hablando'
                  : 'En llamada'
                : stageLabel}
            </div>
          </div>

          <div className="voice-call-context">
            {intakeSnapshot.map((item) => (
              <span key={item} className="voice-call-pill">{item}</span>
            ))}
          </div>

          <div className="voice-call-actions">
            <button
              type="button"
              className="summary-action-btn"
              onClick={activateMicrophone}
              disabled={!voiceSupported || voiceConnecting || voiceConnected}
            >
              {microphoneReady ? 'Micrófono activo' : 'Activar micrófono'}
            </button>
            <button
              type="button"
              className="summary-action-btn summary-action-accept"
              onClick={voiceConnected ? stopVoiceSession : startVoiceSession}
              disabled={!voiceSupported || voiceConnecting || !currentQuestion}
            >
              {voiceConnecting
                ? 'Conectando llamada…'
                : voiceConnected
                ? 'Colgar'
                : 'Iniciar llamada'}
            </button>
            <button
              type="button"
              className="summary-action-btn"
              onClick={toggleCallPause}
              disabled={!voiceConnected || (pauseUsed && !voicePaused)}
              title={pauseUsed ? 'Ya usaste la pausa única de esta llamada' : 'Pausar una vez'}
            >
              {voicePaused ? 'Reanudar' : pauseUsed ? 'Pausa usada' : 'Pausar (1 vez)'}
            </button>
            {(voiceUserTranscript || voicePartialTranscript) && blockId ? (
              <button
                type="button"
                className="summary-action-btn summary-action-reject"
                onClick={useVoiceTranscriptAsAnswer}
              >
                Usar transcripción
              </button>
            ) : null}
            {voiceConnected ? (
              <button
                type="button"
                className="summary-action-btn summary-action-reject"
                onClick={() => void finalizeCallAndGenerateReport('user')}
                disabled={isFinalizingCall}
              >
                {isFinalizingCall ? 'Generando informe…' : 'Finalizar y generar informe'}
              </button>
            ) : null}
          </div>

          <div className="voice-call-context">
            <span className="voice-call-pill">Tiempo {callTimeLabel} / {maxCallTimeLabel}</span>
            <span className="voice-call-pill">
              Pausa: {pauseUsed ? (voicePaused ? 'en uso' : 'usada') : 'disponible'}
            </span>
            <span className="voice-call-pill">
              Tiempo total restante: {remainingTotalSec === null
                ? '—'
                : `${Math.floor(remainingTotalSec / 60)
                    .toString()
                    .padStart(2, '0')}:${(remainingTotalSec % 60).toString().padStart(2, '0')}`}
            </span>
            <span className="voice-call-pill">
              Llamadas iniciadas: {callsLeft === null ? '—' : Math.max(0, 2 - callsLeft)}
            </span>
          </div>

          {voiceError ? <p className="voice-call-error">{voiceError}</p> : null}

          {(voiceConnected || voiceUserTranscript || voicePartialTranscript || voiceAgentTranscript) && (
            <div className="voice-call-transcripts">
              <div className="voice-call-transcript-card">
                <span className="voice-call-transcript-label">Agente</span>
                <p>{voiceAgentTranscript || 'La pregunta hablada aparecerá aquí.'}</p>
              </div>
              <div className="voice-call-transcript-card">
                <span className="voice-call-transcript-label">Tu voz</span>
                <p>{voiceUserTranscript || voicePartialTranscript || 'Cuando hables, la transcripción se mostrará aquí.'}</p>
              </div>
            </div>
          )}
        </section>

        {voiceReport && (
          <section className="voice-call-shell">
            <div className="voice-call-topbar">
              <div>
                <span className="voice-call-label">Informe ejecutivo</span>
                <h1>Diagnóstico de la llamada</h1>
              </div>
            </div>
            <div className="voice-call-transcript-card">
              <p>{voiceReport.executive_report}</p>
            </div>
            {voiceReport.key_findings.length > 0 && (
              <div className="voice-call-transcript-card">
                <span className="voice-call-transcript-label">Hallazgos principales</span>
                <ul>
                  {voiceReport.key_findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="voice-call-actions">
              <button
                type="button"
                className="summary-action-btn summary-action-accept"
                onClick={() => router.push('/diagnosis')}
              >
                Ir al diagnóstico completo
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
