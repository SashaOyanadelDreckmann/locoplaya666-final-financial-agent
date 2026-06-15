import type { AgentStreamEvent, AgentStreamPhase } from './agent-stream';

export type AgentStreamUiTool = {
  tool: string;
  label: string;
  status: 'start' | 'done' | 'error';
  iteration?: number;
};

export type AgentStreamUiState = {
  turnId?: string;
  phase?: AgentStreamPhase | string;
  phaseLabel?: string;
  phaseStatus?: 'start' | 'done' | 'error';
  mode?: string;
  tools: AgentStreamUiTool[];
  streaming: boolean;
  startedAt: number;
};

export function createInitialAgentStreamUiState(): AgentStreamUiState {
  return {
    tools: [],
    streaming: true,
    startedAt: Date.now(),
    phase: 'classify',
    phaseLabel: 'Interpretando tu consulta',
    phaseStatus: 'start',
  };
}

/** UI state while waiting for a non-streaming (JSON) agent response — typical on mobile Safari. */
export function createJsonTransportStreamUiState(): AgentStreamUiState {
  return {
    ...createInitialAgentStreamUiState(),
    phase: 'format',
    phaseLabel: 'Redactando respuesta',
    phaseStatus: 'start',
  };
}

export function applyAgentStreamEvent(
  state: AgentStreamUiState,
  event: AgentStreamEvent,
): AgentStreamUiState {
  if (event.type === 'run.start') {
    return {
      ...state,
      turnId: event.turn_id,
      streaming: true,
      startedAt: event.ts,
    };
  }

  if (event.type === 'phase') {
    return {
      ...state,
      phase: event.phase,
      phaseLabel: event.label,
      phaseStatus: event.status,
      mode: event.mode ?? state.mode,
    };
  }

  if (event.type === 'tool') {
    const existingIdx = state.tools.findIndex(
      (entry) => entry.tool === event.tool && entry.iteration === event.iteration,
    );
    const nextTool: AgentStreamUiTool = {
      tool: event.tool,
      label: event.label,
      status: event.status,
      iteration: event.iteration,
    };
    const tools =
      existingIdx >= 0
        ? state.tools.map((entry, idx) => (idx === existingIdx ? nextTool : entry))
        : [...state.tools, nextTool].slice(-6);
    return { ...state, tools };
  }

  if (event.type === 'run.complete') {
    return { ...state, streaming: false, phaseStatus: 'done' };
  }

  if (event.type === 'run.error') {
    return { ...state, streaming: false, phaseLabel: event.message, phaseStatus: 'done' };
  }

  return state;
}

export function parseAgentStreamSseChunk(buffer: string): {
  events: AgentStreamEvent[];
  remainder: string;
} {
  const events: AgentStreamEvent[] = [];
  const chunks = buffer.split('\n\n');
  const remainder = chunks.pop() ?? '';

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        events.push(JSON.parse(payload) as AgentStreamEvent);
      } catch {
        // ignore malformed frames
      }
    }
  }

  return { events, remainder };
}
