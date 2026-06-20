import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getPersistenceMode } from '../persistencia/provider';

export const ADMIN_AUDIT_ACTIONS = {
  USER_APPROVE: 'user.approve',
  USER_REJECT: 'user.reject',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_DELETE: 'user.delete',
  DOSSIER_VIEW: 'dossier.view',
  ARCHIVE_USER_VIEW: 'archive.user_view',
  ARCHIVE_EXPORT: 'archive.export',
  CSV_EXPORT: 'csv.export',
} as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

export type AdminAuditEntry = {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: AdminAuditAction;
  targetUserId?: string;
  meta?: Record<string, unknown>;
};

const MAX_AUDIT_ENTRIES = 2000;
const auditEntries: AdminAuditEntry[] = [];

function auditFilePath(): string | null {
  const dataDir = process.env.DATA_DIR?.trim();
  if (!dataDir) return null;
  return path.join(dataDir, 'admin-audit.json');
}

function persistAuditEntries(): void {
  const filePath = auditFilePath();
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(auditEntries.slice(0, MAX_AUDIT_ENTRIES), null, 2), 'utf8');
  } catch {
    // Best-effort persistence for dev/test.
  }
}

function hydrateAuditEntries(): void {
  const filePath = auditFilePath();
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AdminAuditEntry[];
    if (!Array.isArray(raw)) return;
    auditEntries.splice(0, auditEntries.length, ...raw.slice(0, MAX_AUDIT_ENTRIES));
  } catch {
    // Ignore corrupt audit files.
  }
}

let hydrated = false;

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateAuditEntries();
}

export function logAdminAudit(entry: Omit<AdminAuditEntry, 'id' | 'at'> & { at?: string }): AdminAuditEntry {
  ensureHydrated();
  const record: AdminAuditEntry = {
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetUserId: entry.targetUserId,
    meta: entry.meta,
  };
  auditEntries.unshift(record);
  if (auditEntries.length > MAX_AUDIT_ENTRIES) {
    auditEntries.length = MAX_AUDIT_ENTRIES;
  }
  persistAuditEntries();
  return record;
}

export function listAdminAuditEntries(params: {
  limit?: number;
  offset?: number;
}): { entries: AdminAuditEntry[]; total: number } {
  ensureHydrated();
  const limit = Math.max(1, Math.min(params.limit ?? 80, 200));
  const offset = Math.max(0, params.offset ?? 0);
  const slice = auditEntries.slice(offset, offset + limit);
  return { entries: slice, total: auditEntries.length };
}

export function resetAdminAuditForTests(): void {
  auditEntries.length = 0;
  hydrated = true;
  const filePath = auditFilePath();
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}

export function getAdminAuditPersistenceLabel(): string {
  return getPersistenceMode() === 'postgres' ? 'postgres+file' : 'memory+file';
}
