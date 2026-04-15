/**
 * Base URL del API para el frontend.
 *
 * - En dev local, si no está configurado, cae a http://localhost:3001
 * - En deploy, configurar NEXT_PUBLIC_API_URL (ej: https://api.tu-dominio.com)
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  const base = (fromEnv ?? '').trim();
  return base.length > 0 ? base.replace(/\/+$/, '') : 'http://localhost:3001';
}
