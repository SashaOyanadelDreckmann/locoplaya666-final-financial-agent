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

import { saveSocialReflectionsToServer } from '@/lib/api/cliente';

function storageKey(userId?: string | null): string {
  const scope = String(userId ?? 'anonymous').trim() || 'anonymous';
  return `fa.social-consciousness-reflections:${scope}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  const globalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  return globalStorage ?? null;
}

export function readSocialReflectionSession(userId?: string | null): SocialReflectionSession | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SocialReflectionSession;
    if (!parsed || !Array.isArray(parsed.answers) || parsed.answers.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSocialReflectionSession(
  userId: string | null | undefined,
  session: SocialReflectionSession,
): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(userId), JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSocialReflectionSession(userId?: string | null): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

export function hydrateSocialReflectionSessionFromServer(
  userId: string | null | undefined,
  serverSession: SocialReflectionSession | null | undefined,
): void {
  if (!serverSession || serverSession.answers.length === 0) return;
  const local = readSocialReflectionSession(userId);
  const serverTs = Date.parse(serverSession.updatedAt ?? serverSession.completedAt);
  const localTs = local ? Date.parse(local.updatedAt ?? local.completedAt) : 0;
  if (!local || (Number.isFinite(serverTs) && serverTs >= localTs)) {
    writeSocialReflectionSession(userId, serverSession);
  }
}

export async function persistSocialReflectionSession(
  userId: string | null | undefined,
  session: SocialReflectionSession,
): Promise<void> {
  const payload: SocialReflectionSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  writeSocialReflectionSession(userId, payload);
  try {
    await saveSocialReflectionsToServer(payload);
  } catch {
    // offline/local cache remains available for the next send
  }
}

export function buildSocialReflectionContextBlock(session: SocialReflectionSession | null): string | null {
  if (!session || session.answers.length === 0) return null;
  const lines = session.answers.map((answer) => {
    const sub = answer.choiceSubtext ? ` (${answer.choiceSubtext})` : '';
    return `- ${answer.question} → "${answer.choiceLabel}"${sub}`;
  });
  return [
    'Reflexiones previas del modal de conciencia social (integrar con tacto, no repetir literalmente):',
    ...lines,
  ].join('\n');
}
