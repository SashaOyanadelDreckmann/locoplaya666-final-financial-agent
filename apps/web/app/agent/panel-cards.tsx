import React, { type ReactElement } from 'react';

import { AnimatedPanelCard } from '../../components/AnimatedPanelCard';
import ProfileCard from '../../components/ProfileCard';
import { resolveDocumentUrl } from './page.utils';

type PanelCard = { key: string; node: ReactElement };

type PanelCardsProps = {
  highlightedSection: string | null;
  sessionInfo: any;
  profile: any;
  setIsQuestionnaireModalOpen: (open: boolean) => void;
  setIsAccountModalOpen: (open: boolean) => void;
  removeInjectedIntake: () => Promise<unknown>;
  removeInjectedProfile: () => Promise<unknown>;
  agentMetaRef: React.MutableRefObject<{ objective?: string; mode?: string }>;
  interviewCard: { badge: string; title: string; meta: string; detail: string };
  setInterviewIntake: (intake: any) => void;
  router: { push: (path: string) => void };
  unlockedPanelBlocks: { budgetUnlocked: boolean; transactionsUnlocked: boolean };
  setIsBudgetModalOpen: (open: boolean) => void;
  budgetTotals: { income: number; expenses: number };
  budgetInsights: { healthScore?: number } | null;
  openTransactionsPanel: () => void;
  transactionIntel: { docs: number; rows: number; amounts: number[] };
  reportsByGroup: Record<string, any[]>;
  librarySummary: string;
  savedReports: Array<{ id: string; title: string; group: string; fileUrl: string }>;
  recentLibraryRef: React.RefObject<HTMLDivElement>;
  isLandingRecents: boolean;
  recentReports: Array<{ id: string; title: string; fileUrl: string }>;
  newReportId: string | null;
  docVisualOffset: (id: string, idx: number) => { rotation: number; yShift: number };
};

export function buildPanelBaseCards(props: PanelCardsProps): PanelCard[] {
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
            profile={
              props.sessionInfo?.injectedProfile
                ? { profile: props.sessionInfo.injectedProfile }
                : props.profile
            }
            injected={Boolean(props.sessionInfo?.injectedProfile)}
            compactQuestionnaireCta
            onOpenQuestionnaire={() => props.setIsQuestionnaireModalOpen(true)}
            onCardClick={() => props.setIsAccountModalOpen(true)}
            actions={
              props.sessionInfo?.injectedProfile || props.sessionInfo?.injectedIntake ? (
                <>
                  {props.sessionInfo?.injectedIntake ? (
                    <button
                      className="continue-ghost profile-inline-action"
                      onClick={async () => {
                        await props.removeInjectedIntake();
                        window.location.reload();
                      }}
                    >
                      Remover intake inyectado
                    </button>
                  ) : null}
                  {props.sessionInfo?.injectedProfile ? (
                    <button
                      className="continue-ghost profile-inline-action"
                      onClick={async () => {
                        await props.removeInjectedProfile();
                        window.location.reload();
                      }}
                    >
                      Remover perfil inyectado
                    </button>
                  ) : null}
                </>
              ) : null
            }
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
            className={`panel-feature-card panel-pos-transactions ${props.unlockedPanelBlocks.transactionsUnlocked ? '' : 'is-locked'}${props.highlightedSection === 'transactions' ? ' is-panel-highlighted' : ''}`}
            onClick={props.openTransactionsPanel}
            title={
              props.unlockedPanelBlocks.transactionsUnlocked
                ? 'Abrir transacciones y finanzas abiertas'
                : 'Bloqueado: conversa sobre cartolas y banco'
            }
          >
            <span className="panel-feature-label">Transacciones</span>
            <span className="panel-feature-status">
              {props.unlockedPanelBlocks.transactionsUnlocked ? '● Activo' : '○ Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Lectura profunda de cartolas bancarias. Detección de patrones, alertas de gasto y análisis operativo de tus movimientos reales.
            </span>
            <span className="panel-feature-copy panel-feature-copy-secondary">
              {props.transactionIntel.docs > 0
                ? `${props.transactionIntel.docs} cartola${props.transactionIntel.docs > 1 ? 's' : ''} · ${props.transactionIntel.rows.toLocaleString('es-CL')} filas · ${props.transactionIntel.amounts.length} montos detectados`
                : 'Sube una cartola bancaria (PDF o Excel) para activar el análisis de movimientos.'}
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
            className={`panel-feature-card panel-pos-budget ${props.unlockedPanelBlocks.budgetUnlocked ? '' : 'is-locked'}${props.highlightedSection === 'budget' ? ' is-panel-highlighted' : ''}`}
            onClick={() => {
              if (!props.unlockedPanelBlocks.budgetUnlocked) return;
              props.setIsBudgetModalOpen(true);
            }}
            title={
              props.unlockedPanelBlocks.budgetUnlocked
                ? 'Abrir presupuesto inteligente'
                : 'Bloqueado: conversa sobre ingresos y gastos'
            }
          >
            <span className="panel-feature-label">Presupuesto</span>
            <span className="panel-feature-status">
              {props.unlockedPanelBlocks.budgetUnlocked ? '● Activo' : '○ Bloqueado'}
            </span>
            <span className="panel-feature-copy">
              Estructura tu flujo mensual con precisión de analista. Ingresos, gastos fijos, variables y ahorro real calculado por IA.
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
            className="interview-flow-card panel-pos-interview glass-card"
            onClick={() => {
              const injectedIntake = props.sessionInfo?.injectedIntake?.intake;
              if (injectedIntake && typeof injectedIntake === 'object') {
                props.setInterviewIntake(injectedIntake as any);
              }
              props.router.push('/interview');
            }}
            title="Ir a entrevista y diagnóstico"
          >
            <span className="interview-flow-label">{props.interviewCard.badge}</span>
            <span className="interview-flow-title">{props.interviewCard.title}</span>
            <span className="interview-flow-meta">{props.interviewCard.meta}</span>
            <span className="interview-flow-meta interview-flow-submeta">{props.interviewCard.detail}</span>
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
                <a key={report.id} href={resolveDocumentUrl(report.fileUrl)} target="_blank" rel="noreferrer" className="report-item">
                  <span>{report.title}</span>
                  <span className="report-tag">{report.group}</span>
                </a>
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
                <a
                  key={report.id}
                  href={resolveDocumentUrl(report.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
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
                  <div className="recent-item-preview-wrap">
                    <embed
                      src={`${resolveDocumentUrl(report.fileUrl)}#page=1&view=FitH&zoom=55`}
                      type="application/pdf"
                      className="recent-item-preview"
                    />
                  </div>
                  <span className="recent-item-name">{report.title}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ];
}
