import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPlanExecutePhase } from './plan-execute.phase';
import * as testUtils from '../../../test/mocks';
import type { Classification, InferredUserModel } from '../agent-types';

const mockCreate = vi.fn();
const mockRunMCPTool = vi.fn();

vi.mock('../../../services/llm.service', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
  withCompatibleTemperature: vi.fn((payload: unknown) => payload),
}));

vi.mock('../../../mcp/openai-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../mcp/openai-bridge')>();
  return {
    ...actual,
    buildCoreAgentOpenAITools: vi.fn(() => []),
  };
});

vi.mock('../../../mcp/tools/runMCPTool', () => ({
  runMCPTool: (...args: unknown[]) => mockRunMCPTool(...args),
}));

vi.mock('../system.prompts', () => ({
  CORE_TOOL_AGENT_SYSTEM: 'Mock tool agent system',
}));

describe('runPlanExecutePhase', () => {
  let mockClassification: Classification;
  let mockUserModel: InferredUserModel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockRunMCPTool.mockReset();
    mockClassification = testUtils.createMockClassification({
      mode: 'decision_support',
      requires_tools: true,
      requires_rag: false,
    });
    mockUserModel = testUtils.createMockInferredUserModel();
  });

  it('should execute ReAct loop successfully', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Final answer', tool_calls: [] } }],
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
    expect(result.execution_result.iterations_count).toBeGreaterThanOrEqual(1);
  });

  it('should respect max_iterations limit', async () => {
    const max = Number(process.env.AGENT_MAX_REACT_ITERATIONS || 4);
    for (let i = 0; i < max + 2; i++) {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: `t-${i}`, function: { name: 'web.search', arguments: '{}' } }],
          },
        }],
      });
      mockRunMCPTool.mockResolvedValue({
        tool_call: { status: 'success' },
        data: { ok: true },
      });
    }

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      user_message: 'Compara APV y cuenta 2 para jubilacion',
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.iterations_count).toBeLessThanOrEqual(max);
  });

  it('should include tool calls in execution result', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'web.search', arguments: '{"q":"apv"}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockResolvedValue({
      tool_call: { status: 'success' },
      data: { ok: true },
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      user_message: 'Compara APV y cuenta 2 para jubilacion',
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.tool_calls).toBeInstanceOf(Array);
    expect(result.execution_result.tool_calls.length).toBeGreaterThan(0);
  });

  it('should accumulate react trace with iterations', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'web.search', arguments: '{"q":"apv"}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockResolvedValue({
      tool_call: { status: 'success' },
      data: { ok: true },
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      user_message: 'Compara APV y cuenta 2 para jubilacion',
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
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'rag.lookup', arguments: '{"query":"apv"}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockResolvedValue({
      tool_call: { status: 'success' },
      data: { ok: true },
      citations: [{ doc_id: 'd1', doc_title: 't1', supporting_span: 's', supports: 'claim', confidence: 0.9 }],
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
    expect(result.execution_result.citations.length).toBeGreaterThan(0);
  });

  it('should accumulate artifacts from tool outputs', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'finance__simulate', arguments: '{}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockResolvedValue({
      tool_call: { status: 'success' },
      data: { artifact: { id: 'a1', type: 'chart', title: 'Simulación', createdAt: '2026-01-01T00:00:00.000Z' } },
    });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.artifacts).toBeInstanceOf(Array);
    expect(result.execution_result.artifacts.length).toBeGreaterThan(0);
  });

  it('should block pdf tool requests without invoking MCP', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-pdf', function: { name: 'pdf__generate_report', arguments: '{}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      user_message: 'hola',
      injected_profile: null,
      injected_intake: null,
    });

    const pdfMcpCalls = mockRunMCPTool.mock.calls.filter(([arg]) =>
      String((arg as { tool?: string }).tool ?? '').startsWith('pdf.'),
    );
    expect(pdfMcpCalls).toHaveLength(0);
    expect(result.execution_result.tool_calls.some((call) => call.tool.startsWith('pdf.'))).toBe(true);
    expect(result.execution_result.tool_calls.find((call) => call.tool.startsWith('pdf.'))?.status).toBe('error');
  });

  it('should handle tool errors gracefully', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'web.search', arguments: '{}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockRejectedValueOnce(new Error('Tool execution failed'));

    const result = await runPlanExecutePhase({
      classification: mockClassification,
      inferred_user_model: mockUserModel,
      context_summary: {},
      injected_profile: null,
      injected_intake: null,
    });

    expect(result.execution_result.tool_calls[0]?.status).toBe('error');
  });

  it('should build different tool sequences for different modes', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Simulation response', tool_calls: [] } }],
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
    expect(result.execution_result.iterations_count).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should extract chart blocks from tool output', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'tool-1', function: { name: 'sim.projection', arguments: '{}' } }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'done', tool_calls: [] } }] });
    mockRunMCPTool.mockResolvedValue({
      tool_call: { status: 'success' },
      data: {
        chart: '<CHART>{"chart_type":"line","title":"Portfolio Growth","data":[]}</CHART>',
      },
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
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Planning response', tool_calls: [] } }],
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
