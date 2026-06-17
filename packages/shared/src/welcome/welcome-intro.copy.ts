/** Slide II — marco de trabajo (texto fijo de tesis). */
export const WELCOME_MARCO_DEFAULT_BODY =
  'Este es el proyecto de Tesis de Sasha Oyanadel Dreckmann para el doble grado de Ingeniería Civil Industrial y Magíster en Ciencia de los Datos, el agente convierte información financiera dispersa en un diagnóstico claro, verificable y accionable. Evidencia real primero; recomendaciones después.';

/** Slide III — simulación / estudio (no Open Finance oficial). */
export const WELCOME_FINTECH_SLIDE_LABEL = 'Simulación · estudio de utilidad';

export const WELCOME_FINTECH_SIMULATION_BADGE = 'No es una aplicación oficial de la Ley Fintech';

export const WELCOME_FINTECH_SIMULATION_LEAD =
  'Estamos estudiando, con tu consentimiento, qué tan útil sería un sistema que integre cartolas, productos y presupuesto en un solo lugar — aprovechando el marco que habilita la Ley Fintech (N° 21.521), pero sin operar como finanzas abiertas reguladas.';

export const WELCOME_FINTECH_SIMULATION_CONTEXT =
  'La ley define consentimiento, trazabilidad y control sobre tus datos; aquí simulamos ese potencial para medir claridad, flujo y valor antes de cualquier despliegue real.';

export const WELCOME_FINTECH_SIMULATION_DISCLAIMER =
  'Importante: Financieramente no conecta con bancos ni proveedores de Open Finance de forma oficial. Es un entorno de prueba para evaluar utilidad y experiencia — no un servicio regulado ni una implementación vigente de la norma.';

export const WELCOME_FINTECH_DEFAULT_TITLE = 'Simulación inspirada en finanzas abiertas';

export const WELCOME_FINTECH_DEFAULT_BODY =
  'Exploramos cómo se vería integrar tu información financiera dispersa cuando tú autorizas qué compartir y con qué trazabilidad — en el espíritu de la Ley Fintech (N° 21.521), pero en modo simulación.';

export const WELCOME_FINTECH_DEFAULT_BENEFIT =
  'El objetivo del estudio es medir si unificar evidencia real mejora decisiones; no estamos aplicando la ley de forma oficial ni operando como intermediario regulado.';

/** Slide IV — qué viene después del flujo en chat 1. */
export const WELCOME_RUTA_NEXT_HEADING = 'Después del diagnóstico';

export const WELCOME_RUTA_UNLOCK_INTRO =
  'Al cerrar intake, cartolas, presupuesto y entrevista, se desbloquean dos chats — cada uno con un rol distinto:';

export const WELCOME_RUTA_UNLOCK_CHATS = [
  {
    id: 'chat-2' as const,
    badge: 'Chat 2',
    title: 'Estrategia · plan de acción',
    body:
      'Lluvia de ideas → convergencia → plan ejecutivo con prioridades concretas (caja, deuda, ahorro, inversión), cruzando tu diagnóstico, presupuesto y señales del mercado.',
  },
  {
    id: 'chat-3' as const,
    badge: 'Chat 3',
    title: 'Conciencia social',
    body:
      'Reflexión filosófica sobre lo que tus decisiones financieras revelan — propósito, responsabilidad social y prudencia normativa, más allá de los números.',
  },
] as const;
