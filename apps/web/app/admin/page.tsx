'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSessionInfo } from '@/lib/api';
import {
  fetchResearchAnalyticsReport,
  type ResearchAnalyticsCohort,
  type ResearchAnalyticsReport,
  type ResearchAnalyticsStage,
  type ResearchAnalyticsUser,
} from '@/lib/admin';
import { toUserFacingError } from '@/lib/userError';

type SessionInfo = {
  role?: string;
  name?: string;
};

const stageLabels: Record<ResearchAnalyticsStage, string> = {
  new: 'Nuevo',
  onboarding: 'Onboarding',
  diagnosis: 'Diagnóstico',
  building: 'Construcción',
  active: 'Activo',
  advanced: 'Avanzado',
  stale: 'Inactivo',
};

const stageOrder: ResearchAnalyticsStage[] = ['new', 'onboarding', 'diagnosis', 'building', 'active', 'advanced', 'stale'];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CL').format(Math.max(0, Math.round(value)));
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function progressTone(score: number): string {
  if (score >= 75) return 'lime';
  if (score >= 50) return 'amber';
  return 'cyan';
}

function filteredTarget(user: ResearchAnalyticsUser): string {
  return `${user.pseudonymId} ${user.stage} ${user.role} ${user.createdAtMonth}`.toLowerCase();
}

function cohortTarget(cohort: ResearchAnalyticsCohort): string {
  return `${cohort.month} ${cohort.users}`.toLowerCase();
}

