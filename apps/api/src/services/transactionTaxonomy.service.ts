type MerchantRule = {
  merchant: string;
  category: string;
  confidence: number;
  aliases: string[];
};

export type TransactionTaxonomy = {
  category: string;
  merchant?: string;
  categoryConfidence: number;
};

type CategoryRule = {
  category: string;
  confidence: number;
  keywords: string[];
};

const MERCHANT_RULES: MerchantRule[] = [
  { merchant: 'PedidosYa', category: 'Delivery', confidence: 0.995, aliases: ['pedidos ya', 'pedidosya'] },
  { merchant: 'Rappi', category: 'Delivery', confidence: 0.995, aliases: ['rappi'] },
  { merchant: 'Uber Eats', category: 'Delivery', confidence: 0.995, aliases: ['uber eats', 'ubereats'] },
  { merchant: 'Cornershop', category: 'Delivery', confidence: 0.99, aliases: ['cornershop'] },
  { merchant: 'Didi Food', category: 'Delivery', confidence: 0.99, aliases: ['didi food', 'didifood'] },

  { merchant: 'Ekono', category: 'Supermercado', confidence: 0.995, aliases: ['ekono'] },
  { merchant: 'Santa Isabel', category: 'Supermercado', confidence: 0.995, aliases: ['santa isabel'] },
  { merchant: 'Lider', category: 'Supermercado', confidence: 0.992, aliases: ['lider', 'lider express', 'express de lider'] },
  { merchant: 'Jumbo', category: 'Supermercado', confidence: 0.992, aliases: ['jumbo'] },
  { merchant: 'Unimarc', category: 'Supermercado', confidence: 0.992, aliases: ['unimarc'] },
  { merchant: 'Tottus', category: 'Supermercado', confidence: 0.992, aliases: ['tottus'] },
  { merchant: 'Acuenta', category: 'Supermercado', confidence: 0.992, aliases: ['acuenta', 'a cuenta', 'superbodega a cuenta'] },
  { merchant: 'Mayorista 10', category: 'Supermercado', confidence: 0.992, aliases: ['mayorista 10'] },
  { merchant: 'Alvi', category: 'Supermercado', confidence: 0.992, aliases: ['alvi'] },

  { merchant: 'Sodimac', category: 'Hogar y Mejoramiento', confidence: 0.992, aliases: ['sodimac', 'homecenter'] },
  { merchant: 'Easy', category: 'Hogar y Mejoramiento', confidence: 0.99, aliases: ['easy'] },
  { merchant: 'Construmart', category: 'Hogar y Mejoramiento', confidence: 0.99, aliases: ['construmart'] },
  { merchant: 'Casaideas', category: 'Hogar y Mejoramiento', confidence: 0.985, aliases: ['casaideas', 'casa ideas'] },
  { merchant: 'IKEA', category: 'Hogar y Mejoramiento', confidence: 0.985, aliases: ['ikea'] },

  { merchant: 'Falabella', category: 'Retail y Marketplace', confidence: 0.988, aliases: ['falabella', 'cmr falabella', 'cmr'] },
  { merchant: 'Ripley', category: 'Retail y Marketplace', confidence: 0.988, aliases: ['ripley'] },
  { merchant: 'Paris', category: 'Retail y Marketplace', confidence: 0.988, aliases: ['paris'] },
  { merchant: 'La Polar', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['la polar'] },
  { merchant: 'Hites', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['hites'] },
  { merchant: 'Abcdin', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['abcdin', 'abc din'] },
  { merchant: 'Mercado Libre', category: 'Retail y Marketplace', confidence: 0.992, aliases: ['mercado libre', 'mercadolibre'] },
  { merchant: 'Shein', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['shein'] },
  { merchant: 'Temu', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['temu'] },
  { merchant: 'Amazon', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['amazon'] },
  { merchant: 'AliExpress', category: 'Retail y Marketplace', confidence: 0.984, aliases: ['aliexpress', 'ali express'] },

  { merchant: 'McDonalds', category: 'Comida rapida', confidence: 0.992, aliases: ['mcdonalds', 'mcdonald s'] },
  { merchant: 'Burger King', category: 'Comida rapida', confidence: 0.992, aliases: ['burger king'] },
  { merchant: 'KFC', category: 'Comida rapida', confidence: 0.992, aliases: ['kfc'] },
  { merchant: 'Subway', category: 'Comida rapida', confidence: 0.99, aliases: ['subway'] },
  { merchant: 'Papa Johns', category: 'Comida rapida', confidence: 0.99, aliases: ['papa johns', 'papajohns'] },
  { merchant: 'Dominos', category: 'Comida rapida', confidence: 0.99, aliases: ['dominos', 'domino s'] },
  { merchant: 'Doggis', category: 'Comida rapida', confidence: 0.99, aliases: ['doggis'] },

  { merchant: 'Starbucks', category: 'Restaurantes y Cafe', confidence: 0.992, aliases: ['starbucks'] },
  { merchant: 'Juan Valdez', category: 'Restaurantes y Cafe', confidence: 0.985, aliases: ['juan valdez'] },
  { merchant: 'Dunkin', category: 'Restaurantes y Cafe', confidence: 0.985, aliases: ['dunkin'] },

  { merchant: 'Movistar', category: 'Telecomunicaciones', confidence: 0.995, aliases: ['movistar'] },
  { merchant: 'Entel', category: 'Telecomunicaciones', confidence: 0.995, aliases: ['entel'] },
  { merchant: 'Claro', category: 'Telecomunicaciones', confidence: 0.995, aliases: ['claro'] },
  { merchant: 'WOM', category: 'Telecomunicaciones', confidence: 0.995, aliases: ['wom'] },
  { merchant: 'VTR', category: 'Telecomunicaciones', confidence: 0.99, aliases: ['vtr'] },
  { merchant: 'Mundo', category: 'Telecomunicaciones', confidence: 0.985, aliases: ['mundo pacifico', 'mundo'] },
  { merchant: 'GTD', category: 'Telecomunicaciones', confidence: 0.985, aliases: ['gtd'] },
  { merchant: 'Telsur', category: 'Telecomunicaciones', confidence: 0.985, aliases: ['telsur'] },

  { merchant: 'Aguas Andinas', category: 'Servicios Basicos', confidence: 0.995, aliases: ['aguas andinas'] },
  { merchant: 'Essbio', category: 'Servicios Basicos', confidence: 0.99, aliases: ['essbio'] },
  { merchant: 'Esval', category: 'Servicios Basicos', confidence: 0.99, aliases: ['esval'] },
  { merchant: 'Enel', category: 'Servicios Basicos', confidence: 0.995, aliases: ['enel'] },
  { merchant: 'CGE', category: 'Servicios Basicos', confidence: 0.99, aliases: ['cge'] },
  { merchant: 'Saesa', category: 'Servicios Basicos', confidence: 0.99, aliases: ['saesa'] },
  { merchant: 'Lipigas', category: 'Servicios Basicos', confidence: 0.99, aliases: ['lipigas'] },
  { merchant: 'Metrogas', category: 'Servicios Basicos', confidence: 0.99, aliases: ['metrogas'] },
  { merchant: 'Abastible', category: 'Servicios Basicos', confidence: 0.99, aliases: ['abastible'] },

  { merchant: 'Copec', category: 'Combustible y Estacion', confidence: 0.994, aliases: ['copec'] },
  { merchant: 'Shell', category: 'Combustible y Estacion', confidence: 0.994, aliases: ['shell'] },
  { merchant: 'Petrobras', category: 'Combustible y Estacion', confidence: 0.99, aliases: ['petrobras'] },
  { merchant: 'Aramco', category: 'Combustible y Estacion', confidence: 0.99, aliases: ['aramco'] },

  { merchant: 'Uber', category: 'Transporte y Movilidad', confidence: 0.99, aliases: ['uber'] },
  { merchant: 'Cabify', category: 'Transporte y Movilidad', confidence: 0.99, aliases: ['cabify'] },
  { merchant: 'Metro', category: 'Transporte y Movilidad', confidence: 0.985, aliases: ['metro de santiago', 'metro'] },
  { merchant: 'Autopista Central', category: 'Autopistas y Peajes', confidence: 0.99, aliases: ['autopista central'] },
  { merchant: 'Costanera Norte', category: 'Autopistas y Peajes', confidence: 0.99, aliases: ['costanera norte'] },
  { merchant: 'Vespucio Norte', category: 'Autopistas y Peajes', confidence: 0.99, aliases: ['vespucio norte'] },
  { merchant: 'Vespucio Sur', category: 'Autopistas y Peajes', confidence: 0.99, aliases: ['vespucio sur'] },
  { merchant: 'TAG', category: 'Autopistas y Peajes', confidence: 0.98, aliases: ['tag'] },

  { merchant: 'Cruz Verde', category: 'Farmacia y Salud', confidence: 0.994, aliases: ['cruz verde'] },
  { merchant: 'Salcobrand', category: 'Farmacia y Salud', confidence: 0.994, aliases: ['salcobrand'] },
  { merchant: 'Ahumada', category: 'Farmacia y Salud', confidence: 0.994, aliases: ['farmacias ahumada', 'ahumada'] },
  { merchant: 'RedSalud', category: 'Farmacia y Salud', confidence: 0.988, aliases: ['redsalud', 'red salud'] },
  { merchant: 'IntegraMedica', category: 'Farmacia y Salud', confidence: 0.988, aliases: ['integramedica', 'integra medica'] },
  { merchant: 'Clinica Alemana', category: 'Farmacia y Salud', confidence: 0.988, aliases: ['clinica alemana'] },
  { merchant: 'Clinica Santa Maria', category: 'Farmacia y Salud', confidence: 0.988, aliases: ['clinica santa maria'] },
  { merchant: 'UC Christus', category: 'Farmacia y Salud', confidence: 0.988, aliases: ['uc christus'] },

  { merchant: 'Netflix', category: 'Entretenimiento y Suscripciones', confidence: 0.992, aliases: ['netflix'] },
  { merchant: 'Spotify', category: 'Entretenimiento y Suscripciones', confidence: 0.992, aliases: ['spotify'] },
  { merchant: 'YouTube', category: 'Entretenimiento y Suscripciones', confidence: 0.992, aliases: ['youtube', 'youtube premium'] },
  { merchant: 'Google', category: 'Entretenimiento y Suscripciones', confidence: 0.985, aliases: ['google'] },
  { merchant: 'Apple', category: 'Entretenimiento y Suscripciones', confidence: 0.985, aliases: ['apple', 'itunes', 'icloud'] },
  { merchant: 'Disney+', category: 'Entretenimiento y Suscripciones', confidence: 0.985, aliases: ['disney plus', 'disney+'] },
  { merchant: 'LATAM', category: 'Viajes y Turismo', confidence: 0.992, aliases: ['latam'] },
  { merchant: 'Sky Airline', category: 'Viajes y Turismo', confidence: 0.988, aliases: ['sky airline', 'sky'] },
  { merchant: 'JetSMART', category: 'Viajes y Turismo', confidence: 0.988, aliases: ['jetsmart', 'jet smart'] },
  { merchant: 'Booking', category: 'Viajes y Turismo', confidence: 0.988, aliases: ['booking'] },
  { merchant: 'Airbnb', category: 'Viajes y Turismo', confidence: 0.988, aliases: ['airbnb'] },
  { merchant: 'SII', category: 'Gobierno e Impuestos', confidence: 0.992, aliases: ['sii', 'servicio de impuestos internos'] },
  { merchant: 'Tesoreria General', category: 'Gobierno e Impuestos', confidence: 0.992, aliases: ['tesoreria general', 'tesoreria gral'] },
  { merchant: 'Municipalidad', category: 'Gobierno e Impuestos', confidence: 0.982, aliases: ['municipalidad'] },
];

