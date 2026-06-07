import { ZodError } from 'zod';

export function zodFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ZodError)) return {};
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    const field = err.path[0] as string;
    if (!errors[field]) {
      errors[field] = err.message;
    }
  });
  return errors;
}