export default function AdminPanelPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  const [report, setReport] = useState<ResearchAnalyticsReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<ResearchAnalyticsStage | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await getSessionInfo();
        if (!mounted) return;
        const role = String((info as SessionInfo)?.role ?? '').toUpperCase();
        setSessionInfo(info as SessionInfo);
        setIsAllowed(role === 'ADMIN');
      } catch {
        if (!mounted) return;
        setIsAllowed(false);
      } finally {
        if (mounted) setIsSessionLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const loadReport = async () => {
    setLoadingReport(true);
    setError(null);
    try {
      const payload = await fetchResearchAnalyticsReport();
      setReport(payload);
      setSelectedUserId((prev) => prev || payload.users[0]?.pseudonymId || '');
    } catch (err) {
      setError(toUserFacingError(err));
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    loadReport();
  }, [isAllowed]);

  const filteredUsers = useMemo(() => {
    const users = report?.users ?? [];
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (stageFilter !== 'all' && user.stage !== stageFilter) return false;
      if (!query) return true;
      return filteredTarget(user).includes(query);
    });
  }, [report, search, stageFilter]);

  useEffect(() => {
    if (filteredUsers.length === 0) {
      setSelectedUserId('');
      return;
    }
    if (!filteredUsers.some((user) => user.pseudonymId === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].pseudonymId);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = useMemo(() => {
    return filteredUsers.find((user) => user.pseudonymId === selectedUserId) ?? null;
  }, [filteredUsers, selectedUserId]);

  const summary = report?.summary;
  const topCohort = report?.cohorts?.[report.cohorts.length - 1] ?? null;
  const stageCards = stageOrder.map((stage) => ({
    stage,
    label: stageLabels[stage],
    count: summary?.stageCounts?.[stage] ?? 0,
  }));

  if (isSessionLoading) {
    return (
      <main className="research-shell">
        <p className="research-muted">Cargando sesión…</p>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="research-shell">
        <section className="research-card">
          <h1 className="research-title">Research cockpit</h1>
          <p className="research-muted">Solo disponible para rol ADMIN.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="research-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">Research cockpit privado</div>
          <h1 className="research-title">Avance real de usuarios, sin PII y listo para conclusiones.</h1>
          <p className="research-muted">
            Vista anónima por pseudónimo, cohortes, stage del journey, score de progreso y actividad reciente.
          </p>
          <div className="hero-meta">
            <span>Admin: <strong>{sessionInfo?.name ?? 'ADMIN'}</strong></span>
            <span>Usuarios: <strong>{formatNumber(summary?.totalUsers ?? 0)}</strong></span>
            <span>Actualizado: <strong>{report?.generatedAt ? new Date(report.generatedAt).toLocaleString('es-CL') : '—'}</strong></span>
          </div>
        </div>
        <div className="hero-actions">
          <button type="button" className="research-btn" disabled={loadingReport} onClick={loadReport}>
            {loadingReport ? 'Actualizando…' : 'Actualizar'}
          </button>
          <div className="privacy-pill">Pseudonimizado por defecto</div>
          <div className="privacy-note">Sin nombres, emails ni texto crudo en esta vista.</div>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card">
          <span className="kpi-label">Activos 7d</span>
          <strong>{formatNumber(summary?.activeUsers7d ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Activos 30d</span>
          <strong>{formatNumber(summary?.activeUsers30d ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Progreso promedio</span>
          <strong>{formatPercent(summary?.avgProgressScore ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Knowledge score</span>
          <strong>{formatNumber(summary?.avgKnowledgeScore ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Intake</span>
          <strong>{formatPercent(summary?.intakeCompletionRate ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Documentos</span>
          <strong>{formatPercent(summary?.documentAdoptionRate ?? 0)}</strong>
        </article>
      </section>

      <section className="content-grid">
        <article className="research-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Funnel de progreso</h2>
              <p className="research-muted-sm">Resumen de cohortes y stage del journey.</p>
            </div>
            <select className="research-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as ResearchAnalyticsStage | 'all')}>
              <option value="all">Todos los stages</option>
              {stageOrder.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </div>

          <div className="funnel-list">
            {stageCards.map((item) => {
              const max = Math.max(1, summary?.totalUsers ?? 1);
              const width = Math.max(4, Math.round((item.count / max) * 100));
              return (
                <div key={item.stage} className="funnel-row">
                  <div className="funnel-row-head">
                    <span>{item.label}</span>
                    <strong>{formatNumber(item.count)}</strong>
                  </div>
                  <div className="funnel-track">
                    <div className="funnel-fill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="section-divider" />

          <div className="section-header">
            <div>
              <h2 className="section-title">Cohortes</h2>
              <p className="research-muted-sm">Agrupadas por mes de alta.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="research-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Usuarios</th>
                  <th>Activos 7d</th>
                  <th>Activos 30d</th>
                  <th>Progreso</th>
                </tr>
              </thead>
              <tbody>
                {(report?.cohorts ?? []).map((cohort) => {
                  const query = search.trim().toLowerCase();
                  if (query && !cohortTarget(cohort).includes(query)) {
                    return null;
                  }
                  return (
                    <tr key={cohort.month}>
                      <td>{cohort.month}</td>
                      <td>{formatNumber(cohort.users)}</td>
                      <td>{formatNumber(cohort.active7d)}</td>
                      <td>{formatNumber(cohort.active30d)}</td>
                      <td>{formatPercent(cohort.avgProgressScore)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="research-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Participantes anónimos</h2>
              <p className="research-muted-sm">Busca por pseudónimo, stage o mes de alta.</p>
            </div>
          </div>
          <input
            className="research-input"
            placeholder="Buscar por P-XXXX, stage o mes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {error ? <p className="research-error">{error}</p> : null}

          <div className="user-list">
            {filteredUsers.map((user) => {
              const tone = progressTone(user.progressScore);
              return (
                <button
                  key={user.pseudonymId}
                  type="button"
                  className={`user-row ${selectedUserId === user.pseudonymId ? 'is-selected' : ''}`}
                  onClick={() => setSelectedUserId(user.pseudonymId)}
                >
                  <div className="user-row-head">
                    <div>
                      <strong>{user.pseudonymId}</strong>
                      <div className="research-muted-sm">{stageLabels[user.stage]} • {user.createdAtMonth} • {user.role}</div>
                    </div>
                    <span className={`score-badge tone-${tone}`}>{formatPercent(user.progressScore)}</span>
                  </div>
                  <div className="user-row-stats">
                    <span>{formatNumber(user.interactionsCount)} interacciones</span>
                    <span>{formatNumber(user.documentsCount)} docs</span>
                    <span>{formatNumber(user.toolsUsedCount)} tools</span>
                  </div>
                </button>
              );
            })}
            {filteredUsers.length === 0 && <p className="research-muted-sm">Sin resultados con esos filtros.</p>}
          </div>
        </article>
      </section>

      <section className="detail-grid">
        <article className="research-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Detalle del participante</h2>
              <p className="research-muted-sm">Detalle agregado, sin datos personales.</p>
            </div>
          </div>
          {!selectedUser ? (
            <p className="research-muted">Selecciona un participante.</p>
          ) : (
            <div className="detail-panel">
              <div className="detail-grid-cards">
                <div className="detail-stat">
                  <span>Pseudónimo</span>
                  <strong>{selectedUser.pseudonymId}</strong>
                </div>
                <div className="detail-stat">
                  <span>Stage</span>
                  <strong>{stageLabels[selectedUser.stage]}</strong>
                </div>
                <div className="detail-stat">
                  <span>Progreso</span>
                  <strong>{formatPercent(selectedUser.progressScore)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Última actividad</span>
                  <strong>{selectedUser.lastActivityBucket}</strong>
                </div>
                <div className="detail-stat">
                  <span>Edad de cuenta</span>
                  <strong>{selectedUser.daysSinceCreated} d</strong>
                </div>
                <div className="detail-stat">
                  <span>Última sesión</span>
                  <strong>{selectedUser.lastSessionSeenAtBucket}</strong>
                </div>
              </div>

              <div className="tag-cloud">
                {selectedUser.modesUsed.map((mode) => (
                  <span key={mode} className="tag">{mode}</span>
                ))}
                {selectedUser.hasIntake ? <span className="tag">intake</span> : null}
                {selectedUser.hasProfile ? <span className="tag">profile</span> : null}
                {selectedUser.hasDocuments ? <span className="tag">documents</span> : null}
              </div>

              <div className="detail-columns">
                <div>
                  <h3 className="mini-title">Actividad</h3>
                  <ul className="detail-list">
                    <li>{formatNumber(selectedUser.sessionsCount)} sesiones</li>
                    <li>{formatNumber(selectedUser.interactionsCount)} interacciones</li>
                    <li>{formatNumber(selectedUser.artifactsGeneratedCount)} artefactos</li>
                  </ul>
                </div>
                <div>
                  <h3 className="mini-title">Señales de avance</h3>
                  <ul className="detail-list">
                    <li>Documents: {formatNumber(selectedUser.documentsCount)}</li>
                    <li>Sheets: {formatNumber(selectedUser.sheetsCount)}</li>
                    <li>Reports: {formatNumber(selectedUser.savedReportsCount)}</li>
                  </ul>
                </div>
                <div>
                  <h3 className="mini-title">Scores</h3>
                  <ul className="detail-list">
                    <li>Knowledge: {formatNumber(selectedUser.knowledgeScore)}</li>
                    <li>Base: {formatNumber(selectedUser.knowledgeBaseScore)}</li>
                    <li>Rows: {formatNumber(selectedUser.budgetRowsCount)}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="research-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Lectura ejecutiva</h2>
              <p className="research-muted-sm">Listo para tomar decisiones sin abrir datos sensibles.</p>
            </div>
          </div>
          <div className="insight-stack">
            <div className="insight">
              <strong>Top cohort</strong>
              <span>{topCohort ? `${topCohort.month} • ${formatNumber(topCohort.users)} usuarios` : '—'}</span>
            </div>
            <div className="insight">
              <strong>Adopción</strong>
              <span>{formatPercent(summary?.profileAttachmentRate ?? 0)} con perfil y {formatPercent(summary?.documentAdoptionRate ?? 0)} con documentos</span>
            </div>
            <div className="insight">
              <strong>Actividad</strong>
              <span>{formatNumber(summary?.activeUsers7d ?? 0)} activos en 7 días y {formatNumber(summary?.activeUsers30d ?? 0)} en 30 días</span>
            </div>
            <div className="insight">
              <strong>Distribución</strong>
              <span>{(summary?.topModes ?? []).slice(0, 3).map((item) => `${item.mode} (${item.count})`).join(' • ') || '—'}</span>
            </div>
          </div>
        </article>
      </section>

      <style jsx>{`
        .research-shell {
          min-height: 100vh;
          padding: 24px;
          display: grid;
          gap: 16px;
          color: #eef4ff;
          background:
            radial-gradient(circle at top left, rgba(46, 131, 255, 0.22), transparent 32%),
            radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 30%),
            linear-gradient(180deg, #07111d 0%, #0a1423 100%);
        }

        .hero-card,
        .research-card {
          background: rgba(11, 18, 30, 0.84);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 18px;
          padding: 18px;
          backdrop-filter: blur(10px);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
        }

        .hero-card {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(260px, 320px);
          gap: 18px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #8fb8ff;
          background: rgba(46, 131, 255, 0.12);
          border: 1px solid rgba(46, 131, 255, 0.22);
          margin-bottom: 10px;
        }

        .research-title {
          font-size: clamp(28px, 3vw, 48px);
          margin: 0;
          line-height: 1.03;
        }

        .research-muted {
          color: rgba(233, 241, 255, 0.72);
          max-width: 70ch;
        }

        .research-muted-sm {
          color: rgba(233, 241, 255, 0.62);
          font-size: 13px;
        }

        .hero-meta,
        .hero-actions {
          display: grid;
          gap: 10px;
          align-content: start;
        }

        .privacy-pill,
        .privacy-note {
          border-radius: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
        }

        .kpi-card {
          padding: 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          gap: 8px;
        }

        .kpi-label {
          color: rgba(233, 241, 255, 0.62);
          font-size: 13px;
        }

        .content-grid,
        .detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 16px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .section-title {
          margin: 0 0 4px;
          font-size: 18px;
        }

        .research-btn,
        .research-select,
        .research-input {
          width: 100%;
          min-height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #eef4ff;
          padding: 10px 12px;
        }

        .funnel-list,
        .user-list,
        .insight-stack {
          display: grid;
          gap: 10px;
        }

        .funnel-row {
          display: grid;
          gap: 8px;
        }

        .funnel-row-head,
        .user-row-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }

        .funnel-track {
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
        }

        .funnel-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(59, 130, 246, 0.92), rgba(16, 185, 129, 0.92));
        }

        .section-divider {
          height: 1px;
          margin: 16px 0;
          background: rgba(255, 255, 255, 0.08);
        }

        .table-wrap {
          overflow: auto;
        }

        .research-table {
          width: 100%;
          border-collapse: collapse;
        }

        .research-table th,
        .research-table td {
          text-align: left;
          padding: 10px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
        }

        .user-row {
          width: 100%;
          text-align: left;
          border-radius: 16px;
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: inherit;
          display: grid;
          gap: 10px;
        }

        .user-row.is-selected {
          border-color: rgba(59, 130, 246, 0.48);
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.22);
        }

        .user-row-stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          color: rgba(233, 241, 255, 0.7);
          font-size: 13px;
        }

        .score-badge {
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          border: 1px solid transparent;
        }

        .tone-lime {
          background: rgba(34, 197, 94, 0.14);
          border-color: rgba(34, 197, 94, 0.22);
          color: #a7f3d0;
        }

        .tone-amber {
          background: rgba(245, 158, 11, 0.14);
          border-color: rgba(245, 158, 11, 0.22);
          color: #fde68a;
        }

        .tone-cyan {
          background: rgba(56, 189, 248, 0.14);
          border-color: rgba(56, 189, 248, 0.22);
          color: #a5f3fc;
        }

        .detail-panel {
          display: grid;
          gap: 14px;
        }

        .detail-grid-cards {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .detail-stat {
          border-radius: 14px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          gap: 6px;
        }

        .detail-stat span,
        .mini-title {
          color: rgba(233, 241, 255, 0.62);
          font-size: 13px;
          margin: 0;
        }

        .detail-columns {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .detail-list {
          margin: 8px 0 0;
          padding-left: 18px;
          color: rgba(233, 241, 255, 0.82);
          display: grid;
          gap: 6px;
        }

        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tag {
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(233, 241, 255, 0.8);
          font-size: 12px;
        }

        .research-error {
          color: #fca5a5;
        }

        @media (max-width: 1100px) {
          .hero-card,
          .content-grid,
          .detail-grid {
            grid-template-columns: 1fr;
          }

          .kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .detail-grid-cards,
          .detail-columns {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .research-shell {
            padding: 16px;
          }

          .kpi-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
