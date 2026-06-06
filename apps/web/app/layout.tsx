// apps/web/app/layout.tsx
import './globals.css';
import './agent.css';
import './backdrop-system.css';
import ServiceWorkerReset from '@/components/ServiceWorkerReset';
import { buildRuntimePublicConfigScript } from '@/lib/runtimePublicConfig';
import type { Viewport } from 'next';

export const metadata = {
  title: 'Financieramente',
  description: 'Claridad financiera, antes de decidir.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeConfigScript = buildRuntimePublicConfigScript();
  const standaloneClassScript = `
(() => {
  try {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');
  } catch (_) {}
})();
`;
  const agentRouteClassScript = `
(() => {
  try {
    const isAgentRoute = /^\\/agent(\\/|$)/.test(window.location.pathname);
    if (!isAgentRoute) return;
    const apply = () => {
      document.documentElement.classList.add('agent-route-active');
      document.body?.classList.add('agent-route-active');
    };
    apply();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
  } catch (_) {}
})();
`;
  const homeRouteClassScript = `
(() => {
  try {
    const isHomeRoute = window.location.pathname === '/';
    if (!isHomeRoute) return;
    const apply = () => {
      document.documentElement.classList.add('home-route-active');
      document.body?.classList.add('home-route-active');
    };
    apply();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
  } catch (_) {}
})();
`;

  return (
    <html lang="es">
      <head>
        <script
          id="fa-runtime-config"
          dangerouslySetInnerHTML={{ __html: runtimeConfigScript }}
        />
        <script
          id="fa-standalone-class"
          dangerouslySetInnerHTML={{ __html: standaloneClassScript }}
        />
        <script
          id="fa-agent-route-class"
          dangerouslySetInnerHTML={{ __html: agentRouteClassScript }}
        />
        <script
          id="fa-home-route-class"
          dangerouslySetInnerHTML={{ __html: homeRouteClassScript }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#5f7280" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#5f7280" />
        <meta name="theme-color" content="#5f7280" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FinMente" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@1&family=Caveat:wght@600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ServiceWorkerReset />
        <div className="global-agent-backdrop" aria-hidden="true" />
        <div className="viewport-backdrop-feather" aria-hidden="true" />
        <div className="app-shell">
          <div className="mobile-scale-frame">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
