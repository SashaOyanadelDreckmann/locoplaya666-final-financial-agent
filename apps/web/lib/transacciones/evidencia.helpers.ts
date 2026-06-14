export const EVIDENCE_IMAGE_MAX_EDGE_PX = 2200;
export const EVIDENCE_IMAGE_JPEG_QUALITY = 0.84;
export const EVIDENCE_IMAGE_SKIP_BELOW_BYTES = 1.2 * 1024 * 1024;

export function getEvidenceUploadCapacity(maxFilesPerProduct: number, uploadedCount: number): number {
  return Math.max(0, maxFilesPerProduct - uploadedCount);
}

export function isDuplicateEvidenceFile(existing: File[], candidate: File): boolean {
  return existing.some((file) => file.name === candidate.name && file.size === candidate.size);
}

export type MergeEvidenceFilesResult = {
  files: File[];
  oversizeNames: string[];
  exceededSlots: boolean;
  exceededTotalBytes: boolean;
  skippedCount: number;
  addedCount: number;
};

export function mergeEvidenceFiles(
  pendingFiles: File[],
  incomingFiles: File[],
  options: {
    capacity: number;
    maxSingleBytes: number;
    maxTotalBytes: number;
  },
): MergeEvidenceFilesResult {
  const merged = [...pendingFiles];
  const oversizeNames: string[] = [];
  let exceededSlots = false;
  let exceededTotalBytes = false;
  let skippedCount = 0;
  let addedCount = 0;
  let rollingBytes = merged.reduce((acc, file) => acc + file.size, 0);

  for (const file of incomingFiles) {
    if (file.size > options.maxSingleBytes) {
      oversizeNames.push(file.name);
      skippedCount += 1;
      continue;
    }
    if (isDuplicateEvidenceFile(merged, file)) {
      skippedCount += 1;
      continue;
    }
    if (merged.length >= options.capacity) {
      exceededSlots = true;
      skippedCount += 1;
      continue;
    }
    if (rollingBytes + file.size > options.maxTotalBytes) {
      exceededTotalBytes = true;
      skippedCount += 1;
      continue;
    }
    merged.push(file);
    rollingBytes += file.size;
    addedCount += 1;
  }

  return { files: merged, oversizeNames, exceededSlots, exceededTotalBytes, skippedCount, addedCount };
}

export function buildEvidenceAppendNotice(
  result: MergeEvidenceFilesResult,
  options: { maxFilesPerProduct: number; maxSingleBytes: number; maxTotalBytes: number },
): string | null {
  const notices: string[] = [];
  if (result.oversizeNames.length > 0) {
    const mbLimit = Math.round(options.maxSingleBytes / (1024 * 1024));
    const preview = result.oversizeNames.slice(0, 2).join(', ');
    notices.push(
      `Algunos archivos superan ${mbLimit} MB (${preview}${result.oversizeNames.length > 2 ? ', ...' : ''}).`,
    );
  }
  if (result.exceededTotalBytes) {
    const mbLimit = Math.round(options.maxTotalBytes / (1024 * 1024));
    notices.push(`El total adjunto no puede superar ${mbLimit} MB. Comprime fotos o envía en dos tandas.`);
  }
  if (result.exceededSlots) {
    notices.push(`Límite por producto: ${options.maxFilesPerProduct} archivos.`);
  }
  if (result.addedCount > 0 && result.skippedCount > 0) {
    notices.push(`Se agregaron ${result.addedCount}; ${result.skippedCount} no cupieron.`);
  }
  return notices.length > 0 ? notices.join(' ') : null;
}

export async function optimizeEvidenceFile(file: File): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size <= EVIDENCE_IMAGE_SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = Math.max(bitmap.width, bitmap.height);
    if (maxEdge <= EVIDENCE_IMAGE_MAX_EDGE_PX && file.size <= EVIDENCE_IMAGE_SKIP_BELOW_BYTES * 2) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, EVIDENCE_IMAGE_MAX_EDGE_PX / maxEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', EVIDENCE_IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'captura';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function prepareIncomingEvidenceFiles(files: FileList | File[]): Promise<File[]> {
  return Promise.all(Array.from(files).map(optimizeEvidenceFile));
}
