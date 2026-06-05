import { ApiHttpError } from './apiEnvelope';

type ErrorContext =
  | 'auth.login'
  | 'auth.register'
  | 'auth.forgotPassword'
  | 'auth.resetPassword'
  | 'chat.send'
  | 'intake.submit'
  | 'interview.voice'
  | 'generic';

function asText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

type ValidationIssue = { path?: string; message?: string };

const INTAKE_FIELD_LABELS: Record<string, string> = {
  age: 'Edad',
  employmentStatus: 'Situación laboral',
  profession: 'Ocupación',
  incomeBand: 'Rango de ingresos',
  exactMonthlyIncome: 'Ingreso mensual exacto',
  expensesCoverage: 'Cobertura de gastos',
  tracksExpenses: 'Registro de gastos',
  hasSavingsOrInvestments: 'Ahorros o inversiones',
  savingsBand: 'Rango de ahorros',
  exactSavingsAmount: 'Monto exacto de ahorros',
  hasDebt: 'Deudas activas',
  riskReaction: 'Reacción ante pérdidas',
  riskReactionOther: 'Detalle de reacción',
  selfRatedUnderstanding: 'Comprensión financiera',
  moneyStressLevel: 'Nivel de estrés financiero',
  financialKnowledge: 'Conocimientos financieros',
};

function toIntakeValidationMessage(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const issues = details as ValidationIssue[];

  const lines = issues
    .slice(0, 4)
    .map((issue) => {
      const path = String(issue.path ?? '').trim();
      const root = path.split('.')[0] || 'campo';
      const label = INTAKE_FIELD_LABELS[root] ?? root;
      const msg = String(issue.message ?? '').trim();

      if (msg.toLowerCase().includes('required') || msg.toLowerCase().includes('undefined')) {
        return `Falta completar: ${label}.`;
      }
      if (msg) return `${label}: ${msg}.`;
      return `Revisa: ${label}.`;
    })
    .filter(Boolean);

  if (!lines.length) return null;
  return lines.join(' ');
}

export function toUserFacingError(error: unknown, context: ErrorContext = 'generic'): string {
  if (error instanceof ApiHttpError) {
    const code = asText(error.code);
    const message = asText(error.message);
    const detail = asText(error.detail);
    const joined = `${code} ${message} ${detail}`;
    const joinedLower = joined.toLowerCase();

    if (context === 'interview.voice') {
      if (joinedLower.includes('openai realtime error') || joinedLower.includes('client_secret') || joinedLower.includes('realtime')) {
        // Surface the actual OpenAI error when available (e.g. model not found, quota exceeded)
        const openaiDetail =
          typeof error.detail === 'string' && error.detail.trim().length > 0
            ? error.detail.trim()
            : typeof error.message === 'string' && error.message.trim().length > 0
            ? error.message.trim()
            : null;
        if (openaiDetail && openaiDetail.length < 200) {
          return `Llamada en tiempo real: ${openaiDetail}`;
        }
        return 'No se pudo iniciar la llamada. Revisa que el modelo de voz esté habilitado en tu cuenta de OpenAI.';
      }
      if (
        joinedLower.includes('límite alcanzado') ||
        joinedLower.includes('limit reached') ||
        /maximo de \d+ minutos/.test(joinedLower)
      ) {
        return 'Ya alcanzaste el límite de tiempo de la entrevista en llamada.';
      }
      if (joinedLower.includes('ya usaste tu única llamada') || joinedLower.includes('ya fue completada')) {
        return 'Esta entrevista ya fue completada y no admite otra llamada.';
      }
    }

    if (context === 'auth.resetPassword') {
      if (error.status === 400 || code === 'bad_request') {
        return 'El enlace de recuperación expiró o ya fue usado. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".';
      }
    }

    if (error.status === 401 || code === 'unauthorized') {
      return context === 'auth.login'
        ? 'Credenciales inválidas. Revisa tu correo y contraseña.'
        : 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    }

    if (error.status === 409 || code === 'conflict' || joinedLower.includes('already exists')) {
      return context === 'auth.register'
        ? 'Ya existe una cuenta con ese correo.'
        : 'Este recurso ya existe y no se pudo completar la operación.';
    }

    if (error.status === 429 || code === 'rate_limited') {
      return 'Hay demasiadas solicitudes en este momento. Intenta nuevamente en unos segundos.';
    }

    if (error.status === 413 || joinedLower.includes('payload too large')) {
      return 'El archivo es demasiado grande para procesarlo. Sube uno más liviano o divídelo en partes.';
    }

    if (error.status === 422 || code === 'validation_error') {
      if (context === 'intake.submit') {
        const explicit = toIntakeValidationMessage(error.detail);
        if (explicit) return explicit;
      }
      return 'Algunos datos no son válidos. Revisa la información e inténtalo otra vez.';
    }

    if (error.status === 403 || code === 'forbidden') {
      if (code === 'account_pending_approval') {
        return 'Tu cuenta está pendiente de aprobación. Te avisaremos por correo cuando esté lista.';
      }
      if (code === 'account_rejected') {
        return 'Tu cuenta no fue aprobada todavía. Escríbenos para revisar tu solicitud.';
      }
      if (context === 'interview.voice' && joinedLower.includes('realtime voice is not configured')) {
        return 'La llamada en tiempo real no está configurada en este entorno.';
      }
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
    if (
      context === 'auth.login' &&
      (msg.includes('invalid credentials') || msg.includes('credenciales inválidas'))
    ) {
      return 'Credenciales inválidas. Revisa tu correo y contraseña.';
    }
    if (
      context === 'auth.register' &&
      (msg.includes('already exists') || msg.includes('ya existe'))
    ) {
      return 'Ya existe una cuenta con ese correo.';
    }
    if (
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed')
    ) {
      return 'No pude conectar con el servidor. Revisa la conexión o recarga la página.';
    }
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
