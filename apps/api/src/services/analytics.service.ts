import crypto from 'crypto';
import type { UserRole } from '../auth/rbac';
import { getConfig } from '../config';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../persistencia/provider';
import { listConversationTurnTimelinesByUser } from '../persistencia/repos/conversation.repository';
import { getFincoinUsageForUser } from './fincoin.service';

type SortOrder = 'asc' | 'desc';
type UserSortBy = 'createdAt' | 'interactions' | 'lastInteractionAt' | 'knowledgeScore' | 'documents';

export type AnalyticsListUsersParams = {
  search?: string;
  role?: UserRole;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
  sortBy: UserSortBy;
  sortOrder: SortOrder;
};

export type AnalyticsListInteractionsParams = {
  search?: string;
  role?: UserRole;
  mode?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

export type AnalyticsListUserActivityParams = {
  userId: string;
  search?: string;
  mode?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

export type ResearchAnalyticsParams = {
  role?: UserRole;
  from?: string;
  to?: string;
};

export type AnalyticsInteraction = {
  interactionId: string;
  userId: string;
  userName: string;
  email: string;
  role: UserRole;
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

type ResearchStage = 'new' | 'onboarding' | 'diagnosis' | 'building' | 'active' | 'advanced' | 'stale';

export type AnalyticsUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
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
  hasDocuments: boolean;
  stage: ResearchStage;
  usdSpentTotal: number;
  fincoinDepleted: boolean;
  fincoinRemainingUsd: number;
  latestDiagnosticCompletedAt: string | null;
};

type AnalyticsSummary = {
  totalUsers: number;
  totalInteractions: number;
  totalSessions: number;
  totalProfiles: number;
  totalDocuments: number;
  activeUsers7d: number;
  activeUsers30d: number;
};

type AnalyticsUsersResult = {
  summary: AnalyticsSummary;
  users: AnalyticsUser[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

type AnalyticsInteractionsResult = {
  interactions: AnalyticsInteraction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type ResearchAnalyticsUser = {
  pseudonymId: string;
  role: UserRole;
  createdAtMonth: string;
  lastSessionSeenAtBucket: string;
  lastActivityBucket: string;
  daysSinceCreated: number;
  daysSinceLastActivity: number | null;
  stage: ResearchStage;
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
  stageCounts: Record<ResearchStage, number>;
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

type AnalyticsUserActivityResult = {
  user: AnalyticsUser;
  interactions: AnalyticsInteraction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

type RawTimelineEntry = {
  id: string;
  chatId: string;
  sessionId: string | null;
  turnId: string | null;
  timestamp: string;
  mode: string | null;
  toolNames: string[];
  artifactTitles: string[];
  userMessage: string;
  agentMessage: string;
  summary: string;
};

type RawUserAnalytics = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  knowledgeScore: number;
  knowledgeBaseScore: number;
  sessionsCount: number;
  profilesCount: number;
  documentsCount: number;
  lastSessionSeenAt: string | null;
  hasIntake: boolean;
  hasProfile: boolean;
  sheetsCount: number;
  budgetRowsCount: number;
  savedReportsCount: number;
  usdSpentTotal: number;
  fincoinDepleted: boolean;
  fincoinRemainingUsd: number;
  latestDiagnosticCompletedAt: string | null;
  timeline: RawTimelineEntry[];
};

function normalizeDate(value: string | undefined | null): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function hashResearchIdentifier(value: string): string {
  const secret = getConfig().SESSION_TOKEN_SECRET;
  return crypto
    .createHmac('sha256', `${secret}:research-analytics`)
    .update(value)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
}

function monthBucket(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 7);
}

function activityBucket(daysSince: number | null): string {
  if (daysSince === null) return 'unknown';
  if (daysSince <= 0) return 'today';
  if (daysSince <= 7) return '7d';
  if (daysSince <= 30) return '30d';
  if (daysSince <= 90) return '90d';
  return 'older';
}

function countDaysBetween(now: number, value: string): number | null {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((now - ts) / (24 * 60 * 60 * 1000)));
}

function deriveResearchStage(user: RawUserAnalytics, now: number): ResearchStage {
  const daysSinceLastActivity = resolveDaysSinceLastActivity(user, now);
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 90) {
    return 'stale';
  }
  if (!user.hasIntake) return 'new';
  if (!user.hasProfile) return 'onboarding';
  if (user.documentsCount === 0 && user.timeline.length < 3) return 'diagnosis';
  if (user.documentsCount > 0 && user.sheetsCount === 0) return 'building';
  if (user.savedReportsCount === 0) return 'active';
  if (user.knowledgeScore >= 70 || user.timeline.length >= 12) return 'advanced';
  return 'active';
}

function calculateProgressScore(user: RawUserAnalytics): number {
  const score =
    (user.hasIntake ? 15 : 0) +
    (user.hasProfile ? 20 : 0) +
    Math.min(20, user.documentsCount * 5) +
    Math.min(15, user.sheetsCount * 3) +
    Math.min(15, user.savedReportsCount * 3) +
    Math.min(10, user.timeline.length * 2) +
    Math.min(5, Math.round(user.knowledgeScore / 20)) +
    Math.min(5, Math.round(user.knowledgeBaseScore / 20));
  return Math.max(0, Math.min(100, score));
}

function countModes(timeline: RawTimelineEntry[]): Array<{ mode: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of timeline) {
    const mode = normalizeText(entry.mode) || 'unknown';
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode))
    .slice(0, 6);
}

function countTools(timeline: RawTimelineEntry[]): Array<{ tool: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of timeline) {
    for (const tool of entry.toolNames) {
      counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool))
    .slice(0, 6);
}

