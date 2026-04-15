'use client';

import { useState } from 'react';
import type { SavedReport } from '@/lib/validation';

interface ReportPanelProps {
  savedReports: SavedReport[];
  onSaveReport: (title: string, group: string, fileUrl: string) => Promise<void>;
  onDeleteReport: (id: string) => void;
  loading?: boolean;
}

/**
 * Panel para gestionar reportes guardados
 * Extraído de agent/page.tsx para mejorar mantenibilidad
 */
export function ReportPanel({
  savedReports,
  onSaveReport,
  onDeleteReport,
  loading = false,
}: ReportPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['plan_action']));

  const toggleGroup = (group: string) => {
    const newGroups = new Set(expandedGroups);
    if (newGroups.has(group)) {
      newGroups.delete(group);
    } else {
      newGroups.add(group);
    }
    setExpandedGroups(newGroups);
  };

  const groupedReports = savedReports.reduce(
    (acc, report) => {
      if (!acc[report.group]) {
        acc[report.group] = [];
      }
      acc[report.group].push(report);
      return acc;
    },
    {} as Record<string, SavedReport[]>
  );

  const groupLabels: Record<string, string> = {
    plan_action: 'Plan de Acción',
    simulation: 'Simulaciones',
    budget: 'Presupuestos',
    diagnosis: 'Diagnósticos',
    other: 'Otros',
  };

  return (
    <div className="report-panel">
      <div className="report-header">
        <h3>Mis Reportes</h3>
        <p className="report-count">{savedReports.length} guardados</p>
      </div>

      {Object.entries(groupLabels).map(([group, label]) => (
        <div key={group} className="report-group">
          <button
            className="report-group-toggle"
            onClick={() => toggleGroup(group)}
            aria-expanded={expandedGroups.has(group)}
          >
            <span className="toggle-arrow">{expandedGroups.has(group) ? '▼' : '▶'}</span>
            <span>{label}</span>
            <span className="group-count">({groupedReports[group]?.length || 0})</span>
          </button>

          {expandedGroups.has(group) && (
            <div className="report-group-items">
              {groupedReports[group]?.map((report) => (
                <div key={report.id} className="report-item">
                  <a href={report.fileUrl} target="_blank" rel="noopener noreferrer" className="report-link">
                    {report.title}
                  </a>
                  <span className="report-date">
                    {new Date(report.createdAt).toLocaleDateString('es-ES')}
                  </span>
                  <button
                    className="report-delete"
                    onClick={() => onDeleteReport(report.id)}
                    disabled={loading}
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {savedReports.length === 0 && (
        <p className="report-empty">No hay reportes aún. Crea uno desde el chat.</p>
      )}
    </div>
  );
}

export default ReportPanel;
