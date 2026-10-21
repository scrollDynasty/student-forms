import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'student-forms-test-'));
const distDir = path.join(tmpRoot, 'dist');
fs.mkdirSync(distDir);
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>SPA</title><div id="root"></div>');

async function startServer(dataDir) {
  const store = await createStore({ dataDir });
  const app = createApp({ store, distDir });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, { raw = false, headers = {} } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json', ...headers } : headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const close = () => new Promise((resolve) => server.close(resolve));
  return { call, close, store };
}

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
  let srv;
  const dataDir = path.join(tmpRoot, 'main');
  before(async () => { srv = await startServer(dataDir); });
  after(async () => { await srv?.close(); });

  async function createPublished(fields = FIELDS) {
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
    const summary = list.json.forms.find((f) => f.id === a.json.form.id);
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
    assert.deepEqual(put.json.form.fields.map((f) => f.label), ['Email', 'ФИО', 'Дата начала']);
    assert.ok(put.json.form.fields[2].id);
    assert.equal(put.json.form.version, 2);
    assert.equal(put.json.form.title, 'T2');
    const again = await srv.call('GET', `/api/forms/${id}`);
    assert.deepEqual(again.json.form.fields.map((f) => f.id).slice(0, 2), ['mail', 'name']);
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
    assert.deepEqual(Object.keys(pub.json.form).sort(), ['description', 'fields', 'publicId', 'title']);
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
    const byId = Object.fromEntries(resp.items.map((i) => [i.fieldId, i]));
    assert.equal(byId.name.display, 'Анна');
    assert.equal(byId.track.display, 'Backend');
    assert.equal(byId.skills.display, 'JavaScript, SQL');
    assert.equal(byId.agree.display, 'Да');
    assert.equal(byId.age.value, 21);
    assert.equal(byId.injected, undefined);
    assert.equal(resp.formVersion, form.version);

    const summary = (await srv.call('GET', '/api/forms')).json.forms.find((f) => f.id === form.id);
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
    const byId = Object.fromEntries(resp.items.map((i) => [i.fieldId, i]));
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
    assert.equal(list.json.responses[0].items.find((i) => i.fieldId === 'name').value, 'Второй');
  });

  test('exports responses as CSV with BOM and formula-injection protection', async () => {
    const form = await createPublished();
    await srv.call('POST', `/api/public/forms/${form.publicId}/responses`, {
      answers: { ...VALID, name: '=HYPERLINK("x");"квоты"' }, submissionId: randomUUID(),
    });
    const r = await srv.call('GET', `/api/forms/${form.id}/responses.csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /attachment/);
    assert.equal(r.text.charCodeAt(0), 0xfeff);
    const [header, row] = r.text.slice(1).trim().split('\r\n');
    assert.ok(header.startsWith('Дата отправки;ФИО;Email'));
    assert.ok(row.includes(`"'=HYPERLINK(""x"");""квоты"""`));
  });

  test('analytics counts views, starts, submissions and drop-off per field', async () => {
    const form = await createPublished();
    const ev = (sessionId, type, fieldId) =>
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
    const mail = a.fields.find((f) => f.fieldId === 'mail');
    assert.equal(mail.filled, 2);
    assert.equal(mail.lastBeforeAbandon, 1);
    assert.equal(a.fields.find((f) => f.fieldId === 'name').lastBeforeAbandon, 0);
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
    assert.equal(srv.store.data.responses.some((r) => r.formId === form.id), false);
  });

  test('serves the SPA for /admin, /admin/*, /f/* and keeps the API JSON-only', async () => {
    for (const url of ['/admin', '/admin/forms/abc', '/f/abcdef1234', '/']) {
      const r = await srv.call('GET', url);
      assert.equal(r.status, 200, url);
      assert.match(r.text, /<div id="root">/);
    }
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

  test('a corrupted data file is backed up and the server starts with an empty store', async () => {
    const dataDir = path.join(tmpRoot, 'corrupt');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'db.json'), '{"forms": [ broken');
    const srv = await startServer(dataDir);
    try {
      const list = await srv.call('GET', '/api/forms');
      assert.equal(list.status, 200);
      assert.deepEqual(list.json.forms, []);
      assert.ok(fs.readdirSync(dataDir).some((f) => f.startsWith('db.corrupt-')));
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

after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
