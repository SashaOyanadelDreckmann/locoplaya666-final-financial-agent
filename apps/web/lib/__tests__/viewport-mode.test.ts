import { shouldUseMobileShell } from '../viewport-mode';

function setViewport(width: number, height: number, coarse = false, touchPoints = 0) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
  window.matchMedia = jest.fn((query: string) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('shouldUseMobileShell', () => {
  it('keeps narrow desktop windows on desktop', () => {
    setViewport(1200, 700, false, 0);
    expect(shouldUseMobileShell()).toBe(false);
  });

  it('keeps coarse-pointer narrow devices on mobile', () => {
    setViewport(700, 900, true, 5);
    expect(shouldUseMobileShell()).toBe(true);
  });
});
