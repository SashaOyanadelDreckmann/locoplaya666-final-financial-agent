export type PanelIntroCardMeta = {
  key: string;
  label: string;
  caption: string;
};

export const PANEL_INTRO_CARD_ORDER: PanelIntroCardMeta[] = [
  {
    key: 'profile',
    label: 'Perfil',
    caption: 'Quién eres y desde dónde partimos.',
  },
  {
    key: 'objective',
    label: 'Objetivo',
    caption: 'La prioridad que ordena cada paso.',
  },
  {
    key: 'mode',
    label: 'Modo cognitivo',
    caption: 'Tono, foco y profundidad del agente.',
  },
  {
    key: 'transactions',
    label: 'Transacciones',
    caption: 'Productos, cartolas y movimientos del mes.',
  },
  {
    key: 'budget',
    label: 'Presupuesto',
    caption: 'Ingreso, gasto y margen real.',
  },
  {
    key: 'interview',
    label: 'Entrevista',
    caption: 'Diagnóstico profundo al completar el camino.',
  },
  {
    key: 'news',
    label: 'Noticias',
    caption: 'Señales de mercado y macro al día.',
  },
  {
    key: 'library',
    label: 'Biblioteca',
    caption: 'PDFs organizados por tipo de entrega.',
  },
  {
    key: 'recents',
    label: 'Recientes',
    caption: 'Lo último guardado desde el chat.',
  },
];
