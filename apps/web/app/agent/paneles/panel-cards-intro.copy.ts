export type PanelIntroCardMeta = {
  key: string;
  label: string;
  caption: string;
  tag?: string;
};

/** Fallback sizes when the hidden measurement grid has not laid out yet. */
export const PANEL_INTRO_CARD_SIZE_FALLBACKS: Record<string, { width: number; height: number }> = {
  profile: { width: 360, height: 148 },
  objective: { width: 360, height: 108 },
  mode: { width: 172, height: 128 },
  transactions: { width: 172, height: 118 },
  budget: { width: 360, height: 118 },
  interview: { width: 360, height: 132 },
  news: { width: 360, height: 148 },
  library: { width: 360, height: 168 },
  recents: { width: 360, height: 132 },
};

export const PANEL_INTRO_CARD_ORDER: PanelIntroCardMeta[] = [
  {
    key: 'profile',
    tag: 'Identidad',
    label: 'Perfil',
    caption: 'Tu contexto personal, privado y siempre visible.',
  },
  {
    key: 'objective',
    tag: 'Dirección',
    label: 'Objetivo',
    caption: 'La prioridad que ordena cada recomendación.',
  },
  {
    key: 'mode',
    tag: 'Cognición',
    label: 'Modo cognitivo',
    caption: 'Tono, foco y profundidad del agente.',
  },
  {
    key: 'transactions',
    tag: 'Flujo',
    label: 'Transacciones',
    caption: 'Productos, cartolas y movimientos del mes.',
  },
  {
    key: 'budget',
    tag: 'Balance',
    label: 'Presupuesto',
    caption: 'Ingreso, gasto y margen real.',
  },
  {
    key: 'interview',
    tag: 'Diagnóstico',
    label: 'Entrevista',
    caption: 'Llamada guiada para cerrar tu diagnóstico.',
  },
  {
    key: 'news',
    tag: 'Radar',
    label: 'Noticias',
    caption: 'Señales de mercado y macro al día.',
  },
  {
    key: 'library',
    tag: 'Archivo',
    label: 'Biblioteca',
    caption: 'PDFs que guardas desde el chat, por tipo.',
  },
  {
    key: 'recents',
    tag: 'Últimos',
    label: 'Recientes',
    caption: 'Lo último guardado desde el chat.',
  },
];
