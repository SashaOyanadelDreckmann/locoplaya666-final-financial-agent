/**
 * coherence.test.ts
 *
 * PHASE 9: Coherence Validation Test Suite
 * Tests for context-awareness, user profile alignment, and decision coherence
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgentDecision, FullUserContext } from './coherence-validator';
import { validateRecommendation } from '../../services/panel-state.service';

describe('Coherence Validation', () => {
  const mockProfile = {
    version: 'v2' as const,
    meta: {
      completeness: 0.9,
      blocksExplored: [],
      blocksSkipped: [],
      completedAt: new Date().toISOString(),
    },
    blocks: {},
    diagnosticNarrative: 'Test profile',
    profile: {
      financialClarity: 'high' as const,
      decisionStyle: 'analytical' as const,
      timeHorizon: 'long_term' as const,
      financialPressure: 'low' as const,
      emotionalPattern: 'neutral' as const,
      coherenceScore: 0.85,
    },
    tensions: [],
    hypotheses: [],
    openQuestions: [],
  };

  const mockIntake = {
    employmentStatus: 'employed' as const,
    incomeBand: '>4M' as const,
    exactMonthlyIncome: 3500000,
    expensesCoverage: 'surplus' as const,
    tracksExpenses: 'yes' as const,
    hasSavingsOrInvestments: true,
    exactSavingsAmount: 15000000,
    hasDebt: false,
    financialProducts: [],
    financialKnowledge: {
      interest: true,
      CAE: true,
      inflation: true,
      creditCard: true,
      creditLine: true,
      loanComponents: true,
      interestRate: true,
      liquidity: true,
      returnConcept: true,
      diversification: true,
      assetVsLiability: true,
      financialRisk: true,
      capitalMarkets: true,
      alternativeInvestments: true,
      fintech: true,
    },
    riskReaction: 'buy_more' as const,
    selfRatedUnderstanding: 8,
    moneyStressLevel: 2,
  };

  const mockBudget = {
    income: 3500000,
    expenses: 2100000,
    balance: 1400000,
    savings_rate: 0.4,
    debt_to_income_pct: 0,
    emergency_fund_months: 6,
  };

  const mockContext: FullUserContext = {
    profile: mockProfile,
    intake: mockIntake,
    budget: mockBudget,
    history: [],
  };

  describe('Income Proportionality', () => {
    it('should accept recommendation as 14% of income', async () => {
      const decision = 'Ahorrar $500,000 mensual en fondos mutuales';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.isCoherent).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.warnings.length).toBe(0);
    });

    it('should warn on recommendation > 50% of income', async () => {
      const decision = 'Invertir $1,800,000 mensual en startups';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('high'))).toBe(true);
      expect(result.score).toBeLessThan(0.8);
    });

    it('should block recommendation > 100% of income', async () => {
      const decision = 'Ahorrar $5,000,000 mensual para retiro';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('exceeds'))).toBe(true);
      expect(result.score).toBeLessThan(0.6);
    });
  });

  describe('Risk Tolerance Alignment', () => {
    it('should accept growth recommendation for risk-tolerant user', async () => {
      const decision = 'Invertir en fondos accionarios con rentabilidad esperada del 8%';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.isCoherent).toBe(true);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should warn when recommending aggressive strategy to risk-averse user', async () => {
      const riskAverseContext: FullUserContext = {
        ...mockContext,
        intake: { ...mockIntake, riskReaction: 'sell' as const },
      };

      const decision = 'Invertir en opciones de compra con leverage 5x';
      const result = validateAgentDecision(decision, riskAverseContext);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.7);
    });

    it('should warn when recommending conservative to risk-tolerant user', async () => {
      const decision = 'Mantener 100% del portafolio en fondos de renta fija';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('conservative'))).toBe(true);
      expect(result.score).toBeLessThan(0.8);
    });
  });

  describe('Financial Knowledge Alignment', () => {
    it('should accept complex recommendations for knowledgeable user', async () => {
      const decision = 'Estructurar portfolio con hedge usando futuros de UF';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings.filter((w) => w.toLowerCase().includes('complex'))).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should warn on complex strategy for novice user', async () => {
      const noviceContext: FullUserContext = {
        ...mockContext,
        intake: { ...mockIntake, selfRatedUnderstanding: 2 },
      };

      const decision = 'Usar collar strategy en opciones de índice bursátil';
      const result = validateAgentDecision(decision, noviceContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('complex'))).toBe(true);
      expect(result.score).toBeLessThan(0.7);
    });
  });

  describe('Debt Situation Alignment', () => {
    it('should accept aggressive investing with no debt and good cash position', async () => {
      const decision = 'Invertir 30% del patrimonio en fondos de crecimiento';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings.filter((w) => w.toLowerCase().includes('debt'))).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should warn on investing recommendation when debt > 30% of income', async () => {
      const debtContext: FullUserContext = {
        ...mockContext,
        budget: { ...mockBudget, debt_to_income_pct: 35 },
      };

      const decision = 'Invertir $500,000 en crypto growth funds';
      const result = validateAgentDecision(decision, debtContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('debt'))).toBe(true);
      expect(result.score).toBeLessThan(0.8);
    });

    it('should block aggressive recommendations with debt > 50% of income', async () => {
      const highDebtContext: FullUserContext = {
        ...mockContext,
        budget: { ...mockBudget, debt_to_income_pct: 60 },
      };

      const decision = 'Invertir en startups de alto riesgo';
      const result = validateAgentDecision(decision, highDebtContext);

      expect(result.isCoherent).toBe(false);
      expect(result.score).toBeLessThan(0.6);
    });
  });

  describe('Emergency Fund Alignment', () => {
    it('should support aggressive investing with 6+ months emergency fund', async () => {
      const decision = 'Asignar 40% del balance a crecimiento de largo plazo';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should warn on aggressive investing with < 1 month emergency fund', async () => {
      const lowEmergencyContext: FullUserContext = {
        ...mockContext,
        budget: { ...mockBudget, emergency_fund_months: 0.5 },
      };

      const decision = 'Invertir $1,000,000 en fondos accionarios';
      const result = validateAgentDecision(decision, lowEmergencyContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('emergency'))).toBe(true);
      expect(result.score).toBeLessThan(0.7);
    });

    it('should block any investing recommendation with no emergency fund', async () => {
      const noEmergencyContext: FullUserContext = {
        ...mockContext,
        budget: { ...mockBudget, emergency_fund_months: 0 },
      };

      const decision = 'Invertir toda la liquidez en growth portfolio';
      const result = validateAgentDecision(decision, noEmergencyContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('no emergency'))).toBe(true);
      expect(result.isCoherent).toBe(false);
    });
  });

  describe('Time Horizon Alignment', () => {
    it('should accept long-term recommendations for long-term user', async () => {
      const decision = 'Fondo de retiro a 30 años con crecimiento compuesto';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.warnings).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should warn on long-term strategy for short-term user', async () => {
      const shortTermContext: FullUserContext = {
        ...mockContext,
        profile: {
          ...mockProfile,
          profile: { ...mockProfile.profile, timeHorizon: 'short_term' as const },
        },
      };

      const decision = 'Comprometerse con aporte a 20 años para retiro';
      const result = validateAgentDecision(decision, shortTermContext);

      expect(result.warnings.some((w) => w.toLowerCase().includes('horizon'))).toBe(true);
      expect(result.score).toBeLessThan(0.8);
    });
  });

  describe('Panel State Validation', () => {
    it('should validate realistic emergency fund recommendation', async () => {
      const result = validateRecommendation(
        'Aumentar fondo de emergencia a $630,000 (3 meses de gastos)',
        mockProfile,
        mockBudget,
        mockIntake
      );

      expect(result.valid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should warn on unrealistic emergency fund', async () => {
      const result = validateRecommendation(
        'Ahorrar $35,000,000 para fondo de emergencia (16 meses de gastos)',
        mockProfile,
        mockBudget,
        mockIntake
      );

      expect(result.valid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('History Consistency', () => {
    it('should detect contradiction between recent history and new decision', async () => {
      const contextWithHistory: FullUserContext = {
        ...mockContext,
        history: [
          { role: 'assistant', content: 'Te recomiendo mantener un enfoque conservador' },
          { role: 'user', content: 'Correcto, prefiero algo seguro' },
        ],
      };

      const decision = 'Invertir todo en startups de alto riesgo';
      const result = validateAgentDecision(decision, contextWithHistory);

      expect(result.warnings.some((w) => w.toLowerCase().includes('contradiction'))).toBe(true);
      expect(result.score).toBeLessThan(0.8);
    });
  });

  describe('Edge Cases', () => {
    it('should handle context with no profile gracefully', async () => {
      const noProfileContext: FullUserContext = {
        profile: null,
        intake: mockIntake,
        budget: mockBudget,
        history: [],
      };

      const decision = 'Invertir $500,000 en APV';
      const result = validateAgentDecision(decision, noProfileContext);

      expect(result.isCoherent).toBe(true); // Fallback to true
      expect(result.score).toBeLessThan(0.9); // But with lower confidence
    });

    it('should handle decision with no explicit amount', async () => {
      const decision = 'Diversificar tu portafolio entre acciones e inmuebles';
      const result = validateAgentDecision(decision, mockContext);

      expect(result.isCoherent).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should format validation message correctly', async () => {
      const result = validateAgentDecision(
        'Invertir $500,000 en opciones derivadas sin experiencia',
        {
          ...mockContext,
          intake: { ...mockIntake, selfRatedUnderstanding: 1, riskReaction: 'sell' as const },
        }
      );

      expect(result.isCoherent).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
