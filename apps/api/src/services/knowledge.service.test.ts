import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('knowledge.service', () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
  });

  afterEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  it('persists a single event without double-counting the score', async () => {
    const { createUser, loadUserById } = await import('./user.service');
    const user = await createUser({
      name: 'Knowledge Event User',
      email: 'knowledge-events@example.com',
      passwordHash: 'hash',
    });

    const knowledgeService = await import('./knowledge.service');
    await knowledgeService.synchronizeKnowledgeFromIntake(user.id, {
      selfRatedUnderstanding: 3,
      financialProducts: [],
      financialKnowledge: {},
      hasSavingsOrInvestments: false,
      tracksExpenses: 'no',
    } as any);

    const first = await knowledgeService.recordKnowledgeEvent(
      user.id,
      'learned_concept',
      'User understood a core concept',
    );
    const second = await knowledgeService.recordKnowledgeEvent(
      user.id,
      'asked_good_question',
      'User asked a clarifying question',
    );

    expect(first.newScore).toBeGreaterThan(0);
    expect(second.newScore).toBeGreaterThanOrEqual(first.newScore);

    const tracker = await knowledgeService.getKnowledgeTracker(user.id);
    expect(tracker.history).toHaveLength(2);

    const persisted = await loadUserById(user.id);
    expect(persisted?.knowledgeHistory.length).toBe(2);
  });

  it('migrates legacy stored knowledgeScore into a stable base score', async () => {
    const { createUser, updateUserKnowledgeState } = await import('./user.service');
    const user = await createUser({
      name: 'Legacy User',
      email: 'legacy@example.com',
      passwordHash: 'hash',
    });

    await updateUserKnowledgeState(user.id, {
      knowledgeBaseScore: 0,
      knowledgeScore: 35,
      knowledgeHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'learned_concept',
          points: 5,
          rationale: 'Legacy event',
        },
      ],
      knowledgeLastUpdated: new Date().toISOString(),
    });

    const knowledgeService = await import('./knowledge.service');
    const tracker = await knowledgeService.getKnowledgeTracker(user.id);

    expect(tracker.baseScore).toBe(30);
    expect(tracker.totalGains).toBe(5);

    const effective = await knowledgeService.calculateEffectiveScore(user.id);
    expect(effective.score).toBe(35);
  });
});
