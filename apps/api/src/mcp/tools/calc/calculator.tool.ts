import { z } from 'zod';
import type { MCPTool } from '../types';
import { safeEvalArithmetic } from './safeMath';

export const calculatorTool: MCPTool = {
  name: 'math.calc',
  description: 'Evaluates a simple arithmetic expression safely (no variables).',
  argsSchema: z.object({
    expression: z.string().min(1),
  }),
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string' },
    },
    required: ['expression'],
  },
  run: async (args) => {
    const expression = String(args.expression);
    const value = safeEvalArithmetic(expression);

    return {
      tool_call: {
        tool: 'math.calc',
        args,
        status: 'success',
        result: { value },
      },
      data: { value },
    };
  },
};
