import { describe, expect, it } from 'vitest';
import { findAgentTableTagSpans, stripAgentTableTags } from './structured-agent-tags';

describe('structured-agent-tags', () => {
  it('parses closed TABLE blocks', () => {
    const text =
      'Intro\n<TABLE>{"title":"T","headers":["A","B"],"rows":[["1","2"]]}</TABLE>\nFin';
    const spans = findAgentTableTagSpans(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.data.title).toBe('T');
    expect(stripAgentTableTags(text)).toBe('Intro\n\n\nFin');
  });

  it('parses TABLE blocks without closing tag', () => {
    const text =
      'Prioridades\n<TABLE>{"title":"Análisis","headers":["Cat","Monto"],"rows":[["Comida",120000]]}\nNota final';
    const spans = findAgentTableTagSpans(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.data.headers).toEqual(['Cat', 'Monto']);
    expect(stripAgentTableTags(text)).toBe('Prioridades\n\n\nNota final');
  });
});
