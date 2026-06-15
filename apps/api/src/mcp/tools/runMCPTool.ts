import type { ToolResult, ToolContext } from './types';
import type { ToolCall } from './toolcall.types';
import { getTool, listTools } from './registry';
import { bootstrapMCP } from '../bootstrap';
import { isCoreAgentExcludedTool } from '../core-agent-tools';
import {
  toSerfFromIssues,
  toSerfFromUnknown,
  toSerfToolError,
  withToolTimeout,
} from '../tool-governance';
import { ToolError } from '../security/error';

export async function runMCPTool(input: {
  tool: string;
  args: any;
  turn_id: string;
  user_id: string;
  ctx?: ToolContext;
}): Promise<ToolResult> {
  const startedAt = Date.now();

  bootstrapMCP();

  const toolName = String(input.tool || '');
  const baseCall: ToolCall = {
    id: `${input.turn_id}:${toolName}`,
    tool: toolName,
    args: (input.args ?? {}) as any,
    status: 'pending',
  };

  if (isCoreAgentExcludedTool(toolName)) {
    return {
      tool_call: {
        ...baseCall,
        status: 'error',
        error_message: 'tool_not_available_in_core_agent: PDF export is UI-only',
        latency_ms: Date.now() - startedAt,
      },
      data: {
        ok: false,
        error: 'tool_not_available_in_core_agent',
        tool: toolName,
        handoff: 'ui_pdf_export',
      },
    };
  }

  const tool = getTool(toolName);

  if (!tool) {
    return {
      tool_call: {
        ...baseCall,
        status: 'error',
        error_message: `Tool not found: ${toolName}`,
        latency_ms: Date.now() - startedAt,
      },
      data: {
        ok: false,
        error: 'tool_not_found',
        tool: toolName,
        suggested_action: 'Usa solo herramientas registradas en el catálogo MCP.',
      },
    };
  }

  const runValidated = async (args: Record<string, unknown>): Promise<ToolResult> => {
    const out = await withToolTimeout(toolName, () =>
      tool.run(args, {
        ...(input.ctx ?? {}),
        user_id: input.user_id,
        turn_id: input.turn_id,
      }),
    );

    out.tool_call = {
      ...baseCall,
      ...out.tool_call,
      id: out.tool_call?.id ?? baseCall.id,
      latency_ms: Date.now() - startedAt,
      status: out.tool_call?.status ?? 'success',
    };

    return out;
  };

  if (tool.argsSchema) {
    const parsed = tool.argsSchema.safeParse(input.args ?? {});
    if (!parsed.success) {
      const serf = toSerfFromIssues(toolName, parsed.error.issues);
      return {
        tool_call: {
          ...baseCall,
          status: 'error',
          error_message: serf.error.message,
          latency_ms: Date.now() - startedAt,
        },
        data: { ...serf, issues: parsed.error.issues },
      };
    }

    try {
      return await runValidated(parsed.data as Record<string, unknown>);
    } catch (e: unknown) {
      const serf = e instanceof ToolError ? toSerfToolError(toolName, e) : toSerfFromUnknown(toolName, e);
      return {
        tool_call: {
          ...baseCall,
          status: 'error',
          error_message: serf.error.message,
          latency_ms: Date.now() - startedAt,
        },
        data: serf,
      };
    }
  }

  try {
    return await runValidated((input.args ?? {}) as Record<string, unknown>);
  } catch (e: unknown) {
    const serf = e instanceof ToolError ? toSerfToolError(toolName, e) : toSerfFromUnknown(toolName, e);
    return {
      tool_call: {
        ...baseCall,
        status: 'error',
        error_message: serf.error.message,
        latency_ms: Date.now() - startedAt,
      },
      data: serf,
    };
  }
}

export function debugListTools() {
  bootstrapMCP();
  return listTools().map((t) => t.name);
}
