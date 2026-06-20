'use client';

import type { AdminAuditEntry, AdminCockpitSnapshot } from '@/lib/api/admin';
import {
  approvalBadgeClass,
  approvalLabel,
  formatAdminDateTime,
  formatAdminNumber,
  formatAdminPercent,
  formatAdminUsd,
  roleBadgeClass,
} from '../helpers/admin-format';

type Props = {
  cockpit: AdminCockpitSnapshot | null;
  auditEntries: AdminAuditEntry[];
  pendingActionId?: string;
  onApprove: (userId: string) => void | Promise<void>;
  onReject: (userId: string) => void | Promise<void>;
  onRoleChange: (userId: string, role: 'USER' | 'ANALYST' | 'ADMIN') => void | Promise<void>;
};

const ROLE_OPTIONS = ['USER', 'ANALYST', 'ADMIN'] as const;

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'user.approve': 'Aprobación',
    'user.reject': 'Rechazo',
    'user.role_change': 'Cambio de rol',
    'user.delete': 'Eliminación',
    'dossier.view': 'Dossier',
    'archive.user_view': 'Archivo',
    'archive.export': 'Export JSON',
    'csv.export': 'Export CSV',
  };
  return labels[action] ?? action;
}

export function AdminOpsPanel({
  cockpit,
  auditEntries,
  pendingActionId,
  onApprove,
  onReject,
  onRoleChange,
}: Props) {
  if (!cockpit) {
    return <p className="admin-muted">Cargando telemetría de plataforma…</p>;
  }

  const { platform, observability, research } = cockpit;

  return (
    <div className="admin-ops-grid">
      <article className="admin-card">
        <h2 className="admin-card-title">Aprobaciones</h2>
        <p className="admin-card-sub">Gestiona cuentas pendientes sin salir del panel.</p>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Pendientes</span><strong>{formatAdminNumber(platform.byApproval.PENDING_APPROVAL ?? 0)}</strong></div>
          <div className="admin-stat"><span>Aprobados</span><strong>{formatAdminNumber(platform.byApproval.APPROVED ?? 0)}</strong></div>
          <div className="admin-stat"><span>Rechazados</span><strong>{formatAdminNumber(platform.byApproval.REJECTED ?? 0)}</strong></div>
        </div>
        <div className="admin-list admin-list--relaxed" style={{ marginTop: 12 }}>
          {platform.pendingApprovals.length === 0 ? (
            <p className="admin-empty">Sin cuentas pendientes.</p>
          ) : (
            platform.pendingApprovals.map((user) => (
              <div key={user.id} className="admin-list-item">
                <div className="admin-list-item-head">
                  <div>
                    <strong>{user.name}</strong>
                    <div className="admin-muted admin-table-sub">{user.email}</div>
                  </div>
                  <span className={approvalBadgeClass('PENDING_APPROVAL')}>{approvalLabel('PENDING_APPROVAL')}</span>
                </div>
                <div className="admin-muted admin-table-sub">{formatAdminDateTime(user.createdAt)}</div>
                <div className="admin-inline-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary admin-btn--compact"
                    disabled={pendingActionId === user.id}
                    onClick={() => void onApprove(user.id)}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger admin-btn--compact"
                    disabled={pendingActionId === user.id}
                    onClick={() => void onReject(user.id)}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Economía Fincoin</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>USD total</span><strong>{formatAdminUsd(platform.fincoin.totalUsdSpent)}</strong></div>
          <div className="admin-stat"><span>Promedio</span><strong>{formatAdminUsd(platform.fincoin.avgUsdPerUser)}</strong></div>
          <div className="admin-stat"><span>Activas</span><strong>{formatAdminNumber(platform.fincoin.activeWallets)}</strong></div>
          <div className="admin-stat"><span>Agotadas</span><strong>{formatAdminNumber(platform.fincoin.depletedUsers)}</strong></div>
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Inventario</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Sesiones</span><strong>{formatAdminNumber(platform.totals.sessions)}</strong></div>
          <div className="admin-stat"><span>Documentos</span><strong>{formatAdminNumber(platform.totals.documents)}</strong></div>
          <div className="admin-stat"><span>Perfiles</span><strong>{formatAdminNumber(platform.totals.profiles)}</strong></div>
          <div className="admin-stat"><span>Turns</span><strong>{formatAdminNumber(platform.totals.conversationTurns)}</strong></div>
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Salud API</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Requests</span><strong>{formatAdminNumber(observability.http.totalRequests)}</strong></div>
          <div className="admin-stat"><span>Latencia</span><strong>{formatAdminNumber(observability.http.avgLatencyMs)} ms</strong></div>
          <div className="admin-stat"><span>4xx</span><strong>{formatAdminNumber(observability.http.totalClientErrors)}</strong></div>
          <div className="admin-stat"><span>5xx</span><strong>{formatAdminNumber(observability.http.totalServerErrors)}</strong></div>
        </div>
      </article>

      <article className="admin-card admin-ops-wide">
        <h2 className="admin-card-title">Altas recientes</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {platform.recentSignups.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      className="admin-select admin-select--compact"
                      value={user.role}
                      disabled={pendingActionId === user.id}
                      onChange={(event) =>
                        void onRoleChange(user.id, event.target.value as 'USER' | 'ANALYST' | 'ADMIN')
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                  <td><span className={approvalBadgeClass(user.approvalStatus)}>{approvalLabel(user.approvalStatus)}</span></td>
                  <td>{formatAdminDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="admin-muted admin-card-foot">
          Adopción: intake {formatAdminPercent(research.intakeCompletionRate)} · docs {formatAdminPercent(research.documentAdoptionRate)}
        </p>
      </article>

      <article className="admin-card admin-ops-wide">
        <h2 className="admin-card-title">Auditoría</h2>
        <p className="admin-card-sub">Acciones administrativas recientes.</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-muted">Sin eventos registrados.</td>
                </tr>
              ) : (
                auditEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatAdminDateTime(entry.at)}</td>
                    <td>{entry.actorEmail}</td>
                    <td>{auditActionLabel(entry.action)}</td>
                    <td>{entry.targetUserId ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
