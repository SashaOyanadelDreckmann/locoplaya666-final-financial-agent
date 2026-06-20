import { FINANCIAL_SERVICE_OPTIONS } from '@/lib/compartido/financialCatalog';
import type { BankProduct } from './types';

export const CHILEAN_PRODUCT_TEMPLATES: Array<{
  label: string;
  productType: BankProduct['productType'];
}> = [
  { label: 'Cuenta corriente', productType: 'checking_account' },
  { label: 'Cuenta vista', productType: 'debit_account' },
  { label: 'Cuenta RUT', productType: 'debit_account' },
  { label: 'Tarjeta de débito', productType: 'debit_account' },
  { label: 'Tarjeta de crédito', productType: 'credit_card' },
  { label: 'Línea de crédito', productType: 'consumer_loan' },
  { label: 'Crédito de consumo', productType: 'consumer_loan' },
  { label: 'Crédito automotriz', productType: 'consumer_loan' },
  { label: 'Crédito hipotecario', productType: 'mortgage' },
  { label: 'Cuenta de ahorro', productType: 'savings_account' },
  { label: 'Depósito a plazo', productType: 'savings_account' },
  { label: 'Fondo mutuo', productType: 'investment_account' },
  { label: 'Cuenta 2 / ahorro previsional voluntario', productType: 'investment_account' },
  { label: 'APV', productType: 'investment_account' },
  { label: 'Cuenta de inversión / brokerage', productType: 'investment_account' },
  { label: 'Billetera prepago', productType: 'debit_account' },
  { label: 'Cuenta empresa / pyme', productType: 'checking_account' },
  { label: 'POS / adquirencia comercio', productType: 'checking_account' },
  { label: 'Remesas / cuenta global', productType: 'debit_account' },
  { label: 'Seguros', productType: 'investment_account' },
  { label: 'Acciones / ETF', productType: 'investment_account' },
] as const;

function mapServiceToProductType(serviceId: string): BankProduct['productType'] {
  if (serviceId === 'credit-card') return 'credit_card';
  if (serviceId === 'debit-card' || serviceId === 'vista-account') return 'debit_account';
  if (serviceId === 'checking-account') return 'checking_account';
  if (serviceId === 'consumer-loan' || serviceId === 'line-of-credit' || serviceId === 'auto-loan') return 'consumer_loan';
  if (serviceId === 'mortgage-loan') return 'mortgage';
  if (serviceId === 'term-deposit') return 'savings_account';
  return 'investment_account';
}

export const SERVICE_TEMPLATES = FINANCIAL_SERVICE_OPTIONS.map((service) => ({
  label: service.label,
  productType: mapServiceToProductType(service.id),
}));

export const ALL_PRODUCT_TEMPLATES: Array<{
  label: string;
  productType: BankProduct['productType'];
}> = [...CHILEAN_PRODUCT_TEMPLATES, ...SERVICE_TEMPLATES].filter(
  (item, idx, arr) => arr.findIndex((other) => other.label.toLowerCase() === item.label.toLowerCase()) === idx
);

export const TX_CATEGORY_OPTIONS = [
  'Supermercado',
  'Delivery',
  'Comida rapida',
  'Restaurantes y Cafe',
  'Retail y Marketplace',
  'Hogar y Mejoramiento',
  'Telecomunicaciones',
  'Servicios Basicos',
  'Combustible y Estacion',
  'Transporte y Movilidad',
  'Autopistas y Peajes',
  'Farmacia y Salud',
  'Educacion',
  'Viajes y Turismo',
  'Entretenimiento y Suscripciones',
  'Gobierno e Impuestos',
  'Seguros',
  'Mascotas',
  'Transferencias',
  'Cajero y Giro',
  'Servicios Financieros',
  'Consumo general',
] as const;
export const TX_MAX_SINGLE_FILE_BYTES = 120 * 1024 * 1024;
/** Must stay aligned with API DOCUMENT_PARSE_MAX_TOTAL_BYTES and Express JSON limit (~170 MB). */
export const TX_MAX_TOTAL_FILE_BYTES = 120 * 1024 * 1024;
export const PRODUCT_STACK_PALETTE = [
  '#3b5068',
  '#6e2929',
  '#9e7228',
  '#364818',
  '#4a3d6e',
  '#2d5c5a',
  '#6b4a2e',
] as const;
export const PRODUCT_STACK_TEXT_PALETTE = [
  '#8ea7bf',
  '#c89191',
  '#d8b266',
  '#86a06f',
  '#b8a8d8',
  '#7ec4c0',
  '#d4b08a',
] as const;
