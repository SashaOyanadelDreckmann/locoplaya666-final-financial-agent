import fs from 'fs/promises';
import path from 'path';
import { getConfig } from '../config';
import { isBootstrapped } from '../mcp/tools/registry';
import { getPersistenceMode, getPrismaClient } from '../persistencia/provider';

const DB_PING_TIMEOUT_MS = 5_000;
const ARTIFACT_STORAGE_PROBE_DIR = path.join('pdfs', '.healthcheck');

export type HealthCheckStatus = 'ok' | 'fail' | 'degraded' | 'skipped';

export type ReadinessChecks = {
  database: {
    status: HealthCheckStatus;
    mode: 'postgres' | 'memory';
    latencyMs?: number;
    error?: string;
  };
  mcp: {
    status: HealthCheckStatus;
  };
  approvalEmail: {
    status: HealthCheckStatus;
    detail?: string;
  };
  artifactStorage: {
    status: HealthCheckStatus;
    path: string;
    writable: boolean;
    detail?: string;
    error?: string;
  };
};

export type ReadinessReport = {
  ready: boolean;
  status: 'ok' | 'degraded' | 'fail';
  checks: ReadinessChecks;
  timestamp: string;
};

export type LivenessReport = {
  status: 'ok';
  uptimeSec: number;
  timestamp: string;
};

const startedAtMs = Date.now();

export async function pingDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const config = getConfig();

  if (!config.DATABASE_URL) {
    if (config.NODE_ENV === 'production') {
      return { ok: false, latencyMs: 0, error: 'DATABASE_URL not configured' };
    }
    return { ok: true, latencyMs: 0 };
  }

  const started = Date.now();
  try {
    const prisma = await getPrismaClient();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database ping timeout')), DB_PING_TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getApprovalEmailCheck(): ReadinessChecks['approvalEmail'] {
  const config = getConfig();
  if (config.RESEND_API_KEY?.trim()) {
    return { status: 'ok' };
  }
  return {
    status: 'degraded',
    detail: 'RESEND_API_KEY not configured; approval request emails are disabled',
  };
}

export async function pingArtifactStorage(): Promise<{
  ok: boolean;
  path: string;
  writable: boolean;
  error?: string;
}> {
  const config = getConfig();
  const baseDir = path.resolve(config.DATA_DIR);
  const probeDir = path.join(baseDir, ARTIFACT_STORAGE_PROBE_DIR);
  const probeFile = path.join(probeDir, `probe-${process.pid}-${Date.now()}.tmp`);
  const payload = `healthcheck:${Date.now()}`;

  try {
    await fs.mkdir(probeDir, { recursive: true });
    await fs.writeFile(probeFile, payload, 'utf8');
    const readBack = await fs.readFile(probeFile, 'utf8');
    if (readBack !== payload) {
      return {
        ok: false,
        path: baseDir,
        writable: false,
        error: 'Artifact storage probe read mismatch',
      };
    }
    await fs.unlink(probeFile);
    return { ok: true, path: baseDir, writable: true };
  } catch (error: unknown) {
    return {
      ok: false,
      path: baseDir,
      writable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getArtifactStorageCheck(
  ping: Awaited<ReturnType<typeof pingArtifactStorage>>,
): ReadinessChecks['artifactStorage'] {
  const config = getConfig();
  const detail =
    config.NODE_ENV === 'production'
      ? 'Mount a persistent volume at DATA_DIR (/app/data) so generated PDFs survive redeploys'
      : undefined;

  if (ping.ok) {
    return {
      status: 'ok',
      path: ping.path,
      writable: true,
      detail,
    };
  }

  return {
    status: config.NODE_ENV === 'production' ? 'fail' : 'degraded',
    path: ping.path,
    writable: false,
    detail,
    ...(ping.error ? { error: ping.error } : {}),
  };
}

export async function getReadinessReport(): Promise<ReadinessReport> {
  const config = getConfig();
  const [dbPing, artifactPing] = await Promise.all([pingDatabase(), pingArtifactStorage()]);
  const approvalEmail = getApprovalEmailCheck();
  const artifactStorage = getArtifactStorageCheck(artifactPing);
  const mcpReady = isBootstrapped() || process.env.NODE_ENV === 'test';

  let persistenceMode: 'postgres' | 'memory' = 'memory';
  try {
    persistenceMode = getPersistenceMode();
  } catch {
    persistenceMode = config.DATABASE_URL ? 'postgres' : 'memory';
  }

  const databaseStatus: HealthCheckStatus = !config.DATABASE_URL
    ? config.NODE_ENV === 'production'
      ? 'fail'
      : 'skipped'
    : dbPing.ok
      ? 'ok'
      : 'fail';

  const checks: ReadinessChecks = {
    database: {
      status: databaseStatus,
      mode: persistenceMode,
      ...(dbPing.latencyMs > 0 ? { latencyMs: dbPing.latencyMs } : {}),
      ...(dbPing.error ? { error: dbPing.error } : {}),
    },
    mcp: {
      status: mcpReady ? 'ok' : 'fail',
    },
    approvalEmail,
    artifactStorage,
  };

  const databaseReady = !config.DATABASE_URL
    ? config.NODE_ENV !== 'production'
    : dbPing.ok;
  const artifactStorageReady =
    config.NODE_ENV === 'production' ? artifactStorage.status === 'ok' : artifactStorage.status !== 'fail';
  const ready = databaseReady && mcpReady && artifactStorageReady;
  const status: ReadinessReport['status'] = ready
    ? approvalEmail.status === 'degraded' || artifactStorage.status === 'degraded'
      ? 'degraded'
      : 'ok'
    : 'fail';

  return {
    ready,
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}

export function getLivenessReport(): LivenessReport {
  return {
    status: 'ok',
    uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000),
    timestamp: new Date().toISOString(),
  };
}

export async function verifyDatabaseAtStartup(maxAttempts = 5, delayMs = 2_000): Promise<void> {
  const config = getConfig();
  if (config.NODE_ENV !== 'production' || !config.DATABASE_URL) {
    return;
  }

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await pingDatabase();
    if (result.ok) {
      return;
    }
    lastError = result.error ?? 'database ping failed';
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Database connectivity check failed after ${maxAttempts} attempts: ${lastError}`);
}
