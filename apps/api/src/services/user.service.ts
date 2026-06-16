import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import { USER_ROLES, type UserRole } from '../auth/rbac';
import { APPROVAL_STATUS, type ApprovalStatus } from '../auth/approval';
import type { User } from '../schemas/user.schema';
import {
  hasCompletedIntakeAccess,
  readSessionIntakeEnvelope,
  type SessionIntakeEnvelope,
  type WelcomeIntroCache,
} from '@financial-agent/shared';
import type {
  StoredPanelState,
  StoredSheet,
  StoredKnowledgeEvent,
  StoredUser,
} from '../persistencia/types';
import {
  createUserRecord,
  deleteUserRecord,
  getUserByEmail,
  getUserById,
  patchUserRecord,
} from '../persistencia/repos';
import { invalidateContextPackCache } from '../context-fabric/context-pack.service';

function toUser(record: Awaited<ReturnType<typeof getUserById>>): User | null {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    passwordHash: record.passwordHash,
    role: record.role,
    approvalStatus: record.approvalStatus,
    approvedAt: record.approvedAt,
    approvedByEmail: record.approvedByEmail,
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
    updatedAt: record.updatedAt,
    memoryBlob: record.memoryBlob,
    usdSpentTotal: record.usdSpentTotal ?? 0,
    fincoinDepletedAt: record.fincoinDepletedAt,
    fincoinDepletionHandled: record.fincoinDepletionHandled ?? false,
  };
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  approvalStatus?: ApprovalStatus;
  approvedAt?: string;
  approvedByEmail?: string;
}): Promise<User> {
  const user = await createUserRecord({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role ?? USER_ROLES.USER,
    approvalStatus: data.approvalStatus ?? APPROVAL_STATUS.APPROVED,
    approvedAt: data.approvedAt,
    approvedByEmail: data.approvedByEmail,
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

export async function updateUserAuthSecurity(
  userId: string,
  patch: {
    role?: UserRole;
    passwordHash?: string;
    approvalStatus?: ApprovalStatus;
    approvedAt?: string | null;
    approvedByEmail?: string | null;
    memoryBlob?: Record<string, unknown> | null;
  },
): Promise<User | null> {
  const updated = await patchUserRecord(userId, {
    ...patch,
    approvedAt: patch.approvedAt ?? undefined,
    approvedByEmail: patch.approvedByEmail ?? undefined,
    memoryBlob: patch.memoryBlob ?? undefined,
  });
  return toUser(updated);
}

export async function updateUserAuthSecurityIfUnchanged(
  userId: string,
  expectedUpdatedAt: string,
  patch: {
    role?: UserRole;
    passwordHash?: string;
    approvalStatus?: ApprovalStatus;
    approvedAt?: string | null;
    approvedByEmail?: string | null;
    memoryBlob?: Record<string, unknown> | null;
  },
): Promise<User | null> {
  const current = await loadUserById(userId);
  if (!current || current.updatedAt !== expectedUpdatedAt) {
    return null;
  }

  const updated = await patchUserRecord(userId, {
    ...patch,
    approvedAt: patch.approvedAt ?? undefined,
    approvedByEmail: patch.approvedByEmail ?? undefined,
    memoryBlob: patch.memoryBlob ?? undefined,
  }, { expectedUpdatedAt });
  return toUser(updated);
}

export async function attachProfileToUser(
  userId: string,
  profile: FinancialDiagnosticProfile | Record<string, unknown>,
): Promise<boolean> {
  const updated = await patchUserRecord(userId, {
    injectedProfile: profile as FinancialDiagnosticProfile,
  });
  return Boolean(updated);
}

export type QuestionnaireIntakePayload = {
  intake: unknown;
  llmSummary?: unknown;
  intakeContext?: unknown;
};

/** Product path: questionnaire is immutable after first successful submit. */
export async function submitQuestionnaireIntakeOnce(
  userId: string,
  payload: QuestionnaireIntakePayload,
): Promise<'created' | 'already_completed' | false> {
  const user = await getUserById(userId);
  if (hasCompletedIntakeAccess(user?.injectedIntake)) {
    return 'already_completed';
  }

  const existing = readSessionIntakeEnvelope(user?.injectedIntake);
  const nextEnvelope: SessionIntakeEnvelope = {
    ...existing,
    intake: payload.intake as Record<string, unknown>,
    llmSummary: payload.llmSummary,
    intakeContext: payload.intakeContext,
    welcomeIntroCache: existing.welcomeIntroCache,
  };

  const updated = await patchUserRecord(userId, {
    injectedIntake: nextEnvelope as StoredUser['injectedIntake'],
  });
  if (updated) invalidateContextPackCache(userId);
  return updated ? 'created' : false;
}

/** Post-onboarding questionnaire corrections — free, preserves panel context layers. */
export async function updateQuestionnaireIntake(
  userId: string,
  payload: QuestionnaireIntakePayload,
): Promise<boolean> {
  const user = await getUserById(userId);
  if (!hasCompletedIntakeAccess(user?.injectedIntake)) {
    return false;
  }

  const existing = readSessionIntakeEnvelope(user?.injectedIntake);
  const nextEnvelope: SessionIntakeEnvelope = {
    ...existing,
    intake: payload.intake as Record<string, unknown>,
    intakeContext: payload.intakeContext,
    llmSummary: existing.llmSummary,
    welcomeIntroCache: existing.welcomeIntroCache,
    productsContext: existing.productsContext,
    budgetContext: existing.budgetContext,
  };

  const updated = await patchUserRecord(userId, {
    injectedIntake: nextEnvelope as StoredUser['injectedIntake'],
  });
  if (updated) invalidateContextPackCache(userId);
  return Boolean(updated);
}

/** Panel path: merge cartolas/presupuesto without touching questionnaire answers. */
export async function mergeFinancialContextIntoIntake(
  userId: string,
  payload: {
    productsContext: unknown;
    budgetContext?: unknown;
  },
): Promise<boolean> {
  const user = await getUserById(userId);
  const existing = readSessionIntakeEnvelope(user?.injectedIntake);
  const nextEnvelope: SessionIntakeEnvelope = {
    ...existing,
    intake: existing.intake ?? {},
    intakeContext: existing.intakeContext ?? {},
    productsContext: payload.productsContext,
    budgetContext:
      payload.budgetContext && typeof payload.budgetContext === 'object'
        ? payload.budgetContext
        : existing.budgetContext,
  };

  const updated = await patchUserRecord(userId, {
    injectedIntake: nextEnvelope as StoredUser['injectedIntake'],
  });
  if (updated) invalidateContextPackCache(userId);
  return Boolean(updated);
}

/** Dev/QA only — full envelope replace (ENABLE_DEV_INJECTION). */
export async function replaceIntakeEnvelopeForDev(
  userId: string,
  envelope: SessionIntakeEnvelope,
): Promise<boolean> {
  const user = await getUserById(userId);
  const existing = readSessionIntakeEnvelope(user?.injectedIntake);
  const nextEnvelope: SessionIntakeEnvelope = {
    ...envelope,
    welcomeIntroCache: envelope.welcomeIntroCache ?? existing.welcomeIntroCache,
  };

  const updated = await patchUserRecord(userId, {
    injectedIntake: nextEnvelope as StoredUser['injectedIntake'],
  });
  return Boolean(updated);
}

export async function persistWelcomeIntroCache(
  userId: string,
  welcomeIntroCache: WelcomeIntroCache,
): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;

  const existing = readSessionIntakeEnvelope(user.injectedIntake);

  const updated = await patchUserRecord(userId, {
    injectedIntake: {
      ...existing,
      welcomeIntroCache,
    } as StoredUser['injectedIntake'],
  });
  return Boolean(updated);
}

export async function removeInjectedIntakeFromUser(userId: string): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedIntake: null as never });
  return Boolean(updated);
}

export async function removeInjectedProfileFromUser(userId: string): Promise<boolean> {
  const updated = await patchUserRecord(userId, { injectedProfile: null as never });
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
  if (updated) invalidateContextPackCache(userId);
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

export async function deleteUserAccount(userId: string): Promise<boolean> {
  return deleteUserRecord(userId);
}
