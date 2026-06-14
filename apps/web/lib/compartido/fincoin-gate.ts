export const FINCOIN_SPEND_BLOCKED_MESSAGE =
  'Tus Fincoins se agotaron. El agente quedó en pausa: no se procesan nuevas solicitudes con costo.';

export const FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE =
  'Sin Fincoins no puedes abrir herramientas que consumen IA (presupuesto, transacciones, entrevista por voz ni adjuntos con análisis).';

export function isFincoinSpendBlocked(depleted: boolean): boolean {
  return Boolean(depleted);
}
