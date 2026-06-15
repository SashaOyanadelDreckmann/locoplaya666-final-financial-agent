import { useSyncExternalStore } from 'react';

import { shouldUseMobileShell } from '@/lib/interfaz/viewport-mode';

function subscribeViewportMode(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  window.addEventListener('orientationchange', onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
    window.removeEventListener('orientationchange', onStoreChange);
  };
}

function getMobileShellSnapshot() {
  return shouldUseMobileShell();
}

function getMobileShellServerSnapshot() {
  return false;
}

export function useInterviewModalLayout() {
  const isMobileShell = useSyncExternalStore(
    subscribeViewportMode,
    getMobileShellSnapshot,
    getMobileShellServerSnapshot,
  );

  return {
    isMobileShell,
    isDesktopLayout: !isMobileShell,
  };
}
