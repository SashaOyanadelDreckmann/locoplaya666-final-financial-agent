import { getSessionInfo } from '@/lib/api/cliente';
import { useEffect, useState } from 'react';

export type AdminSessionInfo = {
  id?: string;
  role?: string;
  name?: string;
  email?: string;
};

export function useAdminSession() {
  const [sessionInfo, setSessionInfo] = useState<AdminSessionInfo | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await getSessionInfo();
        if (!mounted) return;
        const role = String((info as AdminSessionInfo)?.role ?? '').toUpperCase();
        setSessionInfo({
          id: String((info as AdminSessionInfo)?.id ?? (info as { userId?: string })?.userId ?? '').trim() || undefined,
          role: (info as AdminSessionInfo)?.role,
          name: (info as AdminSessionInfo)?.name,
          email: (info as AdminSessionInfo)?.email,
        });
        setIsAllowed(role === 'ADMIN');
      } catch {
        if (!mounted) return;
        setIsAllowed(false);
      } finally {
        if (mounted) setIsSessionLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { sessionInfo, isSessionLoading, isAllowed };
}
