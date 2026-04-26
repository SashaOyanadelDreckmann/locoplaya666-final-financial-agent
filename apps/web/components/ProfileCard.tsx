type ProfileCardProps = {
  className?: string;
  userName?: string;
  profile?: any;
  intake?: any;
  injected?: boolean;
  actions?: React.ReactNode;
  compactQuestionnaireCta?: boolean;
  onOpenQuestionnaire?: () => void;
  [key: string]: unknown;
};

const incomeBandLabel: Record<string, string> = {
  no_income: 'Sin ingresos',
  '<300k': 'Menos de $300k',
  '300k-600k': '$300k–$600k',
  '600k-1M': '$600k–$1M',
  '1M-2M': '$1M–$2M',
  '2M-4M': '$2M–$4M',
  '>4M': 'Más de $4M',
  variable: 'Ingresos variables',
};

const coverageLabel: Record<string, string> = {
  surplus: 'Con holgura',
  tight: 'Mes ajustado',
  sometimes: 'A veces no alcanza',
  no: 'No alcanza',
};

const trackingLabel: Record<string, string> = {
  yes: 'Controla gastos',
  sometimes: 'Control parcial',
  no: 'Sin tracking',
};

export default function ProfileCard({
  className,
  userName,
  profile,
  intake,
  injected,
  actions,
  compactQuestionnaireCta,
  onOpenQuestionnaire,
}: ProfileCardProps) {
  const profileData = profile?.profile ?? profile ?? {};
  const intakeData = intake?.intake ?? intake ?? {};
  const tags: string[] = [];

  const pushTag = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      tags.push(`${label}: ${value}`);
    }
  };

  pushTag('Claridad', profileData.financialClarity);
  pushTag('Decision', profileData.decisionStyle);
  pushTag('Horizonte', profileData.timeHorizon);
  pushTag('Presion', profileData.financialPressure);
  pushTag('Patron', profileData.emotionalPattern);

  const diagnostics = profile?.diagnosticNarrative || profileData?.diagnosticNarrative;
  const shortDiagnostic =
    typeof diagnostics === 'string' && diagnostics.trim().length > 0
      ? diagnostics.trim()
      : 'Aun sin diagnostico definitivo.';

  const intakeHighlights = [
    typeof intakeData.profession === 'string' && intakeData.profession.trim()
      ? intakeData.profession.trim()
      : null,
    typeof intakeData.incomeBand === 'string' ? incomeBandLabel[intakeData.incomeBand] ?? null : null,
    typeof intakeData.expensesCoverage === 'string'
      ? coverageLabel[intakeData.expensesCoverage] ?? null
      : null,
    typeof intakeData.tracksExpenses === 'string'
      ? trackingLabel[intakeData.tracksExpenses] ?? null
      : null,
    intakeData.hasDebt === true ? 'Con deuda activa' : 'Sin deuda declarada',
    intakeData.hasSavingsOrInvestments === true ? 'Con ahorro/inversión' : 'Sin ahorro declarado',
  ].filter(Boolean) as string[];

  const stressLevel =
    typeof intakeData.moneyStressLevel === 'number'
      ? `${intakeData.moneyStressLevel}/10 estrés`
      : null;

  const initials = (userName ?? 'Usuario')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || 'U';

  const classes = ['profile-card', className].filter(Boolean).join(' ');

  if (compactQuestionnaireCta) {
    return (
      <article className={`${classes} profile-card-compact`}>
        <span className="profile-badge">{injected ? 'Perfil activo' : 'Perfil'}</span>
        <div className="profile-header">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div className="profile-identity">
            <div className="profile-name">{userName ?? 'Usuario'}</div>
          </div>
        </div>
        <button
          type="button"
          className="button-primary profile-questionnaire-btn"
          onClick={onOpenQuestionnaire}
        >
          Ver respuestas cuestionario
        </button>
      </article>
    );
  }

  return (
    <article className={classes}>
      <span className="profile-badge">{injected ? 'Perfil activo' : 'Perfil'}</span>

      <div className="profile-header">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-identity">
          <div className="profile-name">{userName ?? 'Usuario'}</div>
          <div className="profile-subtitle">{injected ? 'Datos inyectados para demo' : 'Perfil en construccion'}</div>
        </div>
      </div>

      <div className="panel-text">{shortDiagnostic}</div>

      {(() => {
        const visibleHighlights = [...intakeHighlights];
        if (stressLevel) visibleHighlights.push(stressLevel);
        if (visibleHighlights.length === 0) return null;
        return (
          <div className="profile-intake-strip">
            {visibleHighlights.slice(0, 4).map((item) => (
              <span
                key={item}
                className={`profile-intake-pill${item === stressLevel ? ' is-stress' : ''}`}
              >
                {item}
              </span>
            ))}
          </div>
        );
      })()}

      {actions ? <div className="profile-actions">{actions}</div> : null}

      {!actions && tags.length > 0 ? (
        <div className="profile-meta">
          {tags.slice(0, 5).map((tag) => (
            <span key={tag} className="pill">{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
