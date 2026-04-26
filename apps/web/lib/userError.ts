import { ApiHttpError } from './apiEnvelope';

type ErrorContext = 'auth.login' | 'auth.register' | 'chat.send' | 'intake.submit' | 'generic';

function asText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function toUserFacingError(error: unknown, context: ErrorContext = 'generic'): string {
  if (error instanceof ApiHttpError) {
    const code = asText(error.code);
    const message = asText(error.message);
    const detail = asText(error.detail);
    const joined = `${code} ${message} ${detail}`;

    if (error.status === 401 || code === 'unauthorized') {
      return context === 'auth.login'
        ? 'Credenciales inválidas. Revisa tu correo y contraseña.'
        : 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    }

    if (error.status === 409 || code === 'conflict' || joined.includes('already exists')) {
      return context === 'auth.register'
        ? 'Ya existe una cuenta con ese correo.'
        : 'Este recurso ya existe y no se pudo completar la operación.';
    }

    if (error.status === 429 || code === 'rate_limited') {
      return 'Hay demasiadas solicitudes en este momento. Intenta nuevamente en unos segundos.';
    }

    if (error.status === 422 || code === 'validation_error') {
      return 'Algunos datos no son válidos. Revisa la información e inténtalo otra vez.';
    }

    if (error.status === 403 || code === 'forbidden') {
      return 'No tienes permisos para realizar esta acción.';
    }

    if (error.status >= 500 || code === 'internal_error') {
      return 'Tuvimos un problema interno. Ya estamos trabajando en ello, intenta nuevamente.';
    }

    if (context === 'chat.send') {
      return 'No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.';
    }
    if (context === 'intake.submit') {
      return 'No pudimos guardar tu formulario por ahora. Intenta nuevamente.';
    }
    return 'No se pudo completar la solicitud. Intenta nuevamente.';
  }

  if (error instanceof Error) {
    const msg = asText(error.message);
    if (msg.includes('timeout') || msg.includes('abort')) {
      return 'La solicitud tardó demasiado. Inténtalo nuevamente.';
    }
  }

  if (context === 'chat.send') {
    return 'No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.';
  }
  if (context === 'intake.submit') {
    return 'No pudimos guardar tu formulario por ahora. Intenta nuevamente.';
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
