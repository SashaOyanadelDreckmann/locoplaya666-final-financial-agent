/**
 * finance.debt_analyzer
 *
 * Análisis completo de deudas: amortización, costo total, efecto del prepago.
 * Soporta crédito hipotecario, consumo, auto, CAE.
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

function roundCLP(n: number) {
  return Math.round(n);
}

function calcMonthlyPayment(principal: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
}

export const debtAnalyzerTool: MCPTool = {
  name: 'finance.debt_analyzer',
  description:
    'Analiza una deuda o crédito: tabla de amortización, interés total, CAE implícito, y el efecto de pagar más mensualmente (prepago).',
  argsSchema: z.object({
    principal:       z.number().positive(),               // monto del crédito
    annualRate:      z.number().positive(),               // tasa anual (ej: 14 o 0.14)
    months:          z.number().int().positive(),          // plazo en meses
    extraMonthly:    z.number().min(0).optional(),         // abono extra mensual
    alreadyPaid:     z.number().int().min(0).optional(),   // cuotas ya pagadas
    type:            z.enum(['consumo','hipotecario','auto','cae','otro']).optional(),
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.debt_analyzer');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.debt_analyzer', ctx);

      // 2. Input validation
      validateNumericRange(Number(args.principal), 1, 100000000, 'principal', 'finance.debt_analyzer');
      validateNumericRange(Number(args.annualRate), 0.1, 100, 'annualRate', 'finance.debt_analyzer');
      validateNumericRange(Number(args.months), 1, 1200, 'months', 'finance.debt_analyzer');

      if (args.extraMonthly !== undefined) {
        validateNumericRange(Number(args.extraMonthly), 0, 100000, 'extraMonthly', 'finance.debt_analyzer');
      }

      const principal    = Number(args.principal);
      const annualRate   = normRate(Number(args.annualRate));
      const totalMonths  = Math.max(1, Math.floor(Number(args.months)));
    const extra        = Number(args.extraMonthly ?? 0);
    const paid         = Math.max(0, Math.floor(Number(args.alreadyPaid ?? 0)));
    const type         = args.type ?? 'consumo';

    const monthlyRate  = annualRate / 12;
    const basePayment  = roundCLP(calcMonthlyPayment(principal, monthlyRate, totalMonths));

    // ── Amortización base ──────────────────────────────────────────
    let balance = principal;
    let totalInterestBase = 0;
    const schedule: Array<{
      month: number;
      payment: number;
      principal: number;
      interest: number;
      balance: number;
    }> = [];

    for (let m = 1; m <= totalMonths; m++) {
      const interestAmt  = balance * monthlyRate;
      const principalAmt = basePayment - interestAmt;
      balance            = Math.max(0, balance - principalAmt);
      totalInterestBase += interestAmt;

      schedule.push({
        month:     m,
        payment:   roundCLP(basePayment),
        principal: roundCLP(principalAmt),
        interest:  roundCLP(interestAmt),
        balance:   roundCLP(balance),
      });
    }

    // ── Amortización con prepago ────────────────────────────────────
    let balanceExtra    = principal;
    let totalInterestExtra = 0;
    let monthsWithExtra = 0;

    if (extra > 0) {
      for (let m = 1; m <= totalMonths; m++) {
        const interestAmt  = balanceExtra * monthlyRate;
        const principalAmt = basePayment + extra - interestAmt;
        balanceExtra       = Math.max(0, balanceExtra - principalAmt);
        totalInterestExtra += interestAmt;
        monthsWithExtra++;
        if (balanceExtra <= 0) break;
      }
    }

    // ── Resumen para cuotas ya pagadas ──────────────────────────────
    const remainingSchedule = schedule.slice(paid);
    const currentBalance    = paid > 0 ? (schedule[paid - 1]?.balance ?? principal) : principal;
    const remainingMonths   = totalMonths - paid;
    const remainingInterest = remainingSchedule.reduce((s, r) => s + r.interest, 0);

    // ── CAE implícito (TEA efectiva anual) ──────────────────────────
    // Usando iteración de Newton para resolver la TIR mensual
    let r = annualRate / 12;
    for (let iter = 0; iter < 60; iter++) {
      const pv = basePayment * (1 - Math.pow(1 + r, -totalMonths)) / r;
      const f  = pv - principal;
      const df = basePayment * (
        (totalMonths * Math.pow(1 + r, -(totalMonths + 1))) / r
        - (1 - Math.pow(1 + r, -totalMonths)) / (r * r)
      );
      const delta = f / df;
      r -= delta;
      if (Math.abs(delta) < 1e-10) break;
    }
    const caeImplicit = Number((Math.pow(1 + r, 12) - 1).toFixed(6));

    const savingsWithExtra = extra > 0
      ? roundCLP(totalInterestBase - totalInterestExtra)
      : 0;
    const monthsSaved = extra > 0 ? totalMonths - monthsWithExtra : 0;

    // Tabla de amortización: enviamos solo puntos clave (inicio, cuotas 12,24,48 y fin)
    const keyMonths = new Set([1, 6, 12, 24, 36, 48, 60, Math.floor(totalMonths / 2), totalMonths]);
    const keySchedule = schedule.filter((r) => keyMonths.has(r.month));

    const summary = {
      type,
      principal:            roundCLP(principal),
      monthly_payment:      basePayment,
      total_months:         totalMonths,
      remaining_months:     remainingMonths,
      current_balance:      roundCLP(currentBalance),
      total_paid:           roundCLP(basePayment * totalMonths),
      total_interest:       roundCLP(totalInterestBase),
      interest_ratio_pct:   Number(((totalInterestBase / principal) * 100).toFixed(1)),
        cae_implicit_pct:     Number((caeImplicit * 100).toFixed(2)),
        remaining_interest:   roundCLP(remainingInterest),

        // Con prepago
        extra_monthly:        extra > 0 ? roundCLP(extra) : undefined,
        months_saved:         extra > 0 ? monthsSaved : undefined,
        interest_saved:       extra > 0 ? savingsWithExtra : undefined,
        new_total_months:     extra > 0 ? monthsWithExtra : undefined,
      };

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'finance.debt_analyzer',
          args,
          status: 'success',
          result: summary,
        },
        data: {
          summary,
          schedule: keySchedule,
          full_schedule_length: schedule.length,
        },
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.debt_analyzer');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
