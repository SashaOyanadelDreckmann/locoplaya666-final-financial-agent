import { getApiBaseUrl } from './base';
import { parseApiResponse } from './envelope';

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
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approvedAt?: string | null;
  approvedByEmail?: string | null;
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
  usdSpentTotal?: number;
  fincoinDepletedAt?: string | null;
  fincoinDepletionHandled?: boolean;
};

export type AdminUsersFullDump = {
  generatedAt: string;
  totalUsers: number;
  users: AdminUserSnapshot[];
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

export async function fetchAdminUsersFullDump(): Promise<AdminUsersFullDump> {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/admin/users/full`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<AdminUsersFullDump>(res);
}

export async function fetchResearchAnalyticsReport(): Promise<ResearchAnalyticsReport> {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/analytics/research`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<ResearchAnalyticsReport>(res);
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
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/admin/cockpit`, {
    method: 'GET',
    credentials: 'include',
  });
  return parseApiResponse<AdminCockpitSnapshot>(res);
}

export async function fetchAdminUserDossier(userId: string): Promise<AdminUserDossier> {
  const API_URL = getApiBaseUrl();
  const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(userId)}/dossier`, {
    method: 'GET',
    credentials: 'include',
  });
  return parseApiResponse<AdminUserDossier>(res);
}
