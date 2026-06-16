import { stripAgentTableTags } from './structured-agent-tags';

/** Strip internal agent tags from streamed formatter output (client-safe mirror of server cleanSpecialTags). */
export function stripAgentStreamTags(text: string): string {
  return stripAgentTableTags(
    String(text ?? '')
      .replace(/<CHART>[\s\S]*?<\/CHART>/g, '\n\n')
      .replace(/<TX_CHART>[\s\S]*?<\/TX_CHART>/g, '\n\n')
      .replace(/<QUESTIONNAIRE>[\s\S]*?<\/QUESTIONNAIRE>/g, '\n\n')
      .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/g, '\n\n')
      .replace(/<PANEL>[\s\S]*?<\/PANEL>/g, '\n\n')
      .replace(/<BUDGET_UPDATE>[\s\S]*?<\/BUDGET_UPDATE>/gi, '\n\n')
      .replace(/(?:^|\n)\s*SUGERENCIAS\s*:\s*\[[\s\S]*?\]\s*(?=\n|$)/gi, '\n\n')
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '\n\n')
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, '\n\n')
      .replace(/<parameter[\s\S]*?<\/parameter>/gi, '\n\n')
      .replace(/<\/?(function_calls|invoke|parameter)[^>]*>/gi, '\n')
      .replace(/<CONTEXT_SCORE>\d+<\/CONTEXT_SCORE>/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}
