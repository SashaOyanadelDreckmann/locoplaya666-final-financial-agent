/**
 * finance.goal_planner
 *
 * Planificación de metas financieras:
 * - ¿Cuánto tiempo para llegar a la meta?
 * - ¿Cuánto necesito ahorrar mensualmente?
 * - Análisis de brecha
 * - Escenarios pesimista/base/optimista
 * - Desglose por tipo de meta (emergencia, auto, viaje, casa, retiro)
 */

import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateNumericRange } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

function normRate(x: number) {
  return x > 1 ? x / 100 : x;
}

// Calcula meses para alcanzar una meta con aporte mensual y rendimiento
function monthsToGoal(
  goalAmount: number,
  currentSavings: number,
  monthlyContrib: number,
  monthlyRate: number,
): number {
  if (monthlyContrib <= 0 && monthlyRate <= 0) {
    return Infinity;
  }

  // Si ya tiene suficiente
  if (currentSavings >= goalAmount) return 0;

  // Búsqueda binaria (hasta 60 años)
  let lo = 1, hi = 720;
  for (let iter = 0; iter < 60; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    let balance = currentSavings;
    for (let m = 0; m < mid; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContrib;
    }
    if (balance >= goalAmount) hi = mid;
    else lo = mid + 1;
    if (hi - lo <= 1) break;
  }

  // Verificar hi
  let balanceHi = currentSavings;
  for (let m = 0; m < hi; m++) {
    balanceHi = balanceHi * (1 + monthlyRate) + monthlyContrib;
  }
  return balanceHi >= goalAmount ? hi : Infinity;
}

// Calcula el aporte mensual necesario para alcanzar la meta en N meses
function monthlyNeeded(
  goalAmount: number,
  currentSavings: number,
  months: number,
  monthlyRate: number,
): number {
  if (months <= 0) return 0;
  if (currentSavings >= goalAmount) return 0;

  const gap = goalAmount - currentSavings * Math.pow(1 + monthlyRate, months);

  if (monthlyRate === 0) return gap / months;

  // FV = PMT * [(1+r)^n - 1] / r  ⟹  PMT = FV * r / [(1+r)^n - 1]
  const factor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  return factor > 0 ? gap / factor : gap / months;
}

