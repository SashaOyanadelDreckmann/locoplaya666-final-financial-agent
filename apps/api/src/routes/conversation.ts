import { z } from 'zod';
import type { Request, Response } from 'express';

import { InterviewerAgent } from '../agents/interviewer.agent';
import { runDiagnosticAgent } from '../agents/diagnostic/diagnostic.agent';
import {
  buildInterviewPlan,
  InterviewBlockId,
} from '../orchestrator/interview.flow';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { InterviewBlockEvidence } from '../schemas/profile.schema';
import { saveProfile } from '../services/storage.service';
import { appendMemoryTimelineNote } from '../services/memory.service';
import { recordKnowledgeEvent } from '../services/knowledge.service';
import { complete } from '../services/llm.service';
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
  transcript: z.string().min(10),
  endedBy: z.enum(['timeout', 'agent', 'user']).default('user'),
  durationSec: z.number().min(1).max(180).optional(),
  callId: z.string().optional(),
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
};

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

  const plan = buildInterviewPlan(intake);
  const completedBlockIds = Object.keys(normalizedCompletedBlocks) as InterviewBlockId[];

  const currentBlockId =
    explicitBlockId ??
    plan.blocksToExplore.find((b) => !completedBlockIds.includes(b)) ??
    null;

  const interviewChatId = `interview:${user.id}`;
  const joinedAnswers = answersInCurrentBlock.join(' | ');

  if (!currentBlockId) {
    const diagnosticProfile = await runDiagnosticAgent({
      intake,
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
      appendMemoryTimelineNote({
        userId: user.id,
        chatId: interviewChatId,
        userMessage: summaryValidation.comment ?? 'Solicitud de revisión de bloque',
        agentMessage: `Bloque ${currentBlockId} marcado para revisión`,
        mode: 'diagnostic_interview',
        summary: `Usuario pidió revisar el bloque ${currentBlockId}.`,
      });

      return {
        type: 'block_revision',
        blockId: currentBlockId,
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
  });

  return sendSuccess(res, response);
});

export const finalizeInterviewVoice = asyncHandler(async function finalizeInterviewVoice(req: Request, res: Response) {
  const user = req.authenticatedUser;
  if (!user) throw unauthorized('No authenticated user');
  const parsed = parseBody(VoiceFinalizeSchema, req.body);

  const intake = parsed.intake as unknown as IntakeQuestionnaire;
  const transcript = String(parsed.transcript ?? '').trim();
  const interviewChatId = `interview:${user.id}`;

  const raw = await complete(
    [
      'Devuelve SOLO JSON válido con formato:',
      '{"executive_report":"string","key_findings":["string","string","string"],"confidence":"high|medium|low","stop_reason":"string","has_enough_information":true|false}',
      'Reglas:',
      '- español chileno profesional',
      '- enfoque diagnóstico profundo',
      '- hallazgos accionables y concretos',
      '- sin mencionar sistema ni herramientas',
      `Motivo término llamada: ${parsed.endedBy}`,
      `Duración (segundos): ${parsed.durationSec ?? 0}`,
      `Intake usuario: ${JSON.stringify(intake)}`,
      `Transcripción completa: ${transcript}`,
    ].join('\n'),
    {
      systemPrompt:
        'Eres una directora de diagnóstico financiero ejecutivo. Sintetizas llamadas en hallazgos claros, honestos y priorizados.',
      temperature: 0.25,
    }
  );

  const blockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (blockMatch ? blockMatch[1] : raw).trim();
  let parsedReport: any = null;
  try {
    parsedReport = JSON.parse(candidate);
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

  const plan = buildInterviewPlan(intake);
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

  const diagnosticProfile = await runDiagnosticAgent({
    intake,
    blocks: syntheticBlocks,
  });
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
  await saveUserMemoryBlob(user.id, {
    ...memoryBlob,
    interviewVoice: {
      ...interviewVoice,
      activeCallId: null,
      lastFinalizedAt: new Date().toISOString(),
      lastReport: {
        executive_report: executiveReport,
        key_findings: keyFindings,
        ended_by: parsed.endedBy,
        duration_sec: parsed.durationSec ?? null,
      },
    },
  });

  appendMemoryTimelineNote({
    userId: user.id,
    chatId: interviewChatId,
    userMessage: transcript.slice(0, 500),
    agentMessage: executiveReport,
    mode: 'diagnostic_interview',
    summary: 'Llamada de entrevista finalizada con informe ejecutivo y hallazgos.',
    facts: keyFindings.map((finding: string) => ({
      type: 'decision' as const,
      key: 'interview_finding',
      value: finding,
      confidence: 0.82,
    })),
  });

  return sendSuccess(res, {
    type: 'interview_complete',
    profile: diagnosticProfile,
    voice_report: {
      executive_report: executiveReport,
      key_findings: keyFindings,
      has_enough_information: hasEnoughInformation,
      stop_reason: typeof parsedReport?.stop_reason === 'string' ? parsedReport.stop_reason : parsed.endedBy,
      confidence:
        parsedReport?.confidence === 'high' || parsedReport?.confidence === 'medium' || parsedReport?.confidence === 'low'
          ? parsedReport.confidence
          : 'high',
    },
  });
});
