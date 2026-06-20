import {
  resolveClosureSummaryBody,
  type ChatClosureSummary,
} from './chat-closure-summary';

export type ClosureCarouselTone = 'gold' | 'slate' | 'terra' | 'navy';

export type ClosureCarouselPage = {
  id: string;
  label: string;
  roman: string;
  tone: ClosureCarouselTone;
  body: string;
  footer?: string;
};

export function buildClosureCarouselPages(summary: ChatClosureSummary): ClosureCarouselPage[] {
  return [
    {
      id: 'closure-summary',
      label: 'Resumen',
      roman: 'I',
      tone: 'gold',
      body: resolveClosureSummaryBody(summary),
      footer: summary.footer,
    },
  ];
}
