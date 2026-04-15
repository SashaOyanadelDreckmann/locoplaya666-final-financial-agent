import { ZodError, type ZodType } from 'zod';
import { validationError } from './api.errors';

function parseWithSchema<T>(schema: ZodType<T>, input: unknown, target: string): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw validationError(`${target} validation failed`,
        error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    throw error;
  }
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return parseWithSchema(schema, body, 'Request');
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  return parseWithSchema(schema, query, 'Query');
}

export function parseParams<T>(schema: ZodType<T>, params: unknown): T {
  return parseWithSchema(schema, params, 'Params');
}
