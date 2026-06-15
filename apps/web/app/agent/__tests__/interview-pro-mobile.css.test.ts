/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('interview pro mobile css safeguards', () => {
  const mobileCssPath = path.join(
    process.cwd(),
    'app',
    'estilos',
    'modales',
    'entrevista',
    'agent-modals-interview-mobile.css',
  );
  const authCssPath = path.join(
    process.cwd(),
    'app',
    'estilos',
    'modales',
    'entrevista',
    'agent-modals-interview-mobile-authoritative.css',
  );
  const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');
  const authCss = fs.readFileSync(authCssPath, 'utf8');

  it('locks interview modal page scroll on mobile shell', () => {
    expect(mobileCss).toContain('INTERVIEW MODAL — MOBILE SHELL CONTRACT');
    expect(mobileCss).toContain('.agent-modal-overlay.interview-modal-overlay');
    expect(mobileCss).toContain('overflow: hidden !important');
    expect(mobileCss).toContain('.interview-modal.is-mobile-shell');
    expect(mobileCss).toContain('flex-direction: column !important');
  });

  it('puts workspace first and keeps call controls reachable', () => {
    expect(mobileCss).toContain('.interview-panel-surface--workspace');
    expect(mobileCss).toContain('order: 1 !important');
    expect(mobileCss).toContain('.interview-panel-surface--sidebar');
    expect(mobileCss).toContain('order: 2 !important');
    expect(mobileCss).toContain('.interview-call-controls.is-live');
    expect(mobileCss).toContain('position: sticky !important');
    expect(mobileCss).toContain('min-height: 44px !important');
  });

  it('hides agent panel while interview modal is open on mobile', () => {
    expect(mobileCss).toContain('html.interview-modal-open');
    expect(mobileCss).toContain('visibility: hidden !important');
    expect(mobileCss).toContain('max-height: 0 !important');
  });

  it('authoritative EOF removes phantom 144px gutter and 520px column cap', () => {
    expect(authCss).toContain('INTERVIEW MOBILE — AUTHORITATIVE EOF CASCADE');
    expect(authCss).toContain('padding-bottom: env(safe-area-inset-bottom, 0px) !important');
    expect(authCss).not.toContain('144px');
    expect(authCss).toContain('width: 100% !important');
    expect(authCss).toContain('.agent-modal.interview-modal.is-mobile-shell .interview-stage-shell');
  });

  it('aligns interview mobile header with shared modal header contract', () => {
    const contractCss = fs.readFileSync(
      path.join(process.cwd(), 'app', 'estilos', 'modales', 'entrevista', 'agent-modals-interview-contract.css'),
      'utf8',
    );
    const minimalCss = fs.readFileSync(
      path.join(process.cwd(), 'app', 'estilos', 'modales', 'entrevista', 'agent-modals-interview-minimal.css'),
      'utf8',
    );

    expect(contractCss).toContain('position: relative !important');
    expect(contractCss).not.toContain('position: sticky !important');
    expect(contractCss).toContain('var(--modal-header-top-inset');
    expect(minimalCss).toContain('min-height: 0 !important');
    expect(minimalCss).not.toContain('min-height: 72px');
    expect(minimalCss).not.toContain('env(safe-area-inset-top, 0px))');
  });

  it('wires interview mobile css after contract in layout and agent bundles', () => {
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
    const agentCss = fs.readFileSync(path.join(process.cwd(), 'app', 'estilos', 'agente', 'agent.css'), 'utf8');

    expect(layoutSource).toContain("import './estilos/modales/entrevista/agent-modals-interview-contract.css';");
    expect(layoutSource).toContain(
      "import './estilos/modales/entrevista/agent-modals-interview-mobile-authoritative.css';",
    );
    expect(layoutSource).toContain("import './estilos/modales/entrevista/agent-modals-interview-minimal.css';");
    expect(agentCss).toContain("@import '../modales/entrevista/agent-modals-interview-mobile.css';");

    const layoutImports = [...layoutSource.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    const contractIdx = layoutImports.indexOf('estilos/modales/entrevista/agent-modals-interview-contract.css');
    const authIdx = layoutImports.indexOf(
      'estilos/modales/entrevista/agent-modals-interview-mobile-authoritative.css',
    );
    const minimalIdx = layoutImports.indexOf('estilos/modales/entrevista/agent-modals-interview-minimal.css');
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeGreaterThan(contractIdx);
    expect(minimalIdx).toBeGreaterThan(authIdx);
  });

  it('InterviewModal exposes mobile shell markers for CSS contract', () => {
    const modalSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'entrevista', 'InterviewModal.tsx'),
      'utf8',
    );
    const minimalCss = fs.readFileSync(
      path.join(process.cwd(), 'app', 'estilos', 'modales', 'entrevista', 'agent-modals-interview-minimal.css'),
      'utf8',
    );
    expect(modalSource).toContain('useInterviewModalLayout');
    expect(modalSource).toContain('is-mobile-shell');
    expect(modalSource).toContain('data-interview-mobile');
    expect(modalSource).toContain('interview-modal-open');
    expect(modalSource).toContain('interview-modal--minimal');
    expect(modalSource).toContain('resolveInterviewWorkspaceStatus');
    expect(modalSource).toContain('InterviewInsightRail');
    expect(modalSource).toContain('interview-live-zones');
    expect(modalSource).toContain('interview-live-zone--center');
    expect(minimalCss).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(minimalCss).toContain('grid-template-rows: auto minmax(200px, 1fr) auto');
    expect(minimalCss).toContain('background-image: none');
    expect(minimalCss).toContain('var(--modal-header-top-inset');
    expect(minimalCss).toContain('var(--modal-mobile-sheet-radius');
    expect(minimalCss).toContain('font-size: clamp(15px, 4.4vw, 17px)');
    expect(minimalCss).toContain('.interview-modal.is-mobile-shell.interview-modal--minimal .interview-header-title-band--live');
    expect(minimalCss).toContain('flex-direction: column !important');
  });
});
