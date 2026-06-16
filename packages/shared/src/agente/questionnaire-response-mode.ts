export type QuestionnaireChatTheme = 'chat-1' | 'chat-2' | 'chat-3';

const GENERIC_CHOICE_MARKERS = [
  'opcion mas segura',
  'opcion equilibrada',
  'opcion agresiva',
  'prefiero explicarlo yo',
  'prefiero explicar',
  'prefiero otro monto',
];

const OPEN_QUESTION_PATTERNS: RegExp[] = [
  /\b(cómo|como)\b/i,
  /\b(por qué|porque|por que)\b/i,
  /\b(describe|explica|cuéntame|cuentame|detalla)\b/i,
  /\b(en tus palabras|qué piensas|que piensas|qué sientes|que sientes)\b/i,
  /\b(dónde está|donde esta|a dónde va|adonde va|dónde va|donde va)\b/i,
  /\bobjetivo\b.*\b(concreto|inversión|inversion)\b/i,
  /\bcuál es tu objetivo\b/i,
  /\bcual es tu objetivo\b/i,
  /\bqué harías\b/i,
  /\bque harias\b/i,
  /\bqué significa\b/i,
  /\bque significa\b/i,
];

function normalizeChoice(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isGenericQuestionnaireChoices(choices: string[]): boolean {
  if (!choices.length) return true;

  const normalized = choices.map(normalizeChoice);
  const genericHits = normalized.filter((choice) =>
    GENERIC_CHOICE_MARKERS.some((marker) => choice.includes(marker)),
  ).length;

  const profileHits = normalized.filter((choice) =>
    ['conservador', 'balanceado', 'agresivo'].includes(choice),
  ).length;

  if (profileHits >= 3) return true;
  if (genericHits >= 3) return true;
  if (normalized.length <= 2 && genericHits > 0) return true;

  return false;
}

function choicesMismatchQuestion(question: string, choices: string[]): boolean {
  const q = question.toLowerCase();
  const choiceText = choices.join(' ').toLowerCase();

  if (/\b(dónde|donde|a dónde|adonde)\b/.test(q) && /\b(mensual|quincenal|semanal)\b/.test(choiceText)) {
    return true;
  }

  if (/\bobjetivo\b/.test(q) && /\b(conservador|agresivo|equilibrad|opción más segura|opcion mas segura)\b/.test(choiceText)) {
    return true;
  }

  if (/\b(lo estás|lo estas|estás gastando|estas gastando|sin asignar)\b/.test(q) && /\b(mensual|quincenal|semanal)\b/.test(choiceText)) {
    return true;
  }

  return false;
}

export function shouldUseOpenTextQuestionnaireInput(question: string, choices: string[]): boolean {
  if (!choices.length) return true;
  if (isGenericQuestionnaireChoices(choices)) return true;
  if (choicesMismatchQuestion(question, choices)) return true;
  if (OPEN_QUESTION_PATTERNS.some((pattern) => pattern.test(question))) return true;
  return false;
}

export function resolveQuestionnaireResponseMode(
  question: string,
  choices: string[],
  chatTheme?: QuestionnaireChatTheme | null,
): 'open-text' | 'choices' {
  if (chatTheme === 'chat-3') return 'open-text';
  if (chatTheme === 'chat-1' || chatTheme === 'chat-2') {
    return shouldUseOpenTextQuestionnaireInput(question, choices) ? 'open-text' : 'choices';
  }
  return 'choices';
}
