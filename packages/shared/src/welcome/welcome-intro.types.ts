export type WelcomeIntroSection = {
  marco: { title: string; body: string };
  fintech: { title: string; body: string; benefit: string };
  metodo: Array<{ step: number; label: string; detail: string }>;
  resultado: { title: string; body: string };
};

export const EXECUTIVE_INTRO_UI_VERSION = 8;

export type WelcomeIntroPayload = {
  version: 2;
  uiVersion?: number;
  firstName: string;
  headline: string;
  wittyHook?: string;
  personalRead: string;
  signals: string[];
  sections: WelcomeIntroSection;
  closingQuestion: string;
};

export type WelcomeIntroCache = {
  fingerprint: string;
  uiVersion: number;
  intro: WelcomeIntroPayload;
  createdAt: string;
};

export type InjectedIntakeEnvelope = {
  intake?: Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
  llmSummary?: { summary?: string; highlights?: string[] } | null;
  productsContext?: Record<string, unknown>;
  budgetContext?: Record<string, unknown>;
  welcomeIntroCache?: WelcomeIntroCache;
  [key: string]: unknown;
};
