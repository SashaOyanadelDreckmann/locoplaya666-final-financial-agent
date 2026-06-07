/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('interview modal safeguards', () => {
  it('keeps keyboard accessibility and focus restoration in place', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("role=\"dialog\"");
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain('isGeneratingDiagnosis || isFinalizingCall');
    expect(source).toContain("if (event.key !== 'Tab') return;");
    expect(source).toContain('restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;');
    expect(source).toContain('restoreFocusRef.current.focus();');
    expect(source).toContain("document.body.style.overflow = 'hidden';");
  });

  it('keeps financialKnowledge extraction ahead of generic object filtering', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'interview-modal.context.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');

    const financialKnowledgeIndex = source.indexOf("if (key === 'financialKnowledge' && typeof value === 'object') {");
    const genericObjectFilterIndex = source.indexOf("if (typeof value === 'object' && !Array.isArray(value)) continue;");

    expect(financialKnowledgeIndex).toBeGreaterThanOrEqual(0);
    expect(genericObjectFilterIndex).toBeGreaterThanOrEqual(0);
    expect(financialKnowledgeIndex).toBeLessThan(genericObjectFilterIndex);
  });

  it('does not wire paid transcription into the interview modal', () => {
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const source = fs.readFileSync(runtimePath, 'utf8');

    expect(source).toContain("response.output_text.delta");
    expect(source).not.toContain('input_audio_transcription');
    expect(source).not.toContain('gpt-4o-transcribe');
    expect(source).not.toContain('gpt-realtime-whisper');
  });

  it('keeps structured context highlights for the sidebar', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'interview-modal.context.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('buildInterviewContextHighlights');
    expect(source).toContain(".split('\\n')");
    expect(source).not.toContain(".split('||')");
  });

  it('extracts voice runtime from the modal shell', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const runtime = fs.readFileSync(runtimePath, 'utf8');

    expect(modal).toContain('useInterviewVoiceRuntime');
    expect(modal).not.toContain('RTCPeerConnection');
    expect(runtime).toContain('RTCPeerConnection');
  });
});
