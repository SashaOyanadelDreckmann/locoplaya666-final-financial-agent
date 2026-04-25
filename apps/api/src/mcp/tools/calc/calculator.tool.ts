import { z } from 'zod';
import type { MCPTool } from '../types';

const MAX_EXPRESSION_LENGTH = 256;
const MAX_TOKENS = 128;
const TOKEN_REGEX = /\d+(?:[.,]\d+)?|[+\-*/()]|\s+/g;

function tokenize(expression: string): string[] {
  const matches = expression.match(TOKEN_REGEX);
  if (!matches) throw new Error('Invalid expression');
  const joined = matches.join('');
  if (joined.length !== expression.length) {
    throw new Error('Invalid expression (only numbers and + - * / ( ) . allowed)');
  }
  return matches.filter((t) => !/^\s+$/.test(t)).map((t) => t.replace(',', '.'));
}

function precedence(op: string): number {
  if (op === '+' || op === '-') return 1;
  if (op === '*' || op === '/') return 2;
  return 0;
}

function applyOp(values: number[], op: string): void {
  const right = values.pop();
  const left = values.pop();
  if (left === undefined || right === undefined) {
    throw new Error('Malformed expression');
  }
  let out: number;
  if (op === '+') out = left + right;
  else if (op === '-') out = left - right;
  else if (op === '*') out = left * right;
  else if (op === '/') {
    if (right === 0) throw new Error('Division by zero');
    out = left / right;
  } else {
    throw new Error('Unsupported operator');
  }
  values.push(out);
}

function safeEval(expr: string): number {
  const cleaned = expr.trim();
  if (!cleaned) throw new Error('Expression is empty');
  if (cleaned.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expression too long (max ${MAX_EXPRESSION_LENGTH} chars)`);
  }
  if (cleaned.includes('**')) {
    throw new Error('Operator ** is not allowed');
  }

  const tokens = tokenize(cleaned);
  if (tokens.length > MAX_TOKENS) {
    throw new Error(`Too many tokens (max ${MAX_TOKENS})`);
  }

  const values: number[] = [];
  const ops: string[] = [];
  let expectValue = true;

  for (const token of tokens) {
    const numeric = Number(token);
    if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(token)) {
      values.push(numeric);
      expectValue = false;
      continue;
    }

    if (token === '(') {
      ops.push(token);
      expectValue = true;
      continue;
    }
    if (token === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        applyOp(values, ops.pop() as string);
      }
      if (ops.pop() !== '(') throw new Error('Unbalanced parentheses');
      expectValue = false;
      continue;
    }

    if (!['+', '-', '*', '/'].includes(token)) {
      throw new Error('Invalid token');
    }

    if (expectValue) {
      // Support unary minus by injecting a leading zero.
      if (token === '-') {
        values.push(0);
      } else {
        throw new Error('Malformed expression');
      }
    }

    while (ops.length > 0 && precedence(ops[ops.length - 1]) >= precedence(token)) {
      applyOp(values, ops.pop() as string);
    }
    ops.push(token);
    expectValue = true;
  }

  while (ops.length > 0) {
    const op = ops.pop() as string;
    if (op === '(') throw new Error('Unbalanced parentheses');
    applyOp(values, op);
  }

  if (values.length !== 1 || !Number.isFinite(values[0])) {
    throw new Error('Expression did not evaluate to a finite number');
  }
  return values[0];
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
