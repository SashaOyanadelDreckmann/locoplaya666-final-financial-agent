'use client';

import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Recuperar acceso</div>
        <h1 className="auth-title">¿Olvidaste tu contraseña?</h1>
        <p className="auth-subtitle">
          Estamos preparando el flujo de recuperacion. Mientras tanto, escribenos para ayudarte a recuperar tu cuenta.
        </p>

        <div className="auth-footer">
          <Link href="/login" className="auth-footer-link">
            Volver a iniciar sesion
          </Link>
        </div>
      </div>
    </main>
  );
}
