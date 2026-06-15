'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/compartido/utils';
import {
  applyHighlightNeighborBleed,
  buildAgentHighlightTerms,
  parseAgentHeroSegments,
  type AgentHeroTextSegment,
} from '@/app/agent/utilidades/agent-hero-highlight.helpers';
import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';

type AgentHeroTextProps = {
  text: string;
  speed?: number;
  turnKey?: string | number;
  className?: string;
  pending?: boolean;
  focusRow?: BudgetRow | null;
  budgetRows?: BudgetRow[];
  question?: string | null;
  assistantToneClass?: string | null;
};

function renderStableTypewriterNodes(
  segments: AgentHeroTextSegment[],
  visibleLength: number,
): ReactNode[] {
  let offset = 0;
  let highlightIndex = 0;
  const nodes: React.ReactNode[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentEnd = offset + segment.text.length;
    if (visibleLength <= offset) break;

    const visibleSlice = segment.text.slice(0, Math.min(segment.text.length, visibleLength - offset));
    offset = segmentEnd;
    if (!visibleSlice) continue;

    nodes.push(
      segment.highlight ? (
        <span
          key={`kw-${index}`}
          className={`agent-keyword-gradient agent-keyword-gradient--s${highlightIndex % 3}`}
        >
          {visibleSlice}
        </span>
      ) : (
        <span key={`plain-${index}`} className="bcc-hero-plain-chunk">
          {visibleSlice}
        </span>
      ),
    );

    if (segment.highlight) highlightIndex += 1;
  }

  return nodes;
}

function HighlightedTypewriter({
  text,
  speed,
  terms,
}: {
  text: string;
  speed: number;
  terms: string[];
}) {
  const [visibleLength, setVisibleLength] = useState(0);

  const segments = useMemo(
    () => applyHighlightNeighborBleed(parseAgentHeroSegments(text, terms), 0),
    [text, terms],
  );

  useEffect(() => {
    setVisibleLength(0);
  }, [text]);

  useEffect(() => {
    if (!text) return;
    if (visibleLength >= text.length) return;

    const timeout = window.setTimeout(() => {
      setVisibleLength((prev) => Math.min(text.length, prev + 1));
    }, speed);

    return () => window.clearTimeout(timeout);
  }, [speed, text, visibleLength]);

  return <>{renderStableTypewriterNodes(segments, visibleLength)}</>;
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
  assistantToneClass = null,
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
        'bcc-hero-question bcc-hero-question--gradient-demo text-center',
        pending && 'bcc-hero-question--pending',
        assistantToneClass,
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
