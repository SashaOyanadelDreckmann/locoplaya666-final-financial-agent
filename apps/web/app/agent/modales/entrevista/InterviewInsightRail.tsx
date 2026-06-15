import type { InterviewInsightCell } from './interview-modal.presentation';

type Props = {
  cells: InterviewInsightCell[];
};

export function InterviewInsightRail({ cells }: Props) {
  if (cells.length === 0) return null;

  return (
    <div className="interview-insight-rail" aria-label="Señales de la entrevista">
      <div className="interview-insight-grid">
        {cells.map((cell) => (
          <article
            key={cell.key}
            className={`interview-insight-cell${cell.tone ? ` is-${cell.tone}` : ''}`}
          >
            <div className="interview-insight-cell__head">
              <span className="interview-insight-cell__label">{cell.label}</span>
              <span className="interview-insight-cell__dot" aria-hidden="true" />
            </div>
            <strong className="interview-insight-cell__value">{cell.value}</strong>
            {cell.detail ? <span className="interview-insight-cell__detail">{cell.detail}</span> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
