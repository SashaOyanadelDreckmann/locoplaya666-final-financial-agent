/**
 * Base URL del API para el frontend.
 *
 * - En dev local, si no está configurado, cae a http://localhost:3001
 * - En deploy, configurar NEXT_PUBLIC_API_URL (ej: https://api.tu-dominio.com)
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return '/backend';
  }

  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  const base = (fromEnv ?? '').trim();
  if (base.length > 0) return base.replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    return 'https://locoplaya666-final-financial-agent-production.up.railway.app';
  }

  return 'http://localhost:3001';
}
