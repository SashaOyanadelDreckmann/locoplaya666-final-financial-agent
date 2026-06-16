import { describe, expect, it } from 'vitest';
import { isTrivialGreeting, selectContextSections } from '@financial-agent/shared';

describe('context-packs selection', () => {
  it('omits financial sections on trivial greetings', () => {
    const { included, omitted } = selectContextSections({
      consumer: 'core-agent',
      purpose: 'answer',
      userMessage: 'hola',
      maxInputTokens: 2048,
    });
    expect(included).toEqual(['lifecycle']);
    expect(omitted.length).toBeGreaterThan(0);
  });

  it('includes social reflections for chat-3 without numbers by default', () => {
    const { included } = selectContextSections({
      consumer: 'core-agent',
      purpose: 'social_reflection',
      activeChat: 'chat-3',
      userMessage: '¿Qué implica gastar con conciencia?',
      maxInputTokens: 2048,
    });
    expect(included).toContain('social_reflections');
    expect(included).not.toContain('transactions');
  });

  it('adds budget/transactions on chat-3 when user asks numeric question', () => {
    const { included } = selectContextSections({
      consumer: 'core-agent',
      purpose: 'social_reflection',
      activeChat: 'chat-3',
      userMessage: '¿Cuánto gasto en deuda al mes?',
      maxInputTokens: 2048,
    });
    expect(included).toContain('budget');
    expect(included).toContain('transactions');
  });

  it('detects trivial greeting helper', () => {
    expect(isTrivialGreeting('gracias')).toBe(true);
    expect(isTrivialGreeting('¿Cuánto debo ahorrar?')).toBe(false);
  });
});
