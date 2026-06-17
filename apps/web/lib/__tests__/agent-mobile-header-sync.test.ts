/** @jest-environment jsdom */

import {
  AGENT_MOBILE_HEADER_MEASURED_H_VAR,
  clearAgentMobileHeaderOccupy,
  measureAgentMobileHeaderHeight,
  observeAgentMobileHeaderOccupy,
  syncAgentMobileHeaderOccupy,
} from '@/lib/interfaz/agent-mobile-header-sync';

jest.mock('@/lib/interfaz/viewport-mode', () => ({
  shouldUseMobileShell: jest.fn(() => true),
}));

const { shouldUseMobileShell } = jest.requireMock('@/lib/interfaz/viewport-mode') as {
  shouldUseMobileShell: jest.Mock;
};

describe('agent-mobile-header-sync', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.cssText = '';
    shouldUseMobileShell.mockReturnValue(true);
  });

  it('measures the tallest rendered header box', () => {
    const header = document.createElement('header');
    Object.defineProperty(header, 'offsetHeight', { value: 54, configurable: true });
    Object.defineProperty(header, 'scrollHeight', { value: 98, configurable: true });
    header.getBoundingClientRect = () =>
      ({
        height: 72,
        width: 320,
        top: 0,
        left: 0,
        right: 320,
        bottom: 72,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(measureAgentMobileHeaderHeight(header)).toBe(98);
  });

  it('writes measured height for mobile headers', () => {
    const header = document.createElement('header');
    header.className = 'agent-chat-header is-mobile';
    Object.defineProperty(header, 'offsetHeight', { value: 88, configurable: true });
    Object.defineProperty(header, 'scrollHeight', { value: 88, configurable: true });
    header.getBoundingClientRect = () =>
      ({
        height: 88,
        width: 320,
        top: 0,
        left: 0,
        right: 320,
        bottom: 88,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    syncAgentMobileHeaderOccupy(header);

    expect(document.documentElement.style.getPropertyValue(AGENT_MOBILE_HEADER_MEASURED_H_VAR)).toBe('88px');
  });

  it('clears measured height when mobile shell is inactive', () => {
    const header = document.createElement('header');
    header.className = 'agent-chat-header is-mobile';
    document.documentElement.style.setProperty(AGENT_MOBILE_HEADER_MEASURED_H_VAR, '88px');
    shouldUseMobileShell.mockReturnValue(false);

    syncAgentMobileHeaderOccupy(header);

    expect(document.documentElement.style.getPropertyValue(AGENT_MOBILE_HEADER_MEASURED_H_VAR)).toBe('');
  });

  it('observes header resize and cleans up', () => {
    const header = document.createElement('header');
    header.className = 'agent-chat-header is-mobile';
    Object.defineProperty(header, 'offsetHeight', { value: 60, configurable: true });
    Object.defineProperty(header, 'scrollHeight', { value: 60, configurable: true });
    header.getBoundingClientRect = () =>
      ({
        height: 60,
        width: 320,
        top: 0,
        left: 0,
        right: 320,
        bottom: 60,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(header);

    const cleanup = observeAgentMobileHeaderOccupy(header);
    expect(document.documentElement.style.getPropertyValue(AGENT_MOBILE_HEADER_MEASURED_H_VAR)).toBe('60px');

    cleanup();
    clearAgentMobileHeaderOccupy();
    expect(document.documentElement.style.getPropertyValue(AGENT_MOBILE_HEADER_MEASURED_H_VAR)).toBe('');
  });
});
