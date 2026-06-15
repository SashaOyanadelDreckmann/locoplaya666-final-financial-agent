'use client';

import { useMemo, useState } from 'react';
import { compactAdminText } from '../helpers/admin-format';

type JsonSection = {
  id: string;
  label: string;
  value: unknown;
  hint?: string;
};

export function AdminJsonExplorer({ sections }: { sections: JsonSection[] }) {
  const [openId, setOpenId] = useState<string>(sections[0]?.id ?? '');

  const normalized = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        size: JSON.stringify(section.value ?? null).length,
      })),
    [sections],
  );

  const active = normalized.find((section) => section.id === openId) ?? normalized[0] ?? null;

  return (
    <div className="admin-explorer">
      <div className="admin-explorer-nav admin-scroll-x" role="tablist" aria-label="Secciones JSON">
        {normalized.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={openId === section.id}
            className={`admin-explorer-tab ${openId === section.id ? 'is-active' : ''}`}
            onClick={() => setOpenId(section.id)}
          >
            <span>{section.label}</span>
            <small>{compactAdminText(`${section.size} chars`, 16)}</small>
          </button>
        ))}
      </div>
      <div className="admin-explorer-panel">
        {active ? (
          <div key={active.id} className="admin-explorer-content">
            {active.hint ? <p className="admin-muted admin-explorer-hint">{active.hint}</p> : null}
            <pre className="admin-json">{JSON.stringify(active.value, null, 2)}</pre>
          </div>
        ) : (
          <p className="admin-muted">Sin secciones disponibles.</p>
        )}
      </div>
    </div>
  );
}
