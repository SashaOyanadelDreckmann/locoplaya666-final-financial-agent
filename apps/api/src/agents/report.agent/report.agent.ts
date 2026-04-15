/**
 * Report Agent — Director de informes PDF de élite
 *
 * Este agente especializado toma el contexto completo del usuario
 * y genera un spec profundo para pdf.generate_report.
 * No usa tools externos — solo planificación LLM + generación PDF directa.
 */

import { completeStructured } from '../../services/llm.service';
import { generateProfessionalReportPdf } from '../../services/reports/professionalPdf.service';
import { REPORT_DIRECTOR_SYSTEM } from './report.prompts';

export type ReportAgentInput = {
  user_message: string;
  intent?: string;
  mode?: string;
  style?: 'corporativo' | 'minimalista' | 'tecnico';
  source?: 'simulation' | 'analysis' | 'diagnostic';

  // Conversación completa (últimos N mensajes)
  history?: Array<{ role: string; content: string }>;

  // Contexto del usuario
  user_profile?: Record<string, unknown>;
  injected_intake?: Record<string, unknown>;

  // Estado del panel
  budget?: {
    income: number;
    expenses: number;
    balance: number;
    rows?: Array<{ category: string; type: string; amount: number; note: string }>;
  };

  // Gráficos generados en la conversación
  recent_charts?: Array<{
    title: string;
    kind?: string;
    xKey: string;
    yKey: string;
    data: Array<Record<string, unknown>>;
    format?: string;
  }>;

  // Artefactos previos
  recent_artifacts?: Array<{
    title: string;
    source?: string;
    description?: string;
  }>;

  // Estado de conocimiento
  knowledge_score?: number;
  milestones?: Array<{ id: string; label: string; done: boolean }>;
};

type ReportSpec = {
  title: string;
  subtitle?: string;
  style?: 'corporativo' | 'minimalista' | 'tecnico';
  source?: 'simulation' | 'analysis' | 'diagnostic';
  sections: Array<{ heading: string; body: string }>;
  charts?: Array<{
    title: string;
    subtitle?: string;
    kind?: 'line' | 'bar' | 'area';
    labels: string[];
    values: number[];
  }>;
  tables?: Array<{
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    align?: Array<'left' | 'center' | 'right'>;
  }>;
};

/** Construye el bloque de contexto que se envía al LLM director */
function buildContextBlock(input: ReportAgentInput): string {
  const parts: string[] = [];

  parts.push(`SOLICITUD DEL USUARIO:\n"${input.user_message}"`);

  if (input.intent) parts.push(`Intención detectada: ${input.intent}`);
  if (input.mode)   parts.push(`Modo cognitivo: ${input.mode}`);

  // Perfil / intake
  if (input.injected_intake) {
    const i = input.injected_intake as any;
    const profileLines: string[] = [];
    if (i.age)                profileLines.push(`Edad: ${i.age} años`);
    if (i.employmentStatus)   profileLines.push(`Situación laboral: ${i.employmentStatus}`);
    if (i.incomeBand)         profileLines.push(`Rango de ingresos: ${i.incomeBand}`);
    if (i.hasDebt !== undefined) profileLines.push(`Tiene deudas: ${i.hasDebt ? 'Sí' : 'No'}`);
    if (i.hasSavingsOrInvestments !== undefined)
      profileLines.push(`Tiene ahorros/inversiones: ${i.hasSavingsOrInvestments ? 'Sí' : 'No'}`);
    if (i.riskReaction)       profileLines.push(`Reacción al riesgo: ${i.riskReaction}`);
    if (i.moneyStressLevel)   profileLines.push(`Estrés financiero: ${i.moneyStressLevel}/10`);
    if (i.primaryGoal)        profileLines.push(`Objetivo principal: ${i.primaryGoal}`);
    if (profileLines.length > 0) {
      parts.push(`PERFIL DEL USUARIO:\n${profileLines.join('\n')}`);
    }
  }

  if (input.user_profile) {
    const p = input.user_profile as any;
    if (p.coherenceScore) parts.push(`Coherencia financiera del perfil: ${p.coherenceScore}%`);
  }

  // Presupuesto
  if (input.budget) {
    const b = input.budget;
    parts.push(
      `PRESUPUESTO ACTUAL:\nIngresos: $${b.income.toLocaleString('es-CL')}\nGastos: $${b.expenses.toLocaleString('es-CL')}\nBalance: $${b.balance.toLocaleString('es-CL')}`
    );
    if (Array.isArray(b.rows) && b.rows.length > 0) {
      const rowLines = b.rows
        .filter((r) => r.amount > 0)
        .slice(0, 16)
        .map((r) => `  ${r.type === 'income' ? 'Ingreso' : 'Gasto'} | ${r.note || r.category}: $${r.amount.toLocaleString('es-CL')}`)
        .join('\n');
      if (rowLines) parts.push(`Detalle presupuesto:\n${rowLines}`);
    }
  }

  // Gráficos de la conversación (como contexto numérico)
  if (Array.isArray(input.recent_charts) && input.recent_charts.length > 0) {
    const chartSummaries = input.recent_charts.slice(0, 4).map((c) => {
      const dataPoints = c.data.slice(0, 8).map((row) => {
        const x = row[c.xKey];
        const y = row[c.yKey];
        return `${x}: ${y}`;
      });
      return `"${c.title}" (${c.kind ?? 'line'}): ${dataPoints.join(', ')}`;
    });
    parts.push(`GRÁFICOS RECIENTES EN EL CHAT:\n${chartSummaries.join('\n')}`);
  }

  // Historial reciente (últimos 10 mensajes)
  if (Array.isArray(input.history) && input.history.length > 0) {
    const recentHistory = input.history.slice(-10);
    const historyText = recentHistory
      .map((h) => `[${h.role === 'user' ? 'Usuario' : 'Agente'}]: ${h.content.slice(0, 400)}`)
      .join('\n');
    parts.push(`CONVERSACIÓN RECIENTE (últimos mensajes):\n${historyText}`);
  }

  // Hitos completados
  if (Array.isArray(input.milestones)) {
    const done = input.milestones.filter((m) => m.done).map((m) => m.label);
    const pending = input.milestones.filter((m) => !m.done).map((m) => m.label);
    if (done.length > 0)    parts.push(`HITOS COMPLETADOS: ${done.join(', ')}`);
    if (pending.length > 0) parts.push(`HITOS PENDIENTES: ${pending.join(', ')}`);
  }

  if (input.knowledge_score !== undefined) {
    parts.push(`Nivel de conocimiento acumulado: ${input.knowledge_score}%`);
  }

  parts.push(`\nESTILO REQUERIDO: ${input.style ?? 'corporativo'}`);
  parts.push(`TIPO DE FUENTE: ${input.source ?? 'analysis'}`);
  parts.push(
    `\nGenera el informe completo con 6 secciones, 1-3 gráficos y 0-2 tablas según los datos disponibles.`
  );

  return parts.join('\n\n');
}

