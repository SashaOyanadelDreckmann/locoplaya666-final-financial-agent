import type { BudgetTableStyleId } from './budget-modal.helpers';

export type BudgetPdfThemeTokens = {
  pageBg: string;
  snapshotBg: string;
  text: string;
  muted: string;
  accent: string;
  headerBorder: string;
  kicker: string;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  metricBg: string;
  metricBorder: string;
  metricLabel: string;
  metricIncome: string;
  metricExpense: string;
  metricBalance: string;
  surfaceBg: string;
  surfaceBorder: string;
  thBg: string;
  thText: string;
  thBorder: string;
  tdBg: string;
  tdText: string;
  tdBorder: string;
  incomeRowBg: string;
  expenseRowBg: string;
  impactStrong: string;
  impactMuted: string;
};

export const BUDGET_PDF_THEMES: Record<BudgetTableStyleId, BudgetPdfThemeTokens> = {
  midnight: {
    pageBg: '#eef2f7',
    snapshotBg: '#eef2f7',
    text: '#132033',
    muted: 'rgba(48, 68, 92, 0.72)',
    accent: '#46698f',
    headerBorder: 'rgba(68, 96, 128, 0.18)',
    kicker: '#46698f',
    title: '#132033',
    subtitle: '#2b3f53',
    badgeBg: 'rgba(68, 96, 128, 0.08)',
    badgeBorder: 'rgba(68, 96, 128, 0.24)',
    badgeText: '#355f89',
    metricBg: 'rgba(14, 20, 32, 0.96)',
    metricBorder: 'rgba(136, 167, 188, 0.18)',
    metricLabel: 'rgba(152, 176, 198, 0.84)',
    metricIncome: '#8fd4a8',
    metricExpense: '#e8a0a0',
    metricBalance: '#f2f7fc',
    surfaceBg: '#05070b',
    surfaceBorder: 'rgba(136, 167, 188, 0.2)',
    thBg: 'rgba(136, 167, 188, 0.12)',
    thText: 'rgba(220, 232, 245, 0.82)',
    thBorder: 'rgba(136, 167, 188, 0.16)',
    tdBg: '#05070b',
    tdText: '#f2f7fc',
    tdBorder: 'rgba(136, 167, 188, 0.1)',
    incomeRowBg: 'rgba(24, 48, 34, 0.72)',
    expenseRowBg: 'rgba(52, 22, 28, 0.72)',
    impactStrong: '#dce8f2',
    impactMuted: 'rgba(152, 176, 198, 0.78)',
  },
  ledger: {
    pageBg: '#f5f1e8',
    snapshotBg: '#f5f1e8',
    text: '#141312',
    muted: 'rgba(88, 68, 48, 0.78)',
    accent: '#786044',
    headerBorder: 'rgba(120, 96, 68, 0.2)',
    kicker: '#786044',
    title: '#1a1714',
    subtitle: '#3f3428',
    badgeBg: 'rgba(120, 96, 68, 0.1)',
    badgeBorder: 'rgba(120, 96, 68, 0.28)',
    badgeText: '#3f3428',
    metricBg: '#faf5ed',
    metricBorder: 'rgba(120, 96, 68, 0.18)',
    metricLabel: 'rgba(88, 68, 48, 0.78)',
    metricIncome: '#2f6b42',
    metricExpense: '#8f3f3f',
    metricBalance: '#1a1714',
    surfaceBg: '#f4efe7',
    surfaceBorder: 'rgba(120, 96, 68, 0.28)',
    thBg: '#ebe0d1',
    thText: 'rgba(88, 68, 48, 0.82)',
    thBorder: 'rgba(120, 96, 68, 0.22)',
    tdBg: '#f4efe7',
    tdText: '#141312',
    tdBorder: 'rgba(120, 96, 68, 0.14)',
    incomeRowBg: 'rgba(232, 246, 236, 0.92)',
    expenseRowBg: 'rgba(248, 236, 234, 0.92)',
    impactStrong: '#141312',
    impactMuted: 'rgba(88, 68, 48, 0.72)',
  },
  atelier: {
    pageBg: '#efe6dc',
    snapshotBg: '#efe6dc',
    text: '#2a211b',
    muted: 'rgba(88, 62, 48, 0.72)',
    accent: '#8a4f3d',
    headerBorder: 'rgba(120, 84, 64, 0.18)',
    kicker: '#8a4f3d',
    title: '#2a211b',
    subtitle: '#4a3b31',
    badgeBg: 'rgba(130, 64, 54, 0.1)',
    badgeBorder: 'rgba(214, 160, 124, 0.28)',
    badgeText: '#6b4030',
    metricBg: 'rgba(17, 18, 21, 0.94)',
    metricBorder: 'rgba(214, 160, 124, 0.18)',
    metricLabel: 'rgba(214, 160, 124, 0.78)',
    metricIncome: '#d4a574',
    metricExpense: '#e2a8a0',
    metricBalance: '#f8efe6',
    surfaceBg: '#111215',
    surfaceBorder: 'rgba(214, 160, 124, 0.2)',
    thBg: 'rgba(130, 64, 54, 0.18)',
    thText: 'rgba(242, 233, 223, 0.82)',
    thBorder: 'rgba(214, 160, 124, 0.16)',
    tdBg: '#111215',
    tdText: '#f2e9df',
    tdBorder: 'rgba(214, 160, 124, 0.1)',
    incomeRowBg: 'rgba(54, 34, 24, 0.72)',
    expenseRowBg: 'rgba(48, 22, 22, 0.72)',
    impactStrong: '#f2e9df',
    impactMuted: 'rgba(214, 160, 124, 0.72)',
  },
  terminal: {
    pageBg: '#e8f2ed',
    snapshotBg: '#e8f2ed',
    text: '#132b28',
    muted: 'rgba(48, 88, 72, 0.72)',
    accent: '#397666',
    headerBorder: 'rgba(57, 118, 102, 0.18)',
    kicker: '#397666',
    title: '#132b28',
    subtitle: '#2b453f',
    badgeBg: 'rgba(57, 118, 102, 0.1)',
    badgeBorder: 'rgba(57, 118, 102, 0.28)',
    badgeText: '#2f5f52',
    metricBg: 'rgba(8, 22, 18, 0.96)',
    metricBorder: 'rgba(132, 198, 176, 0.16)',
    metricLabel: 'rgba(132, 198, 176, 0.8)',
    metricIncome: '#9ee8c0',
    metricExpense: '#f0a8a8',
    metricBalance: '#e9fff5',
    surfaceBg: '#07110f',
    surfaceBorder: 'rgba(132, 198, 176, 0.22)',
    thBg: 'rgba(57, 118, 102, 0.16)',
    thText: 'rgba(196, 255, 226, 0.82)',
    thBorder: 'rgba(132, 198, 176, 0.14)',
    tdBg: '#07110f',
    tdText: 'rgba(196, 255, 226, 0.88)',
    tdBorder: 'rgba(132, 198, 176, 0.1)',
    incomeRowBg: 'rgba(12, 36, 26, 0.72)',
    expenseRowBg: 'rgba(36, 16, 18, 0.72)',
    impactStrong: '#e9fff5',
    impactMuted: 'rgba(132, 198, 176, 0.76)',
  },
  carbon: {
    pageBg: '#eceff4',
    snapshotBg: '#eceff4',
    text: '#12151c',
    muted: 'rgba(64, 76, 96, 0.72)',
    accent: '#5a6880',
    headerBorder: 'rgba(92, 108, 132, 0.18)',
    kicker: '#5a6880',
    title: '#12151c',
    subtitle: '#2b3340',
    badgeBg: 'rgba(92, 108, 132, 0.08)',
    badgeBorder: 'rgba(92, 108, 132, 0.22)',
    badgeText: '#3f4d62',
    metricBg: '#0c0e12',
    metricBorder: 'rgba(184, 202, 230, 0.12)',
    metricLabel: 'rgba(184, 202, 230, 0.76)',
    metricIncome: '#a8e8b0',
    metricExpense: '#f0a0a8',
    metricBalance: '#f4f8ff',
    surfaceBg: '#000000',
    surfaceBorder: 'rgba(184, 202, 230, 0.18)',
    thBg: 'rgba(255, 255, 255, 0.04)',
    thText: 'rgba(210, 224, 244, 0.82)',
    thBorder: 'rgba(184, 202, 230, 0.12)',
    tdBg: '#08090c',
    tdText: '#f4f8ff',
    tdBorder: 'rgba(184, 202, 230, 0.08)',
    incomeRowBg: 'rgba(30, 58, 24, 0.72)',
    expenseRowBg: 'rgba(58, 18, 24, 0.72)',
    impactStrong: '#f4f8ff',
    impactMuted: 'rgba(184, 202, 230, 0.72)',
  },
};

