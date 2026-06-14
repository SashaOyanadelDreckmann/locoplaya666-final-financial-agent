'use client';

import type { OnboardingFlowCtaModel } from './onboarding-flow.helpers';

type OnboardingFlowCtaProps = {
  model: OnboardingFlowCtaModel;
  onAction: () => void;
  variant?: 'thread' | 'inline';
};

export function OnboardingFlowCta({ model, onAction, variant = 'thread' }: OnboardingFlowCtaProps) {
  return (
    <div
      className={`onboarding-flow-cta${variant === 'inline' ? ' onboarding-flow-cta--inline' : ''}`}
      role="region"
      aria-label="Siguiente paso del diagnóstico"
    >
      <div className="onboarding-flow-cta__steps" aria-hidden="true">
        {model.steps.map((step) => (
          <span
            key={step.id}
            className={[
              'onboarding-flow-cta__step',
              step.done ? 'is-done' : '',
              step.current ? 'is-current' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="onboarding-flow-cta__step-dot" />
            <span className="onboarding-flow-cta__step-label">{step.label}</span>
          </span>
        ))}
      </div>

      <div className="onboarding-flow-cta__body">
        <p className="onboarding-flow-cta__headline">{model.headline}</p>
        <p className="onboarding-flow-cta__copy">{model.body}</p>

        {typeof model.progressRatio === 'number' && model.progressLabel ? (
          <div className="onboarding-flow-cta__progress">
            <div className="onboarding-flow-cta__progress-track">
              <span
                className="onboarding-flow-cta__progress-fill"
                style={{ width: `${Math.round(model.progressRatio * 100)}%` }}
              />
            </div>
            <span className="onboarding-flow-cta__progress-label">{model.progressLabel}</span>
          </div>
        ) : null}
      </div>

      <button type="button" className="onboarding-flow-cta__button" onClick={onAction}>
        {model.buttonLabel}
      </button>
    </div>
  );
}
