/**
 * Clasifica abonos vs egresos usando contexto visual de capturas (app móvil, fotos de cartola).
 * Complementa heurísticas determinísticas con lectura multimodal de la imagen.
 */

import { completeStructuredWithSchema } from './llm.service';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const DIRECTION_VISION_MODEL =
  process.env.TRANSACTIONS_DIRECTION_VISION_MODEL?.trim() ||
  process.env.TRANSACTIONS_VISION_FALLBACK_MODEL?.trim() ||
  process.env.TRANSACTIONS_VISION_MODEL?.trim() ||
  'gpt-4.1';

const MIN_APPLY_CONFIDENCE = Number(process.env.TRANSACTIONS_DIRECTION_VISION_MIN_CONFIDENCE ?? 0.62);

const DIRECTION_VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ui_context: {
      type: 'object',
      additionalProperties: false,
      properties: {
        surface_type: { type: 'string' },
        institution_hint: { type: 'string' },
        sign_convention_notes: { type: 'string' },
      },
      required: ['surface_type', 'institution_hint', 'sign_convention_notes'],
    },
    movements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          movement_index: { type: 'integer' },
          direction: { type: 'string', enum: ['income', 'expense'] },
          movement_kind: { type: 'string', enum: ['abono', 'expense', 'income'] },
          confidence: { type: 'number' },
          visual_evidence: { type: 'string' },
        },
        required: ['movement_index', 'direction', 'movement_kind', 'confidence', 'visual_evidence'],
      },
    },
  },
  required: ['ui_context', 'movements'],
} as const;

export type VisionDirectionCandidate = {
  date?: string;
  description: string;
  amount: number;
  heuristic_direction?: 'income' | 'expense';
  heuristic_kind?: 'abono' | 'expense' | 'income';
  amount_token?: string;
};

export type VisionDirectionClassification = {
  movement_index: number;
  direction: 'income' | 'expense';
  movement_kind: 'abono' | 'expense' | 'income';
  confidence: number;
  visual_evidence: string;
};

export type VisionDirectionResult = {
  ui_context: {
    surface_type: string;
    institution_hint: string;
    sign_convention_notes: string;
  };
  movements: VisionDirectionClassification[];
};

const DIRECTION_VISION_INSTRUCTIONS =
  'Eres un analista financiero visual experto en apps bancarias chilenas (BICE, Santander, BCI, Itaú, Scotiabank, CMR, Mach, etc.) y cartolas escaneadas.\n' +
  'Tu tarea NO es extraer OCR: ya tienes candidatos de movimiento. Debes mirar la imagen y decidir si cada fila es abono/ingreso o egreso/gasto usando TODO el contexto visual.\n\n' +
  'Señales visuales típicas en apps móviles de tarjeta de crédito:\n' +
  '- Abono/pago a la tarjeta: monto con prefijo +, texto verde, icono con flecha hacia abajo-izquierda, descripciones como "Pago pesos tef/tar", "Monto cancelado".\n' +
  '- Compra/cargo: monto con prefijo -, texto negro/gris, icono con flecha hacia arriba-derecha, descripciones con "compras", comercios (Copec, Sumup, Sodimac, etc.).\n' +
  '- En cartolas PDF impresas o escaneadas: columnas Cargo vs Abono, Débito vs Crédito, Haber vs Debe.\n' +
  '- NO inviertas la convención de la app: en muchas apps chilenas + = abono y - = compra (distinto a cartola PDF donde - puede ser abono).\n\n' +
  'Reglas:\n' +
  '1) Prioriza lo que VES en la imagen (color, signo visible, icono, columna) sobre la heurística OCR.\n' +
  '2) Para tarjeta de crédito, pagos/abonos a la tarjeta son movement_kind=abono e direction=income; compras son movement_kind=expense e direction=expense.\n' +
  '3) Para cuenta corriente/vista, transferencias recibidas/sueldo suelen ser income; cargos/compras expense.\n' +
  '4) confidence 0.9+ si el signo/color/icono es claro; 0.7-0.89 si inferido por contexto; <0.65 si muy ambiguo.\n' +
  '5) Devuelve exactamente una clasificación por movement_index enviado. No inventes movimientos extra.\n' +
  '6) visual_evidence debe citar qué viste (ej. "monto verde con +", "flecha gris ↗", "columna Cargo").';