function themeVars(tokens: BudgetPdfThemeTokens) {
  return `
  --pdf-page-bg: ${tokens.pageBg};
  --pdf-snapshot-bg: ${tokens.snapshotBg};
  --pdf-text: ${tokens.text};
  --pdf-muted: ${tokens.muted};
  --pdf-accent: ${tokens.accent};
  --pdf-header-border: ${tokens.headerBorder};
  --pdf-kicker: ${tokens.kicker};
  --pdf-title: ${tokens.title};
  --pdf-subtitle: ${tokens.subtitle};
  --pdf-badge-bg: ${tokens.badgeBg};
  --pdf-badge-border: ${tokens.badgeBorder};
  --pdf-badge-text: ${tokens.badgeText};
  --pdf-metric-bg: ${tokens.metricBg};
  --pdf-metric-border: ${tokens.metricBorder};
  --pdf-metric-label: ${tokens.metricLabel};
  --pdf-metric-income: ${tokens.metricIncome};
  --pdf-metric-expense: ${tokens.metricExpense};
  --pdf-metric-balance: ${tokens.metricBalance};
  --pdf-surface-bg: ${tokens.surfaceBg};
  --pdf-surface-border: ${tokens.surfaceBorder};
  --pdf-th-bg: ${tokens.thBg};
  --pdf-th-text: ${tokens.thText};
  --pdf-th-border: ${tokens.thBorder};
  --pdf-td-bg: ${tokens.tdBg};
  --pdf-td-text: ${tokens.tdText};
  --pdf-td-border: ${tokens.tdBorder};
  --pdf-income-row-bg: ${tokens.incomeRowBg};
  --pdf-expense-row-bg: ${tokens.expenseRowBg};
  --pdf-impact-strong: ${tokens.impactStrong};
  --pdf-impact-muted: ${tokens.impactMuted};
`;
}

export function buildBudgetPdfThemeCss(tableStyle: BudgetTableStyleId) {
  const blocks = (Object.entries(BUDGET_PDF_THEMES) as Array<[BudgetTableStyleId, BudgetPdfThemeTokens]>).map(
    ([styleId, tokens]) => `.budget-pdf-snapshot[data-budget-table-style='${styleId}'] {${themeVars(tokens)}}`,
  );

  const active = BUDGET_PDF_THEMES[tableStyle] ?? BUDGET_PDF_THEMES.ledger;
  blocks.push(`.budget-pdf-snapshot {${themeVars(active)}}`);

  return blocks.join('\n');
}
