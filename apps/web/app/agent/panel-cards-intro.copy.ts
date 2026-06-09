export type PanelIntroCardMeta = {
  key: string;
  label: string;
  caption: string;
  accent: string;
  image?: string;
};

export const PANEL_INTRO_CARD_ORDER: PanelIntroCardMeta[] = [
  {
    key: 'profile',
    label: 'Perfil',
    caption: 'Quién eres y desde dónde partimos.',
    accent: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
  },
  {
    key: 'objective',
    label: 'Objetivo',
    caption: 'La prioridad que ordena cada paso.',
    accent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
  {
    key: 'mode',
    label: 'Modo cognitivo',
    caption: 'Tono, foco y profundidad del agente.',
    accent: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
    image: '/IMG_3611.JPG',
  },
  {
    key: 'transactions',
    label: 'Transacciones',
    caption: 'Productos, cartolas y movimientos del mes.',
    accent: 'linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)',
  },
  {
    key: 'budget',
    label: 'Presupuesto',
    caption: 'Ingreso, gasto y margen real.',
    accent: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
  },
  {
    key: 'interview',
    label: 'Entrevista',
    caption: 'Diagnóstico profundo al completar el camino.',
    accent: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
  },
  {
    key: 'news',
    label: 'Noticias',
    caption: 'Señales de mercado y macro al día.',
    accent: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
    image: '/news-previeww.jpg',
  },
  {
    key: 'library',
    label: 'Biblioteca',
    caption: 'PDFs organizados por tipo de entrega.',
    accent: 'linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)',
  },
  {
    key: 'recents',
    label: 'Recientes',
    caption: 'Lo último guardado desde el chat.',
    accent: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)',
  },
];
