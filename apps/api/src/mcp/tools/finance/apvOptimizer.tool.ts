/**
 * finance.apv_optimizer
 *
 * Optimizador de APV para Chile.
 * Compara Régimen A (crédito tributario 15%) vs Régimen B (exención de impuesto).
 * Proyecta el ahorro real acumulado a largo plazo, considerando beneficio fiscal.
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

// Tramos impuesto segunda categoría Chile 2025-2026 (mensual en UTM ≈ CLP 70.000)
// Usamos CLP directamente con los tramos en CLP/año como referencia
const TRAMOS_GLOBAL_COMPLEMENTARIO = [
  { limitAnual: 9_744_000,  rate: 0.000 },  // exento
  { limitAnual: 21_636_000, rate: 0.040 },
  { limitAnual: 36_000_000, rate: 0.080 },
  { limitAnual: 54_000_000, rate: 0.135 },
  { limitAnual: 72_000_000, rate: 0.230 },
  { limitAnual: 90_000_000, rate: 0.304 },
  { limitAnual: Infinity,   rate: 0.350 },
];

function marginalTaxRate(annualIncome: number): number {
  let prevLimit = 0;
  let marginal  = 0;
  for (const tramo of TRAMOS_GLOBAL_COMPLEMENTARIO) {
    if (annualIncome > prevLimit) {
      marginal = tramo.rate;
    }
    if (annualIncome <= tramo.limitAnual) break;
    prevLimit = tramo.limitAnual;
  }
  return marginal;
}

function effectiveTaxRate(annualIncome: number): number {
  let tax      = 0;
  let prevLimit = 0;
  for (const tramo of TRAMOS_GLOBAL_COMPLEMENTARIO) {
    const cap    = Math.min(annualIncome, tramo.limitAnual);
    tax         += Math.max(0, cap - prevLimit) * tramo.rate;
    prevLimit    = tramo.limitAnual;
    if (annualIncome <= tramo.limitAnual) break;
  }
  return annualIncome > 0 ? tax / annualIncome : 0;
}

export const apvOptimizerTool: MCPTool = {
  name: 'finance.apv_optimizer',
  description:
    'Compara APV Régimen A vs Régimen B para un trabajador chileno. Calcula ahorro tributario anual, proyección a largo plazo y el régimen óptimo según el nivel de ingresos.',
  argsSchema: z.object({
    monthlyIncome:       z.number().positive(),            // renta bruta mensual en CLP
    monthlyContribution: z.number().positive(),            // cuánto quiere aportar mensual al APV
    years:               z.number().int().min(1).max(40),  // horizonte de inversión
    annualReturnRate:    z.number().optional(),             // rendimiento anual esperado (ej: 5 o 0.05)
    currentApvBalance:   z.number().min(0).optional(),     // saldo APV actual
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.apv_optimizer');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.apv_optimizer', ctx);

      // 2. Input validation
      validateNumericRange(Number(args.monthlyIncome), 500000, 100000000, 'monthlyIncome', 'finance.apv_optimizer');
      validateNumericRange(Number(args.monthlyContribution), 10000, 5000000, 'monthlyContribution', 'finance.apv_optimizer');
      validateNumericRange(Number(args.years), 1, 40, 'years', 'finance.apv_optimizer');

      if (args.currentApvBalance !== undefined) {
        validateNumericRange(Number(args.currentApvBalance), 0, 100000000, 'currentApvBalance', 'finance.apv_optimizer');
      }

      const monthlyIncome   = Number(args.monthlyIncome);
      const monthlyContrib  = Number(args.monthlyContribution);
      const years           = Math.max(1, Math.min(40, Math.floor(Number(args.years))));
    const annualReturn    = normRate(Number(args.annualReturnRate ?? 5.5));
    const currentBalance  = Number(args.currentApvBalance ?? 0);

    const annualIncome    = monthlyIncome * 12;
    const annualContrib   = monthlyContrib * 12;
    const months          = years * 12;
    const monthlyReturn   = annualReturn / 12;

    // ── Tasa marginal e impuesto sin APV ───────────────────────────
    const marginalRate    = marginalTaxRate(annualIncome);
    const effectiveRate   = effectiveTaxRate(annualIncome);

    // ── RÉGIMEN A: Crédito tributario 15% del aporte ──────────────
    // Límite: 600 UF anuales aprox ≈ $20.800.000 CLP (2026)
    const REGIME_A_CAP_ANNUAL = 20_800_000;
    const effectiveContribA   = Math.min(annualContrib, REGIME_A_CAP_ANNUAL);
    const taxCreditA          = effectiveContribA * 0.15;                // crédito fiscal anual
    const monthlyTaxCreditA   = taxCreditA / 12;

    // Proyección A: aporte + crédito reinvertido
    let balanceA = currentBalance;
    const seriesA: Array<{ year: number; balance: number; contributions: number; taxBenefit: number }> = [];
    let totalTaxBenefitA = 0;
    for (let m = 1; m <= months; m++) {
      balanceA = balanceA * (1 + monthlyReturn) + monthlyContrib + monthlyTaxCreditA;
      totalTaxBenefitA += monthlyTaxCreditA;
      if (m % 12 === 0) {
        const y = m / 12;
        seriesA.push({
          year: y,
          balance: Math.round(balanceA),
          contributions: Math.round(currentBalance + monthlyContrib * m),
          taxBenefit: Math.round(totalTaxBenefitA),
        });
      }
    }

    // ── RÉGIMEN B: Exención de impuesto sobre el aporte ────────────
    // El aporte se deduce de la base imponible mensual → ahorro = marginalRate * aporte
    // Límite: 600 UF anuales aprox
    const taxSavingBPerYear = Math.min(annualContrib, REGIME_A_CAP_ANNUAL) * marginalRate;
    const monthlySavingB    = taxSavingBPerYear / 12;

    let balanceB = currentBalance;
    const seriesB: Array<{ year: number; balance: number; contributions: number; taxBenefit: number }> = [];
    let totalTaxBenefitB = 0;
    for (let m = 1; m <= months; m++) {
      balanceB = balanceB * (1 + monthlyReturn) + monthlyContrib;
      totalTaxBenefitB += monthlySavingB;
      if (m % 12 === 0) {
        const y = m / 12;
        seriesB.push({
          year: y,
          balance: Math.round(balanceB),
          contributions: Math.round(currentBalance + monthlyContrib * m),
          taxBenefit: Math.round(totalTaxBenefitB),
        });
      }
    }

    // ── Sin APV (base) ─────────────────────────────────────────────
    // El mismo dinero invertido sin beneficio tributario
    let balanceNoApv = currentBalance;
    const seriesBase: Array<{ year: number; balance: number }> = [];
    for (let m = 1; m <= months; m++) {
      balanceNoApv = balanceNoApv * (1 + monthlyReturn) + monthlyContrib;
      if (m % 12 === 0) {
        seriesBase.push({ year: m / 12, balance: Math.round(balanceNoApv) });
      }
    }

    const finalA     = seriesA[seriesA.length - 1]?.balance ?? 0;
    const finalB     = seriesB[seriesB.length - 1]?.balance ?? 0;
    const finalBase  = seriesBase[seriesBase.length - 1]?.balance ?? 0;

    // ── Recomendación ──────────────────────────────────────────────
    let recommended: 'A' | 'B' | 'ambos';
    let recommendation_reason: string;

    if (marginalRate < 0.08) {
      // Tramo exento o muy bajo → Régimen A siempre conviene más
      recommended = 'A';
      recommendation_reason =
        'Con tu nivel de ingresos la tasa marginal es baja. Régimen A entrega un crédito fijo del 15% que supera tu ahorro tributario en Régimen B.';
    } else if (marginalRate >= 0.304) {
      // Tasa alta → Régimen B entrega más ahorro fiscal
      recommended = 'B';
      recommendation_reason =
        `Con tasa marginal de ${(marginalRate * 100).toFixed(0)}%, Régimen B te ahorra más impuesto que el crédito fijo del 15% de Régimen A.`;
    } else {
      recommended = finalA >= finalB ? 'A' : 'B';
      recommendation_reason = finalA >= finalB
        ? `Para tu nivel de ingresos, Régimen A proyecta un saldo final superior al cabo de ${years} años.`
        : `Para tu nivel de ingresos, Régimen B proyecta un saldo final superior al cabo de ${years} años.`;
    }

      // Si la diferencia es pequeña, sugiere combinar
      if (Math.abs(finalA - finalB) / Math.max(finalA, finalB) < 0.05) {
        recommended = 'ambos';
        recommendation_reason =
          'Ambos regímenes proyectan resultados similares. Puedes diversificar: Régimen A para el primer tramo (hasta 600 UF) y Régimen B para el resto.';
      }

      // Puntos clave del resultado (para charts/tablas)
      const keyYears = [1, 3, 5, 10, 15, 20, years].filter(
        (y, i, arr) => y <= years && arr.indexOf(y) === i
      );
      const chartSeries = keyYears.map((y) => ({
        year: y,
        regimen_a:    seriesA.find((s) => s.year === y)?.balance ?? finalA,
        regimen_b:    seriesB.find((s) => s.year === y)?.balance ?? finalB,
        sin_apv:      seriesBase.find((s) => s.year === y)?.balance ?? finalBase,
      }));

      const summary = {
        // Perfil tributario
        annual_income:          Math.round(annualIncome),
        marginal_rate_pct:      Number((marginalRate * 100).toFixed(1)),
        effective_rate_pct:     Number((effectiveRate * 100).toFixed(1)),

        // APV
        monthly_contribution:   Math.round(monthlyContrib),
        annual_contribution:    Math.round(annualContrib),
        years,

        // Régimen A
        regime_a_annual_credit: Math.round(taxCreditA),
        regime_a_monthly_credit: Math.round(monthlyTaxCreditA),
        regime_a_final_balance:  finalA,
        regime_a_total_tax_benefit: Math.round(totalTaxBenefitA),

        // Régimen B
        regime_b_annual_saving: Math.round(taxSavingBPerYear),
        regime_b_monthly_saving: Math.round(monthlySavingB),
        regime_b_final_balance:  finalB,
        regime_b_total_tax_benefit: Math.round(totalTaxBenefitB),

        // Sin APV
        no_apv_final_balance: finalBase,
        apv_total_advantage:  Math.round(Math.max(finalA, finalB) - finalBase),

        // Recomendación
        recommended,
        recommendation_reason,

        // Datos para gráfico
        chart_series: chartSeries,
      };

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'finance.apv_optimizer',
          args,
          status: 'success',
          result: {
            recommended,
            regime_a_final: finalA,
            regime_b_final: finalB,
            no_apv_final:   finalBase,
            advantage:      summary.apv_total_advantage,
          },
        },
        data: { summary, chart_series: chartSeries },
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.apv_optimizer');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
