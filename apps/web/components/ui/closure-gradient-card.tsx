'use client';

import {
  buildClosureCarouselPages,
  resolveClosureSummaryBody,
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
  hideMasthead?: boolean;
};

export function ClosureGradientBlobCard({
  className,
  summary,
  hideMasthead = false,
}: ClosureGradientBlobCardProps) {
  const pages = buildClosureCarouselPages(summary);
  const { active, transition, handleChange, handlePrev, handleNext } = useExecutiveBlobCarousel(pages);
  const current = pages[active];
  const body = resolveClosureSummaryBody(summary);

  if (!current) return null;

  return (
    <ExecutiveBlobCarouselShell
      className={className}
      pages={pages}
      active={active}
      transition={transition}
      navAriaLabel="Resumen de cierre"
      hideNav
      hideStageChrome
      masthead={
        hideMasthead ? null : (
          <>
            <p className="gradient-blob-card__masthead-brand">{summary.kicker}</p>
            <h2 className="gradient-blob-card__masthead-title">{summary.title}</h2>
            <p className="gradient-blob-card__masthead-dek">{summary.subtitle}</p>
            <div className="gradient-blob-card__masthead-rule" aria-hidden="true" />
          </>
        )
      }
      slideLabel={null}
      onChange={(index) => handleChange(index)}
      onPrev={handlePrev}
      onNext={handleNext}
    >
      <div className="premium-markdown gradient-blob-card__closure-markdown">
        {renderLatexDocMessage(body)}
      </div>
      {current.footer ? (
        <p className={`gradient-blob-card__dek-text gradient-blob-card__closing-question${transition}`}>
          {current.footer}
        </p>
      ) : null}
    </ExecutiveBlobCarouselShell>
  );
}

export default ClosureGradientBlobCard;
