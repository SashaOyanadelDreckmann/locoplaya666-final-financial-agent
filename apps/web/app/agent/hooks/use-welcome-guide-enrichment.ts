'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildWelcomeGuideEnrichment,
  extractIntakeEnvelope,
  type WelcomeGuideAction,
  type WelcomeProductHint,
} from '@financial-agent/shared';
import { getChatIntroEnrichment } from '@/lib/api/cliente';
import type { DiagnosisProfile } from '@/state/profile.store';
import { resolveDiagnosisContext } from '@/app/agent/flujo/chat-intro.shared';

type UseWelcomeGuideParams = {
  chatId: 'chat-1' | 'chat-2' | 'chat-3';
  session?: { name?: string | null; injectedIntake?: unknown } | null;
  diagnosisProfile?: DiagnosisProfile | null;
  diagnosisUnlocked?: boolean;
  enabled?: boolean;
};

export function useWelcomeGuideEnrichment(params: UseWelcomeGuideParams) {
  const [productHints, setProductHints] = useState<WelcomeProductHint[]>([]);
  const [loading, setLoading] = useState(Boolean(params.enabled));

  useEffect(() => {
    if (!params.enabled) {
      setLoading(false);
      return;
    }

    const shouldFetchProducts =
      params.chatId !== 'chat-1' || Boolean(params.diagnosisUnlocked);

    if (!shouldFetchProducts) {
      setProductHints([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getChatIntroEnrichment(params.chatId)
      .then((response) => {
        if (cancelled) return;
        setProductHints(Array.isArray(response.productHints) ? response.productHints : []);
      })
      .catch(() => {
        if (!cancelled) setProductHints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.chatId, params.diagnosisUnlocked, params.enabled]);

  const diagnosis = useMemo(
    () => resolveDiagnosisContext(params.diagnosisProfile, params.session),
    [params.diagnosisProfile, params.session],
  );

  const { intake } = useMemo(
    () => extractIntakeEnvelope(params.session?.injectedIntake),
    [params.session?.injectedIntake],
  );

  const enrichment = useMemo(
    () =>
      buildWelcomeGuideEnrichment({
        chatId: params.chatId,
        firstName: String(params.session?.name ?? '').split(' ')[0]?.trim() || 'Hola',
        intake,
        diagnosisUnlocked: params.diagnosisUnlocked,
        hasDiagnosis: diagnosis.hasDiagnosis,
        topTension: diagnosis.topTension,
        topHypothesis: diagnosis.topHypothesis,
        productHints,
      }),
    [
      params.chatId,
      params.session?.name,
      intake,
      params.diagnosisUnlocked,
      diagnosis.hasDiagnosis,
      diagnosis.topTension,
      diagnosis.topHypothesis,
      productHints,
    ],
  );

  return {
    loading,
    guideActions: enrichment.guideActions as WelcomeGuideAction[],
    productHints: enrichment.productHints,
    productBlurb: enrichment.productBlurb,
  };
}
