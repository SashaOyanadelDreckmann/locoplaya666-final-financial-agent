'use client';

import type { AnalyticsRole } from '@/lib/api/analytics';
import type { ResearchAnalyticsStage } from '@/lib/api/admin';
import { stageLabels, stageOrder } from '../helpers/admin-format';

type Props = {
  showRole: boolean;
  showStage: boolean;
  roleFilter: '' | AnalyticsRole;
  stageFilter: ResearchAnalyticsStage | 'all';
  onRoleChange: (value: '' | AnalyticsRole) => void;
  onStageChange: (value: ResearchAnalyticsStage | 'all') => void;
};

export function AdminFilterBar({
  showRole,
  showStage,
  roleFilter,
  stageFilter,
  onRoleChange,
  onStageChange,
}: Props) {
  if (!showRole && !showStage) return null;

  return (
    <div className="admin-filter-shell">
      <div className="admin-filter-bar admin-scroll-x" role="group" aria-label="Filtros">
        {showRole ? (
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
