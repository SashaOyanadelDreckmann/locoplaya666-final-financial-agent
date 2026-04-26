'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/lib/api';
import { toUserFacingError } from '@/lib/userError';
import { useSessionStore } from '@/state/session.store';
import { LoginSchema, type LoginInput } from '@/lib/validation';
import { ZodError } from 'zod';

export default function LoginPage() {
  const router = useRouter();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);

  const [form, setForm] = useState<LoginInput>({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const update = (k: keyof LoginInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validateForm = (): boolean => {
    try {
      LoginSchema.parse(form);
      setFieldErrors({});
      return true;
    } catch (e) {
      if (e instanceof ZodError) {
        const errors: Record<string, string> = {};
        e.errors.forEach((err) => {
          const field = err.path[0] as string;
          errors[field] = err.message;
        });
        setFieldErrors(errors);
      }
      return false;
    }
  };

  const onSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      setError(null);
      await loginUser(form);
      setAuthenticated();
      router.push('/agent');
    } catch (e: Error | unknown) {
      setError(toUserFacingError(e, 'auth.login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">FinancieraMente</div>
        <h1 className="auth-title">Bienvenido de vuelta</h1>
        <p className="auth-subtitle">Accede a tu sesión y retoma donde lo dejaste.</p>

        <div className="auth-fields">
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className={`auth-input ${fieldErrors.email ? 'error' : ''}`}
              type="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="auth-error-text">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label">Contraseña</label>
            <input
              className={`auth-input ${fieldErrors.password ? 'error' : ''}`}
              type="password"
              placeholder="Tu clave"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              autoComplete="current-password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="auth-error-text">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {error && <p className="auth-error">{error}</p>}
        </div>

        <button className="auth-submit" onClick={onSubmit} disabled={loading}>
          {loading ? 'Entrando…' : 'Continuar'}
        </button>

        <div className="auth-footer">
          <span className="auth-footer-text">¿Primera vez?</span>
          <Link href="/register" className="auth-footer-link">
            Crear cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
