import {
  CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS,
  CORE_AGENT_PROXY_BUFFER_MS,
  CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS,
} from './agent-timeouts';
import {
  BUDGET_CHAT_QA_TURN_LIMIT,
  CORE_AGENT_HISTORY_MESSAGE_LIMIT,
  CORE_AGENT_HISTORY_TURN_LIMIT,
  TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT,
} from './chat-history';

export const CHAT_PIPELINES = {
  core: {
    id: 'core',
    label: 'Agente principal',
    route: '/api/agent',
    streamRoute: '/api/agent/stream',
    historyTurnLimit: CORE_AGENT_HISTORY_TURN_LIMIT,
    historyMessageLimit: CORE_AGENT_HISTORY_MESSAGE_LIMIT,
    clientTimeoutMs: CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS,
    streamClientTimeoutMs:
      CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS + CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS,
    proxyTimeoutMs:
      CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS +
      CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS +
      CORE_AGENT_PROXY_BUFFER_MS,
    purpose:
      'Chat financiero general con ReAct, simulaciones, regulación y planes de acción. Único pipeline con citas en UI (chat-1/2/3).',
  },
  budget: {
    id: 'budget',
    label: 'Asistente de presupuesto',
    route: '/api/budget-chat',
    historyTurnLimit: BUDGET_CHAT_QA_TURN_LIMIT,
    historyMessageLimit: BUDGET_CHAT_QA_TURN_LIMIT,
    purpose:
      'Entrevista estructurada del panel presupuesto; mutaciones de tabla con confirmación. Sin bloque de citas en UI.',
  },
  transactions: {
    id: 'transactions',
    label: 'Analista de transacciones',
    route: '/api/transactions-chat',
    historyTurnLimit: TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT,
    historyMessageLimit: TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT,
    purpose:
      'Preguntas sobre cartolas, movimientos y patrones del producto activo. Sin bloque de citas en UI.',
  },
} as const;

export type ChatPipelineId = keyof typeof CHAT_PIPELINES;

export function getChatPipeline(id: ChatPipelineId) {
  return CHAT_PIPELINES[id];
}
