'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { cn } from '@/lib/compartido/utils';

import {
  bindInterviewVoiceAuraAudio,
  type InterviewVoiceAuraAudioSampler,
} from './interview-voice-aura.audio';
import {
  type InterviewVoiceAuraPhase,
  resolveInterviewVoiceAuraPresenceTarget,
  sampleInterviewVoiceAuraMotion,
  smoothInterviewVoiceAuraPresence,
} from './interview-voice-aura.helpers';

type Props = {
  phase: InterviewVoiceAuraPhase;
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  className?: string;
};

const PRESENCE_ACTIVE_ON = 0.14;
const PRESENCE_ACTIVE_OFF = 0.05;

function applyAuraMotion(
  root: HTMLDivElement,
  phase: InterviewVoiceAuraPhase,
  elapsedSec: number,
  audioLevel: number,
  presence: number,
  auraActive: boolean,
) {
  const motion = sampleInterviewVoiceAuraMotion(phase, elapsedSec, audioLevel, presence);

  root.dataset.phase = phase;
  root.dataset.auraActive = auraActive ? 'true' : 'false';

  root.style.setProperty('--iv-aura-presence', presence.toFixed(4));
  root.style.setProperty('--iv-aura-scale', motion.scale.toFixed(4));
  root.style.setProperty('--iv-aura-bloom', motion.bloom.toFixed(4));
  root.style.setProperty('--iv-aura-rotate', `${motion.rotate.toFixed(2)}deg`);
  root.style.setProperty('--iv-aura-skew', `${motion.skewX.toFixed(2)}deg`);
  root.style.setProperty('--iv-aura-orb-a-x', `${motion.orbAX.toFixed(1)}px`);
  root.style.setProperty('--iv-aura-orb-a-y', `${motion.orbAY.toFixed(1)}px`);
  root.style.setProperty('--iv-aura-orb-b-x', `${motion.orbBX.toFixed(1)}px`);
  root.style.setProperty('--iv-aura-orb-b-y', `${motion.orbBY.toFixed(1)}px`);
  root.style.setProperty('--iv-aura-core-glow', motion.coreGlow.toFixed(4));
}

function resolveRemoteStream(remoteAudioRef?: RefObject<HTMLAudioElement | null>): MediaStream | null {
  const srcObject = remoteAudioRef?.current?.srcObject;
  return srcObject instanceof MediaStream ? srcObject : null;
}

export function InterviewVoiceAura({ phase, remoteAudioRef, className }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const presenceRef = useRef(0);
  const auraActiveRef = useRef(false);
  const samplerRef = useRef<InterviewVoiceAuraAudioSampler | null>(null);
  const boundStreamRef = useRef<MediaStream | null>(null);
  phaseRef.current = phase;

  useEffect(() => {
    return () => {
      samplerRef.current?.dispose();
      samplerRef.current = null;
      boundStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      applyAuraMotion(root, phaseRef.current, 0, 0, 0, false);
      return;
    }

    let frame = 0;
    let startedAt = performance.now();

    const ensureSampler = () => {
      const stream = resolveRemoteStream(remoteAudioRef);
      if (!stream) {
        if (samplerRef.current) {
          samplerRef.current.dispose();
          samplerRef.current = null;
          boundStreamRef.current = null;
        }
        return null;
      }
      if (boundStreamRef.current !== stream) {
        samplerRef.current?.dispose();
        samplerRef.current = bindInterviewVoiceAuraAudio(stream);
        boundStreamRef.current = stream;
      }
      return samplerRef.current;
    };

    const tick = (now: number) => {
      const elapsedSec = (now - startedAt) / 1000;
      const currentPhase = phaseRef.current;
      const audioLevel = ensureSampler()?.sampleLevel() ?? 0;
      const presenceTarget = resolveInterviewVoiceAuraPresenceTarget(currentPhase, audioLevel);
      presenceRef.current = smoothInterviewVoiceAuraPresence(presenceRef.current, presenceTarget);

      if (auraActiveRef.current) {
        if (presenceRef.current < PRESENCE_ACTIVE_OFF) auraActiveRef.current = false;
      } else if (presenceRef.current > PRESENCE_ACTIVE_ON) {
        auraActiveRef.current = true;
      }

      const motionPhase =
        currentPhase === 'paused' || currentPhase === 'connecting' || currentPhase === 'awaiting-mic'
          ? currentPhase
          : 'idle';

      applyAuraMotion(root, motionPhase, elapsedSec, audioLevel, presenceRef.current, auraActiveRef.current);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [remoteAudioRef]);

  return (
    <div
      ref={rootRef}
      className={cn('interview-voice-aura', className)}
      data-phase={phase}
      data-aura-active="false"
      aria-hidden="true"
    >
      <svg className="interview-voice-aura__defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="interview-voice-aura-goo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className="interview-voice-aura__vignette" />
      <div className="interview-voice-aura__field">
        <div className="interview-voice-aura__orb interview-voice-aura__orb--satellite-a" />
        <div className="interview-voice-aura__orb interview-voice-aura__orb--satellite-b" />
        <div className="interview-voice-aura__orb interview-voice-aura__orb--halo" />
        <div className="interview-voice-aura__orb interview-voice-aura__orb--core" />
        <div className="interview-voice-aura__ring" />
      </div>
    </div>
  );
}
