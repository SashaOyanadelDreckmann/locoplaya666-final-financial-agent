/** @jest-environment jsdom */

import { buildBubbleSnapshotHtmlAndCss } from '../chat/bubble-chat.snapshot';

function buildBubbleFixture() {
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble assistant latex-doc';
  bubble.innerHTML = `
    <div class="latex-doc-head">
      <div class="latex-doc-heading">
        <span class="latex-doc-kicker">Punto de partida</span>
        <span class="latex-doc-title">Informe financiero</span>
        <span class="latex-doc-subtitle">Resumen con gráficos y tabla</span>
      </div>
      <span class="latex-doc-mode">information</span>
    </div>
    <div class="latex-doc-body is-scrollable-content">
      <div class="premium-markdown">
        <p>Producto guardado con evidencia.</p>
      </div>
      <div class="latex-inline-annex">
        <div class="latex-inline-annex-head">
          <span>Anexos técnicos</span>
          <span>evidencia viva</span>
        </div>
        <div class="latex-inline-annex-charts">
          <section class="agent-tx-chart-card">
            <div class="tx-minimal-cashflow-chart" style="height: 280px; min-height: 280px;">
              <div class="recharts-responsive-container" style="width: 640px; height: 280px;">
                <svg class="recharts-surface" width="640" height="280" viewBox="0 0 640 280"></svg>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div class="chat-table-scroll-host is-scrollable-x is-scrollable-y" style="max-height: 180px; overflow: auto;">
        <table class="agent-table">
          <thead>
            <tr><th>Categoría</th><th>Monto</th><th>Prioridad</th><th>Acción</th></tr>
          </thead>
          <tbody>
            <tr><td>Vivienda</td><td>$450.000</td><td>Alta</td><td>Revisar</td></tr>
            <tr><td>Comida</td><td>$180.000</td><td>Media</td><td>Ajustar</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const chart = bubble.querySelector('.tx-minimal-cashflow-chart') as HTMLElement;
  const container = bubble.querySelector('.recharts-responsive-container') as HTMLElement;
  const surface = bubble.querySelector('svg.recharts-surface') as SVGSVGElement;
  const table = bubble.querySelector('table') as HTMLTableElement;

  Object.defineProperty(chart, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 640, height: 280, top: 0, left: 0, right: 640, bottom: 280 }),
  });
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 640, height: 280, top: 0, left: 0, right: 640, bottom: 280 }),
  });
  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 640, height: 280, top: 0, left: 0, right: 640, bottom: 280 }),
  });
  Object.defineProperty(table, 'scrollWidth', { configurable: true, value: 920 });
  Object.defineProperty(table, 'scrollHeight', { configurable: true, value: 240 });
  Object.defineProperty(table, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 920, height: 240, top: 0, left: 0, right: 920, bottom: 240 }),
  });

  document.body.appendChild(bubble);
  return bubble;
}

describe('buildBubbleSnapshotHtmlAndCss', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves measured chart heights and expands scrollable tables for PDF export', () => {
    const bubble = buildBubbleFixture();
    const snapshot = buildBubbleSnapshotHtmlAndCss(bubble);

    expect(snapshot.css).toContain('agent-tx-chart-card');
    expect(snapshot.css).not.toContain('size: A4');
    expect(snapshot.html).toContain('height: 280px');
    expect(snapshot.html).toContain('width="640"');
    expect(snapshot.html).toContain('height="280"');
    expect(snapshot.html).toContain('width: 920px');
    expect(snapshot.html).not.toContain('is-scrollable-x');
    expect(snapshot.html).not.toContain('max-height: 180px');
  });
});
