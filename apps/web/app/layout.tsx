// apps/web/app/layout.tsx
import './globals.css';
import './agent.css';
import ServiceWorkerReset from '@/components/ServiceWorkerReset';
import { buildRuntimePublicConfigScript } from '@/lib/runtimePublicConfig';

export const metadata = {
  title: 'Financieramente',
  description: 'Claridad financiera, antes de decidir.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeConfigScript = buildRuntimePublicConfigScript();

  return (
    <html lang="es">
      <head>
        <script
          id="fa-runtime-config"
          dangerouslySetInnerHTML={{ __html: runtimeConfigScript }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#05090f" />
        <meta name="theme-color" content="#05090f" />
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
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
