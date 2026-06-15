import { buildEditorialSummaryBlocks, normalizeExecutiveSummaryText } from '../presentation';

describe('editorial summary presentation', () => {
  it('parses structured multi-block summaries', () => {
    const text = [
      'Panorama del periodo',
      'Se detectaron 42 movimientos válidos.',
      '',
      'Balance detectado',
      'Ingresos 100 · Egresos 40 · Flujo neto 60',
      '',
      'Categorías de gasto',
      '• Supermercado — 20',
      '• Transporte — 10',
    ].join('\n');

    const blocks = buildEditorialSummaryBlocks(text);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].kicker).toBe('Panorama del periodo');
    expect(blocks[1].kicker).toBe('Balance detectado');
    expect(blocks[2].body).toContain('• Supermercado');
  });

  it('normalizes legacy dense executive paragraphs', () => {
    const legacy =
      'Se detectaron 807 movimientos válidos (2023-02-24 a 2029-03-27), con 807 desde tabla estructurada. Ingresos 778.550, egresos 3.520 y flujo neto 775.030. Principales categorías de gasto: Consumo general 3.520. Comercios destacados: ACTIVO LIMITE APTO 0 (1.570). Puntos a revisar: Alta concentración en Consumo general.';

    const normalized = normalizeExecutiveSummaryText(legacy);
    expect(normalized).toContain('Panorama del periodo');
    expect(normalized).toContain('Balance detectado');
    expect(normalized).toContain('Principales categorías de gasto:');

    const blocks = buildEditorialSummaryBlocks(legacy);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    expect(blocks.some((block) => block.kicker === 'Puntos a revisar')).toBe(true);
  });
});
