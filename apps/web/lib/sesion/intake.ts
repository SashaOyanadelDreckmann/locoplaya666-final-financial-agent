// apps/web/lib/intake.ts
import type { IntakeQuestionnaire } from
  '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { getSessionApiBaseUrl } from '../api/base';
import { parseApiResponse } from '../api/envelope';
import { getCsrfToken } from './csrf';

export async function submitIntake(
  data: IntakeQuestionnaire,
) {
  const API_URL = getSessionApiBaseUrl();
  const csrfToken = getCsrfToken();
  const payload = { ...data };

  const res = await fetch(`${API_URL}/intake/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return parseApiResponse<any>(res);
}
