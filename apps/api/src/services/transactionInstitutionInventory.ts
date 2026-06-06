import fs from 'fs';
import path from 'path';

export type TransactionInstitutionInventory = {
  updatedAt?: string;
  scope?: string;
  families: string[];
  commonFields: string[];
  institutions: Array<{
    name: string;
    products: string[];
    documentPatterns: string[];
  }>;
  heuristics: Array<{
    signal: string;
    classification: string;
  }>;
};

const INVENTORY_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), 'rag_data/cartolas-chile/inventario-instituciones.json'),
  path.resolve(process.cwd(), '..', '..', 'rag_data/cartolas-chile/inventario-instituciones.json'),
  path.resolve(__dirname, '../../../../rag_data/cartolas-chile/inventario-instituciones.json'),
];

let cachedInventory: TransactionInstitutionInventory | null = null;

export function normalizeInventoryText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveInventoryPath(): string | null {
  for (const candidate of INVENTORY_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadTransactionInstitutionInventory(): TransactionInstitutionInventory | null {
  if (cachedInventory) return cachedInventory;
  const inventoryPath = resolveInventoryPath();
  if (!inventoryPath) return null;
  try {
    const raw = fs.readFileSync(inventoryPath, 'utf8');
    const parsed = JSON.parse(raw) as TransactionInstitutionInventory;
    if (!parsed || !Array.isArray(parsed.institutions)) return null;
    cachedInventory = parsed;
    return cachedInventory;
  } catch {
    return null;
  }
}

export function getTransactionInstitutionInventorySummary() {
  const inventory = loadTransactionInstitutionInventory();
  return {
    families: inventory?.families ?? [],
    commonFields: inventory?.commonFields ?? [],
    institutions: inventory?.institutions ?? [],
    heuristics: inventory?.heuristics ?? [],
  };
}
