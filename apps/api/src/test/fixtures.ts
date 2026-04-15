/**
 * fixtures.ts
 *
 * Test data fixtures for unit and integration tests.
 */

export const fixtures = {
  // Agent test data
  agent: {
    simpleQuery: 'How much should I save monthly for retirement?',
    toolUsingQuery: 'What is the current USD to CLP exchange rate and how much money do I have in debt?',
    classifyRequest: {
      mode: 'financial_education',
      intent: 'understand_concept',
      requires_tools: false,
    },
  },

  // User test data
  user: {
    testUser: {
      id: 'user-test-001',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashed_password_placeholder',
    },
    anotherUser: {
      id: 'user-test-002',
      name: 'Another User',
      email: 'another@example.com',
      passwordHash: 'another_hashed_password',
    },
  },

  // Profile test data
  profile: {
    simpleProfile: {
      userId: 'user-test-001',
      income: 3000000,
      expenses: 1500000,
      age: 35,
      dependents: 2,
      savings: 5000000,
    },
    riskProfile: {
      userId: 'user-test-002',
      income: 8000000,
      expenses: 3000000,
      age: 45,
      dependents: 0,
      savings: 25000000,
      riskTolerance: 'high',
    },
  },

  // RAG test data
  rag: {
    queries: [
      'APV ahorro previsional',
      'fondos mutuos comisiones',
      'tasas de crédito Chile',
      'fintec regulación',
      'seguros bancarios',
    ],
    expectedTopics: [
      'Retirement savings',
      'Mutual funds',
      'Credit rates',
      'Fintech regulation',
      'Insurance',
    ],
  },

  // LLM test responses (for mocking)
  llm: {
    classification: {
      mode: 'financial_education',
      intent: 'understand_concept',
      confidence: 0.95,
      requires_tools: false,
    },
    toolChoice: {
      tool: 'market.fx_usd_clp',
      reasoning: 'User asked about exchange rates',
    },
    finalResponse: 'Based on the current data, here are my recommendations...',
  },
};

/**
 * Create a mock request context for testing
 */
export function createMockRequestContext(overrides = {}) {
  return {
    userId: 'test-user-001',
    correlationId: 'test-correlation-123',
    startTime: Date.now(),
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    },
    ...overrides,
  };
}

/**
 * Create test RAG results
 */
export function createMockRAGResult(query: string, count = 3) {
  return {
    found: count,
    citations: Array.from({ length: count }, (_, i) => ({
      doc_id: `doc_${i}`,
      doc_title: `Document ${i}`,
      chunk_id: `chunk_${i}`,
      supporting_span: `This is a supporting span for "${query}" from document ${i}`,
      supports: 'claim' as const,
      confidence: 0.75 + i * 0.05,
      url: undefined,
    })),
  };
}
