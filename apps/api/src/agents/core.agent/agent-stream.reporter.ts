import type { Response } from 'express';
import {
  AGENT_STREAM_PHASE_LABELS,
  formatAgentStreamSse,
  resolveAgentStreamToolLabel,
  type AgentStreamEvent,
  type AgentStreamPhase,
  type AgentStreamPhaseStatus,
} from '@financial-agent/shared';

export interface AgentProgressReporter {
  emit(event: AgentStreamEvent): void;
  phase(phase: AgentStreamPhase, status: AgentStreamPhaseStatus, detail?: { mode?: string; detail?: string }): void;
  tool(tool: string, status: AgentStreamPhaseStatus, meta?: { iteration?: number }): void;
  messageDelta(delta: string): void;
  complete(response: Record<string, unknown>): void;
  error(message: string, code?: string): void;
}

export function wantsAgentStream(req: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): boolean {
  const queryStream = req.query?.stream;
  const accept = String(req.headers?.accept ?? '');
  const bodyStream = req.body?.stream;
  return (
    queryStream === '1' ||
    queryStream === 'true' ||
    accept.includes('text/event-stream') ||
    bodyStream === true
  );
}

export function initAgentSseResponse(res: Response): AgentProgressReporter {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const write = (event: AgentStreamEvent) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(formatAgentStreamSse(event));
  };

  return {
    emit: write,
    phase(phase, status, detail) {
      const labels = AGENT_STREAM_PHASE_LABELS[phase];
      write({
        type: 'phase',
        phase,
        status,
        label: status === 'start' ? labels.start : labels.done,
        detail: detail?.detail,
        mode: detail?.mode,
        ts: Date.now(),
      });
    },
    tool(tool, status, meta) {
      write({
        type: 'tool',
        tool,
        label: resolveAgentStreamToolLabel(tool),
        status,
        iteration: meta?.iteration,
        ts: Date.now(),
      });
    },
    messageDelta(delta) {
      if (!delta) return;
      write({ type: 'message.delta', delta, ts: Date.now() });
    },
    complete(response) {
      write({ type: 'run.complete', response, ts: Date.now() });
      if (!res.writableEnded) res.end();
    },
    error(message, code) {
      write({ type: 'run.error', message, code, ts: Date.now() });
      if (!res.writableEnded) res.end();
    },
  };
}

export function createNoopAgentProgressReporter(): AgentProgressReporter {
  const noop = () => undefined;
  return {
    emit: noop,
    phase: noop,
    tool: noop,
    messageDelta: noop,
    complete: noop,
    error: noop,
  };
}
