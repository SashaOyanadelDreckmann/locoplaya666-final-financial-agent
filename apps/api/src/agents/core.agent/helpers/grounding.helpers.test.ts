import { describe, expect, it } from 'vitest';
import { buildGroundingManifest, requiresVerifiedNumbers } from './grounding.helpers';
import type { ExecutionResult } from '../agent-types';

describe('grounding.helpers', () => {
  it('summarizes verified tool outputs', () => {
    const execution: ExecutionResult = {
      tool_calls: [{ tool: 'math.calc', status: 'success' }],
      tool_outputs: [{ tool: 'math.calc', data: { value: 42 } }],
      artifacts: [],
      agent_blocks: [],
      citations: [],
      react_trace: [],
      iterations_count: 1,
    };

    const manifest = buildGroundingManifest(execution);
    expect(manifest).toContain('math.calc → 42');
  });

  it('flags modes that require verified numbers', () => {
    expect(requiresVerifiedNumbers('simulation')).toBe(true);
    expect(requiresVerifiedNumbers('education')).toBe(false);
  });
});
