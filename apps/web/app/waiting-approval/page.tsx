'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function WaitingApprovalContent() {
  const searchParams = useSearchParams();
  const email = useMemo(() => String(searchParams?.get('email') ?? '').trim(), [searchParams]);
  const name = useMemo(() => String(searchParams?.get('name') ?? '').trim(), [searchParams]);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Solicitud recibida</div>
        <h1 className="auth-title">Tu cuenta está pendiente de aprobación</h1>
        <p className="auth-subtitle">
          {name ? `${name}, r` : 'R'}ecibimos tu registro{email ? ` (${email})` : ''}. Te avisaré por correo cuando la cuenta quede autorizada.
        </p>

        <div className="auth-footer">
          <span className="auth-footer-text">¿Ya te aprobaron?</span>
          <Link href="/login" className="auth-footer-link">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function WaitingApprovalPage() {
  return (
    <Suspense>
      <WaitingApprovalContent />
    </Suspense>
  );
}
