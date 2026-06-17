export type WelcomeGuideActionKind = 'message' | 'panel';

export type WelcomeGuidePanelSection =
  | 'transactions'
  | 'products_transactions'
  | 'budget'
  | 'interview';

export type WelcomeGuideAction = {
  id: string;
  label: string;
  kind: WelcomeGuideActionKind;
  message?: string;
  panelSection?: WelcomeGuidePanelSection;
};

export type WelcomeProductHint = {
  label: string;
  fact: string;
  source: string;
  url?: string;
};

export type WelcomeGuideEnrichment = {
  chatId: 'chat-1' | 'chat-2' | 'chat-3';
  guideActions: WelcomeGuideAction[];
  productHints: WelcomeProductHint[];
  productBlurb?: string;
};
