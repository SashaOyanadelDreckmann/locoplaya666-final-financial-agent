import { getApiBaseUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';

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
