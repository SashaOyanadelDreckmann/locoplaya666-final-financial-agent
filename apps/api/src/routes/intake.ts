import { Request, Response } from 'express';
import { z } from 'zod';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { analyzeIntake } from '../agents/intake/intake-analyzer';
import { buildIntakeContext } from '../services/intake-context.service';
import { attachIntakeToUser } from '../services/user.service';
import { getUserById } from '../persistencia/repos';
import { synchronizeKnowledgeFromIntake, recordKnowledgeEvent } from '../services/knowledge.service';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { badRequest, unauthorized } from '../http/api.errors';

// SECURITY: Strict validation schema - no passthrough() to prevent arbitrary field injection
const FinancialKnowledgeChecklistSchema = z.object({
  interest: z.boolean(),
  CAE: z.boolean(),
  inflation: z.boolean(),
  creditCard: z.boolean(),
  creditLine: z.boolean(),
  loanComponents: z.boolean(),
  interestRate: z.boolean(),
  liquidity: z.boolean(),
  returnConcept: z.boolean(),
  diversification: z.boolean(),
  assetVsLiability: z.boolean(),
  financialRisk: z.boolean(),
  capitalMarkets: z.boolean(),
  alternativeInvestments: z.boolean(),
  fintech: z.boolean(),
});

const IntakeRequestSchema = z.object({
  age: z.number().optional(),
  city: z.string().trim().min(1).max(120).optional(),
  employmentStatus: z.enum([
    'employed',
    'freelance',
    'unemployed',
    'student',
    'employed_student',
    'freelance_student',
    'employed_freelance',
    'employed_freelance_student',
  ]),
  profession: z.string().optional(),
  incomeBand: z.enum([
    'no_income',
    '<300k',
    '300k-600k',
    '600k-1M',
    '1M-2M',
    '2M-4M',
    '>4M',
    'variable',
  ]),
  exactMonthlyIncome: z.number().min(0, 'Income cannot be negative').optional(),
  expensesCoverage: z.enum(['surplus', 'tight', 'sometimes', 'no']),
  tracksExpenses: z.enum(['yes', 'sometimes', 'no']),
  hasSavingsOrInvestments: z.boolean(),
  savingsBand: z
    .enum(['none', '<300k', '300k-1M', '1M-3M', '3M-10M', '>10M'])
    .optional(),
  exactSavingsAmount: z.number().min(0, 'Savings amount cannot be negative').optional(),
  hasDebt: z.boolean(),
  financialKnowledge: FinancialKnowledgeChecklistSchema,
  riskReaction: z.enum(['sell', 'hold', 'buy_more', 'never_invest', 'other']),
  riskReactionOther: z.string().optional(),
  selfRatedUnderstanding: z.number().min(0).max(10),
  moneyStressLevel: z.number().min(0).max(10),
});

export async function submitIntake(req: Request, res: Response) {
  const intake = parseBody(IntakeRequestSchema, req.body) as IntakeQuestionnaire;

  // Análisis determinista
  const signals = analyzeIntake(intake);
  const intakeContext = buildIntakeContext(intake);

  // Análisis LLM (opcional)
  let llmSummary: unknown = null;
  try {
    const { analyzeIntakeWithLLM } = await import('../agents/intake/intake-llm');
    llmSummary = await analyzeIntakeWithLLM(intake);
  } catch (err) {
    req.logger?.warn({ msg: 'LLM intake analysis failed', error: err });
  }

  const user = req.authenticatedUser;
  if (!user?.id) {
    throw unauthorized('Not authenticated');
  }

  const existing = await getUserById(user.id);
  const wasUpdated = Boolean(existing?.injectedIntake);

  const attached = await attachIntakeToUser(
    user.id,
    { intake, llmSummary, intakeContext },
    { replace: true },
  );
  if (!attached) {
    throw badRequest('Failed to persist intake');
  }

  await synchronizeKnowledgeFromIntake(user.id, intake);
  await recordKnowledgeEvent(
    user.id,
    wasUpdated ? 'updated_intake' : 'completed_intake',
    wasUpdated
      ? 'User updated their financial intake questionnaire'
      : 'User completed financial intake questionnaire',
    { source: 'intake_submit' },
  );

  return sendSuccess(res, {
    intake,
    signals,
    intakeContext,
    readyForInterview: true,
    llmSummary,
    wasUpdated,
  });
}
