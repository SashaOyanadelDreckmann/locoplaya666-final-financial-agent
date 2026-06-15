'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import '../estilos/admin/admin-panel.css';

export default function AnalyticsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin?tab=activity');
  }, [router]);

  return <div className="admin-loading">Redirigiendo al centro de comando…</div>;
}
