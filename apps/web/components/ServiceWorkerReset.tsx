'use client';

import { useEffect } from 'react';

export default function ServiceWorkerReset() {
  useEffect(() => {
    void (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator)) return;

      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {
        // no-op
      }

      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          const legacy = keys.filter((k) => /^finmente-/i.test(k));
          await Promise.all(legacy.map((k) => caches.delete(k)));
        }
      } catch {
        // no-op
      }
    })();
  }, []);

  return null;
}

