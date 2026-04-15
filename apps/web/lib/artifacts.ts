import type { Artifact } from './agent.response.types';

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

export function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
