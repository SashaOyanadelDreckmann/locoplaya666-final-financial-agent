'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function getPlatformGuide() {
  if (typeof navigator === 'undefined') {
    return {
      title: 'Instalación',
      steps: [
        'Abre la app en tu navegador móvil o desktop.',
        'Busca la opción de instalar/agregar al inicio.',
      ],
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isChrome = /chrome|chromium/.test(ua);

  if (isIos) {
    return {
      title: 'iPhone/iPad (Safari)',
      steps: [
        'Abre esta página en Safari.',
        'Pulsa el botón Compartir.',
        'Selecciona "Agregar a pantalla de inicio".',
      ],
    };
  }

  if (isAndroid && isChrome) {
    return {
      title: 'Android (Chrome)',
      steps: [
        'Pulsa el menú de Chrome (tres puntos).',
        'Selecciona "Instalar app" o "Agregar a pantalla principal".',
        'Confirma la instalación.',
      ],
    };
  }

  return {
    title: 'Desktop',
    steps: [
      'Abre el menú del navegador.',
      'Elige "Instalar app" o "Crear acceso directo".',
      'Confirma para tenerla como app independiente.',
    ],
  };
}

function WaitingApprovalContent() {
  const searchParams = useSearchParams();
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installStatus, setInstallStatus] = useState<'idle' | 'accepted' | 'dismissed'>('idle');

  const email = useMemo(() => String(searchParams.get('email') ?? '').trim(), [searchParams]);
  const name = useMemo(() => String(searchParams.get('name') ?? '').trim(), [searchParams]);
  const guide = useMemo(() => getPlatformGuide(), []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstallStatus(choice.outcome);
    setDeferredPrompt(null);
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Solicitud recibida</div>
        <h1 className="auth-title">Tu cuenta está pendiente de aprobación</h1>
        <p className="auth-subtitle">
          {name ? `${name}, r` : 'R'}ecibimos tu registro{email ? ` (${email})` : ''}. Te avisaré por correo cuando la cuenta quede autorizada.
        </p>

        <div className="auth-fields">
          <div className="auth-field">
            <label className="auth-label">Mientras tanto, instala la app</label>
            <p className="auth-fine-print" style={{ textAlign: 'left' }}>
              {guide.title}
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(235, 240, 248, 0.8)', fontSize: 13, lineHeight: 1.6 }}>
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>

        <button
          className="auth-submit"
          onClick={() => void onInstallClick()}
          disabled={!deferredPrompt}
        >
          {deferredPrompt ? 'Instalar app ahora' : 'Instalación guiada disponible según navegador'}
        </button>

        {installStatus !== 'idle' && (
          <p className="auth-fine-print" style={{ marginBottom: 12 }}>
            {installStatus === 'accepted'
              ? 'Instalación iniciada correctamente.'
              : 'Instalación cancelada. Puedes intentarlo nuevamente cuando quieras.'}
          </p>
        )}

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
