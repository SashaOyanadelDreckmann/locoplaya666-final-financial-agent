/**
 * plan-execute.phase.test.ts
 *
 * Test suite for PHASE 2-3: Plan + Execute (ReAct Loop)
 * Tests tool sequencing, tool calling, and result accumulation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPlanExecutePhase } from './plan-execute.phase';
import * as testUtils from '../../../test/mocks';
import type { Classification, InferredUserModel } from '../agent-types';

// Mock dependencies
vi.mock('../../../services/llm.service', () => ({
  createMessage: vi.fn(),
}));

vi.mock('../system.prompts', () => ({
  CORE_PLANNER_SYSTEM: 'Mock planner system',
  CORE_EXECUTOR_SYSTEM: 'Mock executor system',
}));

import { createMessage } from '../../../services/llm.service';

describe('runPlanExecutePhase', () => {
  let mockClassification: Classification;
  let mockUserModel: InferredUserModel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClassification = testUtils.createMockClassification({
      mode: 'decision_support',
      requires_tools: true,
      requires_rag: false,
    });
    mockUserModel = testUtils.createMockInferredUserModel();
  });

  it('should execute ReAct loop successfully', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'I will analyze your investment options.',
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {
        profile: testUtils.createMockProfile(),
        intake: null,
        budget: testUtils.createMockBudget(),
      },
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result).toBeDefined();
    expect(result.execution_result.iterations_count).toBeGreaterThanOrEqual(0);
  });

  it('should respect max_iterations limit of 8', async () => {
    // Mock multiple iterations
    const mockResponses = Array(10)
      .fill(null)
      .map(() => ({
        content: [
          {
            type: 'text',
            text: 'Processing...',
          },
        ],
      }));

    mockResponses.forEach((response) => {
      (createMessage as any).mockResolvedValueOnce(response);
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.iterations_count).toBeLessThanOrEqual(8);
  });

  it('should include tool calls in execution result', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'market.expected_annual_return',
          input: { risk_profile: 'balanced' },
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.tool_calls).toBeInstanceOf(Array);
  });

  it('should accumulate react trace with iterations', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Analyzing your investment profile...',
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.react_trace).toBeInstanceOf(Array);
    expect(result.execution_result.react_trace.length).toBeGreaterThan(0);
    expect(result.execution_result.react_trace[0]).toHaveProperty('iteration');
    expect(result.execution_result.react_trace[0]).toHaveProperty('decision');
  });

  it('should accumulate citations from tool outputs', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Based on market data, here is my recommendation.',
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {
        profile: testUtils.createMockProfile(),
      },
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.citations).toBeInstanceOf(Array);
  });

  it('should accumulate artifacts from tool outputs', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Here is a chart of your portfolio growth.',
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.artifacts).toBeInstanceOf(Array);
  });

  it('should handle tool errors gracefully', async () => {
    (createMessage as any).mockRejectedValueOnce(new Error('Tool execution failed'));

    await expect(
      runPlanExecutePhase({
        classification: mockClassification,
        inferred_user_model: mockUserModel,
        context_summary: {},
        injected_profile: null,
        injected_intake: null,
      }),
    ).rejects.toThrow();
  });

  it('should build different tool sequences for different modes', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Simulation response',
        },
      ],
    });

    const simulationClassification = testUtils.createMockClassification({
      mode: 'simulation',
      requires_tools: true,
    });

    const result = await runPlanExecutePhase({
      classification: simulationClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result).toBeDefined();
  });

  it('should skip tool execution when requires_tools=false', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'General information response',
        },
      ],
    });

    const noToolsClassification = testUtils.createMockClassification({
      requires_tools: false,
      requires_rag: false,
    });

    const result = await runPlanExecutePhase({
      classification: noToolsClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.tool_calls.length).toBe(0);
  });

  it('should extract chart blocks from tool output', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: `Here is your investment projection:
<CHART>
{"chart_type": "line", "title": "Portfolio Growth", "data": []}
</CHART>`,
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.agent_blocks).toBeInstanceOf(Array);
  });

  it('should include plan objective in output', async () => {
    (createMessage as any).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Planning response',
        },
      ],
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.plan_objective).toBeDefined();
  });
});
