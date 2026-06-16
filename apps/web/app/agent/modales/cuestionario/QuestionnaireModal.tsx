'use client';

import { useEffect, useState } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import { updateIntakeQuestionnaire } from '@/lib/sesion/intake';
import { toUserFacingError } from '@/lib/compartido/userError';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import {
  QuestionnaireEditForm,
  coerceIntakeQuestionnaire,
} from './QuestionnaireEditForm';

type QuestionnaireDashboard = {
  readinessScore: number;
  understanding: number | null;
  stress: number | null;
  responsePairs: Array<{ label: string; value: string }>;
  insights: string[];
};

export function QuestionnaireModal(props: {
  isOpen: boolean;
  mode?: 'view' | 'edit';
  questionnaireDashboard: QuestionnaireDashboard | null;
  intakeData: Record<string, unknown> | null;
  sessionUserName?: string | null;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>(props.mode ?? 'view');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.isOpen) {
      setMode(props.mode ?? 'view');
      setError(null);
    }
  }, [props.isOpen, props.mode]);

  const editableIntake = coerceIntakeQuestionnaire(props.intakeData);

  if (!props.isOpen || !props.questionnaireDashboard) return null;

  const userName = String(props.sessionUserName ?? '').trim();
  const responseVariantClass = (item: { label: string; value: string }, index: number) => {
    const seed = `${item.label}:${item.value}:${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const variants = ['is-black', 'is-blue', 'is-gold', 'is-red', 'is-light', 'is-black'];
    return variants[hash % variants.length];
  };

  const handleSave = async (next: IntakeQuestionnaire) => {
    try {
      setSaving(true);
      setError(null);
      await updateIntakeQuestionnaire(next);
      await props.onUpdated?.();
      setMode('view');
    } catch (saveError) {
      setError(toUserFacingError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agent-modal-overlay" onClick={props.onClose}>
      <div
        className="agent-modal questionnaire-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="questionnaire-modal-title"
      >
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="questionnaire-modal-title" className="bcc-modal-title">
              {mode === 'edit' ? 'Actualizar cuestionario' : 'Cuestionario y lectura ejecutiva'}
            </h3>
            {userName ? <p className="questionnaire-user-name">{userName}</p> : null}
          </div>
          <AgentModalCloseButton onClick={props.onClose} />
        </div>

        {mode === 'edit' && editableIntake ? (
          <QuestionnaireEditForm
            intake={editableIntake}
            saving={saving}
            error={error}
            onCancel={() => setMode('view')}
            onSave={handleSave}
          />
        ) : (
          <>
            <p className="agent-modal-intro">
              Vista de lectura con tus respuestas del intake. Puedes actualizarlas sin costo cuando tu
              situación cambie.
            </p>
            <div className="questionnaire-dashboard">
              <div className="questionnaire-kpi-grid">
                <article className="questionnaire-kpi">
                  <span className="questionnaire-kpi-label">Preparación</span>
                  <strong>{props.questionnaireDashboard.readinessScore}%</strong>
                </article>
                <article className="questionnaire-kpi">
                  <span className="questionnaire-kpi-label">Comprensión</span>
                  <strong>
                    {props.questionnaireDashboard.understanding !== null
                      ? `${props.questionnaireDashboard.understanding}/10`
                      : 'N/D'}
                  </strong>
                </article>
                <article className="questionnaire-kpi">
                  <span className="questionnaire-kpi-label">Estrés</span>
                  <strong>
                    {props.questionnaireDashboard.stress !== null
                      ? `${props.questionnaireDashboard.stress}/10`
                      : 'N/D'}
                  </strong>
                </article>
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
                <ul>
                  {props.questionnaireDashboard.insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              </div>
            </div>
            {editableIntake ? (
              <div className="questionnaire-edit-actions questionnaire-edit-actions--footer">
                <button
                  type="button"
                  className="questionnaire-edit-btn is-primary"
                  onClick={() => setMode('edit')}
                >
                  Actualizar respuestas
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
