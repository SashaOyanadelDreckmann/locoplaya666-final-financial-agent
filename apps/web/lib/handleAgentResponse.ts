import { dispatchUIEvent } from './uiEventDispatcher';

export type ChatAgentResponse = {
  message?: string;
  tool_calls?: any[];
  ui_events?: any[];
  citations?: any[];
  react?: {
    objective?: string;
  };
  reasoning_mode?: string;
};

export function handleAgentResponse(
  response: ChatAgentResponse,
  opts: {
    pushMessage: (msg: string) => void;
    setMeta: (meta: {
      objective?: string;
      mode?: string;
      tool_calls?: any[];
      citations?: any[];
    }) => void;
  }
) {
  if (response.message) {
    opts.pushMessage(response.message);
  }

  if (Array.isArray(response.ui_events)) {
    response.ui_events.forEach(dispatchUIEvent);
  }

  opts.setMeta({
    objective: response.react?.objective,
    mode: response.reasoning_mode,
    tool_calls: response.tool_calls,
    citations: response.citations,
  });
}
