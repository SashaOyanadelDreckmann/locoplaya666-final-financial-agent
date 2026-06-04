'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const onSubmit = async () => {
    if (!isValidEmail(email)) {
      setError('Ingresa un correo válido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/backend/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        throw new Error('Error del servidor');
      }
      setSubmitted(true);
    } catch {
      setError('No pudimos procesar tu solicitud. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo-mark" aria-label="Financieramente">
          <Image
            src="/logo-fm.svg"
            alt="Financieramente"
            width={112}
            height={112}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="auth-eyebrow">Financieramente</div>

        {submitted ? (
          <>
            <h1 className="auth-title">Revisa tu correo</h1>
            <p className="auth-subtitle">
              Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
            </p>
            <p className="auth-fine-print" style={{ marginTop: 12 }}>
              ¿No llegó nada? Revisa la carpeta de spam o escríbenos directamente.
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">¿Olvidaste tu contraseña?</h1>
            <p className="auth-subtitle">
              Ingresa tu correo y te enviaremos un enlace para recuperar el acceso.
            </p>

            <div className="auth-fields">
              <div className="auth-field">
                <label className="auth-label" htmlFor="forgot-email">Correo electrónico</label>
                <input
                  id="forgot-email"
                  name="email"
                  className={`auth-input${error ? ' error' : ''}`}
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                  autoComplete="email"
                  autoFocus
                />
                {error && <p className="auth-error-text">{error}</p>}
              </div>
            </div>

            <button
              className="auth-submit"
              onClick={onSubmit}
              disabled={loading}
            >
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </>
        )}

        <div className="auth-footer">
          <Link href="/login" className="auth-footer-link">
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
