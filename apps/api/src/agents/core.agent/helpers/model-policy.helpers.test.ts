import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  needsChartsOrTablesMcp,
  resolveCoreAgentClaudeModel,
  resolvePlanExecuteModel,
} from './model-policy.helpers';

describe('model-policy.helpers', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_MODEL = 'gpt-5.2';
    process.env.OPENAI_MODEL_FAST = 'gpt-4.1-mini';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
    process.env.ANTHROPIC_MODEL_FAST = 'claude-haiku-4-5';
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('detects chart/table MCP need from user message', () => {
    expect(
      needsChartsOrTablesMcp({
        userMessage: 'Hazme un gráfico de mis gastos',
      }),
    ).toBe(true);
  });

  it('detects chart/table MCP need from simulation mode with tools', () => {
    expect(
      needsChartsOrTablesMcp({
        userMessage: 'Proyecta mi ahorro',
        mode: 'simulation',
        requiresTools: true,
      }),
    ).toBe(true);
  });

  it('uses gpt-5.2 for visual MCP tool loops', () => {
    expect(
      resolvePlanExecuteModel({
        userMessage: 'Compara en una tabla los bancos',
        mode: 'comparison',
        requiresTools: true,
      }),
    ).toBe('gpt-5.2');
  });

  it('uses lite OpenAI model for non-visual tool loops', () => {
    expect(
      resolvePlanExecuteModel({
        userMessage: 'Qué es la CMF?',
        mode: 'regulation',
        requiresTools: true,
      }),
    ).toBe('gpt-4.1-mini');
  });

  it('always uses Haiku for core agent Claude calls', () => {
    expect(resolveCoreAgentClaudeModel()).toBe('claude-haiku-4-5');
  });
});
