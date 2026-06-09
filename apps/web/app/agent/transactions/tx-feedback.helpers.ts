export type TxFeedbackKind = 'error' | 'notice';

export function shouldSurfaceTxFeedback(params: {
  message: string | null | undefined;
  documentsLoading: boolean;
  txAssistantLoading: boolean;
  kind: TxFeedbackKind;
}): boolean {
  const message = typeof params.message === 'string' ? params.message.trim() : '';
  if (!message) return false;
  if (params.documentsLoading) return false;
  if (params.kind === 'error' && params.txAssistantLoading) return false;
  return true;
}
