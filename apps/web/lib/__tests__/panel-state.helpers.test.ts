/** @jest-environment node */

import {
  hasMeaningfulPanelState,
  normalizeBackupUserKey,
  panelStateBackupKeyForUser,
} from '../panel-state.helpers';

describe('panel-state helpers', () => {
  it('normalizes backup user keys safely', () => {
    expect(normalizeBackupUserKey('')).toBe('guest');
    expect(normalizeBackupUserKey('User@Mail.COM')).toBe('user@mail.com');
    expect(panelStateBackupKeyForUser('a@b.c')).toContain('agent.panel.backup.v1:a@b.c');
  });

  it('detects meaningful persisted panel state', () => {
    expect(hasMeaningfulPanelState(null)).toBe(false);
    expect(hasMeaningfulPanelState({ budgetRows: [{ id: 'x' }] })).toBe(true);
    expect(hasMeaningfulPanelState({ bankSimulation: { products: [{ id: 'p1' }] } })).toBe(true);
    expect(hasMeaningfulPanelState({ savedReports: [{ id: 'r1' }] })).toBe(true);
    expect(hasMeaningfulPanelState({})).toBe(false);
  });
});
