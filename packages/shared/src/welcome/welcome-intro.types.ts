export type WelcomeIntroSection = {
  marco: { title: string; body: string };
  fintech: { title: string; body: string; benefit: string };
  metodo: Array<{ step: number; label: string; detail: string }>;
  resultado: { title: string; body: string };
};

export const EXECUTIVE_INTRO_UI_VERSION = 9;
/** Hard cap: welcome intro LLM calls per user (lifetime). */
export const WELCOME_INTRO_MAX_LLM_GENERATIONS = 2;

import type { WelcomeGuideAction, WelcomeProductHint } from './welcome-guide.types';

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
  guideActions?: WelcomeGuideAction[];
  productHints?: WelcomeProductHint[];
  productBlurb?: string;
};

export type WelcomeIntroCache = {
  fingerprint: string;
  uiVersion: number;
  intro: WelcomeIntroPayload;
  createdAt: string;
  /** Number of successful LLM generations stored for this user (max 2). */
  llmGenerationCount?: number;
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
