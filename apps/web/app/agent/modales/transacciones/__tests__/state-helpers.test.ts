/** @jest-environment node */

import { mergeAssistantState, mergeBankProductPatch } from '../state.helpers';
import type { BankProduct } from '../types';

describe('transactions state helpers', () => {
  const baseProduct: BankProduct = {
    id: 'p1',
    label: 'Tarjeta',
    bank: 'Banco',
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    productType: 'credit_card',
    uploadedFiles: [],
    parsedDocuments: [],
    assistant: {
      messages: [
        { id: 'u1', role: 'user', text: 'Hola', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      uploadFormat: 'pdf',
      summaryText: 'Resumen antiguo',
      summaryModel: 'old',
      summaryGeneratedAt: '2026-01-01T00:00:00.000Z',
      summaryRegenerationsUsed: 1,
      lastSummaryFeedback: 'ok',
    },
  };

  it('preserves current assistant messages when a stale patch rewrites summary state', () => {
    const merged = mergeBankProductPatch(baseProduct, {
      assistant: {
        messages: [
          { id: 'u1', role: 'user', text: 'Hola', createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'a1', role: 'assistant', text: 'Nuevo resumen', createdAt: '2026-01-01T00:01:00.000Z' },
        ],
        summaryText: 'Nuevo resumen',
        summaryModel: 'instant-heuristic',
        summaryGeneratedAt: '2026-01-01T00:01:00.000Z',
      },
    });

    expect(merged.assistant?.messages).toHaveLength(2);
    expect(merged.assistant?.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(merged.assistant?.summaryText).toBe('Nuevo resumen');
    expect(merged.assistant?.uploadFormat).toBe('pdf');
    expect(merged.assistant?.summaryRegenerationsUsed).toBe(1);
  });

  it('replaces assistant messages when patch explicitly passes an empty array', () => {
    const merged = mergeBankProductPatch(baseProduct, {
      assistant: {
        messages: [],
        summaryText: null,
        summaryModel: null,
        summaryGeneratedAt: null,
        summaryRegenerationsUsed: 0,
        lastSummaryFeedback: null,
        uploadFormat: null,
      },
    });

    expect(merged.assistant?.messages).toEqual([]);
    expect(merged.assistant?.summaryText).toBeNull();
  });

  it('returns an assistant shell when only patch data exists', () => {
    expect(
      mergeAssistantState(undefined, {
        messages: [],
        summaryText: 'Resumen',
      }),
    ).toMatchObject({
      messages: [],
      summaryText: 'Resumen',
      summaryModel: null,
      summaryRegenerationsUsed: 0,
    });
  });
});
