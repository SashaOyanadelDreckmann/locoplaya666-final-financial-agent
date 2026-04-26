'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerUser } from '@/lib/api';
import { toUserFacingError } from '@/lib/userError';
import { useSessionStore } from '@/state/session.store';
import { RegisterSchema, type RegisterInput } from '@/lib/validation';
import { ZodError } from 'zod';

export default function RegisterPage() {
  const router = useRouter();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);

  const [form, setForm] = useState<RegisterInput>({
    name: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const update = (k: keyof RegisterInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validateForm = (): boolean => {
    try {
      RegisterSchema.parse(form);
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
      await registerUser(form);
      setAuthenticated();
      router.push('/intake');
    } catch (e: Error | unknown) {
      setError(toUserFacingError(e, 'auth.register'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">FinancieraMente</div>
        <h1 className="auth-title">Crear cuenta</h1>
        <p className="auth-subtitle">Un primer paso breve. Luego, conversamos con calma.</p>

        <div className="auth-fields">
          <div className="auth-field">
            <label className="auth-label">Nombre</label>
            <input
              className={`auth-input ${fieldErrors.name ? 'error' : ''}`}
              type="text"
              placeholder="Cómo prefieres que te llame"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              autoComplete="given-name"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            />
            {fieldErrors.name && (
              <p id="name-error" className="auth-error-text">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className={`auth-input ${fieldErrors.email ? 'error' : ''}`}
              type="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
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
              placeholder="Una clave simple, solo para ti"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              autoComplete="new-password"
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
          {loading ? 'Creando…' : 'Continuar'}
        </button>

        <div className="auth-footer">
          <span className="auth-footer-text">¿Ya tienes cuenta?</span>
          <Link href="/login" className="auth-footer-link">
            Iniciar sesión
          </Link>
        </div>

        <p className="auth-fine-print">Toma menos de un minuto · Privado · Sin spam</p>
      </div>
    </main>
  );
}
