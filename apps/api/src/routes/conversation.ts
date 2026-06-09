import { z } from 'zod';
import type { Request, Response } from 'express';

import { InterviewerAgent } from '../agents/interviewer.agent';
import { runDiagnosticAgent } from '../agents/diagnostic/diagnostic.agent';
import { buildVoiceInterviewFallbackProfile } from '../agents/diagnostic/diagnostic.fallback';
import {
  buildInterviewPlan,
  InterviewBlockId,
} from '../orchestrator/interview.flow';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';
import { InterviewBlockEvidence } from '../schemas/profile.schema';
import { saveProfile } from '../services/storage.service';
import { appendMemoryTimelineNote } from '../services/memory.service';
import { recordKnowledgeEvent } from '../services/knowledge.service';
import { completeStructured } from '../services/llm.service';
import { loadUserMemoryBlob, saveUserMemoryBlob } from '../services/user.service';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { unauthorized, badRequest } from '../http/api.errors';
import { asyncHandler } from '../middleware/errorHandler';

const agent = new InterviewerAgent();

const ConversationBodySchema = z.object({
  intake: z.record(z.unknown()),
  answersInCurrentBlock: z.array(z.string()).optional(),
  completedBlocks: z.union([z.record(z.unknown()), z.array(z.string())]).optional(),
  summaryValidation: z
    .object({
      accepted: z.boolean(),
      comment: z.string().optional(),
    })
    .optional(),
  blockId: z.string().optional(),
});

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
  maxDurationSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).optional(),
  remainingTotalSec: z.number().min(0).max(INTERVIEW_TOTAL_LIMIT_SEC).nullable().optional(),
  pauseUsed: z.boolean().optional(),
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

export type ConversationNextBody = {
  intake: IntakeQuestionnaire;
  answersInCurrentBlock?: string[];
  completedBlocks?: Partial<Record<InterviewBlockId, InterviewBlockEvidence>> | string[];
  summaryValidation?: {
    accepted: boolean;
    comment?: string;
  };
  blockId?: InterviewBlockId;
};

type ConversationUser = {
  id: string;
  name?: string;
  injectedProfile?: unknown;
  injectedIntake?: unknown;
};

function resolveDiagnosticIntake(
  intake: IntakeQuestionnaire,
  user: ConversationUser,
): IntakeQuestionnaire & Record<string, unknown> {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const injectedIntake =
    user.injectedIntake && typeof user.injectedIntake === 'object'
      ? (user.injectedIntake as Record<string, unknown>)
      : null;
  const productsContext =
    injectedIntake?.productsContext && typeof injectedIntake.productsContext === 'object'
      ? (injectedIntake.productsContext as Record<string, unknown>)
      : null;
  const budgetContext =
    injectedIntake?.budgetContext && typeof injectedIntake.budgetContext === 'object'
      ? (injectedIntake.budgetContext as Record<string, unknown>)
      : null;

  return {
    ...source,
    __productsContext:
      (source.__productsContext as Record<string, unknown> | null | undefined) ?? productsContext ?? null,
    __budgetContext: (source.__budgetContext as Record<string, unknown> | null | undefined) ?? budgetContext ?? null,
  } as IntakeQuestionnaire & Record<string, unknown>;
}