const CATEGORY_RULES: CategoryRule[] = [
  { category: 'Delivery', confidence: 0.95, keywords: ['delivery', 'pedidos ya', 'pedidosya', 'rappi', 'uber eats', 'cornershop', 'didifood', 'didi food'] },
  { category: 'Supermercado', confidence: 0.95, keywords: ['supermercado', 'supermercad', 'jumbo', 'lider', 'unimarc', 'tottus', 'santa isabel', 'ekono', 'acuenta', 'mayorista 10', 'alvi', 'feria libre'] },
  { category: 'Comida rapida', confidence: 0.93, keywords: ['mcdonalds', 'burger king', 'kfc', 'subway', 'dominos', 'papa johns', 'doggis', 'pizza hut'] },
  { category: 'Restaurantes y Cafe', confidence: 0.9, keywords: ['restaurant', 'restaurante', 'cafeteria', 'cafe', 'bar', 'pub', 'sushi', 'sandwicheria', 'fuente de soda', 'starbucks', 'dunkin'] },
  { category: 'Farmacia y Salud', confidence: 0.93, keywords: ['farmacia', 'clinica', 'isapre', 'fonasa', 'medico', 'hospital', 'dental', 'laboratorio', 'cruz verde', 'salcobrand', 'ahumada'] },
  { category: 'Hogar y Mejoramiento', confidence: 0.91, keywords: ['sodimac', 'homecenter', 'easy', 'construmart', 'ferreteria', 'mueble', 'decoracion', 'hogar', 'ikea', 'casaideas'] },
  { category: 'Retail y Marketplace', confidence: 0.9, keywords: ['falabella', 'ripley', 'paris', 'hites', 'la polar', 'abcdin', 'mercadolibre', 'mercado libre', 'shein', 'temu', 'amazon', 'aliexpress', 'marketplace', 'tienda online'] },
  { category: 'Telecomunicaciones', confidence: 0.94, keywords: ['movistar', 'entel', 'claro', 'wom', 'vtr', 'gtd', 'telsur', 'recarga', 'prepago', 'fibra', 'internet hogar', 'telefonia'] },
  { category: 'Servicios Basicos', confidence: 0.92, keywords: ['agua', 'electricidad', 'energia', 'gas', 'servicio basico', 'alcantarillado', 'condominio', 'gasto comun', 'enel', 'aguas andinas', 'metrogas', 'lipigas', 'abastible'] },
  { category: 'Combustible y Estacion', confidence: 0.94, keywords: ['copec', 'shell', 'petrobras', 'aramco', 'bencina', 'combustible', 'estacion de servicio'] },
  { category: 'Transporte y Movilidad', confidence: 0.93, keywords: ['uber', 'cabify', 'metro', 'bip', 'red movilidad', 'peaje', 'autopista', 'tag', 'taxi', 'bus'] },
  { category: 'Autopistas y Peajes', confidence: 0.93, keywords: ['autopista', 'peaje', 'tag', 'costanera norte', 'autopista central', 'vespucio'] },
  { category: 'Entretenimiento y Suscripciones', confidence: 0.91, keywords: ['spotify', 'netflix', 'youtube', 'apple', 'google', 'prime video', 'disney', 'max', 'suscripcion', 'subscription', 'membresia'] },
  { category: 'Educacion', confidence: 0.92, keywords: ['colegio', 'universidad', 'matricula', 'escuela', 'instituto', 'curso', 'capacitacion', 'preuniversitario'] },
  { category: 'Viajes y Turismo', confidence: 0.9, keywords: ['hotel', 'booking', 'airbnb', 'latam', 'sky airline', 'jetsmart', 'pasaje', 'turismo'] },
  { category: 'Seguros', confidence: 0.91, keywords: ['seguro', 'aseguradora', 'prima', 'soap'] },
  { category: 'Gobierno e Impuestos', confidence: 0.92, keywords: ['tesoreria', 'sii', 'municipalidad', 'permiso de circulacion', 'contribuciones', 'patente', 'registro civil'] },
  { category: 'Mascotas', confidence: 0.9, keywords: ['veterinaria', 'veterinario', 'pet', 'mascota', 'petshop'] },
  { category: 'Transferencias', confidence: 0.9, keywords: ['transferencia', 'tef', 'deposito', 'abono', 'pago recibido', 'envio de dinero'] },
  { category: 'Cajero y Giro', confidence: 0.9, keywords: ['cajero', 'atm', 'giro', 'retiro efectivo', 'retiro cajero'] },
  { category: 'Servicios Financieros', confidence: 0.88, keywords: ['comision', 'interes', 'mantencion', 'avance', 'tarjeta de credito', 'pago tarjeta', 'cuota tarjeta', 'cuota', 'gasto bancario'] },
];

