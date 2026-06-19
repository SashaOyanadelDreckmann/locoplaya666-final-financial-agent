import { describe, expect, it } from 'vitest';
import { applyVisionDirectionClassifications } from './movementDirectionVision.service';

describe('movementDirectionVision.service', () => {
  it('overrides direction when vision confidence is high enough', () => {
    const movements = [
      {
        description: 'Copec nunoa compras',
        amount: 8480,
        direction: 'income' as const,
        movement_kind: 'abono' as const,
      },
      {
        description: 'Pago pesos tef',
        amount: 186446,
        direction: 'expense' as const,
        movement_kind: 'expense' as const,
      },
    ];

    const updated = applyVisionDirectionClassifications(movements, [
      {
        movement_index: 0,
        direction: 'expense',
        movement_kind: 'expense',
        confidence: 0.94,
        visual_evidence: 'monto negro con prefijo - e icono gris ↗',
      },
      {
        movement_index: 1,
        direction: 'income',
        movement_kind: 'abono',
        confidence: 0.96,
        visual_evidence: 'monto verde con + e icono verde ↙',
      },
    ]);

    expect(updated[0]?.direction).toBe('expense');
    expect(updated[0]?.direction_basis).toBe('vision_ui_context');
    expect(updated[1]?.movement_kind).toBe('abono');
    expect(updated[1]?.amount_signed).toBe(186446);
  });

  it('ignores low-confidence vision classifications', () => {
    const movements = [
      {
        description: 'Sumup botilleria compras',
        amount: 2300,
        direction: 'income' as const,
      },
    ];

    const updated = applyVisionDirectionClassifications(movements, [
      {
        movement_index: 0,
        direction: 'expense',
        movement_kind: 'expense',
        confidence: 0.4,
        visual_evidence: 'ambiguo',
      },
    ]);

    expect(updated[0]?.direction).toBe('income');
    expect(updated[0]?.direction_basis).toBeUndefined();
  });
});
