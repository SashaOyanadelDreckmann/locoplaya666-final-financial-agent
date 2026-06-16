import React, { type ReactElement } from 'react';

import { AnimatedPanelCard } from '../../../components/layout/AnimatedPanelCard';
import ProfileCard from '../../../components/layout/ProfileCard';
import { resolvePanelDiagnosisProfile } from '@/lib/diagnostico/sesion';
import { resolveDocumentUrl } from '../utilidades/page.utils';

type PanelCard = { key: string; node: ReactElement };
type SavedReportLike = {
  id: string;
  title: string;
  fileUrl: string;
  previewImageUrl?: string;
  group?: string;
  createdAt?: string;
};

type PanelCardsProps = {
  highlightedSection: string | null;
  sessionInfo: any;
  profile: any;
  setIsQuestionnaireModalOpen: (open: boolean) => void;
  setIsAccountModalOpen: (open: boolean) => void;
  agentMetaRef: React.MutableRefObject<{ objective?: string; mode?: string }>;
  interviewCard: { badge: string; title: string; meta: string; detail: string };
  interviewCompleted: boolean;
  canOpenInterview: boolean;
  openInterviewModal: () => void;
  openDiagnosisView?: () => void;
  setInterviewIntake: (intake: any) => void;
  setPanelCallout: (value: { section: string; message: string } | null) => void;
  unlockedPanelBlocks: { budgetUnlocked: boolean; transactionsUnlocked: boolean };
  budgetTotals: { income: number; expenses: number };
  budgetInsights: { healthScore?: number } | null;
  openBudgetModal: () => void;
  openTransactionsPanel: () => void;
  fincoinSpendBlocked?: boolean;
  transactionIntel: { docs: number; rows: number; amounts: number[] };
  reportsByGroup: Record<string, any[]>;
  librarySummary: string;
  savedReports: SavedReportLike[];
  deletingReportIds: Record<string, boolean>;
  handleDeleteReport: (report: SavedReportLike) => Promise<void>;
  recentLibraryRef: React.RefObject<HTMLDivElement>;
  isLandingRecents: boolean;
  recentReports: SavedReportLike[];
  newReportId: string | null;
  docVisualOffset: (id: string, idx: number) => { rotation: number; yShift: number };
};

function RecentDocumentPreview(props: { title: string; previewImageUrl?: string }) {
  const previewUrl = props.previewImageUrl ? resolveDocumentUrl(props.previewImageUrl) : '';

  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={`Portada de ${props.title}`}
        className="recent-item-preview recent-item-preview-image"
      />
    );
  }

  const initials = props.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="recent-item-preview recent-item-preview-fallback" aria-hidden="true">
      <span className="recent-item-preview-badge">PDF</span>
      <span className="recent-item-preview-initials">{initials || 'DOC'}</span>
      <span className="recent-item-preview-lines" />
    </div>
  );
}

