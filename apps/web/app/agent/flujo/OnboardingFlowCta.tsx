'use client';

import { useMemo } from 'react';

import { ONBOARDING_STEP_MATTE_COLORS } from '@/lib/agente/matte-panel-tones';

import type { OnboardingFlowCtaModel } from './onboarding-flow.helpers';

type OnboardingFlowCtaProps = {
  model: OnboardingFlowCtaModel;
  onAction: () => void;
  variant?: 'thread' | 'inline';
};

export function OnboardingFlowCta({ model, onAction, variant = 'thread' }: OnboardingFlowCtaProps) {
  const activeIndex = useMemo(() => {
    const current = model.steps.findIndex((step) => step.current);
    return current >= 0 ? current : 0;
  }, [model.steps]);
  const activeStepColor = ONBOARDING_STEP_MATTE_COLORS[activeIndex] ?? ONBOARDING_STEP_MATTE_COLORS[0];
  const accentStyle = { '--onboarding-accent': activeStepColor } as React.CSSProperties;

  return (
    <div
      className={`onboarding-flow-cta${variant === 'inline' ? ' onboarding-flow-cta--inline' : ''}`}
      data-onboarding-flow-cta="true"
      role="region"
      aria-label="Siguiente paso del diagnóstico"
      style={accentStyle}
    >
      <div className="onboarding-flow-cta__track" role="list" aria-label="Etapas del diagnóstico">
        {model.steps.map((step, index) => {
          const status = step.done ? 'done' : step.current ? 'active' : 'pending';
          return (
            <div
              key={step.id}
              className={`onboarding-flow-cta__segment is-${status}`}
              role="listitem"
              aria-current={step.current ? 'step' : undefined}
              aria-label={step.label}
              style={
                { '--onboarding-step-color': ONBOARDING_STEP_MATTE_COLORS[index] } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      <div className="onboarding-flow-cta__head">
        <span className="onboarding-flow-cta__pulse" aria-hidden="true" style={accentStyle} />
        <div className="onboarding-flow-cta__body">
          <p className="onboarding-flow-cta__headline">{model.headline}</p>
          <p className="onboarding-flow-cta__copy">{model.body}</p>

          {typeof model.progressRatio === 'number' && model.progressLabel ? (
            <div className="onboarding-flow-cta__progress">
              <div className="onboarding-flow-cta__progress-track">
                <span
                  className="onboarding-flow-cta__progress-fill"
                  style={{
                    width: `${Math.round(model.progressRatio * 100)}%`,
                    '--onboarding-step-color': activeStepColor,
                  } as React.CSSProperties}
                />
              </div>
              <span className="onboarding-flow-cta__progress-label">{model.progressLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      <button type="button" className="onboarding-flow-cta__button" onClick={onAction} style={accentStyle}>
        {model.buttonLabel}
      </button>
    </div>
  );
}
