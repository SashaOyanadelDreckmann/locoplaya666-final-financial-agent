export type SocialReflectionAnswer = {
  questionId: string;
  question: string;
  choiceId: string;
  choiceLabel: string;
  choiceSubtext?: string;
  thinker?: string;
};

export type SocialReflectionSession = {
  answers: SocialReflectionAnswer[];
  completedAt: string;
  updatedAt?: string;
};

const MAX_ANSWERS = 12;
const MAX_TEXT = 280;

function compactText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeSocialReflectionSession(raw: unknown): SocialReflectionSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SocialReflectionSession>;
  const answers: SocialReflectionAnswer[] = Array.isArray(candidate.answers)
    ? candidate.answers
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const answer = item as Partial<SocialReflectionAnswer>;
          const questionId = compactText(answer.questionId, 64);
          const choiceId = compactText(answer.choiceId, 64);
          const question = compactText(answer.question);
          const choiceLabel = compactText(answer.choiceLabel, 120);
          if (!questionId || !choiceId || !question || !choiceLabel) return null;
          const normalized: SocialReflectionAnswer = {
            questionId,
            question,
            choiceId,
            choiceLabel,
          };
          if (answer.choiceSubtext) {
            normalized.choiceSubtext = compactText(answer.choiceSubtext, 160);
          }
          if (answer.thinker) {
            normalized.thinker = compactText(answer.thinker, 120);
          }
          return normalized;
        })
        .filter((item): item is SocialReflectionAnswer => item !== null)
        .slice(0, MAX_ANSWERS)
    : [];

  if (answers.length === 0) return null;

  const completedAt =
    typeof candidate.completedAt === 'string' && candidate.completedAt.trim().length > 0
      ? candidate.completedAt
      : new Date().toISOString();

  return {
    answers,
    completedAt,
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim().length > 0
        ? candidate.updatedAt
        : completedAt,
  };
}

export function getSocialReflectionsFromMemory(memoryBlob: unknown): SocialReflectionSession | null {
  if (!memoryBlob || typeof memoryBlob !== 'object') return null;
  const raw = (memoryBlob as Record<string, unknown>).socialConsciousnessReflections;
  return sanitizeSocialReflectionSession(raw);
}

export function mergeSocialReflectionsInMemory(
  memoryBlob: unknown,
  session: SocialReflectionSession,
): Record<string, unknown> {
  const base =
    memoryBlob && typeof memoryBlob === 'object'
      ? { ...(memoryBlob as Record<string, unknown>) }
      : {};
  const sanitized = sanitizeSocialReflectionSession({
    ...session,
    updatedAt: new Date().toISOString(),
  });
  if (!sanitized) return base;
  return {
    ...base,
    socialConsciousnessReflections: sanitized,
  };
}

export function pickSocialReflectionSession(
  ...candidates: Array<SocialReflectionSession | null | undefined>
): SocialReflectionSession | null {
  let best: SocialReflectionSession | null = null;
  for (const candidate of candidates) {
    if (!candidate || candidate.answers.length === 0) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    const candidateTs = Date.parse(candidate.updatedAt ?? candidate.completedAt);
    const bestTs = Date.parse(best.updatedAt ?? best.completedAt);
    if (Number.isFinite(candidateTs) && (!Number.isFinite(bestTs) || candidateTs >= bestTs)) {
      best = candidate;
    }
  }
  return best;
}