export const goalPlannerTool: MCPTool = {
  name: 'finance.goal_planner',
  description:
    'Planifica una meta financiera (emergencia, auto, viaje, casa, retiro): tiempo para lograrlo, aporte mensual necesario, análisis de brecha y escenarios de rendimiento.',
  argsSchema: z.object({
    goalAmount:          z.number().positive(),                    // meta en CLP
    currentSavings:      z.number().min(0).optional(),            // ahorro actual disponible
    monthlyContribution: z.number().min(0).optional(),            // cuánto puedo aportar mensual
    targetMonths:        z.number().int().positive().optional(),   // plazo deseado (alternativa)
    annualRate:          z.number().optional(),                    // rendimiento esperado anual
    goalType:            z.enum(['emergencia','auto','viaje','educacion','casa','retiro','otro']).optional(),
    inflationAdjust:     z.boolean().optional(),                   // ajustar meta por inflación (3% anual)
    monthlyIncome:       z.number().positive().optional(),         // para calcular % del ingreso
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.goal_planner');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.goal_planner', ctx);

      // 2. Input validation
      validateNumericRange(Number(args.goalAmount), 1000, 1000000000, 'goalAmount', 'finance.goal_planner');

      if (args.currentSavings !== undefined) {
        validateNumericRange(Number(args.currentSavings), 0, 1000000000, 'currentSavings', 'finance.goal_planner');
      }

      if (args.monthlyContribution !== undefined) {
        validateNumericRange(Number(args.monthlyContribution), 0, 100000000, 'monthlyContribution', 'finance.goal_planner');
      }

      if (args.targetMonths !== undefined) {
        validateNumericRange(Number(args.targetMonths), 1, 1200, 'targetMonths', 'finance.goal_planner');
      }

      if (args.monthlyIncome !== undefined) {
        validateNumericRange(Number(args.monthlyIncome), 1, 100000000, 'monthlyIncome', 'finance.goal_planner');
      }

      const goal          = Number(args.goalAmount);
      const savings       = Number(args.currentSavings  ?? 0);
      const contrib       = Number(args.monthlyContribution ?? 0);
    const targetMonths  = args.targetMonths ? Math.floor(Number(args.targetMonths)) : null;
    const annualRate    = normRate(Number(args.annualRate ?? 4.5));
    const monthlyRate   = annualRate / 12;
    const goalType      = args.goalType ?? 'otro';
    const income        = Number(args.monthlyIncome ?? 0);

    // Inflación: si se activa, la meta crece 3% anual → meta efectiva mayor
    const inflationRate = (args.inflationAdjust ?? false) ? 0.03 / 12 : 0;

    // ── Meta efectiva (ajustada por inflación si aplica) ─────────────
    const effectiveMonths = targetMonths ?? monthsToGoal(goal, savings, contrib, monthlyRate);
    const effectiveGoal   = args.inflationAdjust && effectiveMonths < Infinity
      ? goal * Math.pow(1 + inflationRate * 12, effectiveMonths / 12)
      : goal;

    // ── ¿Cuánto tiempo con el aporte actual? ──────────────────────────
    const monthsWithCurrentContrib = contrib > 0
      ? monthsToGoal(effectiveGoal, savings, contrib, monthlyRate)
      : Infinity;

    const yearsWithCurrent = monthsWithCurrentContrib < Infinity
      ? Number((monthsWithCurrentContrib / 12).toFixed(1))
      : null;

    // ── Si se especificó plazo: ¿cuánto necesito? ─────────────────────
    let monthlyNeededForTarget: number | null = null;
    let gapMonthly: number | null = null;

    if (targetMonths) {
      monthlyNeededForTarget = Math.max(0, monthlyNeeded(effectiveGoal, savings, targetMonths, monthlyRate));
      gapMonthly = contrib > 0 ? Math.max(0, monthlyNeededForTarget - contrib) : monthlyNeededForTarget;
    }

    // ── Proyección serie temporal ──────────────────────────────────────
    const projectionMonths = targetMonths ?? Math.min(monthsWithCurrentContrib < Infinity ? monthsWithCurrentContrib : 120, 120);
    const series: Array<{ month: number; balance: number; goal: number }> = [];
    let balance = savings;
    const step  = projectionMonths <= 24 ? 1 : projectionMonths <= 60 ? 3 : 6;

    for (let m = 1; m <= projectionMonths; m++) {
      balance = balance * (1 + monthlyRate) + contrib;
      const currentGoal = args.inflationAdjust
        ? goal * Math.pow(1 + inflationRate, m)
        : goal;
      if (m % step === 0 || m === projectionMonths) {
        series.push({ month: m, balance: Math.round(balance), goal: Math.round(currentGoal) });
      }
    }

    // ── Escenarios ─────────────────────────────────────────────────────
    const scenarios = [
      { label: 'Pesimista (2%)',  rate: 0.02 },
      { label: 'Base actual',     rate: annualRate },
      { label: 'Optimista (8%)',  rate: 0.08 },
    ].map((sc) => {
      const r = sc.rate / 12;
      const months = contrib > 0 ? monthsToGoal(effectiveGoal, savings, contrib, r) : Infinity;
      return {
        label:  sc.label,
        rate:   sc.rate * 100,
        months: months < Infinity ? Math.round(months) : null,
        years:  months < Infinity ? Number((months / 12).toFixed(1)) : null,
        monthly_needed: targetMonths
          ? Math.round(Math.max(0, monthlyNeeded(effectiveGoal, savings, targetMonths, r)))
          : null,
      };
    });

    // ── Porcentaje del ingreso ──────────────────────────────────────────
    const contribPctIncome = income > 0 ? Number(((contrib / income) * 100).toFixed(1)) : null;
    const neededPctIncome  = income > 0 && monthlyNeededForTarget
      ? Number(((monthlyNeededForTarget / income) * 100).toFixed(1))
      : null;

    // ── Contexto por tipo de meta ──────────────────────────────────────
    const goalContext: Record<string, string> = {
      emergencia: '3-6 meses de gastos en cuenta de ahorro líquida (no AFP ni fondos mutuos de largo plazo).',
      auto:       'Considera DAP o fondo mutuo conservador. Un pie del 20-30% reduce la cuota mensual considerablemente.',
      viaje:      'DAP o cuenta de ahorro con plazo fijo. Calcula también seguro de viaje.',
      educacion:  'CAE (Crédito con Aval del Estado) o becas JUNAEB/MINEDUC pueden complementar.',
      casa:       'Pie mínimo en Chile: 10-20% del valor. Crédito hipotecario: ratio cuota/ingreso ≤ 25-30%.',
      retiro:     'APV Régimen A o B potencian este objetivo con beneficio tributario. Considera AFP Fondo A si horizonte > 15 años.',
      otro:       'Mantén los fondos separados de tu cuenta corriente para no mezclarlos.',
    };

    const summary = {
      // Meta
      goal_amount:     Math.round(goal),
      goal_effective:  Math.round(effectiveGoal),
      goal_type:       goalType,
      inflation_adjusted: args.inflationAdjust ?? false,

      // Situación actual
      current_savings:        Math.round(savings),
      monthly_contribution:   Math.round(contrib),
      annual_rate_pct:        Number((annualRate * 100).toFixed(2)),

      // Tiempo con aporte actual
      months_with_current:    monthsWithCurrentContrib < Infinity ? Math.round(monthsWithCurrentContrib) : null,
      years_with_current:     yearsWithCurrent,
      achievable_current:     monthsWithCurrentContrib < Infinity,

      // Si se especificó plazo objetivo
      target_months:          targetMonths,
      monthly_needed_target:  monthlyNeededForTarget ? Math.round(monthlyNeededForTarget) : null,
      monthly_gap:            gapMonthly ? Math.round(gapMonthly) : null,
      contrib_pct_income:     contribPctIncome,
      needed_pct_income:      neededPctIncome,

      // Escenarios
      scenarios,

      // Contexto de la meta
      goal_context: goalContext[goalType] ?? goalContext['otro'],

        // Serie temporal
        series,
      };

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'finance.goal_planner',
          args,
          status: 'success',
          result: {
            achievable:          summary.achievable_current,
            months_with_current: summary.months_with_current,
            years_with_current:  summary.years_with_current,
            monthly_needed:      summary.monthly_needed_target,
            monthly_gap:         summary.monthly_gap,
          },
        },
        data: { summary },
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.goal_planner');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
