import type { CapacitorConfig } from '@capacitor/core';

// En producción apunta al web de Railway.
// En dev local apunta a localhost:3000.
const isProd = process.env.NODE_ENV === 'production';
const RAILWAY_WEB_URL = process.env.CAPACITOR_SERVER_URL || 'https://TU-WEB.up.railway.app';

const config: CapacitorConfig = {
  appId: 'cl.uchile.financial',
  appName: 'FinMente',
  webDir: 'out', // fallback para builds estáticos futuros
  server: isProd
    ? {
        url: RAILWAY_WEB_URL,
        cleartext: false,
      }
    : {
        url: 'http://localhost:3000',
        cleartext: true,
        androidScheme: 'http',
      },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0a0a0a',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
  },
};

export default config;
