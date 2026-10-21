import { randomUUID } from 'node:crypto';
import {
  UUID_RE,
  formatValue,
  generateId,
  normalizeFormInput,
  validateAnswers,
  type Field,
} from '../schema';
import { ApiError, notFound, validationError } from './http';
import type { DbData, JsonStore, StoredForm, StoredResponse, StoredSession } from './store';

/** Analytics sessions kept per form; extra sessions are ignored to bound file growth. */
const MAX_SESSIONS_PER_FORM = 20_000;
/** Hard cap that keeps a scripted flood from growing the data file without bound. */
const MAX_RESPONSES_PER_FORM = 10_000;
const EVENT_TYPES = new Set(['view', 'start', 'field']);

const now = () => new Date().toISOString();
const hasErrors = (errors: object) => Object.keys(errors).length > 0;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function findForm(data: DbData, id: string): StoredForm {
  const form = data.forms.find((f) => f.id === id);
  if (!form) throw notFound('Форма');
  return form;
}

function findByPublicId(data: DbData, publicId: string): StoredForm {
  const form = data.forms.find((f) => f.publicId === publicId);
  if (!form) throw notFound('Форма');
  return form;
}

const notPublished = () => new ApiError(403, 'FORM_NOT_PUBLISHED', 'Форма сейчас не принимает ответы');

export function toPublicForm(form: StoredForm) {
  const { publicId, title, description, fields, version } = form;
  return { publicId, title, description, fields, version };
}

// ---------- Admin: forms ----------

