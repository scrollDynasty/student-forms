import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../lib/server/store';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'student-forms-store-'));
const dir = (name: string) => path.join(tmpRoot, name);
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('JsonStore', () => {
  test('starts empty when there is no data file and creates the directory', async () => {
    const store = await JsonStore.open(dir('fresh'));
    assert.deepEqual(store.data, { forms: [], responses: [], sessions: [] });
    assert.ok(fs.existsSync(dir('fresh')));
  });

  test('persists mutations and reloads them', async () => {
    const store = await JsonStore.open(dir('reload'));
    const result = await store.mutate((d) => {
      d.sessions.push({ id: 's1', formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null });
      return 42;
    });
    assert.equal(result, 42);
    const again = await JsonStore.open(dir('reload'));
    assert.equal(again.data.sessions[0]?.id, 's1');
  });

  test('serializes concurrent mutations: every change persisted, no temp files, valid JSON', async () => {
    const store = await JsonStore.open(dir('concurrent'));
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.mutate((d) => {
          d.sessions.push({ id: `s${i}`, formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null });
        }),
      ),
    );
    const files = fs.readdirSync(dir('concurrent'));
    assert.deepEqual(files.filter((f) => f.endsWith('.tmp')), []);
    const db = JSON.parse(fs.readFileSync(path.join(dir('concurrent'), 'db.json'), 'utf8'));
    assert.deepEqual(db.sessions.map((s: { id: string }) => s.id), Array.from({ length: 50 }, (_, i) => `s${i}`));
  });

  test('a failed write rejects the mutation and leaves memory unchanged (no phantom data)', async (ctx) => {
    if (process.platform === 'win32' || process.getuid?.() === 0) ctx.skip();
    const store = await JsonStore.open(dir('readonly'));
    await store.mutate((d) => { d.forms.length = 0; });
    fs.chmodSync(dir('readonly'), 0o500);
    try {
      await assert.rejects(
        store.mutate((d) => {
          d.sessions.push({ id: 'ghost', formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null });
        }),
      );
      assert.equal(store.data.sessions.length, 0);
    } finally {
      fs.chmodSync(dir('readonly'), 0o700);
    }
    // The store keeps working once the disk is writable again.
    await store.mutate((d) => { d.sessions.push({ id: 'ok', formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null }); });
    assert.deepEqual(store.data.sessions.map((s) => s.id), ['ok']);
  });

  test('a mutation that throws changes nothing and is not written', async () => {
    const store = await JsonStore.open(dir('throws'));
    await assert.rejects(store.mutate((d) => {
      d.sessions.push({ id: 'partial', formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null });
      throw new Error('validation failed halfway');
    }), /halfway/);
    assert.equal(store.data.sessions.length, 0);
    assert.equal(fs.existsSync(path.join(dir('throws'), 'db.json')), false);
  });

  test('a mutation that calls skipWrite returns its result without touching the disk', async () => {
    const store = await JsonStore.open(dir('skip'));
    const result = await store.mutate((_d, tx) => {
      tx.skipWrite();
      return 'unchanged';
    });
    assert.equal(result, 'unchanged');
    assert.equal(fs.existsSync(path.join(dir('skip'), 'db.json')), false);
  });

  test('records which backup a corrupted file was moved to', async () => {
    fs.mkdirSync(dir('recovered'), { recursive: true });
    fs.writeFileSync(path.join(dir('recovered'), 'db.json'), 'not json');
    const store = await JsonStore.open(dir('recovered'));
    assert.match(store.recoveredFrom ?? '', /^db\.corrupt-\d+\.json$/);
    assert.equal((await JsonStore.open(dir('fresh2'))).recoveredFrom, null);
  });

  test('a file with malformed records is treated as corrupted instead of crashing later', async () => {
    fs.mkdirSync(dir('records'), { recursive: true });
    fs.writeFileSync(path.join(dir('records'), 'db.json'), '{"forms":[{"id":"a"}],"responses":[],"sessions":[]}');
    const store = await JsonStore.open(dir('records'));
    assert.deepEqual(store.data.forms, []);
    assert.ok(store.recoveredFrom);
  });

  test('nested records the code dereferences later are checked too (field snapshots, form version)', async () => {
    const form = { id: 'f', publicId: 'p', title: 'T', status: 'draft', version: 1, updatedAt: 'x', fields: [] };
    const response = { id: 'r', formId: 'f', submittedAt: 'x', answers: {}, fields: [] };
    const cases = {
      nullField: { forms: [{ ...form, fields: [null] }], responses: [], sessions: [] },
      fieldWithoutOptions: { forms: [{ ...form, fields: [{ id: 'a', type: 'select', label: 'A' }] }], responses: [], sessions: [] },
      noVersion: { forms: [{ ...form, version: undefined }], responses: [], sessions: [] },
      nullSnapshot: { forms: [form], responses: [{ ...response, fields: [null] }], sessions: [] },
    };
    for (const [name, data] of Object.entries(cases)) {
      fs.mkdirSync(dir(`nested-${name}`), { recursive: true });
      fs.writeFileSync(path.join(dir(`nested-${name}`), 'db.json'), JSON.stringify(data));
      const store = await JsonStore.open(dir(`nested-${name}`));
      assert.ok(store.recoveredFrom, name);
      assert.deepEqual(store.data.forms, [], name);
    }
  });

  test('a valid file saved with a UTF-8 BOM (e.g. by Notepad) loads instead of being set aside', async () => {
    fs.mkdirSync(dir('bom'), { recursive: true });
    const data = { forms: [], responses: [], sessions: [{ id: 's', formId: 'f', viewedAt: null, startedAt: null, submittedAt: null, fields: [], lastFieldId: null }] };
    fs.writeFileSync(path.join(dir('bom'), 'db.json'), `﻿${JSON.stringify(data)}`);
    const store = await JsonStore.open(dir('bom'));
    assert.equal(store.recoveredFrom, null);
    assert.equal(store.data.sessions.length, 1);
  });

  test('backs up a corrupted file and starts empty', async () => {
    fs.mkdirSync(dir('corrupt'), { recursive: true });
    fs.writeFileSync(path.join(dir('corrupt'), 'db.json'), '{"forms": [ broken');
    const store = await JsonStore.open(dir('corrupt'));
    assert.deepEqual(store.data.forms, []);
    const backups = fs.readdirSync(dir('corrupt')).filter((f) => f.startsWith('db.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(dir('corrupt'), backups[0] ?? ''), 'utf8'), '{"forms": [ broken');
  });

  test('treats a structurally invalid file as corrupted', async () => {
    fs.mkdirSync(dir('shape'), { recursive: true });
    fs.writeFileSync(path.join(dir('shape'), 'db.json'), '{"forms": "nope"}');
    const store = await JsonStore.open(dir('shape'));
    assert.deepEqual(store.data.forms, []);
  });

  test('removes stale temp files left by a crash', async () => {
    fs.mkdirSync(dir('stale'), { recursive: true });
    fs.writeFileSync(path.join(dir('stale'), 'db.json.123.0.tmp'), 'partial');
    await JsonStore.open(dir('stale'));
    assert.deepEqual(fs.readdirSync(dir('stale')).filter((f) => f.endsWith('.tmp')), []);
  });
});
