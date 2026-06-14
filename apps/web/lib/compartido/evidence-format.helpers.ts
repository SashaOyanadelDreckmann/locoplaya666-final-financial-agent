import { isImageEvidenceFileName, type EvidenceSourceHint } from '@financial-agent/shared';
import type { TxUploadFormat } from '@/app/agent/modales/transacciones/types';

const FORMAT_LABELS: Record<TxUploadFormat, string> = {
  photos: 'Fotos',
  pdf: 'PDF',
  spreadsheet: 'Excel / CSV',
  text: 'Texto',
};

function formatLabel(format: TxUploadFormat): string {
  return FORMAT_LABELS[format];
}

export type EvidenceFileKind = TxUploadFormat | 'unsupported' | 'video';

const SPREADSHEET_EXT = /\.(xls|xlsx|csv|tsv)$/i;
const TEXT_EXT = /\.(txt|md|log)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi)$/i;

export const EVIDENCE_FILE_ACCEPT_BY_FORMAT: Record<TxUploadFormat, string> = {
  photos: 'image/*,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif',
  pdf: 'application/pdf,.pdf',
  spreadsheet:
    '.xls,.xlsx,.csv,.tsv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values',
  text: '.txt,.md,.log,text/plain',
};

export const EVIDENCE_FILE_ACCEPT_ALL = Object.values(EVIDENCE_FILE_ACCEPT_BY_FORMAT).join(',');

export function getEvidenceFileAccept(format: TxUploadFormat | null | undefined): string {
  if (!format) return EVIDENCE_FILE_ACCEPT_ALL;
  return EVIDENCE_FILE_ACCEPT_BY_FORMAT[format];
}

export function classifyEvidenceFile(file: File): EvidenceFileKind {
  const name = String(file.name ?? '').trim();
  const mime = String(file.type ?? '').trim().toLowerCase();

  if (mime.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  if (mime.startsWith('image/') || isImageEvidenceFileName(name)) return 'photos';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (
    SPREADSHEET_EXT.test(name) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    mime === 'text/tab-separated-values'
  ) {
    return 'spreadsheet';
  }
  if (TEXT_EXT.test(name) || mime === 'text/plain') return 'text';
  return 'unsupported';
}

export function fileMatchesUploadFormat(file: File, format: TxUploadFormat): boolean {
  return classifyEvidenceFile(file) === format;
}

export function inferUploadFormatFromEvidenceFiles(files: File[]): TxUploadFormat | null {
  if (files.length === 0) return null;
  const kinds = new Set(files.map((file) => classifyEvidenceFile(file)));
  if (kinds.has('video') || kinds.has('unsupported')) return null;
  if (kinds.size !== 1) return null;
  return [...kinds][0] as TxUploadFormat;
}

export type HomogeneousEvidenceFilesResult =
  | { ok: true; format: TxUploadFormat }
  | { ok: false; error: string };

export function assertHomogeneousEvidenceFiles(files: File[]): HomogeneousEvidenceFilesResult {
  if (files.length === 0) {
    return { ok: false, error: 'No hay archivos para validar.' };
  }

  const videoNames = files.filter((file) => classifyEvidenceFile(file) === 'video').map((file) => file.name);
  if (videoNames.length > 0) {
    return {
      ok: false,
      error: 'El formato video ya no está disponible. Usa capturas, PDF, Excel o texto.',
    };
  }

  const unsupportedNames = files
    .filter((file) => classifyEvidenceFile(file) === 'unsupported')
    .map((file) => file.name);
  if (unsupportedNames.length > 0) {
    return {
      ok: false,
      error: `Formato no compatible con el análisis guiado: ${unsupportedNames.slice(0, 3).join(', ')}. Usa imagen, PDF, Excel/CSV o texto.`,
    };
  }

  const inferred = inferUploadFormatFromEvidenceFiles(files);
  if (!inferred) {
    return {
      ok: false,
      error:
        'No mezcles tipos distintos en un mismo envío. Usa solo fotos, solo PDF, solo Excel/CSV o solo archivos de texto.',
    };
  }

  return { ok: true, format: inferred };
}

export type AlignEvidenceUploadResult =
  | {
      ok: true;
      effectiveFormat: TxUploadFormat;
      sourceHint: EvidenceSourceHint;
      realigned: boolean;
      notice: string | null;
    }
  | { ok: false; error: string };

export function buildEvidenceFormatRealignNotice(
  previousFormat: TxUploadFormat | null,
  effectiveFormat: TxUploadFormat,
): string {
  const detected = formatLabel(effectiveFormat);
  if (!previousFormat || previousFormat === effectiveFormat) {
    return `Detectamos ${detected} en tus archivos y ajustamos el formato de evidencia.`;
  }
  const selected = formatLabel(previousFormat);
  return `Elegiste ${selected}, pero los archivos corresponden a ${detected}. Ajustamos el formato para analizarlos correctamente.`;
}

export function alignEvidenceUploadFormat(params: {
  uploadFormat: TxUploadFormat | null;
  files: File[];
  looseTextEvidence?: boolean;
}): AlignEvidenceUploadResult {
  if (params.looseTextEvidence && params.files.length === 0) {
    return {
      ok: true,
      effectiveFormat: 'text',
      sourceHint: 'text',
      realigned: params.uploadFormat !== 'text' && params.uploadFormat !== null,
      notice:
        params.uploadFormat && params.uploadFormat !== 'text'
          ? buildEvidenceFormatRealignNotice(params.uploadFormat, 'text')
          : null,
    };
  }

  const homogeneous = assertHomogeneousEvidenceFiles(params.files);
  if (!homogeneous.ok) return homogeneous;

  const inferred = homogeneous.format;
  const selected = params.uploadFormat;

  if (!selected) {
    return {
      ok: true,
      effectiveFormat: inferred,
      sourceHint: inferred,
      realigned: false,
      notice: null,
    };
  }

  if (selected === inferred) {
    return {
      ok: true,
      effectiveFormat: selected,
      sourceHint: selected,
      realigned: false,
      notice: null,
    };
  }

  return {
    ok: true,
    effectiveFormat: inferred,
    sourceHint: inferred,
    realigned: true,
    notice: buildEvidenceFormatRealignNotice(selected, inferred),
  };
}
