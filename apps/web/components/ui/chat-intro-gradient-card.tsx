'use client';

import { useMemo } from 'react';

import {
  buildChatIntroContent,
  buildDiagnosisDeepenIntroContent,
  type ChatIntroId,
} from '@/app/agent/flujo/chat-intro.shared';
import type { DiagnosisProfile } from '@/state/profile.store';
import { ExecutiveBlobCarouselShell } from '@/components/ui/executive-blob-carousel';

type ChatIntroGradientCardProps = {
  className?: string;
  chatId: ChatIntroId;
  sessionUserName?: string | null;
  sessionInjectedIntake?: unknown;
  diagnosisProfile?: DiagnosisProfile | null;
  diagnosisUnlocked?: boolean;
  introMode?: 'default' | 'deepen';
  voiceFindings?: string[];
};

export function ChatIntroGradientCard({
  className,
  chatId,
  sessionUserName,
  sessionInjectedIntake,
  diagnosisProfile,
  diagnosisUnlocked = false,
  introMode = 'default',
  voiceFindings,
}: ChatIntroGradientCardProps) {
  const session = useMemo(
    () => ({
      name: sessionUserName,
      injectedIntake: sessionInjectedIntake,
    }),
    [sessionUserName, sessionInjectedIntake],
  );

  const intro = useMemo(
    () =>
      introMode === 'deepen' && chatId === 'chat-1'
        ? buildDiagnosisDeepenIntroContent({
            session,
            diagnosisProfile,
            voiceFindings,
          })
        : buildChatIntroContent({
            chatId,
            session,
            diagnosisProfile,
            diagnosisUnlocked: chatId === 'chat-1' ? diagnosisUnlocked : undefined,
          }),
    [chatId, diagnosisProfile, diagnosisUnlocked, introMode, session, voiceFindings],
  );

  const pages = useMemo(
    () => [{ id: intro.chatId, label: intro.title, roman: 'I', tone: intro.tone }],
    [intro.chatId, intro.title, intro.tone],
  );

  return (
    <ExecutiveBlobCarouselShell
      className={className}
      pages={pages}
      active={0}
      transition=""
      hideNav
      hideStageChrome
      navAriaLabel="Introducción del chat"
      slideLabel={null}
      masthead={
        <>
          <p className="gradient-blob-card__masthead-brand">{intro.kicker}</p>
          <h2 className="gradient-blob-card__masthead-title">{intro.title}</h2>
          <div className="gradient-blob-card__masthead-rule" aria-hidden="true" />
        </>
      }
      onChange={() => undefined}
      onPrev={() => undefined}
      onNext={() => undefined}
    >
      {intro.epigraph ? (
        <blockquote className="gradient-blob-card__quote gradient-blob-card__quote--filled gradient-blob-card__quote--compact gradient-blob-card__quote--intro">
          <p>«{intro.epigraph.quote}»</p>
          <footer>— {intro.epigraph.attribution}</footer>
        </blockquote>
      ) : null}
      <p className="gradient-blob-card__body-text gradient-blob-card__body-text--lead gradient-blob-card__body-text--intro">
        {intro.message}
      </p>
      {intro.signals.length > 0 ? (
        <div className="gradient-blob-card__signal-strip">
          {intro.signals.map((signal) => (
            <span key={signal} className="gradient-blob-card__signal-pill">
              {signal}
            </span>
          ))}
        </div>
      ) : null}
    </ExecutiveBlobCarouselShell>
  );
}

export default ChatIntroGradientCard;
