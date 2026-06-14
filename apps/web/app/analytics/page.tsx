'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSessionInfo } from '@/lib/api/cliente';
import {
  downloadAnalyticsInteractionsCsv,
  downloadAnalyticsUsersCsv,
  fetchAnalyticsInteractions,
  fetchAnalyticsUserActivity,
  fetchAnalyticsUsers,
  type AnalyticsInteraction,
  type AnalyticsRole,
  type AnalyticsUser,
} from '@/lib/api/analytics';
import { toUserFacingError } from '@/lib/compartido/userError';

type FilterState = {
  search: string;
  role: '' | AnalyticsRole;
  mode: string;
  fromDate: string;
  toDate: string;
};

type SessionInfo = {
  role?: string;
  name?: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: '',
  role: '',
  mode: '',
  fromDate: '',
  toDate: '',
};

function toIsoStart(dateInput: string): string | undefined {
  if (!dateInput) return undefined;
  return new Date(`${dateInput}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateInput: string): string | undefined {
  if (!dateInput) return undefined;
  return new Date(`${dateInput}T23:59:59.999Z`).toISOString();
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function compactText(value: string, max = 110): string {
  const clean = String(value ?? '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

export default function AnalyticsPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [users, setUsers] = useState<AnalyticsUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [summary, setSummary] = useState<{
    totalUsers: number;
    totalInteractions: number;
    totalSessions: number;
    totalProfiles: number;
    totalDocuments: number;
    activeUsers7d: number;
    activeUsers30d: number;
  } | null>(null);

  const [interactions, setInteractions] = useState<AnalyticsInteraction[]>([]);
  const [interactionsTotal, setInteractionsTotal] = useState(0);

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<AnalyticsUser | null>(null);
  const [selectedUserInteractions, setSelectedUserInteractions] = useState<AnalyticsInteraction[]>([]);
  const [selectedUserTotalInteractions, setSelectedUserTotalInteractions] = useState(0);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [exportingInteractions, setExportingInteractions] = useState(false);

  const apiFilters = useMemo(() => {
    return {
      search: appliedFilters.search.trim() || undefined,
      role: appliedFilters.role || undefined,
      mode: appliedFilters.mode.trim() || undefined,
      from: toIsoStart(appliedFilters.fromDate),
      to: toIsoEnd(appliedFilters.toDate),
    };
  }, [appliedFilters]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const info = await getSessionInfo();
        if (!isMounted) return;

        setSessionInfo(info as SessionInfo);
        const role = String((info as SessionInfo)?.role ?? '').toUpperCase();
        setIsAllowed(role === 'ADMIN' || role === 'ANALYST');
      } catch {
        if (!isMounted) return;
        setIsAllowed(false);
      } finally {
        if (isMounted) setIsSessionLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadMainAnalytics = useCallback(async () => {
    if (!isAllowed) return;

    setLoadingData(true);
    setError(null);

    try {
      const [usersPayload, interactionsPayload] = await Promise.all([
        fetchAnalyticsUsers({
          ...apiFilters,
          limit: 120,
          offset: 0,
          sortBy: 'interactions',
          sortOrder: 'desc',
        }),
        fetchAnalyticsInteractions({
          ...apiFilters,
          limit: 120,
          offset: 0,
        }),
      ]);

      setUsers(usersPayload.users);
      setUsersTotal(usersPayload.pagination.total);
      setSummary(usersPayload.summary);
      setInteractions(interactionsPayload.interactions);
      setInteractionsTotal(interactionsPayload.pagination.total);

      if (usersPayload.users.length > 0) {
        setSelectedUserId((prev) => prev || usersPayload.users[0].id);
      } else {
        setSelectedUserId('');
        setSelectedUser(null);
        setSelectedUserInteractions([]);
        setSelectedUserTotalInteractions(0);
      }
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoadingData(false);
    }
  }, [apiFilters, isAllowed]);

  const loadUserDetail = useCallback(async () => {
    if (!isAllowed || !selectedUserId) return;

    setLoadingUserDetail(true);

    try {
      const payload = await fetchAnalyticsUserActivity(selectedUserId, {
        search: apiFilters.search,
        mode: apiFilters.mode,
        from: apiFilters.from,
        to: apiFilters.to,
        limit: 120,
        offset: 0,
      });

      setSelectedUser(payload.user);
      setSelectedUserInteractions(payload.interactions);
      setSelectedUserTotalInteractions(payload.pagination.total);
    } catch {
      setSelectedUser(null);
      setSelectedUserInteractions([]);
      setSelectedUserTotalInteractions(0);
    } finally {
      setLoadingUserDetail(false);
    }
  }, [apiFilters.from, apiFilters.mode, apiFilters.search, apiFilters.to, isAllowed, selectedUserId]);

  useEffect(() => {
    loadMainAnalytics();
  }, [loadMainAnalytics]);

  useEffect(() => {
    loadUserDetail();
  }, [loadUserDetail]);

  const metricCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: 'Usuarios', value: summary.totalUsers },
      { label: 'Interacciones', value: summary.totalInteractions },
      { label: 'Sesiones', value: summary.totalSessions },
      { label: 'Documentos', value: summary.totalDocuments },
      { label: 'Perfiles', value: summary.totalProfiles },
      { label: 'Activos 7 días', value: summary.activeUsers7d },
      { label: 'Activos 30 días', value: summary.activeUsers30d },
    ];
  }, [summary]);

  if (isSessionLoading) {
    return (
      <main className="analytics-shell">
        <p className="analytics-muted">Cargando analítica…</p>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="analytics-shell">
        <div className="analytics-card">
          <h1 className="analytics-title">Analítica de usuarios</h1>
          <p className="analytics-muted">
            Tu cuenta no tiene permisos. Necesitas rol <strong>ANALYST</strong> o <strong>ADMIN</strong>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="analytics-shell">
      <section className="analytics-card">
        <div className="analytics-header-row">
          <div>
            <h1 className="analytics-title">Panel de analítica de tesis</h1>
            <p className="analytics-muted">
              Usuario: <strong>{sessionInfo?.name ?? 'Analista'}</strong> • Usuarios: <strong>{usersTotal}</strong> • Interacciones: <strong>{interactionsTotal}</strong>
            </p>
          </div>
          <div className="analytics-actions">
            <button
              type="button"
              className="analytics-btn"
              disabled={exportingUsers || loadingData}
              onClick={async () => {
                try {
                  setExportingUsers(true);
                  await downloadAnalyticsUsersCsv({
                    ...apiFilters,
                    sortBy: 'interactions',
                    sortOrder: 'desc',
                  });
                } finally {
                  setExportingUsers(false);
                }
              }}
            >
              {exportingUsers ? 'Exportando usuarios…' : 'Exportar usuarios CSV'}
            </button>
            <button
              type="button"
              className="analytics-btn"
              disabled={exportingInteractions || loadingData}
              onClick={async () => {
                try {
                  setExportingInteractions(true);
                  await downloadAnalyticsInteractionsCsv(apiFilters);
                } finally {
                  setExportingInteractions(false);
                }
              }}
            >
              {exportingInteractions ? 'Exportando interacciones…' : 'Exportar interacciones CSV'}
            </button>
          </div>
        </div>

        <div className="analytics-filters">
          <input
            className="analytics-input"
            placeholder="Buscar por usuario/email/id"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />

          <select
            className="analytics-input"
            value={filters.role}
            onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value as FilterState['role'] }))}
          >
            <option value="">Todos los roles</option>
            <option value="USER">USER</option>
            <option value="ANALYST">ANALYST</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <input
            className="analytics-input"
            type="text"
            placeholder="Modo (ej: diagnostic_interview)"
            value={filters.mode}
            onChange={(e) => setFilters((prev) => ({ ...prev, mode: e.target.value }))}
          />

          <input
            className="analytics-input"
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
          />

          <input
            className="analytics-input"
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
          />

          <button
            type="button"
            className="analytics-btn analytics-btn-primary"
            disabled={loadingData}
            onClick={() => setAppliedFilters(filters)}
          >
            {loadingData ? 'Actualizando…' : 'Aplicar filtros'}
          </button>

          <button
            type="button"
            className="analytics-btn"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setAppliedFilters(DEFAULT_FILTERS);
            }}
          >
            Limpiar
          </button>
        </div>

        {error ? <p className="analytics-error">{error}</p> : null}

        <div className="analytics-metrics-grid">
          {metricCards.map((metric) => (
            <div key={metric.label} className="analytics-metric">
              <span className="analytics-metric-label">{metric.label}</span>
              <strong className="analytics-metric-value">{metric.value.toLocaleString('es-CL')}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-grid">
        <article className="analytics-card">
          <h2 className="analytics-subtitle">Usuarios ({users.length}/{usersTotal})</h2>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Interacciones</th>
                  <th>Docs</th>
                  <th>Perfiles</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={selectedUserId === user.id ? 'is-selected' : ''}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <td>
                      <strong>{user.name}</strong>
                      <div className="analytics-muted-sm">{user.email}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.interactionsCount}</td>
                    <td>{user.documentsCount}</td>
                    <td>{user.profilesCount}</td>
                    <td>{formatDateTime(user.lastActivityAt)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="analytics-muted-sm">Sin resultados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="analytics-card">
          <h2 className="analytics-subtitle">Interacciones recientes ({interactions.length}/{interactionsTotal})</h2>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Modo</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((item) => (
                  <tr key={`${item.userId}:${item.interactionId}`}>
                    <td>{formatDateTime(item.timestamp)}</td>
                    <td>{item.userName}</td>
                    <td>{item.mode ?? '—'}</td>
                    <td title={item.userMessage}>{compactText(item.userMessage)}</td>
                  </tr>
                ))}
                {interactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="analytics-muted-sm">Sin interacciones para este filtro</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="analytics-card">
        <h2 className="analytics-subtitle">Detalle de usuario {selectedUser ? `• ${selectedUser.name}` : ''}</h2>
        {loadingUserDetail ? (
          <p className="analytics-muted">Cargando detalle…</p>
        ) : !selectedUser ? (
          <p className="analytics-muted">Selecciona un usuario para ver su historial.</p>
        ) : (
          <>
            <div className="analytics-user-stats">
              <div><strong>{selectedUser.interactionsCount}</strong><span>interacciones</span></div>
              <div><strong>{selectedUser.sessionsCount}</strong><span>sesiones</span></div>
              <div><strong>{selectedUser.documentsCount}</strong><span>documentos</span></div>
              <div><strong>{selectedUser.savedReportsCount}</strong><span>reportes</span></div>
              <div><strong>{selectedUser.toolsUsedCount}</strong><span>tools usadas</span></div>
              <div><strong>{selectedUser.knowledgeScore}</strong><span>knowledge score</span></div>
            </div>

            <p className="analytics-muted-sm">
              {selectedUserTotalInteractions} eventos • Última interacción: {formatDateTime(selectedUser.lastInteractionAt)} • Modos: {selectedUser.modesUsed.join(', ') || '—'}
            </p>

            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Modo</th>
                    <th>Usuario</th>
                    <th>Agente</th>
                    <th>Herramientas</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUserInteractions.map((event) => (
                    <tr key={`detail:${event.interactionId}`}>
                      <td>{formatDateTime(event.timestamp)}</td>
                      <td>{event.mode ?? '—'}</td>
                      <td title={event.userMessage}>{compactText(event.userMessage, 95)}</td>
                      <td title={event.agentMessage}>{compactText(event.agentMessage, 95)}</td>
                      <td>{event.toolNames.join(', ') || '—'}</td>
                    </tr>
                  ))}
                  {selectedUserInteractions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="analytics-muted-sm">No hay eventos en el periodo filtrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <style jsx>{`
        .analytics-shell {
          min-height: 100vh;
          padding: 24px;
          display: grid;
          gap: 16px;
          background: linear-gradient(180deg, #050810 0%, #0b131f 100%);
          color: #f4f7fb;
        }

        .analytics-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .analytics-card {
          background: rgba(11, 16, 24, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 16px;
          backdrop-filter: blur(14px);
        }

        .analytics-header-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .analytics-title {
          font-size: 28px;
          line-height: 1.1;
          margin-bottom: 6px;
        }

        .analytics-subtitle {
          font-size: 18px;
          margin-bottom: 10px;
        }

        .analytics-muted {
          color: rgba(236, 243, 255, 0.72);
        }

        .analytics-muted-sm {
          color: rgba(236, 243, 255, 0.64);
          font-size: 12px;
        }

        .analytics-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: flex-start;
        }

        .analytics-filters {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }

        .analytics-input {
          width: 100%;
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(7, 11, 18, 0.7);
          color: #ecf3ff;
          padding: 8px 10px;
        }

        .analytics-btn {
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: #f4f7fb;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 600;
        }

        .analytics-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .analytics-btn-primary {
          border-color: rgba(120, 178, 238, 0.7);
          background: linear-gradient(135deg, rgba(74, 139, 198, 0.9), rgba(81, 160, 224, 0.9));
        }

        .analytics-metrics-grid {
          margin-top: 14px;
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }

        .analytics-metric {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 6px;
        }

        .analytics-metric-label {
          font-size: 12px;
          color: rgba(236, 243, 255, 0.72);
        }

        .analytics-metric-value {
          font-size: 18px;
        }

        .analytics-table-wrap {
          width: 100%;
          overflow: auto;
        }

        .analytics-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 620px;
        }

        .analytics-table th,
        .analytics-table td {
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 8px 6px;
          vertical-align: top;
          font-size: 13px;
        }

        .analytics-table tr {
          transition: background 0.2s ease;
        }

        .analytics-table tr:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .analytics-table tr.is-selected {
          background: rgba(120, 178, 238, 0.2);
        }

        .analytics-user-stats {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .analytics-user-stats div {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 6px;
        }

        .analytics-user-stats strong {
          font-size: 20px;
          line-height: 1;
        }

        .analytics-user-stats span {
          font-size: 11px;
          color: rgba(236, 243, 255, 0.72);
        }

        .analytics-error {
          margin-top: 10px;
          color: #ff9e9e;
        }

        @media (max-width: 1240px) {
          .analytics-metrics-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .analytics-user-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .analytics-filters {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 960px) {
          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .analytics-metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .analytics-filters {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .analytics-shell {
            padding: 14px;
          }

          .analytics-filters {
            grid-template-columns: 1fr;
          }

          .analytics-metrics-grid {
            grid-template-columns: 1fr;
          }

          .analytics-user-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
