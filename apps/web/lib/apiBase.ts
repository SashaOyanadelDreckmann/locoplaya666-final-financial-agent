import {
  readApiOriginFromProcessEnv,
  readApiOriginFromRuntimeWindow,
} from './runtimePublicConfig';

function readDirectApiOriginFromEnv(): string | null {
  return readApiOriginFromProcessEnv();
}

function readDirectApiOriginForClient(): string | null {
  return readApiOriginFromRuntimeWindow() ?? readDirectApiOriginFromEnv();
}

/**
 * Base URL del API para el frontend.
 *
 * - En browser usa `/backend` (same-origin) — funciona en localhost y en LAN (iPhone)
 * - En deploy server-side, configurar NEXT_PUBLIC_API_URL
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Same-origin proxy works on localhost and on LAN (iPhone → Mac dev server).
    return '/backend';
  }

  const direct = readDirectApiOriginFromEnv();
  if (direct) return direct;

  return 'http://localhost:3001';
}

export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN;
  const base = (fromEnv ?? '').trim();
  if (base.length > 0) return base.replace(/\/+$/, '');

  return 'http://localhost:3000';
}

/** Relative paths served by Next.js (must not be prefixed with /backend). */
export function isWebAppServedPath(path: string): boolean {
  return path.startsWith('/generated/') || path.startsWith('/api/reports/');
}

/** Resolve a stored artifact URL for browser navigation (library links, previews). */
export function resolveDocumentUrl(raw: string): string {
  if (!raw) return '#';
  if (/^(https?:\/\/|blob:|data:)/i.test(raw)) return raw;
  const base = isWebAppServedPath(raw) ? getAppBaseUrl() : getApiBaseUrl();
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw.replace(/^\/+/, '')}`;
}

/**
 * URL base directa del API para requests largos del agente.
 *
 * En producción evitamos pasar por el proxy de Next (`/backend`) porque
 * algunas respuestas extensas pueden cortarse con ECONNRESET en Railway.
 */
export function getAgentApiBaseUrl(): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    const direct = readDirectApiOriginForClient();
    if (direct) return direct;
  }

  const direct = readDirectApiOriginFromEnv();
  if (direct) return direct;

  return getApiBaseUrl();
}

/**
 * Uploads de documentos usan `/api/documents/parse` (proxy Next same-origin).
 * @deprecated Usar ruta relativa `/api/documents/parse` desde el cliente.
 */
export function getUploadApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api/documents/parse';
  }
  return `${getServerApiBaseUrl()}/api/documents/parse`;
}

/**
 * URL de request para llamadas del agente desde frontend.
 * En browser siempre usamos el proxy same-origin de Next para preservar sesión/cookies.
 */
export function getAgentRequestUrl(path = '/api/agent'): string {
  if (typeof window !== 'undefined') {
    return path;
  }
  return `${getAgentApiBaseUrl()}${path}`;
}

/**
 * Base URL del API en rutas/server actions de Next (sin proxy /backend).
 */
export function getServerApiBaseUrl(): string {
  const direct = readDirectApiOriginFromEnv();
  if (direct) return direct;
  return 'http://localhost:3001';
}

/**
 * URL para parse de documentos desde el browser.
 * En producción usa la ruta interna de Next, que reenvía cookies al API
 * con timeout largo. El API directo cross-origin no recibe la sesión.
 */
export function getDocumentParseRequestUrl(): string {
  return getUploadApiBaseUrl();
}

/**
 * Base URL para llamadas con sesión (cookies httpOnly).
 * En producción usa el proxy same-origin `/backend` para que la cookie
 * quede en el dominio del frontend; el API directo rompe el login tras el guard.
 */
export function getSessionApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/backend';
  }
  return getServerApiBaseUrl();
}
