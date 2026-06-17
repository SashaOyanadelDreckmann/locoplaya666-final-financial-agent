import {
  isNaturalLanguageEquationLine,
  shouldPromoteLineToBlockMath,
} from '../chat/message-renderer.helpers';

describe('message-renderer formula promotion guards', () => {
  it('does not promote chat-2 hypothesis lines with prose equations', () => {
    const h1 =
      'H1: Prioridad = Deuda de Tarjeta + Fondo de Emergencia (antes de invertir) - Por qué importa: pagar tarjeta primero';
    const h3 =
      'H3: Horizonte quincenal = flujo de caja tenso - Por qué importa: si cobras cada 15 días el flujo se tensa';

    expect(isNaturalLanguageEquationLine(h1)).toBe(true);
    expect(isNaturalLanguageEquationLine(h3)).toBe(true);
    expect(shouldPromoteLineToBlockMath(h1)).toBe(false);
    expect(shouldPromoteLineToBlockMath(h3)).toBe(false);
  });

  it('still promotes compact finance equations', () => {
    expect(shouldPromoteLineToBlockMath('VPN = \\sum_{t=0}^{n} \\frac{CF_t}{(1+r)^t}')).toBe(true);
    expect(shouldPromoteLineToBlockMath('ROI = (P_final - P_inicial) / P_inicial')).toBe(true);
    expect(shouldPromoteLineToBlockMath('WACC = r_e * (E/V) + r_d * (D/V) * (1 - T_c)')).toBe(true);
  });

  it('does not promote long explanatory Spanish even with equals signs', () => {
    const line =
      'El presupuesto actual = subestima gastos reales - Por qué importa: si tienes deuda en tarjeta pero el presupuesto muestra $332k disponibles, hay gastos no registrados';
    expect(shouldPromoteLineToBlockMath(line)).toBe(false);
  });
});
