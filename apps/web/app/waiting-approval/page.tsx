'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, MoreHorizontal, Share2, Sparkles, SmartphoneNfc, SquareArrowOutUpRight, MonitorSmartphone } from 'lucide-react';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Platform = 'ios' | 'android-chrome' | 'desktop' | 'unknown';
type InstallState = 'idle' | 'accepted' | 'dismissed' | 'open-safari' | 'use-share';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua) && /chrome|chromium/.test(ua)) return 'android-chrome';
  return 'desktop';
}

function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function getPlatformGuide(platform: Platform) {
  if (platform === 'ios') {
    return {
      title: 'iPhone / iPad',
      accent: 'Instalación manual requerida por iOS',
      steps: [
        'Abre esta página en Safari, no dentro de otro navegador.',
        'Pulsa el botón Compartir en la barra inferior.',
        'Si no ves la opción, toca Ver más y luego Agregar a pantalla de inicio.',
      ],
      primaryLabel: 'Ver guía iPhone',
      helper: 'Apple no permite agregar a inicio automáticamente desde una web; este es el flujo correcto.',
      platformArt: [
        { label: 'Safari', icon: SmartphoneNfc },
        { label: 'Compartir', icon: Share2 },
        { label: 'Ver más', icon: MoreHorizontal },
        { label: 'Agregar', icon: SquareArrowOutUpRight },
      ],
    };
  }
  if (platform === 'android-chrome') {
    return {
      title: 'Android',
      accent: 'Instalación directa disponible',
      steps: [
        'Pulsa el menú (tres puntos) de Chrome.',
        'Selecciona "Instalar app".',
        'Confirma la instalación.',
      ],
      primaryLabel: 'Instalar app',
      helper: 'Si Chrome detecta la app instalable, verás el prompt nativo.',
      platformArt: [
        { label: 'Chrome', icon: MonitorSmartphone },
        { label: 'Menú', icon: MoreHorizontal },
        { label: 'Instalar', icon: Sparkles },
      ],
    };
  }
  return {
    title: 'Desktop',
    accent: 'Acceso como app de escritorio',
    steps: [
      'Abre el menú de tu navegador.',
      'Elige "Instalar app" o "Crear acceso directo".',
      'Confirma para tenerla como app independiente.',
    ],
    primaryLabel: 'Ver instrucciones',
    helper: 'La opción cambia según navegador.',
    platformArt: [
      { label: 'Navegador', icon: MonitorSmartphone },
      { label: 'Menú', icon: MoreHorizontal },
      { label: 'Instalar', icon: SquareArrowOutUpRight },
    ],
  };
}

function WaitingApprovalContent() {
  const searchParams = useSearchParams();
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [isSafari, setIsSafari] = useState(false);
  const [standalone, setStandalone] = useState(false);

  const email = useMemo(() => String(searchParams?.get('email') ?? '').trim(), [searchParams]);
  const name = useMemo(() => String(searchParams?.get('name') ?? '').trim(), [searchParams]);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setIsSafari(isSafariBrowser());
    setStandalone(isStandaloneMode());

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const guide = useMemo(() => getPlatformGuide(platform), [platform]);

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const onInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setInstallState(choice.outcome);
      setDeferredPrompt(null);
      return;
    }
    if (platform === 'ios' && !isSafari) {
      setInstallState('open-safari');
      return;
    }
    if (canShare && platform === 'ios') {
      try {
        await navigator.share({ title: 'Financieramente', url: window.location.href });
        setInstallState('use-share');
      } catch {
        // user dismissed share sheet
      }
      return;
    }
    setInstallState('dismissed');
  };

  const btnLabel =
    deferredPrompt ? 'Instalar app' : guide.primaryLabel;

  const showButton = !standalone && installState === 'idle' && (platform === 'ios' || !!deferredPrompt || canShare);

  const statusMessage =
    standalone
      ? 'La app ya está abierta como acceso directo.'
      : installState === 'accepted'
        ? '✓ Instalación iniciada.'
        : installState === 'dismissed'
          ? 'Puedes instalarla cuando quieras desde el navegador.'
          : installState === 'open-safari'
            ? 'Para iPhone, abre esta página en Safari y luego usa Compartir.'
            : installState === 'use-share'
              ? 'Se abrió Compartir. Luego elige "Agregar a inicio".'
              : null;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Solicitud recibida</div>
        <h1 className="auth-title">Tu cuenta está pendiente de aprobación</h1>
        <p className="auth-subtitle">
          {name ? `${name}, r` : 'R'}ecibimos tu registro{email ? ` (${email})` : ''}. Te avisaré por correo cuando la cuenta quede autorizada.
        </p>

        <div className="waiting-install-block">
          <div className="waiting-install-header">
            <div className="waiting-install-title-group">
              <span className="waiting-install-label">Instala la app</span>
              <strong className="waiting-install-kicker">{guide.accent}</strong>
            </div>
            {platform !== 'unknown' && <span className="waiting-platform-badge">{guide.title}</span>}
          </div>

          <p className="waiting-install-helper">{guide.helper}</p>

          <div className="waiting-platform-art" aria-hidden="true">
            {guide.platformArt.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="waiting-platform-art-step">
                  <div className="waiting-platform-art-icon">
                    <Icon size={15} strokeWidth={2.2} />
                  </div>
                  <span className="waiting-platform-art-label">{item.label}</span>
                  {i < guide.platformArt.length - 1 ? <ArrowRight size={13} className="waiting-platform-art-arrow" /> : null}
                </div>
              );
            })}
          </div>

          <ol className="waiting-steps">
            {guide.steps.map((step, i) => (
              <li key={step} className="waiting-step">
                <span className="waiting-step-num">{i + 1}</span>
                <span className="waiting-step-text">{step}</span>
              </li>
            ))}
          </ol>

          {showButton ? (
            <button className="waiting-install-btn" onClick={() => void onInstallClick()}>
              {btnLabel}
            </button>
          ) : null}

          {statusMessage ? <div className="waiting-install-status">{statusMessage}</div> : null}
        </div>

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
