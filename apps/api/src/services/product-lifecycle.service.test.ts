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
    expect(decision.state.unlockedChats).toEqual(['chat-1']);
  });

  it('keeps chats 2 and 3 locked before diagnosis is ready', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
        ui_state: {
          active_chat: { id: 'chat-2', label: 'Plan', name: 'Plan' },
          unlocked_modules: {},
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('interview_needed');
    expect(decision.state.unlockedChats).toEqual(['chat-1']);
    expect(decision.blocked).toBe(true);
  });

  it('unlocks chats 2 and 3 when diagnosis is ready', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
          product_lifecycle: { interviewCompleted: true },
        },
        ui_state: {
          active_chat: { id: 'chat-2', label: 'Plan', name: 'Plan' },
          unlocked_modules: { interview: true, post_diagnosis_chats: true },
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('diagnosis_ready');
    expect(decision.state.unlockedChats).toEqual(['chat-1', 'chat-2', 'chat-3']);
    expect(decision.blocked).toBe(false);
  });

  it('does not treat interview availability as diagnosis completion', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
        ui_state: {
          active_chat: { id: 'chat-2', label: 'Plan', name: 'Plan' },
          unlocked_modules: { interview: true },
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.state.phase).toBe('interview_needed');
    expect(decision.state.unlockedChats).toEqual(['chat-1']);
    expect(decision.blocked).toBe(true);
  });
});
