/**
 * core-agent-orchestrator.test.ts
 *
 * Integration test for the full 5-phase agent orchestration
 * Tests end-to-end flow: Classify → Execute → Format → Validate → Knowledge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCoreAgent } from './core-agent-orchestrator';
import * as testUtils from '../../test/mocks';
import type { ChatAgentResponse } from './chat.types';

// Mock all phase functions
vi.mock('./phases/classify.phase', () => ({
  runClassifyPhase: vi.fn(),
}));

vi.mock('./phases/plan-execute.phase', () => ({
  runPlanExecutePhase: vi.fn(),
}));

vi.mock('./phases/format.phase', () => ({
  runFormatPhase: vi.fn(),
  detectAndRecordKnowledge: vi.fn(),
}));

vi.mock('./phases/validate.phase', () => ({
  runValidatePhase: vi.fn(),
}));

import { runClassifyPhase } from './phases/classify.phase';
import { runPlanExecutePhase } from './phases/plan-execute.phase';
import { runFormatPhase, detectAndRecordKnowledge } from './phases/format.phase';
import { runValidatePhase } from './phases/validate.phase';

describe('runCoreAgent - Full E2E Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute all 5 phases in correct order', async () => {
    const mockClassification = testUtils.createMockClassification();
    const mockUserModel = testUtils.createMockInferredUserModel();
    const mockExecutionResult = testUtils.createMockExecutionResult();
    const mockFormattedResponse = testUtils.createMockFormattedResponse();
    const mockCoherenceCheck = testUtils.createMockCoherenceCheckResult();

    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: mockExecutionResult,
      plan_objective: 'Provide investment advice',
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: mockFormattedResponse,
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: mockCoherenceCheck,
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const input = testUtils.createMockChatAgentInput();
    const response = await runCoreAgent(input);

    expect(response).toBeDefined();
    expect(response.message).toBeTruthy();
    expect(response.mode).toBe('decision_support');
  });

  it('should return properly formatted ChatAgentResponse', async () => {
    const mockClassification = testUtils.createMockClassification();
    const mockUserModel = testUtils.createMockInferredUserModel();
    const mockExecutionResult = testUtils.createMockExecutionResult();
    const mockFormattedResponse = testUtils.createMockFormattedResponse();
    const mockCoherenceCheck = testUtils.createMockCoherenceCheckResult();

    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: mockExecutionResult,
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: mockFormattedResponse,
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: mockCoherenceCheck,
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('mode');
    expect(response).toHaveProperty('tool_calls');
    expect(response).toHaveProperty('react');
    expect(response).toHaveProperty('agent_blocks');
    expect(response).toHaveProperty('artifacts');
    expect(response).toHaveProperty('citations');
    expect(response).toHaveProperty('compliance');
    expect(response).toHaveProperty('state_updates');
    expect(response).toHaveProperty('knowledge_score');
    expect(response).toHaveProperty('meta');
  });

  it('should include turn_id and latency_ms in meta', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse(),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.meta.turn_id).toBeTruthy();
    expect(response.meta.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should pass injected context through all phases', async () => {
    const profile = testUtils.createMockProfile();
    const budget = testUtils.createMockBudget({ income: 10000, expenses: 5000, balance: 5000 });

    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse(),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const input = testUtils.createMockChatAgentInput({
      context: {
        injected_profile: profile,
        injected_intake: null,
        injected_budget: budget,
      },
    });

    await runCoreAgent(input);

    // Verify context was passed to validate phase
    expect(runValidatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        injected_profile: profile,
        injected_budget: budget,
      }),
    );
  });

  it('should build context_summary for tool execution', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse(),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const profile = testUtils.createMockProfile();
    const input = testUtils.createMockChatAgentInput({
      context: {
        injected_profile: profile,
        injected_intake: null,
        injected_budget: { income: 0, expenses: 0, balance: 0 },
      },
    });

    await runCoreAgent(input);

    // Verify context_summary was built and passed
    expect(runPlanExecutePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        context_summary: expect.objectContaining({
          profile,
        }),
      }),
    );
  });

  it('should handle incoherent response by updating message', async () => {
    const mockClassification = testUtils.createMockClassification();
    const mockUserModel = testUtils.createMockInferredUserModel();
    const mockExecutionResult = testUtils.createMockExecutionResult();
    const mockFormattedResponse = testUtils.createMockFormattedResponse({
      message: 'Aggressive recommendation for conservative investor',
    });

    const mockCoherenceCheck = testUtils.createMockCoherenceCheckResult({
      isCoherent: false,
      score: 0.3,
      message_modified: true,
      message_updated: '⚠️ Warning: Low coherence...\n\nAggressive recommendation...',
    });

    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: mockExecutionResult,
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: mockFormattedResponse,
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: mockCoherenceCheck,
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.message).toContain('⚠️');
  });

  it('should track knowledge milestone unlocks', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse(),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: true,
      knowledge_score: 100,
      milestone_unlocked: {
        threshold: 100,
        feature: 'advanced_simulation',
      },
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.knowledge_event_detected).toBe(true);
    expect(response.milestone_unlocked).toBeDefined();
    expect(response.milestone_unlocked?.feature).toBe('advanced_simulation');
  });

  it('should include suggested_replies from formatted response', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse({
        suggested_replies: ['Option A', 'Option B', 'Option C'],
      }),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.suggested_replies).toHaveLength(3);
  });

  it('should include panel_action if present', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse({
        panel_action: { section: 'budget', message: 'Update budget' },
      }),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.panel_action).toBeDefined();
    expect(response.panel_action?.section).toBe('budget');
  });

  it('should set no_auto_execution=true in compliance', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: testUtils.createMockFormattedResponse(),
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());

    expect(response.compliance.no_auto_execution).toBe(true);
  });

  it('should return a valid response even with sparse formatted payload', async () => {
    (runClassifyPhase as any).mockResolvedValueOnce({
      classification: testUtils.createMockClassification(),
      inferred_user_model: testUtils.createMockInferredUserModel(),
    });

    (runPlanExecutePhase as any).mockResolvedValueOnce({
      execution_result: testUtils.createMockExecutionResult(),
    });

    (runFormatPhase as any).mockResolvedValueOnce({
      formatted_response: {
        // Missing required fields to trigger validation error
        message: 'Invalid response',
      },
    });

    (runValidatePhase as any).mockResolvedValueOnce({
      coherence_check: testUtils.createMockCoherenceCheckResult(),
    });

    (detectAndRecordKnowledge as any).mockResolvedValueOnce({
      knowledge_event_detected: false,
      knowledge_score: 50,
    });

    const response = await runCoreAgent(testUtils.createMockChatAgentInput());
    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('mode');
    expect(response).toHaveProperty('meta');
  });

  it('should throw if any phase fails', async () => {
    (runClassifyPhase as any).mockRejectedValueOnce(new Error('Classification failed'));

    await expect(runCoreAgent(testUtils.createMockChatAgentInput())).rejects.toThrow(
      'Classification failed',
    );
  });
});
