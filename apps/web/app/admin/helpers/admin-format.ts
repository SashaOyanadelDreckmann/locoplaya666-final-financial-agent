import type { ResearchAnalyticsStage } from '@/lib/api/admin';

export const ADMIN_TAB_IDS = ['overview', 'users', 'activity', 'ops', 'archive'] as const;
export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export function stepAdminTab(tab: AdminTabId, direction: 'prev' | 'next'): AdminTabId {
  const index = ADMIN_TAB_IDS.indexOf(tab);
  if (index < 0) return tab;
  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= ADMIN_TAB_IDS.length) return tab;
  return ADMIN_TAB_IDS[nextIndex];
}

export function canStepAdminTab(tab: AdminTabId, direction: 'prev' | 'next'): boolean {
  const index = ADMIN_TAB_IDS.indexOf(tab);
  if (index < 0) return false;
  if (direction === 'next') return index < ADMIN_TAB_IDS.length - 1;
  return index > 0;
}

export function parseAdminTab(value: string | null | undefined): AdminTabId {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (ADMIN_TAB_IDS.includes(normalized as AdminTabId)) {
    return normalized as AdminTabId;
  }
  if (normalized === 'interactions' || normalized === 'analytics') {
    return 'activity';
  }
  if (normalized === 'platform' || normalized === 'system') {
    return 'ops';
  }
  return 'overview';
}

export function formatAdminUsd(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

export function approvalBadgeClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING_APPROVAL') return 'admin-badge admin-badge--amber';
  if (normalized === 'REJECTED') return 'admin-badge admin-badge--danger';
  return 'admin-badge admin-badge--lime';
}

export function approvalLabel(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING_APPROVAL') return 'Pendiente';
  if (normalized === 'REJECTED') return 'Rechazado';
  return 'Aprobado';
}

export function formatAdminNumber(value: number): string {
  return new Intl.NumberFormat('es-CL').format(Math.max(0, Math.round(value)));
}

export function formatAdminPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

export function formatAdminDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatAdminAnonymousId(id: string, max = 20): string {
  const clean = String(id ?? '').trim();
  if (!clean) return '—';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

export function compactAdminText(value: string, max = 140): string {
  const clean = String(value ?? '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

export const stageLabels: Record<ResearchAnalyticsStage, string> = {
  new: 'Nuevo',
  onboarding: 'Onboarding',
  diagnosis: 'Diagnóstico',
  building: 'Construcción',
  active: 'Activo',
  advanced: 'Avanzado',
  stale: 'Inactivo',
};

export const stageOrder: ResearchAnalyticsStage[] = [
  'new',
  'onboarding',
  'diagnosis',
  'building',
  'active',
  'advanced',
  'stale',
];

export function progressTone(score: number): 'lime' | 'amber' | 'cyan' {
  if (score >= 75) return 'lime';
  if (score >= 50) return 'amber';
  return 'cyan';
}

export function roleBadgeClass(role: string): string {
  const normalized = role.toUpperCase();
  if (normalized === 'ADMIN') return 'admin-badge admin-badge--accent';
  if (normalized === 'ANALYST') return 'admin-badge admin-badge--muted';
  return 'admin-badge admin-badge--slate';
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
