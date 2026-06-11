import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type EditorialScore = {
  id: string;
  label: string;
  value: number;
  tone: 'critical' | 'watch' | 'strong';
  caption: string;
};

type EditorialDatum = { label: string; value: number };

export function DiagnosisSignalStrip({ keySignals }: { keySignals?: string[] }) {
  const signals = (keySignals ?? []).filter(Boolean).slice(0, 4);
  if (!signals.length) return null;
  return (
    <div className="diagnosis-signal-strip diagnosis-signal-strip--inline">
      {signals.map((signal) => (
        <span key={signal} className="diagnosis-signal-pill">
          {signal}
        </span>
      ))}
    </div>
  );
}

export function DiagnosisHero({
  headline,
  dek,
  keySignals,
  variant = 'page',
}: {
  headline?: string;
  dek?: string;
  keySignals?: string[];
  variant?: 'page' | 'embedded';
}) {
  const signals = (keySignals ?? []).filter(Boolean).slice(0, 4);
  if (variant === 'embedded') {
    return signals.length > 0 ? <DiagnosisSignalStrip keySignals={signals} /> : null;
  }

  return (
    <section className="app-section animate-fade-in diagnosis-hero diagnosis-hero--editorial">
      <div className="diagnosis-hero-copy">
        <span className="diagnosis-hero-eyebrow">Financieramente</span>
        <h1>{headline || 'Diagnóstico financiero'}</h1>
        <p className="diagnosis-hero-text">
          {dek ||
            'Lectura integrada de tu estructura financiera: relato, presupuesto, productos y tensiones operativas.'}
        </p>
      </div>
      {signals.length > 0 ? <DiagnosisSignalStrip keySignals={signals} /> : null}
    </section>
  );
}

export function ScorecardGrid({ items }: { items?: EditorialScore[] }) {
  const safe = (items ?? []).filter(Boolean);
  if (!safe.length) return null;
  return (
    <section className="app-section diagnosis-scorecard-grid">
      {safe.map((item) => (
        <article key={item.id} className={`diagnosis-scorecard diagnosis-tone-${item.tone}`}>
          <span>{item.label}</span>
          <strong>{Math.round(item.value)}</strong>
          <p>{item.caption}</p>
        </article>
      ))}
    </section>
  );
}

export function DiagnosticNarrative({ narrative }: { narrative?: string }) {
  return (
    <Card title="Narrativa diagnóstica" eyebrow="Lectura">
      <p className="diagnosis-prose">{narrative ?? 'Sin narrativa disponible.'}</p>
    </Card>
  );
}

export function FinancialProfileCard({ profile }: { profile?: Record<string, unknown> }) {
  const entries = profile
    ? Object.entries(profile).filter(([, value]) => value !== null && value !== undefined && value !== '')
    : [];
  return (
    <Card title="Perfil financiero" eyebrow="Estructura">
      {entries.length > 0 ? (
        <div className="diagnosis-definition-grid">
          {entries.map(([key, value]) => (
            <div key={key} className="diagnosis-definition-item">
              <span>{humanizeKey(key)}</span>
              <strong>{formatValue(value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="diagnosis-empty-copy">Sin datos.</p>
      )}
    </Card>
  );
}

export function DiagnosticCharts({
  cashflowBuckets,
  pressurePoints,
}: {
  cashflowBuckets?: EditorialDatum[];
  pressurePoints?: EditorialDatum[];
}) {
  const cash = (cashflowBuckets ?? []).filter((item) => Number.isFinite(item?.value));
  const pressure = (pressurePoints ?? []).filter((item) => Number.isFinite(item?.value));
  if (!cash.length && !pressure.length) return null;

  return (
    <section className="app-section diagnosis-grid diagnosis-grid--charts">
      {cash.length > 0 ? (
        <ChartCard title="Arquitectura financiera" eyebrow="Flujo de caja">
          <div className="diagnosis-chart-shell">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cash}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,180,200,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(206,220,231,0.72)" tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(206,220,231,0.52)" tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    borderRadius: 18,
                    border: '1px solid rgba(210,225,236,0.16)',
                    background: 'rgba(8, 13, 20, 0.94)',
                    color: '#eef5fb',
                  }}
                />
                <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                  {cash.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={entry.label.toLowerCase().includes('gasto') ? 'rgba(189, 104, 104, 0.86)' : 'rgba(126, 171, 211, 0.92)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : null}
      {pressure.length > 0 ? (
        <ChartCard title="Focos de presión" eyebrow="Puntos críticos">
          <div className="diagnosis-chart-shell">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={pressure} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,180,200,0.1)" horizontal={false} />
                <XAxis type="number" stroke="rgba(206,220,231,0.52)" tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={96}
                  stroke="rgba(206,220,231,0.72)"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    borderRadius: 18,
                    border: '1px solid rgba(210,225,236,0.16)',
                    background: 'rgba(8, 13, 20, 0.94)',
                    color: '#eef5fb',
                  }}
                />
                <Bar dataKey="value" radius={[0, 12, 12, 0]} fill="rgba(180, 146, 80, 0.92)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : null}
    </section>
  );
}

export function TensionsList({ tensions }: { tensions?: string[] }) {
  return <ListCard title="Tensiones" eyebrow="Fricciones" items={tensions} />;
}

export function HypothesesList({ hypotheses }: { hypotheses?: string[] }) {
  return <ListCard title="Hipótesis" eyebrow="Lectura" items={hypotheses} />;
}

export function OpenQuestionsCard({ questions }: { questions?: string[] }) {
  return <ListCard title="Preguntas abiertas" eyebrow="Siguiente paso" items={questions} />;
}

function Card({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <article className="diagnosis-card diagnosis-card--editorial">
      <div className="diagnosis-card-head">
        {eyebrow ? <span className="diagnosis-card-eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
      </div>
      <div className="diagnosis-card-body">{children}</div>
    </article>
  );
}

function ChartCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <article className="diagnosis-card diagnosis-card--chart">
      <div className="diagnosis-card-head">
        {eyebrow ? <span className="diagnosis-card-eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
      </div>
      <div className="diagnosis-card-body">{children}</div>
    </article>
  );
}

function ListCard({ title, eyebrow, items }: { title: string; eyebrow?: string; items?: string[] }) {
  const safe = (items ?? []).filter(Boolean);
  return (
    <Card title={title} eyebrow={eyebrow}>
      {safe.length > 0 ? (
        <ul className="diagnosis-list">
          {safe.map((it, idx) => (
            <li key={`${it}-${idx}`}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="diagnosis-empty-copy">Sin hallazgos cargados.</p>
      )}
    </Card>
  );
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(' · ');
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('es-CL') : value.toFixed(2);
  return String(value);
}
