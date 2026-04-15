/**
 * risk-rate.helpers.ts
 * Risk profile to rate mapping
 */

/**
 * Map risk profile to suggested annual rate
 */
export function riskRate(riskProfile: 'conservative' | 'balanced' | 'aggressive'): number {
  switch (riskProfile) {
    case 'conservative':
      return 0.04; // 4% annual
    case 'balanced':
      return 0.065; // 6.5% annual
    case 'aggressive':
      return 0.09; // 9% annual
    default:
      return 0.065;
  }
}
