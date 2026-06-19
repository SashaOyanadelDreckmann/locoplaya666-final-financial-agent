export type ChatUploadFileKind = 'image' | 'pdf' | 'spreadsheet' | 'document';

export type ChatUploadFile = {
  name: string;
  mime?: string;
  kind: ChatUploadFileKind;
  sizeBytes?: number;
  sizeLabel?: string;
  previewUrl?: string;
};

export type ChatAttachmentSummary = {
  name: string;
  format: string;
  contentKind: string;
  relevanceToFinance: string;
  description: string;
  keyFindings: string[];
  amounts?: Array<{ label: string; value: number; currency?: string; context?: string }>;
  calculations?: Array<{ label: string; expression: string; result: number; note?: string }>;
  dates?: string[];
  entities?: string[];
  observations?: string[];
  limitations?: string[];
  confidence?: number;
  preview?: string;
};

export function formatUploadFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function inferChatUploadFileKind(file: Pick<File, 'name' | 'type'>): ChatUploadFileKind {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return 'image';
  }
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/\.(xls|xlsx|csv|tsv)$/i.test(file.name) || ['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) {
    return 'spreadsheet';
  }
  return 'document';
}

export function buildChatUploadFiles(files: File[]): ChatUploadFile[] {
  return files.map((file) => {
    const kind = inferChatUploadFileKind(file);
    return {
      name: file.name,
      mime: file.type || undefined,
      kind,
      sizeBytes: file.size,
      sizeLabel: formatUploadFileSize(file.size),
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
    };
  });
}

export function mapChatAttachmentAnalysisToSummary(
  attachment: Record<string, unknown>,
): ChatAttachmentSummary {
  const amounts = Array.isArray(attachment.amounts)
    ? attachment.amounts
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .slice(0, 12)
        .map((item) => ({
          label: String(item.label ?? 'Monto'),
          value: Number(item.value) || 0,
          currency: item.currency ? String(item.currency) : undefined,
          context: item.context ? String(item.context) : undefined,
        }))
    : [];

  const calculations = Array.isArray(attachment.calculations)
    ? attachment.calculations
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .slice(0, 8)
        .map((item) => ({
          label: String(item.label ?? 'Cálculo'),
          expression: String(item.expression ?? ''),
          result: Number(item.result) || 0,
          note: item.note ? String(item.note) : undefined,
        }))
    : [];

  const extractedText = String(attachment.extractedText ?? attachment.extracted_text ?? '');

  const rawKeyFindings = attachment.keyFindings ?? attachment.key_findings;
  const keyFindings = Array.isArray(rawKeyFindings)
    ? rawKeyFindings.slice(0, 6).map(String)
    : [];

  return {
    name: String(attachment.name ?? 'archivo'),
    format: String(attachment.format ?? 'unknown'),
    contentKind: String(attachment.contentKind ?? attachment.content_kind ?? 'unknown'),
    relevanceToFinance: String(
      attachment.relevanceToFinance ?? attachment.relevance_to_finance ?? 'none',
    ),
    description: String(attachment.description ?? '').trim(),
    keyFindings,
    amounts,
    calculations,
    dates: Array.isArray(attachment.dates) ? attachment.dates.slice(0, 8).map(String) : [],
    entities: Array.isArray(attachment.entities) ? attachment.entities.slice(0, 8).map(String) : [],
    observations: Array.isArray(attachment.observations)
      ? attachment.observations.slice(0, 6).map(String)
      : [],
    limitations: Array.isArray(attachment.limitations)
      ? attachment.limitations.slice(0, 4).map(String)
      : [],
    confidence:
      typeof attachment.confidence === 'number' && Number.isFinite(attachment.confidence)
        ? attachment.confidence
        : undefined,
    preview: extractedText.slice(0, 450),
  };
}

export function buildChatUploadAgentPrompt(params: {
  fileNames: string[];
  attachments: ChatAttachmentSummary[];
}): string {
  const names = params.fileNames.join(', ');
  const hasFinancialEvidence = params.attachments.some((item) =>
    ['high', 'medium'].includes(item.relevanceToFinance),
  );
  const hasNonFinancial = params.attachments.some((item) =>
    ['personal_photo', 'general_image'].includes(item.contentKind) ||
    item.relevanceToFinance === 'none',
  );

  const guidance = hasFinancialEvidence
    ? 'Prioriza lectura financiera: montos, fechas, riesgos, oportunidades, inconsistencias y cálculos verificables. Cita evidencia por archivo.'
    : hasNonFinancial
      ? 'Primero describe con precisión qué contiene cada archivo. Si no es evidencia financiera, dilo sin forzar análisis patrimonial; solo agrega ángulo financiero si aporta valor real.'
      : 'Describe el contenido con precisión y agrega observaciones financieras solo cuando el material lo justifique.';

  return [
    `El usuario adjuntó ${params.fileNames.length} archivo(s) al chat principal: ${names}.`,
    'Ya fueron analizados con visión/texto inteligente (pipeline del chat, no el modal de transacciones).',
    guidance,
    'Usa los cálculos incluidos cuando existan; no inventes cifras. Responde en español claro, sin mencionar JSON ni payloads internos.',
    `ADJUNTOS_CHAT_JSON=${JSON.stringify(params.attachments)}`,
  ].join(' ');
}