const CATEGORY_RULES_WITH_PATTERNS = CATEGORY_RULES.map((rule) => ({
  ...rule,
  patterns: rule.keywords.map(buildLoosePattern),
}));

const MERCHANT_RULES_WITH_PATTERNS = MERCHANT_RULES.map((rule) => ({
  ...rule,
  patterns: rule.aliases.map(buildLoosePattern),
}));

function normalizeDescription(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLoosePattern(alias: string): RegExp {
  const normalized = normalizeDescription(alias)
    .split(' ')
    .filter(Boolean)
    .join('\\s*');
  return new RegExp(`\\b${normalized}\\b`, 'i');
}

function fallbackMerchant(normalized: string): string | undefined {
  if (!normalized) return undefined;
  const cleaned = normalized
    .replace(/\b(compra|pago|cargo|abono|transferencia|transfer|debito|credito|webpay|pos|pac|pat|tef|nacional|internacional|trx|visa|mastercard|tarjeta|cuota|cuotas|sucursal|chile|cl|www|com)\b/g, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean).slice(0, 4);
  if (tokens.length === 0) return undefined;
  const merchant = tokens.join(' ').trim().toUpperCase();
  return merchant.length >= 4 ? merchant : undefined;
}

function inferScoredCategory(normalized: string): { category: string; confidence: number } | null {
  let best: { category: string; confidence: number; score: number } | null = null;
  for (const rule of CATEGORY_RULES_WITH_PATTERNS) {
    const score = rule.patterns.reduce((acc, pattern) => acc + (pattern.test(normalized) ? 1 : 0), 0);
    if (score === 0) continue;
    const weightedConfidence = Math.min(0.97, rule.confidence + Math.min(0.04, score * 0.01));
    if (!best || score > best.score || (score === best.score && weightedConfidence > best.confidence)) {
      best = { category: rule.category, confidence: weightedConfidence, score };
    }
  }
  return best ? { category: best.category, confidence: best.confidence } : null;
}

export function inferTransactionTaxonomy(description: string): TransactionTaxonomy {
  const normalized = normalizeDescription(description);

  for (const rule of MERCHANT_RULES_WITH_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        category: rule.category,
        merchant: rule.merchant,
        categoryConfidence: rule.confidence,
      };
    }
  }

  for (const rule of CATEGORY_RULES_WITH_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        category: rule.category,
        merchant: fallbackMerchant(normalized),
        categoryConfidence: rule.confidence,
      };
    }
  }

  const scoredCategory = inferScoredCategory(normalized);
  if (scoredCategory) {
    return {
      category: scoredCategory.category,
      merchant: fallbackMerchant(normalized),
      categoryConfidence: scoredCategory.confidence,
    };
  }

  return {
    category: 'Consumo general',
    merchant: fallbackMerchant(normalized),
    categoryConfidence: 0.56,
  };
}
