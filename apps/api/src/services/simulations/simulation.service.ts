import fs from 'fs';
import path from 'path';

export type SimulationArtifact = {
  id: string;
  type: 'pdf';
  title: string;
  description?: string;
  fileUrl: string;
  previewImageUrl: string;
  source: 'simulation' | 'analysis' | 'diagnostic';
  createdAt: string;
  saved?: boolean;
  meta?: Record<string, unknown>;
};

function findRepoRoot(start: string) {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cur, 'pnpm-workspace.yaml');
    if (fs.existsSync(candidate)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeUserSegment(userId: string) {
  return String(userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Returns (and ensures) the per-user artifacts directory (private, outside public/). */
export function getSimulationArtifactsDir(userId: string) {
  const base = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(findRepoRoot(process.cwd()), 'data');
  const dir = path.join(base, 'pdfs', safeUserSegment(userId));
  ensureDir(dir);
  return dir;
}
