import { test, describe, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { pruneAnswers, sanitizeAnswers, withUnparsed } from '../lib/answers';
import { swapped } from '../lib/list';
import { formatDate, formatPercent, plural, truncate } from '../lib/format';
import { api, changedFormFrom, isRequestError, RequestError } from '../lib/api-client';
import { contentKey } from '../components/admin/editor/contentKey';
import {
  clearFieldErrors,
  countErrors,
  fieldElId,
  firstErrorTarget,
  mapErrors,
  optElId,
  templateTexts,
} from '../components/admin/editor/errors';
import type { Field } from '../lib/schema';

// Unit tests for browser-side logic that has no DOM dependency.
const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'f', type: 'short_text', label: 'Имя', hint: '', placeholder: '',
  required: false, options: [], min: null, max: null, ...overrides,
});
const choice = (id: string, type: Field['type'], optionIds: string[]) =>
  field({ id, type, options: optionIds.map((o) => ({ id: o, label: `Опция ${o}` })) });

describe('pruneAnswers (form changed while a student was filling it in)', () => {
  test('keeps answers to unchanged fields, drops removed fields, retyped fields and removed options', () => {
    const prev = [field({ id: 'name' }), choice('city', 'select', ['a', 'b']), choice('skills', 'multi_select', ['x', 'y']), field({ id: 'age', type: 'number' })];
    const next = [field({ id: 'name' }), choice('city', 'select', ['b']), choice('skills', 'multi_select', ['y']), field({ id: 'age', type: 'short_text' })];
    const answers = { name: 'Анна', city: 'a', skills: ['x', 'y'], age: '20', gone: 'x' };
    assert.deepEqual(pruneAnswers(answers, prev, next), { name: 'Анна', skills: ['y'] });
  });
});

describe('sanitizeAnswers (a draft restored from sessionStorage is untrusted)', () => {
  const fields = [field({ id: 't' }), field({ id: 'c', type: 'checkbox' }), choice('r', 'radio', ['a']), choice('m', 'multi_select', ['a', 'b'])];

  test('non-object drafts give no answers', () => {
    for (const raw of [null, undefined, 'x', 1, ['a']]) assert.deepEqual(sanitizeAnswers(raw, fields), {}, String(raw));
  });

  test('keeps only values of the right shape for the current fields', () => {
    const raw = JSON.parse('{"t":"текст","c":"yes","r":"zzz","m":["b",1,"zzz"],"unknown":"x","__proto__":{"t":"polluted"}}');
    assert.deepEqual(sanitizeAnswers(raw, fields), { t: 'текст', m: ['b'] });
    assert.deepEqual(sanitizeAnswers({ c: true, r: 'a', t: 5 }, fields), { c: true, r: 'a' });
  });
});

describe('withUnparsed (browser could not parse a number or a date)', () => {
  const fields = [field({ id: 'n', type: 'number', required: true }), field({ id: 'd', type: 'date' }), field({ id: 't' })];

  test('overrides value errors for number and date controls only', () => {
    const merged = withUnparsed({ n: 'Обязательное поле', x: 'other' }, fields, new Set(['n', 'd', 't']));
    assert.deepEqual(merged, { n: 'Введите число', d: 'Введите дату полностью', x: 'other' });
  });

  test('returns the same errors object when nothing is unparsed', () => {
    const errors = { n: 'Обязательное поле' };
    assert.equal(withUnparsed(errors, fields, new Set()), errors);
  });
});

describe('contentKey (editor dirty check)', () => {
  const draft = (fields: Field[]) => ({ title: 'T', description: '', fields });

  test('equal content gives equal keys; order and every edited prop matter', () => {
    const a = field({ id: 'a' });
    const b = field({ id: 'b', type: 'number' });
    assert.equal(contentKey(draft([a, b])), contentKey(draft([{ ...a }, { ...b }])));
    assert.notEqual(contentKey(draft([a, b])), contentKey(draft([b, a])));
    assert.notEqual(contentKey(draft([a])), contentKey(draft([{ ...a, required: true }])));
  });

  test('an unparsable limit (NaN) is a change, not the same as "no limit"', () => {
    const n = field({ type: 'number' });
    assert.notEqual(contentKey(draft([{ ...n, min: NaN }])), contentKey(draft([n])));
  });
});

