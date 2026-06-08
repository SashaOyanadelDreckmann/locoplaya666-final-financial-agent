/** @jest-environment node */

import { resolvePanelDiagnosisProfile } from '../diagnosis-session';

describe('resolvePanelDiagnosisProfile', () => {
  it('prefers session profile when available', () => {
    const resolved = resolvePanelDiagnosisProfile(
      { diagnosticNarrative: 'Desde sesión' },
      { diagnosticNarrative: 'Desde store' },
    );
    expect(resolved?.diagnosticNarrative).toBe('Desde sesión');
  });

  it('falls back to store profile when session profile is empty', () => {
    const resolved = resolvePanelDiagnosisProfile(
      { profile: { financialClarity: 'medium' } },
      { diagnosticNarrative: 'Desde store' },
    );
    expect(resolved?.diagnosticNarrative).toBe('Desde store');
  });

  it('returns null when neither source has narrative', () => {
    expect(resolvePanelDiagnosisProfile(null, null)).toBeNull();
    expect(resolvePanelDiagnosisProfile({ profile: {} }, null)).toBeNull();
  });
});
