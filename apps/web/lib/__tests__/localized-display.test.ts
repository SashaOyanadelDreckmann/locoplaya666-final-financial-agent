/** @jest-environment node */

import { localizeDisplayValue, localizeFieldKey } from '@/lib/display/localized-display';

describe('localizeFieldKey', () => {
  it('traduce claves del perfil financiero', () => {
    expect(localizeFieldKey('financialClarity')).toBe('Claridad financiera');
    expect(localizeFieldKey('decision_style')).toBe('Estilo de decisión');
    expect(localizeFieldKey('coherenceScore')).toBe('Puntaje de coherencia');
  });
});

describe('localizeDisplayValue', () => {
  it('traduce rasgos del diagnóstico', () => {
    expect(localizeDisplayValue('medium', 'financialClarity')).toBe('Media');
    expect(localizeDisplayValue('reactive', 'decisionStyle')).toBe('Reactivo');
    expect(localizeDisplayValue('short_term', 'timeHorizon')).toBe('Corto plazo');
    expect(localizeDisplayValue('moderate', 'financialPressure')).toBe('Moderada');
    expect(localizeDisplayValue('anxious', 'emotionalPattern')).toBe('Ansioso');
  });

  it('respeta el contexto del campo para valores ambiguos', () => {
    expect(localizeDisplayValue('sometimes', 'expensesCoverage')).toBe('A veces no alcanza');
    expect(localizeDisplayValue('sometimes', 'tracksExpenses')).toBe('A veces');
  });

  it('traduce respuestas del intake', () => {
    expect(localizeDisplayValue('employed', 'employmentStatus')).toBe('Dependiente');
    expect(localizeDisplayValue('600k-1M', 'incomeBand')).toBe('$600k – $1M');
    expect(localizeDisplayValue('tight', 'expensesCoverage')).toBe('Llego justo');
    expect(localizeDisplayValue('hold', 'riskReaction')).toBe('Espero');
    expect(localizeDisplayValue('yes', 'tracksExpenses')).toBe('Sí, siempre');
  });

  it('formatea números y booleanos en español', () => {
    expect(localizeDisplayValue(0.48, 'coherenceScore')).toBe('0,48');
    expect(localizeDisplayValue(true)).toBe('Sí');
    expect(localizeDisplayValue(false)).toBe('No');
  });

  it('conserva texto libre sin traducir', () => {
    expect(localizeDisplayValue('Ingeniero civil', 'profession')).toBe('Ingeniero civil');
  });
});
