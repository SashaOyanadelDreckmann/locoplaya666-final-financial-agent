'use client';

import type { AdminUserDossier } from '@/lib/api/admin';
import {
  approvalBadgeClass,
  approvalLabel,
  compactAdminText,
  formatAdminDateTime,
  formatAdminNumber,
  formatAdminPercent,
  formatAdminUsd,
  roleBadgeClass,
  stageLabels,
} from '../helpers/admin-format';
import { AdminJsonExplorer } from './AdminJsonExplorer';

type Props = {
  dossier: AdminUserDossier | null;
  loading: boolean;
  stage?: string;
  pendingActionId?: string;
  onRoleChange?: (userId: string, role: 'USER' | 'ANALYST' | 'ADMIN') => void | Promise<void>;
};

export function AdminUserDossierPanel({ dossier, loading, stage, pendingActionId, onRoleChange }: Props) {
  if (loading) {
    return <p className="admin-muted">Cargando expediente operativo…</p>;
  }

  if (!dossier) {
    return <p className="admin-muted">Selecciona un usuario para ver el dossier completo.</p>;
  }

  const { user, fincoin, memoryHighlights, recentTurns, conversationTurnsCount } = dossier;

  return (
    <div className="admin-dossier">
      <header className="admin-dossier-head">
        <div>
          <h2 className="admin-card-title">{user.name}</h2>
          <p className="admin-card-sub">{user.email}</p>
        </div>
        <div className="admin-tags">
          {onRoleChange ? (
            <select
              className="admin-select admin-select--compact"
              value={user.role}
              disabled={pendingActionId === user.id}
              onChange={(event) =>
                void onRoleChange(user.id, event.target.value as 'USER' | 'ANALYST' | 'ADMIN')
              }
            >
              <option value="USER">USER</option>
              <option value="ANALYST">ANALYST</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          ) : (
            <span className={roleBadgeClass(user.role)}>{user.role}</span>
          )}
          <span className={approvalBadgeClass(user.approvalStatus ?? 'APPROVED')}>
            {approvalLabel(user.approvalStatus ?? 'APPROVED')}
          </span>
          {stage ? <span className="admin-tag">{stageLabels[stage as keyof typeof stageLabels] ?? stage}</span> : null}
        </div>
      </header>

      <section className="admin-dossier-section">
        <h3 className="admin-section-title">Identidad & journey</h3>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>ID</span><strong>{compactAdminText(user.id, 24)}</strong></div>
          <div className="admin-stat"><span>Alta</span><strong>{formatAdminDateTime(user.createdAt)}</strong></div>
          <div className="admin-stat"><span>Última actividad</span><strong>{formatAdminDateTime(user.updatedAt)}</strong></div>
          <div className="admin-stat"><span>Diagnóstico</span><strong>{formatAdminDateTime(user.latestDiagnosticCompletedAt)}</strong></div>
          <div className="admin-stat"><span>Knowledge</span><strong>{formatAdminNumber(user.knowledgeScore)}</strong></div>
          <div className="admin-stat"><span>Base score</span><strong>{formatAdminNumber(user.knowledgeBaseScore)}</strong></div>
        </div>
      </section>

      <section className="admin-dossier-section">
        <h3 className="admin-section-title">Fincoins & economía</h3>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>USD gastado</span><strong>{formatAdminUsd(fincoin.usdSpent)}</strong></div>
          <div className="admin-stat"><span>USD restante</span><strong>{formatAdminUsd(fincoin.usdRemaining)}</strong></div>
          <div className="admin-stat"><span>Fincoins</span><strong>{formatAdminNumber(fincoin.remainingFincoins)} / {formatAdminNumber(fincoin.initialFincoins)}</strong></div>
          <div className="admin-stat"><span>Uso</span><strong>{formatAdminPercent(fincoin.percentUsed)}</strong></div>
          <div className="admin-stat"><span>Estado</span><strong>{fincoin.depleted ? 'Agotado' : 'Activo'}</strong></div>
          <div className="admin-stat"><span>Turns DB</span><strong>{formatAdminNumber(conversationTurnsCount)}</strong></div>
        </div>
      </section>

      <section className="admin-dossier-section">
        <h3 className="admin-section-title">Activos & memoria</h3>
        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Sesiones</span><strong>{formatAdminNumber(user.sessions.length)}</strong></div>
          <div className="admin-stat"><span>Documentos</span><strong>{formatAdminNumber(user.documents.length)}</strong></div>
          <div className="admin-stat"><span>Perfiles</span><strong>{formatAdminNumber(user.profiles.length)}</strong></div>
          <div className="admin-stat"><span>Timeline</span><strong>{formatAdminNumber(memoryHighlights.timelineCount)}</strong></div>
          <div className="admin-stat"><span>Facts</span><strong>{formatAdminNumber(memoryHighlights.factsCount)}</strong></div>
          <div className="admin-stat"><span>Vector store</span><strong>{user.vectorStore ? 'Sí' : 'No'}</strong></div>
        </div>
      </section>

      {recentTurns.length > 0 ? (
        <section className="admin-dossier-section">
          <h3 className="admin-section-title">Turnos recientes (DB)</h3>
          <div className="admin-list admin-list--relaxed">
            {recentTurns.map((turn) => (
              <div key={turn.id} className="admin-interaction">
                <div className="admin-interaction-meta">
                  <span>{formatAdminDateTime(turn.createdAt)}</span>
                  <span>{turn.chatId}</span>
                </div>
                <blockquote>{compactAdminText(turn.userMessage, 160)}</blockquote>
                <blockquote className="admin-blockquote-agent">{compactAdminText(turn.assistantMessage, 220)}</blockquote>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="admin-dossier-section">
        <h3 className="admin-section-title">Explorador estructurado</h3>
        <AdminJsonExplorer
          sections={[
            { id: 'intake', label: 'Intake', value: user.injectedIntake },
            { id: 'profile', label: 'Perfil', value: user.injectedProfile },
            { id: 'panel', label: 'Panel', value: user.panelState },
            { id: 'sheets', label: 'Sheets', value: user.sheets },
            { id: 'memory', label: 'Memoria', value: user.memoryBlob },
            { id: 'lifecycle', label: 'Lifecycle', value: memoryHighlights.productLifecycle },
            { id: 'voice', label: 'Voz', value: memoryHighlights.interviewVoice },
            { id: 'social', label: 'Social', value: memoryHighlights.socialReflections },
            { id: 'knowledge', label: 'Knowledge hist.', value: user.knowledgeHistory },
            { id: 'documents', label: 'Documentos', value: user.documents },
            { id: 'profiles', label: 'Perfiles guardados', value: user.profiles },
            { id: 'sessions', label: 'Sesiones', value: user.sessions },
          ]}
        />
      </section>
    </div>
  );
}
