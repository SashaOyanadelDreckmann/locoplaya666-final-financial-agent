import {
  compactDiagnosisList,
  compactDiagnosisListItem,
} from '@financial-agent/shared';

describe('compactDiagnosisListItem', () => {
  it('recorta tensiones verbosas sin perder el hallazgo central', () => {
    const raw =
      'El usuario experimenta presión financiera y estrés a pesar de contar con ingresos elevados y un saldo presupuestario positivo. Existe una desconexión entre el flujo de caja real y el presupuesto formal.';
    const compact = compactDiagnosisListItem(raw, 'tension');

    expect(compact.length).toBeLessThanOrEqual(140);
    expect(compact).toMatch(/presión financiera/i);
    expect(compact).not.toMatch(/^El usuario/i);
  });

  it('condensa hipótesis largas en una frase directa', () => {
    const raw =
      'La ausencia de registro de gastos esenciales podría deberse a externalización de estos pagos, falta de seguimiento o subestimación de su impacto en el flujo real. El estrés financiero puede estar inflado por deudas no visibles.';
    const compact = compactDiagnosisListItem(raw, 'hypothesis');

    expect(compact.length).toBeLessThanOrEqual(140);
    expect(compact).toMatch(/gastos esenciales/i);
    expect(compact).not.toMatch(/podría deberse a/i);
  });

  it('conserva solo la primera pregunta cuando hay varias encadenadas', () => {
    const raw =
      '¿Dónde y cómo se registran o cubren los gastos esenciales que no aparecen en el presupuesto formal? ¿Cuál es la naturaleza y el monto real de las deudas reportadas en el presupuesto, considerando que no hay trazabilidad?';
    const compact = compactDiagnosisListItem(raw, 'question');

    expect(compact.endsWith('?')).toBe(true);
    expect(compact).not.toMatch(/naturaleza/i);
    expect(compact.length).toBeLessThanOrEqual(120);
  });
});

describe('compactDiagnosisList', () => {
  it('aplica compactación a cada ítem del arreglo', () => {
    const items = compactDiagnosisList(
      ['El usuario experimenta tensión A.', 'El usuario experimenta tensión B.'],
      'tension',
    );

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.length <= 140)).toBe(true);
  });
});
