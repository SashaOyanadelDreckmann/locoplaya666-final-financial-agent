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
  coreScale: number;
  shiftX: number;
  shiftY: number;
  coreGlow: number;
};

const PHASE_BASE: Record<InterviewVoiceAuraPhase, { scale: number; bloom: number }> = {
  idle: { scale: 0.78, bloom: 0.16 },
  connecting: { scale: 0.84, bloom: 0.22 },
  'awaiting-mic': { scale: 0.82, bloom: 0.2 },
  speaking: { scale: 1.28, bloom: 1 },
  paused: { scale: 0.72, bloom: 0.1 },
};

export function resolveInterviewVoiceAuraPresenceTarget(
  phase: InterviewVoiceAuraPhase,
  audioLevel: number,
): number {
  if (phase === 'paused' || phase === 'connecting' || phase === 'awaiting-mic') return 0;
  const clamped = Math.max(0, Math.min(1, audioLevel));
  return Math.pow(clamped, 0.58);
}

/** Envelope for entering/exiting the speaking visual state — fast attack, quicker release. */
export function smoothInterviewVoiceAuraPresence(prev: number, target: number): number {
  const rate = target > prev ? 0.24 : 0.16;
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
    coreScale: idle.coreScale + (speaking.coreScale - idle.coreScale) * t,
    shiftX: idle.shiftX + (speaking.shiftX - idle.shiftX) * t,
    shiftY: idle.shiftY + (speaking.shiftY - idle.shiftY) * t,
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
    scale: base.scale + breath * 0.04,
    bloom: base.bloom + breath * 0.05,
    coreScale: 0.92 + breath * 0.04,
    shiftX: driftA * 6,
    shiftY: driftB * 5,
    coreGlow: 0.18 + breath * 0.05,
  };
}

function sampleSpeakingMotion(elapsedSec: number, audioLevel: number): InterviewVoiceAuraMotion {
  const t = elapsedSec;
  const driftA = Math.sin(t * 0.55);
  const driftB = Math.cos(t * 0.42);
  const level = Math.max(0, Math.min(1, audioLevel));
  const syllable = 0.5 + 0.5 * Math.sin(t * 15.5 + level * 6.2);
  const voice = level * (0.72 + syllable * 0.28);

  return {
    scale: 0.84 + voice * 0.62 + syllable * level * 0.14,
    bloom: Math.min(1.22, 0.22 + voice * 0.96),
    coreScale: 0.86 + voice * 0.52 + syllable * level * 0.2,
    shiftX: driftA * (8 + voice * 42) + syllable * level * 22,
    shiftY: driftB * (8 + voice * 36) - syllable * level * 20,
    coreGlow: 0.32 + voice * 0.68,
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
      coreScale: 0.9 + pulse * 0.05,
      shiftX: driftA * 5,
      shiftY: driftB * 4,
      coreGlow: 0.2 + pulse * 0.08,
    };
  }

  const breath = 0.5 + 0.5 * Math.sin(t * 1.1);
  return {
    scale: base.scale + breath * 0.02,
    bloom: base.bloom + breath * 0.03,
    coreScale: 0.88 + breath * 0.02,
    shiftX: driftA * 3,
    shiftY: driftB * 3,
    coreGlow: 0.14,
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
