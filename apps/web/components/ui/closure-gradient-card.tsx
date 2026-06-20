'use client';

import type { ReactNode } from 'react';

import {
  resolveClosureSummaryBody,
  resolveClosureSummaryNextStep,
  resolveClosureSummaryThankYou,
  type ChatClosureSummary,
} from '@financial-agent/shared';

import { cn } from '@/lib/compartido/utils';
import { renderLatexDocMessage } from '@/app/agent/chat/message-renderer';

type ClosureGradientBlobCardProps = {
  className?: string;
  summary: ChatClosureSummary;
  saveAction?: ReactNode;
};

export function ClosureGradientBlobCard({
  className,
  summary,
  saveAction,
}: ClosureGradientBlobCardProps) {
  const body = resolveClosureSummaryBody(summary);
  const nextStep = resolveClosureSummaryNextStep(summary);
  const thankYou = resolveClosureSummaryThankYou(summary);

  return (
    <div className={cn('gradient-blob-card gradient-blob-card--single gradient-blob-card--closure closure-gradient-card-wrap', className)}>
      <div className="gradient-blob-card__frame closure-gradient-card__frame">
        <div className="gradient-blob-card__blob gradient-blob-card__blob--a" aria-hidden="true" />
        <div className="gradient-blob-card__blob gradient-blob-card__blob--b" aria-hidden="true" />
        <div className="gradient-blob-card__glass closure-gradient-card__glass">
          <div className="gradient-blob-card__editorial closure-gradient-card__editorial">
            <header className="closure-gradient-card__header-bar">
              {saveAction ? (
                <div className="closure-gradient-card__save-slot">{saveAction}</div>
              ) : null}
              <h2 className="closure-gradient-card__title">{summary.title}</h2>
            </header>
            <div
              className="gradient-blob-card__masthead-accent gradient-blob-card__masthead-accent--gold"
              aria-hidden="true"
            />

            <div className="closure-gradient-card__content">
              <div className="premium-markdown gradient-blob-card__closure-markdown">
                {renderLatexDocMessage(body)}
              </div>

              <div className="closure-gradient-card__next-step">
                <p className="closure-gradient-card__next-step-label">Proximo paso</p>
                <p className="closure-gradient-card__next-step-body">{nextStep}</p>
              </div>

              <p className="closure-gradient-card__thank-you">{thankYou}</p>

              {summary.footer ? (
                <p className="closure-gradient-card__footnote">{summary.footer}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClosureGradientBlobCard;
