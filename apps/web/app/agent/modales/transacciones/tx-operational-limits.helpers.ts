export type TxLimitsStatus = 'healthy' | 'caution' | 'critical';

export type TxOperationalLimitsSnapshot = {
  activeCount: number;
  maxActive: number;
  createdTotal: number;
  maxCreatedTotal: number;
};

export function deriveTxLimitsStatus(snapshot: TxOperationalLimitsSnapshot): TxLimitsStatus {
  const { activeCount, maxActive, createdTotal, maxCreatedTotal } = snapshot;
  const activeSlotsLeft = Math.max(0, maxActive - activeCount);
  const totalSlotsLeft = Math.max(0, maxCreatedTotal - createdTotal);

  if (activeSlotsLeft === 0 || totalSlotsLeft === 0) return 'critical';

  const activeRatio = maxActive > 0 ? activeCount / maxActive : 0;
  const createdRatio = maxCreatedTotal > 0 ? createdTotal / maxCreatedTotal : 0;

  if (activeRatio >= 0.72 || createdRatio >= 0.75) return 'caution';
  return 'healthy';
}

export function deriveTxLimitsStatusLabel(status: TxLimitsStatus): string {
  if (status === 'critical') return 'Cupos agotados';
  if (status === 'caution') return 'Cupos limitados';
  return 'Cupos disponibles';
}

export function clampTxLimitPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
