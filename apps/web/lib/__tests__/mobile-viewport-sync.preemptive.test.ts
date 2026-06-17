/** @jest-environment jsdom */

import {
  preemptiveMobileTypingEngage,
  isMobileInputEngaged,
} from '@/lib/interfaz/mobile-viewport-sync';

jest.mock('@/lib/interfaz/viewport-mode', () => ({
  shouldUseMobileShell: jest.fn(() => true),
  syncPwaStandaloneClass: jest.fn(() => false),
  MOBILE_SHELL_MEDIA: '(max-width: 767px)',
}));

describe('preemptiveMobileTypingEngage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    document.documentElement.classList.remove('composer-typing-snap', 'mobile-input-engaged');
  });

  it('does not snap composer layout on dock touch before focus', () => {
    const dock = document.createElement('div');
    dock.className = 'agent-mobile-composer-dock';
    const head = document.createElement('div');
    head.className = 'terminal-composer-head';
    dock.appendChild(head);
    document.body.appendChild(dock);

    preemptiveMobileTypingEngage(head);

    expect(document.documentElement.classList.contains('composer-typing-snap')).toBe(false);
    expect(isMobileInputEngaged()).toBe(false);
  });

  it('engages budget table inputs on first touch', () => {
    const modal = document.createElement('div');
    modal.className = 'budget-modal';
    const input = document.createElement('input');
    modal.appendChild(input);
    document.body.appendChild(modal);

    preemptiveMobileTypingEngage(input);

    expect(isMobileInputEngaged()).toBe(true);
  });
});
