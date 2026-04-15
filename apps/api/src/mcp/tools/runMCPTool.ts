import type { ToolResult, ToolContext } from './types';
import type { ToolCall } from './toolcall.types';
import { getTool, listTools } from './registry';
import { bootstrapMCP } from '../bootstrap';

export async function runMCPTool(input: {
  tool: string;
  args: any;
  turn_id: string;
  user_id: string;
  ctx?: ToolContext;
}): Promise<ToolResult> {
  const startedAt = Date.now();

  // Lazy bootstrap
  bootstrapMCP();

  const toolName = String(input.tool || '');
  const baseCall: ToolCall = {
    id: `${input.turn_id}:${toolName}`,
    tool: toolName,
    args: (input.args ?? {}) as any,
    status: 'pending',
  };

  const tool = getTool(toolName);

  if (!tool) {
    return {
      tool_call: {
        ...baseCall,
        status: 'error',
        error_message: `Tool not found: ${toolName}`,
        latency_ms: Date.now() - startedAt,
      },
      data: { ok: false, error: 'tool_not_found', tool: toolName },
    };
  }

  // ──────────────────────────────
  // Validación de argumentos
  // ──────────────────────────────
  if (tool.argsSchema) {
    const parsed = tool.argsSchema.safeParse(input.args ?? {});
    if (!parsed.success) {
      return {
        tool_call: {
          ...baseCall,
          status: 'error',
          error_message: 'Invalid tool args',
          latency_ms: Date.now() - startedAt,
        },
        data: { ok: false, error: 'invalid_args', issues: parsed.error.issues },
      };
    }

    try {
      const out = await tool.run(parsed.data, {
        ...(input.ctx ?? {}),
        user_id: input.user_id,
        turn_id: input.turn_id,
      });

      out.tool_call = {
        ...baseCall,
        ...out.tool_call,
        id: out.tool_call?.id ?? baseCall.id,
        latency_ms: Date.now() - startedAt,
        status: out.tool_call?.status ?? 'success',
      };

      return out;
    } catch (e: unknown) {
      return {
        tool_call: {
          ...baseCall,
          status: 'error',
          error_message: e ? String(e) : 'Tool execution failed',
          latency_ms: Date.now() - startedAt,
        },
        data: { ok: false, error: 'execution_failed' },
      };
    }
  }

  // ──────────────────────────────
  // Best effort (no recomendado)
  // ──────────────────────────────
  try {
    const out = await tool.run(input.args ?? {}, {
      ...(input.ctx ?? {}),
      user_id: input.user_id,
      turn_id: input.turn_id,
    });

    out.tool_call = {
      ...baseCall,
      ...out.tool_call,
      id: out.tool_call?.id ?? baseCall.id,
      latency_ms: Date.now() - startedAt,
      status: out.tool_call?.status ?? 'success',
    };

    return out;
  } catch (e: unknown) {
    return {
      tool_call: {
        ...baseCall,
        status: 'error',
        error_message: e ? String(e) : 'Tool execution failed',
        latency_ms: Date.now() - startedAt,
      },
      data: { ok: false, error: 'execution_failed' },
    };
  }
}

export function debugListTools() {
  bootstrapMCP();
  return listTools().map((t) => t.name);
}
