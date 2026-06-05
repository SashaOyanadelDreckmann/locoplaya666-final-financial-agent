import { describe, expect, it } from 'vitest';
import { buildLifecycleDecision } from './product-lifecycle.service';
import type { ChatAgentInput } from '../agents/core.agent/chat.types';

function makeInput(overrides: Partial<ChatAgentInput> = {}): ChatAgentInput {
  return {
    user_id: 'user-test',
    session_id: 'session-test',
    user_message: 'hola',
    history: [],
    context: {},
    ui_state: {
      active_chat: { id: 'chat-1', label: 'Core', name: 'Core' },
      unlocked_modules: {},
    },
    preferences: {},
    ...overrides,
  };
}

describe('product lifecycle ordering', () => {
  it('prioritizes transactions before budget', () => {
    const decision = buildLifecycleDecision({
      input: makeInput(),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('transactions_needed');
  });

  it('moves to budget once transactions already exist', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('budget_needed');
  });

  it('does not skip transactions when there is budget but no cartola', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
        ui_state: {
          active_chat: { id: 'chat-1', label: 'Core', name: 'Core' },
          unlocked_modules: {},
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('transactions_needed');
  });

  it('moves to interview when transactions and budget are present', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
        ui_state: {
          active_chat: { id: 'chat-1', label: 'Core', name: 'Core' },
          unlocked_modules: {},
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('interview_needed');
  });
});