function parseTimeline(memoryBlob: unknown): RawTimelineEntry[] {
  if (!memoryBlob || typeof memoryBlob !== 'object') return [];

  const rawTimeline = (memoryBlob as Record<string, unknown>).timeline;
  if (!Array.isArray(rawTimeline)) return [];

  return rawTimeline
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const timestamp = normalizeText(row.timestamp);
      if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;

      const userMessage = normalizeText(row.user_message);
      const agentMessage = normalizeText(row.agent_message);
      const summary = normalizeText(row.summary);

      return {
        id: normalizeText(row.id) || `timeline_${idx}_${timestamp}`,
        chatId: normalizeText(row.chat_id) || 'chat_unknown',
        sessionId: normalizeText(row.session_id) || null,
        turnId: normalizeText(row.turn_id) || null,
        timestamp,
        mode: normalizeText(row.mode) || null,
        toolNames: ensureStringArray(row.tool_names),
        artifactTitles: ensureStringArray(row.artifact_titles),
        userMessage,
        agentMessage,
        summary,
      } satisfies RawTimelineEntry;
    })
    .filter((entry): entry is RawTimelineEntry => Boolean(entry))
    .sort((a, b) => normalizeDate(b.timestamp) - normalizeDate(a.timestamp));
}

function parsePanelMetrics(panelState: unknown): {
  budgetRowsCount: number;
  savedReportsCount: number;
} {
  if (!panelState || typeof panelState !== 'object') {
    return {
      budgetRowsCount: 0,
      savedReportsCount: 0,
    };
  }

  const row = panelState as Record<string, unknown>;
  const budgetRowsCount = Array.isArray(row.budgetRows) ? row.budgetRows.length : 0;
  const savedReportsCount = Array.isArray(row.savedReports) ? row.savedReports.length : 0;

  return {
    budgetRowsCount,
    savedReportsCount,
  };
}

function parseSheetsCount(sheets: unknown): number {
  return Array.isArray(sheets) ? sheets.length : 0;
}