/** Valida y limpia el spec generado por el LLM */
function sanitizeReportSpec(raw: unknown, fallbackTitle: string): ReportSpec {
  const r = (raw ?? {}) as any;

  const title = typeof r.title === 'string' && r.title.trim().length > 0
    ? r.title.trim().slice(0, 120)
    : fallbackTitle;

  const subtitle = typeof r.subtitle === 'string' ? r.subtitle.trim().slice(0, 160) : undefined;

  const validStyles = ['corporativo', 'minimalista', 'tecnico'] as const;
  const style: 'corporativo' | 'minimalista' | 'tecnico' =
    validStyles.includes(r.style) ? r.style : 'corporativo';

  const validSources = ['analysis', 'diagnostic', 'simulation'] as const;
  const source: 'analysis' | 'diagnostic' | 'simulation' =
    validSources.includes(r.source) ? r.source : 'analysis';

  const sections: Array<{ heading: string; body: string }> = Array.isArray(r.sections)
    ? r.sections
        .filter(
          (s: any) =>
            s && typeof s.heading === 'string' && typeof s.body === 'string' &&
            s.heading.trim().length > 0 && s.body.trim().length > 0
        )
        .slice(0, 10)
        .map((s: any) => ({ heading: s.heading.trim(), body: s.body.trim() }))
    : [{ heading: 'Análisis', body: 'Informe generado a partir del contexto de la conversación.' }];

  const charts = Array.isArray(r.charts)
    ? r.charts
        .filter((c: any) => {
          if (!c || typeof c.title !== 'string') return false;
          if (!Array.isArray(c.labels) || !Array.isArray(c.values)) return false;
          const pairs = Math.min(c.labels.length, c.values.length);
          return pairs >= 2;
        })
        .slice(0, 3)
        .map((c: any) => {
          const pairs = Math.min(c.labels.length, c.values.length);
          const validKinds = ['line', 'bar', 'area'] as const;
          return {
            title: String(c.title).slice(0, 80),
            subtitle: typeof c.subtitle === 'string' ? c.subtitle.slice(0, 120) : undefined,
            kind: validKinds.includes(c.kind) ? c.kind : ('line' as const),
            labels: c.labels.slice(0, pairs).map(String),
            values: c.values.slice(0, pairs).map((v: unknown) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : 0;
            }),
          };
        })
    : undefined;

  const tables = Array.isArray(r.tables)
    ? r.tables
        .filter(
          (t: any) =>
            t && typeof t.title === 'string' &&
            Array.isArray(t.columns) && t.columns.length > 0 &&
            Array.isArray(t.rows)
        )
        .slice(0, 2)
        .map((t: any) => ({
          title: String(t.title).slice(0, 80),
          columns: t.columns.slice(0, 6).map(String),
          rows: (t.rows as any[][]).slice(0, 14).map((row) =>
            (Array.isArray(row) ? row : []).slice(0, 6).map((cell) => {
              const n = Number(cell);
              return Number.isFinite(n) && typeof cell === 'number' ? n : String(cell ?? '');
            })
          ),
          align: Array.isArray(t.align)
            ? t.align.slice(0, 6).map((a: string) =>
                ['left', 'center', 'right'].includes(a) ? (a as 'left' | 'center' | 'right') : 'left'
              )
            : undefined,
        }))
    : undefined;

  return { title, subtitle, style, source, sections, charts, tables };
}

/**
 * Ejecuta el agente director de informes.
 * Retorna un SimulationArtifact con el PDF generado.
 */
export async function runReportAgent(input: ReportAgentInput) {
  const contextBlock = buildContextBlock(input);

  // LLM planning call — genera la especificación completa del informe
  const spec = await completeStructured<ReportSpec>({
    system: REPORT_DIRECTOR_SYSTEM,
    user: contextBlock,
    temperature: 0.35,
  });

  const fallbackTitle = input.intent
    ? `Informe financiero · ${input.intent.slice(0, 60)}`
    : 'Informe financiero personalizado';

  const cleanSpec = sanitizeReportSpec(spec, fallbackTitle);

  // Genera el PDF con el spec validado
  const artifact = await generateProfessionalReportPdf({
    title: cleanSpec.title,
    subtitle: cleanSpec.subtitle,
    style: cleanSpec.style,
    source: cleanSpec.source,
    sections: cleanSpec.sections,
    charts: cleanSpec.charts,
    tables: cleanSpec.tables,
  });

  return artifact;
}
