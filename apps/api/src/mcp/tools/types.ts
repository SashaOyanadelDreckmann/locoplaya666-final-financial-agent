import type { z } from 'zod';
import type { ToolCall, Citation } from './toolcall.types';

export type ToolContext = {
  user_id?: string;
  session_id?: string;
  turn_id?: string;
  mode?: string;
  intent?: string;
};

export type ToolResult = {
  tool_call: ToolCall;
  citations?: Citation[];
  data?: any;
};

export type MCPTool = {
  name: string;
  description: string;
  argsSchema?: z.ZodTypeAny;
  schema?: Record<string, any>;
  run: (args: any, ctx?: ToolContext) => Promise<ToolResult>;
};
