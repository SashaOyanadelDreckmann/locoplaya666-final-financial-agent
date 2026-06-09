import { z } from 'zod';
import type { FinancialDiagnosticProfile } from './profile.schema';

export const UserRoleSchema = z.enum(['USER', 'ANALYST', 'ADMIN']);
export const ApprovalStatusSchema = z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);

export const KnowledgeEventSchema = z.object({
  timestamp: z.string(),
  action: z.string(),
  points: z.number(),
  rationale: z.string(),
  context: z.record(z.unknown()).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  passwordHash: z.string(),
  role: UserRoleSchema.default('USER'),
  approvalStatus: ApprovalStatusSchema.default('APPROVED'),
  approvedAt: z.string().optional(),
  approvedByEmail: z.string().email().optional(),
  injectedProfile: z.unknown().optional(),
  injectedIntake: z
    .object({
      intake: z.unknown(),
      llmSummary: z.unknown().optional(),
      intakeContext: z.unknown().optional(),
    })
    .optional(),
  latestDiagnosticProfileId: z.string().optional(),
  latestDiagnosticCompletedAt: z.string().optional(),
  panelState: z.unknown().optional(),
  sheets: z.array(z.unknown()).optional(),
  knowledgeBaseScore: z.number().min(0).max(100).default(0),
  knowledgeScore: z.number().min(0).max(100).default(0),
  knowledgeHistory: z.array(KnowledgeEventSchema).default([]),
  knowledgeLastUpdated: z.string().default(new Date().toISOString()),
  updatedAt: z.string(),
  memoryBlob: z.record(z.unknown()).optional(),
  usdSpentTotal: z.number().min(0).default(0),
  fincoinDepletedAt: z.string().optional(),
  fincoinDepletionHandled: z.boolean().default(false),
});

export type User = z.infer<typeof UserSchema> & {
  injectedProfile?: FinancialDiagnosticProfile;
};
