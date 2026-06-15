import type { CoreAgentRequestContext } from '@/lib/agente/nucleo/buildCoreAgentContext';
import type { AgentResponse } from '@/lib/agente/agent.response.types';
import { buildTransactionChartBlocksFromProductContext } from '@/lib/transacciones/analytics/build-transaction-chart-blocks-from-product';

/** Transaction charts are only attached when the agent emits them or on product save — never heuristically. */
export function enrichAgentResponseWithTransactionCharts(params: {
  response: AgentResponse;
  context?: CoreAgentRequestContext;
  userMessage?: string;
  variants?: Parameters<typeof buildTransactionChartBlocksFromProductContext>[1];
}): AgentResponse {
  return params.response;
}

export function buildDeterministicTransactionChartResponse(params: {
  context: CoreAgentRequestContext;
  message: string;
  variants?: Parameters<typeof buildTransactionChartBlocksFromProductContext>[1];
}): AgentResponse | null {
  const blocks = buildTransactionChartBlocksFromProductContext(params.context, params.variants);
  if (!blocks.length) return null;
  return {
    message: params.message,
    agent_blocks: blocks,
  };
}
