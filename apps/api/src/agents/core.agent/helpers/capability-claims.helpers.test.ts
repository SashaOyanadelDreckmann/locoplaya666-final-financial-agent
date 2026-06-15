import { describe, expect, it } from 'vitest';
import {
  containsFalsePdfAgentClaims,
  sanitizeAgentCapabilityClaims,
  sanitizeSuggestedReplies,
} from './capability-claims.helpers';

describe('capability-claims.helpers', () => {
  it('detects false PDF generation promises', () => {
    expect(
      containsFalsePdfAgentClaims(
        'Simular escenarios y generar informes que puedas descargar.',
      ),
    ).toBe(true);
  });

  it('sanitizes welcome-style PDF bullets', () => {
    const input = `¿Qué podemos hacer juntos?

Simular: proyecciones
Generar informes: PDFs personalizados que se guardan en tu panel`;

    const out = sanitizeAgentCapabilityClaims(input);
    expect(out.toLowerCase()).not.toContain('generar informes');
    expect(out).toContain('Simular');
  });

  it('removes PDF suggestion chips', () => {
    const replies = sanitizeSuggestedReplies([
      'Simular ahorro 5 años',
      'Generar informe PDF',
      'Ver mi presupuesto',
      'Descargar reporte',
    ]);

    expect(replies).toEqual(['Simular ahorro 5 años', 'Ver mi presupuesto']);
  });
});
