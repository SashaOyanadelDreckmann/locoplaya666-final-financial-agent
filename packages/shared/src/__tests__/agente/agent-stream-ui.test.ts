import { describe, expect, it } from 'vitest';

import {
  applyAgentStreamEvent,
  createInitialAgentStreamUiState,
  parseAgentStreamSseChunk,
} from '../../agente/agent-stream-ui';

describe('agent-stream-ui', () => {
  it('creates initial classify phase state', () => {
    const state = createInitialAgentStreamUiState();
    expect(state.streaming).toBe(true);
    expect(state.phase).toBe('classify');
  });

  it('applies phase and tool events', () => {
    let state = createInitialAgentStreamUiState();
    state = applyAgentStreamEvent(state, {
      type: 'phase',
      phase: 'execute',
      status: 'start',
      label: 'Reuniendo evidencia',
      ts: Date.now(),
    });
    state = applyAgentStreamEvent(state, {
      type: 'tool',
      tool: 'web.search',
      label: 'Buscando fuentes',
      status: 'start',
      ts: Date.now(),
    });
    expect(state.phase).toBe('execute');
    expect(state.tools).toHaveLength(1);
  });

  it('parses SSE chunks with remainder', () => {
    const parsed = parseAgentStreamSseChunk(
      'data: {"type":"run.start","turn_id":"t1","ts":1}\n\ndata: {"type":"phase","phase":"format","status":"start","label":"Redactando","ts":2}\n\npartial',
    );
    expect(parsed.events).toHaveLength(2);
    expect(parsed.remainder).toBe('partial');
  });
});
