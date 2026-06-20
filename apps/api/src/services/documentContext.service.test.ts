import { describe, expect, it } from 'vitest';
import {
  applyBillingContextToMovements,
  buildDocumentContextAlert,
  inferDocumentContextFromText,
  mergeDocumentContext,
  resolveDocumentContext,
} from './documentContext.service';

describe('documentContext.service', () => {
  it('detects no facturados and nacional from app screenshot text', () => {
    const context = inferDocumentContextFromText(
      [
        'Movimientos de Tarjeta Nacional',
        'No facturados',
        'Recuerda pagar hasta el 08 de junio del 2026',
        'El 22 de junio del 2026 estos movimientos serán facturados',
      ].join('\n'),
      'movimientos-tc.png',
    );

    expect(context?.billing_view).toBe('no_facturado');
    expect(context?.card_scope).toBe('nacional');
    expect(context?.payment_due_date).toBe('2026-06-08');
    expect(context?.billing_cycle_date).toBe('2026-06-22');
  });

  it('detects facturados from excel filename', () => {
    const context = resolveDocumentContext({
      text: 'Movimientos facturados Visa Signature',
      filename: 'Mov_Facturado.xls',
      formatFamily: 'visa_signature_facturado',
    });
    expect(context?.billing_view).toBe('facturado');
  });

  it('tags movements with billing status when context is confident', () => {
    const tagged = applyBillingContextToMovements(
      [{ description: 'Copec compras', amount: 8480 }],
      {
        billing_view: 'no_facturado',
        card_scope: 'nacional',
        notices: [],
        confidence: 0.88,
        source: 'heuristic',
      },
    );
    expect(tagged[0]?.billing_status).toBe('no_facturado');
    expect(tagged[0]?.card_scope).toBe('nacional');
  });

  it('builds a human-readable alert', () => {
    const alert = buildDocumentContextAlert({
      billing_view: 'no_facturado',
      card_scope: 'nacional',
      payment_due_date: '2026-06-08',
      notices: [],
      confidence: 0.9,
      source: 'merged',
    });
    expect(alert).toContain('no facturada');
    expect(alert).toContain('2026-06-08');
  });

  it('merges vision and heuristic contexts without losing billing view', () => {
    const merged = mergeDocumentContext(
      {
        billing_view: 'unknown',
        card_scope: 'internacional',
        notices: [],
        confidence: 0.7,
        source: 'vision',
      },
      {
        billing_view: 'no_facturado',
        card_scope: 'unknown',
        notices: ['Aviso'],
        confidence: 0.85,
        source: 'heuristic',
      },
    );
    expect(merged.billing_view).toBe('no_facturado');
    expect(merged.card_scope).toBe('internacional');
  });
});
