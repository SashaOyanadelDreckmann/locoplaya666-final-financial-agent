/**
 * validate.phase.test.ts
 *
 * Test suite for PHASE 4: Coherence Validation
 * Tests coherence checking against user profile and budget constraints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runValidatePhase } from './validate.phase';
import * as testUtils from '../../../test/mocks';
import type { FormattedResponse } from '../agent-types';

// Mock the coherence validator
vi.mock('../coherence-validator', () => ({
  validateAgentDecision: vi.fn((message, context) => ({
    isCoherent: true,
    score: 0.92,
    warnings: [],
    suggestions: [],
  })),
}));

import { validateAgentDecision } from '../coherence-validator';

describe('runValidatePhase', () => {
  let mockFormattedResponse: FormattedResponse;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormattedResponse = testUtils.createMockFormattedResponse();
  });

  it('should skip validation for information mode', async () => {
    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'information',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
    expect(result.coherence_check.score).toBe(1.0);
    expect(validateAgentDecision).not.toHaveBeenCalled();
  });

  it('should validate decision_support mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.85,
      warnings: [],
      suggestions: [],
    });

    const profile = testUtils.createMockProfile();

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'decision_support',
      injected_profile: profile,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
    expect(validateAgentDecision).toHaveBeenCalled();
  });

  it('should validate simulation mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.9,
      warnings: [],
      suggestions: [],
    });

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'simulation',
      injected_profile: testUtils.createMockProfile(),
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
  });

  it('should validate budgeting mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.88,
      warnings: [],
      suggestions: [],
    });

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'budgeting',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
  });

  it('should mark response as incoherent when score is low', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: false,
      score: 0.35,
      warnings: [
        'Recommendation exceeds user risk tolerance',
        'Budget allocation inconsistent with income',
      ],
      suggestions: ['Adjust allocation to conservative portfolio'],
    });

    const response = testUtils.createMockFormattedResponse({
      budget_updates: [
        {
          label: 'Stock allocation',
          type: 'investment',
          amount: 50000,
          category: 'aggressive',
        },
      ],
    });

    const result = await runValidatePhase({
      formatted_response: response,
      mode: 'decision_support',
      injected_profile: testUtils.createMockProfile({
        risk_profile: 'conservative',
      }),
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(false);
    expect(result.coherence_check.score).toBeLessThan(0.5);
  });

  it('should prepend warning message when incoherent', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: false,
      score: 0.45,
      warnings: ['High risk recommendation for conservative investor'],
      suggestions: [],
    });

    const response = testUtils.createMockFormattedResponse({
      message: 'I recommend investing 100% in stocks.',
    });

    const result = await runValidatePhase({
      formatted_response: response,
      mode: 'decision_support',
      injected_profile: testUtils.createMockProfile({
        risk_profile: 'conservative',
      }),
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.message_modified).toBe(true);
    expect(result.coherence_check.message_updated).toContain('⚠️');
    expect(result.coherence_check.message_updated).toContain('coherencia');
  });

  it('should clear budget_updates when incoherent', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: false,
      score: 0.3,
      warnings: ['Invalid budget allocation'],
      suggestions: [],
    });

    const response = testUtils.createMockFormattedResponse({
      budget_updates: [
        {
          label: 'Test update',
          type: 'budget',
          amount: 1000,
          category: 'test',
        },
      ],
    });

    await runValidatePhase({
      formatted_response: response,
      mode: 'budgeting',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(response.budget_updates).toEqual([]);
  });

  it('should validate against user history', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.9,
      warnings: [],
      suggestions: [],
    });

    const history = [
      { role: 'user', content: 'I want to invest conservatively' },
      { role: 'assistant', content: 'I will suggest conservative options' },
    ];

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'decision_support',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
      history,
    });

    expect(result.coherence_check).toBeDefined();
    expect(validateAgentDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        history,
      }),
    );
  });

  it('should validate with profile, intake, and budget context', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.92,
      warnings: [],
      suggestions: [],
    });

    const profile = testUtils.createMockProfile();
    const budget = testUtils.createMockBudget();

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'decision_support',
      injected_profile: profile,
      injected_intake: null,
      injected_budget: budget,
    });

    expect(result.coherence_check.isCoherent).toBe(true);
    expect(validateAgentDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profile,
        budget,
      }),
    );
  });

  it('should validate comparison mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.88,
      warnings: [],
      suggestions: [],
    });

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'comparison',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check).toBeDefined();
  });

  it('should validate planification mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.85,
      warnings: [],
      suggestions: [],
    });

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'planification',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check).toBeDefined();
  });

  it('should skip validation if response has no budget_updates and mode not in required list', async () => {
    const result = await runValidatePhase({
      formatted_response: testUtils.createMockFormattedResponse({
        budget_updates: [],
      }),
      mode: 'education',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
    expect(validateAgentDecision).not.toHaveBeenCalled();
  });

  it('should validate if response has budget_updates regardless of mode', async () => {
    (validateAgentDecision as any).mockReturnValueOnce({
      isCoherent: true,
      score: 0.9,
      warnings: [],
      suggestions: [],
    });

    const result = await runValidatePhase({
      formatted_response: testUtils.createMockFormattedResponse({
        budget_updates: [
          {
            label: 'Test',
            type: 'budget',
            amount: 1000,
            category: 'savings',
          },
        ],
      }),
      mode: 'information',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(validateAgentDecision).toHaveBeenCalled();
  });

  it('should return passing validation on error', async () => {
    (validateAgentDecision as any).mockImplementationOnce(() => {
      throw new Error('Validation service error');
    });

    const result = await runValidatePhase({
      formatted_response: mockFormattedResponse,
      mode: 'decision_support',
      injected_profile: null,
      injected_intake: null,
      injected_budget: testUtils.createMockBudget(),
    });

    expect(result.coherence_check.isCoherent).toBe(true);
    expect(result.coherence_check.score).toBe(0.8);
    expect(result.coherence_check.warnings).toContain('Validation check skipped due to error');
  });
});
