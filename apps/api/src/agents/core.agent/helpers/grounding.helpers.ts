import type { ExecutionResult } from '../agent-types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function summarizeToolOutput(tool: string, data: unknown): string[] {
  const lines: string[] = [];
  const record = asRecord(data);
  if (!record) return lines;

  if (tool === 'math.calc' && typeof record.value === 'number') {
    lines.push(`math.calc → ${record.value}`);
  }

  if (tool === 'agent.compose_pipeline' && record.verified === true && Array.isArray(record.results)) {
    for (const step of record.results.slice(0, 8)) {
      if (!step || typeof step !== 'object') continue;
      const row = step as Record<string, unknown>;
      const stepId = typeof row.step_id === 'string' ? row.step_id : 'step';
      const value = row.value;
      if (typeof value === 'number') {
        lines.push(`compose.${stepId} → ${value}`);
      }
    }
  }

  if (tool.startsWith('market.') && record.value != null) {
    lines.push(`${tool} → ${record.value}`);
  }

  if (tool === 'web.search' && Array.isArray(record.results)) {
    for (const hit of record.results.slice(0, 3)) {
      const row = asRecord(hit);
      if (!row) continue;
      const title = typeof row.title === 'string' ? row.title : 'Fuente web';
      const url = typeof row.url === 'string' ? row.url : '';
      lines.push(`web.search → ${title}${url ? ` (${url})` : ''}`);
    }
  }

  if (tool === 'finance.transactions_charts' && typeof record.charts_built === 'number') {
    lines.push(`finance.transactions_charts → ${record.charts_built} gráfico(s) verificados`);
  }

  if (Array.isArray(record.citations)) {
    lines.push(`${tool} → ${record.citations.length} cita(s) estructuradas`);
  }

  return lines;
}

/**
 * Compact manifest of verified facts from tool outputs.
 * Injected into the format phase so the model grounds prose in evidence.
 */
export function buildGroundingManifest(execution?: ExecutionResult | null): string {
  if (!execution) return 'Sin evidencia de herramientas en este turno.';

  const lines: string[] = [];
  const successfulTools = (execution.tool_calls ?? []).filter((call) => call.status !== 'error');

  for (const call of successfulTools) {
    const output = execution.tool_outputs?.find((entry) => entry.tool === call.tool);
    const facts = summarizeToolOutput(call.tool, output?.data);
    lines.push(...facts);
  }

  if (lines.length === 0) {
    return 'Herramientas ejecutadas sin hechos estructurados; prioriza datos del contexto inyectado y evita cifras no verificadas.';
  }

  return [
    'HECHOS VERIFICADOS (solo puedes citar cifras alineadas con esta lista o el intake):',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

export function requiresVerifiedNumbers(mode?: string): boolean {
  return ['simulation', 'comparison', 'decision_support', 'planification', 'budgeting', 'regulation'].includes(
    String(mode ?? ''),
  );
}
