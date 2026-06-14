'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/compartido/utils';

export type ExecutiveCarouselTone = 'gold' | 'slate' | 'terra' | 'navy';

export type ExecutiveCarouselPage = {
  id: string;
  label: string;
  roman: string;
  tone: ExecutiveCarouselTone;
};

export function useExecutiveBlobCarousel(pages: ExecutiveCarouselPage[]) {
  const [active, setActive] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleChange = useCallback(
    (index: number, options?: { beforeChange?: (nextIndex: number) => void }) => {
      if (index === active || isTransitioning || index < 0 || index >= pages.length) return;
      options?.beforeChange?.(index);
      setIsTransitioning(true);
      window.setTimeout(() => {
        setActive(index);
        window.setTimeout(() => setIsTransitioning(false), 60);
      }, 280);
    },
    [active, isTransitioning, pages.length],
  );

  const handlePrev = useCallback(() => {
    handleChange(active === 0 ? pages.length - 1 : active - 1);
  }, [active, handleChange, pages.length]);

  const handleNext = useCallback(() => {
    handleChange(active === pages.length - 1 ? 0 : active + 1);
  }, [active, handleChange, pages.length]);

  const current = pages[active] ?? pages[0];
  const transition = isTransitioning ? ' is-transitioning' : '';

  return {
    active,
    current,
    transition,
    handleChange,
    handlePrev,
    handleNext,
  };
}

type ExecutiveBlobCarouselShellProps = {
  className?: string;
  pages: ExecutiveCarouselPage[];
  active: number;
  transition: string;
  navAriaLabel: string;
  masthead: ReactNode;
  slideLabel: ReactNode;
  children: ReactNode;
  hideNav?: boolean;
  hideStageChrome?: boolean;
  onChange: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function ExecutiveBlobCarouselShell(props: ExecutiveBlobCarouselShellProps) {
  const {
    className,
    pages,
    active,
    transition,
    navAriaLabel,
    masthead,
    slideLabel,
    children,
    hideNav = false,
    hideStageChrome = false,
    onChange,
    onPrev,
    onNext,
  } = props;

  if (pages.length === 0) return null;

  const current = pages[active] ?? pages[0];
  const shouldHideNav = hideNav || pages.length <= 1;

  return (
    <div className={cn('gradient-blob-card', shouldHideNav && 'gradient-blob-card--single', className)}>
      <div className="gradient-blob-card__frame">
        <div className="gradient-blob-card__blob gradient-blob-card__blob--a" aria-hidden="true" />
        <div className="gradient-blob-card__blob gradient-blob-card__blob--b" aria-hidden="true" />
        <div className="gradient-blob-card__glass">
          <div className="gradient-blob-card__editorial">
            <header className="gradient-blob-card__masthead">
              <div
                className={`gradient-blob-card__masthead-accent gradient-blob-card__masthead-accent--${current.tone}${transition}`}
                aria-hidden="true"
              />
              {masthead}
            </header>

            <div
              className={cn(
                'gradient-blob-card__stage',
                hideStageChrome && 'gradient-blob-card__stage--compact',
              )}
            >
              {!hideStageChrome ? (
                <span className="gradient-blob-card__index" style={{ fontFeatureSettings: '"tnum"' }}>
                  {String(active + 1).padStart(2, '0')}
                </span>
              ) : null}

              <div
                className={cn(
                  'gradient-blob-card__copy',
                  hideStageChrome && 'gradient-blob-card__copy--full',
                )}
              >
                {!hideStageChrome ? slideLabel : null}
                <div className="gradient-blob-card__slide-body">{children}</div>
              </div>
            </div>

            {!shouldHideNav ? (
            <nav className="gradient-blob-card__nav" aria-label={navAriaLabel}>
              <div className="gradient-blob-card__nav-top">
                <div className="gradient-blob-card__page-pills" role="tablist">
                  {pages.map((page, index) => (
                    <div
                      key={page.id}
                      role="tab"
                      tabIndex={0}
                      aria-selected={index === active}
                      aria-label={page.label}
                      className={`gradient-blob-card__page-pill gradient-blob-card__page-pill--${page.tone}${index === active ? ' is-active' : ''}`}
                      onClick={() => onChange(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onChange(index);
                        }
                      }}
                    >
                      <span className="gradient-blob-card__page-pill-roman">{page.roman}</span>
                      <span className="gradient-blob-card__page-pill-label">{page.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gradient-blob-card__nav-bottom">
                <div className="gradient-blob-card__lines">
                  {pages.map((page, index) => (
                    <div
                      key={`line-${page.id}`}
                      role="tab"
                      tabIndex={0}
                      aria-label={page.label}
                      aria-selected={index === active}
                      className="gradient-blob-card__line-btn"
                      onClick={() => onChange(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onChange(index);
                        }
                      }}
                    >
                      <span
                        className={`gradient-blob-card__line gradient-blob-card__line--${page.tone}${index === active ? ' is-active' : ''}`}
                      />
                    </div>
                  ))}
                </div>
                <span className="gradient-blob-card__counter">
                  {String(active + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
                </span>
              </div>

              <div className="gradient-blob-card__nav-arrows" aria-label="Navegar secciones">
                <button
                  type="button"
                  className={`gradient-blob-card__arrow gradient-blob-card__arrow--${current.tone}`}
                  onClick={onPrev}
                  aria-label="Sección anterior"
                >
                  <ChevronLeft className="gradient-blob-card__arrow-icon" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`gradient-blob-card__arrow gradient-blob-card__arrow--${current.tone}`}
                  onClick={onNext}
                  aria-label="Sección siguiente"
                >
                  <ChevronRight className="gradient-blob-card__arrow-icon" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </nav>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
