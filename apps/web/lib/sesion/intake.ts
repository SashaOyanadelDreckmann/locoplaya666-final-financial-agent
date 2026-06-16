import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { normalizeIntakeQuestionnaire } from '@financial-agent/shared';
import { getSessionApiBaseUrl } from '../api/base';
import { parseApiResponse } from '../api/envelope';
import { getCsrfToken } from './csrf';

export async function submitIntake(data: IntakeQuestionnaire) {
  const API_URL = getSessionApiBaseUrl();
  const csrfToken = getCsrfToken();
  const payload = normalizeIntakeQuestionnaire(data);

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

export async function updateIntakeQuestionnaire(data: IntakeQuestionnaire) {
  const API_URL = getSessionApiBaseUrl();
  const csrfToken = getCsrfToken();

  const res = await fetch(`${API_URL}/intake/update`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(normalizeIntakeQuestionnaire(data)),
  });

  return parseApiResponse<{
    intake: IntakeQuestionnaire;
    updated: boolean;
    fincoinCharge: false;
  }>(res);
}
