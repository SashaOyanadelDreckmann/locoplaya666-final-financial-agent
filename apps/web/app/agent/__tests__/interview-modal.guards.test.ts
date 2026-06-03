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
    expect(source).toContain('if (isGeneratingDiagnosis || isFinalizingCall) return;');
    expect(source).toContain("if (event.key !== 'Tab') return;");
    expect(source).toContain('restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;');
    expect(source).toContain('restoreFocusRef.current.focus();');
    expect(source).toContain("document.body.style.overflow = 'hidden';");
  });
});
