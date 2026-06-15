import {
  canStepAdminTab,
  compactAdminText,
  formatAdminPercent,
  parseAdminTab,
  progressTone,
  stageLabels,
  stepAdminTab,
} from '../helpers/admin-format';

describe('admin-format', () => {
  it('parses tab aliases', () => {
    expect(parseAdminTab('overview')).toBe('overview');
    expect(parseAdminTab('interactions')).toBe('activity');
    expect(parseAdminTab('analytics')).toBe('activity');
    expect(parseAdminTab('ops')).toBe('ops');
    expect(parseAdminTab('unknown')).toBe('overview');
  });

  it('parses ops tab alias', () => {
    expect(parseAdminTab('platform')).toBe('ops');
    expect(parseAdminTab('system')).toBe('ops');
  });

  it('formats percent safely', () => {
    expect(formatAdminPercent(120)).toBe('100.0%');
    expect(formatAdminPercent(-4)).toBe('0.0%');
  });

  it('compacts long text', () => {
    expect(compactAdminText('a'.repeat(200), 20)).toHaveLength(21);
  });

  it('maps progress tone thresholds', () => {
    expect(progressTone(80)).toBe('lime');
    expect(progressTone(55)).toBe('amber');
    expect(progressTone(10)).toBe('cyan');
  });

  it('includes stale stage label', () => {
    expect(stageLabels.stale).toBe('Inactivo');
  });

  it('steps admin tabs for swipe navigation', () => {
    expect(stepAdminTab('overview', 'next')).toBe('users');
    expect(stepAdminTab('users', 'prev')).toBe('overview');
    expect(canStepAdminTab('overview', 'prev')).toBe(false);
    expect(canStepAdminTab('archive', 'next')).toBe(false);
  });
});
