/** @jest-environment node */

import {
  CHAT_ATTACH_MAX_FILES,
  CHAT_ATTACH_MAX_TOTAL_BYTES,
  CHAT_ATTACHMENT_ANALYSIS_SCHEMA,
} from '../services/chatAttachmentAnalysis.service';

type JsonSchemaNode = {
  type?: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
};

function assertStrictOpenAiObjectSchema(node: JsonSchemaNode, path: string): void {
  if (node.type !== 'object' || node.additionalProperties !== false || !node.properties) {
    return;
  }

  const propertyKeys = Object.keys(node.properties);
  const required = node.required ?? [];
  for (const key of propertyKeys) {
    expect(required).toContain(key);
  }

  for (const [key, child] of Object.entries(node.properties)) {
    assertStrictOpenAiObjectSchema(child, `${path}.${key}`);
    if (child.items) {
      assertStrictOpenAiObjectSchema(child.items, `${path}.${key}.items`);
    }
  }
}

describe('chatAttachmentAnalysis constants', () => {
  it('matches main chat composer limits', () => {
    expect(CHAT_ATTACH_MAX_FILES).toBe(5);
    expect(CHAT_ATTACH_MAX_TOTAL_BYTES).toBe(120 * 1024 * 1024);
  });
});

describe('chat attachment analysis schema', () => {
  it('requires every property key in nested strict objects (OpenAI response_format)', () => {
    assertStrictOpenAiObjectSchema(
      CHAT_ATTACHMENT_ANALYSIS_SCHEMA as unknown as JsonSchemaNode,
      'CHAT_ATTACHMENT_ANALYSIS_SCHEMA',
    );
  });
});