export function listForms(store: JsonStore) {
  const counts = new Map<string, number>();
  for (const r of store.data.responses) counts.set(r.formId, (counts.get(r.formId) ?? 0) + 1);
  // Newest first; sort is stable, so equal timestamps (same millisecond) keep the latest-created first.
  return [...store.data.forms]
    .reverse()
    .map((f) => ({
      id: f.id,
      publicId: f.publicId,
      title: f.title,
      description: f.description,
      status: f.status,
      fieldCount: f.fields.length,
      responseCount: counts.get(f.id) ?? 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      publishedAt: f.publishedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getForm(store: JsonStore, id: string): StoredForm {
  return findForm(store.data, id);
}

export function createForm(store: JsonStore, body: unknown): Promise<StoredForm> {
  const { value, errors } = normalizeFormInput(body);
  if (!value || hasErrors(errors)) throw validationError(errors);
  return store.mutate((data) => {
    let publicId = generateId(10);
    while (data.forms.some((f) => f.publicId === publicId)) publicId = generateId(10);
    const ts = now();
    const form: StoredForm = {
      id: randomUUID(),
      publicId,
      ...value,
      status: 'draft',
      version: 1,
      createdAt: ts,
      updatedAt: ts,
      publishedAt: null,
    };
    data.forms.push(form);
    return form;
  });
}

export function updateForm(store: JsonStore, id: string, body: Record<string, unknown>): Promise<StoredForm> {
  const { value, errors } = normalizeFormInput(body);
  return store.mutate((data) => {
    const form = findForm(data, id);
    if (body.version != null && body.version !== form.version) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Форму уже изменили в другой вкладке. Загрузите актуальную версию.');
    }
    if (!Array.isArray(body.fields)) throw validationError({ fields: 'Передайте полный список полей формы' });
    if (!value || hasErrors(errors)) throw validationError(errors);
    if (form.status === 'published' && value.fields.length === 0) {
      throw validationError({ fields: 'У опубликованной формы должно быть хотя бы одно поле' });
    }
    Object.assign(form, value, { version: form.version + 1, updatedAt: now() });
    return form;
  });
}

export function setPublished(store: JsonStore, id: string, published: boolean): Promise<StoredForm> {
  return store.mutate((data) => {
    const form = findForm(data, id);
    if (published && form.fields.length === 0) {
      throw validationError({ fields: 'Добавьте хотя бы одно поле перед публикацией' });
    }
    const ts = now();
    form.status = published ? 'published' : 'draft';
    if (published) form.publishedAt = ts;
    form.updatedAt = ts;
    return form;
  });
}

export function deleteForm(store: JsonStore, id: string): Promise<void> {
  return store.mutate((data) => {
    findForm(data, id);
    data.forms = data.forms.filter((f) => f.id !== id);
    data.responses = data.responses.filter((r) => r.formId !== id);
    data.sessions = data.sessions.filter((s) => s.formId !== id);
  });
}

// ---------- Admin: responses ----------

function responsesOf(data: DbData, formId: string): StoredResponse[] {
  // Newest first; ties keep the most recently stored first.
  return data.responses
    .filter((r) => r.formId === formId)
    .reverse()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function listResponses(store: JsonStore, id: string) {
  findForm(store.data, id);
  const responses = responsesOf(store.data, id).map((r) => ({
    id: r.id,
    submittedAt: r.submittedAt,
    formVersion: r.formVersion,
    items: r.fields.map((f) => ({
      fieldId: f.id,
      label: f.label,
      type: f.type,
      value: r.answers[f.id] ?? null,
      display: formatValue(f, r.answers[f.id]),
    })),
  }));
  return { responses, total: responses.length };
}

const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string, field?: Field): string {
  let v = value;
  // Neutralize spreadsheet formulas; validated numbers legitimately start with -.
  if (FORMULA_START.test(v) && field?.type !== 'number') v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function responsesCsv(store: JsonStore, id: string) {
  const form = findForm(store.data, id);
  const responses = responsesOf(store.data, id);

  // Current fields first, then fields that only exist in older responses.
  const columns: { id: string; label: string }[] = form.fields.map((f) => ({ id: f.id, label: f.label }));
  const known = new Set(columns.map((c) => c.id));
  for (const r of responses) {
    for (const f of r.fields) {
      if (!known.has(f.id)) {
        known.add(f.id);
        columns.push({ id: f.id, label: `${f.label} (удалено)` });
      }
    }
  }

  const dateFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
  const lines = [['Дата отправки', ...columns.map((c) => c.label)].map((h) => csvCell(h)).join(';')];
  for (const r of responses) {
    const byId = new Map(r.fields.map((f) => [f.id, f]));
    const cells = columns.map((c) => {
      const field = byId.get(c.id);
      if (!field || r.answers[c.id] === undefined) return '';
      return csvCell(formatValue(field, r.answers[c.id]), field);
    });
    lines.push([csvCell(dateFmt.format(new Date(r.submittedAt))), ...cells].join(';'));
  }
  return { csv: `﻿${lines.join('\r\n')}\r\n`, filename: `responses-${form.publicId}.csv`, title: form.title };
}

// ---------- Public ----------

export function getPublicForm(store: JsonStore, publicId: string) {
  const form = findByPublicId(store.data, publicId);
  if (form.status !== 'published') throw notPublished();
  return toPublicForm(form);
}

function upsertSession(data: DbData, formId: string, sessionId: string): StoredSession | null {
  const existing = data.sessions.find((s) => s.id === sessionId && s.formId === formId);
  if (existing) return existing;
  if (data.sessions.filter((s) => s.formId === formId).length >= MAX_SESSIONS_PER_FORM) return null;
  const session: StoredSession = {
    id: sessionId,
    formId,
    viewedAt: null,
    startedAt: null,
    submittedAt: null,
    fields: [],
    lastFieldId: null,
  };
  data.sessions.push(session);
  return session;
}

export function submitResponse(
  store: JsonStore,
  publicId: string,
  body: Record<string, unknown>,
): Promise<{ status: 200 | 201; response: { id: string; submittedAt: string } }> {
  return store.mutate((data) => {
    const form = findByPublicId(data, publicId);
    if (!isUuid(body.submissionId)) {
      throw validationError({ submissionId: 'Некорректный идентификатор отправки' });
    }
    // Idempotency first: a retry of an accepted submission is acknowledged even if the form changed since.
    const duplicate = data.responses.find((r) => r.formId === form.id && r.submissionId === body.submissionId);
    if (duplicate) return { status: 200, response: { id: duplicate.id, submittedAt: duplicate.submittedAt } };

    if (form.status !== 'published') throw notPublished();
    if (typeof body.formVersion === 'number' && body.formVersion !== form.version) {
      throw new ApiError(409, 'FORM_CHANGED', 'Форма была обновлена. Проверьте ответы и отправьте ещё раз.', undefined, {
        form: toPublicForm(form),
      });
    }
    const { values, errors } = validateAnswers(form.fields, body.answers);
    if (hasErrors(errors)) throw validationError(errors);
    if (data.responses.filter((r) => r.formId === form.id).length >= MAX_RESPONSES_PER_FORM) {
      throw new ApiError(429, 'RESPONSE_LIMIT', 'Форма больше не принимает ответы: достигнут лимит');
    }

    const submittedAt = now();
    const sessionId = isUuid(body.sessionId) ? body.sessionId : null;
    const response: StoredResponse = {
      id: randomUUID(),
      formId: form.id,
      submissionId: body.submissionId,
      sessionId,
      formVersion: form.version,
      submittedAt,
      answers: values,
      fields: structuredClone(form.fields),
    };
    data.responses.push(response);
    if (sessionId) {
      const session = upsertSession(data, form.id, sessionId);
      if (session) {
        session.viewedAt ??= submittedAt;
        session.startedAt ??= submittedAt;
        session.submittedAt = submittedAt;
      }
    }
    return { status: 201, response: { id: response.id, submittedAt } };
  });
}

export function recordEvent(store: JsonStore, publicId: string, body: Record<string, unknown>): Promise<void> {
  return store.mutate((data) => {
    const form = findByPublicId(data, publicId);
    if (form.status !== 'published') throw notPublished();
    const { sessionId, type, fieldId } = body;
    if (!isUuid(sessionId)) throw validationError({ sessionId: 'Некорректный идентификатор сеанса' });
    if (typeof type !== 'string' || !EVENT_TYPES.has(type)) throw validationError({ type: 'Неизвестный тип события' });
    if (type === 'field' && !form.fields.some((f) => f.id === fieldId)) {
      throw validationError({ fieldId: 'Неизвестное поле' });
    }

    const session = upsertSession(data, form.id, sessionId);
    if (!session) return;
    const ts = now();
    session.viewedAt ??= ts;
    if (type === 'start' || type === 'field') session.startedAt ??= ts;
    if (type === 'field' && typeof fieldId === 'string' && !session.fields.includes(fieldId)) {
      session.fields.push(fieldId);
      session.lastFieldId = fieldId;
    }
  });
}

export function getAnalytics(store: JsonStore, id: string) {
  const form = findForm(store.data, id);
  const sessions = store.data.sessions.filter((s) => s.formId === id);
  const views = sessions.filter((s) => s.viewedAt).length;
  const started = sessions.filter((s) => s.startedAt);
  const abandoned = started.filter((s) => !s.submittedAt);
  const completed = started.length - abandoned.length;
  const submissions = store.data.responses.filter((r) => r.formId === id).length;

  return {
    views,
    starts: started.length,
    submissions,
    startRate: views ? started.length / views : null,
    completionRate: started.length ? completed / started.length : null,
    abandoned: abandoned.length,
    fields: form.fields.map((f) => ({
      fieldId: f.id,
      label: f.label,
      filled: sessions.filter((s) => s.fields.includes(f.id)).length,
      lastBeforeAbandon: abandoned.filter((s) => s.lastFieldId === f.id).length,
    })),
  };
}