function applyDateWindow(timeline: RawTimelineEntry[], from?: string, to?: string): RawTimelineEntry[] {
  const fromTs = normalizeDate(from);
  const toTs = normalizeDate(to);

  return timeline.filter((entry) => {
    const ts = normalizeDate(entry.timestamp);
    if (!ts) return false;
    if (fromTs && ts < fromTs) return false;
    if (toTs && ts > toTs) return false;
    return true;
  });
}

function includesSearch(haystack: string, search: string): boolean {
  if (!search) return true;
  return haystack.toLowerCase().includes(search.toLowerCase());
}

function buildInteraction(user: RawUserAnalytics, entry: RawTimelineEntry): AnalyticsInteraction {
  return {
    interactionId: entry.id,
    userId: user.id,
    userName: user.name,
    email: user.email,
    role: user.role,
    timestamp: entry.timestamp,
    mode: entry.mode,
    chatId: entry.chatId,
    sessionId: entry.sessionId,
    turnId: entry.turnId,
    toolNames: entry.toolNames,
    artifactTitles: entry.artifactTitles,
    userMessage: entry.userMessage,
    agentMessage: entry.agentMessage,
    summary: entry.summary,
  };
}

function buildUserAnalytics(user: RawUserAnalytics, from?: string, to?: string): AnalyticsUser {
  const filteredTimeline = applyDateWindow(user.timeline, from, to);
  const lastInteractionAt = filteredTimeline[0]?.timestamp ?? null;
  const lastSessionSeenAt = user.lastSessionSeenAt;
  const now = Date.now();

  const toolSet = new Set<string>();
  let artifactsGeneratedCount = 0;
  const modeSet = new Set<string>();

  for (const entry of filteredTimeline) {
    for (const tool of entry.toolNames) toolSet.add(tool);
    artifactsGeneratedCount += entry.artifactTitles.length;
    if (entry.mode) modeSet.add(entry.mode);
  }

  const lastActivityAt = [lastInteractionAt, lastSessionSeenAt, user.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => normalizeDate(b) - normalizeDate(a))[0] ?? null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSessionSeenAt,
    lastInteractionAt,
    lastActivityAt,
    interactionsCount: filteredTimeline.length,
    sessionsCount: user.sessionsCount,
    profilesCount: user.profilesCount,
    documentsCount: user.documentsCount,
    sheetsCount: user.sheetsCount,
    budgetRowsCount: user.budgetRowsCount,
    savedReportsCount: user.savedReportsCount,
    knowledgeScore: user.knowledgeScore,
    knowledgeBaseScore: user.knowledgeBaseScore,
    modesUsed: Array.from(modeSet),
    toolsUsedCount: toolSet.size,
    artifactsGeneratedCount,
    hasIntake: user.hasIntake,
    hasProfile: user.hasProfile,
    hasDocuments: user.documentsCount > 0,
    stage: deriveResearchStage(user, now),
    usdSpentTotal: user.usdSpentTotal,
    fincoinDepleted: user.fincoinDepleted,
    fincoinRemainingUsd: user.fincoinRemainingUsd,
    latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt,
  };
}

function resolveDaysSinceLastActivity(user: RawUserAnalytics, now: number): number | null {
  if (user.timeline[0]?.timestamp) {
    return countDaysBetween(now, user.timeline[0].timestamp);
  }
  if (user.lastSessionSeenAt) {
    return countDaysBetween(now, user.lastSessionSeenAt);
  }
  return null;
}

