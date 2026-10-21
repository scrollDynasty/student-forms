import fs from 'node:fs/promises';
import path from 'node:path';
import type { Answers, Field, FormContent } from '@/lib/schema';

export interface StoredForm extends FormContent {
  id: string;
  publicId: string;
  status: 'draft' | 'published';
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface StoredResponse {
  id: string;
  formId: string;
  submissionId: string;
  sessionId: string | null;
  formVersion: number;
  submittedAt: string;
  answers: Answers;
  /** Snapshot of the form fields at submit time, so later edits never rewrite history. */
  fields: Field[];
}

export interface StoredSession {
  id: string;
  formId: string;
  viewedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  /** Field ids the student changed, in the order of first change. */
  fields: string[];
  lastFieldId: string | null;
}

export interface DbData {
  forms: StoredForm[];
  responses: StoredResponse[];
  sessions: StoredSession[];
}

const FILE_NAME = 'db.json';
const emptyData = (): DbData => ({ forms: [], responses: [], sessions: [] });
const isValidShape = (v: unknown): v is DbData =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as DbData).forms) &&
  Array.isArray((v as DbData).responses) &&
  Array.isArray((v as DbData).sessions);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Whole-database JSON file kept in memory. Mutations run synchronously against the
 * in-memory copy (atomic within the single Node process) and are persisted with an
 * atomic write: temp file + fsync + rename. Concurrent mutations are coalesced into
 * as few writes as possible; each `mutate` resolves only after its change is on disk.
 */
export class JsonStore {
  readonly file: string;
  data: DbData;
  writeCount = 0;
  private tmpCounter = 0;
  private scheduled: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();

  private constructor(readonly dir: string, data: DbData) {
    this.file = path.join(dir, FILE_NAME);
    this.data = data;
  }

  static async open(dir: string): Promise<JsonStore> {
    await fs.mkdir(dir, { recursive: true });
    for (const name of await fs.readdir(dir)) {
      if (name.startsWith(`${FILE_NAME}.`) && name.endsWith('.tmp')) {
        await fs.rm(path.join(dir, name), { force: true });
      }
    }
    const file = path.join(dir, FILE_NAME);
    let raw: string | null = null;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (raw === null) return new JsonStore(dir, emptyData());

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidShape(parsed)) throw new Error('unexpected structure');
      return new JsonStore(dir, parsed);
    } catch (err) {
      const backup = path.join(dir, `db.corrupt-${Date.now()}.json`);
      await fs.rename(file, backup);
      console.warn(`[store] ${file} is unreadable (${(err as Error).message}); moved to ${backup}, starting empty`);
      return new JsonStore(dir, emptyData());
    }
  }

  async mutate<T>(fn: (data: DbData) => T): Promise<T> {
    const result = fn(this.data);
    await this.persist();
    return result;
  }

  private persist(): Promise<void> {
    if (this.scheduled) return this.scheduled;
    const next = this.writing.then(() => {
      // Changes made after this point need a new write.
      this.scheduled = null;
      return this.writeNow();
    });
    this.scheduled = next;
    this.writing = next.catch(() => undefined);
    return next;
  }

  private async writeNow(): Promise<void> {
    const json = JSON.stringify(this.data);
    const tmp = `${this.file}.${process.pid}.${this.tmpCounter++}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    // On Windows antivirus/indexers can briefly lock the target file.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, this.file);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
          await fs.rm(tmp, { force: true });
          throw err;
        }
        await sleep(20 * (attempt + 1));
      }
    }
    this.writeCount++;
  }
}

const globalStores = globalThis as typeof globalThis & { __studentFormsStores?: Map<string, Promise<JsonStore>> };

export function dataDir(): string {
  // The data directory is runtime state, not a build input: keep it out of output tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

/**
 * Process-wide store. Next bundles every route separately, so the instance lives on
 * globalThis to make all route handlers share one in-memory copy.
 */
export function getStore(): Promise<JsonStore> {
  const dir = dataDir();
  globalStores.__studentFormsStores ??= new Map();
  let store = globalStores.__studentFormsStores.get(dir);
  if (!store) {
    store = JsonStore.open(dir);
    store.catch(() => globalStores.__studentFormsStores?.delete(dir));
    globalStores.__studentFormsStores.set(dir, store);
  }
  return store;
}
