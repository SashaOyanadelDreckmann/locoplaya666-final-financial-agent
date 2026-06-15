export type InterviewVoiceAuraAudioSampler = {
  sampleLevel: () => number;
  dispose: () => void;
};

type AudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return ctor ?? null;
}

/** Normalize RMS from time-domain samples into a 0–1 envelope. */
export function normalizeInterviewVoiceAuraRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return Math.min(1, Math.pow(rms * 5.4, 0.84));
}

/** Syllable-level smoothing — slower attack keeps the onset gentle. */
export function smoothInterviewVoiceAuraLevel(prev: number, next: number): number {
  const attack = next > prev ? 0.34 : 0.2;
  return prev + (next - prev) * attack;
}

export function bindInterviewVoiceAuraAudio(stream: MediaStream | null): InterviewVoiceAuraAudioSampler | null {
  const AudioContextClass = resolveAudioContextCtor();
  if (!AudioContextClass || !stream) return null;

  const ctx = new AudioContextClass();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.58;

  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);

  const timeData = new Uint8Array(analyser.fftSize);
  let smoothed = 0;

  return {
    sampleLevel() {
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      analyser.getByteTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const amp = (timeData[i] - 128) / 128;
        sumSq += amp * amp;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const raw = normalizeInterviewVoiceAuraRms(rms);
      smoothed = smoothInterviewVoiceAuraLevel(smoothed, raw);
      return smoothed;
    },
    dispose() {
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
    },
  };
}
