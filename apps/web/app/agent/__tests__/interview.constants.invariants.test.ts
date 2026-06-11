/** @jest-environment node */

import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_MIN_EARLY_END_SEC,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';

describe('interview timing constants', () => {
  it('caps total interview time at 180 seconds', () => {
    expect(INTERVIEW_TOTAL_LIMIT_SEC).toBe(180);
  });

  it('allows only one realtime call per user', () => {
    expect(INTERVIEW_MAX_CALLS_PER_USER).toBe(1);
  });

  it('keeps closeout buffer below the hard total limit', () => {
    expect(INTERVIEW_CLOSEOUT_BUFFER_SEC).toBeGreaterThan(0);
    expect(INTERVIEW_CLOSEOUT_BUFFER_SEC).toBeLessThan(INTERVIEW_TOTAL_LIMIT_SEC);
  });

  it('keeps minimum early-end threshold below the hard total limit', () => {
    expect(INTERVIEW_MIN_EARLY_END_SEC).toBeGreaterThan(0);
    expect(INTERVIEW_MIN_EARLY_END_SEC).toBeLessThan(INTERVIEW_TOTAL_LIMIT_SEC);
  });
});
