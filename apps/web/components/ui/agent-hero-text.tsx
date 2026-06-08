'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { GradientText } from '@/components/ui/gradient-text';
import {
  applyHighlightNeighborBleed,
  buildAgentHighlightTerms,
  parseAgentHeroSegments,
} from '@/app/agent/agent-hero-highlight.helpers';
import type { BudgetRow } from '@/lib/budget-rows.helpers';

type AgentHeroTextProps = {
  text: string;
  speed?: number;
  turnKey?: string | number;
  className?: string;
  pending?: boolean;
  focusRow?: BudgetRow | null;
  budgetRows?: BudgetRow[];
  question?: string | null;
};

function HighlightedTypewriter({
  text,
  speed,
  terms,
}: {
  text: string;
  speed: number;
  terms: string[];
}) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setDisplayText('');
    setCurrentIndex(0);
  }, [text]);

  useEffect(() => {
    if (!text) return;
    if (currentIndex >= text.length) return;

    const timeout = window.setTimeout(() => {
      setDisplayText((prev) => prev + text[currentIndex]);
      setCurrentIndex((prev) => prev + 1);
    }, speed);

    return () => window.clearTimeout(timeout);
  }, [currentIndex, speed, text]);

  const segments = useMemo(
    () => applyHighlightNeighborBleed(parseAgentHeroSegments(displayText, terms), 1),
    [displayText, terms],
  );

  return (
    <>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <GradientText key={`${index}-${segment.text}`} className="gradient-text--agent-bleed">
            {segment.text}
          </GradientText>
        ) : (
          <span key={`${index}-${segment.text}`} className="bcc-hero-plain-chunk">
            {segment.text}
          </span>
        ),
      )}
    </>
  );
}

export function AgentHeroText({
  text,
  speed = 28,
  turnKey = 0,
  className,
  pending = false,
  focusRow = null,
  budgetRows = [],
  question = null,
}: AgentHeroTextProps) {
  const highlightTerms = useMemo(
    () =>
      buildAgentHighlightTerms({
        text,
        focusRow,
        budgetRows,
        question,
      }),
    [text, focusRow, budgetRows, question],
  );

  return (
    <h1
      className={cn(
        'bcc-hero-question bcc-hero-question--gradient-demo text-center text-4xl font-bold tracking-tighter md:text-5xl lg:text-7xl',
        pending && 'bcc-hero-question--pending',
        className,
      )}
    >
      <HighlightedTypewriter
        key={`agent-hero-${turnKey}`}
        text={text}
        speed={speed}
        terms={highlightTerms}
      />
    </h1>
  );
}
