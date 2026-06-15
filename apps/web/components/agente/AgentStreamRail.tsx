'use client';

import React, { useEffect, useMemo, useState } from 'react';

import type { AgentStreamUiState } from '@financial-agent/shared';

import {
  getStreamRailAccentColor,
  getStreamRailStepColors,
  STREAM_PHASE_ORDER,
} from '@/lib/agente/matte-panel-tones';

function phaseIndex(phase?: string): number {
  if (!phase) return 0;
  const idx = STREAM_PHASE_ORDER.indexOf(phase as (typeof STREAM_PHASE_ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds}s`;
}

export function AgentStreamRail(props: { state: AgentStreamUiState }) {
  const { state } = props;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.streaming) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.streaming, state.startedAt]);

  const elapsed = now - state.startedAt;
  const activeIndex = phaseIndex(state.phase);
  const stepColors = useMemo(() => getStreamRailStepColors(state.startedAt), [state.startedAt]);
  const activeStepColor = getStreamRailAccentColor(state);
  const activeTools = useMemo(
    () => state.tools.filter((tool) => tool.status === 'start').slice(-2),
    [state.tools],
  );
  const recentDoneTools = useMemo(
    () => state.tools.filter((tool) => tool.status === 'done').slice(-3),
    [state.tools],
  );

  return (
    <div
      className="agent-stream-rail"
      aria-live="polite"
      aria-busy={state.streaming}
      style={{ '--stream-accent': activeStepColor } as React.CSSProperties}
    >
      <div className="agent-stream-rail-head">
        <span
          className="agent-stream-rail-pulse"
          aria-hidden="true"
          style={{ '--stream-accent': activeStepColor } as React.CSSProperties}
        />
        <div className="agent-stream-rail-copy">
          <span className="agent-stream-rail-kicker">En proceso</span>
          <span className="agent-stream-rail-title">{state.phaseLabel ?? 'Preparando respuesta'}</span>
          {state.mode ? (
            <span className="agent-stream-rail-mode">{state.mode.replaceAll('_', ' ')}</span>
          ) : null}
        </div>
        <span className="agent-stream-rail-elapsed">{formatElapsed(elapsed)}</span>
      </div>

      <div className="agent-stream-rail-track" role="list" aria-label="Etapas del agente">
        {STREAM_PHASE_ORDER.map((phase, index) => {
          const status =
            index < activeIndex
              ? 'done'
              : index === activeIndex
                ? state.phaseStatus === 'done'
                  ? 'done'
                  : 'active'
                : 'pending';
          return (
            <div
              key={phase}
              className={`agent-stream-rail-step is-${status}`}
              role="listitem"
              aria-current={status === 'active' ? 'step' : undefined}
              style={{ '--stream-step-color': stepColors[index] } as React.CSSProperties}
            >
              <span className="agent-stream-rail-step-dot" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {(activeTools.length > 0 || recentDoneTools.length > 0) && (
        <div className="agent-stream-rail-tools" aria-label="Herramientas en ejecución">
          {activeTools.map((tool) => (
            <span key={`${tool.tool}-${tool.iteration}-active`} className="agent-stream-tool is-active">
              {tool.label}
            </span>
          ))}
          {recentDoneTools.map((tool) => (
            <span key={`${tool.tool}-${tool.iteration}-done`} className="agent-stream-tool is-done">
              {tool.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
