/**
 * Tipos específicos para respuestas de API
 * Reemplaza el uso de `any` en todo el código
 */

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface ApiSessionInfo {
  user: ApiUser;
  sessionId: string;
  expiresAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  code?: string;
}

export interface ProfileData {
  diagnosticNarrative?: string;
  profile?: Record<string, unknown>;
  tensions?: string[];
  hypotheses?: string[];
}

export interface ParsedDocument {
  name: string;
  text: string;
  type?: string;
}

export interface SheetData {
  id: string;
  title: string;
  url?: string;
  data?: Record<string, unknown>;
}

export type ParseApiResponseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
