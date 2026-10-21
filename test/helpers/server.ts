/* eslint-disable @typescript-eslint/no-explicit-any -- black-box tests inspect untyped JSON responses */
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const NEXT_BIN = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

export interface CallResult {
  status: number;
  json: any;
  text: string;
  headers: Headers;
}

export interface TestServer {
  base: string;
  port: number;
  call: (method: string, url: string, body?: unknown, opts?: { raw?: boolean }) => Promise<CallResult>;
  close: () => Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** Starts the production build (`next start`) with an isolated data directory. Requires `next build`. */
export async function startServer(dataDir: string): Promise<TestServer> {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [NEXT_BIN, 'start'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited early:\n${output}`);
    try {
      const res = await fetch(`${base}/api/forms`);
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`next start did not become ready:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const call: TestServer['call'] = async (method, url, body, { raw = false } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  };

  const close = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });

  return { base, port, call, close };
}
