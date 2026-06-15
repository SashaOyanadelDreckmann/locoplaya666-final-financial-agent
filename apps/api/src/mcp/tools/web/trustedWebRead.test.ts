import { describe, expect, it } from 'vitest';
import {
  isTrustedChileUrl,
  pickTrustedSearchUrl,
  stripHtmlToText,
} from './trustedWebRead';

describe('trustedWebRead', () => {
  it('accepts trusted Chile hosts', () => {
    expect(isTrustedChileUrl('https://www.cmfchile.cl/portal/principal')).toBe(true);
    expect(isTrustedChileUrl('https://www.bcentral.cl/web/banco-central')).toBe(true);
    expect(isTrustedChileUrl('https://example.com/page')).toBe(false);
  });

  it('picks the first trusted URL from search hits', () => {
    const url = pickTrustedSearchUrl([
      { url: 'https://spam.example/not-trusted' },
      { url: 'https://www.bcentral.cl/indicadores' },
    ]);
    expect(url).toContain('bcentral.cl');
  });

  it('strips HTML to plain text', () => {
    const text = stripHtmlToText('<p>Hola <strong>UF</strong> hoy</p>');
    expect(text).toBe('Hola UF hoy');
  });
});
