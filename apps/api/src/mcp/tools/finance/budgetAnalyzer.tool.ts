/**
 * finance.budget_analyzer
 *
 * Análisis completo de presupuesto personal:
 * - Regla 50/30/20
 * - Score de salud financiera (0-100)
 * - Capacidad de ahorro
 * - Estado del fondo de emergencia
 * - Ratio deuda/ingreso
 * - Recomendaciones priorizadas
 */

import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateNumericRange, validateArrayLength } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError, validationError } from '../error';

const ExpenseRow = z.object({
  category: z.string(),
  amount:   z.number().min(0),
  type:     z.enum(['needs', 'wants', 'savings', 'debt']).optional(),
});

export const budgetAnalyzerTool: MCPTool = {
  name: 'finance.budget_analyzer',
  description:
    'Analiza el presupuesto mensual de una persona: regla 50/30/20, score de salud financiera, ratio deuda/ingreso, fondo de emergencia y recomendaciones priorizadas.',
  argsSchema: z.object({
    monthlyIncome:          z.number().positive(),
    expenses:               z.array(ExpenseRow).optional(),
    totalFixedExpenses:     z.number().min(0).optional(),   // alternativa a expenses[]
    totalVariableExpenses:  z.number().min(0).optional(),
    totalDebtPayments:      z.number().min(0).optional(),   // cuotas de deuda mensuales
    currentSavings:         z.number().min(0).optional(),   // ahorro mensual actual
    emergencyFund:          z.number().min(0).optional(),   // saldo fondo de emergencia
    hasPension:             z.boolean().optional(),          // cotiza AFP/APV
    dependents:             z.number().int().min(0).optional(), // personas a cargo
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.budget_analyzer');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.budget_analyzer', ctx);

      // 2. Input validation
      validateNumericRange(Number(args.monthlyIncome), 1, 100000000, 'monthlyIncome', 'finance.budget_analyzer');

      if (args.expenses && Array.isArray(args.expenses)) {
        validateArrayLength(args.expenses, 0, 100, 'expenses', 'finance.budget_analyzer');
      }

      if (args.totalFixedExpenses !== undefined) {
        validateNumericRange(Number(args.totalFixedExpenses), 0, 100000000, 'totalFixedExpenses', 'finance.budget_analyzer');
      }

      if (args.totalVariableExpenses !== undefined) {
        validateNumericRange(Number(args.totalVariableExpenses), 0, 100000000, 'totalVariableExpenses', 'finance.budget_analyzer');
      }

      if (args.totalDebtPayments !== undefined) {
        validateNumericRange(Number(args.totalDebtPayments), 0, 100000000, 'totalDebtPayments', 'finance.budget_analyzer');
      }

      if (args.currentSavings !== undefined) {
        validateNumericRange(Number(args.currentSavings), 0, 100000000, 'currentSavings', 'finance.budget_analyzer');
      }

      if (args.emergencyFund !== undefined) {
        validateNumericRange(Number(args.emergencyFund), 0, 100000000, 'emergencyFund', 'finance.budget_analyzer');
      }

      if (args.dependents !== undefined) {
        validateNumericRange(Number(args.dependents), 0, 50, 'dependents', 'finance.budget_analyzer');
      }

      const income   = Number(args.monthlyIncome);
    const deps     = Number(args.dependents ?? 0);

    // ── Calcular totales desde el array o desde los campos directos ─
    let needsTotal     = Number(args.totalFixedExpenses    ?? 0);
    let wantsTotal     = Number(args.totalVariableExpenses ?? 0);
    let debtTotal      = Number(args.totalDebtPayments     ?? 0);
    let savingsActual  = Number(args.currentSavings        ?? 0);

    if (Array.isArray(args.expenses) && args.expenses.length > 0) {
      needsTotal    = 0; wantsTotal = 0; debtTotal = 0; savingsActual = 0;
      for (const exp of args.expenses) {
        const amt = Number(exp.amount);
        const t   = exp.type;
        if (t === 'needs'    || !t) needsTotal    += amt;
        if (t === 'wants')          wantsTotal    += amt;
        if (t === 'debt')           debtTotal     += amt;
        if (t === 'savings')        savingsActual += amt;
      }
      // Si no se clasificó, todo va a needs
    }

    const totalExpenses   = needsTotal + wantsTotal + debtTotal;
    const balance         = income - totalExpenses - savingsActual;
    const savingsCapacity = Math.max(0, balance); // cuánto más podría ahorrar

    // ── Ratios reales ───────────────────────────────────────────────
    const savingsRate      = income > 0 ? (savingsActual / income) * 100 : 0;
    const debtToIncome     = income > 0 ? (debtTotal / income) * 100 : 0;
    const needsToIncome    = income > 0 ? (needsTotal / income) * 100 : 0;
    const wantsToIncome    = income > 0 ? (wantsTotal / income) * 100 : 0;
    const expensesRatio    = income > 0 ? (totalExpenses / income) * 100 : 0;

    // ── Regla 50/30/20 (adaptada a Chile con deuda) ─────────────────
    const target50 = income * 0.50;
    const target30 = income * 0.30;
    const target20 = income * 0.20;

    const rule5030Gap  = needsTotal - target50;  // positivo = exceso en needs
    const rule30Gap    = wantsTotal - target30;
    const rule20Gap    = (target20) - (savingsActual + savingsCapacity); // positivo = déficit ahorro

    // ── Fondo de emergencia ─────────────────────────────────────────
    const targetEmergencyMonths  = deps > 0 ? 6 : 3;
    const targetEmergencyAmount  = totalExpenses * targetEmergencyMonths;
    const emergencyFund          = Number(args.emergencyFund ?? 0);
    const emergencyCoverage      = targetEmergencyAmount > 0
      ? Number(((emergencyFund / targetEmergencyAmount) * 100).toFixed(1))
      : 100;
    const emergencyMonthsCovered = totalExpenses > 0
      ? Number((emergencyFund / totalExpenses).toFixed(1))
      : 0;

    // ── Score de salud financiera (0-100) ───────────────────────────
    let score = 100;

    // Penalización por ratio deuda/ingreso (bancaria: >35% = alerta)
    if (debtToIncome > 50) score -= 25;
    else if (debtToIncome > 35) score -= 15;
    else if (debtToIncome > 20) score -= 7;

    // Penalización por tasa de ahorro baja
    if (savingsRate < 5)  score -= 20;
    else if (savingsRate < 10) score -= 10;
    else if (savingsRate < 20) score -= 5;

    // Bonus por buena tasa de ahorro
    if (savingsRate >= 20) score += 5;

    // Penalización por gastos fijos altos
    if (needsToIncome > 65) score -= 15;
    else if (needsToIncome > 55) score -= 8;

    // Penalización por fondo de emergencia insuficiente
    if (emergencyCoverage < 25)       score -= 15;
    else if (emergencyCoverage < 50)  score -= 8;
    else if (emergencyCoverage < 100) score -= 3;

    // Penalización por balance negativo
    if (balance < 0) score -= 20;

    // Sin AFP/APV
    if (args.hasPension === false) score -= 10;

    // Dependientes ajustan expectativas
    if (deps > 0) score = Math.min(score + 5, 100);

    score = Math.max(0, Math.min(100, Math.round(score)));

    // ── Nivel de salud ──────────────────────────────────────────────
    const healthLevel =
      score >= 80 ? 'excelente' :
      score >= 60 ? 'buena'     :
      score >= 40 ? 'ajustada'  :
                    'crítica';

    // ── Recomendaciones priorizadas ─────────────────────────────────
    const recommendations: Array<{ priority: number; action: string; impact: string }> = [];

    if (balance < 0) {
      recommendations.push({
        priority: 1,
        action: 'Reducir gastos variables: tu presupuesto está en déficit mensual.',
        impact: `Necesitas liberar $${Math.abs(Math.round(balance)).toLocaleString('es-CL')} mensuales o aumentar ingresos.`,
      });
    }

    if (debtToIncome > 35) {
      recommendations.push({
        priority: 2,
        action: 'Atender la deuda: tu ratio deuda/ingreso supera el umbral bancario del 35%.',
        impact: `Estás en ${debtToIncome.toFixed(1)}% — esto limita acceso a nuevos créditos hipotecarios.`,
      });
    }

    if (emergencyCoverage < 50) {
      recommendations.push({
        priority: 3,
        action: `Construir fondo de emergencia: meta ${targetEmergencyMonths} meses de gastos.`,
        impact: `Te faltan $${Math.round(Math.max(0, targetEmergencyAmount - emergencyFund)).toLocaleString('es-CL')} para alcanzar la meta mínima.`,
      });
    }

    if (savingsRate < 10 && balance > 0) {
      recommendations.push({
        priority: 4,
        action: 'Aumentar tasa de ahorro al 10-20% mediante débito automático.',
        impact: `Ahorrando $${Math.round(income * 0.10).toLocaleString('es-CL')}/mes, en 5 años acumulas +$${Math.round(income * 0.10 * 60).toLocaleString('es-CL')}.`,
      });
    }

    if (args.hasPension === false) {
      recommendations.push({
        priority: 5,
        action: 'Abrir APV: el beneficio tributario puede equivaler a un sueldo extra al año.',
        impact: 'Con Régimen A obtienes el 15% de lo aportado como crédito contra impuesto.',
      });
    }

    if (wantsToIncome > 35) {
      recommendations.push({
        priority: 6,
        action: 'Revisar gastos discrecionales: superan el 30% recomendado.',
        impact: `Ajustar $${Math.round(wantsTotal - target30).toLocaleString('es-CL')}/mes libera capacidad de ahorro inmediata.`,
      });
    }

    recommendations.sort((a, b) => a.priority - b.priority);

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

    const summary = {
      income: Math.round(income),
      total_expenses: Math.round(totalExpenses),
      savings_actual: Math.round(savingsActual),
      balance: Math.round(balance),
      savings_capacity: Math.round(savingsCapacity),

      // Ratios
      savings_rate_pct:   Number(savingsRate.toFixed(1)),
      debt_to_income_pct: Number(debtToIncome.toFixed(1)),
      needs_pct:          Number(needsToIncome.toFixed(1)),
      wants_pct:          Number(wantsToIncome.toFixed(1)),
      expenses_ratio_pct: Number(expensesRatio.toFixed(1)),

      // 50/30/20
      rule_50_30_20: {
        needs_actual: Math.round(needsTotal), needs_target: Math.round(target50),
        wants_actual: Math.round(wantsTotal), wants_target: Math.round(target30),
        savings_target: Math.round(target20), savings_actual: Math.round(savingsActual + savingsCapacity),
        needs_excess:   Math.round(Math.max(0, rule5030Gap)),
        wants_excess:   Math.round(Math.max(0, rule30Gap)),
        savings_gap:    Math.round(Math.max(0, rule20Gap)),
      },

      // Fondo de emergencia
      emergency_fund: {
        current:          Math.round(emergencyFund),
        target:           Math.round(targetEmergencyAmount),
        coverage_pct:     emergencyCoverage,
        months_covered:   emergencyMonthsCovered,
        target_months:    targetEmergencyMonths,
        status:           emergencyCoverage >= 100 ? 'completo'
                        : emergencyCoverage >= 50  ? 'en construcción'
                        : 'insuficiente',
      },

      // Score
      health_score:  score,
      health_level:  healthLevel,

      recommendations: recommendations.slice(0, 5),
    };

      return {
        tool_call: {
          tool: 'finance.budget_analyzer',
          args,
          status: 'success',
          result: {
            health_score:  score,
            health_level:  healthLevel,
            savings_rate:  Number(savingsRate.toFixed(1)),
            debt_ratio:    Number(debtToIncome.toFixed(1)),
            balance:       Math.round(balance),
          },
        },
        data: { summary },
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.budget_analyzer');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
