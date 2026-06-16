import { z } from 'zod';
import type { Request, Response } from 'express';

import { runDiagnosticAgent } from '../agents/diagnostic/diagnostic.agent';
import { buildVoiceInterviewFallbackProfile } from '../agents/diagnostic/diagnostic.fallback';
import { buildInterviewPlan, InterviewBlockId } from '../orquestador/interview.flow';
import {
  buildDeterministicVoiceFinalizeSnapshot,
  buildVoiceInterviewSyntheticBlocks,
  resolveInterviewFinalizeDepth,
} from '../orquestador/interview-voice-finalize';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { INTERVIEW_MIN_EARLY_END_SEC, INTERVIEW_TOTAL_LIMIT_SEC, mergeInterviewVoiceQuotaMonotonic } from '@financial-agent/shared';
import { InterviewBlockEvidence } from '../schemas/profile.schema';
import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import { saveProfile } from '../services/storage.service';
import { appendMemoryTimelineNote } from '../services/memory.service';
import { recordKnowledgeEvent } from '../services/knowledge.service';
import { loadUserMemoryBlob, saveUserMemoryBlob } from '../services/user.service';
import { resolveUserDiagnosticProfile } from '../services/diagnostic-profile.service';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { badRequest, fincoinsDepleted, unauthorized } from '../http/api.errors';
import { asyncHandler } from '../middleware/errorHandler';
import {
  canAffordOperation,
  chargeFincoinOperation,
  ensureFincoinDepletionHandled,
  fincoinUsagePayload,
  getFincoinUsageForUser,
} from '../services/fincoin.service';

