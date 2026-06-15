'use client';

import {
  fetchAdminCockpitSnapshot,
  fetchAdminUserDossier,
  fetchAdminUsersFullDump,
  fetchResearchAnalyticsReport,
  type AdminCockpitSnapshot,
  type AdminUserDossier,
  type AdminUserSnapshot,
  type AdminUsersFullDump,
  type ResearchAnalyticsReport,
  type ResearchAnalyticsStage,
} from '@/lib/api/admin';
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
import { getSessionInfo } from '@/lib/api/cliente';
import { toUserFacingError } from '@/lib/compartido/userError';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_TAB_IDS,
  approvalBadgeClass,
  approvalLabel,
  compactAdminText,
  downloadJson,
  formatAdminDateTime,
  formatAdminNumber,
  formatAdminPercent,
  formatAdminUsd,
  parseAdminTab,
  progressTone,
  roleBadgeClass,
  stageLabels,
  stageOrder,
  type AdminTabId,
} from '../helpers/admin-format';
import { AdminJsonExplorer } from './AdminJsonExplorer';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminOpsPanel } from './AdminOpsPanel';
import { AdminSplitPane } from './AdminSplitPane';
import { AdminUserDossierPanel } from './AdminUserDossierPanel';
import { useAdminTabSwipe } from '../hooks/use-admin-tab-swipe';

type SessionInfo = { role?: string; name?: string; email?: string };

const TAB_META: Record<AdminTabId, { label: string; icon: string; title: string; subtitle: string }> = {
  overview: {
    label: 'Resumen',
    icon: '◆',
    title: 'Radar ejecutivo',
    subtitle: 'Cohortes, funnel y señales agregadas sin perder el contexto editorial.',
  },
  users: {
    label: 'Usuarios',
    icon: '◎',
    title: 'Directorio completo',
    subtitle: 'Identidad, actividad, scores y señales de adopción con búsqueda instantánea.',
  },
  activity: {
    label: 'Actividad',
    icon: '↺',
    title: 'Línea de tiempo operativa',
    subtitle: 'Interacciones reales con mensajes, herramientas y artefactos generados.',
  },
  ops: {
    label: 'Ops',
    icon: '⚙',
    title: 'Operaciones de plataforma',
    subtitle: 'Aprobaciones, economía Fincoin, inventario de datos y salud del API.',
  },
  archive: {
    label: 'Archivo',
    icon: '▣',
    title: 'Expediente profundo',
    subtitle: 'Dump completo por usuario: panel, sheets, documentos, perfiles y memoria.',
  },
};

