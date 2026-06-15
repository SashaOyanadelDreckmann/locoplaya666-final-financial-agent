'use client';

import type { AnalyticsRole } from '@/lib/api/analytics';
import type { ResearchAnalyticsStage } from '@/lib/api/admin';
import { stageLabels, stageOrder } from '../helpers/admin-format';

type Props = {
  showRoleDates: boolean;
  showStage: boolean;
  roleFilter: '' | AnalyticsRole;
  stageFilter: ResearchAnalyticsStage | 'all';
  fromDate: string;
  toDate: string;
  onRoleChange: (value: '' | AnalyticsRole) => void;
  onStageChange: (value: ResearchAnalyticsStage | 'all') => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onApply: () => void;
};

export function AdminFilterBar({
  showRoleDates,
  showStage,
  roleFilter,
  stageFilter,
  fromDate,
  toDate,
  onRoleChange,
  onStageChange,
  onFromDateChange,
  onToDateChange,
  onApply,
}: Props) {
  if (!showRoleDates && !showStage) return null;

  return (
    <div className="admin-filter-shell">
      <div className="admin-filter-bar admin-scroll-x" role="group" aria-label="Filtros">
        {showRoleDates ? (
          <>
            <label className="admin-filter-chip">
              <span className="admin-filter-chip-label">Rol</span>
              <select
                className="admin-filter-control"
                value={roleFilter}
                onChange={(e) => onRoleChange(e.target.value as '' | AnalyticsRole)}
              >
                <option value="">Todos</option>
                <option value="USER">USER</option>
                <option value="ANALYST">ANALYST</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label className="admin-filter-chip">
              <span className="admin-filter-chip-label">Desde</span>
              <input
                className="admin-filter-control"
                type="date"
                value={fromDate}
                onChange={(e) => onFromDateChange(e.target.value)}
              />
            </label>
            <label className="admin-filter-chip">
              <span className="admin-filter-chip-label">Hasta</span>
              <input
                className="admin-filter-control"
                type="date"
                value={toDate}
                onChange={(e) => onToDateChange(e.target.value)}
              />
            </label>
            <button type="button" className="admin-btn admin-btn--compact" onClick={onApply}>
              Aplicar
            </button>
          </>
        ) : null}
        {showStage ? (
          <label className="admin-filter-chip">
            <span className="admin-filter-chip-label">Stage</span>
            <select
              className="admin-filter-control"
              value={stageFilter}
              onChange={(e) => onStageChange(e.target.value as ResearchAnalyticsStage | 'all')}
            >
              <option value="all">Todos</option>
              {stageOrder.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
