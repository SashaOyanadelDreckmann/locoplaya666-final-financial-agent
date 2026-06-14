import { getApiBaseUrl } from './base';
import { parseApiResponse } from './envelope';

export type AnalyticsRole = 'USER' | 'ANALYST' | 'ADMIN';

export type AnalyticsUser = {
  id: string;
  name: string;
  email: string;
  role: AnalyticsRole;
  createdAt: string;
  updatedAt: string;
  lastSessionSeenAt: string | null;
  lastInteractionAt: string | null;
  lastActivityAt: string | null;
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
};

export type AnalyticsInteraction = {
  interactionId: string;
  userId: string;
  userName: string;
  email: string;
  role: AnalyticsRole;
  timestamp: string;
  mode: string | null;
  chatId: string;
  sessionId: string | null;
  turnId: string | null;
  toolNames: string[];
  artifactTitles: string[];
  userMessage: string;
  agentMessage: string;
  summary: string;
};

export type AnalyticsSummary = {
  totalUsers: number;
  totalInteractions: number;
  totalSessions: number;
  totalProfiles: number;
  totalDocuments: number;
  activeUsers7d: number;
  activeUsers30d: number;
};

export type AnalyticsUsersPayload = {
  summary: AnalyticsSummary;
  users: AnalyticsUser[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type AnalyticsInteractionsPayload = {
  interactions: AnalyticsInteraction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type AnalyticsUserActivityPayload = {
  user: AnalyticsUser;
  interactions: AnalyticsInteraction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type AnalyticsFilters = {
  search?: string;
  role?: AnalyticsRole;
  mode?: string;
  from?: string;
  to?: string;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    query.set(key, text);
  }

  const built = query.toString();
  return built.length > 0 ? `?${built}` : '';
}

export async function fetchAnalyticsUsers(
  filters: AnalyticsFilters & {
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'interactions' | 'lastInteractionAt' | 'knowledgeScore' | 'documents';
    sortOrder?: 'asc' | 'desc';
  },
): Promise<AnalyticsUsersPayload> {
  const API_URL = getApiBaseUrl();
  const query = buildQuery({
    search: filters.search,
    role: filters.role,
    from: filters.from,
    to: filters.to,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    sortBy: filters.sortBy ?? 'interactions',
    sortOrder: filters.sortOrder ?? 'desc',
  });

  const res = await fetch(`${API_URL}/api/analytics/users${query}`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<AnalyticsUsersPayload>(res);
}

export async function fetchAnalyticsInteractions(
  filters: AnalyticsFilters & {
    limit?: number;
    offset?: number;
  },
): Promise<AnalyticsInteractionsPayload> {
  const API_URL = getApiBaseUrl();
  const query = buildQuery({
    search: filters.search,
    role: filters.role,
    mode: filters.mode,
    from: filters.from,
    to: filters.to,
    limit: filters.limit ?? 120,
    offset: filters.offset ?? 0,
  });

  const res = await fetch(`${API_URL}/api/analytics/interactions${query}`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<AnalyticsInteractionsPayload>(res);
}

export async function fetchAnalyticsUserActivity(
  userId: string,
  filters: Pick<AnalyticsFilters, 'search' | 'mode' | 'from' | 'to'> & {
    limit?: number;
    offset?: number;
  },
): Promise<AnalyticsUserActivityPayload> {
  const API_URL = getApiBaseUrl();
  const query = buildQuery({
    search: filters.search,
    mode: filters.mode,
    from: filters.from,
    to: filters.to,
    limit: filters.limit ?? 120,
    offset: filters.offset ?? 0,
  });

  const res = await fetch(`${API_URL}/api/analytics/users/${encodeURIComponent(userId)}/activity${query}`, {
    method: 'GET',
    credentials: 'include',
  });

  return parseApiResponse<AnalyticsUserActivityPayload>(res);
}

export async function downloadAnalyticsUsersCsv(
  filters: AnalyticsFilters & {
    sortBy?: 'createdAt' | 'interactions' | 'lastInteractionAt' | 'knowledgeScore' | 'documents';
    sortOrder?: 'asc' | 'desc';
  },
): Promise<void> {
  const API_URL = getApiBaseUrl();
  const query = buildQuery({
    search: filters.search,
    role: filters.role,
    from: filters.from,
    to: filters.to,
    sortBy: filters.sortBy ?? 'interactions',
    sortOrder: filters.sortOrder ?? 'desc',
  });

  const res = await fetch(`${API_URL}/api/analytics/export/users.csv${query}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    await parseApiResponse<{ _: never }>(res);
  }

  const csv = await res.text();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `analytics_users_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function downloadAnalyticsInteractionsCsv(
  filters: AnalyticsFilters,
): Promise<void> {
  const API_URL = getApiBaseUrl();
  const query = buildQuery({
    search: filters.search,
    role: filters.role,
    mode: filters.mode,
    from: filters.from,
    to: filters.to,
  });

  const res = await fetch(`${API_URL}/api/analytics/export/interactions.csv${query}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    await parseApiResponse<{ _: never }>(res);
  }

  const csv = await res.text();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `analytics_interactions_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
