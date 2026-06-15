/** @jest-environment node */

import {
  buildChatIntroContent,
  buildDiagnosisDeepenIntroContent,
  isLegacyChatIntroItem,
  repairChatIntroItems,
  resolveDiagnosisContext,
  shouldSeedChatIntroMessage,
} from '../flujo/chat-intro.shared';
import type { ChatItem } from '@/lib/agente/agent.response.types';

const legacyChat2Item = (): ChatItem => ({
  type: 'message',
  role: 'assistant',
  content:
    'María, abrimos con una lluvia de ideas senior: cruzamos tu entrevista, presupuesto, cartolas y el mercado de hoy.',
  mode: 'information',
});

const sampleDiagnosis = {
  diagnosticNarrative:
    'Tu flujo mensual está apretado y la deuda de consumo compite con el ahorro. Hay margen si se reordena el gasto discrecional.',
  editorial: {
    headline: 'Oxígeno financiero bajo presión',
    dek: 'Priorizar liquidez antes de ampliar riesgo.',
    keySignals: [
      'PRESUPUESTO MENSUAL MUY AJUSTADO, CON GASTOS CASI EQUIVALENTES A LOS INGRESOS.',
      'AHORROS ACUMULADOS SIGNIFICATIVAMENTE SUPERIORES AL FLUJO MENSUAL.',
    ],
  },
  tensions: ['Gasto discrecional vs. colchón de emergencia'],
  hypotheses: ['Reducir costos fijos liberaría caja en 60 días'],
  openQuestions: ['¿Cuál es la naturaleza, monto y condiciones de la deuda reportada?'],
  profile: {
    financialPressure: 'high',
    decisionStyle: 'analytical',
    timeHorizon: 'mixed',
    financialClarity: 'medium',
    emotionalPattern: 'anxious',
  },
};

describe('chat intro shells', () => {
  it('builds a single unified message per chat', () => {
    const session = {
      name: 'María López',
      injectedIntake: {
        intake: { city: 'Santiago', incomeBand: '600k-1M', hasDebt: true },
        __budgetContext: { kpis: { income: 30000, expenses: 27887, healthScore: 61 } },
      },
    };

    const chat1 = buildChatIntroContent({
      chatId: 'chat-1',
      session,
      diagnosisProfile: sampleDiagnosis,
      diagnosisUnlocked: true,
    });

    expect(chat1.title).toBe('Oxígeno financiero bajo presión');
    expect(chat1.message).toContain('María');
    expect(chat1.message.toLowerCase()).not.toContain('presupuesto mensual muy ajustado');
    expect(chat1.signals.some((s) => s.toLowerCase().includes('presupuesto mensual'))).toBe(true);
    expect(chat1.signals).toHaveLength(2);
    expect(chat1.message).toContain('ingreso $30.000');
    expect(chat1.message).not.toMatch(/objetivo de este chat/i);
    expect(chat1).not.toHaveProperty('subtitle');
    expect(chat1.signals.length).toBeGreaterThan(0);
  });

  it('uses diagnosis narrative and editorial signals when available', () => {
    const session = { name: 'María López' };
    const chat2 = buildChatIntroContent({
      chatId: 'chat-2',
      session,
      diagnosisProfile: sampleDiagnosis,
    });

    expect(chat2.title).toBe('Oxígeno financiero bajo presión');
    expect(chat2.message).toContain('plan de acción ejecutivo');
    expect(chat2.message).toContain('Gasto discrecional vs. colchón de emergencia');
  });

  it('resolves diagnosis context from profile and intake summary', () => {
    const context = resolveDiagnosisContext(sampleDiagnosis, {
      injectedIntake: { llmSummary: { summary: 'Perfil con deuda de consumo y poco colchón.' } },
    });

    expect(context.hasDiagnosis).toBe(true);
    expect(context.topTension).toContain('Gasto discrecional');
    expect(context.traitHints).toContain('Presión financiera alta');
  });

  it('detects legacy chat-2 openings', () => {
    expect(isLegacyChatIntroItem(legacyChat2Item(), 'chat-2')).toBe(true);
  });

  it('seeds chat-2 when empty', () => {
    expect(shouldSeedChatIntroMessage('chat-2', [])).toBe(true);
  });

  it('builds a diagnosis deepen confirmation for chat general', () => {
    const intro = buildDiagnosisDeepenIntroContent({
      session: { name: 'María López' },
      diagnosisProfile: sampleDiagnosis,
      voiceFindings: ['La liquidez mensual está muy ajustada'],
    });

    expect(intro.title).toBe('Oxígeno financiero bajo presión');
    expect(intro.message).toContain('ya integré tu diagnóstico completo');
    expect(intro.message).toContain('Confirmo que tengo cargados');
    expect(intro.message).toContain('síntesis de la entrevista');
    expect(intro.message).toContain('Gasto discrecional vs. colchón de emergencia');
  });

  it('restores the Wilde epigraph and philosophical copy for chat-3', () => {
    const chat3 = buildChatIntroContent({
      chatId: 'chat-3',
      session: { name: 'María' },
      diagnosisProfile: sampleDiagnosis,
    });

    expect(chat3.epigraph?.quote).toContain('precio de todo');
    expect(chat3.message).toContain('no es sobre números');
    expect(chat3.message).toContain('decisión moral');
    expect(chat3.message).toMatch(/mundo que quieres vivir|naturaleza, monto y condiciones/i);
  });
});
