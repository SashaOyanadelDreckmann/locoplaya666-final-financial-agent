import {
  buildMovementPromptKey,
  collectRetrievalSignalsUsed,
  planDeterministicTransactionAnswer,
  retrieveMovementsForQuestion,
  type MovementRow,
} from '@financial-agent/shared';

export type TransactionsPlannerResult = {
  assistant_text: string;
  suggested_followups: string[];
  referenced_movement_keys: string[];
  signals_used: string[];
  retrieval_mode: 'targeted' | 'overview';
  matched_count: number;
  source: 'deterministic';
};

export function planTransactionsAssistantTurn(input: {
  question: string;
  dashboard: unknown;
}): TransactionsPlannerResult | null {
  const question = String(input.question ?? '').trim();
  if (!question) return null;

  const deterministic = planDeterministicTransactionAnswer(question, input.dashboard);
  if (!deterministic) return null;

  const movements = Array.isArray((input.dashboard as { movements?: MovementRow[] } | null)?.movements)
    ? ((input.dashboard as { movements: MovementRow[] }).movements ?? [])
    : [];
  const retrieval = retrieveMovementsForQuestion(question, movements);

  return {
    assistant_text: deterministic.reply,
    suggested_followups: deterministic.suggestedFollowups,
    referenced_movement_keys: deterministic.referencedMovementKeys,
    signals_used: collectRetrievalSignalsUsed(retrieval.signals),
    retrieval_mode: retrieval.mode,
    matched_count: retrieval.matchedCount,
    source: 'deterministic',
  };
}

export function movementKeysFromRetrieval(question: string, movements: MovementRow[]): string[] {
  const retrieval = retrieveMovementsForQuestion(question, movements, { maxRetrieved: 8, overviewSample: 12 });
  return retrieval.movements.map((row) => buildMovementPromptKey(row));
}
