/**
 * format.phase.test.ts
 *
 * Test suite for PHASE 5: Format Response
 * Tests response generation, tag parsing, and knowledge event detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runFormatPhase,
  detectAndRecordKnowledge,
  ensureDecisionDisclaimer,
  shouldApplyLatexFormatting,
} from './format.phase';
import * as testUtils from '../../../test/mocks';
import type { ExecutionResult } from '../agent-types';

// Mock dependencies
vi.mock('../../../services/llm.service', () => ({
  complete: vi.fn(),
  completeWithClaude: vi.fn(),
}));

vi.mock('../../../services/knowledge.service', () => ({
  recordKnowledgeEvent: vi.fn(),
  getMilestones: vi.fn(() => ({ unlocked: [] })),
  KNOWLEDGE_MILESTONES: [],
}));

vi.mock('../knowledge-detector', () => ({
  detectKnowledgeEvent: vi.fn(() => ({ detected: false })),
}));

import { complete, completeWithClaude } from '../../../services/llm.service';
import { recordKnowledgeEvent, getMilestones } from '../../../services/knowledge.service';

describe('runFormatPhase', () => {
  let mockExecutionResult: ExecutionResult;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENT_FAST_FORMAT;
    mockExecutionResult = testUtils.createMockExecutionResult();
  });

  it('should generate formatted response from LLM output', async () => {
    const mockResponse = testUtils.createMockFormatterResponse();
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test message',
      context_summary: {},
    });

    expect(result.formatted_response).toBeDefined();
    expect(result.formatted_response.message).toBeTruthy();
  });

  it('should extract suggested replies from SUGERENCIAS tag', async () => {
    const mockResponse = `Response text
<SUGERENCIAS>
["Reply 1", "Reply 2", "Reply 3"]
</SUGERENCIAS>`;
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.suggested_replies).toBeInstanceOf(Array);
  });

  it('should parse context score from response', async () => {
    const mockResponse = `Response text
<CONTEXT_SCORE>87</CONTEXT_SCORE>`;
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.context_score).toBe(87);
  });

  it('should extract panel action from response', async () => {
    const mockResponse = `Response text
<PANEL>
{"section": "budget", "message": "Update your budget"}
</PANEL>`;
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'budgeting',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.panel_action).toBeDefined();
  });

  it('should clean special tags from final message', async () => {
    const mockResponse = `Here is my response
<SUGERENCIAS>["Option 1"]</SUGERENCIAS>
<CONTEXT_SCORE>80</CONTEXT_SCORE>`;
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.message).not.toContain('<SUGERENCIAS>');
    expect(result.formatted_response.message).not.toContain('<CONTEXT_SCORE>');
  });

  it('should remove emoji characters from message', async () => {
    const mockResponse = '👍 Great! 🚀 This is a good strategy 📈';
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'information',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.message).not.toMatch(/[🚀👍📈]/);
  });

  it('should include artifacts from execution result', async () => {
    (completeWithClaude as any).mockResolvedValueOnce('Response text');

    const artifactExecutionResult = testUtils.createMockExecutionResult({
      artifacts: [testUtils.createMockArtifact()],
    });

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: artifactExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.artifacts.length).toBeGreaterThan(0);
  });

  it('should include citations from execution result', async () => {
    (completeWithClaude as any).mockResolvedValueOnce('Response text');

    const citationExecutionResult = testUtils.createMockExecutionResult({
      citations: [testUtils.createMockCitation()],
    });

    const result = await runFormatPhase({
      mode: 'regulation',
      execution_result: citationExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.citations.length).toBeGreaterThan(0);
  });

  it('should return empty budget updates by default', async () => {
    (completeWithClaude as any).mockResolvedValueOnce('Response text');

    const result = await runFormatPhase({
      mode: 'information',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.budget_updates).toEqual([]);
  });

  it('should handle malformed tag gracefully', async () => {
    const mockResponse = `Response
<SUGERENCIAS>
invalid json
</SUGERENCIAS>`;
    (completeWithClaude as any).mockResolvedValueOnce(mockResponse);

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.message).toBeDefined();
    // Should not crash, just skip parsing
  });

  it('should return safe fallback on LLM error', async () => {
    (completeWithClaude as any).mockRejectedValueOnce(new Error('LLM service error'));

    const result = await runFormatPhase({
      mode: 'decision_support',
      execution_result: mockExecutionResult,
      user_message: 'Test',
      context_summary: {},
    });

    expect(result.formatted_response.message).toContain('respuesta base');
    expect(result.formatted_response.suggested_replies).toEqual([]);
  });

  it('should not duplicate decision disclaimer when recent context already contains it', () => {
    const input = {
      mode: 'decision_support',
      user_message: '¿Me conviene APV?',
      context_summary: {
        recent_thread_context: 'Decision final: debe tomarla el usuario de forma 100% informada.',
      },
      ui_state: {
        active_chat: { id: 'chat-2' },
      },
    } as any;

    const result = ensureDecisionDisclaimer('Te conviene revisar liquidez antes de invertir.', input);
    expect(result).not.toMatch(/decision final/i);
  });

  it('should prefer fast format for low-complexity turns outside test mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    (complete as any).mockResolvedValueOnce('Respuesta ejecutiva breve');

    const result = await runFormatPhase({
      mode: 'information',
      execution_result: testUtils.createMockExecutionResult({
        tool_calls: [],
        citations: [],
      }),
      user_message: 'Dame un resumen',
      context_summary: {},
    });

    expect(complete).toHaveBeenCalled();
    expect(completeWithClaude).not.toHaveBeenCalled();
    expect(result.formatted_response.message).not.toContain('Fuentes:');
    process.env.NODE_ENV = previousNodeEnv;
  });
});

describe('detectAndRecordKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return knowledge_event_detected=false when no event detected', async () => {
    const result = await detectAndRecordKnowledge({
      user_id: 'test-user',
      user_message: 'Simple question',
      agent_response: 'Simple answer',
      tools_used: [],
      mode: 'information',
      previous_score: 0,
    });

    expect(result.knowledge_event_detected).toBe(false);
  });

  it('should record knowledge event when detected', async () => {
    (recordKnowledgeEvent as any).mockResolvedValueOnce({
      newScore: 50,
      points: 10,
    });

    // Mock knowledge detector to return detected=true
    vi.doMock('../knowledge-detector', () => ({
      detectKnowledgeEvent: vi.fn(() => ({
        detected: true,
        action: 'completed_simulation',
        confidence: 0.9,
      })),
    }));

    const result = await detectAndRecordKnowledge({
      user_id: 'test-user',
      user_message: 'I want to run a simulation',
      agent_response: 'Here are your simulation results',
      tools_used: ['montecarlo.simulate'],
      mode: 'simulation',
      previous_score: 40,
    });

    expect(result).toHaveProperty('knowledge_score');
  });

  it('should return previous score on error', async () => {
    (recordKnowledgeEvent as any).mockRejectedValueOnce(new Error('Database error'));

    const previousScore = 75;
    const result = await detectAndRecordKnowledge({
      user_id: 'test-user',
      user_message: 'Test',
      agent_response: 'Test response',
      tools_used: [],
      mode: 'information',
      previous_score: previousScore,
    });

    expect(result.knowledge_score).toBe(previousScore);
    expect(result.knowledge_event_detected).toBe(false);
  });

  it('should skip recording when no user_id provided', async () => {
    const result = await detectAndRecordKnowledge({
      user_message: 'Test',
      agent_response: 'Test response',
      tools_used: [],
      mode: 'information',
      previous_score: 0,
    });

    expect(recordKnowledgeEvent).not.toHaveBeenCalled();
    expect(result.knowledge_event_detected).toBe(false);
  });

  it('should track milestone unlocks', async () => {
    (recordKnowledgeEvent as any).mockResolvedValueOnce({
      newScore: 250,
      points: 100,
    });

    (getMilestones as any).mockReturnValueOnce({
      unlocked: ['advanced_simulation'],
    });

    const result = await detectAndRecordKnowledge({
      user_id: 'test-user',
      user_message: 'Advanced simulation',
      agent_response: 'Advanced results',
      tools_used: ['montecarlo.simulate'],
      mode: 'simulation',
      previous_score: 150,
    });

    expect(result).toHaveProperty('knowledge_score');
  });

  it('should not trigger latex formatting for APV prose with currency', () => {
    const text =
      'APV: con $100.000 mensuales y un retorno esperado de 8% anual, el foco es comparar beneficio fiscal y liquidez.';

    expect(shouldApplyLatexFormatting(text)).toBe(false);
  });
});
