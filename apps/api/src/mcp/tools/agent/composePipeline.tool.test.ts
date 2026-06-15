import { describe, expect, it } from 'vitest';
import { runComposePipeline } from './composePipeline.tool';
import { resolveExpressionRefs, safeEvalArithmetic } from '../calc/safeMath';

describe('safeMath', () => {
  it('evaluates basic arithmetic', () => {
    expect(safeEvalArithmetic('(1000 + 200) * 0.1')).toBe(120);
  });

  it('resolves step references', () => {
    const resolved = resolveExpressionRefs('{base} * 12', { base: 500_000 });
    expect(safeEvalArithmetic(resolved)).toBe(6_000_000);
  });
});

describe('agent.compose_pipeline', () => {
  it('runs a multi-step verified pipeline', () => {
    const output = runComposePipeline({
      pipeline_id: 'apv_savings',
      purpose: 'Ahorro anual estimado',
      steps: [
        { step_id: 'monthly', expression: '150000 * 0.1' },
        { step_id: 'annual', expression: '{monthly} * 12', label: 'Ahorro anual' },
      ],
    });

    expect(output.verified).toBe(true);
    expect(output.results).toHaveLength(2);
    expect(output.results[1].value).toBe(180_000);
  });

  it('rejects duplicate step ids', () => {
    expect(() =>
      runComposePipeline({
        pipeline_id: 'dup',
        purpose: 'test',
        steps: [
          { step_id: 'a', expression: '1+1' },
          { step_id: 'a', expression: '2+2' },
        ],
      }),
    ).toThrow(/Duplicate step_id/);
  });
});
