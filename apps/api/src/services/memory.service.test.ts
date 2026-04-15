import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('memory.service', () => {
  const tmpRoot = path.join(process.cwd(), 'tmp', 'memory-service-test');
  const userId = 'user_memory_test';

  beforeEach(async () => {
    vi.resetModules();
    process.env.DATA_DIR = tmpRoot;
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    await fs.mkdir(tmpRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  it('builds a persistent memory context with system and user layers', async () => {
    const memoryService = await import('./memory.service');

    const context = memoryService.buildAgentMemoryContext(userId);

    expect(context.user_memory.profile_summary).toBeTruthy();
    expect(Array.isArray(context.system_memory.capabilities)).toBe(true);
    expect(Array.isArray(context.system_memory.modules)).toBe(true);
  });

  it('persists facts, snapshots and timeline after an agent turn', async () => {
    const memoryService = await import('./memory.service');

    const memory = memoryService.appendTurnToMemory({
      input: {
        user_id: userId,
        user_name: 'Ignacio',
        session_id: 'session-1',
        user_message: 'Mi meta es ahorrar para un pie y prefiero un PDF detallado. Gano $1.500.000 al mes.',
        history: [],
        context: {},
        ui_state: {
          budget_summary: {
            income: 1500000,
            expenses: 900000,
            balance: 600000,
          },
        },
      },
      response: {
        message: 'Te conviene priorizar liquidez y simular el pie de tu casa.',
        mode: 'planification',
        tool_calls: [{ tool: 'finance.goal_planner', args: {}, status: 'success' }],
        react: { objective: 'Planificar meta', steps: [] },
        agent_blocks: [],
        artifacts: [{ id: 'pdf_1', type: 'pdf', title: 'Plan pie casa' }],
        citations: [],
        compliance: {
          mode: 'planification',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0.2,
          blocked: { is_blocked: false },
        },
        state_updates: {},
        knowledge_score: 25,
        knowledge_event_detected: true,
        meta: { turn_id: 'turn_1' },
      },
    });

    expect(memory.timeline).toHaveLength(1);
    expect(memory.financialSnapshot.income).toBe(1500000);
    expect(memory.preferences.preferred_output).toBe('pdf');
    expect(memory.preferences.detail_level).toBe('high');
    expect(memory.learningState.knowledge_score).toBe(25);
    expect(memory.facts.some((fact) => fact.type === 'goal')).toBe(true);
    expect(memory.facts.some((fact) => fact.type === 'artifact')).toBe(true);
  });
});
