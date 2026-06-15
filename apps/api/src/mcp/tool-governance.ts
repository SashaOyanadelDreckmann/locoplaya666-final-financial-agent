/**
 * Controlled MCP execution for Core Agent.
 * Implements SERF-style structured errors and per-category timeout budgets (ATBA-lite).
 */

import { ToolError, ToolErrorCode, wrapError } from './security/error';

export type SerfToolError = {
  ok: false;
  error: {
    code: ToolErrorCode | string;
    message: string;
    retryable: boolean;
    suggested_action: string;
    tool: string;
  };
};

export type ToolCategory =
  | 'meta'
  | 'web'
  | 'market'
  | 'rag'
  | 'finance'
  | 'simulation'
  | 'math'
  | 'time'
  | 'default';

const CATEGORY_TIMEOUT_MS: Record<ToolCategory, number> = {
  meta: 4_000,
  web: 12_000,
  market: 6_000,
  rag: 10_000,
  finance: 8_000,
  simulation: 15_000,
  math: 2_000,
  time: 1_000,
  default: 8_000,
};

export function resolveToolCategory(toolName: string): ToolCategory {
  const name = String(toolName ?? '').toLowerCase();
  if (name.startsWith('agent.')) return 'meta';
  if (name.startsWith('web.') || name.startsWith('regulatory.')) return 'web';
  if (name.startsWith('market.')) return 'market';
  if (name.startsWith('rag.')) return 'rag';
  if (name.startsWith('finance.')) return 'finance';
  if (name.startsWith('finance.simulate') || name.startsWith('finance.project')) return 'simulation';
  if (name.includes('simulate') || name.includes('montecarlo') || name.includes('scenario')) {
    return 'simulation';
  }
  if (name.startsWith('math.') || name.startsWith('format.')) return 'math';
  if (name.startsWith('time.')) return 'time';
  return 'default';
}

export function resolveToolTimeoutMs(toolName: string): number {
  const category = resolveToolCategory(toolName);
  const envKey = `MCP_TIMEOUT_${category.toUpperCase()}_MS`;
  const fromEnv = Number(process.env[envKey]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return CATEGORY_TIMEOUT_MS[category];
}

function suggestedActionForCode(code: ToolErrorCode | string): string {
  switch (code) {
    case ToolErrorCode.INVALID_ARGS:
      return 'Corrige los argumentos según el schema de la herramienta y reintenta.';
    case ToolErrorCode.TIMEOUT:
      return 'La herramienta tardó demasiado; simplifica la consulta o usa otra fuente.';
    case ToolErrorCode.RATE_LIMITED:
      return 'Espera unos segundos antes de volver a invocar esta herramienta.';
    case ToolErrorCode.NOT_FOUND:
      return 'Verifica el nombre de la herramienta o usa una alternativa registrada.';
    case ToolErrorCode.SECURITY_ERROR:
      return 'No reintentes; reformula la solicitud sin datos sensibles o URLs bloqueadas.';
    default:
      return 'Revisa los datos disponibles y prueba con otra herramienta o menos pasos.';
  }
}

export function toSerfToolError(toolName: string, error: ToolError): SerfToolError {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      suggested_action: suggestedActionForCode(error.code),
      tool: toolName,
    },
  };
}

export function toSerfFromUnknown(toolName: string, error: unknown): SerfToolError {
  const wrapped = wrapError(error, toolName);
  return toSerfToolError(toolName, wrapped);
}

export function toSerfFromIssues(toolName: string, issues: unknown): SerfToolError {
  return {
    ok: false,
    error: {
      code: ToolErrorCode.INVALID_ARGS,
      message: 'Invalid tool arguments',
      retryable: false,
      suggested_action: suggestedActionForCode(ToolErrorCode.INVALID_ARGS),
      tool: toolName,
    },
  };
}

export async function withToolTimeout<T>(
  toolName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const timeoutMs = resolveToolTimeoutMs(toolName);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new ToolError(
              `${toolName} timed out after ${timeoutMs}ms`,
              ToolErrorCode.TIMEOUT,
              { retryable: true, statusCode: 504 },
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
