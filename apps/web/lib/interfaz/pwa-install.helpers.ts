import type { LucideIcon } from 'lucide-react';
import {
  MonitorSmartphone,
  MoreHorizontal,
  Share2,
  SmartphoneNfc,
  Sparkles,
  SquareArrowOutUpRight,
} from 'lucide-react';

import { detectPwaStandalone } from './viewport-mode';

export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type PwaInstallPlatform = 'ios' | 'android-chrome' | 'desktop' | 'unknown';

export type PwaInstallState = 'idle' | 'accepted' | 'dismissed' | 'open-safari' | 'use-share';

export type PwaInstallGuide = {
  title: string;
  accent: string;
  steps: string[];
  primaryLabel: string;
  helper: string;
  platformArt: Array<{ label: string; icon: LucideIcon }>;
};

const DISMISS_STORAGE_PREFIX = 'fa:pwa-install-notice-dismissed:v1:';

export function detectPwaInstallPlatform(): PwaInstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua) && /chrome|chromium/.test(ua)) return 'android-chrome';
  return 'desktop';
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
}

export function isPwaStandaloneMode(): boolean {
  return detectPwaStandalone();
}

export function getPwaInstallGuide(platform: PwaInstallPlatform): PwaInstallGuide {
  if (platform === 'ios') {
    return {
      title: 'iPhone / iPad',
      accent: 'Agrega Financieramente a tu inicio',
      steps: [
        'Abre esta página en Safari, no dentro de otro navegador.',
        'Pulsa Compartir en la barra inferior.',
        'Elige Agregar a pantalla de inicio y confirma.',
      ],
      primaryLabel: 'Ver cómo en iPhone',
      helper: 'En iOS la instalación es manual; así tendrás la app a un toque.',
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
      accent: 'Instala la app en tu inicio',
      steps: [
        'Pulsa el menú (tres puntos) de Chrome.',
        'Selecciona Instalar app o Agregar a inicio.',
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
    title: 'Escritorio',
    accent: 'Abre Financieramente como app',
    steps: [
      'Abre el menú de tu navegador.',
      'Elige Instalar app o Crear acceso directo.',
      'Confirma para abrirla sin pestañas del navegador.',
    ],
    primaryLabel: 'Ver instrucciones',
    helper: 'La opción exacta depende de tu navegador.',
    platformArt: [
      { label: 'Navegador', icon: MonitorSmartphone },
      { label: 'Menú', icon: MoreHorizontal },
      { label: 'Instalar', icon: SquareArrowOutUpRight },
    ],
  };
}

function dismissStorageKey(userId: string): string {
  return `${DISMISS_STORAGE_PREFIX}${userId}`;
}

export function isPwaInstallNoticeDismissed(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.localStorage.getItem(dismissStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function dismissPwaInstallNotice(userId: string | null | undefined): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(dismissStorageKey(userId), '1');
  } catch {
    // ignore quota / private mode
  }
}

export function shouldRenderPwaInstallNotice(input: {
  userId?: string | null;
  authBootstrapped: boolean;
  isAuthenticated: boolean;
  isStandalone: boolean;
  activeChatId: string;
  chatClosed?: boolean;
  compactClosedView?: boolean;
  loading?: boolean;
  bootSequenceActive?: boolean;
}): boolean {
  if (!input.authBootstrapped || !input.isAuthenticated) return false;
  if (!input.userId) return false;
  if (input.isStandalone) return false;
  if (input.activeChatId !== 'chat-1') return false;
  if (input.chatClosed) return false;
  if (input.compactClosedView) return false;
  if (input.loading) return false;
  if (input.bootSequenceActive) return false;
  return !isPwaInstallNoticeDismissed(input.userId);
}

export function canShareFromBrowser(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator;
}

export function shouldShowPwaInstallPrimaryAction(input: {
  standalone: boolean;
  installState: PwaInstallState;
  platform: PwaInstallPlatform;
  hasDeferredPrompt: boolean;
}): boolean {
  if (input.standalone || input.installState !== 'idle') return false;
  if (input.platform === 'ios') return true;
  if (input.hasDeferredPrompt) return true;
  return canShareFromBrowser();
}

export function resolvePwaInstallPrimaryLabel(input: {
  hasDeferredPrompt: boolean;
  guide: PwaInstallGuide;
}): string {
  return input.hasDeferredPrompt ? 'Instalar app' : input.guide.primaryLabel;
}

export function resolvePwaInstallStatusMessage(input: {
  standalone: boolean;
  installState: PwaInstallState;
}): string | null {
  if (input.standalone) return 'La app ya está abierta como acceso directo.';
  if (input.installState === 'accepted') return 'Instalación iniciada. Revisa el aviso de tu sistema.';
  if (input.installState === 'dismissed') {
    return 'Puedes instalarla cuando quieras desde el menú del navegador.';
  }
  if (input.installState === 'open-safari') {
    return 'En iPhone, abre esta página en Safari y luego usa Compartir.';
  }
  if (input.installState === 'use-share') {
    return 'Se abrió Compartir. Luego elige Agregar a pantalla de inicio.';
  }
  return null;
}

export async function runPwaInstallPrimaryAction(input: {
  deferredPrompt: DeferredInstallPrompt | null;
  platform: PwaInstallPlatform;
  isSafari: boolean;
}): Promise<PwaInstallState> {
  if (input.deferredPrompt) {
    await input.deferredPrompt.prompt();
    const choice = await input.deferredPrompt.userChoice;
    return choice.outcome;
  }
  if (input.platform === 'ios' && !input.isSafari) {
    return 'open-safari';
  }
  if (canShareFromBrowser() && input.platform === 'ios') {
    try {
      await navigator.share({ title: 'Financieramente', url: window.location.href });
      return 'use-share';
    } catch {
      return 'idle';
    }
  }
  return 'dismissed';
}