export async function conversationNextCore(
  body: ConversationNextBody,
  user: ConversationUser,
) {
  const {
    intake,
    answersInCurrentBlock = [],
    completedBlocks = {},
    summaryValidation,
    blockId: explicitBlockId,
  } = body;
  const diagnosticIntake = resolveDiagnosticIntake(intake, user);

  if (!intake) {
    throw badRequest('Missing intake');
  }

  const normalizedCompletedBlocks = Array.isArray(completedBlocks)
    ? Object.fromEntries(
        completedBlocks.map((blockId) => [
          blockId,
          {
            blockId,
            summary: '',
            signalsDetected: [],
            confidence: 'medium' as const,
            userValidated: false,
          },
        ])
      )
    : completedBlocks;

  const plan = buildInterviewPlan(diagnosticIntake);
  const completedBlockIds = Object.keys(normalizedCompletedBlocks) as InterviewBlockId[];

  const currentBlockId =
    explicitBlockId ??
    plan.blocksToExplore.find((b) => !completedBlockIds.includes(b)) ??
    null;

  const interviewChatId = `interview:${user.id}`;
  const joinedAnswers = answersInCurrentBlock.join(' | ');

  if (!currentBlockId) {
    const diagnosticProfile = await runDiagnosticAgent({
      intake: diagnosticIntake,
      blocks: normalizedCompletedBlocks,
    });

    const { profileId } = await saveProfile(user.id, diagnosticProfile);
    await recordKnowledgeEvent(
      user.id,
      'completed_profile',
      'Financial diagnostic profile completed',
      { source: 'interview_complete', profile_id: profileId },
    );

    appendMemoryTimelineNote({
      userId: user.id,
      chatId: interviewChatId,
      userMessage: joinedAnswers || 'Entrevista financiera completada',
      agentMessage: diagnosticProfile.diagnosticNarrative,
      mode: 'diagnostic_interview',
      summary: 'Entrevista completada y perfil diagnóstico persistido.',
      facts: [
        {
          type: 'decision',
          key: 'diagnostic_profile',
          value: diagnosticProfile.diagnosticNarrative,
          confidence: 0.95,
        },
        {
          type: 'risk_profile',
          key: 'time_horizon',
          value: diagnosticProfile.profile.timeHorizon,
          confidence: 0.85,
        },
      ],
    });

    return {
      type: 'interview_complete',
      profile: diagnosticProfile,
    };
  }

  if (currentBlockId === 'warmup' && answersInCurrentBlock.length >= 1) {
    appendMemoryTimelineNote({
      userId: user.id,
      chatId: interviewChatId,
      userMessage: joinedAnswers || 'Warmup de entrevista',
      agentMessage: 'Warmup completado',
      mode: 'diagnostic_interview',
      summary: 'Warmup de entrevista financiera completado.',
    });

    return {
      type: 'block_completed',
      blockId: 'warmup',
      completedBlocks: {
        ...normalizedCompletedBlocks,
        warmup: {
          blockId: 'warmup',
          summary: 'Warmup completado',
          signalsDetected: [],
          confidence: 'high',
          userValidated: true,
        },
      },
    };
  }

  if (summaryValidation && currentBlockId !== 'warmup') {
    if (!summaryValidation.accepted) {
      const revisionAnswers = summaryValidation.comment?.trim()
        ? [...answersInCurrentBlock, `Aclaración del usuario: ${summaryValidation.comment.trim()}`]
        : answersInCurrentBlock;
      const revisionQuestion = await agent.generateNextQuestion({
        blockId: currentBlockId,
        intake,
        answersInCurrentBlock: revisionAnswers,
        user: user as any,
      });

      appendMemoryTimelineNote({
        userId: user.id,
        chatId: interviewChatId,
        userMessage: summaryValidation.comment ?? 'Solicitud de revisión de bloque',
        agentMessage: revisionQuestion || `Bloque ${currentBlockId} marcado para revisión`,
        mode: 'diagnostic_interview',
        summary: `Usuario pidió revisar el bloque ${currentBlockId}.`,
      });

      return {
        type: 'question',
        blockId: currentBlockId,
        question:
          revisionQuestion ||
          'Necesito una aclaración puntual antes de cerrar este bloque. Cuéntame el matiz más importante que faltó.',
        questionIndex: answersInCurrentBlock.length,
        revisionRequested: true,
        userComment: summaryValidation.comment ?? '',
      };
    }

    const prev = normalizedCompletedBlocks[currentBlockId];

    appendMemoryTimelineNote({
      userId: user.id,
      chatId: interviewChatId,
      userMessage: joinedAnswers || `Validación del bloque ${currentBlockId}`,
      agentMessage: `Bloque ${currentBlockId} validado`,
      mode: 'diagnostic_interview',
      summary: `Bloque ${currentBlockId} validado por el usuario.`,
    });

    return {
      type: 'block_completed',
      blockId: currentBlockId,
      completedBlocks: {
        ...normalizedCompletedBlocks,
        [currentBlockId]: {
          blockId: currentBlockId,
          summary: prev?.summary ?? '',
          signalsDetected: prev?.signalsDetected ?? [],
          confidence: prev?.confidence ?? 'medium',
          userValidated: true,
        },
      },
    };
  }

  const nextQuestion = await agent.generateNextQuestion({
    blockId: currentBlockId,
    intake,
    answersInCurrentBlock,
    user: user as any,
  });

  if (nextQuestion) {
    appendMemoryTimelineNote({
      userId: user.id,
      chatId: interviewChatId,
      userMessage: joinedAnswers || `Continuar bloque ${currentBlockId}`,
      agentMessage: nextQuestion,
      mode: 'diagnostic_interview',
      summary: `Nueva pregunta generada para el bloque ${currentBlockId}.`,
    });

    return {
      type: 'question',
      blockId: currentBlockId,
      question: nextQuestion,
      questionIndex: answersInCurrentBlock.length,
    };
  }

  const summary = await agent.summarizeBlock(currentBlockId, answersInCurrentBlock, user as any);

  appendMemoryTimelineNote({
    userId: user.id,
    chatId: interviewChatId,
    userMessage: joinedAnswers || `Resumen bloque ${currentBlockId}`,
    agentMessage: summary,
    mode: 'diagnostic_interview',
    summary: `Resumen generado para el bloque ${currentBlockId}.`,
  });

  return {
    type: 'block_summary',
    blockId: currentBlockId,
    summary,
    requiresValidation: true,
  };
}

