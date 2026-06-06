/** @jest-environment jsdom */

jest.mock('@/lib/api', () => ({
  loadPanelState: jest.fn(),
  savePanelState: jest.fn(),
}));

import { loadPanelState, savePanelState } from '@/lib/api';
import { clearAllPanelStateBackups } from '@/lib/panel-state.helpers';
import { buildPanelSnapshotPayload } from '../page.flow';
import { clearPanelStateBackups, hydratePanelState, persistPanelState } from '../panel-state.service';

const mockLoadPanelState = loadPanelState as jest.MockedFunction<typeof loadPanelState>;
const mockSavePanelState = savePanelState as jest.MockedFunction<typeof savePanelState>;

describe('panel-state service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllPanelStateBackups();
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  });

  it('persists to local backup and remote api', async () => {
    mockSavePanelState.mockResolvedValue({ ok: true });
    const snapshot = buildPanelSnapshotPayload({
      budgetRows: [],
      budgetChatAnswers: [],
      bankSimulation: {
        products: [],
        taxonomyOverrides: [],
        activeProductId: null,
        lockedMonth: null,
        connected: false,
        randomMode: false,
      },
      txProductsCreatedTotal: 1,
      savedReports: [],
    });

    const result = await persistPanelState({
      panelStateBackupKey: 'agent.panel.backup.v1:test',
      snapshot,
    });

    expect(result.ok).toBe(true);
    expect(mockSavePanelState).toHaveBeenCalledWith(snapshot);
  });

  it('hydrates from remote when available', async () => {
    mockLoadPanelState.mockResolvedValue({
      panelState: {
        budgetRows: [{ id: 'r1', category: 'Sueldo', type: 'income', amount: 100, note: 'ok' }],
        budgetChatAnswers: [{ q: 'q', a: 'a' }],
        savedReports: [{ id: 'rep', title: 'Informe', fileUrl: '/x.pdf', group: 'budget', createdAt: '2025-01-01T00:00:00.000Z' }],
        txProductsCreatedTotal: 3,
        bankSimulation: { products: [], taxonomyOverrides: [], activeProductId: null, lockedMonth: null, connected: false, randomMode: false },
      },
    });

    const result = await hydratePanelState({
      panelStateBackupKey: 'agent.panel.backup.v1:test',
      budgetRows: [],
      budgetChatAnswers: [],
      savedReports: [],
      txProductsCreatedTotal: 0,
      bankSimulation: {
        products: [],
        taxonomyOverrides: [],
        activeProductId: null,
        lockedMonth: null,
        connected: false,
        randomMode: false,
        uploadedFiles: [],
        parsedDocuments: [],
      },
    });

    expect(result?.source).toBe('remote');
    expect(result?.restored?.budgetRows).toHaveLength(1);
    expect(result?.restored?.savedReports).toHaveLength(1);
  });

  it('falls back to backup when remote is empty', async () => {
    mockLoadPanelState.mockResolvedValue({ panelState: null });
    localStorage.setItem(
      'agent.panel.backup.v1:test',
      JSON.stringify({
        budgetRows: [{ id: 'r1', category: 'Base', type: 'expense', amount: 42, note: '' }],
        savedReports: [],
        budgetChatAnswers: [],
        txProductsCreatedTotal: 0,
        bankSimulation: {
          products: [],
          taxonomyOverrides: [],
          activeProductId: null,
          lockedMonth: null,
          connected: false,
          randomMode: false,
        },
      })
    );

    const result = await hydratePanelState({
      panelStateBackupKey: 'agent.panel.backup.v1:test',
      budgetRows: [],
      budgetChatAnswers: [],
      savedReports: [],
      txProductsCreatedTotal: 0,
      bankSimulation: {
        products: [],
        taxonomyOverrides: [],
        activeProductId: null,
        lockedMonth: null,
        connected: false,
        randomMode: false,
        uploadedFiles: [],
        parsedDocuments: [],
      },
    });

    expect(result?.source).toBe('backup');
    expect(result?.restored?.budgetRows).toHaveLength(1);
  });

  it('clears all backups', () => {
    localStorage.setItem('agent.panel.backup.v1:test', 'x');
    clearPanelStateBackups();
    expect(localStorage.getItem('agent.panel.backup.v1:test')).toBeNull();
  });
});
