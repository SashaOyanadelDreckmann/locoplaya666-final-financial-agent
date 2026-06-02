'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSessionInfo } from '@/lib/api';
import { fetchAdminUsersFullDump, type AdminUserSnapshot, type AdminUsersFullDump } from '@/lib/admin';
import { toUserFacingError } from '@/lib/userError';

type SessionInfo = {
  role?: string;
  name?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function userSearchTarget(user: AdminUserSnapshot): string {
  return `${user.id} ${user.name} ${user.email} ${user.role}`.toLowerCase();
}

export default function AdminPanelPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  const [dump, setDump] = useState<AdminUsersFullDump | null>(null);
  const [loadingDump, setLoadingDump] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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

  const loadDump = async () => {
    setLoadingDump(true);
    setError(null);
    try {
      const payload = await fetchAdminUsersFullDump();
      setDump(payload);
      setSelectedUserId((prev) => prev || payload.users[0]?.id || '');
    } catch (err) {
      setError(toUserFacingError(err));
      setDump(null);
    } finally {
      setLoadingDump(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    loadDump();
  }, [isAllowed]);

  const filteredUsers = useMemo(() => {
    const allUsers = dump?.users ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return allUsers;
    return allUsers.filter((user) => userSearchTarget(user).includes(query));
  }, [dump, search]);

  useEffect(() => {
    if (filteredUsers.length === 0) {
      setSelectedUserId('');
      return;
    }
    if (!filteredUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].id);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = useMemo(() => {
    return filteredUsers.find((user) => user.id === selectedUserId) ?? null;
  }, [filteredUsers, selectedUserId]);

  if (isSessionLoading) {
    return (
      <main className="admin-shell">
        <p className="admin-muted">Cargando sesión…</p>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <h1 className="admin-title">Panel admin</h1>
          <p className="admin-muted">Solo disponible para rol ADMIN.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Panel completo de usuarios</h1>
            <p className="admin-muted">
              Admin: <strong>{sessionInfo?.name ?? 'ADMIN'}</strong> • Usuarios: <strong>{dump?.totalUsers ?? 0}</strong> • Última carga: <strong>{formatDate(dump?.generatedAt)}</strong>
            </p>
          </div>
          <button
            type="button"
            className="admin-btn"
            disabled={loadingDump}
            onClick={loadDump}
          >
            {loadingDump ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        <input
          className="admin-input"
          placeholder="Buscar por nombre, email, rol o id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error ? <p className="admin-error">{error}</p> : null}
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <h2 className="admin-subtitle">Usuarios ({filteredUsers.length})</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Sesiones</th>
                  <th>Docs</th>
                  <th>Perfiles</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={selectedUserId === user.id ? 'is-selected' : ''}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <td>
                      <strong>{user.name}</strong>
                      <div className="admin-muted-sm">{user.email}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.sessions.length}</td>
                    <td>{user.documents.length}</td>
                    <td>{user.profiles.length}</td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="admin-muted-sm">Sin resultados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <h2 className="admin-subtitle">Dump completo del usuario</h2>
          {!selectedUser ? (
            <p className="admin-muted">Selecciona un usuario.</p>
          ) : (
            <pre className="admin-json">{JSON.stringify(selectedUser, null, 2)}</pre>
          )}
        </article>
      </section>

      <style jsx>{`
        .admin-shell {
          min-height: 100vh;
          padding: 22px;
          display: grid;
          gap: 14px;
          color: #f5f7fb;
          background: linear-gradient(180deg, #070d17 0%, #0d1828 100%);
        }

        .admin-card {
          background: rgba(15, 22, 33, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 14px;
        }

        .admin-grid {
          display: grid;
          grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
          gap: 14px;
        }

        .admin-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .admin-title {
          font-size: 28px;
          margin: 0 0 4px;
          line-height: 1.08;
        }

        .admin-subtitle {
          font-size: 18px;
          margin: 0 0 10px;
        }

        .admin-muted {
          color: rgba(237, 243, 255, 0.72);
        }

        .admin-muted-sm {
          font-size: 12px;
          color: rgba(237, 243, 255, 0.68);
        }

        .admin-input {
          width: 100%;
          min-height: 40px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          background: rgba(6, 11, 18, 0.7);
          color: #f5f7fb;
          padding: 8px 10px;
        }

        .admin-btn {
          min-height: 40px;
          border: 1px solid rgba(126, 184, 245, 0.7);
          border-radius: 10px;
          color: #f5f7fb;
          background: linear-gradient(135deg, rgba(56, 129, 196, 0.88), rgba(69, 155, 227, 0.92));
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 700;
        }

        .admin-btn:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .admin-table-wrap {
          width: 100%;
          overflow: auto;
        }

        .admin-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 540px;
        }

        .admin-table th,
        .admin-table td {
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 8px 6px;
          font-size: 13px;
          vertical-align: top;
        }

        .admin-table tr {
          transition: background 0.2s ease;
          cursor: pointer;
        }

        .admin-table tr:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .admin-table tr.is-selected {
          background: rgba(120, 178, 238, 0.2);
        }

        .admin-json {
          margin: 0;
          max-height: 70vh;
          overflow: auto;
          padding: 12px;
          border-radius: 10px;
          background: rgba(5, 9, 15, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 12px;
          line-height: 1.4;
          white-space: pre;
        }

        .admin-error {
          margin-top: 8px;
          color: #ffacac;
        }

        @media (max-width: 1100px) {
          .admin-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .admin-shell {
            padding: 14px;
          }

          .admin-title {
            font-size: 24px;
          }
        }
      `}</style>
    </main>
  );
}
