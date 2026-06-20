'use client';

import type { BankProduct } from './types';

type DocumentContext = NonNullable<BankProduct['dashboard']>['documentContext'];

function formatIsoDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TxDocumentContextChips({ context }: { context?: DocumentContext }) {
  if (!context) return null;

  const chips: string[] = [];
  if (context.billing_view === 'no_facturado') chips.push('No facturados');
  if (context.billing_view === 'facturado') chips.push('Facturados');
  if (context.card_scope === 'nacional') chips.push('Nacional');
  if (context.card_scope === 'internacional') chips.push('Internacional');
  const due = formatIsoDate(context.payment_due_date);
  if (due) chips.push(`Vence ${due}`);
  const billing = formatIsoDate(context.billing_cycle_date);
  if (billing) chips.push(`Facturación ${billing}`);

  if (chips.length === 0 && !(context.notices?.length)) return null;

  return (
    <div className="tx-document-context" role="note" aria-label="Contexto del antecedente">
      {chips.map((chip) => (
        <span key={chip} className="tx-document-context-chip">
          {chip}
        </span>
      ))}
      {context.notices?.slice(0, 2).map((notice) => (
        <span key={notice} className="tx-document-context-note">
          {notice}
        </span>
      ))}
    </div>
  );
}
