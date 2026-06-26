'use client';

import type { ChatItem } from '@/lib/agente/agent.response.types';

export function resolveActiveComposerSuggestedReplies(items: ChatItem[]): string[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type !== 'message' || item.role !== 'assistant') continue;
    if (item.stream?.streaming) continue;
    const suggestions = item.suggested_replies;
    if (!Array.isArray(suggestions) || suggestions.length === 0) continue;
    return suggestions.map((entry) => String(entry ?? '').trim()).filter(Boolean).slice(0, 4);
  }
  return [];
}

type AgentComposerSuggestedRepliesProps = {
  suggestions: string[];
  disabled?: boolean;
  onSelect: (message: string) => void;
};

export function AgentComposerSuggestedReplies(props: AgentComposerSuggestedRepliesProps) {
  if (props.suggestions.length === 0) return null;

  return (
    <div
      className="agent-composer-suggestions suggested-replies"
      role="group"
      aria-label="Respuestas sugeridas"
    >
      {props.suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="suggestion-chip agent-composer-suggestion-chip"
          disabled={props.disabled}
          onClick={() => props.onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
