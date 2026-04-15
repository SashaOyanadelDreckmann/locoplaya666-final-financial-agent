import type { ReactNode } from 'react';

export function DiagnosticNarrative({ narrative }: { narrative?: string }) {
  return <Card title="Narrativa diagnóstica">{narrative ?? 'Sin narrativa disponible.'}</Card>;
}

export function FinancialProfileCard({ profile }: { profile?: Record<string, unknown> }) {
  return <Card title="Perfil financiero">{profile ? <pre>{JSON.stringify(profile, null, 2)}</pre> : 'Sin datos'}</Card>;
}

export function TensionsList({ tensions }: { tensions?: string[] }) {
  return <ListCard title="Tensiones" items={tensions} />;
}

export function HypothesesList({ hypotheses }: { hypotheses?: string[] }) {
  return <ListCard title="Hipótesis" items={hypotheses} />;
}

export function OpenQuestionsCard({ questions }: { questions?: string[] }) {
  return <ListCard title="Preguntas abiertas" items={questions} />;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article>
      <h3>{title}</h3>
      <div>{children}</div>
    </article>
  );
}

function ListCard({ title, items }: { title: string; items?: string[] }) {
  return (
    <Card title={title}>
      <ul>
        {(items ?? []).map((it, idx) => (
          <li key={idx}>{it}</li>
        ))}
      </ul>
    </Card>
  );
}
