import { completeStructured } from './llm.service';
import {
  getTransactionInstitutionInventorySummary,
  loadTransactionInstitutionInventory,
  normalizeInventoryText,
} from './transactionInstitutionInventory';

export type TransactionDocumentProductType =
  | 'credit_card'
  | 'debit_account'
  | 'checking_account'
  | 'savings_account'
  | 'consumer_loan'
  | 'mortgage'
  | 'investment_account'
  | 'unknown';

export type TransactionDocumentProfile = {
  bank: string;
  product_type: TransactionDocumentProductType;
  format_family: string;
  header_map: Record<string, string>;
  sign_convention:
    | 'column_cargo_abono'
    | 'section_based'
    | 'keyword_overrides_amount_sign'
    | 'amount_sign_only'
    | 'unknown';
  needs_rag: boolean;
  confidence: number;
  evidence: string[];
};

type ProfileInput = {
  filename: string;
  text: string;
  tables?: Array<{ headers?: string[]; rows?: string[][] }>;
  parserMeta?: { mode?: string; confidence?: number } | null;
  productTypeHint?: string;
};

type InventoryProfileMatch = Partial<TransactionDocumentProfile> & {
  evidence: string[];
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(text: string, max = 1800): string {
  return normalize(text).slice(0, max);
}

function pickHeaders(input: ProfileInput): string[] {
  const first = input.tables?.find((table) => Array.isArray(table.headers) && table.headers.length > 0);
  return Array.isArray(first?.headers) ? first!.headers!.map((header) => String(header ?? '').trim()).filter(Boolean) : [];
}

function pickPreviewLines(text: string, maxLines = 24): string[] {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function normalizeProductType(value?: string): TransactionDocumentProductType {
  const source = normalize(value);
  if (!source) return 'unknown';
  if (/\bcredit|tarjeta\b/.test(source)) return 'credit_card';
  if (/\bchecking|cuenta corriente\b/.test(source)) return 'checking_account';
  if (/\bcuenta vista|\bdebito|\brut\b/.test(source)) return 'debit_account';
  if (/\bsavings|\bahorro\b/.test(source)) return 'savings_account';
  if (/\bmortgage|\bhipotec/.test(source)) return 'mortgage';
  if (/\bconsumer loan|\bconsumo|\blinea de credito|\blinea de cr[eé]dito/.test(source)) return 'consumer_loan';
  if (/\binvestment|\binversion|\bfondo|\betf/.test(source)) return 'investment_account';
  return 'unknown';
}

function normalizeProfileProductType(value?: string): TransactionDocumentProductType {
  const source = normalize(value);
  if (!source) return 'unknown';
  if (source.includes('credit_card') || source.includes('tarjeta_credito') || source.includes('tarjeta credito')) return 'credit_card';
  if (source.includes('checking_account') || source.includes('cuenta_corriente') || source.includes('cuenta corriente')) return 'checking_account';
  if (source.includes('debit_account') || source.includes('cuenta_vista') || source.includes('cuenta vista') || source.includes('cuenta_digital') || source.includes('cuenta digital')) {
    return 'debit_account';
  }
  if (source.includes('savings_account') || source.includes('cuenta_ahorro') || source.includes('cuenta ahorro')) return 'savings_account';
  if (source.includes('consumer_loan') || source.includes('linea_credito') || source.includes('linea de credito')) return 'consumer_loan';
  if (source.includes('mortgage')) return 'mortgage';
  if (source.includes('investment_account') || source.includes('ledger_fintech') || source.includes('cuenta_multimoneda')) return 'investment_account';
  return normalizeProductType(source);
}

function bankSlug(value: string): string {
  return normalize(value)
    .replace(/\b(banco|de|del|la|los|las|s\.a\.|s a|chile|cl)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeDocumentFamily(name: string): string {
  return normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
}

function buildInventoryProfileMatch(input: ProfileInput): InventoryProfileMatch | null {
  const inventory = loadTransactionInstitutionInventory();
  if (!inventory) return null;

  const searchable = normalizeInventoryText(
    [input.filename, input.text, ...(input.tables?.flatMap((table) => table.headers ?? []) ?? [])].join(' '),
  );
  const filename = normalizeInventoryText(input.filename);
  const hits: Array<{ bank: string; confidence: number; evidence: string[]; productType?: TransactionDocumentProductType; formatFamily?: string; signConvention?: TransactionDocumentProfile['sign_convention']; needsRag?: boolean }> = [];

  for (const institution of inventory.institutions) {
    const institutionName = normalizeInventoryText(institution.name);
    const nameHit = searchable.includes(institutionName) || filename.includes(institutionName);
    if (!nameHit) continue;

    const patternHits = institution.documentPatterns.filter((pattern) => {
      const normalizedPattern = normalizeInventoryText(pattern);
      return searchable.includes(normalizedPattern) || filename.includes(normalizedPattern);
    });
    const hasCardSignals =
      /monto minimo|fecha de pago|periodo facturado|cupo|compras|intereses|pago minimo/.test(searchable) ||
      /monto minimo|fecha de pago|periodo facturado|cupo|compras|intereses|pago minimo/.test(filename);
    const hasAccountSignals =
      /saldo y retenciones|saldo disponible|saldo contable|cargos|abonos|movimientos del periodo|total cargos|total abonos/.test(searchable) ||
      /saldo y retenciones|saldo disponible|saldo contable|cargos|abonos|movimientos del periodo|total cargos|total abonos/.test(filename);
    const hasLedgerSignals = /mt940|txt conciliacion|ledger|reporte de transacciones|settlement_net_amount/.test(searchable);
    const productTags = institution.products.map((item) => normalizeInventoryText(item));
    let productType: TransactionDocumentProfile['product_type'] = 'unknown';
    if (hasCardSignals) {
      productType = 'credit_card';
    } else if (hasLedgerSignals || productTags.some((tag) => tag.includes('cuenta_multimoneda') || tag.includes('ledger_fintech'))) {
      productType = 'investment_account';
    } else if (hasAccountSignals) {
      productType = 'checking_account';
    } else if (productTags.some((tag) => tag.includes('tarjeta_credito') || tag.includes('tarjeta credito'))) {
      productType = 'credit_card';
    } else if (productTags.some((tag) => tag.includes('cuenta_corriente'))) {
      productType = 'checking_account';
    } else if (productTags.some((tag) => tag.includes('cuenta_vista') || tag.includes('cuenta_digital'))) {
      productType = 'debit_account';
    } else if (productTags.some((tag) => tag.includes('cuenta_ahorro'))) {
      productType = 'savings_account';
    } else if (productTags.some((tag) => tag.includes('linea_credito'))) {
      productType = 'consumer_loan';
    }

    const bankSlugValue = bankSlug(institution.name) || 'institution';
    let formatFamily = `${bankSlugValue}_${productType === 'unknown' ? 'document' : productType}`;
    if (productType === 'credit_card') formatFamily = `${bankSlugValue}_estado_cuenta_tarjeta_credito`;
    if (productType === 'checking_account') formatFamily = `${bankSlugValue}_cartola_cuenta_corriente`;
    if (productType === 'debit_account') formatFamily = `${bankSlugValue}_cartola_cuenta_vista`;
    if (productType === 'investment_account') formatFamily = `${bankSlugValue}_ledger_fintech`;
    let signConvention: TransactionDocumentProfile['sign_convention'] = 'unknown';
    if (hasCardSignals) {
      signConvention = 'keyword_overrides_amount_sign';
    } else if (hasAccountSignals) {
      signConvention = 'column_cargo_abono';
    } else if (hasLedgerSignals || patternHits.some((pattern) => /mt940|txt|ledger|conciliacion|reporte de transacciones/i.test(pattern))) {
      signConvention = 'amount_sign_only';
    }

    const evidence = [
      `inventory:institution:${institution.name}`,
      ...patternHits.slice(0, 4).map((pattern) => `inventory:pattern:${pattern}`),
    ];
    const signalHits = Number(hasCardSignals) + Number(hasAccountSignals) + Number(hasLedgerSignals);
    const confidence = Math.min(0.96, 0.68 + patternHits.length * 0.05 + signalHits * 0.1 + (productType !== 'unknown' ? 0.08 : 0));
    hits.push({
      bank: institution.name,
      confidence,
      evidence,
      productType,
      formatFamily,
      signConvention,
      needsRag: confidence < 0.9 && patternHits.length < 2,
    });
  }

  if (hits.length === 0) {
    const heuristics = inventory.heuristics ?? [];
    for (const heuristic of heuristics) {
      const signal = normalizeInventoryText(heuristic.signal);
      if (!signal) continue;
      if (!searchable.includes(signal) && !filename.includes(signal)) continue;
      const classification = normalizeInventoryText(heuristic.classification);
      const productType =
        classification.includes('estado_tarjeta_credito')
          ? 'credit_card'
          : classification.includes('cartola_cuenta_corriente')
            ? 'checking_account'
            : classification.includes('cartola_cuenta')
              ? 'debit_account'
              : classification.includes('ledger_estructurado')
                ? 'investment_account'
                : 'unknown';
      return {
        bank: 'unknown',
        product_type: productType,
        format_family: normalizeDocumentFamily(classification),
        sign_convention:
          classification.includes('estado_tarjeta_credito')
            ? 'keyword_overrides_amount_sign'
            : classification.includes('cartola_cuenta_corriente')
              ? 'column_cargo_abono'
              : classification.includes('ledger_estructurado')
                ? 'amount_sign_only'
                : 'unknown',
        needs_rag: productType === 'unknown',
        confidence: 0.68,
        evidence: [`inventory:heuristic:${heuristic.signal}`],
      };
    }
    return null;
  }

  hits.sort((left, right) => right.confidence - left.confidence);
  const best = hits[0];
  if (!best) return null;

  return {
    bank: best.bank,
    product_type: best.productType ?? 'unknown',
    format_family: best.formatFamily ?? 'generic_document',
    header_map: {},
    sign_convention: best.signConvention ?? 'unknown',
    needs_rag: Boolean(best.needsRag),
    confidence: best.confidence,
    evidence: best.evidence,
  };
}

function fromFilename(input: ProfileInput): Partial<TransactionDocumentProfile> {
  const filename = normalize(input.filename);
  if (filename.includes('movimientos nacionales de tarjeta de credito') || filename.includes('mov_facturado')) {
    return {
      bank: 'Banco de Chile',
      product_type: 'credit_card',
      format_family: 'visa_signature_card_statement',
      sign_convention: 'keyword_overrides_amount_sign',
      confidence: 0.96,
      evidence: ['filename:tarjeta_de_credito'],
    };
  }
  if (filename.includes('saldo_y_mov_no_facturado')) {
    return {
      bank: 'Banco de Chile',
      product_type: 'credit_card',
      format_family: 'visa_signature_no_facturado',
      sign_convention: 'keyword_overrides_amount_sign',
      confidence: 0.96,
      evidence: ['filename:no_facturado'],
    };
  }
  if (filename.includes('cartola provisoria')) {
    return {
      bank: 'Banco BICE',
      product_type: 'checking_account',
      format_family: 'bice_cartola_provisoria',
      sign_convention: 'column_cargo_abono',
      confidence: 0.9,
      evidence: ['filename:cartola_provisoria'],
    };
  }
  if (filename.includes('cartola_01-58083-3')) {
    return {
      bank: 'Banco BICE',
      product_type: 'checking_account',
      format_family: 'bice_cuenta_pesos',
      sign_convention: 'section_based',
      confidence: 0.92,
      evidence: ['filename:cuenta_01-58083-3'],
    };
  }
  const inventoryMatch = buildInventoryProfileMatch({ ...input, text: '' });
  if (inventoryMatch?.bank && inventoryMatch.bank !== 'unknown' && Number(inventoryMatch.confidence ?? 0) >= 0.82) {
    return {
      bank: inventoryMatch.bank,
      product_type: inventoryMatch.product_type ?? 'unknown',
      format_family: inventoryMatch.format_family ?? 'generic_document',
      sign_convention: inventoryMatch.sign_convention ?? 'unknown',
      confidence: inventoryMatch.confidence ?? 0.72,
      evidence: inventoryMatch.evidence ?? [],
    };
  }
  if (filename.includes('cartola_')) {
    return {
      bank: 'unknown',
      product_type: 'unknown',
      format_family: 'generic_bank_cartola',
      sign_convention: 'unknown',
      confidence: 0.62,
      evidence: ['filename:cartola_generic'],
    };
  }
  return {};
}

function fromText(input: ProfileInput): Partial<TransactionDocumentProfile> {
  const text = compact(input.text);
  const headers = pickHeaders(input).map((header) => normalize(header));
  const inventoryMatch = buildInventoryProfileMatch(input);
  const evidence: string[] = [];
  let bank = '';
  let productType: TransactionDocumentProductType = 'unknown';
  let formatFamily = '';
  let signConvention: TransactionDocumentProfile['sign_convention'] = 'unknown';
  let confidence = 0.55;

  const has = (value: string) => text.includes(value);
  const headerHas = (value: string) => headers.some((header) => header.includes(value));

  if (has('banco de chile') || has('bchile') || has('detalle cartola historica') || has('detalle cartola histórica')) {
    bank = 'Banco de Chile';
    evidence.push('text:banco_de_chile');
  }
  if (has('bice') || (has('cuenta en pesos n') && has('abonos y cargos'))) {
    bank = bank || 'Banco BICE';
    evidence.push('text:bice');
  }
  if (has('mach') || has('tenpo')) {
    bank = bank || (has('tenpo') ? 'Tenpo' : 'Mach');
    productType = 'debit_account';
    formatFamily = `${bankSlug(bank)}_wallet_statement`;
    signConvention = 'column_cargo_abono';
    confidence = Math.max(confidence, 0.94);
    evidence.push(`text:${bankSlug(bank)}_wallet`);
  }
  if (has('movimientos nacionales de tarjeta de credito') || has('movimientos facturados') || has('saldos y movimientos no facturados')) {
    bank = bank || 'Banco de Chile';
    productType = 'credit_card';
    evidence.push('text:tarjeta_credito');
  }

  if (inventoryMatch) {
    if (!bank || bank === 'unknown') bank = inventoryMatch.bank ?? bank;
    if (inventoryMatch.product_type && inventoryMatch.product_type !== 'unknown') {
      productType = inventoryMatch.product_type;
    }
    if (!formatFamily || formatFamily.startsWith('generic')) {
      formatFamily = inventoryMatch.format_family ?? formatFamily;
    }
    if (inventoryMatch.sign_convention && signConvention === 'unknown') {
      signConvention = inventoryMatch.sign_convention;
    }
    confidence = Math.max(confidence, inventoryMatch.confidence ?? confidence);
    evidence.push(...(inventoryMatch.evidence ?? []));
  }

  if (has('movimientos nacionales de tarjeta de credito')) {
    formatFamily = 'visa_signature_card_statement';
    signConvention = 'keyword_overrides_amount_sign';
    confidence = 0.96;
    evidence.push('text:movimientos_nacionales_tc');
  } else if (has('movimientos facturados')) {
    formatFamily = 'visa_signature_facturado';
    signConvention = 'keyword_overrides_amount_sign';
    confidence = 0.95;
    evidence.push('text:movimientos_facturados');
  } else if (has('saldos y movimientos no facturados')) {
    formatFamily = 'visa_signature_no_facturado';
    signConvention = 'keyword_overrides_amount_sign';
    confidence = 0.95;
    evidence.push('text:no_facturado');
  } else if (bank === 'Banco BICE' && ((has('cuenta en pesos n') && has('abonos y cargos')) || has('saldo inicial') || has('saldo final'))) {
    formatFamily = 'bice_cuenta_pesos';
    signConvention = 'section_based';
    productType = 'checking_account';
    confidence = bank === 'Banco BICE' ? 0.94 : 0.82;
    evidence.push('text:bice_cuenta_pesos');
  } else if (bank === 'Banco de Chile' && (has('detalle cartola historica') || has('saldo disponible') || has('linea de credito') || has('canal o sucursal'))) {
    formatFamily = 'banco_chile_cartola_historica';
    signConvention = 'column_cargo_abono';
    productType = 'checking_account';
    confidence = bank === 'Banco de Chile' ? 0.95 : 0.84;
    evidence.push('text:banco_chile_cartola_historica');
  } else if (headerHas('categoria') && headerHas('monto') && headerHas('fecha')) {
    formatFamily = 'generic_tabular_statement';
    signConvention = 'amount_sign_only';
    confidence = 0.72;
    evidence.push('headers:fecha_categoria_monto');
  }

  if (headers.some((header) => header.includes('cargo')) && headers.some((header) => header.includes('abono'))) {
    signConvention = 'column_cargo_abono';
    evidence.push('headers:cargo_abono');
    confidence = Math.max(confidence, 0.9);
  }
  if (headers.some((header) => header.includes('nº operacion')) || headers.some((header) => header.includes('n° operacion'))) {
    evidence.push('headers:numero_operacion');
  }
  if (headers.some((header) => header.includes('tipo'))) {
    evidence.push('headers:tipo');
  }
  if (headers.some((header) => header.includes('tipo de tarjeta'))) {
    productType = 'credit_card';
    evidence.push('headers:tipo_tarjeta');
  }
  if (headers.some((header) => header.includes('cuotas'))) {
    productType = productType === 'unknown' ? 'credit_card' : productType;
    evidence.push('headers:cuotas');
  }
  if (headers.some((header) => header.includes('saldo'))) {
    evidence.push('headers:saldo');
  }

  if (productType === 'unknown') {
    productType = normalizeProductType(input.productTypeHint);
  }
  if (!formatFamily) {
    formatFamily = headers.length > 0 ? 'generic_tabular_statement' : 'generic_document';
    confidence = Math.min(confidence, headers.length > 0 ? 0.68 : 0.58);
  }

  if (!bank && input.productTypeHint) {
    productType = normalizeProductType(input.productTypeHint);
  }

  const base: TransactionDocumentProfile = {
    bank: bank || 'unknown',
    product_type: productType,
    format_family: formatFamily,
    header_map: buildHeaderMap(headers, formatFamily),
    sign_convention: signConvention,
    needs_rag: confidence < 0.82 || bank === 'unknown' || formatFamily.startsWith('generic'),
    confidence,
    evidence,
  };

  return base;
}

function buildHeaderMap(headers: string[], formatFamily: string): Record<string, string> {
  const map: Record<string, string> = {};
  const normalized = headers.map((header) => normalize(header));
  const find = (...needles: string[]) => normalized.find((header) => needles.some((needle) => header.includes(needle)));

  const date = find('fecha', 'fec');
  const description = find('descripcion', 'detalle', 'glosa', 'movimiento', 'concepto');
  const amount = find('monto', 'importe', 'valor');
  const balance = find('saldo', 'balance', 'disponible');
  const cargo = find('cargo', 'debito', 'debe', 'egreso');
  const abono = find('abono', 'credito', 'haber', 'ingreso');
  const city = find('ciudad');
  const installments = find('cuotas');
  const category = find('categoria');
  const operation = find('operacion', 'nº operacion', 'n° operacion');
  const channel = find('canal', 'sucursal');
  const cardType = find('tipo de tarjeta');

  if (date) map.date = date;
  if (description) map.description = description;
  if (amount) map.amount = amount;
  if (balance) map.balance = balance;
  if (cargo) map.cargo_amount = cargo;
  if (abono) map.abono_amount = abono;
  if (city) map.city = city;
  if (installments) map.installments = installments;
  if (category) map.category = category;
  if (operation) map.operation = operation;
  if (channel) map.channel = channel;
  if (cardType) map.card_type = cardType;
  if (formatFamily === 'banco_chile_cartola_historica') {
    map.description = map.description ?? 'descripcion';
    map.amount = map.amount ?? 'cargo|abono';
    map.balance = map.balance ?? 'saldo';
    map.channel = map.channel ?? 'canal o sucursal';
  }
  if (formatFamily.includes('wallet_statement')) {
    map.description = map.description ?? 'descripcion';
    map.amount = map.amount ?? 'monto';
    map.balance = map.balance ?? 'saldo';
    map.movement_type = map.movement_type ?? 'tipo';
  }
  if (formatFamily.startsWith('visa_signature')) {
    map.amount = map.amount ?? 'monto';
    map.category = map.category ?? 'categoria';
    map.installments = map.installments ?? 'cuotas';
  }
  return map;
}

async function refineWithLlm(input: ProfileInput, profile: TransactionDocumentProfile): Promise<TransactionDocumentProfile> {
  if (profile.confidence >= 0.78 || process.env.TRANSACTIONS_PROFILE_LLM === 'false') return profile;
  if (!process.env.OPENAI_API_KEY) return profile;

  const previewLines = pickPreviewLines(input.text);
  if (previewLines.length === 0) return profile;

  try {
    const refined = await completeStructured<Partial<TransactionDocumentProfile>>({
      model: process.env.TRANSACTIONS_PROFILE_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
      temperature: 0,
      maxCompletionTokens: 500,
      system:
        'Eres un clasificador financiero chileno. No inventes montos, fechas ni saldos. ' +
        'Solo puedes usar evidencia visible. Si falta certeza, responde unknown. ' +
        'Devuelve solo JSON estricto con bank, product_type, format_family, header_map, sign_convention, needs_rag, confidence y evidence.',
      user: JSON.stringify({
        filename: input.filename,
        preview_lines: previewLines,
        headers: pickHeaders(input),
        candidate: profile,
        allowed_banks: Array.from(
          new Set([
            'Banco de Chile',
            'Banco BICE',
            ...getTransactionInstitutionInventorySummary().institutions.map((institution) => institution.name),
            'unknown',
          ]),
        ),
        allowed_sign_conventions: ['column_cargo_abono', 'section_based', 'keyword_overrides_amount_sign', 'amount_sign_only', 'unknown'],
      }),
    });

    const next: TransactionDocumentProfile = {
      ...profile,
      bank: refined.bank && String(refined.bank).trim() ? String(refined.bank).trim() : profile.bank,
      product_type: normalizeProductType(refined.product_type as string) || profile.product_type,
      format_family: refined.format_family && String(refined.format_family).trim() ? String(refined.format_family).trim() : profile.format_family,
      header_map:
        refined.header_map && typeof refined.header_map === 'object'
          ? { ...profile.header_map, ...(refined.header_map as Record<string, string>) }
          : profile.header_map,
      sign_convention:
        refined.sign_convention &&
        ['column_cargo_abono', 'section_based', 'keyword_overrides_amount_sign', 'amount_sign_only', 'unknown'].includes(
          String(refined.sign_convention),
        )
          ? (String(refined.sign_convention) as TransactionDocumentProfile['sign_convention'])
          : profile.sign_convention,
      needs_rag: typeof refined.needs_rag === 'boolean' ? refined.needs_rag : profile.needs_rag,
      confidence:
        typeof refined.confidence === 'number' && Number.isFinite(refined.confidence)
          ? Math.max(profile.confidence, Math.min(0.98, Math.max(0.1, refined.confidence)))
          : profile.confidence,
      evidence: Array.isArray(refined.evidence) && refined.evidence.length > 0 ? refined.evidence.map((item) => String(item)) : profile.evidence,
    };
    if (next.bank === 'unknown' && profile.bank !== 'unknown') next.bank = profile.bank;
    if (next.format_family === 'generic_document' && profile.format_family !== 'generic_document') next.format_family = profile.format_family;
    if (next.confidence < profile.confidence) next.confidence = profile.confidence;
    next.needs_rag = next.needs_rag || next.confidence < 0.82 || next.bank === 'unknown';
    return next;
  } catch {
    return profile;
  }
}

export async function buildTransactionDocumentProfile(input: ProfileInput): Promise<TransactionDocumentProfile> {
  const base = { ...fromFilename(input), ...fromText(input) } as TransactionDocumentProfile;
  const normalized: TransactionDocumentProfile = {
    bank: base.bank || 'unknown',
    product_type: normalizeProfileProductType(base.product_type) || 'unknown',
    format_family: base.format_family || 'generic_document',
    header_map: base.header_map ?? {},
    sign_convention: base.sign_convention ?? 'unknown',
    needs_rag: Boolean(base.needs_rag),
    confidence: Number.isFinite(base.confidence) ? Math.max(0, Math.min(0.99, Number(base.confidence))) : 0.58,
    evidence: Array.isArray(base.evidence) ? base.evidence.slice(0, 12) : [],
  };
  return refineWithLlm(input, normalized);
}
