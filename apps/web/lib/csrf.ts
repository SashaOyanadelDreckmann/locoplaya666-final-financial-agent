/**
 * CSRF Protection utilities
 *
 * El servidor genera un token CSRF en cada sesión.
 * El cliente incluye este token en headers X-CSRF-Token para POST/PUT/DELETE requests.
 */

const CSRF_TOKEN_KEY = '__csrf_token';
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';

/**
 * Obtiene el token CSRF del servidor (debe ser obtenido en una petición GET inicial)
 */
export const getCsrfToken = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(CSRF_TOKEN_KEY);
  } catch {
    return null;
  }
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
export const fetchWithCsrf = async <T = unknown>(
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

export default {
  getCsrfToken,
  setCsrfToken,
  addCsrfTokenToHeaders,
  fetchWithCsrf,
};
