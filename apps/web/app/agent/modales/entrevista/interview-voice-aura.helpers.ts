export type InterviewVoiceAuraPhase =
  | 'idle'
  | 'connecting'
  | 'speaking'
  | 'paused'
  | 'awaiting-mic';

type ResolveInterviewVoiceAuraPhaseInput = {
  voiceAwaitingMic: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceListening: boolean;
  voiceSpeaking: boolean;
};

/** Aura reacts only to agent speech — user mic activity stays visually idle. */
export function resolveInterviewVoiceAuraPhase(
  input: ResolveInterviewVoiceAuraPhaseInput,
): InterviewVoiceAuraPhase {
  if (input.voiceAwaitingMic) return 'awaiting-mic';
  if (input.voiceConnecting) return 'connecting';
  if (input.voiceConnected && input.voicePaused) return 'paused';
  if (input.voiceSpeaking) return 'speaking';
  if (input.voiceConnected) return 'idle';
  return 'idle';
}

export type InterviewVoiceAuraMotion = {
  scale: number;
  bloom: number;
  rotate: number;
  skewX: number;
  orbAX: number;
  orbAY: number;
  orbBX: number;
  orbBY: number;
  coreGlow: number;
};

const PHASE_BASE: Record<InterviewVoiceAuraPhase, { scale: number; bloom: number }> = {
  idle: { scale: 0.72, bloom: 0.14 },
  connecting: { scale: 0.78, bloom: 0.2 },
  'awaiting-mic': { scale: 0.76, bloom: 0.18 },
  speaking: { scale: 1.22, bloom: 0.92 },
  paused: { scale: 0.68, bloom: 0.1 },
};

export function resolveInterviewVoiceAuraPresenceTarget(
  phase: InterviewVoiceAuraPhase,
  audioLevel: number,
): number {
  if (phase === 'paused' || phase === 'connecting' || phase === 'awaiting-mic') return 0;
  const clamped = Math.max(0, Math.min(1, audioLevel));
  return Math.pow(clamped, 0.82);
}

/** Slow envelope for entering/exiting the speaking visual state. */
export function smoothInterviewVoiceAuraPresence(prev: number, target: number): number {
  const rate = target > prev ? 0.045 : 0.026;
  return prev + (target - prev) * rate;
}

export function easeInterviewVoiceAuraPresence(presence: number): number {
  const t = Math.max(0, Math.min(1, presence));
  return t * t * (3 - 2 * t);
}

function blendInterviewVoiceAuraMotion(
  idle: InterviewVoiceAuraMotion,
  speaking: InterviewVoiceAuraMotion,
  presence: number,
): InterviewVoiceAuraMotion {
  const t = easeInterviewVoiceAuraPresence(presence);
  return {
    scale: idle.scale + (speaking.scale - idle.scale) * t,
    bloom: idle.bloom + (speaking.bloom - idle.bloom) * t,
    rotate: idle.rotate + (speaking.rotate - idle.rotate) * t,
    skewX: idle.skewX + (speaking.skewX - idle.skewX) * t,
    orbAX: idle.orbAX + (speaking.orbAX - idle.orbAX) * t,
    orbAY: idle.orbAY + (speaking.orbAY - idle.orbAY) * t,
    orbBX: idle.orbBX + (speaking.orbBX - idle.orbBX) * t,
    orbBY: idle.orbBY + (speaking.orbBY - idle.orbBY) * t,
    coreGlow: idle.coreGlow + (speaking.coreGlow - idle.coreGlow) * t,
  };
}

function sampleIdleMotion(elapsedSec: number): InterviewVoiceAuraMotion {
  const base = PHASE_BASE.idle;
  const t = elapsedSec;
  const breath = 0.5 + 0.5 * Math.sin(t * 1.1);
  const driftA = Math.sin(t * 0.55);
  const driftB = Math.cos(t * 0.42);

  return {
    scale: base.scale + breath * 0.03,
    bloom: base.bloom + breath * 0.05,
    rotate: driftA * 2,
    skewX: driftB * 1.5,
    orbAX: driftA * 8,
    orbAY: driftB * 6,
    orbBX: driftB * 7,
    orbBY: driftA * 5,
    coreGlow: 0.2 + breath * 0.06,
  };
}

function sampleSpeakingMotion(elapsedSec: number, audioLevel: number): InterviewVoiceAuraMotion {
  const t = elapsedSec;
  const driftA = Math.sin(t * 0.55);
  const driftB = Math.cos(t * 0.42);
  const level = Math.max(0, Math.min(1, audioLevel));
  const syllable = level;
  const deform = (level - 0.38) * 0.52 + driftA * 0.08;

  return {
    scale: 0.86 + syllable * 0.58,
    bloom: Math.min(1.18, 0.22 + syllable * 0.92),
    rotate: deform * 22,
    skewX: deform * 14,
    orbAX: driftA * (10 + syllable * 48) + syllable * 18,
    orbAY: driftB * (8 + syllable * 40) - syllable * 32,
    orbBX: driftB * (8 + syllable * 44) - syllable * 28,
    orbBY: driftA * (8 + syllable * 36) + syllable * 24,
    coreGlow: 0.34 + syllable * 0.66,
  };
}

function sampleUtilityPhaseMotion(phase: InterviewVoiceAuraPhase, elapsedSec: number): InterviewVoiceAuraMotion {
  const base = PHASE_BASE[phase];
  const t = elapsedSec;
  const driftA = Math.sin(t * 0.55);
  const driftB = Math.cos(t * 0.42);

  if (phase === 'connecting' || phase === 'awaiting-mic') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    return {
      scale: base.scale + pulse * 0.04,
      bloom: base.bloom + pulse * 0.06,
      rotate: driftA * 3,
      skewX: 0,
      orbAX: driftA * 6,
      orbAY: driftB * 5,
      orbBX: driftB * 5,
      orbBY: driftA * 4,
      coreGlow: 0.22 + pulse * 0.08,
    };
  }

  const breath = 0.5 + 0.5 * Math.sin(t * 1.1);
  return {
    scale: base.scale + breath * 0.02,
    bloom: base.bloom + breath * 0.03,
    rotate: 0,
    skewX: 0,
    orbAX: driftA * 4,
    orbAY: driftB * 3,
    orbBX: driftB * 3,
    orbBY: driftA * 3,
    coreGlow: 0.16,
  };
}

export function sampleInterviewVoiceAuraMotion(
  phase: InterviewVoiceAuraPhase,
  elapsedSec: number,
  audioLevel = 0,
  presence?: number,
): InterviewVoiceAuraMotion {
  if (phase === 'connecting' || phase === 'awaiting-mic' || phase === 'paused') {
    return sampleUtilityPhaseMotion(phase, elapsedSec);
  }

  const blend = presence ?? (phase === 'speaking' ? 1 : 0);
  const idleMotion = sampleIdleMotion(elapsedSec);
  if (blend <= 0.001) return idleMotion;

  const speakingMotion = sampleSpeakingMotion(elapsedSec, audioLevel);
  return blendInterviewVoiceAuraMotion(idleMotion, speakingMotion, blend);
}
