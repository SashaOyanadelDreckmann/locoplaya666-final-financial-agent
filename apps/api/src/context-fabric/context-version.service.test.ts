import { describe, expect, it } from 'vitest';
import { hashContent, buildContextVersion, buildSourceVersion } from './context-version.service';

describe('context-version.service', () => {
  it('hashes content deterministically', () => {
    const a = hashContent({ income: 1_000_000, rows: [{ id: 'a' }] });
    const b = hashContent({ rows: [{ id: 'a' }], income: 1_000_000 });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('builds stable context versions from section hashes', () => {
    const version = buildContextVersion({ intake: 'abc', budget: 'def' });
    expect(version).toMatch(/^ctx-/);
    expect(buildContextVersion({ budget: 'def', intake: 'abc' })).toBe(version);
  });

  it('builds source versions with hash and timestamp', () => {
    const version = buildSourceVersion('deadbeef', '2026-01-01T00:00:00.000Z');
    expect(version).toContain('deadbeef');
  });
});