describe('editor error mapping', () => {
  const fields = [field({ id: 'a' }), choice('b', 'select', ['o1', 'o2'])];

  test('mapErrors keys server errors by field and option id; unknown keys become form-level', () => {
    const mapped = mapErrors(
      { title: 'Нет названия', 'fields.1.label': 'Пусто', 'fields.1.options.1': 'Повтор', 'fields.9.label': 'Нет такого', odd: 'Странно' },
      fields,
    );
    assert.equal(mapped.title, 'Нет названия');
    assert.deepEqual(mapped.byField.b, { label: 'Пусто', opt: { o2: 'Повтор' } });
    assert.deepEqual(mapped.other, ['Нет такого', 'Странно']);
    assert.equal(countErrors(mapped), 5);
  });

  test('firstErrorTarget follows on-screen order', () => {
    assert.deepEqual(firstErrorTarget(mapErrors({ 'fields.1.options.0': 'x', 'fields.0.hint': 'y' }, fields), fields), {
      elId: fieldElId('a', 'hint'), fieldId: 'a',
    });
    assert.deepEqual(firstErrorTarget(mapErrors({ 'fields.1.options.1': 'x' }, fields), fields), {
      elId: optElId('b', 'o2'), fieldId: 'b',
    });
    assert.equal(firstErrorTarget(mapErrors({}, fields), fields), null);
  });

  test('clearFieldErrors drops only the edited props (a type switch drops all of the field)', () => {
    const mapped = mapErrors({ 'fields.1.label': 'x', 'fields.1.options.0': 'y' }, fields);
    assert.deepEqual(clearFieldErrors(mapped, 'b', ['label']).byField.b, { opt: { o1: 'y' } });
    assert.deepEqual(clearFieldErrors(mapped, 'b', ['options']).byField.b, { label: 'x' });
    assert.equal(clearFieldErrors(mapped, 'b', ['type']).byField.b, undefined);
  });

  test('templateTexts lists placeholder texts a form would be published with', () => {
    const fieldsWithTemplates = [
      field({ id: 'a', label: 'Новый вопрос' }),
      field({ id: 'b', label: 'Город', type: 'select', options: [{ id: 'x', label: 'Вариант 1' }, { id: 'y', label: 'Казань' }] }),
      field({ id: 'c', label: 'Имя' }),
    ];
    assert.deepEqual(templateTexts(fieldsWithTemplates), ['Вопрос 1: текст «Новый вопрос»', 'Вопрос 2: варианты «Вариант 1»']);
    assert.deepEqual(templateTexts([field({ label: 'Новый вопрос о стажировке' })]), []);
  });
});

describe('small helpers', () => {
  test('swapped swaps two items and ignores out-of-range indexes', () => {
    const list = ['a', 'b', 'c'];
    assert.deepEqual(swapped(list, 0, 2), ['c', 'b', 'a']);
    assert.deepEqual(swapped(list, 0, 3), list);
    assert.deepEqual(list, ['a', 'b', 'c'], 'input untouched');
  });

  test('Russian plurals, percents and truncation', () => {
    const forms = ['ответ', 'ответа', 'ответов'] as const;
    const cases: [number, string][] = [[0, 'ответов'], [1, 'ответ'], [2, 'ответа'], [5, 'ответов'], [11, 'ответов'], [12, 'ответов'], [21, 'ответ'], [22, 'ответа'], [111, 'ответов']];
    for (const [n, expected] of cases) assert.equal(plural(n, forms), expected, String(n));
    assert.equal(formatPercent(null), '—');
    assert.equal(formatPercent(Number.NaN), '—');
    assert.equal(formatPercent(0.425), '42,5%');
    assert.equal(truncate('  много   пробелов  ', 60), 'много пробелов');
    assert.equal(truncate('абвгд', 4), 'абв…');
    assert.equal(formatDate('not a date'), '—');
  });
});

describe('api client error handling', () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, init: ResponseInit) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, init)));
  const failure = async (call: () => Promise<unknown>): Promise<RequestError> => {
    try {
      await call();
    } catch (e) {
      assert.ok(isRequestError(e));
      return e;
    }
    throw new Error('expected a RequestError');
  };

  test('API errors keep their code, message and field errors', async () => {
    respond(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Проверьте', fields: { title: 'Пусто' } } }), { status: 400 });
    const e = await failure(() => api.getForm('x'));
    assert.equal(e.status, 400);
    assert.equal(e.code, 'VALIDATION_ERROR');
    assert.equal(e.message, 'Проверьте');
    assert.deepEqual(e.fields, { title: 'Пусто' });
  });

  test("a non-JSON error page (e.g. a proxy's 502) still gives a readable message", async () => {
    respond('<html>Bad gateway</html>', { status: 502 });
    const e = await failure(() => api.getForm('x'));
    assert.equal(e.code, 'INTERNAL');
    assert.match(e.message, /502/);
  });

  test('a lost connection and a timeout are both NETWORK errors with different messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const lost = await failure(() => api.getForm('x'));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); }));
    const slow = await failure(() => api.getForm('x'));
    assert.equal(lost.code, 'NETWORK');
    assert.equal(slow.code, 'NETWORK');
    assert.notEqual(lost.message, slow.message);
  });

  test('a 2xx answer that is not JSON is reported, not treated as data', async () => {
    respond('oops', { status: 200 });
    assert.equal((await failure(() => api.getForm('x'))).code, 'INVALID_RESPONSE');
  });

  test('changedFormFrom extracts the fresh form from a 409 FORM_CHANGED answer only', () => {
    const fresh = { publicId: 'p', title: 'T', description: '', fields: [], version: 2 };
    assert.deepEqual(changedFormFrom(new RequestError(409, 'FORM_CHANGED', 'm', undefined, { form: fresh })), fresh);
    assert.equal(changedFormFrom(new RequestError(409, 'FORM_CHANGED', 'm', undefined, { form: { fields: 'no' } })), null);
  });

  test('the CSV link carries the browser time zone', () => {
    const url = new URL(api.responsesCsvUrl('id 1'), 'http://x');
    assert.equal(url.pathname, '/api/forms/id%201/responses/csv');
    assert.equal(url.searchParams.get('tz'), Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
