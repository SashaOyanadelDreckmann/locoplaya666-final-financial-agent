import * as fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getSimulationArtifactsDir } from './simulation.service';

export type SimulationPdfInput = {
  title: string;
  content: string;
};

export async function generateSimulationPdf(input: SimulationPdfInput, userId: string = 'anonymous') {
  const id = crypto.randomUUID();

  // SECURITY: Store PDFs in user-specific directory, not public/
  // This ensures reports are only accessible via authenticated /api/pdfs endpoint
  const outDir = getSimulationArtifactsDir(userId);
  const outPath = path.join(outDir, `${id}.pdf`);

  await fs.mkdir(outDir, { recursive: true });

  const fakePdf = `
SIMULACIÓN FINANCIERA

Título: ${input.title}

${input.content}
`;

  await fs.writeFile(outPath, fakePdf);

  return {
    id,
    type: 'pdf' as const,
    title: input.title,
    fileUrl: `/api/pdfs/serve?file=${id}.pdf`,
    source: 'simulation',
    createdAt: new Date().toISOString(),
  };
}