function mergeTimelines(
  memoryEntries: RawTimelineEntry[],
  turnEntries: RawTimelineEntry[],
): RawTimelineEntry[] {
  const seen = new Set<string>();
  const merged: RawTimelineEntry[] = [];

  for (const entry of [...memoryEntries, ...turnEntries]) {
    const key =
      entry.turnId ||
      entry.id ||
      `${entry.timestamp}|${entry.userMessage.slice(0, 48)}|${entry.agentMessage.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged.sort((a, b) => normalizeDate(b.timestamp) - normalizeDate(a.timestamp));
}

function buildResearchUser(user: RawUserAnalytics, now: number): ResearchAnalyticsUser {
  const daysSinceCreated = countDaysBetween(now, user.createdAt) ?? 0;
  const daysSinceLastActivity = resolveDaysSinceLastActivity(user, now);

  return {
    pseudonymId: `P-${hashResearchIdentifier(user.id)}`,
    role: user.role,
    createdAtMonth: monthBucket(user.createdAt),
    lastSessionSeenAtBucket: activityBucket(user.lastSessionSeenAt ? countDaysBetween(now, user.lastSessionSeenAt) : null),
    lastActivityBucket: activityBucket(daysSinceLastActivity),
    daysSinceCreated,
    daysSinceLastActivity,
    stage: deriveResearchStage(user, now),
    progressScore: calculateProgressScore(user),
    interactionsCount: user.timeline.length,
    sessionsCount: user.sessionsCount,
    profilesCount: user.profilesCount,
    documentsCount: user.documentsCount,
    sheetsCount: user.sheetsCount,
    budgetRowsCount: user.budgetRowsCount,
    savedReportsCount: user.savedReportsCount,
    knowledgeScore: user.knowledgeScore,
    knowledgeBaseScore: user.knowledgeBaseScore,
    modesUsed: countModes(user.timeline).map((entry) => entry.mode),
    toolsUsedCount: new Set(user.timeline.flatMap((entry) => entry.toolNames)).size,
    artifactsGeneratedCount: user.timeline.reduce((sum, entry) => sum + entry.artifactTitles.length, 0),
    hasIntake: user.hasIntake,
    hasProfile: user.hasProfile,
    hasDocuments: user.documentsCount > 0,
  };
}

function buildResearchSummary(users: ResearchAnalyticsUser[], rawUsers: RawUserAnalytics[]): ResearchAnalyticsSummary {
  const stageCounts: Record<ResearchStage, number> = {
    new: 0,
    onboarding: 0,
    diagnosis: 0,
    building: 0,
    active: 0,
    advanced: 0,
    stale: 0,
  };

  const modeCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  let activeUsers7d = 0;
  let activeUsers30d = 0;

  for (const user of users) {
    stageCounts[user.stage] += 1;
    const activityAge = user.daysSinceLastActivity;
    if (activityAge !== null && activityAge <= 7) activeUsers7d += 1;
    if (activityAge !== null && activityAge <= 30) activeUsers30d += 1;
  }

  for (const raw of rawUsers) {
    for (const entry of raw.timeline) {
      const mode = normalizeText(entry.mode) || 'unknown';
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
      for (const tool of entry.toolNames) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
      }
    }
  }

  const totalProgress = users.reduce((sum, user) => sum + user.progressScore, 0);
  const totalKnowledge = users.reduce((sum, user) => sum + user.knowledgeScore, 0);
  const totalKnowledgeBase = users.reduce((sum, user) => sum + user.knowledgeBaseScore, 0);

  return {
    totalUsers: users.length,
    totalInteractions: rawUsers.reduce((sum, user) => sum + user.timeline.length, 0),
    activeUsers7d,
    activeUsers30d,
    avgProgressScore: users.length ? Math.round((totalProgress / users.length) * 10) / 10 : 0,
    avgKnowledgeScore: users.length ? Math.round((totalKnowledge / users.length) * 10) / 10 : 0,
    avgKnowledgeBaseScore: users.length ? Math.round((totalKnowledgeBase / users.length) * 10) / 10 : 0,
    intakeCompletionRate: users.length ? Math.round((users.filter((user) => user.hasIntake).length / users.length) * 1000) / 10 : 0,
    profileAttachmentRate: users.length ? Math.round((users.filter((user) => user.hasProfile).length / users.length) * 1000) / 10 : 0,
    documentAdoptionRate: users.length ? Math.round((users.filter((user) => user.hasDocuments).length / users.length) * 1000) / 10 : 0,
    stageCounts,
    topModes: Array.from(modeCounts.entries())
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode))
      .slice(0, 6),
    topTools: Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool))
      .slice(0, 6),
  };
}

function buildCohorts(users: ResearchAnalyticsUser[]): ResearchAnalyticsCohort[] {
  const buckets = new Map<string, ResearchAnalyticsUser[]>();
  for (const user of users) {
    const bucket = user.createdAtMonth || 'unknown';
    const list = buckets.get(bucket) ?? [];
    list.push(user);
    buckets.set(bucket, list);
  }

  return Array.from(buckets.entries())
    .map(([month, cohort]) => ({
      month,
      users: cohort.length,
      active7d: cohort.filter((user) => user.daysSinceLastActivity !== null && user.daysSinceLastActivity <= 7).length,
      active30d: cohort.filter((user) => user.daysSinceLastActivity !== null && user.daysSinceLastActivity <= 30).length,
      avgProgressScore: cohort.length
        ? Math.round((cohort.reduce((sum, user) => sum + user.progressScore, 0) / cohort.length) * 10) / 10
        : 0,
      avgKnowledgeScore: cohort.length
        ? Math.round((cohort.reduce((sum, user) => sum + user.knowledgeScore, 0) / cohort.length) * 10) / 10
        : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function applyUserFilters(users: RawUserAnalytics[], params: {
  search?: string;
  role?: UserRole;
}): RawUserAnalytics[] {
  const search = normalizeText(params.search);

  return users.filter((user) => {
    if (params.role && user.role !== params.role) return false;
    if (!search) return true;

    const haystack = [
      user.id,
      user.name,
      user.email,
      user.role,
    ].join(' ');

    return includesSearch(haystack, search);
  });
}

function buildSummary(users: AnalyticsUser[]): AnalyticsSummary {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  let activeUsers7d = 0;
  let activeUsers30d = 0;

  for (const user of users) {
    const ts = normalizeDate(user.lastActivityAt);
    if (!ts) continue;
    if (now - ts <= 7 * DAY) activeUsers7d += 1;
    if (now - ts <= 30 * DAY) activeUsers30d += 1;
  }

  return {
    totalUsers: users.length,
    totalInteractions: users.reduce((sum, user) => sum + user.interactionsCount, 0),
    totalSessions: users.reduce((sum, user) => sum + user.sessionsCount, 0),
    totalProfiles: users.reduce((sum, user) => sum + user.profilesCount, 0),
    totalDocuments: users.reduce((sum, user) => sum + user.documentsCount, 0),
    activeUsers7d,
    activeUsers30d,
  };
}

function sortUsers(users: AnalyticsUser[], sortBy: UserSortBy, sortOrder: SortOrder): AnalyticsUser[] {
  const direction = sortOrder === 'asc' ? 1 : -1;

  const sorted = [...users].sort((a, b) => {
    if (sortBy === 'createdAt') {
      return (normalizeDate(a.createdAt) - normalizeDate(b.createdAt)) * direction;
    }
    if (sortBy === 'interactions') {
      return (a.interactionsCount - b.interactionsCount) * direction;
    }
    if (sortBy === 'lastInteractionAt') {
      return (normalizeDate(a.lastInteractionAt) - normalizeDate(b.lastInteractionAt)) * direction;
    }
    if (sortBy === 'documents') {
      return (a.documentsCount - b.documentsCount) * direction;
    }
    return (a.knowledgeScore - b.knowledgeScore) * direction;
  });

  return sorted;
}

function paginate<T>(items: T[], offset: number, limit: number): T[] {
  return items.slice(offset, offset + limit);
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(columns: string[], rows: Array<Array<unknown>>): string {
  const header = columns.map(escapeCsv).join(',');
  const body = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  return `${header}\n${body}`;
}

async function loadRawUsers(): Promise<RawUserAnalytics[]> {
  const mode = getPersistenceMode();
  const turnsByUser = await listConversationTurnTimelinesByUser();

  if (mode === 'memory') {
    const sessionStats = new Map<string, { count: number; lastSeenAt: string | null }>();
    const profileStats = new Map<string, number>();
    const documentStats = new Map<string, number>();

    for (const session of memoryStore.sessions.values()) {
      const current = sessionStats.get(session.userId) ?? { count: 0, lastSeenAt: null };
      const candidate = session.createdAt;
      const lastSeenAt =
        !current.lastSeenAt || normalizeDate(candidate) > normalizeDate(current.lastSeenAt)
          ? candidate
          : current.lastSeenAt;

      sessionStats.set(session.userId, {
        count: current.count + 1,
        lastSeenAt,
      });
    }

    for (const profile of memoryStore.profiles.values()) {
      profileStats.set(profile.userId, (profileStats.get(profile.userId) ?? 0) + 1);
    }

    for (const document of memoryStore.documents.values()) {
      documentStats.set(document.userId, (documentStats.get(document.userId) ?? 0) + 1);
    }

    return Array.from(memoryStore.users.values()).map((user) => {
      const panelMetrics = parsePanelMetrics(user.panelState);
      const timeline = mergeTimelines(
        parseTimeline(user.memoryBlob),
        turnsByUser.get(user.id) ?? [],
      );
      const fincoin = getFincoinUsageForUser(user);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        knowledgeScore: user.knowledgeScore,
        knowledgeBaseScore: user.knowledgeBaseScore,
        sessionsCount: sessionStats.get(user.id)?.count ?? 0,
        profilesCount: profileStats.get(user.id) ?? 0,
        documentsCount: documentStats.get(user.id) ?? 0,
        lastSessionSeenAt: sessionStats.get(user.id)?.lastSeenAt ?? null,
        hasIntake: Boolean(user.injectedIntake),
        hasProfile: Boolean(user.injectedProfile),
        sheetsCount: parseSheetsCount(user.sheets),
        budgetRowsCount: panelMetrics.budgetRowsCount,
        savedReportsCount: panelMetrics.savedReportsCount,
        usdSpentTotal: Number(user.usdSpentTotal ?? 0),
        fincoinDepleted: fincoin.depleted,
        fincoinRemainingUsd: fincoin.usdRemaining,
        latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt ?? null,
        timeline,
      } satisfies RawUserAnalytics;
    });
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approvalStatus: true,
      createdAt: true,
      updatedAt: true,
      knowledgeScore: true,
      knowledgeBaseScore: true,
      memoryBlob: true,
      injectedIntake: true,
      injectedProfile: true,
      panelState: true,
      sheets: true,
      usdSpentTotal: true,
      fincoinDepletedAt: true,
      latestDiagnosticCompletedAt: true,
      _count: {
        select: {
          sessions: true,
          profiles: true,
          documents: true,
        },
      },
      sessions: {
        select: {
          lastSeenAt: true,
        },
        orderBy: {
          lastSeenAt: 'desc',
        },
        take: 1,
      },
    },
  });

  return rows.map((row) => {
    const panelMetrics = parsePanelMetrics(row.panelState);
    const timeline = mergeTimelines(
      parseTimeline(row.memoryBlob),
      turnsByUser.get(row.id) ?? [],
    );
    const fincoin = getFincoinUsageForUser({ usdSpentTotal: Number(row.usdSpentTotal ?? 0) });

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      approvalStatus: row.approvalStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      knowledgeScore: Number(row.knowledgeScore ?? 0),
      knowledgeBaseScore: Number(row.knowledgeBaseScore ?? 0),
      sessionsCount: Number(row._count.sessions ?? 0),
      profilesCount: Number(row._count.profiles ?? 0),
      documentsCount: Number(row._count.documents ?? 0),
      lastSessionSeenAt: row.sessions[0]?.lastSeenAt?.toISOString() ?? null,
      hasIntake: Boolean(row.injectedIntake),
      hasProfile: Boolean(row.injectedProfile),
      sheetsCount: parseSheetsCount(row.sheets),
      budgetRowsCount: panelMetrics.budgetRowsCount,
      savedReportsCount: panelMetrics.savedReportsCount,
      usdSpentTotal: Number(row.usdSpentTotal ?? 0),
      fincoinDepleted: Boolean(row.fincoinDepletedAt) || fincoin.depleted,
      fincoinRemainingUsd: fincoin.usdRemaining,
      latestDiagnosticCompletedAt: row.latestDiagnosticCompletedAt?.toISOString() ?? null,
      timeline,
    } satisfies RawUserAnalytics;
  });
}

export async function listAnalyticsUsers(params: AnalyticsListUsersParams): Promise<AnalyticsUsersResult> {
  const rawUsers = await loadRawUsers();
  const filteredRawUsers = applyUserFilters(rawUsers, {
    search: params.search,
    role: params.role,
  });

  const enrichedUsers = filteredRawUsers.map((user) =>
    buildUserAnalytics(user, params.from, params.to),
  );

  const summary = buildSummary(enrichedUsers);
  const sorted = sortUsers(enrichedUsers, params.sortBy, params.sortOrder);

  return {
    summary,
    users: paginate(sorted, params.offset, params.limit),
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total: sorted.length,
    },
  };
}

export async function listAnalyticsInteractions(
  params: AnalyticsListInteractionsParams,
): Promise<AnalyticsInteractionsResult> {
  const rawUsers = await loadRawUsers();
  const filteredRawUsers = applyUserFilters(rawUsers, {
    search: undefined,
    role: params.role,
  });

  const search = normalizeText(params.search);
  const modeFilter = normalizeText(params.mode).toLowerCase();

  const interactions: AnalyticsInteraction[] = [];

  for (const user of filteredRawUsers) {
    const timeline = applyDateWindow(user.timeline, params.from, params.to);
    for (const entry of timeline) {
      if (modeFilter && (entry.mode ?? '').toLowerCase() !== modeFilter) continue;

      if (search) {
        const haystack = [
          user.id,
          user.name,
          user.email,
          user.role,
          entry.userMessage,
          entry.agentMessage,
          entry.summary,
          entry.chatId,
          entry.mode ?? '',
        ].join(' ');
        if (!includesSearch(haystack, search)) continue;
      }

      interactions.push(buildInteraction(user, entry));
    }
  }

  interactions.sort((a, b) => normalizeDate(b.timestamp) - normalizeDate(a.timestamp));

  return {
    interactions: paginate(interactions, params.offset, params.limit),
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total: interactions.length,
    },
  };
}

export async function getAnalyticsUserActivity(
  params: AnalyticsListUserActivityParams,
): Promise<AnalyticsUserActivityResult | null> {
  const rawUsers = await loadRawUsers();
  const target = rawUsers.find((user) => user.id === params.userId);
  if (!target) return null;

  const user = buildUserAnalytics(target, params.from, params.to);
  const search = normalizeText(params.search);
  const modeFilter = normalizeText(params.mode).toLowerCase();

  const interactions = applyDateWindow(target.timeline, params.from, params.to)
    .map((entry) => buildInteraction(target, entry))
    .filter((entry) => {
      if (modeFilter && (entry.mode ?? '').toLowerCase() !== modeFilter) return false;
      if (!search) return true;
      const haystack = [
        entry.userMessage,
        entry.agentMessage,
        entry.summary,
        entry.chatId,
        entry.mode ?? '',
      ].join(' ');
      return includesSearch(haystack, search);
    })
    .sort((a, b) => normalizeDate(b.timestamp) - normalizeDate(a.timestamp));

  return {
    user,
    interactions: paginate(interactions, params.offset, params.limit),
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total: interactions.length,
    },
  };
}

export async function exportAnalyticsUsersCsv(params: Omit<AnalyticsListUsersParams, 'limit' | 'offset'>): Promise<string> {
  const rawUsers = await loadRawUsers();
  const filteredRawUsers = applyUserFilters(rawUsers, {
    search: params.search,
    role: params.role,
  });

  const users = sortUsers(
    filteredRawUsers.map((user) => buildUserAnalytics(user, params.from, params.to)),
    params.sortBy,
    params.sortOrder,
  );

  const columns = [
    'user_id',
    'name',
    'email',
    'role',
    'created_at',
    'updated_at',
    'last_activity_at',
    'last_interaction_at',
    'last_session_seen_at',
    'has_intake',
    'has_profile',
    'interactions_count',
    'sessions_count',
    'profiles_count',
    'documents_count',
    'sheets_count',
    'budget_rows_count',
    'saved_reports_count',
    'knowledge_score',
    'knowledge_base_score',
    'tools_used_count',
    'artifacts_generated_count',
    'modes_used',
  ];

  const rows = users.map((user) => [
    user.id,
    user.name,
    user.email,
    user.role,
    user.createdAt,
    user.updatedAt,
    user.lastActivityAt ?? '',
    user.lastInteractionAt ?? '',
    user.lastSessionSeenAt ?? '',
    user.hasIntake ? '1' : '0',
    user.hasProfile ? '1' : '0',
    user.interactionsCount,
    user.sessionsCount,
    user.profilesCount,
    user.documentsCount,
    user.sheetsCount,
    user.budgetRowsCount,
    user.savedReportsCount,
    user.knowledgeScore,
    user.knowledgeBaseScore,
    user.toolsUsedCount,
    user.artifactsGeneratedCount,
    user.modesUsed.join('|'),
  ]);

  return buildCsv(columns, rows);
}

export async function exportAnalyticsInteractionsCsv(
  params: Omit<AnalyticsListInteractionsParams, 'limit' | 'offset'>,
): Promise<string> {
  const payload = await listAnalyticsInteractions({
    ...params,
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
  });

  const columns = [
    'interaction_id',
    'timestamp',
    'user_id',
    'user_name',
    'email',
    'role',
    'mode',
    'chat_id',
    'session_id',
    'turn_id',
    'tools',
    'artifacts',
    'user_message',
    'agent_message',
    'summary',
  ];

  const rows = payload.interactions.map((entry) => [
    entry.interactionId,
    entry.timestamp,
    entry.userId,
    entry.userName,
    entry.email,
    entry.role,
    entry.mode ?? '',
    entry.chatId,
    entry.sessionId ?? '',
    entry.turnId ?? '',
    entry.toolNames.join('|'),
    entry.artifactTitles.join('|'),
    entry.userMessage,
    entry.agentMessage,
    entry.summary,
  ]);

  return buildCsv(columns, rows);
}

export async function listResearchAnalytics(params: ResearchAnalyticsParams = {}): Promise<ResearchAnalyticsReport> {
  const rawUsers = await loadRawUsers();
  const filteredRawUsers = applyUserFilters(rawUsers, {
    role: params.role,
    search: undefined,
  });

  const fromTs = normalizeDate(params.from);
  const toTs = normalizeDate(params.to);
  const filteredByWindow = filteredRawUsers.map((user) => {
    if (!fromTs && !toTs) return user;
    const timeline = user.timeline.filter((entry) => {
      const ts = normalizeDate(entry.timestamp);
      if (!ts) return false;
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    });
    return {
      ...user,
      timeline,
    };
  });

  const now = Date.now();
  const users = filteredByWindow.map((user) => buildResearchUser(user, now));
  const cohorts = buildCohorts(users);
  const summary = buildResearchSummary(users, filteredByWindow);

  return {
    generatedAt: new Date().toISOString(),
    summary,
    cohorts,
    users,
  };
}
