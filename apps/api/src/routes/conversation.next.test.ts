import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/llm.service', () => ({
  complete: vi.fn(async () => '¿Qué parte faltó o quedó mal reflejada en este bloque?'),
}));

vi.mock('../agents/diagnostic/diagnostic.agent', () => ({
  runDiagnosticAgent: vi.fn(),
}));

vi.mock('../services/storage.service', () => ({
  saveProfile: vi.fn(),
}));

vi.mock('../services/knowledge.service', () => ({
  recordKnowledgeEvent: vi.fn(),
}));

vi.mock('../services/memory.service', () => ({
  appendMemoryTimelineNote: vi.fn(),
}));

import { conversationNextCore } from './conversation';

describe('conversationNextCore summary revision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a follow-up question instead of an orphan revision state', async () => {
    const res = await conversationNextCore(
      {
        intake: {
          hasDebt: true,
          hasSavingsOrInvestments: true,
        } as any,
        blockId: 'debt',
        answersInCurrentBlock: ['Pago cuotas altas todos los meses'],
        completedBlocks: {},
        summaryValidation: {
          accepted: false,
          comment: 'Faltó mencionar que también uso avance en efectivo.',
        },
      },
      {
        id: 'user-test-1',
        name: 'Test User',
      },
    );

    expect(res.type).toBe('question');
    expect(res.blockId).toBe('debt');
    expect(typeof res.question).toBe('string');
    expect(String(res.question)).toContain('faltó');
    expect(res.revisionRequested).toBe(true);
  });
});
