'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function AgentPreviewRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/agent?preview=1');
  }, [router]);

  return (
    <main className="agent-layout">
      <div className="agent-preview-banner" role="status">
        Cargando chat principal en modo preview...
      </div>
    </main>
  );
}

export default function AgentPreviewPage() {
  return (
    <Suspense fallback={null}>
      <AgentPreviewRedirect />
    </Suspense>
  );
}
