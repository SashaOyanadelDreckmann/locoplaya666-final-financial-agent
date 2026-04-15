// apps/web/app/interview/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { QuestionCard } from '@/components/conversation/QuestionCard';
import { SummaryCard } from '@/components/conversation/SummaryCard';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import { getInterviewRealtimeToken, getSessionInfo, nextConversationStep } from '@/lib/api';

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
  const [intakeReady, setIntakeReady] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';

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
      } catch {
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
    }).then(setResponse);
  }, [intakeReady, intake, completedBlocks, lastResponse, setResponse]);

  // Avance automático
  useEffect(() => {
    if (lastResponse?.type !== 'block_completed') return;

    const updatedCompleted =
      lastResponse.completedBlocks ?? completedBlocks;

    nextConversationStep({
      intake,
      completedBlocks: updatedCompleted,
    }).then((res) => {
      if (res?.blockId) resetBlock(res.blockId);
      setResponse(res);
    });
  }, [lastResponse, intake, completedBlocks, resetBlock, setResponse]);

  // 🎯 FIN ENTREVISTA
  useEffect(() => {
    if (lastResponse?.type === 'interview_complete') {
      setProfile(lastResponse.profile);
      router.push('/diagnosis');
    }
  }, [lastResponse, setProfile, router]);

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
          'Haz solo una pregunta a la vez.',
          'No expliques el sistema ni el contexto técnico.',
          `Pregunta actual que debes formular con calidez y precisión: ${question}`,
        ].join(' '),
      },
    });
    sendVoiceEvent({
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: `Formula oralmente esta pregunta y luego escucha en silencio: ${question}`,
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
      setVoiceError(message);
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

    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');

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
      setVoiceError(message);
    }
  }

  function stopVoiceSession() {
    cleanupVoiceSession();
  }

  async function useVoiceTranscriptAsAnswer() {
    const clean = (voiceUserTranscript || voicePartialTranscript).trim();
    if (!clean || !blockId) return;

    addAnswer(blockId, clean);

    const res = await nextConversationStep({
      intake,
      blockId,
      answersInCurrentBlock: [...answersInBlock, clean],
      completedBlocks,
    });

    setVoiceUserTranscript('');
    setVoicePartialTranscript('');
    setResponse(res);
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
                ? voiceListening
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
            {(voiceUserTranscript || voicePartialTranscript) && blockId ? (
              <button
                type="button"
                className="summary-action-btn summary-action-reject"
                onClick={useVoiceTranscriptAsAnswer}
              >
                Usar transcripción
              </button>
            ) : null}
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

        {lastResponse.type === 'question' && blockId && (
          <QuestionCard
            question={lastResponse.question}
            blockId={blockId}
            onSubmit={async (answer) => {
              const clean = answer?.trim();
              if (!clean) return;

              addAnswer(blockId, clean);

              const res = await nextConversationStep({
                intake,
                blockId,
                answersInCurrentBlock: [
                  ...answersInBlock,
                  clean,
                ],
                completedBlocks,
              });

              setResponse(res);
            }}
          />
        )}

        {lastResponse.type === 'block_summary' && blockId && (
          <SummaryCard
            summary={lastResponse.summary}
            onAccept={async () => {
              const res = await nextConversationStep({
                intake,
                blockId,
                completedBlocks,
                summaryValidation: { accepted: true },
              });
              setResponse(res);
            }}
            onReject={async (comment) => {
              const res = await nextConversationStep({
                intake,
                blockId,
                completedBlocks,
                summaryValidation: {
                  accepted: false,
                  comment,
                },
              });
              setResponse(res);
            }}
          />
        )}
      </div>
    </div>
  );
}
