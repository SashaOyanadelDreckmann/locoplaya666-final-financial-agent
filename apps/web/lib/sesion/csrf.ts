/**
 * CSRF Protection utilities
 *
 * El servidor genera un token CSRF en cada sesión.
 * El cliente incluye este token en headers X-CSRF-Token para POST/PUT/DELETE requests.
 */

const CSRF_TOKEN_KEY = '__csrf_token';
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';
const CSRF_COOKIE_NAME = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME?.trim() || 'csrf-token';

function readCsrfTokenFromDocumentCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const pattern = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`);
  const match = document.cookie.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Obtiene el token CSRF del servidor (debe ser obtenido en una petición GET inicial)
 */
export const getCsrfToken = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (stored) return stored;
  } catch {
    // sessionStorage puede fallar en iOS privado / WebViews
  }

  const fromCookie = readCsrfTokenFromDocumentCookie();
  if (fromCookie) {
    try {
      sessionStorage.setItem(CSRF_TOKEN_KEY, fromCookie);
    } catch {
      // keep in-memory cookie fallback only
    }
    return fromCookie;
  }

  return null;
};

/**
 * Almacena el token CSRF del servidor
 */
export const setCsrfToken = (token: string): void => {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  } catch {
    console.warn('Failed to store CSRF token');
  }
};

export const clearCsrfToken = (): void => {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
    // backward-compatible cleanup for older key usages
    sessionStorage.removeItem('csrf_token');
  } catch {
    console.warn('Failed to clear CSRF token');
  }
};

/**
 * Agrega el token CSRF a los headers de una request
 */
export const addCsrfTokenToHeaders = (headers: HeadersInit): HeadersInit => {
  const token = getCsrfToken();
  if (!token) {
    console.warn('No CSRF token available');
    return headers;
  }

  return {
    ...headers,
    [CSRF_TOKEN_HEADER]: token,
  };
};

/**
 * Wrapper para fetch que automáticamente agrega CSRF token
 */
export const fetchWithCsrf = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const method = (options.method ?? 'GET').toUpperCase();

  // Solo agregar CSRF token para requests que modifican datos
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    options.headers = addCsrfTokenToHeaders(options.headers ?? {});
  }

  return fetch(url, options);
};

const csrf = {
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  addCsrfTokenToHeaders,
  fetchWithCsrf,
};

export default csrf;
