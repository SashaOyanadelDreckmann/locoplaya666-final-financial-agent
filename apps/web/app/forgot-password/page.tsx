'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ZodError } from 'zod';
import { forgotPassword } from '@/lib/api/cliente';
import { toUserFacingError } from '@/lib/compartido/userError';
import { ForgotPasswordSchema } from '@/lib/compartido/validation';

function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    try {
      ForgotPasswordSchema.parse({ email: email.trim() });
    } catch (e) {
      if (e instanceof ZodError) {
        setError(e.errors[0]?.message ?? 'Ingresa un correo válido.');
      }
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email: email.trim() });
      setSubmitted(true);
    } catch (e) {
      setError(toUserFacingError(e, 'auth.forgotPassword'));
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
            className="h-full w-full object-contain"
          />
        </div>

        {submitted ? (
          <>
            <h1 className="auth-title">Revisa tu correo</h1>
            <p className="auth-subtitle">
              Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace para
              restablecer tu contraseña en los próximos minutos.
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
                <label className="auth-label" htmlFor="forgot-email">
                  Correo electrónico
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  className={`auth-input ${error ? 'error' : ''}`}
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                  autoComplete="email"
                  autoFocus
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'forgot-email-error' : undefined}
                />
                {error && (
                  <p id="forgot-email-error" className="auth-error-text">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <button className="auth-submit" onClick={onSubmit} disabled={loading}>
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

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  );
}
