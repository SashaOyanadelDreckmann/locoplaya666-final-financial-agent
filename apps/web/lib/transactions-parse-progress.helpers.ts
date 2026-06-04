export type DocumentsParseStage =
  | 'idle'
  | 'reading'
  | 'uploading'
  | 'extracting'
  | 'structuring'
  | 'summarizing'
  | 'complete';

export type DocumentsParseProgress = {
  stage: DocumentsParseStage;
  percent: number;
  detail: string;
};

export const IDLE_PARSE_PROGRESS: DocumentsParseProgress = {
  stage: 'idle',
  percent: 0,
  detail: '',
};

export const PARSE_PROGRESS_STEPS = [
  { stage: 'reading' as const, label: 'Ingesta' },
  { stage: 'uploading' as const, label: 'Envío' },
  { stage: 'extracting' as const, label: 'Extracción' },
  { stage: 'structuring' as const, label: 'Estructura' },
  { stage: 'summarizing' as const, label: 'Resumen' },
];

const STAGE_ORDER: DocumentsParseStage[] = [
  'reading',
  'uploading',
  'extracting',
  'structuring',
  'summarizing',
  'complete',
];

export function clampParsePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function stageIndex(stage: DocumentsParseStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index >= 0 ? index : -1;
}

export function advanceParseProgressTick(current: DocumentsParseProgress): DocumentsParseProgress {
  if (current.stage !== 'extracting' && current.stage !== 'uploading') return current;
  const cap = current.stage === 'uploading' ? 34 : 86;
  if (current.percent >= cap) return current;
  return {
    ...current,
    percent: clampParsePercent(current.percent + 2),
  };
}

export function buildParseProgressLabels(progress: DocumentsParseProgress | null | undefined) {
  const stage = progress?.stage ?? 'idle';
  const detail = progress?.detail?.trim() ?? '';

  if (stage === 'reading') {
    return {
      modeLabel: 'Preparando evidencia',
      metaLabel: 'Lectura local',
      primaryCopy: detail || 'Leyendo archivos en tu dispositivo.',
    };
  }
  if (stage === 'uploading') {
    return {
      modeLabel: 'Enviando cartola',
      metaLabel: 'Transferencia segura',
      primaryCopy: detail || 'Subiendo respaldos al analizador.',
    };
  }
  if (stage === 'extracting') {
    return {
      modeLabel: 'Extrayendo movimientos',
      metaLabel: 'OCR y parser financiero',
      primaryCopy: detail || 'Detectando fechas, montos y comercios.',
    };
  }
  if (stage === 'structuring') {
    return {
      modeLabel: 'Estructurando dashboard',
      metaLabel: 'Normalización y métricas',
      primaryCopy: detail || 'Consolidando categorías, totales y alertas.',
    };
  }
  if (stage === 'summarizing') {
    return {
      modeLabel: 'Generando resumen',
      metaLabel: 'Resumen ejecutivo',
      primaryCopy: detail || 'Preparando la ficha analítica del producto.',
    };
  }
  if (stage === 'complete') {
    return {
      modeLabel: 'Análisis listo',
      metaLabel: 'Finalizado',
      primaryCopy: detail || 'Ya puedes revisar movimientos y hacer preguntas.',
    };
  }

  return {
    modeLabel: 'Procesando',
    metaLabel: 'Análisis en curso',
    primaryCopy: detail || 'Estamos procesando tu evidencia.',
  };
}

export function resolveStepState(
  stepStage: DocumentsParseStage,
  activeStage: DocumentsParseStage,
): 'pending' | 'active' | 'done' {
  const stepIdx = stageIndex(stepStage);
  const activeIdx = stageIndex(activeStage);
  if (activeIdx < 0 || stepIdx < 0) return 'pending';
  if (stepIdx < activeIdx) return 'done';
  if (stepIdx === activeIdx) return 'active';
  return 'pending';
}
