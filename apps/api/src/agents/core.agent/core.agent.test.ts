import { describe, expect, it } from 'vitest';
import { ChatAgentResponseSchema } from './chat.types';

describe('Core Agent Contract', () => {
  it('accepts the canonical response shape returned by the core agent', () => {
    const parsed = ChatAgentResponseSchema.parse({
      message: 'Te propongo priorizar liquidez antes de aumentar riesgo.',
      mode: 'decision_support',
      tool_calls: [],
      react: {
        objective: 'Priorizar liquidez',
        steps: [],
      },
      agent_blocks: [],
      artifacts: [],
      citations: [],
      compliance: {
        mode: 'decision_support',
        no_auto_execution: true,
        includes_recommendation: true,
        includes_simulation: false,
        includes_regulation: false,
        missing_information: [],
        disclaimers_shown: ['coherence_warning'],
        risk_score: 0.42,
        blocked: {
          is_blocked: false,
        },
      },
      state_updates: {
        inferred_user_model: {
          preferred_output: 'mixed',
        },
        coherence_validation: {
          isCoherent: true,
          score: 0.88,
          warnings: [],
          suggestions: [],
        },
      },
      suggested_replies: ['Muéstrame un escenario más conservador'],
      panel_action: {
        section: 'budget',
        message: 'Revisa tu flujo mensual antes de invertir más.',
      },
      context_score: 55,
      budget_updates: [
        {
          label: 'Ahorro mensual',
          type: 'income',
          amount: 250000,
        },
      ],
      knowledge_score: 32,
      knowledge_event_detected: true,
      milestone_unlocked: {
        threshold: 40,
        feature: 'Presupuesto personalizado',
      },
      meta: {
        turn_id: 'turn_test',
        latency_ms: 123,
      },
    });

    expect(parsed.message).toContain('liquidez');
    expect(parsed.compliance.risk_score).toBeGreaterThan(0);
    expect(parsed.knowledge_event_detected).toBe(true);
  });
});
