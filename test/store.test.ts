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
    assert.equal(again.data.sessions[0].id, 's1');
  });

  test('coalesces concurrent writes, leaves no temp files and keeps valid JSON', async () => {
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
    assert.equal(db.sessions.length, 50);
    assert.ok(store.writeCount < 50, `expected coalesced writes, got ${store.writeCount}`);
  });

  test('backs up a corrupted file and starts empty', async () => {
    fs.mkdirSync(dir('corrupt'), { recursive: true });
    fs.writeFileSync(path.join(dir('corrupt'), 'db.json'), '{"forms": [ broken');
    const store = await JsonStore.open(dir('corrupt'));
    assert.deepEqual(store.data.forms, []);
    const backups = fs.readdirSync(dir('corrupt')).filter((f) => f.startsWith('db.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(dir('corrupt'), backups[0]), 'utf8'), '{"forms": [ broken');
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
