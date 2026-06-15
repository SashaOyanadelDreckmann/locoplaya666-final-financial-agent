import { describe, expect, it } from 'vitest';
import { stripAgentStreamTags } from './agent-stream-sanitize';

describe('stripAgentStreamTags', () => {
  it('removes internal formatter tags from streamed text', () => {
    const raw = 'Hola <CONTEXT_SCORE>42</CONTEXT_SCORE> <CHART>{"type":"chart"}</CHART> mundo';
    expect(stripAgentStreamTags(raw)).toBe('Hola\n\n mundo');
  });
});
