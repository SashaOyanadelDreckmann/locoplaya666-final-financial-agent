'use client';

type QuestionnaireDashboard = {
  readinessScore: number;
  understanding: number | null;
  stress: number | null;
  responsePairs: Array<{ label: string; value: string }>;
  insights: string[];
};

export function QuestionnaireModal(props: {
  isOpen: boolean;
  questionnaireDashboard: QuestionnaireDashboard | null;
  sessionUserName?: string | null;
  onClose: () => void;
}) {
  if (!props.isOpen || !props.questionnaireDashboard) return null;
  const userName = String(props.sessionUserName ?? '').trim();
  const responseVariantClass = (item: { label: string; value: string }, index: number) => {
    const seed = `${item.label}:${item.value}:${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const variants = ['is-black', 'is-blue', 'is-gold', 'is-red', 'is-light', 'is-black'];
    return variants[hash % variants.length];
  };
  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div className="agent-modal questionnaire-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 className="bcc-modal-title">Cuestionario y lectura ejecutiva</h3>
            {userName ? <p className="questionnaire-user-name">{userName}</p> : null}
          </div>
          <button type="button" className="agent-modal-close" onClick={props.onClose}>×</button>
        </div>
        <p className="agent-modal-intro">Resumen de respuestas del intake con una lectura breve para decisiones tácticas.</p>
        <div className="questionnaire-dashboard">
          <div className="questionnaire-kpi-grid">
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Preparación</span><strong>{props.questionnaireDashboard.readinessScore}%</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Comprensión</span><strong>{props.questionnaireDashboard.understanding !== null ? `${props.questionnaireDashboard.understanding}/10` : 'N/D'}</strong></article>
            <article className="questionnaire-kpi"><span className="questionnaire-kpi-label">Estrés</span><strong>{props.questionnaireDashboard.stress !== null ? `${props.questionnaireDashboard.stress}/10` : 'N/D'}</strong></article>
          </div>
          <div className="questionnaire-response-grid">
            {props.questionnaireDashboard.responsePairs.map((item, index) => (
              <div
                key={item.label}
                className={`questionnaire-response-item ${responseVariantClass(item, index)}`}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="questionnaire-insights">
            <span className="questionnaire-kpi-label">Lecturas</span>
            <ul>{props.questionnaireDashboard.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}
