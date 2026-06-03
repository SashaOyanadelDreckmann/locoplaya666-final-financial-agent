export const INTERVIEW_TOTAL_LIMIT_SEC = 180;
export const INTERVIEW_TOTAL_LIMIT_MINUTES = Math.ceil(INTERVIEW_TOTAL_LIMIT_SEC / 60);
export const INTERVIEW_CLOSEOUT_BUFFER_SEC = 25;
export const INTERVIEW_MAX_CALLS_PER_USER = 1;

/** Voces Realtime recomendadas para entrevista en español chileno (override con OPENAI_REALTIME_VOICE). */
export const INTERVIEW_REALTIME_VOICES = [
  'marin',
  'cedar',
  'ash',
  'echo',
  'verse',
  'ballad',
  'coral',
  'sage',
  'alloy',
  'shimmer',
] as const;

export type InterviewRealtimeVoice = (typeof INTERVIEW_REALTIME_VOICES)[number];

/** Cedar: tono grave, ejecutivo y estable para entrevista senior. */
export const INTERVIEW_REALTIME_VOICE_DEFAULT: InterviewRealtimeVoice = 'cedar';

/** Ritmo pausado y claro — entrevista ejecutiva (0.25–1.5). */
export const INTERVIEW_REALTIME_VOICE_SPEED = 1;
