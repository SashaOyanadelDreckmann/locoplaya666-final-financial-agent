import type { ChatClosureSummary } from './chat-closure-summary';

export type ClosureCarouselTone = 'gold' | 'slate' | 'terra' | 'navy';

export type ClosureCarouselPage = {
  id: string;
  label: string;
  roman: string;
  tone: ClosureCarouselTone;
  body: string;
  footer?: string;
};

const CLOSURE_TONES: ClosureCarouselTone[] = ['gold', 'slate', 'terra', 'navy'];
const CLOSURE_ROMANS = ['I', 'II', 'III', 'IV'] as const;

export function buildClosureCarouselPages(summary: ChatClosureSummary): ClosureCarouselPage[] {
  const sections = Array.isArray(summary.sections) ? summary.sections.slice(0, 4) : [];

  return sections.map((section, index) => ({
    id: `closure-${index + 1}`,
    label: section.label,
    roman: CLOSURE_ROMANS[index] ?? String(index + 1),
    tone: CLOSURE_TONES[index] ?? 'gold',
    body: section.body,
    footer: index === sections.length - 1 ? summary.footer : undefined,
  }));
}