const VoiceFinalizeSchema = z.object({
  intake: z.record(z.unknown()),
  minuteSummaries: z
    .array(
      z.object({
        minute: z.number().int().min(1).max(60).optional(),
        summary: z.string().min(3),
        keyFindings: z.array(z.string()).optional(),
        confidence: z.enum(['high', 'medium', 'low']).optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
  finalSummary: z
    .object({
      summary: z.string().min(3),
      keyFindings: z.array(z.string()).optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      createdAt: z.string().optional(),
    })
    .optional(),
  transcript: z.string().optional(),
  endedBy: z.enum(['timeout', 'agent', 'user']).default('user'),
  durationSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).optional(),
  callId: z.string().optional(),
});

const VoiceStateSchema = z.object({
  callsStarted: z.number().min(0).max(25).optional(),
  callId: z.string().min(1).max(120).optional(),
  activeCallId: z.string().min(1).max(120).nullable().optional(),
  status: z.enum(['idle', 'in_progress', 'paused', 'completed']).optional(),
  callSeconds: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).optional(),
  totalUsedSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).optional(),
  maxDurationSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).optional(),
  remainingTotalSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).nullable().optional(),
  minuteSummaries: z
    .array(
      z.object({
        minute: z.number().int().min(1).max(60).optional(),
        summary: z.string().min(3),
        keyFindings: z.array(z.string()).optional(),
        confidence: z.enum(['high', 'medium', 'low']).optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
  finalSummary: z
    .object({
      summary: z.string().min(3),
      keyFindings: z.array(z.string()).optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      createdAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  completedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

type ConversationUser = {
  id: string;
  name?: string;
  injectedProfile?: unknown;
  injectedIntake?: unknown;
  latestDiagnosticProfileId?: string | null;
};

function resolveDiagnosticIntake(
  intake: IntakeQuestionnaire,
  user: ConversationUser,
): IntakeQuestionnaire & Record<string, unknown> {
  const clientSource = intake as IntakeQuestionnaire & Record<string, unknown>;
  const injectedIntake =
    user.injectedIntake && typeof user.injectedIntake === 'object'
      ? (user.injectedIntake as Record<string, unknown>)
      : null;
  const serverQuestionnaire =
    injectedIntake?.intake && typeof injectedIntake.intake === 'object'
      ? (injectedIntake.intake as IntakeQuestionnaire & Record<string, unknown>)
      : null;
  const productsContext =
    injectedIntake?.productsContext && typeof injectedIntake.productsContext === 'object'
      ? (injectedIntake.productsContext as Record<string, unknown>)
      : null;
  const budgetContext =
    injectedIntake?.budgetContext && typeof injectedIntake.budgetContext === 'object'
      ? (injectedIntake.budgetContext as Record<string, unknown>)
      : null;

  const mergedQuestionnaire = serverQuestionnaire
    ? { ...clientSource, ...serverQuestionnaire }
    : clientSource;

  return {
    ...mergedQuestionnaire,
    __productsContext:
      productsContext ??
      (clientSource.__productsContext as Record<string, unknown> | null | undefined) ??
      null,
    __budgetContext:
      budgetContext ?? (clientSource.__budgetContext as Record<string, unknown> | null | undefined) ?? null,
  } as IntakeQuestionnaire & Record<string, unknown>;
}

function normalizeMinuteSummaries(source: unknown) {
  if (!Array.isArray(source)) return [];
  return source.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      minute: typeof row.minute === 'number' ? row.minute : index + 1,
      summary: String(row.summary ?? '').trim(),
      key_findings: Array.isArray(row.keyFindings)
        ? row.keyFindings.map((finding) => String(finding))
        : Array.isArray(row.key_findings)
          ? row.key_findings.map((finding) => String(finding))
          : [],
      confidence:
        row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
          ? row.confidence
          : 'medium',
    };
  });
}

function buildFinalizeSuccessPayload(params: {
  diagnosticProfile: FinancialDiagnosticProfile;
  interviewVoice: Record<string, unknown>;
  executiveReport: string;
  keyFindings: string[];
  hasEnoughInformation: boolean;
  stopReason: string;
  confidence: 'high' | 'medium' | 'low';
  diagnosticFallbackUsed: boolean;
  finalSummaryText: string;
  idempotent?: boolean;
}) {
  const minuteSummaries = normalizeMinuteSummaries(params.interviewVoice.minuteSummaries);
  const finalSummary =
    typeof params.interviewVoice.finalSummary === 'object' && params.interviewVoice.finalSummary
      ? (params.interviewVoice.finalSummary as Record<string, unknown>)
      : null;
  const totalUsedSec = Math.max(0, Number(params.interviewVoice.totalUsedSec ?? 0));
  const remainingTotalSec = Math.max(0, Number(params.interviewVoice.remainingTotalSec ?? 0));
  const maxDurationSec = Math.max(
    0,
    Number(params.interviewVoice.maxDurationSec ?? INTERVIEW_TOTAL_LIMIT_SEC),
  );

  return {
    type: 'interview_complete' as const,
    profile: params.diagnosticProfile,
    idempotent: params.idempotent === true,
    voice_summary: {
      final_summary:
        params.finalSummaryText ||
        (typeof finalSummary?.summary === 'string' ? finalSummary.summary : params.executiveReport),
      minute_summaries: minuteSummaries,
      executive_report: params.executiveReport,
      key_findings: params.keyFindings,
      has_enough_information: params.hasEnoughInformation,
      stop_reason: params.stopReason,
      confidence: params.confidence,
      diagnostic_fallback_used: params.diagnosticFallbackUsed,
      coverage_tier:
        typeof params.interviewVoice.coverageTier === 'string'
          ? params.interviewVoice.coverageTier
          : undefined,
    },
    interview_voice: {
      total_used_sec: totalUsedSec,
      remaining_total_sec: remainingTotalSec,
      max_duration_sec: maxDurationSec,
      minute_summaries: minuteSummaries,
      final_summary:
        params.finalSummaryText ||
        (typeof finalSummary?.summary === 'string' ? finalSummary.summary : params.executiveReport),
    },
  };
}

function shouldReturnIdempotentFinalize(
  interviewVoice: Record<string, unknown>,
  incomingCallId: string | null,
) {
  const lastReport =
    interviewVoice.lastReport && typeof interviewVoice.lastReport === 'object'
      ? (interviewVoice.lastReport as Record<string, unknown>)
      : null;
  const lastFinalizedCallId =
    typeof interviewVoice.lastFinalizedCallId === 'string' && interviewVoice.lastFinalizedCallId.length > 0
      ? interviewVoice.lastFinalizedCallId
      : null;

  return Boolean(
    interviewVoice.status === 'completed' &&
      interviewVoice.lastFinalizedAt &&
      lastReport &&
      typeof lastReport.executive_report === 'string' &&
      (!incomingCallId || !lastFinalizedCallId || incomingCallId === lastFinalizedCallId),
  );
}

export const saveInterviewVoiceState = asyncHandler(async function saveInterviewVoiceState(req: Request, res: Response) {
  const user = req.authenticatedUser;
  if (!user) throw unauthorized('No authenticated user');
  const parsed = parseBody(VoiceStateSchema, req.body);

  const memoryBlob = (await loadUserMemoryBlob(user.id)) ?? {};
  const interviewVoice =
    memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
      ? (memoryBlob.interviewVoice as Record<string, unknown>)
      : {};

  const mergedQuota = mergeInterviewVoiceQuotaMonotonic(interviewVoice, parsed);

  const merged: Record<string, unknown> = {
    ...interviewVoice,
    ...parsed,
    callSeconds: mergedQuota.callSeconds,
    totalUsedSec: mergedQuota.totalUsedSec,
    remainingTotalSec: mergedQuota.remainingTotalSec,
    maxDurationSec: mergedQuota.maxDurationSec,
    callsStarted: mergedQuota.callsStarted,
    activeCallId:
      parsed.activeCallId === null
        ? null
        : typeof parsed.activeCallId === 'string'
          ? parsed.activeCallId
          : typeof parsed.callId === 'string'
            ? parsed.callId
            : (interviewVoice.activeCallId ?? null),
    updatedAt: new Date().toISOString(),
  };

  await saveUserMemoryBlob(user.id, {
    ...memoryBlob,
    interviewVoice: merged,
  });

  req.logger?.debug({
    msg: 'interview.voice.state.saved',
    userId: user.id,
    callId: typeof merged.callId === 'string' ? merged.callId : null,
    activeCallId: typeof merged.activeCallId === 'string' ? merged.activeCallId : merged.activeCallId ?? null,
    status: typeof merged.status === 'string' ? merged.status : null,
    callSeconds: typeof merged.callSeconds === 'number' ? merged.callSeconds : null,
    remainingTotalSec: typeof merged.remainingTotalSec === 'number' ? merged.remainingTotalSec : null,
    minuteSummaries: Array.isArray(merged.minuteSummaries) ? merged.minuteSummaries.length : null,
  });

  return sendSuccess(res, { saved: true, interview_voice: merged });
});

export const finalizeInterviewVoice = asyncHandler(async function finalizeInterviewVoice(req: Request, res: Response) {
  const user = req.authenticatedUser;
  if (!user) throw unauthorized('No authenticated user');
  const parsed = parseBody(VoiceFinalizeSchema, req.body);
  const incomingCallId =
    typeof parsed.callId === 'string' && parsed.callId.trim().length > 0 ? parsed.callId.trim() : null;

  const memoryBlob = (await loadUserMemoryBlob(user.id)) ?? {};
  const interviewVoice =
    memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
      ? (memoryBlob.interviewVoice as Record<string, unknown>)
      : {};

  if (shouldReturnIdempotentFinalize(interviewVoice, incomingCallId)) {
    const diagnosticProfile = await resolveUserDiagnosticProfile(user);
    const lastReport = interviewVoice.lastReport as Record<string, unknown>;
    const executiveReport = String(lastReport.executive_report ?? '').trim();
    const keyFindings = Array.isArray(lastReport.key_findings)
      ? lastReport.key_findings.map((item) => String(item)).filter(Boolean)
      : [];

    if (diagnosticProfile && executiveReport) {
      req.logger?.info({
        msg: 'interview.voice.finalize.idempotent',
        userId: user.id,
        callId: incomingCallId,
      });

      return sendSuccess(
        res,
        buildFinalizeSuccessPayload({
          diagnosticProfile,
          interviewVoice,
          executiveReport,
          keyFindings,
          hasEnoughInformation: true,
          stopReason:
            (typeof lastReport.ended_by === 'string' ? lastReport.ended_by : parsed.endedBy) ??
            'completed',
          confidence: 'high',
          diagnosticFallbackUsed: false,
          finalSummaryText:
            typeof interviewVoice.finalSummary === 'object' &&
            interviewVoice.finalSummary &&
            typeof (interviewVoice.finalSummary as Record<string, unknown>).summary === 'string'
              ? String((interviewVoice.finalSummary as Record<string, unknown>).summary)
              : executiveReport,
          idempotent: true,
        }),
      );
    }
  }

  const intake = parsed.intake as unknown as IntakeQuestionnaire;
  const diagnosticIntake = resolveDiagnosticIntake(intake, user);
  const minuteSummaries = Array.isArray(parsed.minuteSummaries) ? parsed.minuteSummaries : [];
  const finalSummary = parsed.finalSummary ?? null;
  const interviewChatId = `interview:${user.id}`;
  const condensedSummaries = minuteSummaries
    .map((item, index) => {
      const minuteLabel = typeof item.minute === 'number' ? `minuto ${item.minute}` : `minuto ${index + 1}`;
      const findings =
        Array.isArray(item.keyFindings) && item.keyFindings.length > 0
          ? ` | hallazgos: ${item.keyFindings.join(' ; ')}`
          : '';
      const confidence = item.confidence ? ` | confianza: ${item.confidence}` : '';
      return `- ${minuteLabel}: ${item.summary}${findings}${confidence}`;
    })
    .join('\n');
  const finalSummaryText = finalSummary?.summary?.trim() ?? '';

  const fincoinBeforeFinalize = getFincoinUsageForUser(user);
  if (
    fincoinBeforeFinalize.depleted ||
    !canAffordOperation(fincoinBeforeFinalize, 'conversation.voice')
  ) {
    const summaries = await ensureFincoinDepletionHandled(user.id);
    throw fincoinsDepleted(
      'Tus Fincoins se agotaron. No se puede finalizar la entrevista con síntesis LLM.',
      {
        usage: fincoinUsagePayload(fincoinBeforeFinalize),
        closure_summaries: summaries,
      },
    );
  }

  const previousTotalUsedSec = Math.max(0, Number(interviewVoice.totalUsedSec ?? 0));
  const persistedCallSeconds = Math.max(0, Number(interviewVoice.callSeconds ?? 0));
  const requestedDurationSec = Number(parsed.durationSec ?? 0);
  const safeDurationSec = Math.max(
    0,
    Math.min(
      INTERVIEW_TOTAL_LIMIT_SEC,
      requestedDurationSec > 0
        ? requestedDurationSec
        : persistedCallSeconds > 0
          ? persistedCallSeconds
          : previousTotalUsedSec,
    ),
  );
  if (parsed.endedBy === 'user' && safeDurationSec < INTERVIEW_MIN_EARLY_END_SEC) {
    throw badRequest(
      `La entrevista requiere al menos ${INTERVIEW_MIN_EARLY_END_SEC} segundos activos antes de un cierre anticipado.`,
    );
  }
  const finalizeDepth = resolveInterviewFinalizeDepth({
    endedBy: parsed.endedBy ?? 'user',
    durationSec: safeDurationSec,
    minuteSummariesCount: minuteSummaries.length,
    hasFinalSummary: Boolean(finalSummaryText),
  });
  const transcriptSnippet =
    typeof parsed.transcript === 'string' && parsed.transcript.trim().length > 0
      ? parsed.transcript.trim().slice(0, 1200)
      : undefined;

  const finalizeCharge = await chargeFincoinOperation(user.id, 'conversation.voice');
  if (!finalizeCharge.charged) {
    const summaries =
      finalizeCharge.closureSummaries ?? (await ensureFincoinDepletionHandled(user.id));
    throw fincoinsDepleted(
      'Tus Fincoins se agotaron. No se puede finalizar la entrevista con síntesis LLM.',
      {
        usage: fincoinUsagePayload(finalizeCharge.usage),
        closure_summaries: summaries,
      },
    );
  }

  let parsedReport: {
    executiveReport: string;
    keyFindings: string[];
    hasEnoughInformation: boolean;
    confidence: 'high' | 'medium' | 'low';
  } | null = null;
  try {
    parsedReport = buildDeterministicVoiceFinalizeSnapshot({
      minuteSummaries,
      finalSummaryText,
      transcriptSnippet,
      finalizeDepth,
      endedBy: parsed.endedBy ?? 'user',
    });
  } catch {
    parsedReport = null;
  }

  const executiveReport =
    parsedReport?.executiveReport?.trim() ||
    (finalizeDepth.tier === 'minimal'
      ? 'Entrevista finalizada de forma anticipada. El diagnóstico quedó preliminar con la evidencia disponible hasta ese momento.'
      : 'Entrevista finalizada. Se obtuvo un diagnóstico proporcional al avance de la llamada.');
  const keyFindings = parsedReport?.keyFindings ?? [];
  let hasEnoughInformation = Boolean(
    parsedReport?.hasEnoughInformation ?? finalizeDepth.defaultHasEnoughInformation,
  );
  if (!finalizeDepth.defaultHasEnoughInformation && parsed.endedBy === 'user') {
    hasEnoughInformation = false;
  }
  const resolvedConfidence = parsedReport?.confidence ?? finalizeDepth.confidenceCeiling;

  const plan = buildInterviewPlan(diagnosticIntake);
  const syntheticBlocks = buildVoiceInterviewSyntheticBlocks({
    blockIds: plan.blocksToExplore.slice(0, finalizeDepth.maxBlocks),
    depth: finalizeDepth,
    executiveReport,
    keyFindings,
    confidence: resolvedConfidence,
  }) as Partial<Record<InterviewBlockId, InterviewBlockEvidence>>;

  let diagnosticProfile: FinancialDiagnosticProfile;
  let diagnosticFallbackUsed = false;
  try {
    diagnosticProfile = await runDiagnosticAgent({
      intake: diagnosticIntake,
      blocks: syntheticBlocks,
    });
  } catch (error) {
    diagnosticFallbackUsed = true;
    req.logger?.warn({
      msg: 'interview.voice.finalize.diagnostic_fallback',
      userId: user.id,
      callId: incomingCallId,
      error,
    });
    diagnosticProfile = buildVoiceInterviewFallbackProfile({
      intake: diagnosticIntake,
      blocks: syntheticBlocks,
      executiveReport,
      keyFindings,
      endedBy: parsed.endedBy ?? 'timeout',
    });
  }
  const { profileId } = await saveProfile(user.id, diagnosticProfile);
  await recordKnowledgeEvent(user.id, 'completed_profile', 'Voice diagnostic interview completed', {
    source: 'interview_voice_finalize',
    profile_id: profileId,
  });

  const persistedActiveCallId =
    typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
      ? interviewVoice.activeCallId
      : null;
  if (persistedActiveCallId && incomingCallId && incomingCallId !== persistedActiveCallId) {
    req.logger?.warn({
      msg: 'interview.voice.finalize.call_id_mismatch',
      userId: user.id,
      parsedCallId: incomingCallId,
      persistedActiveCallId,
    });
  }
  const persistedMaxDurationSec = Math.max(0, Number(interviewVoice.maxDurationSec ?? 0));
  const resolvedMaxDurationSec =
    persistedMaxDurationSec > 0 ? Math.min(INTERVIEW_TOTAL_LIMIT_SEC, persistedMaxDurationSec) : INTERVIEW_TOTAL_LIMIT_SEC;
  if (requestedDurationSec <= 0 && persistedCallSeconds > 0) {
    req.logger?.info({
      msg: 'interview.voice.finalize.duration_fallback_to_persisted',
      userId: user.id,
      persistedCallSeconds,
      parsedDurationSec: requestedDurationSec,
    });
  }
  const updatedTotalUsedSec = Math.min(
    INTERVIEW_TOTAL_LIMIT_SEC,
    Math.max(previousTotalUsedSec, safeDurationSec, persistedCallSeconds),
  );
  const remainingTotalSec = Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - updatedTotalUsedSec);
  const resolvedFinalizedCallId = incomingCallId ?? persistedActiveCallId ?? null;
  const mergedInterviewVoice: Record<string, unknown> = {
    ...interviewVoice,
    status: 'completed',
    activeCallId: null,
    totalUsedSec: updatedTotalUsedSec,
    callSeconds: updatedTotalUsedSec,
    maxDurationSec: resolvedMaxDurationSec,
    remainingTotalSec,
    coverageTier: finalizeDepth.tier,
    endedBy: parsed.endedBy ?? 'user',
    lastFinalizedAt: new Date().toISOString(),
    lastFinalizedCallId: resolvedFinalizedCallId,
    minuteSummaries: minuteSummaries.map((item, index) => ({
      minute: typeof item.minute === 'number' ? item.minute : index + 1,
      summary: item.summary,
      keyFindings: item.keyFindings ?? [],
      confidence: item.confidence ?? 'medium',
      createdAt: item.createdAt ?? new Date().toISOString(),
    })),
    finalSummary: {
      summary: finalSummaryText || executiveReport,
      keyFindings: finalSummary?.keyFindings ?? keyFindings,
      confidence:
        finalSummary?.confidence ??
        (parsedReport?.confidence === 'high' ||
        parsedReport?.confidence === 'medium' ||
        parsedReport?.confidence === 'low'
          ? parsedReport.confidence
          : 'high'),
      createdAt: finalSummary?.createdAt ?? new Date().toISOString(),
    },
    lastReport: {
      executive_report: executiveReport,
      key_findings: keyFindings,
      ended_by: parsed.endedBy,
      duration_sec: safeDurationSec || null,
    },
  };

  await saveUserMemoryBlob(user.id, {
    ...memoryBlob,
    interviewVoice: mergedInterviewVoice,
  });

  await appendMemoryTimelineNote({
    userId: user.id,
    chatId: interviewChatId,
    userMessage: finalSummaryText || condensedSummaries.slice(0, 500) || 'Síntesis de llamada',
    agentMessage: executiveReport,
    mode: 'diagnostic_interview',
    summary: 'Llamada de entrevista finalizada con síntesis ejecutiva y hallazgos.',
    facts: keyFindings.map((finding: string) => ({
      type: 'decision' as const,
      key: 'interview_finding',
      value: finding,
      confidence: 0.82,
    })),
  });

  req.logger?.info({
    msg: 'interview.voice.finalize.completed',
    userId: user.id,
    callId: resolvedFinalizedCallId,
    endedBy: parsed.endedBy,
    minuteSummaries: minuteSummaries.length,
    durationSec: safeDurationSec,
    totalUsedSec: updatedTotalUsedSec,
    remainingTotalSec,
    diagnosticFallbackUsed,
  });

  return sendSuccess(
    res,
    buildFinalizeSuccessPayload({
      diagnosticProfile,
      interviewVoice: mergedInterviewVoice,
      executiveReport,
      keyFindings,
      hasEnoughInformation,
      stopReason: parsed.endedBy ?? 'user',
      confidence: diagnosticFallbackUsed ? 'medium' : resolvedConfidence,
      diagnosticFallbackUsed,
      finalSummaryText,
    }),
  );
});
