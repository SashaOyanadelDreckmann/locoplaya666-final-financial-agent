import type { ApprovalStatus } from '../auth/approval';
import type { UserRole } from '../auth/rbac';
import { APPROVAL_STATUS } from '../auth/approval';
import { USER_ROLES } from '../auth/rbac';
import { getAllHttpStats, getHttpGlobalStats } from '../observability/http-metrics';
import { getAllToolStats } from '../mcp/tools/telemetry';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../persistencia/provider';
import { fincoinUsagePayload, getFincoinUsageForUser } from './fincoin.service';
import { listResearchAnalytics, type ResearchAnalyticsSummary } from './analytics.service';

export type AdminCockpitPendingUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

export type AdminCockpitRecentSignup = AdminCockpitPendingUser & {
  approvalStatus: ApprovalStatus;
};

export type AdminCockpitPlatform = {
  totalUsers: number;
  byApproval: Record<ApprovalStatus, number>;
  byRole: Record<UserRole, number>;
  pendingApprovals: AdminCockpitPendingUser[];
  recentSignups: AdminCockpitRecentSignup[];
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

export type AdminCockpitObservability = {
  http: ReturnType<typeof getHttpGlobalStats>;
  topEndpoints: Array<{ route: string; count: number; avgMs: number }>;
  topTools: Array<{ tool: string; count: number; avgMs: number }>;
};

export type AdminCockpitSnapshot = {
  generatedAt: string;
  platform: AdminCockpitPlatform;
  research: ResearchAnalyticsSummary;
  observability: AdminCockpitObservability;
};

function emptyApprovalCounts(): Record<ApprovalStatus, number> {
  return {
    [APPROVAL_STATUS.PENDING_APPROVAL]: 0,
    [APPROVAL_STATUS.APPROVED]: 0,
    [APPROVAL_STATUS.REJECTED]: 0,
  };
}

function emptyRoleCounts(): Record<UserRole, number> {
  return {
    [USER_ROLES.USER]: 0,
    [USER_ROLES.ANALYST]: 0,
    [USER_ROLES.ADMIN]: 0,
  };
}

async function buildFromMemory(): Promise<AdminCockpitPlatform> {
  const byApproval = emptyApprovalCounts();
  const byRole = emptyRoleCounts();
  let totalUsdSpent = 0;
  let depletedUsers = 0;
  let sessions = 0;
  let documents = 0;
  let profiles = 0;

  const users = Array.from(memoryStore.users.values());
  for (const user of users) {
    byApproval[user.approvalStatus] = (byApproval[user.approvalStatus] ?? 0) + 1;
    byRole[user.role] = (byRole[user.role] ?? 0) + 1;
    const spent = Number(user.usdSpentTotal ?? 0);
    totalUsdSpent += spent;
    if (user.fincoinDepletedAt || getFincoinUsageForUser(user).depleted) depletedUsers += 1;
  }

  sessions = memoryStore.sessions.size;
  documents = memoryStore.documents.size;
  profiles = memoryStore.profiles.size;

  const pendingApprovals = users
    .filter((user) => user.approvalStatus === APPROVAL_STATUS.PENDING_APPROVAL)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));

  const recentSignups = [...users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      approvalStatus: user.approvalStatus,
    }));

  return {
    totalUsers: users.length,
    byApproval,
    byRole,
    pendingApprovals,
    recentSignups,
    fincoin: {
      totalUsdSpent: Math.round(totalUsdSpent * 1000) / 1000,
      depletedUsers,
      activeWallets: Math.max(0, users.length - depletedUsers),
      avgUsdPerUser: users.length ? Math.round((totalUsdSpent / users.length) * 1000) / 1000 : 0,
    },
    totals: {
      sessions,
      documents,
      profiles,
      conversationTurns: memoryStore.conversationTurns.size,
    },
  };
}

async function buildFromPostgres(): Promise<AdminCockpitPlatform> {
  const prisma = await getPrismaClient();
  const [users, groupedApproval, groupedRole, totals] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approvalStatus: true,
        createdAt: true,
        usdSpentTotal: true,
        fincoinDepletedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.groupBy({
      by: ['approvalStatus'],
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    }),
    Promise.all([
      prisma.session.count(),
      prisma.userDocument.count(),
      prisma.financialProfile.count(),
      prisma.conversationTurn.count(),
    ]),
  ]);

  const byApproval = emptyApprovalCounts();
  for (const row of groupedApproval) {
    byApproval[row.approvalStatus as ApprovalStatus] = row._count._all;
  }

  const byRole = emptyRoleCounts();
  for (const row of groupedRole) {
    byRole[row.role as UserRole] = row._count._all;
  }

  let totalUsdSpent = 0;
  let depletedUsers = 0;
  for (const user of users) {
    totalUsdSpent += Number(user.usdSpentTotal ?? 0);
    if (user.fincoinDepletedAt) depletedUsers += 1;
  }

  const pendingApprovals = users
    .filter((user) => user.approvalStatus === APPROVAL_STATUS.PENDING_APPROVAL)
    .slice(0, 12)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      createdAt: user.createdAt.toISOString(),
    }));

  const recentSignups = users.slice(0, 12).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    createdAt: user.createdAt.toISOString(),
    approvalStatus: user.approvalStatus as ApprovalStatus,
  }));

  const [sessions, documents, profiles, conversationTurns] = totals;

  return {
    totalUsers: users.length,
    byApproval,
    byRole,
    pendingApprovals,
    recentSignups,
    fincoin: {
      totalUsdSpent: Math.round(totalUsdSpent * 1000) / 1000,
      depletedUsers,
      activeWallets: Math.max(0, users.length - depletedUsers),
      avgUsdPerUser: users.length ? Math.round((totalUsdSpent / users.length) * 1000) / 1000 : 0,
    },
    totals: {
      sessions,
      documents,
      profiles,
      conversationTurns,
    },
  };
}

function buildObservability(): AdminCockpitObservability {
  const http = getHttpGlobalStats();
  const topEndpoints = getAllHttpStats()
    .map((entry) => ({
      route: `${entry.method} ${entry.route}`,
      count: entry.totalRequests,
      avgMs: entry.avgLatencyMs,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topTools = Object.entries(getAllToolStats())
    .map(([tool, entry]) => ({
      tool,
      count: entry.total_calls,
      avgMs: entry.avg_latency_ms,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { http, topEndpoints, topTools };
}

export async function getAdminCockpitSnapshot(): Promise<AdminCockpitSnapshot> {
  const [platform, researchReport] = await Promise.all([
    getPersistenceMode() === 'memory' ? buildFromMemory() : buildFromPostgres(),
    listResearchAnalytics(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    platform,
    research: researchReport.summary,
    observability: buildObservability(),
  };
}