function resolveImageMime(filename: string, mimeType?: string): string | null {
  const explicit = String(mimeType ?? '').trim().toLowerCase();
  if (explicit.startsWith('image/')) return explicit;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return IMAGE_MIME_BY_EXT[ext] ?? null;
}

function visionImageDetail(): 'auto' | 'high' | 'low' {
  const configured = process.env.TRANSACTIONS_VISION_DETAIL?.trim().toLowerCase();
  if (configured === 'high' || configured === 'low' || configured === 'auto') return configured;
  return 'high';
}

export function isVisionImageFilename(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext in IMAGE_MIME_BY_EXT;
}

export async function classifyMovementsWithVisionContext(input: {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  productType?: string;
  institutionHint?: string;
  ocrText?: string;
  documentProfile?: {
    bank?: string;
    product_type?: string;
    sign_convention?: string;
    format_family?: string;
  };
  candidates: VisionDirectionCandidate[];
}): Promise<VisionDirectionResult | null> {
  const mime = resolveImageMime(input.filename, input.mimeType);
  if (!mime || input.candidates.length === 0) return null;
  if (input.candidates.length > 80) return null;

  const payload = {
    filename: input.filename,
    product_type: input.productType ?? 'unknown',
    institution_hint: input.institutionHint ?? input.documentProfile?.bank ?? '',
    document_profile: input.documentProfile ?? null,
    ocr_excerpt: String(input.ocrText ?? '').slice(0, 2200),
    candidates: input.candidates.slice(0, 80).map((candidate, movement_index) => ({
      movement_index,
      date: candidate.date ?? null,
      description: candidate.description,
      amount: candidate.amount,
      amount_token: candidate.amount_token ?? null,
      heuristic_direction: candidate.heuristic_direction ?? null,
      heuristic_kind: candidate.heuristic_kind ?? null,
    })),
  };

  try {
    const result = await completeStructuredWithSchema<VisionDirectionResult>({
      name: 'transaction_vision_direction',
      description: 'Clasifica abonos vs egresos desde contexto visual de capturas bancarias.',
      model: DIRECTION_VISION_MODEL,
      temperature: 0,
      maxOutputTokens: 2800,
      instructions: DIRECTION_VISION_INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'Clasifica direction y movement_kind de cada candidato mirando la imagen.\n' +
                `JSON de contexto:\n${JSON.stringify(payload)}`,
            },
            {
              type: 'input_image',
              image_url: `data:${mime};base64,${input.buffer.toString('base64')}`,
              detail: visionImageDetail(),
            },
          ],
        },
      ],
      schema: DIRECTION_VISION_SCHEMA,
    });

    if (!Array.isArray(result.movements) || result.movements.length === 0) return null;
    return result;
  } catch {
    return null;
  }
}

export function applyVisionDirectionClassifications<T extends {
  date?: string;
  description: string;
  amount: number;
  direction: 'income' | 'expense';
  movement_kind?: 'abono' | 'expense' | 'income';
  amount_signed?: number;
  direction_basis?: string;
  confidence?: number;
}>(
  movements: T[],
  classifications: VisionDirectionClassification[],
  minConfidence = MIN_APPLY_CONFIDENCE,
): T[] {
  const byIndex = new Map(
    classifications
      .filter((item) => Number.isFinite(item.confidence) && item.confidence >= minConfidence)
      .map((item) => [item.movement_index, item]),
  );
  if (byIndex.size === 0) return movements;

  return movements.map((movement, index) => {
    const classification = byIndex.get(index);
    if (!classification) return movement;
    const signedAmount =
      classification.direction === 'expense'
        ? -Math.abs(movement.amount)
        : Math.abs(movement.amount);
    return {
      ...movement,
      direction: classification.direction,
      movement_kind: classification.movement_kind,
      amount_signed: signedAmount,
      direction_basis: 'vision_ui_context',
      confidence: Math.min(
        0.99,
        Math.max(movement.confidence ?? 0.55, classification.confidence),
      ),
    };
  });
}
