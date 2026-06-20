import fs from 'fs';
import { USER_ROLES } from '../auth/rbac';
import { badRequest, notFound } from '../http/api.errors';
import { getUserVectorStoreRecord } from '../persistencia/repos/document.repository';
import { deleteUserRecord } from '../persistencia/repos/user.repository';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../persistencia/provider';
import { getSimulationArtifactsDir } from './simulations/simulation.service';
import { loadUserById } from './user.service';

export type AdminDeleteUserResult = {
  deleted: true;
  userId: string;
  email: string;
};

async function countAdminUsers(excludeUserId?: string): Promise<number> {
  if (getPersistenceMode() === 'memory') {
    return Array.from(memoryStore.users.values()).filter(
      (user) => user.role === USER_ROLES.ADMIN && user.id !== excludeUserId,
    ).length;
  }

  const prisma = await getPrismaClient();
  return prisma.user.count({
    where: {
      role: USER_ROLES.ADMIN,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

function removeUserArtifactDirectory(userId: string): void {
  const dir = getSimulationArtifactsDir(userId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort filesystem cleanup; DB delete is authoritative.
  }
}

async function removeHostedVectorStore(userId: string): Promise<void> {
  if (process.env.ENABLE_OPENAI_FILE_SEARCH === 'false') return;

  try {
    const record = await getUserVectorStoreRecord(userId);
    const vectorStoreId = record?.vectorStoreId?.trim();
    if (!vectorStoreId) return;

    const { getOpenAIClient } = await import('./llm.service');
    const client = getOpenAIClient() as {
      vectorStores?: { delete?: (id: string) => Promise<unknown> };
    };
    await client.vectorStores?.delete?.(vectorStoreId);
  } catch {
    // OpenAI cleanup is optional; orphaned stores do not break the app.
  }
}

export async function deleteUserByAdmin(params: {
  actorId: string;
  userId: string;
}): Promise<AdminDeleteUserResult> {
  const target = await loadUserById(params.userId);
  if (!target) {
    throw notFound('User not found');
  }

  if (params.actorId === params.userId) {
    throw badRequest('No puedes eliminar tu propia cuenta desde el panel admin');
  }

  if (target.role === USER_ROLES.ADMIN) {
    const remainingAdmins = await countAdminUsers(params.userId);
    if (remainingAdmins <= 0) {
      throw badRequest('No puedes eliminar al último administrador');
    }
  }

  await removeHostedVectorStore(params.userId);
  removeUserArtifactDirectory(params.userId);

  const deleted = await deleteUserRecord(params.userId);
  if (!deleted) {
    throw notFound('User not found');
  }

  return {
    deleted: true,
    userId: target.id,
    email: target.email,
  };
}
