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
 * - En dev local, si no está configurado, cae a http://localhost:3001
 * - En deploy, configurar NEXT_PUBLIC_API_URL (ej: https://api.tu-dominio.com)
 * - En browser+prod usa `/backend` (same-origin) para cookies de sesión en móvil/Safari
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'production') {
      const direct = readDirectApiOriginForClient();
      if (direct) return direct;
      return '/backend';
    }

    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:3001`;
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
 * En browser+prod usamos la ruta interna de Next para preservar sesión/cookies.
 */
export function getAgentRequestUrl(path = '/api/agent'): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    const direct = readDirectApiOriginForClient();
    if (direct) return `${direct}${path}`;
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
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return '/api/documents/parse';
  }
  return `${getUploadApiBaseUrl()}/api/documents/parse`;
}

/**
 * Base URL para llamadas con sesión (cookies httpOnly).
 * En producción usa el proxy same-origin `/backend` para que la cookie
 * quede en el dominio del frontend; el API directo rompe el login tras el guard.
 */
export function getSessionApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'production') {
      const direct = readDirectApiOriginForClient();
      if (direct) return direct;
      return '/backend';
    }
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:3001`;
  }
  return getServerApiBaseUrl();
}
