import { describe, expect, it } from 'vitest';
import { parseStructuredResponsePayload } from './llm.service';

describe('parseStructuredResponsePayload', () => {
  it('parses output_text JSON payloads', () => {
    const json = parseStructuredResponsePayload({
      status: 'completed',
      output_text: '{"summary":"ok"}',
      output: [],
    });
    expect(json).toBe('{"summary":"ok"}');
  });

  it('throws when the model returns an explicit refusal', () => {
    expect(() =>
      parseStructuredResponsePayload({
        status: 'completed',
        output_text: '',
        output: [
          {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'No puedo procesar esta imagen.' }],
          },
        ],
      }),
    ).toThrow(/rechazó la solicitud/i);
  });

  it('throws when the response is incomplete', () => {
    expect(() =>
      parseStructuredResponsePayload({
        status: 'incomplete',
        output_text: '{"summary":"parcial"}',
        output: [],
      }),
    ).toThrow(/incompleta/i);
  });
});
