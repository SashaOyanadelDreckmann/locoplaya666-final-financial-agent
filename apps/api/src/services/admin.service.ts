import type { UserRole } from '../auth/rbac';
import type { ApprovalStatus } from '../auth/approval';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../persistence/provider';

type AdminSessionSnapshot = {
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  rotatedFromHash: string | null;
};

type AdminProfileSnapshot = {
  id: string;
  createdAt: string;
  payload: unknown;
};

type AdminDocumentSnapshot = {
  id: string;
  name: string;
  kind: string;
  source: string;
  mimeType: string | null;
  sizeBytes: number | null;
  textPreview: string | null;
  extractedText: string | null;
  summary: unknown;
  structuredData: unknown;
  openaiFileId: string | null;
  vectorStoreId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserSnapshot = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  approvedByEmail: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  latestDiagnosticProfileId: string | null;
  latestDiagnosticCompletedAt: string | null;
  knowledgeBaseScore: number;
  knowledgeScore: number;
  knowledgeHistory: unknown;
  knowledgeLastUpdated: string;
  injectedProfile: unknown;
  injectedIntake: unknown;
  panelState: unknown;
  sheets: unknown;
  memoryBlob: unknown;
  vectorStore: {
    vectorStoreId: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  sessions: AdminSessionSnapshot[];
  profiles: AdminProfileSnapshot[];
  documents: AdminDocumentSnapshot[];
};

export type AdminUsersFullDump = {
  generatedAt: string;
  totalUsers: number;
  users: AdminUserSnapshot[];
};

function redactSecret(): string {
  return '[REDACTED]';
}

function truncatePreview(value: string | null | undefined, max = 400): string | null {
  if (!value) return null;
  const compact = String(value).replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function toAdminDocumentSnapshot(document: {
  id: string;
  name: string;
  kind: string;
  source: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  textPreview?: string | null;
  summary?: unknown;
  structuredData?: unknown;
  openaiFileId?: string | null;
  vectorStoreId?: string | null;
  status: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}): AdminDocumentSnapshot {
  return {
    id: document.id,
    name: document.name,
    kind: document.kind,
    source: document.source,
    mimeType: document.mimeType ?? null,
    sizeBytes: document.sizeBytes ?? null,
    textPreview: truncatePreview(document.textPreview),
    extractedText: null,
    summary: document.summary ?? null,
    structuredData: document.structuredData ?? null,
    openaiFileId: document.openaiFileId ?? null,
    vectorStoreId: document.vectorStoreId ?? null,
    status: document.status,
    error: document.error ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateScore(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string) {
  return [...items].sort((a, b) => dateScore(getDate(b)) - dateScore(getDate(a)));
}

function buildFromMemory(): AdminUsersFullDump {
  const users = Array.from(memoryStore.users.values()).map((user) => {
    const sessions = sortByDateDesc(
      Array.from(memoryStore.sessions.values())
        .filter((session) => session.userId === user.id)
        .map((session) => ({
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastSeenAt: null,
          rotatedFromHash: null,
        })),
      (session) => session.createdAt,
    );

    const profiles = sortByDateDesc(
      Array.from(memoryStore.profiles.values())
        .filter((profile) => profile.userId === user.id)
        .map((profile) => ({
          id: profile.id,
          createdAt: profile.createdAt,
          payload: profile.payload,
        })),
      (profile) => profile.createdAt,
    );

    const documents = sortByDateDesc(
      Array.from(memoryStore.documents.values())
        .filter((document) => document.userId === user.id)
        .map((document) =>
          toAdminDocumentSnapshot({
            id: document.id,
            name: document.name,
            kind: document.kind,
            source: document.source,
            mimeType: document.mimeType ?? null,
            sizeBytes: document.sizeBytes ?? null,
            textPreview: document.textPreview ?? null,
            summary: document.summary ?? null,
            structuredData: document.structuredData ?? null,
            openaiFileId: document.openaiFileId ?? null,
            vectorStoreId: document.vectorStoreId ?? null,
            status: document.status,
            error: document.error ?? null,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          })
        ),
      (document) => document.createdAt,
    );

    const vectorStoreRecord = memoryStore.vectorStores.get(user.id);
    const vectorStore = vectorStoreRecord
      ? {
          vectorStoreId: vectorStoreRecord.vectorStoreId,
          createdAt: vectorStoreRecord.createdAt,
          updatedAt: vectorStoreRecord.updatedAt,
        }
      : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      approvedAt: user.approvedAt ?? null,
      approvedByEmail: user.approvedByEmail ?? null,
      passwordHash: redactSecret(),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      latestDiagnosticProfileId: user.latestDiagnosticProfileId ?? null,
      latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt ?? null,
      knowledgeBaseScore: user.knowledgeBaseScore,
      knowledgeScore: user.knowledgeScore,
      knowledgeHistory: user.knowledgeHistory,
      knowledgeLastUpdated: user.knowledgeLastUpdated,
      injectedProfile: user.injectedProfile ?? null,
      injectedIntake: user.injectedIntake ?? null,
      panelState: user.panelState ?? null,
      sheets: user.sheets ?? null,
      memoryBlob: user.memoryBlob ?? null,
      vectorStore,
      sessions,
      profiles,
      documents,
    } satisfies AdminUserSnapshot;
  });

  const sortedUsers = sortByDateDesc(users, (user) => user.createdAt);

  return {
    generatedAt: new Date().toISOString(),
    totalUsers: sortedUsers.length,
    users: sortedUsers,
  };
}

async function buildFromPostgres(): Promise<AdminUsersFullDump> {
  const prisma = await getPrismaClient();
  const rows = await prisma.user.findMany({
    include: {
      sessions: {
        orderBy: { createdAt: 'desc' },
      },
      profiles: {
        orderBy: { createdAt: 'desc' },
      },
      documents: {
        orderBy: { createdAt: 'desc' },
      },
      vectorStore: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const users = rows.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    approvalStatus: user.approvalStatus,
    approvedAt: toIso(user.approvedAt),
    approvedByEmail: user.approvedByEmail ?? null,
    passwordHash: redactSecret(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    latestDiagnosticProfileId: user.latestDiagnosticProfileId ?? null,
    latestDiagnosticCompletedAt: toIso(user.latestDiagnosticCompletedAt),
    knowledgeBaseScore: Number(user.knowledgeBaseScore ?? 0),
    knowledgeScore: Number(user.knowledgeScore ?? 0),
    knowledgeHistory: user.knowledgeHistory ?? null,
    knowledgeLastUpdated: user.knowledgeLastUpdated.toISOString(),
    injectedProfile: user.injectedProfile ?? null,
    injectedIntake: user.injectedIntake ?? null,
    panelState: user.panelState ?? null,
    sheets: user.sheets ?? null,
    memoryBlob: user.memoryBlob ?? null,
    vectorStore: user.vectorStore
      ? {
          vectorStoreId: user.vectorStore.vectorStoreId,
          createdAt: user.vectorStore.createdAt.toISOString(),
          updatedAt: user.vectorStore.updatedAt.toISOString(),
        }
      : null,
    sessions: user.sessions.map((session) => ({
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      rotatedFromHash: null,
    })),
    profiles: user.profiles.map((profile) => ({
      id: profile.id,
      createdAt: profile.createdAt.toISOString(),
      payload: profile.payload,
    })),
    documents: user.documents.map((document) =>
      toAdminDocumentSnapshot({
        id: document.id,
        name: document.name,
        kind: document.kind,
        source: document.source,
        mimeType: document.mimeType ?? null,
        sizeBytes: document.sizeBytes ?? null,
        textPreview: document.textPreview ?? null,
        summary: document.summary ?? null,
        structuredData: document.structuredData ?? null,
        openaiFileId: document.openaiFileId ?? null,
        vectorStoreId: document.vectorStoreId ?? null,
        status: document.status,
        error: document.error ?? null,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })
    ),
  })) satisfies AdminUserSnapshot[];

  return {
    generatedAt: new Date().toISOString(),
    totalUsers: users.length,
    users,
  };
}

export async function listAdminUsersFullDump(): Promise<AdminUsersFullDump> {
  return getPersistenceMode() === 'memory' ? buildFromMemory() : buildFromPostgres();
}
