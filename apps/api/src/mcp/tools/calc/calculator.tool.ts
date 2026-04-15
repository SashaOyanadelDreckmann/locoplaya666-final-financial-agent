import { z } from 'zod';
import type { MCPTool } from '../types';

function safeEval(expr: string): number {
  const cleaned = expr.replace(/,/g, '.').trim();

  if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) {
    throw new Error('Invalid expression (only numbers and + - * / ( ) . allowed)');
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${cleaned});`);
  const out = fn();

  if (typeof out !== 'number' || !isFinite(out)) {
    throw new Error('Expression did not evaluate to a finite number');
  }

  return out;
}

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
    const value = safeEval(expression);

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
