'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PARSE_PROGRESS_STEPS,
  buildParseProgressLabels,
  clampParsePercent,
  resolveStepState,
  type DocumentsParseProgress,
} from '@/lib/transactions-parse-progress.helpers';

const PARSE_TOTAL_ESTIMATE_SEC = 60;

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec} seg`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
}

type TxParseProgressProps = {
  progress: DocumentsParseProgress | null | undefined;
  fallbackModeLabel: string;
  fallbackMetaLabel: string;
  fallbackPrimaryCopy: string;
  chatMode?: boolean;
};

export function TxParseProgress({
  progress,
  fallbackModeLabel,
  fallbackMetaLabel,
  fallbackPrimaryCopy,
  chatMode = false,
}: TxParseProgressProps) {
  const activeStage = progress?.stage && progress.stage !== 'idle' ? progress.stage : null;
  const labels = activeStage
    ? buildParseProgressLabels(progress)
    : {
        modeLabel: fallbackModeLabel,
        metaLabel: fallbackMetaLabel,
        primaryCopy: fallbackPrimaryCopy,
      };
  const percent = clampParsePercent(progress?.percent ?? (chatMode ? 42 : 18));
  const showSteps = Boolean(activeStage) && !chatMode;

  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, PARSE_TOTAL_ESTIMATE_SEC - elapsed);
  const showTimer = !chatMode && elapsed > 2;

  return (
    <div className="tx-analysis-live" role="status" aria-live="polite" aria-busy="true">
      <div className="tx-analysis-console-head">
        <div className="tx-analysis-console-kicker">
          <span className="tx-analysis-console-dot" aria-hidden="true" />
          <span className="tx-analysis-badge">{labels.modeLabel}</span>
          <span className="tx-analysis-meta">{labels.metaLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showTimer && (
            <span className="tx-analysis-meta" aria-live="polite">
              {remaining > 0 ? `~${formatElapsed(remaining)} restantes` : `${formatElapsed(elapsed)} transcurridos`}
            </span>
          )}
          <span className="tx-analysis-percent" aria-hidden="true">
            {percent}%
          </span>
        </div>
      </div>

      <div className="tx-analysis-console-body">
        <p className="tx-analysis-copy">{labels.primaryCopy}</p>
        {showSteps && (
          <div className="tx-analysis-steps" aria-label="Etapas del análisis">
            {PARSE_PROGRESS_STEPS.map((step) => {
              const state = resolveStepState(step.stage, activeStage ?? 'reading');
              return (
                <span
                  key={step.stage}
                  className={`tx-analysis-step is-${state}`}
                  data-stage={step.stage}
                >
                  {step.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="tx-analysis-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={labels.modeLabel}
      >
        <span
          className={`tx-analysis-fill ${activeStage ? 'is-determinate' : ''}`}
          style={activeStage ? { width: `${percent}%`, left: 0 } : undefined}
        />
      </div>
    </div>
  );
}