export default asyncHandler(async function conversationNext(req: Request, res: Response) {
  const parsed = parseBody(ConversationBodySchema, req.body) as unknown as ConversationNextBody;

  const user = req.authenticatedUser;
  if (!user) {
    throw unauthorized('No authenticated user');
  }

  const response = await conversationNextCore(parsed, {
    id: user.id,
    name: user.name,
    injectedProfile: user.injectedProfile,
    injectedIntake: user.injectedIntake,
  });

  return sendSuccess(res, response);
});

export const saveInterviewVoiceState = asyncHandler(async function saveInterviewVoiceState(req: Request, res: Response) {
  const user = req.authenticatedUser;
  if (!user) throw unauthorized('No authenticated user');
  const parsed = parseBody(VoiceStateSchema, req.body);

  const memoryBlob = (await loadUserMemoryBlob(user.id)) ?? {};
  const interviewVoice =
    memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
      ? (memoryBlob.interviewVoice as Record<string, unknown>)
      : {};

  const persistedCallSeconds = Math.max(
    0,
    Number(interviewVoice.callSeconds ?? 0),
    Number(parsed.callSeconds ?? 0),
  );
  const totalUsedSec = Math.min(INTERVIEW_TOTAL_LIMIT_SEC, persistedCallSeconds);
  const remainingTotalSec = Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - totalUsedSec);

  const merged: Record<string, unknown> = {
    ...interviewVoice,
    ...parsed,
    callSeconds: persistedCallSeconds,
    totalUsedSec,
    remainingTotalSec,
    maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
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

  const intake = parsed.intake as unknown as IntakeQuestionnaire;
  const diagnosticIntake = resolveDiagnosticIntake(intake, user);
  const minuteSummaries = Array.isArray(parsed.minuteSummaries) ? parsed.minuteSummaries : [];
  const finalSummary = parsed.finalSummary ?? null;
  const interviewChatId = `interview:${user.id}`;
  const condensedSummaries = minuteSummaries
    .map((item, index) => {
      const minuteLabel = typeof item.minute === 'number' ? `minuto ${item.minute}` : `minuto ${index + 1}`;
      const findings = Array.isArray(item.keyFindings) && item.keyFindings.length > 0 ? ` | hallazgos: ${item.keyFindings.join(' ; ')}` : '';
      const confidence = item.confidence ? ` | confianza: ${item.confidence}` : '';
      return `- ${minuteLabel}: ${item.summary}${findings}${confidence}`;
    })
    .join('\n');
  const finalSummaryText = finalSummary?.summary?.trim() ?? '';

  let parsedReport: any = null;
  try {
    parsedReport = await completeStructured({
      system:
        'Eres una directora de diagnóstico financiero ejecutivo. Sintetizas llamadas en hallazgos claros, honestos y priorizados.',
      user: [
        'Devuelve un JSON con formato:',
        '{"executive_report":"string","key_findings":["string","string","string"],"confidence":"high|medium|low","stop_reason":"string","has_enough_information":true|false}',
        'Reglas:',
        '- español chileno profesional',
        '- enfoque diagnóstico senior, ejecutivo y profundo',
        '- hallazgos concretos y bien priorizados',
        '- integra intake, productos, presupuesto y síntesis de llamada',
        '- detecta tensiones entre discurso, flujo real, productos y capacidad financiera',
        '- sin mencionar sistema ni herramientas',
        `Motivo término llamada: ${parsed.endedBy}`,
        `Duración (segundos): ${parsed.durationSec ?? 0}`,
        `Intake usuario: ${JSON.stringify(diagnosticIntake)}`,
        `Síntesis por minuto:\n${condensedSummaries || 'Sin síntesis por minuto.'}`,
        `Síntesis final de llamada:\n${finalSummaryText || 'Sin síntesis final.'}`,
        ...(typeof parsed.transcript === 'string' && parsed.transcript.trim().length > 0
          ? [`Contexto adicional heredado (no depende de transcript): ${parsed.transcript.trim().slice(0, 1000)}`]
          : []),
      ].join('\n'),
      temperature: 0.2,
      model: process.env.OPENAI_MODEL_INTERVIEW_FINALIZER ?? 'gpt-5-mini',
      maxCompletionTokens: 420,
    });
  } catch {
    parsedReport = null;
  }

  const executiveReport =
    typeof parsedReport?.executive_report === 'string' && parsedReport.executive_report.trim().length > 0
      ? parsedReport.executive_report.trim()
      : 'Entrevista finalizada. Se obtuvo un diagnóstico suficiente para continuar con recomendaciones priorizadas.';
  const keyFindings = Array.isArray(parsedReport?.key_findings)
    ? parsedReport.key_findings
        .map((item: unknown) => String(item ?? '').trim())
        .filter((item: string) => item.length > 0)
        .slice(0, 5)
    : [];
  const hasEnoughInformation = Boolean(parsedReport?.has_enough_information ?? true);

  const plan = buildInterviewPlan(diagnosticIntake);
  const syntheticBlocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>> = Object.fromEntries(
    plan.blocksToExplore.map((blockId) => [
      blockId,
      {
        blockId,
        summary: executiveReport.slice(0, 400),
        signalsDetected: keyFindings,
        confidence: 'high' as const,
        userValidated: true,
      },
    ])
  );

  let diagnosticProfile;
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
      callId: parsed.callId ?? null,
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
  await recordKnowledgeEvent(
    user.id,
    'completed_profile',
    'Voice diagnostic interview completed',
    { source: 'interview_voice_finalize', profile_id: profileId }
  );

  const memoryBlob = (await loadUserMemoryBlob(user.id)) ?? {};
  const interviewVoice =
    memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
      ? (memoryBlob.interviewVoice as Record<string, unknown>)
      : {};
  const persistedActiveCallId =
    typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
      ? interviewVoice.activeCallId
      : null;
  if (persistedActiveCallId && parsed.callId && parsed.callId !== persistedActiveCallId) {
    req.logger?.warn({
      msg: 'interview.voice.finalize.call_id_mismatch',
      userId: user.id,
      parsedCallId: parsed.callId,
      persistedActiveCallId,
    });
  }
  const previousTotalUsedSec = Math.max(0, Number(interviewVoice.totalUsedSec ?? 0));
  const persistedMaxDurationSec = Math.max(0, Number(interviewVoice.maxDurationSec ?? 0));
  const requestedDurationSec = Number(parsed.durationSec ?? 0);
  const persistedCallSeconds = Number(interviewVoice.callSeconds ?? 0);
  const effectiveDurationSec =
    requestedDurationSec > 0
      ? requestedDurationSec
      : persistedCallSeconds > 0
      ? persistedCallSeconds
      : 0;
  const safeDurationSec = Math.max(0, Math.min(INTERVIEW_TOTAL_LIMIT_SEC, effectiveDurationSec));
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
  await saveUserMemoryBlob(user.id, {
    ...memoryBlob,
    interviewVoice: {
      ...interviewVoice,
      status: 'completed',
      activeCallId: null,
      totalUsedSec: updatedTotalUsedSec,
      maxDurationSec: resolvedMaxDurationSec,
      remainingTotalSec: remainingTotalSec,
      lastFinalizedAt: new Date().toISOString(),
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
          (parsedReport?.confidence === 'high' || parsedReport?.confidence === 'medium' || parsedReport?.confidence === 'low'
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
    },
  });

  appendMemoryTimelineNote({
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
    callId: parsed.callId ?? persistedActiveCallId,
    endedBy: parsed.endedBy,
    minuteSummaries: minuteSummaries.length,
    durationSec: safeDurationSec,
    totalUsedSec: updatedTotalUsedSec,
    remainingTotalSec,
    diagnosticFallbackUsed,
  });

  return sendSuccess(res, {
    type: 'interview_complete',
    profile: diagnosticProfile,
    voice_summary: {
      final_summary: finalSummaryText || executiveReport,
      minute_summaries: minuteSummaries.map((item, index) => ({
        minute: typeof item.minute === 'number' ? item.minute : index + 1,
        summary: item.summary,
        key_findings: item.keyFindings ?? [],
        confidence: item.confidence ?? 'medium',
      })),
      executive_report: executiveReport,
      key_findings: keyFindings,
      has_enough_information: hasEnoughInformation,
      stop_reason: typeof parsedReport?.stop_reason === 'string' ? parsedReport.stop_reason : parsed.endedBy,
      confidence:
        parsedReport?.confidence === 'high' || parsedReport?.confidence === 'medium' || parsedReport?.confidence === 'low'
          ? parsedReport.confidence
          : diagnosticFallbackUsed
            ? 'medium'
            : 'high',
      diagnostic_fallback_used: diagnosticFallbackUsed,
    },
    interview_voice: {
      total_used_sec: updatedTotalUsedSec,
      remaining_total_sec: remainingTotalSec,
      max_duration_sec: resolvedMaxDurationSec,
      minute_summaries: minuteSummaries.map((item, index) => ({
        minute: typeof item.minute === 'number' ? item.minute : index + 1,
        summary: item.summary,
        key_findings: item.keyFindings ?? [],
        confidence: item.confidence ?? 'medium',
      })),
      final_summary: finalSummaryText || executiveReport,
    },
  });
});
