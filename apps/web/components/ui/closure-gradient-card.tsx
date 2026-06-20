'use client';

import type { ReactNode } from 'react';

import {
  buildClosureCarouselPages,
  resolveClosureSummaryBody,
  resolveClosureSummaryNextStep,
  type ChatClosureSummary,
} from '@financial-agent/shared';

import {
  ExecutiveBlobCarouselShell,
  useExecutiveBlobCarousel,
} from '@/components/ui/executive-blob-carousel';
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
  const pages = buildClosureCarouselPages(summary);
  const { active, transition, handleChange, handlePrev, handleNext } = useExecutiveBlobCarousel(pages);
  const current = pages[active];
  const body = resolveClosureSummaryBody(summary);
  const nextStep = resolveClosureSummaryNextStep(summary);

  if (!current) return null;

  return (
    <div className="closure-gradient-card-wrap">
      {saveAction ? <div className="closure-gradient-card__save-slot">{saveAction}</div> : null}
      <ExecutiveBlobCarouselShell
        className={className}
        pages={pages}
        active={active}
        transition={transition}
        navAriaLabel="Resumen de cierre"
        hideNav
        hideStageChrome
        masthead={
          <h2 className="gradient-blob-card__masthead-title gradient-blob-card__masthead-title--closure">
            {summary.title}
          </h2>
        }
        slideLabel={null}
        onChange={(index) => handleChange(index)}
        onPrev={handlePrev}
        onNext={handleNext}
      >
        <div className="premium-markdown gradient-blob-card__closure-markdown">
          {renderLatexDocMessage(body)}
        </div>
        <div className="closure-gradient-card__next-step">
          <p className="closure-gradient-card__next-step-label">Proximo paso</p>
          <p className="closure-gradient-card__next-step-body">{nextStep}</p>
        </div>
        {current.footer ? (
          <p className={`gradient-blob-card__dek-text gradient-blob-card__closing-question${transition}`}>
            {current.footer}
          </p>
        ) : null}
      </ExecutiveBlobCarouselShell>
    </div>
  );
}

export default ClosureGradientBlobCard;
