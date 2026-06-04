import type { Artifact } from './agent.response.types';
import { getCsrfToken } from './csrf';

export async function savePdfArtifact(artifact: Artifact) {
  // Guardado "real" (self-host): Next route escribe en /public/pdfs/simulaciones.
  // Si estás en Vercel u otro FS read-only, este endpoint debe migrar a storage (S3/R2).
  const res = await fetch('/api/artifacts/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: artifact.id,
      title: artifact.title,
      fileUrl: artifact.fileUrl,
    }),
  });

  if (!res.ok) {
    let msg = 'No se pudo guardar el documento';
    try {
      const data = await res.json();
      msg = data?.error ?? msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json() as Promise<{ publicUrl: string }>;
}

export async function saveBubbleSnapshotPdfArtifact(payload: {
  title: string;
  subtitle?: string;
  html: string;
  css: string;
}) {
  const csrfToken = getCsrfToken();
  const res = await fetch('/api/reports/bubble-pdf-snapshot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`No se pudo generar snapshot PDF (${res.status})`);
  }

  return res.json() as Promise<{ ok: true; artifact: Artifact }>;
}

function isProbablyMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
}

export function downloadFile(url: string, filename: string) {
  const shouldOpenDirectly = isProbablyMobileDevice() && /\.pdf($|[?#])/i.test(filename);
  if (shouldOpenDirectly) {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.href = url;
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadBlobFile(blob: Blob, filename: string) {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof File !== 'undefined' && typeof nav.share === 'function') {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      if ((error as Error | null)?.name === 'AbortError') {
        return URL.createObjectURL(blob);
      }
    }
  }

  const fileUrl = URL.createObjectURL(blob);
  downloadFile(fileUrl, filename);
  return fileUrl;
}
