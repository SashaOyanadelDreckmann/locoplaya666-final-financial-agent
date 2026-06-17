import { getApiBaseUrl } from './base';
import { parseApiResponse } from './envelope';
import { getCsrfToken } from '@/lib/sesion/csrf';

function withCsrf(headers: Record<string, string> = {}): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers, 'X-CSRF-Token': token };
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: withCsrf({
      ...(init?.headers as Record<string, string> | undefined),
    }),
  });
  return parseApiResponse<T>(res);
}

export type AdminSessionSnapshot = {
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  rotatedFromHash: string | null;
};

export type AdminProfileSnapshot = {
  id: string;
  createdAt: string;
  payload: unknown;
};

export type AdminDocumentSnapshot = {
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
  role: 'USER' | 'ANALYST' | 'ADMIN';
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approvedAt: string | null;
  approvedByEmail: string | null;
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
  usdSpentTotal: number;
  fincoinDepletedAt: string | null;
  fincoinDepletionHandled: boolean;
};

export type AdminUsersFullDump = {
  generatedAt: string;
  totalUsers: number;
  users: AdminUserSnapshot[];
};

export type AdminArchiveUserListItem = {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ANALYST' | 'ADMIN';
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  documentsCount: number;
  profilesCount: number;
};

export type AdminArchiveUsersPage = {
  generatedAt: string;
  total: number;
  users: AdminArchiveUserListItem[];
};

export type AdminAuditEntry = {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetUserId?: string;
  meta?: Record<string, unknown>;
};

export type AdminAuditPage = {
  entries: AdminAuditEntry[];
  total: number;
};

export type ResearchAnalyticsStage = 'new' | 'onboarding' | 'diagnosis' | 'building' | 'active' | 'advanced' | 'stale';

export type ResearchAnalyticsUser = {
  pseudonymId: string;
  role: 'USER' | 'ANALYST' | 'ADMIN';
  createdAtMonth: string;
  lastSessionSeenAtBucket: string;
  lastActivityBucket: string;
  daysSinceCreated: number;
  daysSinceLastActivity: number | null;
  stage: ResearchAnalyticsStage;
  progressScore: number;
  interactionsCount: number;
  sessionsCount: number;
  profilesCount: number;
  documentsCount: number;
  sheetsCount: number;
  budgetRowsCount: number;
  savedReportsCount: number;
  knowledgeScore: number;
  knowledgeBaseScore: number;
  modesUsed: string[];
  toolsUsedCount: number;
  artifactsGeneratedCount: number;
  hasIntake: boolean;
  hasProfile: boolean;
  hasDocuments: boolean;
};

export type ResearchAnalyticsSummary = {
  totalUsers: number;
  totalInteractions: number;
  activeUsers7d: number;
  activeUsers30d: number;
  avgProgressScore: number;
  avgKnowledgeScore: number;
  avgKnowledgeBaseScore: number;
  intakeCompletionRate: number;
  profileAttachmentRate: number;
  documentAdoptionRate: number;
  stageCounts: Record<ResearchAnalyticsStage, number>;
  topModes: Array<{ mode: string; count: number }>;
  topTools: Array<{ tool: string; count: number }>;
};

export type ResearchAnalyticsCohort = {
  month: string;
  users: number;
  active7d: number;
  active30d: number;
  avgProgressScore: number;
  avgKnowledgeScore: number;
};

export type ResearchAnalyticsReport = {
  generatedAt: string;
  summary: ResearchAnalyticsSummary;
  cohorts: ResearchAnalyticsCohort[];
  users: ResearchAnalyticsUser[];
};

export async function fetchAdminArchiveUsers(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminArchiveUsersPage> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return adminFetch<AdminArchiveUsersPage>(`/api/admin/users${suffix}`);
}

export async function fetchAdminUserSnapshot(userId: string): Promise<AdminUserSnapshot> {
  return adminFetch<AdminUserSnapshot>(`/api/admin/users/${encodeURIComponent(userId)}/snapshot`);
}

export async function fetchAdminUsersFullDump(): Promise<AdminUsersFullDump> {
  return adminFetch<AdminUsersFullDump>('/api/admin/users/full');
}

export async function fetchResearchAnalyticsReport(): Promise<ResearchAnalyticsReport> {
  return adminFetch<ResearchAnalyticsReport>('/api/analytics/research');
}

export type AdminCockpitSnapshot = {
  generatedAt: string;
  platform: {
    totalUsers: number;
    byApproval: Record<'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED', number>;
    byRole: Record<'USER' | 'ANALYST' | 'ADMIN', number>;
    pendingApprovals: Array<{
      id: string;
      name: string;
      email: string;
      role: 'USER' | 'ANALYST' | 'ADMIN';
      createdAt: string;
    }>;
    recentSignups: Array<{
      id: string;
      name: string;
      email: string;
      role: 'USER' | 'ANALYST' | 'ADMIN';
      createdAt: string;
      approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
    }>;
    fincoin: {
      totalUsdSpent: number;
      depletedUsers: number;
      activeWallets: number;
      avgUsdPerUser: number;
    };
    totals: {
      sessions: number;
      documents: number;
      profiles: number;
      conversationTurns: number;
    };
  };
  research: ResearchAnalyticsSummary;
  observability: {
    http: {
      totalEndpoints: number;
      totalRequests: number;
      totalClientErrors: number;
      totalServerErrors: number;
      avgLatencyMs: number;
    };
    topEndpoints: Array<{ route: string; count: number; avgMs: number }>;
    topTools: Array<{ tool: string; count: number; avgMs: number }>;
  };
};

export type AdminUserDossier = {
  generatedAt: string;
  user: AdminUserSnapshot;
  fincoin: {
    usdSpent: number;
    usdRemaining: number;
    maxUsdSpend: number;
    depleted: boolean;
    percentUsed: number;
    remainingFincoins: number;
    spentFincoins: number;
    initialFincoins: number;
  };
  conversationTurnsCount: number;
  recentTurns: Array<{
    id: string;
    chatId: string;
    sessionId: string | null;
    createdAt: string;
    userMessage: string;
    assistantMessage: string;
  }>;
  memoryHighlights: {
    timelineCount: number;
    factsCount: number;
    productLifecycle: unknown;
    interviewVoice: unknown;
    socialReflections: unknown;
  };
};

export async function fetchAdminCockpitSnapshot(): Promise<AdminCockpitSnapshot> {
  return adminFetch<AdminCockpitSnapshot>('/api/admin/cockpit');
}

export async function fetchAdminUserDossier(userId: string): Promise<AdminUserDossier> {
  return adminFetch<AdminUserDossier>(`/api/admin/users/${encodeURIComponent(userId)}/dossier`);
}

export async function approveAdminUser(userId: string): Promise<{ alreadyApproved: boolean }> {
  return adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/approve`, { method: 'POST' });
}

export async function rejectAdminUser(userId: string): Promise<{ alreadyRejected: boolean }> {
  return adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/reject`, { method: 'POST' });
}

export async function updateAdminUserRole(
  userId: string,
  role: 'USER' | 'ANALYST' | 'ADMIN',
): Promise<{ user: { id: string; name: string; email: string; role: string } }> {
  return adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function fetchAdminAuditLog(params?: {
  limit?: number;
  offset?: number;
}): Promise<AdminAuditPage> {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return adminFetch<AdminAuditPage>(`/api/admin/audit-log${suffix}`);
}
