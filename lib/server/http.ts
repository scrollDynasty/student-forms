import type { ErrorMap } from '../schema';

export const MAX_BODY_BYTES = 200 * 1024;

/** An error that maps 1:1 to the `{ error: { code, message, fields? } }` API format. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: ErrorMap,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ресурс') => new ApiError(404, 'NOT_FOUND', `${what} не найден(а)`);
export const validationError = (fields: ErrorMap, message = 'Проверьте правильность заполнения') =>
  new ApiError(400, 'VALIDATION_ERROR', message, fields);

/** Reads the body as UTF-8, aborting as soon as it exceeds the limit (chunked bodies included). */
async function readLimitedText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Like readJsonObject, but an empty body is allowed and reads as {}. */
export async function readOptionalJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await readLimitedText(request);
  return text.trim() === '' ? {} : parseJsonObject(text);
}

/** Reads a JSON object body with a size limit; anything else is a 4xx ApiError. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  return parseJsonObject(await readLimitedText(request));
}

function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Тело запроса должно быть корректным JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'INVALID_JSON', 'Тело запроса должно быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

const tooLarge = () =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', `Слишком большой запрос (максимум ${MAX_BODY_BYTES / 1024} КБ)`);

/**
 * The admin API has no auth (by the task's requirement), so at least stop other sites from
 * driving it through a visitor's browser: browsers always send Origin on cross-site requests.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return; // curl, tests and same-origin GETs
  // Only the Host the browser connected to counts: X-Forwarded-Host is client-controlled without a proxy.
  const host = request.headers.get('host');
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    /* "null" or garbage */
  }
  if (!host || originHost !== host) {
    throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Запрос с другого сайта отклонён');
  }
}

type Bucket = { count: number; resetAt: number };
/** Per-scope counters: scopes are fixed names or existing forms, so live ones are never evicted. */
const scopeBuckets = new Map<string, Bucket>();
/** Per-scope-and-client counters: the client part can be spoofed, so this map is capped. */
const clientBuckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const WINDOW_MS = 60_000;

/** Counts one hit in a fixed one-minute window; true when the key is over its limit. */
function hit(buckets: Map<string, Bucket>, key: string, limit: number, evictLive: boolean): boolean {
  const t = Date.now();
  if (buckets.size >= MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
    // Still full (e.g. a flood of spoofed client keys): drop the oldest entries to bound memory.
    for (const k of buckets.keys()) {
      if (!evictLive || buckets.size < MAX_BUCKETS * 0.9) break;
      buckets.delete(k);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= t) {
    buckets.set(key, { count: 1, resetAt: t + WINDOW_MS });
    return false;
  }
  return ++bucket.count > limit;
}

/**
 * In-memory rate limit with two layers. `perClient` is keyed by the client address: `next start`
 * fills X-Forwarded-For with the socket address, but keeps a client-supplied value, so this layer
 * can be dodged by spoofing. `perScope` caps the scope as a whole (e.g. one form) regardless of
 * who asks, which bounds abuse even then. Behind a reverse proxy, it must overwrite X-Forwarded-For.
 * Callers pass only bounded scopes (fixed names, existing forms), so spoofed keys can't push a live scope out.
 */
export function rateLimit(request: Request, scope: string, perClient: number, perScope: number): void {
  const client = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 64);
  const overScope = hit(scopeBuckets, scope, perScope, false);
  const overClient = hit(clientBuckets, `${scope}|${client}`, perClient, true);
  if (overScope || overClient) {
    throw new ApiError(429, 'RATE_LIMITED', 'Слишком много запросов. Попробуйте через минуту.');
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });
export const noContent = () => new Response(null, { status: 204, headers: NO_STORE });

/** Wraps a route handler body: ApiError → JSON error, anything else → logged 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      const error = { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) };
      return json({ error, ...err.extra }, err.status);
    }
    console.error('[api] unexpected error', err);
    return json({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } }, 500);
  }
}
