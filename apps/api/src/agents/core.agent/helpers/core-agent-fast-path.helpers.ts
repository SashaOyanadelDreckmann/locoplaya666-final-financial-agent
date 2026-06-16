/**
 * Deterministic fast-path for trivial core-agent turns (no LLM).
 */

import type { ChatAgentInput, ChatAgentResponse } from '../chat.types';
import { inferUserModel } from './user-model.helpers';
import { randomUUID } from 'crypto';

const TRIVIAL_GREETING =
  /^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello)\s*[!?.]*\s*$/i;

const TRIVIAL_ACK =
  /^\s*(gracias|muchas gracias|ok|dale|listo|perfecto|entendido|genial|de acuerdo|vale)\s*[!?.]*\s*$/i;

export function isCoreAgentTrivialTurn(userMessage: string): boolean {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return false;
  return TRIVIAL_GREETING.test(msg) || TRIVIAL_ACK.test(msg);
}

function buildTrivialReply(userMessage: string): string {
  const msg = String(userMessage ?? '').trim();
  if (TRIVIAL_ACK.test(msg)) {
    return 'De nada. Cuando quieras seguimos con tu situación financiera o con algún tema concreto.';
  }
  return 'Hola. Estoy listo para ayudarte con tu situación financiera. ¿Qué quieres revisar primero?';
}

function buildTrivialSuggestedReplies(activeChatId: string): string[] {
  if (activeChatId === 'chat-3') {
    return ['¿Qué papel tiene el dinero en tu vida?', '¿Cómo defines éxito financiero?'];
  }
  if (activeChatId === 'chat-2') {
    return ['Resume mi situación actual', '¿Cuál debería ser mi prioridad?'];
  }
  return ['Revisa mi presupuesto', '¿Cómo van mis gastos este mes?'];
}

export function buildCoreAgentTrivialResponse(input: ChatAgentInput): ChatAgentResponse {
  const turn_id = randomUUID();
  const started_at = Date.now();
  const activeChatId = String((input.ui_state as { active_chat?: { id?: string } } | undefined)?.active_chat?.id ?? 'chat-1');
  const inferred_user_model = inferUserModel({
    userMessage: input.user_message,
    history: input.history,
  });

  return {
    message: buildTrivialReply(input.user_message),
    mode: 'information',
    tool_calls: [],
    react: {
      objective: 'trivial_turn',
      steps: [{ step: 0, goal: 'Fast path', observation: 'deterministic', decision: 'Skip LLM' }],
    },
    agent_blocks: [],
    artifacts: [],
    citations: [],
    compliance: {
      mode: 'information',
      no_auto_execution: true,
      includes_recommendation: false,
      includes_simulation: false,
      includes_regulation: false,
      missing_information: [],
      disclaimers_shown: [],
      risk_score: 0.15,
      blocked: { is_blocked: false },
    },
    state_updates: {
      inferred_user_model,
    },
    suggested_replies: buildTrivialSuggestedReplies(activeChatId),
    meta: {
      turn_id,
      latency_ms: Date.now() - started_at,
    },
  };
}