function toIsoStart(dateInput: string): string | undefined {
  if (!dateInput) return undefined;
  return new Date(`${dateInput}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateInput: string): string | undefined {
  if (!dateInput) return undefined;
  return new Date(`${dateInput}T23:59:59.999Z`).toISOString();
}


export default function AdminCommandCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseAdminTab(searchParams?.get('tab') ?? null);
  const mainRef = useRef<HTMLElement>(null);

  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<ResearchAnalyticsStage | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<'' | AnalyticsRole>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [research, setResearch] = useState<ResearchAnalyticsReport | null>(null);
  const [cockpit, setCockpit] = useState<AdminCockpitSnapshot | null>(null);
  const [users, setUsers] = useState<AnalyticsUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSummary, setUsersSummary] = useState<{
    totalUsers: number;
    totalInteractions: number;
    activeUsers7d: number;
    activeUsers30d: number;
  } | null>(null);

  const [interactions, setInteractions] = useState<AnalyticsInteraction[]>([]);
  const [interactionsTotal, setInteractionsTotal] = useState(0);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [researchSelectedId, setResearchSelectedId] = useState('');
  const [selectedUserDetail, setSelectedUserDetail] = useState<AnalyticsUser | null>(null);
  const [selectedUserInteractions, setSelectedUserInteractions] = useState<AnalyticsInteraction[]>([]);
  const [userDossier, setUserDossier] = useState<AdminUserDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  const [fullDump, setFullDump] = useState<AdminUsersFullDump | null>(null);
  const [archiveUserId, setArchiveUserId] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiDateFilters = useMemo(
    () => ({
      from: toIsoStart(fromDate),
      to: toIsoEnd(toDate),
    }),
    [fromDate, toDate],
  );

  const setTab = useCallback(
    (tab: AdminTabId) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', tab);
      router.replace(`/admin?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobileLayout(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setMobileDetailOpen(false);
  }, [activeTab]);

  useAdminTabSwipe({
    enabled: isMobileLayout && !mobileDetailOpen,
    hostRef: mainRef,
    activeTab,
    onTabChange: setTab,
  });

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

  useEffect(() => {
    if (!isAllowed || cockpit) return;
    fetchAdminCockpitSnapshot()
      .then(setCockpit)
      .catch(() => undefined);
  }, [cockpit, isAllowed]);

  const loadOverview = useCallback(async () => {
    const [researchPayload, cockpitPayload] = await Promise.all([
      fetchResearchAnalyticsReport(),
      fetchAdminCockpitSnapshot(),
    ]);
    setResearch(researchPayload);
    setCockpit(cockpitPayload);
    setResearchSelectedId((prev) => prev || researchPayload.users[0]?.pseudonymId || '');
  }, []);

  const loadOps = useCallback(async () => {
    const payload = await fetchAdminCockpitSnapshot();
    setCockpit(payload);
  }, []);

  const loadUsers = useCallback(async () => {
    const payload = await fetchAnalyticsUsers({
      search: search.trim() || undefined,
      role: roleFilter || undefined,
      ...apiDateFilters,
      limit: 200,
      offset: 0,
      sortBy: 'interactions',
      sortOrder: 'desc',
    });
    setUsers(payload.users);
    setUsersTotal(payload.pagination.total);
    setUsersSummary(payload.summary);
    setSelectedUserId((prev) => prev || payload.users[0]?.id || '');
  }, [apiDateFilters, roleFilter, search]);

  const loadInteractions = useCallback(async () => {
    const payload = await fetchAnalyticsInteractions({
      search: search.trim() || undefined,
      role: roleFilter || undefined,
      ...apiDateFilters,
      limit: 160,
      offset: 0,
    });
    setInteractions(payload.interactions);
    setInteractionsTotal(payload.pagination.total);
  }, [apiDateFilters, roleFilter, search]);

  const loadArchive = useCallback(async () => {
    if (fullDump) return;
    setLoadingArchive(true);
    try {
      const payload = await fetchAdminUsersFullDump();
      setFullDump(payload);
      setArchiveUserId((prev) => prev || payload.users[0]?.id || '');
    } finally {
      setLoadingArchive(false);
    }
  }, [fullDump]);

  const refreshActiveTab = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'overview') {
        await loadOverview();
      } else if (activeTab === 'users') {
        await loadUsers();
      } else if (activeTab === 'activity') {
        await Promise.all([loadUsers(), loadInteractions()]);
      } else if (activeTab === 'ops') {
        await loadOps();
      } else if (activeTab === 'archive') {
        await loadArchive();
        if (fullDump) {
          const payload = await fetchAdminUsersFullDump();
          setFullDump(payload);
        }
      }
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, fullDump, isAllowed, loadArchive, loadInteractions, loadOps, loadOverview, loadUsers]);

  useEffect(() => {
    if (!isAllowed) return;
    void refreshActiveTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per tab switch only
  }, [isAllowed, activeTab]);

  useEffect(() => {
    if (!isAllowed || activeTab !== 'archive') return;
    loadArchive();
  }, [activeTab, isAllowed, loadArchive]);

  useEffect(() => {
    if (!selectedUserId || activeTab !== 'users') return;
    let mounted = true;
    (async () => {
      setLoadingUserDetail(true);
      setLoadingDossier(true);
      try {
        const [activityPayload, dossierPayload] = await Promise.all([
          fetchAnalyticsUserActivity(selectedUserId, {
            ...apiDateFilters,
            limit: 80,
            offset: 0,
          }),
          fetchAdminUserDossier(selectedUserId),
        ]);
        if (!mounted) return;
        setSelectedUserDetail(activityPayload.user);
        setSelectedUserInteractions(activityPayload.interactions);
        setUserDossier(dossierPayload);
      } catch {
        if (!mounted) return;
        setSelectedUserDetail(null);
        setSelectedUserInteractions([]);
        setUserDossier(null);
      } finally {
        if (mounted) {
          setLoadingUserDetail(false);
          setLoadingDossier(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, apiDateFilters, selectedUserId]);

  const researchUsers = useMemo(() => {
    const list = research?.users ?? [];
    const query = search.trim().toLowerCase();
    return list.filter((user) => {
      if (stageFilter !== 'all' && user.stage !== stageFilter) return false;
      if (!query) return true;
      return `${user.pseudonymId} ${user.stage} ${user.role} ${user.createdAtMonth}`
        .toLowerCase()
        .includes(query);
    });
  }, [research, search, stageFilter]);

  const selectedResearchUser = useMemo(
    () => researchUsers.find((user) => user.pseudonymId === researchSelectedId) ?? researchUsers[0] ?? null,
    [researchUsers, researchSelectedId],
  );

  const archiveUser: AdminUserSnapshot | null = useMemo(() => {
    if (!fullDump || !archiveUserId) return null;
    return fullDump.users.find((user) => user.id === archiveUserId) ?? null;
  }, [archiveUserId, fullDump]);

  const tabMeta = TAB_META[activeTab];
  const researchSummary = research?.summary;

  if (isSessionLoading) {
    return <div className="admin-loading">Cargando centro de comando…</div>;
  }

  if (!isAllowed) {
    return (
      <div className="admin-deny">
        <div className="admin-deny-card">
          <h1>Acceso restringido</h1>
          <p className="admin-muted">Este centro de comando es exclusivo para cuentas con rol ADMIN.</p>
          <Link href="/agent" className="admin-btn admin-btn--primary" style={{ display: 'inline-flex', marginTop: 16 }}>
            Volver al agente
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-root">
      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="Navegación admin">
          <div className="admin-brand">
            <span className="admin-brand-eyebrow">Financieramente</span>
            <h2 className="admin-brand-title">Command Center</h2>
            <p className="admin-brand-sub">Observabilidad total, lectura editorial y control operativo.</p>
          </div>

          <nav className="admin-nav">
            {ADMIN_TAB_IDS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`admin-nav-btn ${activeTab === tab ? 'is-active' : ''}`}
                onClick={() => setTab(tab)}
              >
                <span className="admin-nav-icon" aria-hidden>
                  {TAB_META[tab].icon}
                </span>
                <span>{TAB_META[tab].label}</span>
              </button>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-meta-card">
              <strong>{sessionInfo?.name ?? 'Administrador'}</strong>
              <span>{sessionInfo?.email ?? 'ADMIN'}</span>
              <span>Actualizado: {research?.generatedAt ? formatAdminDateTime(research.generatedAt) : '—'}</span>
            </div>
            <Link href="/agent" className="admin-btn admin-btn--ghost">
              Ir al agente
            </Link>
          </div>
        </aside>

        <main ref={mainRef} className="admin-main admin-main-stage">
          <header className="admin-topbar admin-topbar-sticky">
            <div className="admin-topbar-copy">
              <p className="admin-topbar-eyebrow">Centro de comando</p>
              <h1>{tabMeta.title}</h1>
              <p>{tabMeta.subtitle}</p>
            </div>
            <div className="admin-topbar-actions">
              <input
                className="admin-search"
                placeholder="Buscar usuario, email, pseudónimo, stage…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar"
              />
              <button type="button" className="admin-btn admin-btn--primary" disabled={loading} onClick={refreshActiveTab}>
                {loading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          </header>

          <AdminFilterBar
            showRoleDates={activeTab === 'users' || activeTab === 'activity'}
            showStage={activeTab === 'overview'}
            roleFilter={roleFilter}
            stageFilter={stageFilter}
            fromDate={fromDate}
            toDate={toDate}
            onRoleChange={setRoleFilter}
            onStageChange={setStageFilter}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onApply={refreshActiveTab}
          />

          {error ? <p className="admin-error">{error}</p> : null}

          {cockpit ? (
            <section className="admin-platform-strip admin-scroll-x admin-scroll-x--cards" aria-label="Métricas de plataforma">
              <article className="admin-kpi"><span>Pendientes</span><strong>{formatAdminNumber(cockpit.platform.byApproval.PENDING_APPROVAL ?? 0)}</strong></article>
              <article className="admin-kpi"><span>USD gastado</span><strong>{formatAdminUsd(cockpit.platform.fincoin.totalUsdSpent)}</strong></article>
              <article className="admin-kpi"><span>Turns DB</span><strong>{formatAdminNumber(cockpit.platform.totals.conversationTurns)}</strong></article>
              <article className="admin-kpi"><span>API req</span><strong>{formatAdminNumber(cockpit.observability.http.totalRequests)}</strong></article>
              <article className="admin-kpi"><span>Latencia</span><strong>{formatAdminNumber(cockpit.observability.http.avgLatencyMs)} ms</strong></article>
              <article className="admin-kpi"><span>Interacciones</span><strong>{formatAdminNumber(cockpit.research.totalInteractions)}</strong></article>
            </section>
          ) : null}

          {activeTab === 'overview' && (
            <>
              <section className="admin-kpi-grid">
                <article className="admin-kpi"><span>Usuarios</span><strong>{formatAdminNumber(researchSummary?.totalUsers ?? 0)}</strong></article>
                <article className="admin-kpi"><span>Activos 7d</span><strong>{formatAdminNumber(researchSummary?.activeUsers7d ?? 0)}</strong></article>
                <article className="admin-kpi"><span>Activos 30d</span><strong>{formatAdminNumber(researchSummary?.activeUsers30d ?? 0)}</strong></article>
                <article className="admin-kpi"><span>Progreso medio</span><strong>{formatAdminPercent(researchSummary?.avgProgressScore ?? 0)}</strong></article>
                <article className="admin-kpi"><span>Intake</span><strong>{formatAdminPercent(researchSummary?.intakeCompletionRate ?? 0)}</strong></article>
                <article className="admin-kpi"><span>Documentos</span><strong>{formatAdminPercent(researchSummary?.documentAdoptionRate ?? 0)}</strong></article>
              </section>

              {(researchSummary?.topModes?.length || researchSummary?.topTools?.length) ? (
                <article className="admin-card" style={{ marginBottom: 16 }}>
                  <h2 className="admin-card-title">Señales de producto</h2>
                  <div className="admin-grid-2">
                    <div>
                      <p className="admin-card-sub">Top modes</p>
                      <div className="admin-tags">
                        {(researchSummary?.topModes ?? []).map((item) => (
                          <span key={item.mode} className="admin-tag">{item.mode} • {formatAdminNumber(item.count)}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="admin-card-sub">Top tools</p>
                      <div className="admin-tags">
                        {(researchSummary?.topTools ?? []).map((item) => (
                          <span key={item.tool} className="admin-tag">{item.tool} • {formatAdminNumber(item.count)}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}

              <div className="admin-grid-2">
                <article className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <h2 className="admin-card-title">Funnel de journey</h2>
                      <p className="admin-card-sub">Distribución por stage con lectura rápida.</p>
                    </div>
                  </div>
                  <div className="admin-list admin-list--relaxed">
                    {stageOrder.map((stage) => {
                      const count = researchSummary?.stageCounts?.[stage] ?? 0;
                      const max = Math.max(1, researchSummary?.totalUsers ?? 1);
                      return (
                        <div key={stage} className="admin-funnel-row">
                          <div className="admin-funnel-head">
                            <span>{stageLabels[stage]}</span>
                            <strong>{formatAdminNumber(count)}</strong>
                          </div>
                          <div className="admin-funnel-track">
                            <div className="admin-funnel-fill" style={{ width: `${Math.max(4, Math.round((count / max) * 100))}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="admin-card">
                  <h2 className="admin-card-title">Cohortes mensuales</h2>
                  <p className="admin-card-sub">Alta, actividad y progreso por mes.</p>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Mes</th>
                          <th>Usuarios</th>
                          <th>7d</th>
                          <th>30d</th>
                          <th>Progreso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(research?.cohorts ?? []).map((cohort) => (
                          <tr key={cohort.month}>
                            <td>{cohort.month}</td>
                            <td>{formatAdminNumber(cohort.users)}</td>
                            <td>{formatAdminNumber(cohort.active7d)}</td>
                            <td>{formatAdminNumber(cohort.active30d)}</td>
                            <td>{formatAdminPercent(cohort.avgProgressScore)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <div style={{ marginTop: 16 }}>
                <AdminSplitPane
                  listLabel="Participantes"
                  detailLabel="Detalle agregado"
                  showDetail={isMobileLayout && mobileDetailOpen && Boolean(selectedResearchUser)}
                  onBack={() => setMobileDetailOpen(false)}
                  list={(
                    <article className="admin-card admin-card--flush">
                      <h2 className="admin-card-title">Participantes (pseudónimo)</h2>
                      <div className="admin-list admin-list--relaxed">
                        {researchUsers.map((user) => {
                          const tone = progressTone(user.progressScore);
                          return (
                            <button
                              key={user.pseudonymId}
                              type="button"
                              className={`admin-list-item ${researchSelectedId === user.pseudonymId ? 'is-selected' : ''}`}
                              onClick={() => {
                                setResearchSelectedId(user.pseudonymId);
                                if (isMobileLayout) setMobileDetailOpen(true);
                              }}
                            >
                              <div className="admin-list-item-head">
                                <div>
                                  <strong>{user.pseudonymId}</strong>
                                  <div className="admin-muted" style={{ fontSize: 12 }}>
                                    {stageLabels[user.stage]} • {user.createdAtMonth}
                                  </div>
                                </div>
                                <span className={`admin-score admin-score--${tone}`}>{formatAdminPercent(user.progressScore)}</span>
                              </div>
                            </button>
                          );
                        })}
                        {researchUsers.length === 0 ? <p className="admin-empty">Sin resultados.</p> : null}
                      </div>
                    </article>
                  )}
                  detail={(
                    <article className="admin-card admin-card--flush">
                      <h2 className="admin-card-title">Detalle agregado</h2>
                      {!selectedResearchUser ? (
                        <p className="admin-muted">Selecciona un participante.</p>
                      ) : (
                        <div className="admin-stat-grid">
                          <div className="admin-stat"><span>Stage</span><strong>{stageLabels[selectedResearchUser.stage]}</strong></div>
                          <div className="admin-stat"><span>Interacciones</span><strong>{formatAdminNumber(selectedResearchUser.interactionsCount)}</strong></div>
                          <div className="admin-stat"><span>Docs</span><strong>{formatAdminNumber(selectedResearchUser.documentsCount)}</strong></div>
                          <div className="admin-stat"><span>Tools</span><strong>{formatAdminNumber(selectedResearchUser.toolsUsedCount)}</strong></div>
                          <div className="admin-stat"><span>Knowledge</span><strong>{formatAdminNumber(selectedResearchUser.knowledgeScore)}</strong></div>
                          <div className="admin-stat"><span>Última actividad</span><strong>{selectedResearchUser.lastActivityBucket}</strong></div>
                          <div className="admin-tags" style={{ gridColumn: '1 / -1' }}>
                            {selectedResearchUser.modesUsed.map((mode) => (
                              <span key={mode} className="admin-tag">{mode}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  )}
                />
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <AdminSplitPane
              listLabel="Usuarios"
              detailLabel="Expediente"
              showDetail={isMobileLayout && mobileDetailOpen && Boolean(selectedUserId)}
              onBack={() => setMobileDetailOpen(false)}
              list={(
                <article className="admin-card admin-card--flush">
                  <div className="admin-card-head">
                    <div>
                      <h2 className="admin-card-title">Usuarios ({formatAdminNumber(usersTotal)})</h2>
                      <p className="admin-card-sub">
                        Activos 7d: {formatAdminNumber(usersSummary?.activeUsers7d ?? 0)} • 30d:{' '}
                        {formatAdminNumber(usersSummary?.activeUsers30d ?? 0)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--compact"
                      onClick={() =>
                        downloadAnalyticsUsersCsv({
                          search: search.trim() || undefined,
                          role: roleFilter || undefined,
                          ...apiDateFilters,
                        })
                      }
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="admin-table-wrap admin-table-wrap--wide">
                    <table className="admin-table admin-table--comfortable">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Estado</th>
                          <th>Stage</th>
                          <th>Interacc.</th>
                          <th>Fincoin</th>
                          <th>Actividad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr
                            key={user.id}
                            className={selectedUserId === user.id ? 'is-selected' : ''}
                            onClick={() => {
                              setSelectedUserId(user.id);
                              if (isMobileLayout) setMobileDetailOpen(true);
                            }}
                          >
                            <td className="admin-table-cell-wrap">
                              <div>{user.name}</div>
                              <div className="admin-muted admin-table-sub">{user.email}</div>
                            </td>
                            <td><span className={approvalBadgeClass(user.approvalStatus)}>{approvalLabel(user.approvalStatus)}</span></td>
                            <td>{stageLabels[user.stage]}</td>
                            <td>{formatAdminNumber(user.interactionsCount)}</td>
                            <td>{user.fincoinDepleted ? 'Agotado' : formatAdminUsd(user.fincoinRemainingUsd)}</td>
                            <td>{formatAdminDateTime(user.lastActivityAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}
              detail={(
                <article className="admin-card admin-card--flush admin-dossier-card">
                  <AdminUserDossierPanel
                    dossier={userDossier}
                    loading={loadingDossier || loadingUserDetail}
                    stage={selectedUserDetail?.stage}
                  />
                  {selectedUserInteractions.length > 0 ? (
                    <section className="admin-dossier-section">
                      <h3 className="admin-section-title">Timeline analítico</h3>
                      <div className="admin-list admin-list--relaxed">
                        {selectedUserInteractions.map((item) => (
                          <div key={item.interactionId} className="admin-interaction">
                            <div className="admin-interaction-meta">
                              <span>{formatAdminDateTime(item.timestamp)}</span>
                              <span>{item.mode ?? 'sin modo'}</span>
                              <span>{item.chatId}</span>
                            </div>
                            <blockquote>{compactAdminText(item.userMessage, 280)}</blockquote>
                            <blockquote className="admin-blockquote-agent">{compactAdminText(item.agentMessage, 280)}</blockquote>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </article>
              )}
            />
          )}

          {activeTab === 'ops' && <AdminOpsPanel cockpit={cockpit} />}

          {activeTab === 'activity' && (
            <article className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h2 className="admin-card-title">Feed global ({formatAdminNumber(interactionsTotal)})</h2>
                  <p className="admin-card-sub">Últimas interacciones con contexto completo.</p>
                </div>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() =>
                    downloadAnalyticsInteractionsCsv({
                      search: search.trim() || undefined,
                      role: roleFilter || undefined,
                      ...apiDateFilters,
                    })
                  }
                >
                  Export CSV
                </button>
              </div>
              <div className="admin-list admin-list--relaxed">
                {interactions.map((item) => (
                  <div key={item.interactionId} className="admin-interaction">
                    <div className="admin-interaction-meta">
                      <strong>{item.userName}</strong>
                      <span>{item.email}</span>
                      <span>{formatAdminDateTime(item.timestamp)}</span>
                      <span>{item.mode ?? 'sin modo'}</span>
                    </div>
                    <div className="admin-tags">
                      {item.toolNames.map((tool) => (
                        <span key={`${item.interactionId}-${tool}`} className="admin-tag">{tool}</span>
                      ))}
                    </div>
                    <blockquote>{compactAdminText(item.userMessage, 320)}</blockquote>
                    <blockquote className="admin-blockquote-agent">{compactAdminText(item.agentMessage, 320)}</blockquote>
                  </div>
                ))}
                {interactions.length === 0 ? <p className="admin-empty">Sin actividad con los filtros actuales.</p> : null}
              </div>
            </article>
          )}

          {activeTab === 'archive' && (
            <AdminSplitPane
              listLabel="Expedientes"
              detailLabel="Archivo JSON"
              showDetail={isMobileLayout && mobileDetailOpen && Boolean(archiveUserId)}
              onBack={() => setMobileDetailOpen(false)}
              list={(
                <article className="admin-card admin-card--flush">
                  <div className="admin-card-head">
                    <div>
                      <h2 className="admin-card-title">Expedientes ({formatAdminNumber(fullDump?.totalUsers ?? 0)})</h2>
                      <p className="admin-card-sub">Dump completo del backend (panel, memoria, documentos).</p>
                    </div>
                    {fullDump ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--compact"
                        onClick={() => downloadJson(`admin_users_${new Date().toISOString().slice(0, 10)}.json`, fullDump)}
                      >
                        Export JSON
                      </button>
                    ) : null}
                  </div>
                  {loadingArchive ? (
                    <p className="admin-muted">Cargando archivo completo…</p>
                  ) : (
                    <div className="admin-list admin-list--relaxed">
                      {(fullDump?.users ?? []).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className={`admin-list-item ${archiveUserId === user.id ? 'is-selected' : ''}`}
                          onClick={() => {
                            setArchiveUserId(user.id);
                            if (isMobileLayout) setMobileDetailOpen(true);
                          }}
                        >
                          <div className="admin-list-item-head">
                            <div>
                              <strong>{user.name}</strong>
                              <div className="admin-muted admin-table-sub">{user.email}</div>
                            </div>
                            <span className={roleBadgeClass(user.role)}>{user.role}</span>
                          </div>
                          <div className="admin-muted admin-table-sub">
                            {formatAdminNumber(user.documents.length)} docs • {formatAdminNumber(user.profiles.length)} perfiles •{' '}
                            {formatAdminDateTime(user.updatedAt)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              )}
              detail={(
                <article className="admin-card admin-card--flush">
                  {!archiveUser ? (
                    <p className="admin-muted">Selecciona un expediente.</p>
                  ) : (
                    <>
                      <div className="admin-dossier-head" style={{ marginBottom: 12 }}>
                        <div>
                          <h2 className="admin-card-title">{archiveUser.name}</h2>
                          <p className="admin-card-sub">{archiveUser.email}</p>
                        </div>
                        <div className="admin-tags">
                          <span className={roleBadgeClass(archiveUser.role)}>{archiveUser.role}</span>
                          <span className={approvalBadgeClass(archiveUser.approvalStatus ?? 'APPROVED')}>
                            {approvalLabel(archiveUser.approvalStatus ?? 'APPROVED')}
                          </span>
                        </div>
                      </div>
                      <AdminJsonExplorer
                        sections={[
                          { id: 'meta', label: 'Meta', value: {
                            id: archiveUser.id,
                            createdAt: archiveUser.createdAt,
                            updatedAt: archiveUser.updatedAt,
                            latestDiagnosticProfileId: archiveUser.latestDiagnosticProfileId,
                            latestDiagnosticCompletedAt: archiveUser.latestDiagnosticCompletedAt,
                            knowledgeScore: archiveUser.knowledgeScore,
                            usdSpentTotal: archiveUser.usdSpentTotal,
                            fincoinDepletedAt: archiveUser.fincoinDepletedAt,
                          }},
                          { id: 'intake', label: 'Intake', value: archiveUser.injectedIntake },
                          { id: 'profile', label: 'Perfil', value: archiveUser.injectedProfile },
                          { id: 'panel', label: 'Panel', value: archiveUser.panelState },
                          { id: 'sheets', label: 'Sheets', value: archiveUser.sheets },
                          { id: 'memory', label: 'Memoria', value: archiveUser.memoryBlob },
                          { id: 'knowledge', label: 'Knowledge', value: archiveUser.knowledgeHistory },
                          { id: 'documents', label: 'Docs', value: archiveUser.documents },
                          { id: 'profiles', label: 'Perfiles', value: archiveUser.profiles },
                          { id: 'sessions', label: 'Sesiones', value: archiveUser.sessions },
                          { id: 'vector', label: 'Vector', value: archiveUser.vectorStore },
                        ]}
                      />
                    </>
                  )}
                </article>
              )}
            />
          )}
        </main>
      </div>

      <nav className="admin-mobile-nav" aria-label="Navegación móvil admin">
        <p className="admin-mobile-nav-hint">Desliza horizontalmente para cambiar de sección</p>
        {ADMIN_TAB_IDS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`admin-mobile-nav-btn ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setTab(tab)}
            title={TAB_META[tab].title}
          >
            <span aria-hidden>{TAB_META[tab].icon}</span>
            <span>{TAB_META[tab].label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
