import { describe, expect, it } from 'vitest';
import {
  buildInterviewFinalizePromptLines,
  clampInterviewConfidence,
  resolveInterviewFinalizeDepth,
} from './interview-voice-finalize';

describe('interview voice finalize depth', () => {
  it('uses minimal coverage when the user ends very early without summaries', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'user',
      durationSec: 12,
      minuteSummariesCount: 0,
      hasFinalSummary: false,
    });

    expect(depth.tier).toBe('minimal');
    expect(depth.maxKeyFindings).toBe(2);
    expect(depth.defaultHasEnoughInformation).toBe(false);
  });

  it('uses substantial coverage for longer early endings with evidence', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'user',
      durationSec: 110,
      minuteSummariesCount: 2,
      hasFinalSummary: true,
    });

    expect(depth.tier).toBe('substantial');
    expect(depth.maxBlocks).toBe(6);
  });

  it('keeps complete coverage for timeout and agent closures', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'timeout',
      durationSec: 180,
      minuteSummariesCount: 3,
      hasFinalSummary: true,
    });

    expect(depth.tier).toBe('complete');
    expect(depth.maxKeyFindings).toBe(5);
  });

  it('builds prompt lines that mention early user termination', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'user',
      durationSec: 40,
      minuteSummariesCount: 1,
      hasFinalSummary: false,
    });
    const lines = buildInterviewFinalizePromptLines({
      depth,
      endedBy: 'user',
      durationSec: 40,
      diagnosticIntakeJson: '{"hasDebt":false}',
      condensedSummaries: '- minuto 1: avance inicial',
      finalSummaryText: '',
    });

    expect(lines.join('\n')).toContain('finalizó la llamada antes de tiempo');
    expect(lines.join('\n')).toContain('cobertura parcial');
  });

  it('clamps confidence to the configured ceiling', () => {
    expect(clampInterviewConfidence('high', 'low')).toBe('medium');
    expect(clampInterviewConfidence('medium', 'medium')).toBe('medium');
    expect(clampInterviewConfidence('high', 'high')).toBe('high');
  });
});
