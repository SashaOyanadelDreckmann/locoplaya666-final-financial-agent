'use client';

import type { AdminCockpitSnapshot } from '@/lib/api/admin';
import {
  approvalBadgeClass,
  approvalLabel,
  formatAdminDateTime,
  formatAdminNumber,
  formatAdminPercent,
  formatAdminUsd,
  roleBadgeClass,
} from '../helpers/admin-format';

export function AdminOpsPanel({ cockpit }: { cockpit: AdminCockpitSnapshot | null }) {
  if (!cockpit) {
    return <p className="admin-muted">Cargando telemetría de plataforma…</p>;
  }

  const { platform, observability, research } = cockpit;

  return (
    <div className="admin-ops-grid">
      <article className="admin-card">
        <h2 className="admin-card-title">Aprobaciones & acceso</h2>
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
                    <div className="admin-muted" style={{ fontSize: 12 }}>{user.email}</div>
                  </div>
                  <span className={approvalBadgeClass('PENDING_APPROVAL')}>{approvalLabel('PENDING_APPROVAL')}</span>
                </div>
                <div className="admin-muted" style={{ fontSize: 12 }}>{formatAdminDateTime(user.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Economía Fincoin</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>USD total gastado</span><strong>{formatAdminUsd(platform.fincoin.totalUsdSpent)}</strong></div>
          <div className="admin-stat"><span>Promedio / usuario</span><strong>{formatAdminUsd(platform.fincoin.avgUsdPerUser)}</strong></div>
          <div className="admin-stat"><span>Wallets activas</span><strong>{formatAdminNumber(platform.fincoin.activeWallets)}</strong></div>
          <div className="admin-stat"><span>Agotadas</span><strong>{formatAdminNumber(platform.fincoin.depletedUsers)}</strong></div>
        </div>
        <div className="admin-tags" style={{ marginTop: 12 }}>
          {(research.topTools ?? []).slice(0, 5).map((item) => (
            <span key={item.tool} className="admin-tag">{item.tool} ({item.count})</span>
          ))}
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Inventario de datos</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Sesiones</span><strong>{formatAdminNumber(platform.totals.sessions)}</strong></div>
          <div className="admin-stat"><span>Documentos</span><strong>{formatAdminNumber(platform.totals.documents)}</strong></div>
          <div className="admin-stat"><span>Perfiles</span><strong>{formatAdminNumber(platform.totals.profiles)}</strong></div>
          <div className="admin-stat"><span>Turns DB</span><strong>{formatAdminNumber(platform.totals.conversationTurns)}</strong></div>
        </div>
        <div className="admin-table-wrap" style={{ marginTop: 12 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {(['USER', 'ANALYST', 'ADMIN'] as const).map((role) => (
                <tr key={role}>
                  <td><span className={roleBadgeClass(role)}>{role}</span></td>
                  <td>{formatAdminNumber(platform.byRole[role] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="admin-card">
        <h2 className="admin-card-title">Salud del API (runtime)</h2>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Requests</span><strong>{formatAdminNumber(observability.http.totalRequests)}</strong></div>
          <div className="admin-stat"><span>Latencia media</span><strong>{formatAdminNumber(observability.http.avgLatencyMs)} ms</strong></div>
          <div className="admin-stat"><span>4xx</span><strong>{formatAdminNumber(observability.http.totalClientErrors)}</strong></div>
          <div className="admin-stat"><span>5xx</span><strong>{formatAdminNumber(observability.http.totalServerErrors)}</strong></div>
        </div>
        <div className="admin-table-wrap" style={{ marginTop: 12 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Hits</th>
                <th>Avg ms</th>
              </tr>
            </thead>
            <tbody>
              {observability.topEndpoints.map((entry) => (
                <tr key={entry.route}>
                  <td>{entry.route}</td>
                  <td>{formatAdminNumber(entry.count)}</td>
                  <td>{formatAdminNumber(entry.avgMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  <td><span className={roleBadgeClass(user.role)}>{user.role}</span></td>
                  <td><span className={approvalBadgeClass(user.approvalStatus)}>{approvalLabel(user.approvalStatus)}</span></td>
                  <td>{formatAdminDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="admin-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Adopción: intake {formatAdminPercent(research.intakeCompletionRate)} • perfil {formatAdminPercent(research.profileAttachmentRate)} • docs {formatAdminPercent(research.documentAdoptionRate)}
        </p>
      </article>
    </div>
  );
}
