import type { BankProduct } from './types';

export type TxUploadFormat = NonNullable<NonNullable<BankProduct['assistant']>['uploadFormat']>;

export function buildManualEvidenceFile(text: string): File {
  return new File([text], `antecedente-manual-${Date.now()}.txt`, { type: 'text/plain' });
}

export function inferUploadFormatFromMessage(text: string): TxUploadFormat | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (/video|grabaci[oó]n|pantalla|screen/.test(normalized)) return 'video';
  if (/excel|csv|xlsx|planilla/.test(normalized)) return 'spreadsheet';
  if (/\bpdf\b/.test(normalized)) return 'pdf';
  if (/foto|captura|pantallazo|imagen/.test(normalized)) return 'photos';
  if (/texto|manual|escrito/.test(normalized)) return 'text';
  return null;
}

export function asksForSummaryRegeneration(text: string, hasSummary: boolean): boolean {
  if (!hasSummary) return false;
  return /(error|corrige|corregir|revisa|revisar|regenera|regenerar|rehace|rehacer)/i.test(text);
}

export function wantsTextEvidenceUpload(params: {
  analysisAlreadyDone: boolean;
  uploadFormat: TxUploadFormat | null | undefined;
  text: string;
  hasAttachedFiles: boolean;
}): boolean {
  return (
    !params.analysisAlreadyDone &&
    params.uploadFormat === 'text' &&
    params.text.trim().length > 0 &&
    !params.hasAttachedFiles
  );
}
