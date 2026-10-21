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
 * Whole-database JSON file kept in memory. Mutations are queued and run one at a time
 * against a draft copy; the draft is written atomically (temp file + fsync + rename) and
 * only then becomes the live data. So a mutation that throws, or a failed disk write,
 * leaves no trace, and readers only ever see what is already on disk.
 */
export class JsonStore {
  readonly file: string;
  data: DbData;
  private tmpCounter = 0;
  private queue: Promise<unknown> = Promise.resolve();

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

  mutate<T>(fn: (data: DbData) => T): Promise<T> {
    const run = async () => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      await this.write(draft);
      this.data = draft;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async write(data: DbData): Promise<void> {
    const json = JSON.stringify(data);
    const tmp = `${this.file}.${process.pid}.${this.tmpCounter++}.tmp`;
    try {
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
          return;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
          await sleep(20 * (attempt + 1));
        }
      }
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
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
