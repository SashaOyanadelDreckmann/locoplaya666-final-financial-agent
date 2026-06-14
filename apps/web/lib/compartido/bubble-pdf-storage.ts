import path from 'path';

export function safeBubbleReportSlug(value: string) {
  return String(value || 'anonymous')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'anonymous';
}

export function safeBubbleReportFilename(value: string) {
  const file = path.basename(String(value || '').trim());
  if (!file || file.includes('..') || (!file.endsWith('.pdf') && !file.endsWith('.png'))) {
    return '';
  }
  return file;
}

export function getBubbleReportsDir(userId: string) {
  const userSegment = safeBubbleReportSlug(userId);
  if (process.env.DATA_DIR) {
    return path.join(path.resolve(process.env.DATA_DIR), 'bubble-reports', userSegment);
  }
  return path.join(process.cwd(), 'public', 'generated', 'reports', userSegment);
}

export function getBubbleReportFilePath(userId: string, filename: string) {
  const safeName = safeBubbleReportFilename(filename);
  if (!safeName) throw new Error('Invalid file');
  const filePath = path.join(getBubbleReportsDir(userId), safeName);
  const normalizedDir = path.normalize(getBubbleReportsDir(userId)) + path.sep;
  if (!filePath.startsWith(normalizedDir)) throw new Error('Invalid file path');
  return filePath;
}

export function buildBubbleReportPublicUrls(userId: string, pdfFileName: string, pngFileName: string) {
  if (process.env.DATA_DIR) {
    return {
      fileUrl: `/api/reports/bubble-pdf-file?file=${encodeURIComponent(pdfFileName)}`,
      previewImageUrl: `/api/reports/bubble-pdf-file?file=${encodeURIComponent(pngFileName)}`,
    };
  }
  const relativeDir = ['generated', 'reports', safeBubbleReportSlug(userId)].join('/');
  return {
    fileUrl: `/${relativeDir}/${pdfFileName}`,
    previewImageUrl: `/${relativeDir}/${pngFileName}`,
  };
}
