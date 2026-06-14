'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { resetPassword } from '@/lib/api/cliente';
import { toUserFacingError } from '@/lib/compartido/userError';
import { ResetPasswordSchema } from '@/lib/compartido/validation';
import { zodFieldErrors } from '@/lib/compartido/form-errors';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams?.get('token') ?? '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError('Enlace inválido. Solicita un nuevo correo de recuperación.');
  }, [token]);

  const update = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => {
      const next = { ...fe };
      delete next[k];
      return next;
    });
    setError(null);
  };

  const onSubmit = async () => {
    setFieldErrors({});
    setError(null);

    try {
      ResetPasswordSchema.parse(form);
    } catch (e) {
      setFieldErrors(zodFieldErrors(e));
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ token, password: form.password });
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (e) {
      setError(toUserFacingError(e, 'auth.resetPassword'));
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

        {done ? (
          <>
            <h1 className="auth-title">Contraseña actualizada</h1>
            <p className="auth-subtitle">
              Tu contraseña fue restablecida correctamente. Te redirigimos al inicio de sesión…
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Nueva contraseña</h1>
            <p className="auth-subtitle">Elige una contraseña segura para tu cuenta.</p>

            <div className="auth-fields">
              <div className="auth-field">
                <label className="auth-label" htmlFor="reset-password">
                  Nueva contraseña
                </label>
                <input
                  id="reset-password"
                  name="password"
                  className={`auth-input ${fieldErrors.password ? 'error' : ''}`}
                  type="password"
                  placeholder="Mínimo 8 caracteres, 1 mayúscula y 1 número"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  disabled={!token}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                {fieldErrors.password && (
                  <p id="password-error" className="auth-error-text">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="reset-confirm">
                  Confirmar contraseña
                </label>
                <input
                  id="reset-confirm"
                  name="confirm"
                  className={`auth-input ${fieldErrors.confirm ? 'error' : ''}`}
                  type="password"
                  placeholder="Repite la contraseña"
                  value={form.confirm}
                  onChange={(e) => update('confirm', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                  autoComplete="new-password"
                  disabled={!token}
                  aria-invalid={Boolean(fieldErrors.confirm)}
                  aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                />
                {fieldErrors.confirm && (
                  <p id="confirm-error" className="auth-error-text">
                    {fieldErrors.confirm}
                  </p>
                )}
              </div>

              {error && <p className="auth-error">{error}</p>}
            </div>

            <button
              className="auth-submit"
              onClick={onSubmit}
              disabled={loading || !token}
            >
              {loading ? 'Guardando…' : 'Guardar contraseña'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
