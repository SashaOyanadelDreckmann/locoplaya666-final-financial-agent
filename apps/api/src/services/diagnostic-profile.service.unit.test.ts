import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./storage.service', () => ({
  loadProfile: vi.fn(),
}));

vi.mock('./user.service', () => ({
  attachProfileToUser: vi.fn(async () => true),
}));

import { loadProfile } from './storage.service';
import { attachProfileToUser } from './user.service';
import { resolveUserDiagnosticProfile } from './diagnostic-profile.service';

describe('resolveUserDiagnosticProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns injected profile without hitting storage', async () => {
    const injected = { diagnosticNarrative: 'Perfil inyectado' };
    const resolved = await resolveUserDiagnosticProfile({
      id: 'user-1',
      injectedProfile: injected,
      latestDiagnosticProfileId: 'profile-1',
    });

    expect(resolved).toEqual(injected);
    expect(loadProfile).not.toHaveBeenCalled();
    expect(attachProfileToUser).not.toHaveBeenCalled();
  });

  it('loads profile by id and backfills injected profile when missing', async () => {
    vi.mocked(loadProfile).mockResolvedValueOnce({
      diagnosticNarrative: 'Perfil almacenado',
    } as any);

    const resolved = await resolveUserDiagnosticProfile({
      id: 'user-2',
      latestDiagnosticProfileId: 'profile-2',
    });

    expect(loadProfile).toHaveBeenCalledWith('profile-2');
    expect(resolved?.diagnosticNarrative).toBe('Perfil almacenado');
    expect(attachProfileToUser).toHaveBeenCalledWith('user-2', {
      diagnosticNarrative: 'Perfil almacenado',
    });
  });
});
