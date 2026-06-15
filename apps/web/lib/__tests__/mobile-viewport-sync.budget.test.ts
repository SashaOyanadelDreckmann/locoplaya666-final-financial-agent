/** @jest-environment jsdom */

import {
  findBudgetScrollHost,
  isBudgetAssistantComposerElement,
  isBudgetModalElement,
} from '@/lib/interfaz/mobile-viewport-sync';

describe('mobile viewport sync — budget modal', () => {
  it('detects budget modal inputs and assistant composer hosts', () => {
    const modal = document.createElement('div');
    modal.className = 'budget-modal';
    const input = document.createElement('input');
    modal.appendChild(input);

    const composer = document.createElement('div');
    composer.className = 'bcc-hero-compose';
    const composerInput = document.createElement('input');
    composer.appendChild(composerInput);
    modal.appendChild(composer);
    document.body.appendChild(modal);

    expect(isBudgetModalElement(input)).toBe(true);
    expect(isBudgetAssistantComposerElement(composerInput)).toBe(true);
    expect(isBudgetModalElement(document.createElement('input'))).toBe(false);
  });

  it('prefers the table wrap as the scroll host for row edits', () => {
    const modal = document.createElement('div');
    modal.className = 'budget-modal';
    const wrap = document.createElement('div');
    wrap.className = 'budget-table-wrap';
    const host = document.createElement('div');
    host.className = 'budget-table-scroll-host';
    const input = document.createElement('input');
    host.appendChild(wrap);
    wrap.appendChild(input);
    modal.appendChild(host);
    document.body.appendChild(modal);

    expect(findBudgetScrollHost(input)).toBe(wrap);
  });
});
