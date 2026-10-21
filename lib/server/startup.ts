import { assertDataDirWritable } from './store';

/** Node.js-only startup checks; an unusable data directory stops the server with a clear message. */
export async function runStartupChecks(): Promise<void> {
  try {
    await assertDataDirWritable();
  } catch (err) {
    console.error(`\n✖ ${(err as Error).message}\n`);
    process.exit(1);
  }
}