export function buildPanelBaseCards(props: PanelCardsProps): PanelCard[] {
  const resolvedDiagnosisProfile = resolvePanelDiagnosisProfile(
    props.sessionInfo?.injectedProfile,
    props.profile,
  );

  return [
    {
      key: 'profile',
      node: (
        <div className="mob-col mob-col-wide">
          <ProfileCard
            className={`panel-pos-profile glass-card panel-minimal-soft panel-centered-content${props.highlightedSection === 'profile' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="profile"
            userName={props.sessionInfo?.name ?? undefined}
            intake={props.sessionInfo?.injectedIntake}
            profile={resolvedDiagnosisProfile ?? props.profile}
            injected={Boolean(resolvedDiagnosisProfile)}
            compactQuestionnaireCta
            onOpenQuestionnaire={props.sessionInfo?.injectedIntake ? () => props.setIsQuestionnaireModalOpen(true) : undefined}
            onCardClick={() => props.setIsAccountModalOpen(true)}
          />
        </div>
      ),
    },
    {
      key: 'objective',
      node: (
        <div className="mob-col mob-col-wide">
          <AnimatedPanelCard
            label="Objetivo activo"
            delay={0.1}
            className={`panel-pos-objective glass-card panel-minimal-soft panel-centered-content${props.highlightedSection === 'objective' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="objective"
          >
            <div className="panel-text">
              {props.agentMetaRef.current.objective ??
                'Aún no hay objetivo fijado. Define una prioridad concreta para que el agente entregue una hoja de ruta accionable.'}
            </div>
            <div className="panel-card-note">
              El objetivo correcto ordena el tono, el riesgo y la profundidad de las siguientes recomendaciones.
            </div>
          </AnimatedPanelCard>
        </div>
      ),
    },
    {
      key: 'mode',
      node: (
        <div className="mob-col">
          <AnimatedPanelCard
            label="Modo cognitivo"
            delay={0.2}
            value={props.agentMetaRef.current.mode ?? 'En calibracion'}
            className={`panel-pos-mode panel-mode-cognitive${props.highlightedSection === 'mode' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="mode"
            bgImage="/IMG_3611.JPG"
            overlayOpacity={0.18}
            bgScale={1}
            bgPosition="center 30%"
            dataMode={props.agentMetaRef.current.mode ?? 'calibracion'}
          >
            <div className="panel-text">
              Contexto visual activo para lectura estratégica, foco y profundidad analítica.
            </div>
          </AnimatedPanelCard>
        </div>
      ),
    },
    {
      key: 'transactions',
      node: (
        <div className="mob-col">
          <button
            type="button"
            data-panel-section="transactions"
            className={`panel-feature-card panel-pos-transactions ${props.fincoinSpendBlocked || !props.unlockedPanelBlocks.transactionsUnlocked ? 'is-locked' : ''}${props.highlightedSection === 'transactions' ? ' is-panel-highlighted' : ''}`}
            onClick={() => {
              if (props.fincoinSpendBlocked) {
                props.setPanelCallout({
                  section: 'transactions',
                  message: 'Sin Fincoins no puedes abrir transacciones ni análisis con IA.',
                });
                return;
              }
              props.openTransactionsPanel();
            }}
            title={
              props.fincoinSpendBlocked
                ? 'Sin Fincoins: herramienta en pausa'
                : props.unlockedPanelBlocks.transactionsUnlocked
                ? 'Abrir productos y transacciones'
                : 'Bloqueado: conversa sobre productos, cartolas y banco'
            }
          >
            <span className="panel-feature-label">Productos y Transacciones</span>
            <span className="panel-feature-status">
              {props.unlockedPanelBlocks.transactionsUnlocked ? '● Activo' : '○ Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Revisa tus movimientos del mes para detectar patrones de gasto y alertas clave.
            </span>
            <span className="panel-feature-copy panel-feature-copy-secondary">
              {props.transactionIntel.docs > 0
                ? `${props.transactionIntel.docs} respaldo${props.transactionIntel.docs > 1 ? 's' : ''} · ${props.transactionIntel.rows.toLocaleString('es-CL')} filas · ${props.transactionIntel.amounts.length} montos detectados`
                : 'Agrega un producto y sube respaldos para activar el análisis automático.'}
            </span>
          </button>
        </div>
      ),
    },
    {
      key: 'budget',
      node: (
        <div className="mob-col">
          <button
            type="button"
            data-panel-section="budget"
            className={`panel-feature-card panel-pos-budget ${props.fincoinSpendBlocked || !props.unlockedPanelBlocks.budgetUnlocked ? 'is-locked' : ''}${props.highlightedSection === 'budget' ? ' is-panel-highlighted' : ''}`}
            onClick={() => {
              if (props.fincoinSpendBlocked) {
                props.setPanelCallout({
                  section: 'budget',
                  message: 'Sin Fincoins no puedes abrir el presupuesto asistido por IA.',
                });
                return;
              }
              if (!props.unlockedPanelBlocks.budgetUnlocked) {
                props.setPanelCallout({
                  section: 'budget',
                  message: 'Presupuesto está bloqueado: primero completa Productos y Transacciones.',
                });
                return;
              }
              props.openBudgetModal();
            }}
            title={
              props.fincoinSpendBlocked
                ? 'Sin Fincoins: herramienta en pausa'
                : props.unlockedPanelBlocks.budgetUnlocked
                ? 'Presupuesto resumido'
                : 'Bloqueado: conversa sobre ingresos y gastos'
            }
          >
            <span className="panel-feature-label">Presupuesto</span>
            <span className="panel-feature-status">
              {props.unlockedPanelBlocks.budgetUnlocked ? '● Activo' : '○ Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Ordena ingresos y gastos para entender tu balance mensual y capacidad real de ahorro.
            </span>
            <span className="panel-feature-copy panel-feature-copy-secondary">
              {props.unlockedPanelBlocks.budgetUnlocked
                ? `Ingreso ${Math.round(props.budgetTotals.income).toLocaleString('es-CL')} · Gasto ${Math.round(props.budgetTotals.expenses).toLocaleString('es-CL')} · Health ${props.budgetInsights?.healthScore ?? '—'}/100`
                : 'Conversa sobre ingresos y gastos para desbloquear el análisis completo.'}
            </span>
          </button>
        </div>
      ),
    },
    {
      key: 'interview',
      node: (
        <div className="mob-col mob-col-wide">
          <button
            type="button"
            className={`interview-flow-card panel-pos-interview glass-card${!props.interviewCompleted && (props.fincoinSpendBlocked || !props.canOpenInterview) ? ' is-locked' : ''}`}
            onClick={() => {
              if (props.interviewCompleted) {
                props.openDiagnosisView?.();
                return;
              }
              if (props.fincoinSpendBlocked) {
                props.setPanelCallout({
                  section: 'interview',
                  message: 'Sin Fincoins no puedes iniciar la entrevista por voz.',
                });
                return;
              }
              if (!props.canOpenInterview) {
                props.setPanelCallout({
                  section: 'interview',
                  message:
                    'La entrevista se desbloquea al completar cartolas y al menos 3 filas de presupuesto con monto.',
                });
                return;
              }
              props.openInterviewModal();
            }}
            title={
              props.fincoinSpendBlocked && !props.interviewCompleted
                ? 'Sin Fincoins: entrevista en pausa'
                : props.interviewCompleted
                ? 'Ver diagnóstico'
                : props.canOpenInterview
                ? 'Entrevista disponible'
                : 'Bloqueado: completa Productos/Transacciones y Presupuesto'
            }
          >
            <span className="interview-flow-label">
              {props.interviewCompleted ? props.interviewCard.badge : props.canOpenInterview ? 'Entrevista disponible' : props.interviewCard.badge}
            </span>
            <span className="panel-feature-status">
              {props.interviewCompleted ? '● Completado' : props.canOpenInterview ? '● Disponible' : '○ Bloqueado'}
            </span>
            <span className="interview-flow-title">{props.interviewCard.title}</span>
            <span className="interview-flow-meta">{props.interviewCard.meta}</span>
            <span className="interview-flow-meta interview-flow-submeta">{props.interviewCard.detail}</span>
            {!props.interviewCompleted && !props.canOpenInterview && (
              <span className="panel-feature-copy panel-feature-copy-secondary">
                Completa productos/transacciones y presupuesto para iniciar esta etapa.
              </span>
            )}
          </button>
        </div>
      ),
    },
    {
      key: 'news',
      node: (
        <div className="mob-col mob-col-wide">
          <AnimatedPanelCard
            delay={0.5}
            className={`news-card panel-pos-news${props.highlightedSection === 'news' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="news"
          >
            <a href="https://fintualist.com/chile/" target="_blank" rel="noreferrer" className="news-link">
              <div className="news-image">
                <img
                  src="/news-previeww.jpg"
                  alt="Vista previa editorial de noticias financieras"
                  className="news-media"
                />
                <div className="news-overlay">
                  <span className="news-kicker">Radar de mercado</span>
                  <span className="news-title">Noticias y actualidad</span>
                  <span className="news-subtitle">
                    Señales macro, tasas y conversación financiera para decidir mejor.
                  </span>
                </div>
              </div>
            </a>
          </AnimatedPanelCard>
        </div>
      ),
    },
    {
      key: 'library',
      node: (
        <div className="mob-col mob-col-wide">
          <AnimatedPanelCard
            label="Biblioteca de documentos"
            delay={0.6}
            className={`panel-pos-library panel-minimal-soft panel-centered-content${props.highlightedSection === 'library' ? ' is-panel-highlighted' : ''}`}
            data-panel-section="library"
          >
            <div className="reports-grid">
              <div className="report-group"><span className="report-group-title">Plan de accion</span><span className="report-group-count">{props.reportsByGroup.plan_action.length}</span></div>
              <div className="report-group"><span className="report-group-title">Simulacion</span><span className="report-group-count">{props.reportsByGroup.simulation.length}</span></div>
              <div className="report-group"><span className="report-group-title">Presupuesto</span><span className="report-group-count">{props.reportsByGroup.budget.length}</span></div>
              <div className="report-group"><span className="report-group-title">Diagnostico</span><span className="report-group-count">{props.reportsByGroup.diagnosis.length}</span></div>
            </div>
            <div className="panel-card-note panel-card-note-library">{props.librarySummary}</div>
            <div className="report-list">
              {props.savedReports.length === 0 && (
                <span className="report-empty">Guarda PDFs desde el chat para agruparlos aqui.</span>
              )}
              {props.savedReports.slice(0, 6).map((report) => (
                <div key={report.id} className="report-item">
                  <a href={resolveDocumentUrl(report.fileUrl)} target="_blank" rel="noreferrer" className="report-item-link">
                    <span>{report.title}</span>
                    <span className="report-tag">{report.group}</span>
                  </a>
                  <button
                    type="button"
                    className="report-delete-button"
                    aria-label={`Eliminar ${report.title}`}
                    title="Eliminar PDF"
                    disabled={Boolean(props.deletingReportIds[report.id])}
                    onClick={async (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      await props.handleDeleteReport(report);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="report-delete-icon">
                      <path d="M9 3.75h6M10 3.75l.5-1h3l.5 1M6.75 6.5h10.5M9.25 6.5l.5 12.25h4.5l.5-12.25M10.5 10v5M13.5 10v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </AnimatedPanelCard>
        </div>
      ),
    },
    {
      key: 'recents',
      node: (
        <div className="mob-col mob-col-wide">
          <div
            ref={props.recentLibraryRef}
            data-panel-section="recents"
            className={`recent-library-card panel-pos-recent${props.isLandingRecents ? ' is-landing' : ''}${props.highlightedSection === 'recents' ? ' is-panel-highlighted' : ''}`}
          >
            <div className="recent-library-head">
              <span className="recent-library-title">Documentos recientes</span>
              <span className="recent-library-count">{props.recentReports.length}</span>
            </div>
            <div className="recent-library-grid">
              {props.recentReports.length === 0 && (
                <span className="recent-empty">Aqui llegan los PDFs guardados desde el chat.</span>
              )}
              {props.recentReports.map((report, idx) => (
                <div
                  key={report.id}
                  className={`recent-item${report.id === props.newReportId ? ' is-new' : ''}`}
                  style={
                    (() => {
                      const offset = props.docVisualOffset(report.id, idx);
                      return {
                        ['--doc-rot' as any]: `${offset.rotation}deg`,
                        ['--doc-y' as any]: `${offset.yShift}px`,
                      } as React.CSSProperties;
                    })()
                  }
                >
                  <a href={resolveDocumentUrl(report.fileUrl)} target="_blank" rel="noreferrer" className="recent-item-link">
                    <div className="recent-item-preview-wrap">
                      <RecentDocumentPreview
                        title={report.title}
                        previewImageUrl={report.previewImageUrl}
                      />
                    </div>
                    <span className="recent-item-name">{report.title}</span>
                  </a>
                  <button
                    type="button"
                    className="recent-item-delete-button"
                    aria-label={`Eliminar ${report.title}`}
                    title="Eliminar PDF"
                    disabled={Boolean(props.deletingReportIds[report.id])}
                    onClick={async (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      await props.handleDeleteReport(report);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="recent-item-delete-icon">
                      <path d="M9 3.75h6M10 3.75l.5-1h3l.5 1M6.75 6.5h10.5M9.25 6.5l.5 12.25h4.5l.5-12.25M10.5 10v5M13.5 10v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ];
}
