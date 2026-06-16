export const AGENT_STREAM_PHASES = [
  'classify',
  'execute',
  'format',
  'validate',
  'knowledge',
] as const;

export type AgentStreamPhase = (typeof AGENT_STREAM_PHASES)[number];

export type AgentStreamPhaseStatus = 'start' | 'done' | 'error';

export type AgentStreamEvent =
  | {
      type: 'run.start';
      turn_id: string;
      ts: number;
    }
  | {
      type: 'phase';
      phase: AgentStreamPhase;
      status: AgentStreamPhaseStatus;
      label: string;
      detail?: string;
      mode?: string;
      ts: number;
    }
  | {
      type: 'tool';
      tool: string;
      label: string;
      status: AgentStreamPhaseStatus;
      iteration?: number;
      ts: number;
    }
  | {
      type: 'message.delta';
      delta: string;
      ts: number;
    }
  | {
      type: 'run.complete';
      response: Record<string, unknown>;
      ts: number;
    }
  | {
      type: 'run.error';
      message: string;
      code?: string;
      ts: number;
    };

export const AGENT_STREAM_PHASE_LABELS: Record<AgentStreamPhase, { start: string; done: string }> = {
  classify: {
    start: 'Interpretando tu consulta',
    done: 'Intención identificada',
  },
  execute: {
    start: 'Reuniendo evidencia y cálculos',
    done: 'Evidencia consolidada',
  },
  format: {
    start: 'Redactando respuesta',
    done: 'Respuesta lista',
  },
  validate: {
    start: 'Verificando coherencia',
    done: 'Validación completada',
  },
  knowledge: {
    start: 'Registrando aprendizaje',
    done: 'Progreso actualizado',
  },
};

export const AGENT_STREAM_TOOL_LABELS: Record<string, string> = {
  'web.search': 'Buscando fuentes confiables',
  'web.extract': 'Extrayendo evidencia web',
  'web.scrape': 'Analizando página de referencia',
  'regulatory.lookup_cl': 'Consultando normativa chilena',
  'rag.lookup': 'Revisando base regulatoria',
  'time.today': 'Verificando fecha de referencia',
  'market.fx_usd_clp': 'Consultando tipo de cambio',
  'market.uf_cl': 'Consultando valor UF',
  'market.utm_cl': 'Consultando UTM',
  'market.tpm_cl': 'Consultando TPM',
  'math.calc': 'Ejecutando cálculo',
  'format.latex': 'Formateando fórmulas',
  'finance.simulate': 'Simulando escenario',
  'finance.simulate_montecarlo': 'Simulación Monte Carlo',
  'finance.scenario_projection': 'Proyectando escenarios',
  'finance.risk_drawdown': 'Analizando riesgo y drawdown',
  'finance.debt_analyzer': 'Analizando deuda',
  'finance.apv_optimizer': 'Optimizando APV',
  'finance.budget_analyzer': 'Analizando presupuesto',
  'finance.budget_table_actions': 'Actualizando presupuesto',
  'finance.goal_planner': 'Planificando objetivo financiero',
  'finance.transactions_charts': 'Construyendo gráficos de transacciones',
  'agent.compose_pipeline': 'Verificando cálculos encadenados',
};

export function resolveAgentStreamToolLabel(tool: string): string {
  const normalized = String(tool ?? '').trim();
  if (!normalized) return 'Procesando evidencia';
  return AGENT_STREAM_TOOL_LABELS[normalized] ?? `Consultando ${normalized.replace(/\./g, ' · ')}`;
}

export function formatAgentStreamSse(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
