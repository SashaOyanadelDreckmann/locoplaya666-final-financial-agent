import type {
  WelcomeGuideAction,
  WelcomeGuideEnrichment,
  WelcomeProductHint,
} from './welcome-guide.types';

type GuideContext = {
  firstName?: string;
  intake?: Record<string, unknown>;
  diagnosisUnlocked?: boolean;
  budgetUnlocked?: boolean;
  hasDiagnosis?: boolean;
  topTension?: string | null;
  topHypothesis?: string | null;
  productHints?: WelcomeProductHint[];
};

function readBool(value: unknown): boolean {
  return value === true || value === 'true';
}

export function shouldIncludeWelcomeProductRecommendations(params: {
  chatId: 'chat-1' | 'chat-2' | 'chat-3';
  diagnosisUnlocked?: boolean;
}): boolean {
  return !(params.chatId === 'chat-1' && !params.diagnosisUnlocked);
}

export function buildProductSearchQueries(
  intake: Record<string, unknown>,
  chatId: 'chat-1' | 'chat-2' | 'chat-3',
): string[] {
  const hasDebt = readBool(intake.hasDebt);
  const hasSavings = readBool(intake.hasSavingsOrInvestments);
  const queries: string[] = [];

  if (chatId === 'chat-3') {
    if (hasSavings) {
      queries.push('Chile fondos ESG inversión sostenible rentabilidad CMF');
    }
    queries.push('inversión de impacto Chile Latinoamérica ejemplos reales');
    if (hasDebt) {
      queries.push('deuda consumo Chile impacto social responsabilidad financiera');
    }
    return queries.slice(0, 2);
  }

  if (chatId === 'chat-2') {
    if (hasDebt) {
      queries.push('Chile tarjeta crédito tasa interés CMF bancos 2025');
    }
    if (hasSavings || !hasDebt) {
      queries.push('Fintual fondos mutuos Chile comisión rentabilidad');
      queries.push('comprar acciones Chile corredora comisión 2025');
    }
    if (queries.length === 0) {
      queries.push('productos inversión Chile APV fondos mutuos comparación');
    }
    return queries.slice(0, 2);
  }

  if (hasDebt) {
    queries.push('Chile crédito consumo refinanciar deuda tasas bancos');
  }
  if (hasSavings) {
    queries.push('Fintual Chile fondos mutuos perfil riesgo comisión');
  } else {
    queries.push('cuenta vista Chile sin comisión banco digital 2025');
  }
  return queries.slice(0, 2);
}

export function formatProductHintsBlurb(hints: WelcomeProductHint[]): string | undefined {
  const trimmed = hints
    .map((hint) => {
      const fact = hint.fact.trim();
      if (!fact) return '';
      return `${hint.label}: ${fact}${hint.source ? ` (${hint.source})` : ''}`;
    })
    .filter(Boolean)
    .slice(0, 2);
  if (trimmed.length === 0) return undefined;
  return trimmed.join(' · ');
}

function panelAction(
  id: string,
  label: string,
  panelSection: WelcomeGuideAction['panelSection'],
  message: string,
): WelcomeGuideAction {
  return { id, label, kind: 'panel', panelSection, message };
}

function messageAction(id: string, label: string, message: string): WelcomeGuideAction {
  return { id, label, kind: 'message', message };
}

