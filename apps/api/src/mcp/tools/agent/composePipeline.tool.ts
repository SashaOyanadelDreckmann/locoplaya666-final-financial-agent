import { z } from 'zod';
import type { MCPTool } from '../types';
import { resolveExpressionRefs, safeEvalArithmetic } from '../calc/safeMath';

const StepSchema = z.object({
  step_id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/i, 'step_id must be alphanumeric'),
  label: z.string().max(120).optional(),
  expression: z.string().min(1).max(256),
});

const ComposePipelineSchema = z.object({
  pipeline_id: z.string().min(1).max(48),
  purpose: z.string().min(1).max(240),
  steps: z.array(StepSchema).min(1).max(12),
});

export type ComposePipelineArgs = z.infer<typeof ComposePipelineSchema>;

export function runComposePipeline(args: ComposePipelineArgs): {
  pipeline_id: string;
  purpose: string;
  results: Array<{
    step_id: string;
    label?: string;
    expression: string;
    resolved_expression: string;
    value: number;
  }>;
  verified: true;
} {
  const refs: Record<string, number> = {};
  const results: Array<{
    step_id: string;
    label?: string;
    expression: string;
    resolved_expression: string;
    value: number;
  }> = [];

  for (const step of args.steps) {
    if (refs[step.step_id] !== undefined) {
      throw new Error(`Duplicate step_id: ${step.step_id}`);
    }
    const resolved = resolveExpressionRefs(step.expression, refs);
    const value = safeEvalArithmetic(resolved);
    refs[step.step_id] = value;
    results.push({
      step_id: step.step_id,
      label: step.label,
      expression: step.expression,
      resolved_expression: resolved,
      value,
    });
  }

  return {
    pipeline_id: args.pipeline_id,
    purpose: args.purpose,
    results,
    verified: true,
  };
}

/**
 * Meta-tool: lets the agent compose ephemeral, schema-validated calculation pipelines
 * without arbitrary code execution. Results are deterministic and auditable.
 */
export const composePipelineTool: MCPTool = {
  name: 'agent.compose_pipeline',
  description:
    'Compose a short verified calculation pipeline (1-12 steps). Use {step_id} to chain prior numeric results. Prefer this over inventing numbers in prose when you need multi-step arithmetic grounded in tool outputs.',
  argsSchema: ComposePipelineSchema,
  run: async (args) => {
    const output = runComposePipeline(args);

    return {
      tool_call: {
        tool: 'agent.compose_pipeline',
        args,
        status: 'success',
        result: output,
      },
      data: {
        ok: true,
        ...output,
        grounding: 'deterministic_sandbox',
      },
    };
  },
};
