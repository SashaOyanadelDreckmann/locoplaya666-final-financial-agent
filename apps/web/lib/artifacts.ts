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

export function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
