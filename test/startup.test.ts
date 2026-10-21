import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'student-forms-startup-'));
afterAll(() => {
  fs.chmodSync(path.join(tmpRoot, 'readonly'), 0o700);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('refuses to start with a clear message when the data directory is not writable', async (ctx) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) ctx.skip();
  const dataDir = path.join(tmpRoot, 'readonly');
  fs.mkdirSync(dataDir);
  fs.chmodSync(dataDir, 0o500);
  await assert.rejects(startServer(dataDir), /DATA_DIR.*недоступн|not writable/i);
}, 60_000);

test('reports a recovered corrupted data file through the admin API', async () => {
  const dataDir = path.join(tmpRoot, 'corrupt');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'db.json'), '{ broken');
  const srv = await startServer(dataDir);
  try {
    const list = await srv.call('GET', '/api/forms');
    assert.equal(list.status, 200);
    assert.match(list.json.storage?.recoveredFrom ?? '', /^db\.corrupt-\d+\.json$/);
  } finally {
    await srv.close();
  }
}, 60_000);
