export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  let sessionId = localStorage.getItem('agent_session_id');

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('agent_session_id', sessionId);
  }

  return sessionId;
}
