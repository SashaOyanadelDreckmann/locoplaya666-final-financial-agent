import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStore } from '../persistencia/provider';
import { listResearchAnalytics } from './analytics.service';

beforeEach(() => {
  memoryStore.users.clear();
  memoryStore.sessions.clear();
  memoryStore.profiles.clear();
  memoryStore.documents.clear();
  memoryStore.vectorStores.clear();

  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.APPROVAL_LINK_BASE_URL = 'http://localhost:3001';
  process.env.SESSION_TOKEN_SECRET = 'test-session-secret-abcdefghijklmnopqrstuvwxyz';
  process.env.APPROVAL_LINK_SECRET = 'test-approval-link-secret-abcdefghijklmnopqrstuvwxyz';
  process.env.PASSWORD_RESET_LINK_SECRET = 'test-password-reset-link-secret-abcdefghijklmnopqrstuvwxyz';
});

describe('listResearchAnalytics', () => {
  it('returns anonymized research-safe data', async () => {
    const userId = 'user_1';
    memoryStore.users.set(userId, {
      id: userId,
      name: 'Alice Example',
      email: 'alice@example.com',
      passwordHash: 'hash',
      role: 'USER',
      approvalStatus: 'APPROVED',
      knowledgeBaseScore: 40,
      knowledgeScore: 55,
      knowledgeHistory: [],
      knowledgeLastUpdated: new Date().toISOString(),
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-04T12:00:00.000Z',
      injectedIntake: { intake: { age: 33 } },
      injectedProfile: { score: 72 },
      panelState: { budgetRows: [{ id: 'r1' }], savedReports: [{ id: 'rep1' }] },
      sheets: [{ id: 's1' }],
      memoryBlob: {
        timeline: [
          {
            id: 't1',
            chat_id: 'chat-1',
            timestamp: '2026-05-04T11:00:00.000Z',
            mode: 'diagnosis',
            tool_names: ['budget', 'profile'],
            artifact_titles: ['report'],
            user_message: 'Hello',
            agent_message: 'Hi',
            summary: 'Completed diagnosis',
          },
        ],
      },
    } as any);

    memoryStore.sessions.set('session-hash-1', {
      token: 'token',
      userId,
      createdAt: '2026-05-02T10:00:00.000Z',
      expiresAt: '2026-05-09T10:00:00.000Z',
    });

    memoryStore.profiles.set('profile-1', {
      id: 'profile-1',
      userId,
      payload: { kind: 'profile' },
      createdAt: '2026-05-03T10:00:00.000Z',
    } as any);

    memoryStore.documents.set('doc-1', {
      id: 'doc-1',
      userId,
      name: 'Statement.pdf',
      kind: 'PDF',
      source: 'USER_UPLOAD',
      status: 'PARSED',
      createdAt: '2026-05-03T12:00:00.000Z',
      updatedAt: '2026-05-03T12:00:00.000Z',
    } as any);

    const report = await listResearchAnalytics();

    expect(report.summary.totalUsers).toBe(1);
    expect(report.users[0]?.pseudonymId).toMatch(/^P-[A-Z0-9]{10}$/);
    expect(JSON.stringify(report)).not.toContain('Alice Example');
    expect(JSON.stringify(report)).not.toContain('alice@example.com');
    expect(report.summary.stageCounts.onboarding + report.summary.stageCounts.diagnosis + report.summary.stageCounts.active + report.summary.stageCounts.advanced).toBeGreaterThan(0);
    expect(report.cohorts[0]?.month).toBe('2026-05');
  });

  it('marks inactive users as stale after 90 days', async () => {
    const userId = 'user_stale';
    memoryStore.users.set(userId, {
      id: userId,
      name: 'Stale User',
      email: 'stale@example.com',
      passwordHash: 'hash',
      role: 'USER',
      approvalStatus: 'APPROVED',
      knowledgeBaseScore: 10,
      knowledgeScore: 10,
      knowledgeHistory: [],
      knowledgeLastUpdated: new Date().toISOString(),
      createdAt: '2025-01-01T10:00:00.000Z',
      updatedAt: '2025-01-01T10:00:00.000Z',
      injectedIntake: { intake: { age: 30 } },
      injectedProfile: { score: 50 },
      memoryBlob: {
        timeline: [
          {
            id: 'old-turn',
            chat_id: 'chat-1',
            timestamp: '2025-01-05T10:00:00.000Z',
            user_message: 'Hola',
            agent_message: 'Hola',
            summary: 'Old',
          },
        ],
      },
    } as any);

    const report = await listResearchAnalytics();
    expect(report.users[0]?.stage).toBe('stale');
    expect(report.summary.stageCounts.stale).toBe(1);
  });
});
