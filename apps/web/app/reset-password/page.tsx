'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError('Enlace inválido. Solicita un nuevo correo de recuperación.');
  }, [token]);

  const isValidPassword = (v: string) => /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(v);

  const onSubmit = async () => {
    if (!isValidPassword(password)) {
      setError('La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/backend/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail: string = body?.detail ?? body?.error ?? 'Error del servidor';
        setError(detail);
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
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
          <Image src="/logo-fm.svg" alt="Financieramente" width={112} height={112} className="h-full w-full object-cover" />
        </div>
        <div className="auth-eyebrow">Financieramente</div>

        {done ? (
          <>
            <h1 className="auth-title">Contraseña actualizada</h1>
            <p className="auth-subtitle">Tu contraseña fue restablecida correctamente. Te redirigimos al inicio de sesión…</p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Nueva contraseña</h1>
            <p className="auth-subtitle">Elige una contraseña segura para tu cuenta.</p>

            <div className="auth-fields">
              <div className="auth-field">
                <label className="auth-label" htmlFor="reset-password">Nueva contraseña</label>
                <input
                  id="reset-password"
                  name="password"
                  className={`auth-input${error ? ' error' : ''}`}
                  type="password"
                  placeholder="Mínimo 8 caracteres, 1 mayúscula y 1 número"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  autoFocus
                  disabled={!token}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="reset-confirm">Confirmar contraseña</label>
                <input
                  id="reset-confirm"
                  name="confirm"
                  className={`auth-input${error ? ' error' : ''}`}
                  type="password"
                  placeholder="Repite la contraseña"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                  autoComplete="new-password"
                  disabled={!token}
                />
                {error && <p className="auth-error-text">{error}</p>}
              </div>
            </div>

            <button className="auth-submit" onClick={onSubmit} disabled={loading || !token}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </>
        )}

        <div className="auth-footer">
          <Link href="/login" className="auth-footer-link">Volver a iniciar sesión</Link>
        </div>
      </div>
    </main>
  );
}
