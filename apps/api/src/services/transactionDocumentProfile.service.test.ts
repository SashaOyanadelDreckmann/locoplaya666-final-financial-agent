import { describe, expect, it } from 'vitest';
import { buildTransactionDocumentProfile } from './transactionDocumentProfile.service';

describe('transactionDocumentProfile', () => {
  it('classifies Banco de Chile cartolas históricas', async () => {
    const profile = await buildTransactionDocumentProfile({
      filename: 'cartola_30012026.xls',
      text: [
        'Sr(a): Sasha Nicolas Oyanadel Dreckmann',
        'Cuenta: 00-310-18591-02',
        'Detalle Cartola Histórica',
        'Fecha | Descripción | Canal o Sucursal | Cargos (PESOS) | Abonos (PESOS) | Saldo (PESOS)',
        '19/01 | TRASPASO A:Maria Carolina Marin G | INTERNET | 53000 | | 1000',
      ].join('\n'),
      tables: [
        {
          headers: ['Fecha', 'Descripción', 'Canal o Sucursal', 'Cargos (PESOS)', 'Abonos (PESOS)', 'Saldo (PESOS)'],
          rows: [],
        },
      ],
    });

    expect(profile.bank).toBe('Banco de Chile');
    expect(profile.product_type).toBe('checking_account');
    expect(profile.format_family).toBe('banco_chile_cartola_historica');
    expect(profile.sign_convention).toBe('column_cargo_abono');
    expect(profile.needs_rag).toBe(false);
    expect(profile.confidence).toBeGreaterThan(0.9);
  });

  it('classifies BancoEstado cartolas by inventory signals', async () => {
    const profile = await buildTransactionDocumentProfile({
      filename: 'BancoEstado_CuentaRUT_cartola_2026.pdf',
      text: [
        'BancoEstado',
        'Saldo y Retenciones',
        'Fecha / Sucursal / N° Operacion / Descripcion / Cargos / Abonos / Saldo',
        '19/01 | Sucursal Centro | 12345 | TRANSFERENCIA RECIBIDA | | 53000 | 1000',
      ].join('\n'),
      tables: [
        {
          headers: ['Fecha', 'Sucursal', 'N° Operacion', 'Descripcion', 'Cargos', 'Abonos', 'Saldo'],
          rows: [],
        },
      ],
    });

    expect(profile.bank).toBe('BancoEstado');
    expect(profile.product_type).toBe('checking_account');
    expect(profile.format_family).toContain('bancoestado');
    expect(profile.sign_convention).toBe('column_cargo_abono');
    expect(profile.needs_rag).toBe(false);
  });

  it('classifies Santander tarjeta de credito from inventory patterns', async () => {
    const profile = await buildTransactionDocumentProfile({
      filename: 'Estado_de_Cuenta_Santander_2026.pdf',
      text: [
        'Santander Chile',
        'Estado de Cuenta',
        'Monto minimo',
        'Fecha de pago',
        'Periodo facturado',
        'Movimientos del periodo',
      ].join('\n'),
      tables: [
        {
          headers: ['Fecha', 'Descripción', 'Cuotas', 'Monto'],
          rows: [],
        },
      ],
    });

    expect(profile.bank).toBe('Santander Chile');
    expect(profile.product_type).toBe('credit_card');
    expect(profile.format_family).toContain('santander');
    expect(profile.sign_convention).toBe('keyword_overrides_amount_sign');
    expect(profile.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies BICE cartolas de cuenta en pesos', async () => {
    const profile = await buildTransactionDocumentProfile({
      filename: 'Cartola_01-58083-3_20260430_20260529.xlsx',
      text: [
        'Cuenta en pesos N° 01-58083-3',
        'Resumen del periodo',
        'Abonos y cargos',
        'Fecha Categoría Nº operación Descripción Monto',
        '4 may 2026 Cargos - Cargo por pago SII ... $162.772',
      ].join('\n'),
      tables: [
        {
          headers: ['Fecha', 'Categoría', 'Nº operación', 'Descripción', 'Monto'],
          rows: [],
        },
      ],
    });

    expect(profile.bank).toBe('Banco BICE');
    expect(profile.product_type).toBe('checking_account');
    expect(profile.format_family).toBe('bice_cuenta_pesos');
    expect(profile.sign_convention).toBe('section_based');
    expect(profile.confidence).toBeGreaterThan(0.9);
  });

  it('classifies tarjeta de crédito facturada como crédito', async () => {
    const profile = await buildTransactionDocumentProfile({
      filename: 'Mov_Facturado.xls',
      text: [
        'Movimientos Facturados',
        'Movimientos Nacionales',
        'Categoría Fecha Descripción Cuotas Monto ($)',
        'Total de Pagos, Compras, Cuotas y Avance 18/05/2026 Pago Pesos TEF 01/01 100000',
      ].join('\n'),
      tables: [
        {
          headers: ['Categoría', 'Fecha', 'Descripción', 'Cuotas', 'Monto ($)'],
          rows: [],
        },
      ],
    });

    expect(profile.product_type).toBe('credit_card');
    expect(profile.format_family).toBe('visa_signature_facturado');
    expect(profile.sign_convention).toBe('keyword_overrides_amount_sign');
    expect(profile.needs_rag).toBe(false);
  });
});
