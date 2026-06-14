import {
  buildChatTableScrollHint,
  buildChatTableScrollHostClassName,
  readChatTableScrollState,
} from '@/components/agente/chat-table-scroll.helpers';

describe('chat table scroll helpers', () => {
  it('detects horizontal and vertical overflow', () => {
    const el = {
      scrollWidth: 640,
      clientWidth: 320,
      scrollHeight: 480,
      clientHeight: 240,
      scrollLeft: 12,
      scrollTop: 0,
    } as HTMLElement;

    expect(readChatTableScrollState(el)).toEqual({
      canScrollX: true,
      canScrollY: true,
      atStartX: false,
      atEndX: false,
      atStartY: true,
      atEndY: false,
    });
  });

  it('builds direction-aware hint copy', () => {
    expect(
      buildChatTableScrollHint({
        canScrollX: true,
        canScrollY: true,
        atStartX: true,
        atEndX: false,
        atStartY: true,
        atEndY: false,
      }),
    ).toBe('Desliza para explorar la tabla');

    expect(
      buildChatTableScrollHint({
        canScrollX: true,
        canScrollY: false,
        atStartX: true,
        atEndX: false,
        atStartY: true,
        atEndY: true,
      }),
    ).toBe('Desliza para ver más columnas');

    expect(
      buildChatTableScrollHint({
        canScrollX: false,
        canScrollY: true,
        atStartX: true,
        atEndX: true,
        atStartY: true,
        atEndY: false,
      }),
    ).toBe('Desliza para ver más filas');

    expect(
      buildChatTableScrollHint({
        canScrollX: false,
        canScrollY: false,
        atStartX: true,
        atEndX: true,
        atStartY: true,
        atEndY: true,
      }),
    ).toBeNull();
  });

  it('maps scroll state to host classes', () => {
    const className = buildChatTableScrollHostClassName(
      'md-table-wrap',
      {
        canScrollX: true,
        canScrollY: false,
        atStartX: true,
        atEndX: false,
        atStartY: true,
        atEndY: true,
      },
      true,
      false,
    );

    expect(className).toContain('chat-table-scroll-host');
    expect(className).toContain('md-table-wrap');
    expect(className).toContain('is-scrollable-x');
    expect(className).toContain('is-hint-visible');
  });
});
