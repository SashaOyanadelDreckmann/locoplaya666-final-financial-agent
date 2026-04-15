/**
 * classify.phase.test.ts
 *
 * Test suite for PHASE 1: Classification
 * Tests user intent detection and mode classification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runClassifyPhase } from './classify.phase';
import * as testUtils from '../../../test/mocks';

// Mock the LLM service
vi.mock('../../../services/llm.service', () => ({
  completeStructured: vi.fn(),
}));

import { completeStructured } from '../../../services/llm.service';

describe('runClassifyPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should classify decision_support mode correctly', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('decision_support');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Qué debo hacer con mis ahorros?',
    });

    expect(result.classification.mode).toBe('decision_support');
    expect(result.classification.confidence).toBeGreaterThan(0.8);
    expect(result.inferred_user_model).toBeDefined();
  });

  it('should classify information mode for general questions', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('information');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Cómo funcionan los fondos mutuos?',
    });

    expect(result.classification.mode).toBe('information');
    expect(result.inferred_user_model).toBeDefined();
  });

  it('should classify simulation mode for "what-if" questions', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('simulation');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Cuánto tendría si invierto $1000 mensuales durante 10 años?',
    });

    expect(result.classification.mode).toBe('simulation');
  });

  it('should classify budgeting mode for budget-related questions', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('budgeting');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Cómo debería distribuir mi presupuesto?',
    });

    expect(result.classification.mode).toBe('budgeting');
  });

  it('should set requires_tools=true for decision_support mode', async () => {
    const mockResponse = JSON.stringify({
      mode: 'decision_support',
      intent: 'user wants advice',
      requires_tools: true,
      requires_rag: false,
      confidence: 0.9,
    });
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Debo invertir ahora o esperar?',
    });

    expect(result.classification.requires_tools).toBe(true);
  });

  it('should set requires_rag=true for regulatory questions', async () => {
    const mockResponse = JSON.stringify({
      mode: 'regulation',
      intent: 'user asking about CMF requirements',
      requires_tools: false,
      requires_rag: true,
      confidence: 0.85,
    });
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: '¿Cuáles son los requisitos de CMF para invertir en fondos?',
    });

    expect(result.classification.requires_rag).toBe(true);
  });

  it('should include conversation history in classification', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('decision_support');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const history = [
      { role: 'user', content: 'Quiero invertir' },
      { role: 'assistant', content: 'Te ayudaré a encontrar la mejor estrategia' },
    ];

    const result = await runClassifyPhase({
      user_message: '¿Cuál es el riesgo?',
      history,
    });

    expect(result.classification).toBeDefined();
    expect(completeStructured).toHaveBeenCalled();
  });

  it('should return valid inferred_user_model', async () => {
    const mockResponse = testUtils.createMockClassifierResponse('decision_support');
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: 'Quiero una proyección detallada de mis inversiones',
    });

    expect(result.inferred_user_model.preferred_output).toMatch(/^(pdf|charts|mixed)$/);
    expect(result.inferred_user_model.detail_level).toMatch(/^(standard|high)$/);
    expect(result.inferred_user_model.risk_profile).toMatch(
      /^(conservative|balanced|aggressive)$/,
    );
  });

  it('should handle ambiguous messages gracefully', async () => {
    const mockResponse = JSON.stringify({
      mode: 'information',
      intent: 'user message is ambiguous, defaulting to information',
      requires_tools: false,
      requires_rag: false,
      confidence: 0.6,
    });
    (completeStructured as any).mockResolvedValueOnce(
      testUtils.mockCompleteStructured(mockResponse),
    );

    const result = await runClassifyPhase({
      user_message: 'mmm',
    });

    expect(result.classification.confidence).toBeLessThan(0.75);
  });

  it('should throw on invalid JSON response', async () => {
    (completeStructured as any).mockResolvedValueOnce({
      safeParse: () => ({
        success: false,
        error: new Error('Invalid JSON'),
      }),
    });

    await expect(
      runClassifyPhase({
        user_message: 'Test message',
      }),
    ).rejects.toThrow();
  });
});
