import { describe, expect, it } from 'vitest';
import {
  resolveToolCategory,
  resolveToolTimeoutMs,
  toSerfToolError,
} from './tool-governance';
import { ToolError, ToolErrorCode } from './security/error';

describe('tool-governance', () => {
  it('classifies agent meta tools', () => {
    expect(resolveToolCategory('agent.compose_pipeline')).toBe('meta');
    expect(resolveToolCategory('web.search')).toBe('web');
    expect(resolveToolCategory('finance.simulate')).toBe('finance');
  });

  it('assigns tighter timeout to meta tools', () => {
    expect(resolveToolTimeoutMs('agent.compose_pipeline')).toBeLessThan(
      resolveToolTimeoutMs('web.search'),
    );
  });

  it('builds SERF structured errors for the ReAct loop', () => {
    const serf = toSerfToolError(
      'math.calc',
      new ToolError('bad expr', ToolErrorCode.INVALID_ARGS, { retryable: false, statusCode: 400 }),
    );
    expect(serf.ok).toBe(false);
    expect(serf.error.retryable).toBe(false);
    expect(serf.error.suggested_action).toContain('argumentos');
  });
});
