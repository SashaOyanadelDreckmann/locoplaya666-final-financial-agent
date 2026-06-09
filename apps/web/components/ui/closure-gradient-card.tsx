'use client';

import {
  buildClosureCarouselPages,
  type ChatClosureSummary,
} from '@financial-agent/shared';

import {
  ExecutiveBlobCarouselShell,
  useExecutiveBlobCarousel,
} from '@/components/ui/executive-blob-carousel';

type ClosureGradientBlobCardProps = {
  className?: string;
  summary: ChatClosureSummary;
};

export function ClosureGradientBlobCard({ className, summary }: ClosureGradientBlobCardProps) {
  const pages = buildClosureCarouselPages(summary);
  const { active, transition, handleChange, handlePrev, handleNext } = useExecutiveBlobCarousel(pages);
  const current = pages[active];

  if (!current) return null;

  return (
    <ExecutiveBlobCarouselShell
      className={className}
      pages={pages}
      active={active}
      transition={transition}
      navAriaLabel="Secciones del resumen de cierre"
      masthead={
        <>
          <p className="gradient-blob-card__masthead-brand">{summary.kicker}</p>
          <h2 className="gradient-blob-card__masthead-title">{summary.title}</h2>
          <p className="gradient-blob-card__masthead-dek">{summary.subtitle}</p>
          <div className="gradient-blob-card__masthead-rule" aria-hidden="true" />
        </>
      }
      slideLabel={
        <p className={`gradient-blob-card__slide-label${transition}`}>{current.label}</p>
      }
      onChange={(index) => handleChange(index)}
      onPrev={handlePrev}
      onNext={handleNext}
    >
      <blockquote
        className={`gradient-blob-card__body-text gradient-blob-card__body-text--lead${transition}`}
      >
        {current.body}
      </blockquote>
      {current.footer ? (
        <p className={`gradient-blob-card__dek-text gradient-blob-card__closing-question${transition}`}>
          {current.footer}
        </p>
      ) : null}
    </ExecutiveBlobCarouselShell>
  );
}

export default ClosureGradientBlobCard;
