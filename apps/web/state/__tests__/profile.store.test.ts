/** @jest-environment node */

jest.mock('@/lib/api', () => ({
  getSessionInfo: jest.fn(),
  fetchLatestDiagnosis: jest.fn(),
}));

import { getSessionInfo, fetchLatestDiagnosis } from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { useProfileStore } from '../profile.store';

const mockedGetSessionInfo = getSessionInfo as jest.MockedFunction<typeof getSessionInfo>;
const mockedFetchLatestDiagnosis = fetchLatestDiagnosis as jest.MockedFunction<typeof fetchLatestDiagnosis>;

describe('profile.store diagnosis resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({
      profile: null,
      loading: false,
      error: null,
      hasDiagnosis: false,
    });
  });

  it('loads injected profile from session when available', async () => {
    mockedGetSessionInfo.mockResolvedValue({
      injectedProfile: {
        diagnosticNarrative: 'Perfil inyectado desde sesión',
      },
      latestDiagnosticProfileId: 'profile-1',
    });

    await useProfileStore.getState().loadProfileIfNeeded();

    expect(mockedFetchLatestDiagnosis).not.toHaveBeenCalled();
    expect(useProfileStore.getState().profile?.diagnosticNarrative).toBe('Perfil inyectado desde sesión');
    expect(useProfileStore.getState().hasDiagnosis).toBe(true);
  });

  it('falls back to /diagnosis/latest when session has profile id but no injected profile', async () => {
    mockedGetSessionInfo.mockResolvedValue({
      latestDiagnosticProfileId: 'profile-2',
      latestDiagnosticCompletedAt: '2026-06-07T12:00:00.000Z',
    });
    mockedFetchLatestDiagnosis.mockResolvedValue({
      diagnosticNarrative: 'Diagnóstico remoto persistido',
      tensions: ['Presión de liquidez'],
    });

    await useProfileStore.getState().refreshProfile();

    expect(mockedFetchLatestDiagnosis).toHaveBeenCalledTimes(1);
    expect(useProfileStore.getState().profile?.diagnosticNarrative).toBe('Diagnóstico remoto persistido');
    expect(useProfileStore.getState().hasDiagnosis).toBe(true);
  });

  it('surfaces a readable error when remote diagnosis is missing', async () => {
    mockedGetSessionInfo.mockResolvedValue({
      latestDiagnosticProfileId: 'profile-missing',
      latestDiagnosticCompletedAt: '2026-06-07T12:00:00.000Z',
    });
    mockedFetchLatestDiagnosis.mockRejectedValue(
      new ApiHttpError({ status: 404, message: 'No diagnosis found for this user' }),
    );

    await useProfileStore.getState().refreshProfile();

    expect(useProfileStore.getState().hasDiagnosis).toBe(false);
    expect(useProfileStore.getState().error).toContain('Aún no encontramos un diagnóstico guardado');
  });
});
