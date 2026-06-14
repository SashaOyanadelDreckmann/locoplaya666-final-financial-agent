export type ChatUploadFileKind = 'image' | 'pdf' | 'spreadsheet' | 'document';

export type ChatUploadFile = {
  name: string;
  mime?: string;
  kind: ChatUploadFileKind;
  sizeBytes?: number;
  sizeLabel?: string;
  previewUrl?: string;
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

export function buildChatUploadAgentPrompt(params: {
  fileNames: string[];
  docsSummary: Array<Record<string, unknown>>;
  analysisEnvelope?: unknown;
}): string {
  const names = params.fileNames.join(', ');
  const analysisSuffix =
    params.analysisEnvelope && typeof params.analysisEnvelope === 'object'
      ? ` ANALISIS_TRANSACCIONAL_JSON=${JSON.stringify(params.analysisEnvelope)}`
      : '';

  return [
    `El usuario adjuntó ${params.fileNames.length} archivo(s): ${names}.`,
    'Ya fueron escaneados y normalizados. Opina sobre su contenido con enfoque financiero profesional:',
    'resume hallazgos clave, señala riesgos u oportunidades, detecta inconsistencias y cita evidencia por archivo.',
    'Responde en español claro, sin mencionar JSON ni payloads internos.',
    `DOCUMENTOS_JSON=${JSON.stringify(params.docsSummary)}${analysisSuffix}`,
  ].join(' ');
}
