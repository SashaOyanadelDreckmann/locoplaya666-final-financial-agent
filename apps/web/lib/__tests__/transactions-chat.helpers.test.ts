import {
  buildChatDashboardForQuestion,
  compactChatHistory,
  compactDashboardForPrompt,
  compactDocumentsForPrompt,
  compactTxText,
  extractQuestionSignals,
  retrieveMovementsForQuestion,
  selectMovementsForPrompt,
} from '../transacciones/chat.helpers';

const sampleMovements = [
  {
    date: '2025-01-05',
    merchant: 'Falabella',
    description: 'COMPRA FALABELLA PARQUE ARAUCO',
    amount: -45990,
    direction: 'expense',
    category: 'Retail',
  },
  {
    date: '2025-01-15',
    merchant: 'Jumbo',
    description: 'SUPERMERCADO JUMBO',
    amount: -82340,
    direction: 'expense',
    category: 'Supermercado',
  },
  {
    date: '2025-01-15',
    merchant: 'Uber',
    description: 'UBER TRIP',
    amount: -8900,
    direction: 'expense',
    category: 'Transporte',
  },
  {
    date: '2025-02-01',
    merchant: 'Sueldo',
    description: 'ABONO REMUNERACIONES',
    amount: 1800000,
    direction: 'income',
    category: 'Ingresos',
  },
  ...Array.from({ length: 40 }, (_, index) => ({
    date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
    merchant: `Comercio ${index}`,
    description: `Cargo genérico ${index}`,
    amount: -(1000 + index * 100),
    direction: 'expense' as const,
    category: 'Consumo general',
  })),
];

describe('transactions-chat.helpers', () => {
  it('truncates free text', () => {
    expect(compactTxText('  hola mundo  ', 4)).toBe('hola');
  });

  it('compacts dashboard movements and merchants', () => {
    const digest = compactDashboardForPrompt({
      currency: 'CLP',
      keyMetrics: { movement_count: 120 },
      topMerchants: Array.from({ length: 12 }, (_, index) => ({ merchant: `m-${index}`, amount: index })),
      movements: Array.from({ length: 120 }, (_, index) => ({
        description: `mov-${index}`,
        amount: index,
        direction: index % 5 === 0 ? 'income' : 'expense',
      })),
    }, { maxMovements: 64 });

    expect(digest?.topMerchants).toHaveLength(10);
    expect((digest?.movements as unknown[] | undefined)?.length).toBe(64);
    expect(
      (digest?.movements as Array<{ amount?: number }> | undefined)?.some((row) => Number(row.amount) >= 100),
    ).toBe(true);
  });

  it('prioritizes high-value and recent movements instead of only the first rows', () => {
    const movements = Array.from({ length: 100 }, (_, index) => ({
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      description: `mov-${index}`,
      amount: index,
      direction: 'expense' as const,
    }));
    const selected = selectMovementsForPrompt(movements, 20);
    expect(selected.some((row) => Number(row.amount) >= 90)).toBe(true);
    expect(selected.some((row) => Number(row.amount) <= 5)).toBe(false);
  });

  it('compacts documents and chat history', () => {
    expect(
      compactDocumentsForPrompt([{ name: 'doc.pdf', text: 'x'.repeat(2000) }], { maxDocs: 2, maxText: 40 }),
    ).toEqual([
      {
        documentId: undefined,
        documentProfile: null,
        name: 'doc.pdf',
        insight: null,
        text: 'x'.repeat(40),
      },
    ]);

    expect(
      compactChatHistory(
        Array.from({ length: 12 }, (_, index) => ({ role: 'user', text: `msg-${index}` })),
        4,
        20,
      ),
    ).toHaveLength(4);
  });

  it('extracts merchant, date and amount signals from a question', () => {
    const signals = extractQuestionSignals('¿Qué pasó con Falabella el 15 de enero por $45.990?');
    expect(signals.keywords).toContain('falabella');
    expect(signals.amounts).toContain(45990);
    expect(signals.dates.some((date) => date.day === 15 && date.month === 1)).toBe(true);
  });

  it('retrieves targeted movements for a specific merchant question', () => {
    const result = retrieveMovementsForQuestion('compra en Falabella', sampleMovements, {
      maxRetrieved: 8,
      overviewSample: 12,
    });

    expect(result.mode).toBe('targeted');
    expect(result.movements.some((row) => normalizeMerchant(row).includes('falabella'))).toBe(true);
    expect(result.movements.length).toBeLessThanOrEqual(12);
  });

  it('retrieves movements for a date-specific question', () => {
    const result = retrieveMovementsForQuestion('movimientos del 15 de enero', sampleMovements, {
      maxRetrieved: 8,
      overviewSample: 12,
    });

    expect(result.mode).toBe('targeted');
    expect(
      result.movements.filter((row) => String(row.date ?? '').includes('2025-01-15')).length,
    ).toBeGreaterThan(0);
  });

  it('uses overview sampling for generic questions', () => {
    const result = retrieveMovementsForQuestion('¿Cómo va mi resumen general?', sampleMovements, {
      overviewSample: 16,
    });

    expect(result.mode).toBe('overview');
    expect(result.movements.length).toBe(16);
  });

  it('builds a compact chat dashboard with retrieval metadata', () => {
    const digest = buildChatDashboardForQuestion(
      {
        currency: 'CLP',
        keyMetrics: { movement_count: sampleMovements.length },
        topCategories: [{ name: 'Consumo', amount: 1000 }],
        movements: sampleMovements,
      },
      'Uber el 15 de enero',
    );

    expect(digest?.retrieval).toBeDefined();
    expect(Array.isArray(digest?.movements)).toBe(true);
    expect((digest?.movements as unknown[] | undefined)?.length ?? 0).toBeLessThanOrEqual(24);
    expect(
      (digest?.movements as Array<{ merchant?: string; description?: string }> | undefined)?.some((row) =>
        String(row.merchant ?? row.description ?? '').toLowerCase().includes('uber'),
      ),
    ).toBe(true);
  });
});

function normalizeMerchant(row: { merchant?: string; description?: string; label?: string }) {
  return String(row.merchant ?? row.description ?? row.label ?? '').toLowerCase();
}
