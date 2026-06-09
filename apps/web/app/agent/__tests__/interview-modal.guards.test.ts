/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('interview modal safeguards', () => {
  it('keeps keyboard accessibility and focus restoration in place', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const a11yPath = path.join(process.cwd(), 'app', 'agent', 'useInterviewModalA11y.ts');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const a11y = fs.readFileSync(a11yPath, 'utf8');

    expect(modal).toContain("role=\"dialog\"");
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('tabIndex={-1}');
    expect(modal).toContain('useInterviewModalA11y');
    expect(a11y).toContain("if (event.key === 'Escape')");
    expect(a11y).toContain('isGeneratingDiagnosis || isFinalizingCall');
    expect(a11y).toContain("if (event.key !== 'Tab') return;");
    expect(a11y).toContain(
      'restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;',
    );
    expect(a11y).toContain('restoreFocusRef.current.focus();');
    expect(a11y).toContain("document.body.style.overflow = 'hidden';");
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

  it('does not expose manual interview finalization in the modal shell', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const runtime = fs.readFileSync(runtimePath, 'utf8');

    expect(modal).not.toContain('Finalizar y generar informe');
    expect(modal).not.toContain('Generar informe con contexto disponible');
    expect(modal).not.toContain("finalizeCallAndGenerateReport('user')");
    expect(modal).not.toContain("finalizeCallAndGenerateReport('timeout')");
    expect(runtime).toContain("finalizeCallAndGenerateReport('timeout')");
    expect(runtime).toContain("finalizeCallAndGenerateReport('agent')");
    expect(runtime).not.toContain("finalizeCallAndGenerateReport('user')");
  });

  it('allows closing the modal anytime except while connecting or finalizing', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const runtime = fs.readFileSync(runtimePath, 'utf8');

    expect(runtime).toContain('voiceConnecting || isFinalizingCall || isGeneratingDiagnosis');
    expect(runtime).not.toMatch(/blockVoiceInteraction[\s\S]*voiceConnected && !voicePaused/);
    expect(modal).toContain('Cerrar y guardar progreso');
  });

  it('exposes diagnosis retry without reopening the call', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const runtime = fs.readFileSync(runtimePath, 'utf8');

    expect(modal).toContain('retryDiagnosisGeneration');
    expect(modal).toContain('Reintentar diagnóstico');
    expect(modal).toContain('canRetryDiagnosis');
    expect(runtime).toContain('retryDiagnosisGeneration');
    expect(runtime).toContain('pendingFinalizeRef');
  });

  it('enforces the hard interview quota and unlimited pause/resume', () => {
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const helpersPath = path.join(process.cwd(), 'app', 'agent', 'interview-modal.helpers.ts');
    const runtime = fs.readFileSync(runtimePath, 'utf8');
    const helpers = fs.readFileSync(helpersPath, 'utf8');

    expect(helpers).toContain('resolveInterviewActiveQuota');
    expect(runtime).toContain('syncActiveQuota');
    expect(runtime).not.toContain('if (pauseUsed) return');
    expect(runtime).toContain("finalizeCallAndGenerateReport('timeout'");
    expect(runtime).toContain('flushInterviewVoiceStateOnPageHide');
    expect(runtime).toContain("addEventListener('pagehide'");
  });

  it('labels paused live calls as Pausada in stage status', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(modal).toContain('voiceConnected && voicePaused');
    expect(modal).toContain("? 'Pausada'");
  });

  it('resets bootstrap state before paint when reopening the interview modal', () => {
    const bootstrapPath = path.join(process.cwd(), 'app', 'agent', 'useInterviewModalBootstrap.ts');
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(bootstrap).toContain('useLayoutEffect');
    expect(bootstrap).toContain('if (!isOpen) {');
    expect(bootstrap).toContain('setIntakeReady(false);');
    expect(modal).toContain('showBootstrapLoader');
    expect(modal).toContain('interview-modal--generating');
  });

  it('preserves diagnosis signals when reopening a completed interview session', () => {
    const bootstrapPath = path.join(process.cwd(), 'app', 'agent', 'useInterviewModalBootstrap.ts');
    const runtimePath = path.join(process.cwd(), 'app', 'agent', 'useInterviewVoiceRuntime.ts');
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    const runtime = fs.readFileSync(runtimePath, 'utf8');

    expect(bootstrap).toContain('preserveDiagnosisSignals: diagnosisOnly');
    expect(bootstrap).toContain('onDiagnosisOnlyOpen');
    expect(runtime).toContain('preserveDiagnosisSignals');
  });

  it('transforms the interview shell into diagnosis mode after completion', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const panelPath = path.join(process.cwd(), 'app', 'agent', 'InterviewDiagnosisPanel.tsx');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const panel = fs.readFileSync(panelPath, 'utf8');

    expect(modal).toContain('interview-modal--diagnosis');
    expect(modal).toContain('InterviewDiagnosisPanel');
    expect(modal).toContain("isDiagnosisMode ? 'Diagnóstico financiero' : 'Entrevista estratégica'");
    expect(panel).toContain('Ver informe completo');
  });

  it('uses the compact interview loader instead of the full-page ai loader', () => {
    const modalPath = path.join(process.cwd(), 'app', 'agent', 'InterviewModal.tsx');
    const componentsPath = path.join(process.cwd(), 'app', 'agent', 'interview-modal.components.tsx');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const components = fs.readFileSync(componentsPath, 'utf8');

    expect(modal).toContain('InterviewModalLoader');
    expect(modal).not.toContain('AiLoader');
    expect(components).toContain('interview-modal-loader');
    expect(components).toContain('InterviewModalBootError');
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
