import { describe, expect, it } from 'vitest';
import {
  applyLifecycleAfterResponse,
  buildLifecycleDecision,
} from './product-lifecycle.service';
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

  it('uses post-diagnosis chat-1 directive when budget and transactions are loaded', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
          injected_profile: { diagnosticNarrative: 'Perfil estable' },
          product_lifecycle: { interviewCompleted: true },
        },
        ui_state: {
          active_chat: { id: 'chat-1', label: 'Core', name: 'Chat general' },
          unlocked_modules: { interview: true, post_diagnosis_chats: true, budget: true, transactions: true },
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000, rows_count: 6 },
          budget_rows: [{ id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 450000 }],
        },
      }),
      memoryBlob: {
        productLifecycle: {
          phase: 'diagnosis_ready',
          unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
          chatTurns: { 'chat-1': 1, 'chat-2': 0, 'chat-3': 0 },
          closedChats: [],
          reports: [],
        },
      },
      hasIntake: true,
    });

    expect(decision.systemDirective).toContain('CHAT 1 POST-DIAGNOSTICO');
    expect(decision.systemDirective).toContain('NUNCA pidas re-subir presupuesto ni cartolas');
    expect(decision.systemDirective).toContain('PRESUPUESTO VERIFICADO EN CONTEXTO');
    expect(decision.systemDirective).not.toContain('recomienda subir transacciones del mes');
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

  it('keeps chats 2 and 3 unlocked after diagnosis even if panel data is cleared', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        context: {},
        ui_state: {
          active_chat: { id: 'chat-2', label: 'Plan', name: 'Plan' },
          unlocked_modules: { post_diagnosis_chats: true },
          budget_summary: { income: 0, expenses: 0, balance: 0 },
        },
      }),
      memoryBlob: {
        productLifecycle: {
          phase: 'diagnosis_ready',
          unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
          chatTurns: { 'chat-1': 0, 'chat-2': 0, 'chat-3': 0 },
          closedChats: [],
          reports: [],
        },
      },
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

  it('aligns chat-2 directive to deliver when user asks for final plan early', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        user_message: 'listo, dame el plan final estructurado',
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

    expect(decision.blocked).toBe(false);
    expect(decision.systemDirective).toContain('ENTREGA FINAL');
    expect(decision.systemDirective).not.toContain('interaccion 30');
  });

  it('uses chat-specific closing mode threshold in directive', () => {
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
      memoryBlob: {
        productLifecycle: {
          phase: 'diagnosis_ready',
          unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
          chatTurns: { 'chat-1': 0, 'chat-2': 14, 'chat-3': 0 },
          closedChats: [],
          reports: [],
        },
      },
      hasIntake: true,
    });

    expect(decision.closingMode).toBe(true);
    expect(decision.systemDirective).toContain('10/15');
  });

  it('aligns chat-3 directive to social consciousness funnel', () => {
    const decision = buildLifecycleDecision({
      input: makeInput({
        user_message: '¿El dinero compra libertad real?',
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
          product_lifecycle: { interviewCompleted: true },
        },
        ui_state: {
          active_chat: { id: 'chat-3', label: '3', name: 'Conciencia social' },
          unlocked_modules: { interview: true, post_diagnosis_chats: true },
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      }),
      memoryBlob: null,
      hasIntake: true,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.systemDirective).toContain('EXPLORACION');
    expect(decision.systemDirective).toContain('filosofo socratico');
    expect(decision.systemDirective).toContain('1/10');
  });

  it('blocks chat when interaction limit is already exhausted', () => {
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
      memoryBlob: {
        productLifecycle: {
          phase: 'diagnosis_ready',
          unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
          chatTurns: { 'chat-1': 0, 'chat-2': 15, 'chat-3': 0 },
          closedChats: [],
          reports: [],
        },
      },
      hasIntake: true,
    });

    expect(decision.blocked).toBe(true);
    expect(decision.reason).toContain('15');
  });

  it('closes chat and appends report after the final interaction response', () => {
    const state = {
      phase: 'diagnosis_ready' as const,
      unlockedChats: ['chat-1', 'chat-2', 'chat-3'] as const,
      chatTurns: { 'chat-1': 0, 'chat-2': 0, 'chat-3': 9 },
      closedChats: [] as Array<'chat-1' | 'chat-2' | 'chat-3'>,
      reports: [] as Array<{
        id: string;
        chatId: 'chat-1' | 'chat-2' | 'chat-3';
        title: string;
        createdAt: string;
        summary: string;
      }>,
      updatedAt: new Date().toISOString(),
    };

    const next = applyLifecycleAfterResponse({
      state,
      activeChatId: 'chat-3',
      input: makeInput({
        ui_state: {
          active_chat: { id: 'chat-3', label: '3', name: 'Conciencia social' },
          unlocked_modules: {},
        },
      }),
      response: {
        message: 'Cierre reflexivo final sobre dinero y valores.',
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
      },
    });

    expect(next.chatTurns['chat-3']).toBe(10);
    expect(next.closedChats).toContain('chat-3');
    expect(next.reports).toHaveLength(1);
    expect(next.reports[0]?.chatId).toBe('chat-3');
  });
});
