import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import { USER_ROLES, type UserRole } from '../auth/rbac';
import type { User } from '../schemas/user.schema';
import type {
  StoredPanelState,
  StoredSheet,
  StoredKnowledgeEvent,
} from '../persistence/types';
import {
  createUserRecord,
  getUserByEmail,
  getUserById,
  patchUserRecord,
} from '../persistence/repos';

function toUser(record: Awaited<ReturnType<typeof getUserById>>): User | null {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    passwordHash: record.passwordHash,
    role: record.role,
    injectedProfile: record.injectedProfile,
    injectedIntake: record.injectedIntake,
    latestDiagnosticProfileId: record.latestDiagnosticProfileId,
    latestDiagnosticCompletedAt: record.latestDiagnosticCompletedAt,
    panelState: record.panelState,
    sheets: record.sheets,
    knowledgeBaseScore: record.knowledgeBaseScore,
    knowledgeScore: record.knowledgeScore,
    knowledgeHistory: record.knowledgeHistory,
    knowledgeLastUpdated: record.knowledgeLastUpdated,
    memoryBlob: record.memoryBlob,
  };
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}): Promise<User> {
  const user = await createUserRecord({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role ?? USER_ROLES.USER,
  });

  return toUser(user)!;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const record = await getUserByEmail(email);
  return toUser(record);
}

export async function loadUserById(userId: string): Promise<User | null> {
  const record = await getUserById(userId);
  return toUser(record);
}

export async function attachProfileToUser(
  userId: string,
  profile: FinancialDiagnosticProfile | Record<string, unknown>,
): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedProfile: profile });
  return Boolean(updated);
}

export async function attachIntakeToUser(
  userId: string,
  intakePayload: { intake: unknown; llmSummary?: unknown; intakeContext?: unknown },
): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedIntake: intakePayload });
  return Boolean(updated);
}

export async function removeInjectedIntakeFromUser(userId: string): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedIntake: null });
  return Boolean(updated);
}

export async function removeInjectedProfileFromUser(userId: string): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedProfile: null });
  return Boolean(updated);
}

export type StoredReport = {
  id: string;
  title: string;
  group: 'plan_action' | 'simulation' | 'budget' | 'diagnosis' | 'other';
  fileUrl: string;
  createdAt: string;
};

export type StoredUploadedDocument = {
  name: string;
  text: string;
};

export { StoredSheet, StoredPanelState };

export async function saveUserSheets(userId: string, sheets: StoredSheet[]): Promise<boolean> {
  const updated = await patchUserRecord(userId, { sheets });
  return Boolean(updated);
}

export async function loadUserSheets(userId: string): Promise<StoredSheet[] | null> {
  const user = await getUserById(userId);
  return (user?.sheets ?? null) as StoredSheet[] | null;
}

export async function attachDiagnosticProfileToUser(
  userId: string,
  profileId: string,
): Promise<boolean> {
  const updated = await patchUserRecord(userId, {
    latestDiagnosticProfileId: profileId,
    latestDiagnosticCompletedAt: new Date().toISOString(),
  });
  return Boolean(updated);
}

export async function saveUserPanelState(
  userId: string,
  panelState: StoredPanelState,
): Promise<boolean> {
  const updated = await patchUserRecord(userId, { panelState });
  return Boolean(updated);
}

export async function loadUserPanelState(userId: string): Promise<StoredPanelState | null> {
  const user = await getUserById(userId);
  return (user?.panelState ?? null) as StoredPanelState | null;
}

export async function loadUserKnowledgeState(userId: string): Promise<{
  knowledgeBaseScore: number;
  knowledgeScore: number;
  knowledgeHistory: StoredKnowledgeEvent[];
  knowledgeLastUpdated: string;
} | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  return {
    knowledgeBaseScore: user.knowledgeBaseScore,
    knowledgeScore: user.knowledgeScore,
    knowledgeHistory: user.knowledgeHistory,
    knowledgeLastUpdated: user.knowledgeLastUpdated,
  };
}

export async function updateUserKnowledgeState(
  userId: string,
  payload: {
    knowledgeBaseScore: number;
    knowledgeScore: number;
    knowledgeHistory: StoredKnowledgeEvent[];
    knowledgeLastUpdated: string;
  },
): Promise<boolean> {
  const updated = await patchUserRecord(userId, payload);
  return Boolean(updated);
}

export async function loadUserMemoryBlob(userId: string): Promise<Record<string, unknown> | null> {
  const user = await getUserById(userId);
  if (!user?.memoryBlob || typeof user.memoryBlob !== 'object') return null;
  return user.memoryBlob;
}

export async function saveUserMemoryBlob(
  userId: string,
  memoryBlob: Record<string, unknown>,
): Promise<boolean> {
  const updated = await patchUserRecord(userId, { memoryBlob });
  return Boolean(updated);
}
