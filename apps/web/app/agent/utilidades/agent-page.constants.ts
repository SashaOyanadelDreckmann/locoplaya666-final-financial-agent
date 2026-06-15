import type { BankProduct, TransactionTaxonomyOverride } from '../modales/transacciones/types';

export const CHAT_GAME_INSTRUCTION =
  'Para aprovechar al maximo este juego: 1) define un objetivo financiero concreto, 2) usa los 3 chats en paralelo para explorar escenarios, 3) pide primero grafico o simulacion y luego exporta con Guardar PDF si quieres archivo, 4) guarda documentos clave para compararlos, 5) ajusta riesgo, plazo y aporte en cada iteracion para subir tu nivel de conocimiento.';

export const FALLBACK_WELCOME =
  'Ya tengo una lectura inicial de tu situación. Podemos partir por ordenar el flujo, revisar riesgos y definir el primer movimiento útil.';

export const PRIMARY_CHAT_ID = 'chat-1';
export const POST_DIAGNOSIS_CHAT_IDS = ['chat-1', 'chat-2', 'chat-3'] as const;

export const MAX_TRANSACTION_PRODUCTS = 7;
export const MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL = 12;
export const MAX_EVIDENCE_FILES_PER_PRODUCT = 25;
/** Max evidence resets (re-analysis) allowed per product lifetime. */
export const MAX_TRANSACTION_EVIDENCE_RESETS = 3;
export const MAX_CHAT_UPLOAD_FILES = 5;

export const KNOWLEDGE_MILESTONE_DEFS = [
  { id: 'intake', label: 'Cuestionario y perfil base', threshold: 20 },
  { id: 'budget_base', label: 'Presupuesto personalizado', threshold: 40 },
  { id: 'budget_panel', label: 'Panel de presupuesto', threshold: 55 },
  { id: 'debt_analysis', label: 'Análisis de deuda', threshold: 70 },
  { id: 'transactions_panel', label: 'Panel de productos y transacciones', threshold: 74 },
  { id: 'advanced', label: 'Estrategias avanzadas', threshold: 85 },
  { id: 'expert', label: 'Nivel experto', threshold: 100 },
] as const;

export type BankSimulation = {
  products: BankProduct[];
  taxonomyOverrides: TransactionTaxonomyOverride[];
  activeProductId: string | null;
  lockedMonth: string | null;
  connected: boolean;
  randomMode: boolean;
  uploadedFiles: string[];
  parsedDocuments: BankProduct['parsedDocuments'];
  productsModuleSkipped?: boolean;
};

export const DEFAULT_BANK_SIMULATION: BankSimulation = {
  products: [],
  taxonomyOverrides: [],
  activeProductId: null,
  lockedMonth: null,
  connected: false,
  randomMode: false,
  uploadedFiles: [],
  parsedDocuments: [],
  productsModuleSkipped: false,
};
