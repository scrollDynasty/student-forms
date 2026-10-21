/* eslint-disable @typescript-eslint/no-explicit-any -- black-box tests inspect untyped JSON responses */
import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { startServer, type TestServer } from './helpers/server';

// Black-box contract tests against the real production server (`next start`).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'student-forms-test-'));

const FIELDS = [
  { id: 'name', type: 'short_text', label: 'ФИО', required: true },
  { id: 'mail', type: 'email', label: 'Email', required: true },
  { id: 'age', type: 'number', label: 'Возраст', min: 16, max: 99 },
  {
    id: 'track', type: 'radio', label: 'Направление', required: true,
    options: [{ id: 'fe', label: 'Frontend' }, { id: 'be', label: 'Backend' }],
  },
  {
    id: 'skills', type: 'multi_select', label: 'Навыки',
    options: [{ id: 'js', label: 'JavaScript' }, { id: 'sql', label: 'SQL' }],
  },
  { id: 'agree', type: 'checkbox', label: 'Согласие', required: true },
];
const VALID = { name: 'Анна', mail: 'anna@example.com', age: 21, track: 'be', skills: ['sql', 'js'], agree: true };

describe('forms API', () => {
  let srv: TestServer;
  const dataDir = path.join(tmpRoot, 'main');
  beforeAll(async () => { srv = await startServer(dataDir); }, 60_000);
  afterAll(async () => { await srv?.close(); });

  async function createPublished(fields: unknown[] = FIELDS) {
    const created = await srv.call('POST', '/api/forms', { title: 'Стажировка', fields });
    assert.equal(created.status, 201);
    const pub = await srv.call('POST', `/api/forms/${created.json.form.id}/publish`);
    assert.equal(pub.status, 200);
    return pub.json.form;
  }

  test('creates a draft form with a unique public id and lists it', async () => {
    const a = await srv.call('POST', '/api/forms', { title: 'Форма А', description: 'Описание' });
    const b = await srv.call('POST', '/api/forms', { title: 'Форма Б' });
    assert.equal(a.status, 201);
    assert.equal(a.json.form.status, 'draft');
    assert.equal(a.json.form.version, 1);
    assert.match(a.json.form.publicId, /^[A-Za-z0-9]{10}$/);
    assert.notEqual(a.json.form.publicId, b.json.form.publicId);
    assert.notEqual(a.json.form.id, a.json.form.publicId);

    const list = await srv.call('GET', '/api/forms');
    assert.equal(list.status, 200);
    const summary = list.json.forms.find((f: any) => f.id === a.json.form.id);
    assert.equal(summary.title, 'Форма А');
    assert.equal(summary.fieldCount, 0);
    assert.equal(summary.responseCount, 0);
    assert.equal(list.json.forms[0].id, b.json.form.id, 'most recently updated first');

    const one = await srv.call('GET', `/api/forms/${a.json.form.id}`);
    assert.equal(one.json.form.description, 'Описание');
  });

  test('rejects invalid form definitions with field-level errors', async () => {
    const r = await srv.call('POST', '/api/forms', { title: '' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    assert.ok(r.json.error.fields.title);

    const created = await srv.call('POST', '/api/forms', { title: 'T' });
    const put = await srv.call('PUT', `/api/forms/${created.json.form.id}`, {
      title: 'T', fields: [{ type: 'select', label: 'Город', options: [] }],
    });
    assert.equal(put.status, 400);
    assert.ok(put.json.error.fields['fields.0.options']);
  });

  test('rejects malformed JSON and non-object bodies', async () => {
    const bad = await srv.call('POST', '/api/forms', '{"title":', { raw: true });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_JSON');
    const arr = await srv.call('POST', '/api/forms', [1, 2]);
    assert.equal(arr.status, 400);
  });

  test('rejects oversized payloads with 413', async () => {
    const r = await srv.call('POST', '/api/forms', { title: 'x', description: 'y'.repeat(300_000) });
    assert.equal(r.status, 413);
    assert.equal(r.json.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('updates fields, keeps the given order, assigns ids and bumps version', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'T', fields: FIELDS.slice(0, 2) });
    const id = created.json.form.id;
    const reordered = [FIELDS[1], FIELDS[0], { type: 'date', label: 'Дата начала' }];
    const put = await srv.call('PUT', `/api/forms/${id}`, { title: 'T2', description: '', fields: reordered });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.form.fields.map((f: any) => f.label), ['Email', 'ФИО', 'Дата начала']);
    assert.ok(put.json.form.fields[2].id);
    assert.equal(put.json.form.version, 2);
    assert.equal(put.json.form.title, 'T2');
    const again = await srv.call('GET', `/api/forms/${id}`);
    assert.deepEqual(again.json.form.fields.map((f: any) => f.id).slice(0, 2), ['mail', 'name']);
  });

  test('returns 404 JSON for unknown ids and unknown API routes', async () => {
    for (const [method, url] of [
      ['GET', '/api/forms/nope'], ['PUT', '/api/forms/nope'], ['POST', '/api/forms/nope/publish'],
      ['DELETE', '/api/forms/nope'], ['GET', '/api/forms/nope/responses'], ['GET', '/api/forms/nope/analytics'],
      ['GET', '/api/public/forms/nope'], ['POST', '/api/public/forms/nope/responses'], ['GET', '/api/whatever'],
    ]) {
      const r = await srv.call(method, url, method === 'GET' || method === 'DELETE' ? undefined : { title: 'x' });
      assert.equal(r.status, 404, `${method} ${url}`);
      assert.equal(r.json.error.code, 'NOT_FOUND');
    }
  });

  test('publishing requires at least one field', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Пустая' });
    const r = await srv.call('POST', `/api/forms/${created.json.form.id}/publish`);
    assert.equal(r.status, 400);
    assert.ok(r.json.error.fields.fields);
  });

  test('public endpoint hides drafts and exposes only public data for published forms', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Черновик', fields: FIELDS });
    const { publicId, id } = created.json.form;
    const draft = await srv.call('GET', `/api/public/forms/${publicId}`);
    assert.equal(draft.status, 403);
    assert.equal(draft.json.error.code, 'FORM_NOT_PUBLISHED');
    assert.equal(draft.json.form, undefined);

    await srv.call('POST', `/api/forms/${id}/publish`);
    const pub = await srv.call('GET', `/api/public/forms/${publicId}`);
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.json.form).sort(), ['description', 'fields', 'publicId', 'title', 'version']);
    assert.equal(pub.json.form.fields.length, FIELDS.length);
  });

  test('accepts a valid submission and shows it to the manager', async () => {
    const form = await createPublished();
    const r = await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: { ...VALID, injected: 'x' }, submissionId: randomUUID(),
    });
    assert.equal(r.status, 201);
    assert.ok(r.json.response.id);
    assert.ok(!Number.isNaN(Date.parse(r.json.response.submittedAt)));

    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 1);
    const [resp] = list.json.responses;
    const byId = Object.fromEntries(resp.items.map((i: any) => [i.fieldId, i]));
    assert.equal(byId.name.display, 'Анна');
    assert.equal(byId.track.display, 'Backend');
    assert.equal(byId.skills.display, 'JavaScript, SQL');
    assert.equal(byId.agree.display, 'Да');
    assert.equal(byId.age.value, 21);
    assert.equal(byId.injected, undefined);
    assert.equal(resp.formVersion, form.version);

    const summary = (await srv.call('GET', '/api/forms')).json.forms.find((f: any) => f.id === form.id);
    assert.equal(summary.responseCount, 1);
  });

  test('rejects missing required values, bad email and wrong types', async () => {
    const form = await createPublished();
    const url = `/api/public/forms/${form.publicId}/responses`;
    const missing = await srv.call('POST', url, { answers: { mail: 'a@b.co' }, submissionId: randomUUID() });
    assert.equal(missing.status, 400);
    assert.equal(missing.json.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(Object.keys(missing.json.error.fields).sort(), ['agree', 'name', 'track']);

    const bad = await srv.call('POST', url, {
      answers: { ...VALID, mail: 'anna(at)example', age: 'много', track: 'ml', skills: 'js' },
      submissionId: randomUUID(),
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ['age', 'mail', 'skills', 'track']);

    const noAnswers = await srv.call('POST', url, { submissionId: randomUUID() });
    assert.equal(noAnswers.status, 400);

    const badSubmission = await srv.call('POST', url, { answers: VALID, submissionId: '../../etc' });
    assert.equal(badSubmission.status, 400);

    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    assert.equal(list.json.total, 0, 'nothing stored for rejected submissions');
  });

  test('rejects submissions to unpublished forms', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/forms/${form.id}/unpublish`);
    const r = await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(),
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORM_NOT_PUBLISHED');
    const draftOnly = await srv.call('POST', '/api/forms', { title: 'Никогда не публиковалась', fields: FIELDS });
    const r2 = await srv.call('POST', `/api/public/forms/${draftOnly.json.form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(),
    });
    assert.equal(r2.status, 403);
  });

  test('a repeated submissionId is idempotent (double click protection)', async () => {
    const form = await createPublished();
    const submissionId = randomUUID();
    const url = `/api/public/forms/${form.publicId}/responses`;
    const [first, second] = await Promise.all([
      srv.call('POST', url, { answers: VALID, submissionId }),
      srv.call('POST', url, { answers: VALID, submissionId }),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 201]);
    assert.equal(first.json.response.id, second.json.response.id);
    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    assert.equal(list.json.total, 1);
  });

  test('historical responses survive form edits (snapshot of the schema)', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, { answers: VALID, submissionId: randomUUID() });
    const edited = FIELDS.filter((f) => f.id !== 'skills').map((f) =>
      f.id === 'track' ? { ...f, label: 'Трек', options: [{ id: 'fe', label: 'Фронт' }, { id: 'qa', label: 'QA' }] } : f);
    const put = await srv.call('PUT', `/api/forms/${form.id}`, { title: 'Стажировка v2', fields: edited });
    assert.equal(put.status, 200);

    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    const [resp] = list.json.responses;
    const byId = Object.fromEntries(resp.items.map((i: any) => [i.fieldId, i]));
    assert.equal(byId.skills.display, 'JavaScript, SQL', 'deleted field still shown');
    assert.equal(byId.track.label, 'Направление');
    assert.equal(byId.track.display, 'Backend', 'removed option label preserved');
    assert.equal(resp.formVersion, 1);
  });

  test('lists responses newest first', async () => {
    const form = await createPublished();
    const url = `/api/public/forms/${form.publicId}/responses`;
    await srv.call('POST', url, { answers: { ...VALID, name: 'Первый' }, submissionId: randomUUID() });
    await new Promise((r) => setTimeout(r, 5));
    await srv.call('POST', url, { answers: { ...VALID, name: 'Второй' }, submissionId: randomUUID() });
    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    assert.equal(list.json.responses[0].items.find((i: any) => i.fieldId === 'name').value, 'Второй');
  });

  test('exports responses as CSV with BOM and formula-injection protection', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: { ...VALID, name: '=HYPERLINK("x");"квоты"' }, submissionId: randomUUID(),
    });
    const r = await srv.call('GET', `/api/forms/${form.id}/responses/csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(r.headers.get('content-disposition') ?? '', /attachment/);
    // fetch().text() strips the BOM while decoding, so check the raw bytes (EF BB BF) for Excel.
    const bytes = new Uint8Array(await (await fetch(`${srv.base}/api/forms/${form.id}/responses/csv`)).arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const [header, row] = r.text.trim().split('\r\n');
    assert.ok(header.startsWith('Дата отправки;ФИО;Email'));
    assert.ok(row.includes(`"'=HYPERLINK(""x"");""квоты"""`));
  });

  test('analytics counts views, starts, submissions and drop-off per field', async () => {
    const form = await createPublished();
    const ev = (sessionId: string, type: string, fieldId?: string) =>
      srv.call('POST', `/api/public/forms/${form.publicId}/events`, { sessionId, type, fieldId });
    const s1 = randomUUID(); const s2 = randomUUID(); const s3 = randomUUID();
    // s1: views, starts, fills name + mail, submits
    assert.equal((await ev(s1, 'view')).status, 204);
    await ev(s1, 'view'); // duplicate view in same session is not double-counted
    await ev(s1, 'start');
    await ev(s1, 'field', 'name');
    await ev(s1, 'field', 'mail');
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(), sessionId: s1,
    });
    // s2: views, starts, stops at mail
    await ev(s2, 'view'); await ev(s2, 'start'); await ev(s2, 'field', 'name'); await ev(s2, 'field', 'mail');
    // s3: only views
    await ev(s3, 'view');

    const a = (await srv.call('GET', `/api/forms/${form.id}/analytics`)).json;
    assert.equal(a.views, 3);
    assert.equal(a.starts, 2);
    assert.equal(a.submissions, 1);
    assert.equal(a.abandoned, 1);
    assert.equal(a.completionRate, 0.5);
    assert.ok(Math.abs(a.startRate - 2 / 3) < 1e-9);
    const mail = a.fields.find((f: any) => f.fieldId === 'mail');
    assert.equal(mail.filled, 2);
    assert.equal(mail.lastBeforeAbandon, 1);
    assert.equal(a.fields.find((f: any) => f.fieldId === 'name').lastBeforeAbandon, 0);
  });

  test('analytics returns nulls instead of invented rates when there is no data', async () => {
    const form = await createPublished();
    const a = (await srv.call('GET', `/api/forms/${form.id}/analytics`)).json;
    assert.equal(a.views, 0);
    assert.equal(a.startRate, null);
    assert.equal(a.completionRate, null);
  });

  test('rejects invalid analytics events and events for drafts', async () => {
    const form = await createPublished();
    const url = `/api/public/forms/${form.publicId}/events`;
    assert.equal((await srv.call('POST', url, { sessionId: 'x', type: 'view' })).status, 400);
    assert.equal((await srv.call('POST', url, { sessionId: randomUUID(), type: 'hack' })).status, 400);
    assert.equal((await srv.call('POST', url, { sessionId: randomUUID(), type: 'field', fieldId: 'nope' })).status, 400);
    const draft = await srv.call('POST', '/api/forms', { title: 'd', fields: FIELDS });
    const r = await srv.call('POST', `/api/public/forms/${draft.json.form.publicId}/events`, { sessionId: randomUUID(), type: 'view' });
    assert.equal(r.status, 403);
  });

  test('deleting a form removes it and its responses', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, { answers: VALID, submissionId: randomUUID() });
    const del = await srv.call('DELETE', `/api/forms/${form.id}`);
    assert.equal(del.status, 204);
    assert.equal((await srv.call('GET', `/api/forms/${form.id}`)).status, 404);
    assert.equal((await srv.call('GET', `/api/public/forms/${form.publicId}`)).status, 404);
    const csv = await srv.call('GET', `/api/forms/${form.id}/responses/csv`);
    assert.equal(csv.status, 404);
  });

  test('PUT without a fields array is rejected instead of wiping the form', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Не стирать', fields: FIELDS });
    const r = await srv.call('PUT', `/api/forms/${created.json.form.id}`, { title: 'Только название' });
    assert.equal(r.status, 400);
    assert.ok(r.json.error.fields.fields);
    assert.equal((await srv.call('GET', `/api/forms/${created.json.form.id}`)).json.form.fields.length, FIELDS.length);
  });

  test('PUT with a stale version is rejected with 409 VERSION_CONFLICT', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Версии' });
    const id = created.json.form.id;
    const first = await srv.call('PUT', `/api/forms/${id}`, { title: 'Вкладка 1', fields: [], version: 1 });
    assert.equal(first.status, 200);
    const stale = await srv.call('PUT', `/api/forms/${id}`, { title: 'Вкладка 2', fields: [], version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, 'VERSION_CONFLICT');
    assert.equal((await srv.call('GET', `/api/forms/${id}`)).json.form.title, 'Вкладка 1');
  });

  test('submitting against an outdated form version returns 409 FORM_CHANGED with the fresh form', async () => {
    const form = await createPublished();
    await srv.call('PUT', `/api/forms/${form.id}`, {
      title: form.title,
      fields: [...FIELDS, { id: 'city', type: 'short_text', label: 'Город', required: true }],
    });
    const r = await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(), formVersion: form.version,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'FORM_CHANGED');
    assert.ok(r.json.form.fields.some((f: any) => f.id === 'city'));
    assert.equal(r.json.form.version, form.version + 1);
  });

  test('a retried submission is still acknowledged after the form was unpublished', async () => {
    const form = await createPublished();
    const submissionId = randomUUID();
    const url = `/api/public/forms/${form.publicId}/responses`;
    assert.equal((await srv.call('POST', url, { answers: VALID, submissionId })).status, 201);
    await srv.call('POST', `/api/forms/${form.id}/unpublish`);
    const retry = await srv.call('POST', url, { answers: VALID, submissionId });
    assert.equal(retry.status, 200);
  });


  test('rejects oversized chunked bodies without buffering them (413)', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent++ < 64) controller.enqueue(chunk); // up to 4 MB, no content-length
        else controller.close();
      },
    });
    const res = await fetch(`${srv.base}/api/forms`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
    } as RequestInit);
    assert.equal(res.status, 413);
  });

  test('blocks cross-site admin mutations but allows same-origin and non-browser calls', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'CSRF' });
    const evil = await fetch(`${srv.base}/api/forms/${created.json.form.id}`, {
      method: 'DELETE', headers: { origin: 'https://evil.example' },
    });
    assert.equal(evil.status, 403);
    assert.equal((await evil.json()).error.code, 'FORBIDDEN_ORIGIN');
    const same = await fetch(`${srv.base}/api/forms/${created.json.form.id}/publish`, {
      method: 'POST', headers: { origin: srv.base },
    });
    assert.equal(same.status, 400, 'same origin passes the check (fails later: no fields)');
  });

  test('rate-limits bursts of public submissions from one client (429)', async () => {
    const form = await createPublished();
    const url = `/api/public/forms/${form.publicId}/responses`;
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) {
      statuses.push((await srv.call('POST', url, { answers: VALID, submissionId: randomUUID() })).status);
    }
    assert.equal(statuses.filter((s) => s === 201).length, 60);
    assert.equal(statuses.at(-1), 429);
    const limited = await srv.call('POST', url, { answers: VALID, submissionId: randomUUID() });
    assert.equal(limited.json.error.code, 'RATE_LIMITED');
  });
  test('a submission with an unseen sessionId keeps the funnel consistent', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(), sessionId: randomUUID(),
    });
    const a = (await srv.call('GET', `/api/forms/${form.id}/analytics`)).json;
    assert.deepEqual([a.views, a.starts, a.submissions, a.abandoned, a.completionRate], [1, 1, 1, 0, 1]);
  });

  test('submitting with the current formVersion succeeds', async () => {
    const form = await createPublished();
    const r = await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: VALID, submissionId: randomUUID(), formVersion: form.version,
    });
    assert.equal(r.status, 201);
  });

  test('enforces number min/max over HTTP', async () => {
    const form = await createPublished();
    const url = `/api/public/forms/${form.publicId}/responses`;
    for (const age of [5, 100]) {
      const r = await srv.call('POST', url, { answers: { ...VALID, age }, submissionId: randomUUID() });
      assert.equal(r.status, 400, `age ${age}`);
      assert.deepEqual(Object.keys(r.json.error.fields), ['age']);
    }
  });

  test('publish lifecycle: publishedAt, unpublish, edits of a published form reach students', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Жизненный цикл', fields: FIELDS });
    const { id, publicId } = created.json.form;
    assert.equal(created.json.form.publishedAt, null);
    const pub = (await srv.call('POST', `/api/forms/${id}/publish`)).json.form;
    assert.equal(pub.status, 'published');
    assert.ok(!Number.isNaN(Date.parse(pub.publishedAt)));

    const put = await srv.call('PUT', `/api/forms/${id}`, { title: 'Жизненный цикл v2', fields: FIELDS.slice(0, 2) });
    assert.equal(put.json.form.status, 'published', 'editing does not unpublish');
    const seen = (await srv.call('GET', `/api/public/forms/${publicId}`)).json.form;
    assert.equal(seen.title, 'Жизненный цикл v2');
    assert.equal(seen.fields.length, 2);

    const un = (await srv.call('POST', `/api/forms/${id}/unpublish`)).json.form;
    assert.equal(un.status, 'draft');
    assert.equal((await srv.call('GET', `/api/public/forms/${publicId}`)).status, 403);
    const again = (await srv.call('POST', `/api/forms/${id}/publish`)).json.form;
    assert.equal(again.status, 'published');
    assert.equal(again.publicId, publicId, 'the link survives republishing');
  });

  test('returns indexed validation keys for min/max and option labels', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Ключи' });
    const r = await srv.call('PUT', `/api/forms/${created.json.form.id}`, {
      title: 'Ключи',
      fields: [
        { type: 'number', label: 'Возраст', min: 'abc' },
        { type: 'radio', label: 'Курс', options: [{ label: 'Первый' }, { label: 'первый' }] },
      ],
    });
    assert.equal(r.status, 400);
    assert.ok(r.json.error.fields['fields.0.min']);
    assert.ok(r.json.error.fields['fields.1.options.1']);
  });

  test('CSV escapes separators, quotes and newlines and renders every value type', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: { ...VALID, name: 'Иванова; Анна "Ann"\nвторая строка', skills: ['js', 'sql'], age: undefined },
      submissionId: randomUUID(),
    });
    const r = await srv.call('GET', `/api/forms/${form.id}/responses/csv`);
    assert.match(r.headers.get('content-disposition') ?? '', new RegExp(`filename="responses-${form.publicId}\\.csv"`));
    const body = r.text.trim();
    assert.ok(body.includes('"Иванова; Анна ""Ann""\nвторая строка"'), 'quoted multi-line cell');
    assert.ok(body.includes(';JavaScript, SQL;'), 'multi_select labels');
    assert.ok(body.endsWith(';Да'), 'checkbox rendered as Да');
    assert.ok(body.includes('anna@example.com;;Backend'), 'empty optional cell stays empty');
  });

  test('repeated field events do not inflate counts; drop-off follows the latest field started', async () => {
    const form = await createPublished();
    const ev = (sessionId: string, type: string, fieldId?: string) =>
      srv.call('POST', `/api/public/forms/${form.publicId}/events`, { sessionId, type, fieldId });
    const s = randomUUID();
    await ev(s, 'view'); await ev(s, 'start');
    await ev(s, 'field', 'mail'); await ev(s, 'field', 'name'); await ev(s, 'field', 'mail');
    const a = (await srv.call('GET', `/api/forms/${form.id}/analytics`)).json;
    const byId = Object.fromEntries(a.fields.map((f: any) => [f.fieldId, f]));
    assert.equal(byId.mail.filled, 1);
    assert.equal(byId.name.lastBeforeAbandon, 1);
    assert.equal(byId.mail.lastBeforeAbandon, 0);
  });

  test('rate-limits analytics events per form (600/min)', async () => {
    const form = await createPublished();
    const url = `${srv.base}/api/public/forms/${form.publicId}/events`;
    const send = () => fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: randomUUID(), type: 'view' }),
    }).then((r) => r.status);
    const statuses: number[] = [];
    for (let batch = 0; batch < 6; batch++) statuses.push(...(await Promise.all(Array.from({ length: 100 }, send))));
    assert.ok(statuses.every((st) => st === 204));
    assert.equal(await send(), 429);
  });

  test('ignores prototype-polluting answer keys', async () => {
    const form = await createPublished();
    const raw = `{"answers":{"__proto__":{"polluted":true},"name":"Анна","mail":"a@b.co","track":"fe","agree":true},"submissionId":"${randomUUID()}"}`;
    const r = await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, raw, { raw: true });
    assert.equal(r.status, 201);
    const list = await srv.call('GET', `/api/forms/${form.id}/responses`);
    assert.equal(list.json.responses[0].items.some((i: any) => i.fieldId === '__proto__'), false);
    assert.equal(({} as any).polluted, undefined);
  });

  test('answers unsupported methods on existing routes with 405', async () => {
    assert.equal((await fetch(`${srv.base}/api/forms`, { method: 'PATCH' })).status, 405);
  });

  test('a per-form cap still applies when X-Forwarded-For is spoofed', async () => {
    const form = await createPublished();
    const url = `${srv.base}/api/public/forms/${form.publicId}/responses`;
    const send = (i: number) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `9.9.${i >> 8}.${i & 255}` },
      body: JSON.stringify({ answers: VALID, submissionId: randomUUID() }),
    }).then((r) => r.status);
    const statuses: number[] = [];
    for (let batch = 0; batch < 12; batch++) {
      statuses.push(...(await Promise.all(Array.from({ length: 50 }, (_, j) => send(batch * 50 + j)))));
    }
    assert.equal(statuses.filter((st) => st === 201).length, 600);
    assert.equal(await send(999), 429);
  }, 60_000);

  test('sends security headers and hides X-Powered-By', async () => {
    for (const url of ['/admin', '/f/abcdef1234', '/api/forms']) {
      const r = await fetch(`${srv.base}${url}`);
      assert.equal(r.headers.get('x-frame-options'), 'DENY', url);
      assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/, url);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', url);
      assert.ok(r.headers.get('referrer-policy'), url);
      assert.equal(r.headers.get('x-powered-by'), null, url);
    }
  });

  test('admin API rejects DNS-rebinding hosts but allows localhost and IP literals', async () => {
    const get = (host: string, headers: Record<string, string> = {}) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port: srv.port, path: '/api/forms', method: 'GET', headers: { host, ...headers } },
          (res) => { res.resume(); resolve(res.statusCode ?? 0); },
        );
        req.on('error', reject);
        req.end();
      });
    assert.equal(await get('evil.example'), 403);
    assert.equal(await get(`evil.example:${srv.port}`), 403);
    assert.equal(await get(`localhost:${srv.port}`), 200);
    assert.equal(await get(`127.0.0.1:${srv.port}`), 200);
    assert.equal(await get(`192.168.1.20:${srv.port}`), 200, 'LAN access for phone testing');
    assert.equal(await get(`[::1]:${srv.port}`), 200);
  });

  test('a spoofed X-Forwarded-Host does not satisfy the Origin check', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'XFH' });
    const r = await fetch(`${srv.base}/api/forms/${created.json.form.id}`, {
      method: 'DELETE', headers: { origin: 'http://evil.example', 'x-forwarded-host': 'evil.example' },
    });
    assert.equal(r.status, 403);
  });

  test('publish/unpublish with a stale version are rejected with 409', async () => {
    const created = await srv.call('POST', '/api/forms', { title: 'Устаревшая вкладка', fields: FIELDS });
    const { id } = created.json.form;
    await srv.call('PUT', `/api/forms/${id}`, { title: 'Новее', fields: FIELDS, version: 1 });
    const stale = await srv.call('POST', `/api/forms/${id}/publish`, { version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, 'VERSION_CONFLICT');
    assert.equal((await srv.call('POST', `/api/forms/${id}/publish`, { version: 2 })).status, 200);
    assert.equal((await srv.call('POST', `/api/forms/${id}/unpublish`, { version: 1 })).status, 409);
  });

  test('re-publishing an already published form keeps publishedAt', async () => {
    const form = await createPublished();
    const again = (await srv.call('POST', `/api/forms/${form.id}/publish`)).json.form;
    assert.equal(again.publishedAt, form.publishedAt);
  });

  test('GET /api/forms/:id reports responseCount', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, { answers: VALID, submissionId: randomUUID() });
    assert.equal((await srv.call('GET', `/api/forms/${form.id}`)).json.responseCount, 1);
  });

  test('submissionId is case-insensitive for idempotency', async () => {
    const form = await createPublished();
    const id = randomUUID();
    const url = `/api/public/forms/${form.publicId}/responses`;
    assert.equal((await srv.call('POST', url, { answers: VALID, submissionId: id })).status, 201);
    assert.equal((await srv.call('POST', url, { answers: VALID, submissionId: id.toUpperCase() })).status, 200);
  });

  test('serves the admin and public pages and returns HTML 404 for unknown pages', async () => {
    for (const url of ['/admin', '/f/abcdef1234']) {
      const r = await srv.call('GET', url);
      assert.equal(r.status, 200, url);
      assert.match(r.headers.get('content-type') ?? '', /text\/html/);
    }
    const root = await fetch(`${srv.base}/`, { redirect: 'manual' });
    assert.ok([307, 308].includes(root.status));
    assert.match(root.headers.get('location') ?? '', /\/admin$/);
    assert.equal((await srv.call('GET', '/definitely-missing')).status, 404);
  });
});

describe('persistence', () => {
  test('forms and responses survive a server restart', async () => {
    const dataDir = path.join(tmpRoot, 'restart');
    let srv = await startServer(dataDir);
    const created = await srv.call('POST', '/api/forms', { title: 'Переживёт рестарт', fields: FIELDS });
    const { id, publicId } = created.json.form;
    await srv.call('POST', `/api/forms/${id}/publish`);
    await srv.call('POST', `/api/public/forms/${publicId}/responses`, { answers: VALID, submissionId: randomUUID() });
    await srv.close();

    srv = await startServer(dataDir);
    try {
      const form = await srv.call('GET', `/api/forms/${id}`);
      assert.equal(form.json.form.title, 'Переживёт рестарт');
      assert.equal(form.json.form.status, 'published');
      const list = await srv.call('GET', `/api/forms/${id}/responses`);
      assert.equal(list.json.total, 1);
    } finally {
      await srv.close();
    }
  });

  test('writes are atomic: no temp files left and the file is valid JSON', async () => {
    const dataDir = path.join(tmpRoot, 'atomic');
    const srv = await startServer(dataDir);
    try {
      await Promise.all(Array.from({ length: 20 }, (_, i) => srv.call('POST', '/api/forms', { title: `F${i}` })));
      const files = fs.readdirSync(dataDir);
      assert.deepEqual(files.filter((f) => f.endsWith('.tmp')), []);
      const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
      assert.equal(db.forms.length, 20);
    } finally {
      await srv.close();
    }
  });
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
