/** @jest-environment jsdom */

import {
  dismissMobileKeyboard,
  handleMobileKeyboardOutsideTap,
  isMobileKeyboardActive,
  shouldPreserveMobileKeyboard,
} from '@/lib/interfaz/mobile-keyboard-focus';

jest.mock('@/lib/interfaz/viewport-mode', () => ({
  shouldUseMobileShell: jest.fn(() => true),
  syncPwaStandaloneClass: jest.fn(() => false),
  MOBILE_SHELL_MEDIA: '(max-width: 767px)',
}));

describe('mobile keyboard focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    document.documentElement.classList.remove(
      'browser-keyboard-open',
      'mobile-input-engaged',
      'composer-typing-snap',
    );
  });

  it('preserves keyboard for composer inputs but not send controls', () => {
    const dock = document.createElement('div');
    dock.className = 'agent-mobile-composer-dock';
    const input = document.createElement('textarea');
    const send = document.createElement('button');
    send.className = 'composer-send-btn';
    dock.append(input, send);
    document.body.appendChild(dock);

    expect(shouldPreserveMobileKeyboard(input)).toBe(true);
    expect(shouldPreserveMobileKeyboard(send)).toBe(false);
  });

  it('dismisses focused inputs and clears mobile typing classes', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.documentElement.classList.add('mobile-input-engaged', 'composer-typing-snap');

    dismissMobileKeyboard();

    expect(document.activeElement).toBe(document.body);
    expect(document.documentElement.classList.contains('mobile-input-engaged')).toBe(false);
    expect(document.documentElement.classList.contains('composer-typing-snap')).toBe(false);
  });

  it('dismisses on outside tap when a field is focused', () => {
    const input = document.createElement('input');
    const outside = document.createElement('button');
    outside.textContent = 'fuera';
    document.body.append(input, outside);
    input.focus();

    expect(isMobileKeyboardActive()).toBe(true);
    handleMobileKeyboardOutsideTap(outside);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps keyboard when tapping another editable field', () => {
    const wrap = document.createElement('div');
    wrap.className = 'bcc-hero-input-wrap';
    const first = document.createElement('input');
    const second = document.createElement('input');
    wrap.append(first, second);
    document.body.appendChild(wrap);
    first.focus();

    handleMobileKeyboardOutsideTap(second);
    expect(document.activeElement).toBe(first);
  });
});
