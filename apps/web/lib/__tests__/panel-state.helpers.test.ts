/** @jest-environment node */

import {
  hasMeaningfulPanelState,
  normalizeBackupUserKey,
  panelStateBackupKeyForUser,
  sanitizePanelSnapshotForSave,
} from '../compartido/panel-state.helpers';

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

  it('fills legacy panel snapshot defaults before API save', () => {
    const sanitized = sanitizePanelSnapshotForSave({
      budgetRows: [{ category: 'Sueldo', type: 'income', amount: 1000 }],
      bankSimulation: {
        products: [{ label: 'Cuenta', bank: 'Banco Estado' }],
      },
      savedReports: [
        {
          title: 'Informe',
          fileUrl: '/generated/x.pdf',
        },
      ],
    });

    expect(sanitized.budgetRows).toEqual([
      expect.objectContaining({ note: '', category: 'Sueldo', amount: 1000 }),
    ]);
    expect(sanitized.bankSimulation).toEqual(
      expect.objectContaining({
        products: [expect.objectContaining({ productType: 'checking_account' })],
      }),
    );
    expect(sanitized.savedReports).toEqual([
      expect.objectContaining({ group: 'other', title: 'Informe' }),
    ]);
  });
});