export function buildChat1WelcomeGuideActions(ctx: GuideContext): WelcomeGuideAction[] {
  const firstName = String(ctx.firstName ?? '').trim() || 'Hola';
  const intake = ctx.intake ?? {};
  const hasDebt = readBool(intake.hasDebt);
  const hasSavings = readBool(intake.hasSavingsOrInvestments);
  const includeProducts = shouldIncludeWelcomeProductRecommendations({
    chatId: 'chat-1',
    diagnosisUnlocked: ctx.diagnosisUnlocked,
  });
  const productLine = includeProducts ? formatProductHintsBlurb(ctx.productHints ?? []) : '';

  if (ctx.diagnosisUnlocked) {
    return [
      messageAction(
        'deepen-diagnosis',
        'Profundizar diagnóstico',
        `${firstName}, profundicemos el diagnóstico con evidencia verificable: tensiones, hipótesis y el siguiente movimiento concreto según mi presupuesto y cartolas.`,
      ),
      messageAction(
        'compare-products',
        'Comparar productos reales',
        [
          `${firstName}, compara productos financieros chilenos reales para mi perfil`,
          hasDebt ? '(deuda y refinanciamiento)' : '',
          hasSavings ? '(inversión y fondos)' : '',
          'con datos verificables de instituciones como bancos, Fintual u otras corredoras.',
          productLine ? `Referencia inicial: ${productLine}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
      messageAction(
        'next-step',
        'Definir siguiente paso',
        'Con mi diagnóstico actual, ¿cuál es el único paso de mayor impacto esta semana? Sé específico con montos, plazos y riesgos.',
      ),
    ];
  }

  const actions: WelcomeGuideAction[] = [
    panelAction(
      'upload-statement',
      'Subir cartola',
      'transactions',
      'Quiero subir mi cartola o movimientos del mes para iniciar el diagnóstico.',
    ),
  ];

  if (ctx.budgetUnlocked) {
    actions.push(
      panelAction(
        'open-budget',
        'Armar presupuesto',
        'budget',
        'Quiero completar mi presupuesto mensual con ingresos y gastos reales.',
      ),
    );
  }

  actions.push(
    messageAction(
      'priority-now',
      'Mi prioridad ahora',
      'Según mi intake, ¿cuál debería ser mi prioridad financiera número 1 y por qué? Respuesta breve y accionable.',
    ),
  );

  return actions;
}

export function buildChat2WelcomeGuideActions(ctx: GuideContext): WelcomeGuideAction[] {
  const firstName = String(ctx.firstName ?? '').trim() || 'Hola';
  const intake = ctx.intake ?? {};
  const hasDebt = readBool(intake.hasDebt);
  const hasSavings = readBool(intake.hasSavingsOrInvestments);
  const tension = ctx.topTension?.trim();
  const productLine = formatProductHintsBlurb(ctx.productHints ?? []);

  const actions: WelcomeGuideAction[] = [
    messageAction(
      'liquidity',
      'Priorizar liquidez',
      `${firstName}, abre el plan priorizando caja y liquidez de 0-30 días con números de mi presupuesto.`,
    ),
  ];

  if (hasDebt || tension?.toLowerCase().includes('deuda')) {
    actions.push(
      messageAction(
        'debt-plan',
        'Plan de deuda',
        'Diseña una secuencia de pago de deuda con tasas reales de Chile, sin inventar cifras de mi caso.',
      ),
    );
  }

  if (hasSavings || !hasDebt) {
    actions.push(
      messageAction(
        'invest-real',
        'Inversión con data real',
        [
          'Propón una ruta de inversión con productos reales en Chile',
          '(Fintual, fondos, acciones u otra institución)',
          'citando comisiones o rentabilidades verificables.',
          productLine ? `Señales web: ${productLine}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    );
  } else {
    actions.push(
      messageAction(
        'cards-banks',
        'Tarjetas y bancos',
        [
          'Compara 2-3 alternativas reales de tarjetas o cuentas en Chile para mi perfil,',
          'con tasas o beneficios verificables en fuentes públicas.',
          productLine ? `Referencia: ${productLine}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    );
  }

  actions.push(
    messageAction(
      'executive-plan',
      'Armar plan ejecutivo',
      ctx.hasDiagnosis
        ? 'Con mi diagnóstico, entrega un borrador ejecutivo: prioridades 0-90 días, secuencia y una decisión que deba validar yo.'
        : 'Con el contexto disponible, arma un borrador de plan ejecutivo con prioridades 0-90 días y trade-offs explícitos.',
    ),
  );

  return actions.slice(0, 4);
}

export function buildChat3WelcomeGuideActions(ctx: GuideContext): WelcomeGuideAction[] {
  const firstName = String(ctx.firstName ?? '').trim() || 'Hola';
  const tension = ctx.topTension?.trim();
  const productLine = formatProductHintsBlurb(ctx.productHints ?? []);

  const actions: WelcomeGuideAction[] = [
    messageAction(
      'freedom',
      '¿Libertad real?',
      `${firstName}, ¿el dinero compra libertad real o solo posterga miedos? Conecta la respuesta con mi diagnóstico y presupuesto.`,
    ),
    messageAction(
      'values',
      'Gasto y valores',
      '¿En qué gastos de mi situación actual hay contradicción entre lo que digo valorar y lo que hago con mi plata?',
    ),
  ];

  if (tension) {
    actions.push(
      messageAction(
        'tension',
        'Explorar mi tensión',
        `Profundicemos esta tensión de mi diagnóstico: ${tension}. ¿Qué revela sobre mí más allá de los números?`,
      ),
    );
  } else {
    actions.push(
      messageAction(
        'complicity',
        'Inversión y complicidad',
        [
          '¿Soy cómplice de algo al invertir o ahorrar como lo hago hoy?',
          'Usa referencias verificables de productos o marcos ESG/impacto en Chile si aplican.',
          productLine ? `Contexto: ${productLine}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    );
  }

  actions.push(
    messageAction(
      'synthesis',
      'Cerrar lectura reflexiva',
      'Ayúdame a cerrar una lectura reflexiva: valores en tensión, dilema personal y una pregunta abierta para seguir pensando.',
    ),
  );

  return actions.slice(0, 4);
}

export function buildWelcomeGuideEnrichment(params: {
  chatId: 'chat-1' | 'chat-2' | 'chat-3';
  firstName?: string;
  intake?: Record<string, unknown>;
  diagnosisUnlocked?: boolean;
  budgetUnlocked?: boolean;
  hasDiagnosis?: boolean;
  topTension?: string | null;
  topHypothesis?: string | null;
  productHints?: WelcomeProductHint[];
}): WelcomeGuideEnrichment {
  const ctx: GuideContext = {
    firstName: params.firstName,
    intake: params.intake,
    diagnosisUnlocked: params.diagnosisUnlocked,
    budgetUnlocked: params.budgetUnlocked,
    hasDiagnosis: params.hasDiagnosis,
    topTension: params.topTension,
    topHypothesis: params.topHypothesis,
    productHints: params.productHints,
  };

  const guideActions =
    params.chatId === 'chat-3'
      ? buildChat3WelcomeGuideActions(ctx)
      : params.chatId === 'chat-2'
        ? buildChat2WelcomeGuideActions(ctx)
        : buildChat1WelcomeGuideActions(ctx);

  const includeProducts = shouldIncludeWelcomeProductRecommendations({
    chatId: params.chatId,
    diagnosisUnlocked: params.diagnosisUnlocked,
  });
  const productHints = includeProducts ? (params.productHints ?? []).slice(0, 3) : [];
  const productBlurb = includeProducts ? formatProductHintsBlurb(productHints) : undefined;

  return {
    chatId: params.chatId,
    guideActions,
    productHints,
    productBlurb,
  };
}
