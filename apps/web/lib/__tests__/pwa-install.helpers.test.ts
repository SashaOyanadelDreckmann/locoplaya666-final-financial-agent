import {
  dismissPwaInstallNotice,
  isPwaInstallNoticeDismissed,
  shouldRenderPwaInstallNotice,
} from '../interfaz/pwa-install.helpers';

describe('pwa-install.helpers notice gating', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists dismiss per user', () => {
    dismissPwaInstallNotice('user-1');
    expect(isPwaInstallNoticeDismissed('user-1')).toBe(true);
    expect(isPwaInstallNoticeDismissed('user-2')).toBe(false);
  });

  it('renders for authenticated browser sessions on chat-1 (mobile and desktop)', () => {
    const base = {
      userId: 'user-1',
      authBootstrapped: true,
      isAuthenticated: true,
      isStandalone: false,
      activeChatId: 'chat-1',
      chatClosed: false,
      compactClosedView: false,
      loading: false,
      bootSequenceActive: false,
    };

    expect(shouldRenderPwaInstallNotice(base)).toBe(true);
    expect(shouldRenderPwaInstallNotice({ ...base, isStandalone: true })).toBe(false);
    expect(shouldRenderPwaInstallNotice({ ...base, activeChatId: 'chat-2' })).toBe(false);
    expect(shouldRenderPwaInstallNotice({ ...base, loading: true })).toBe(false);
    expect(shouldRenderPwaInstallNotice({ ...base, bootSequenceActive: true })).toBe(false);

    dismissPwaInstallNotice('user-1');
    expect(shouldRenderPwaInstallNotice(base)).toBe(false);
  });
});
