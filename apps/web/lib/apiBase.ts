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

  return 'http://localhost:3001';
}

/**
 * URL base directa del API para requests largos del agente.
 *
 * En producción evitamos pasar por el proxy de Next (`/backend`) porque
 * algunas respuestas extensas pueden cortarse con ECONNRESET en Railway.
 */
export function getAgentApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_AGENT_API_URL;
  const base = (fromEnv ?? '').trim();
  if (base.length > 0) return base.replace(/\/+$/, '');

  return getApiBaseUrl();
}

/**
 * URL de request para llamadas del agente desde frontend.
 * En browser+prod usamos la ruta interna de Next para preservar sesión/cookies.
 */
export function getAgentRequestUrl(path = '/api/agent'): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return path;
  }
  return `${getAgentApiBaseUrl()}${path}`;
}
