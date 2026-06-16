import { describe, expect, it } from 'vitest';
import {
  buildDeterministicVoiceFinalizeSnapshot,
  buildInterviewFinalizePromptLines,
  buildVoiceInterviewSyntheticBlocks,
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

  it('downgrades timeout coverage when evidence is thin', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'timeout',
      durationSec: 180,
      minuteSummariesCount: 0,
      hasFinalSummary: false,
    });

    expect(depth.tier).toBe('partial');
    expect(depth.defaultHasEnoughInformation).toBe(false);
  });

  it('keeps complete coverage for timeout and agent closures with strong evidence', () => {
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

  it('builds deterministic finalize snapshot from minute summaries', () => {
    const depth = resolveInterviewFinalizeDepth({
      endedBy: 'user',
      durationSec: 110,
      minuteSummariesCount: 2,
      hasFinalSummary: true,
    });
    const snapshot = buildDeterministicVoiceFinalizeSnapshot({
      minuteSummaries: [
        { minute: 1, summary: 'Avance inicial', keyFindings: ['Deuda activa'] },
        { minute: 2, summary: 'Cierre parcial', keyFindings: ['Estrés moderado'] },
      ],
      finalSummaryText: 'Síntesis final de prueba',
      finalizeDepth: depth,
      endedBy: 'user',
    });

    expect(snapshot.executiveReport).toContain('Síntesis final de prueba');
    expect(snapshot.keyFindings).toEqual(['Deuda activa', 'Estrés moderado']);
    expect(snapshot.hasEnoughInformation).toBe(true);
  });

  it('marks synthetic interview blocks as not user-validated', () => {
    const blocks = buildVoiceInterviewSyntheticBlocks({
      blockIds: ['income', 'expenses'],
      depth: resolveInterviewFinalizeDepth({
        endedBy: 'user',
        durationSec: 40,
        minuteSummariesCount: 1,
        hasFinalSummary: false,
      }),
      executiveReport: 'Informe',
      keyFindings: ['Hallazgo 1'],
      confidence: 'high',
    });

    expect(Object.values(blocks).every((block) => block.userValidated === false)).toBe(true);
    expect(Object.values(blocks).every((block) => block.confidence !== 'high')).toBe(true);
  });

  it('clamps confidence to the configured ceiling', () => {
    expect(clampInterviewConfidence('high', 'low')).toBe('medium');
    expect(clampInterviewConfidence('medium', 'medium')).toBe('medium');
    expect(clampInterviewConfidence('high', 'high')).toBe('high');
  });
});
