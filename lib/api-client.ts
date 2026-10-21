// Typed browser-side wrapper around the JSON API described in docs/API.md.
// Every non-2xx answer becomes a RequestError; a failed network request becomes RequestError with code 'NETWORK'.
// (Named apart from the server's ApiError in lib/server/http.ts, which is the error the API answers with.)

import type { Answers, Field } from '@/lib/schema';
import type { getAnalytics, listForms, listResponses, toPublicForm } from '@/lib/server/forms';
import type { StoredForm } from '@/lib/server/store';

// Response shapes come from the server code itself (type-only imports: nothing of it reaches the browser
// bundle), so renaming a field on the server breaks this file's build instead of silently breaking the UI.
export type FormDto = StoredForm;
export type FormStatus = FormDto['status'];
export type FormSummary = ReturnType<typeof listForms>[number];
export type ResponseView = ReturnType<typeof listResponses>['responses'][number];
export type ResponseItem = ResponseView['items'][number];
export type Analytics = ReturnType<typeof getAnalytics>;
export type AnalyticsField = Analytics['fields'][number];
export type PublicForm = ReturnType<typeof toPublicForm>;

export interface FormContentInput {
  title: string;
  description: string;
  fields: Field[];
  version?: number;
}

export type AnalyticsEvent = { sessionId: string; type: 'view' | 'start' } | { sessionId: string; type: 'field'; fieldId: string };

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, body?: unknown) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.body = body;
  }
}

export const isRequestError = (e: unknown): e is RequestError => e instanceof RequestError;

/** Human-readable message for any thrown value (shared by all UI components). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Неизвестная ошибка';
}

/** Requests that take longer than this are aborted and reported like a lost connection. */
const REQUEST_TIMEOUT_MS = 20_000;
const NETWORK_MESSAGE = 'Нет соединения с сервером';
const TIMEOUT_MESSAGE = 'Сервер не ответил вовремя. Проверьте соединение и попробуйте ещё раз.';

const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Проверьте введённые данные',
  403: 'Доступ запрещён',
  404: 'Не найдено',
  409: 'Данные изменились, обновите страницу',
  413: 'Слишком большой объём данных',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The timeout also covers reading the body.
    text = res.status === 204 ? '' : await res.text();
  } catch (e) {
    throw new RequestError(0, 'NETWORK', isTimeout(e) ? TIMEOUT_MESSAGE : NETWORK_MESSAGE);
  }

  if (res.status === 204) return null as T;

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = isRecord(data) && isRecord(data.error) ? data.error : null;
    const code = typeof err?.code === 'string' ? err.code : res.status >= 500 ? 'INTERNAL' : `HTTP_${res.status}`;
    const message =
      typeof err?.message === 'string' && err.message
        ? err.message
        : (STATUS_MESSAGES[res.status] ?? `Ошибка сервера (${res.status}). Попробуйте ещё раз.`);
    const fields = isRecord(err?.fields) ? (err.fields as Record<string, string>) : undefined;
    throw new RequestError(res.status, code, message, fields, data);
  }

  if (data === null) {
    throw new RequestError(res.status, 'INVALID_RESPONSE', 'Сервер вернул неожиданный ответ');
  }
  return data as T;
}

const enc = encodeURIComponent;

export interface FormsListResult {
  forms: FormSummary[];
  /** Present when the data file was corrupt at startup and set aside under this name. */
  storage?: { recoveredFrom?: string };
}

export const api = {
  listForms: () => request<FormsListResult>('GET', '/api/forms'),

  createForm: (input: { title: string; description?: string; fields?: Field[] }) =>
    request<{ form: FormDto }>('POST', '/api/forms', input).then((r) => r.form),

  getForm: (id: string) => request<{ form: FormDto; responseCount: number }>('GET', `/api/forms/${enc(id)}`),

  updateForm: (id: string, input: FormContentInput) =>
    request<{ form: FormDto }>('PUT', `/api/forms/${enc(id)}`, input).then((r) => r.form),

  /** `version` guards against publishing a form that another tab has changed (409 VERSION_CONFLICT). */
  publishForm: (id: string, version?: number) =>
    request<{ form: FormDto }>('POST', `/api/forms/${enc(id)}/publish`, { version }).then((r) => r.form),

  unpublishForm: (id: string, version?: number) =>
    request<{ form: FormDto }>('POST', `/api/forms/${enc(id)}/unpublish`, { version }).then((r) => r.form),

  deleteForm: (id: string) => request<null>('DELETE', `/api/forms/${enc(id)}`),

  listResponses: (id: string) => request<{ responses: ResponseView[]; total: number }>('GET', `/api/forms/${enc(id)}/responses`),

  /** Times in the CSV use the manager's time zone, like the admin screens. */
  responsesCsvUrl: (id: string) =>
    `/api/forms/${enc(id)}/responses/csv?tz=${enc(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,

  getAnalytics: (id: string) => request<Analytics>('GET', `/api/forms/${enc(id)}/analytics`),

  getPublicForm: (publicId: string) =>
    request<{ form: PublicForm }>('GET', `/api/public/forms/${enc(publicId)}`).then((r) => r.form),

  submitResponse: (
    publicId: string,
    body: { answers: Answers; submissionId: string; sessionId?: string; formVersion?: number },
  ) => request<{ response: { id: string; submittedAt: string } }>('POST', `/api/public/forms/${enc(publicId)}/responses`, body).then((r) => r.response),

  /** Fire-and-forget analytics event: never throws, never surfaces errors. */
  sendEvent: (publicId: string, event: AnalyticsEvent) => {
    try {
      void fetch(`/api/public/forms/${enc(publicId)}/events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).catch(() => {});
    } catch {
      // ignore: analytics must never break the form
    }
  },
};

/** The fresh public form that a 409 FORM_CHANGED answer carries, if any. */
export function changedFormFrom(error: RequestError): PublicForm | null {
  const body = error.body;
  if (isRecord(body) && isRecord(body.form) && Array.isArray(body.form.fields)) {
    return body.form as unknown as PublicForm;
  }
  return null;
}
