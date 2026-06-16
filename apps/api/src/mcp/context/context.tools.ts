import { z } from 'zod';
import type { MCPTool } from '../tools/types';
import { getContextManifestForUser, getContextPackForUser } from '../../context-fabric/context-fabric.service';
import { loadUserById } from '../../services/user.service';
import { getContextFabricFlags, isContextFabricMcpToolsEnabled } from '../../context-fabric/context-fabric.policy';

const GetManifestSchema = z.object({
  consumer: z
    .enum(['core-agent', 'budget-agent', 'transactions-agent', 'diagnostic-agent', 'interview-agent'])
    .default('core-agent'),
});

const GetPackSchema = z.object({
  consumer: z.enum(['core-agent', 'budget-agent', 'transactions-agent', 'diagnostic-agent', 'interview-agent']),
  purpose: z.enum([
    'classify',
    'answer',
    'budget_analysis',
    'transaction_analysis',
    'diagnosis',
    'planning',
    'simulation',
    'regulation',
    'social_reflection',
  ]),
  activeChat: z.enum(['chat-1', 'chat-2', 'chat-3']).optional(),
  userMessage: z.string().max(2000).optional(),
  maxInputTokens: z.number().int().min(128).max(32_000).default(4096),
  requiredSections: z.array(z.string()).max(12).optional(),
});

async function requireAuthedUser(userId?: string) {
  if (!userId?.trim()) {
    throw new Error('context_unauthorized: missing session user');
  }
  const user = await loadUserById(userId.trim());
  if (!user) throw new Error('context_unauthorized: user not found');
  return user;
}

export const contextGetManifestTool: MCPTool = {
  name: 'context.get_manifest',
  description:
    'Obtiene el manifiesto compacto de contexto financiero del usuario autenticado (versiones, secciones, conflictos).',
  argsSchema: GetManifestSchema,
  run: async (args, ctx) => {
    const flags = getContextFabricFlags();
    if (!isContextFabricMcpToolsEnabled(flags)) {
      return {
        tool_call: { id: `${ctx?.turn_id ?? 'ctx'}:context.get_manifest`, tool: 'context.get_manifest', args, status: 'error' as const, error_message: 'context_fabric_disabled' },
        data: { ok: false, error: 'context_fabric_disabled' },
      };
    }
    const user = await requireAuthedUser(ctx?.user_id);
    const manifest = await getContextManifestForUser(user);
    return {
      tool_call: { id: `${ctx?.turn_id ?? 'ctx'}:context.get_manifest`, tool: 'context.get_manifest', args, status: 'success' as const },
      data: { ok: true, manifest },
    };
  },
};

export const contextGetPackTool: MCPTool = {
  name: 'context.get_pack',
  description:
    'Construye un context pack acotado para el pipeline consumidor, sin exponer datos de otros usuarios.',
  argsSchema: GetPackSchema,
  run: async (args, ctx) => {
    const flags = getContextFabricFlags();
    if (!isContextFabricMcpToolsEnabled(flags)) {
      return {
        tool_call: { id: `${ctx?.turn_id ?? 'ctx'}:context.get_pack`, tool: 'context.get_pack', args, status: 'error' as const, error_message: 'context_fabric_disabled' },
        data: { ok: false, error: 'context_fabric_disabled' },
      };
    }
    const user = await requireAuthedUser(ctx?.user_id);
    const pack = await getContextPackForUser(user, {
      consumer: args.consumer,
      purpose: args.purpose,
      activeChat: args.activeChat,
      userMessage: args.userMessage,
      maxInputTokens: args.maxInputTokens,
      requiredSections: args.requiredSections,
    });
    return {
      tool_call: { id: `${ctx?.turn_id ?? 'ctx'}:context.get_pack`, tool: 'context.get_pack', args, status: 'success' as const },
      data: { ok: true, pack },
    };
  },
};

export const CONTEXT_FABRIC_TOOLS = [contextGetManifestTool, contextGetPackTool] as const;
