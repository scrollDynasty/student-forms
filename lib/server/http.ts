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

/** Reads a JSON object body with a size limit; anything else is a 4xx ApiError. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw tooLarge();
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw tooLarge();
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
