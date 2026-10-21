import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIELD_TYPES,
  createField,
  normalizeFormInput,
  validateAnswers,
  formatValue,
  generateUuid,
  type Field,
} from '../lib/schema';

// Inputs are deliberately loose: the tests feed invalid data on purpose.
const field = (overrides: Record<string, unknown> = {}): Field => ({
  id: 'f1', type: 'short_text', label: 'Имя', hint: '', placeholder: '',
  required: false, options: [], min: null, max: null, ...overrides,
}) as Field;
const norm = (input: unknown) => {
  const r = normalizeFormInput(input);
  return { value: r.value!, errors: r.errors };
};
const opts = [{ id: 'a', label: 'Альфа' }, { id: 'b', label: 'Бета' }];

describe('FIELD_TYPES / createField', () => {
  test('exposes all ten required field types', () => {
    assert.deepEqual(
      FIELD_TYPES.map((t) => t.type).sort(),
      ['checkbox', 'date', 'email', 'long_text', 'multi_select', 'number', 'phone', 'radio', 'select', 'short_text'],
    );
  });

  test('createField makes a valid field with options for choice types', () => {
    for (const { type } of FIELD_TYPES) {
      const f = createField(type);
      const { errors } = norm({ title: 'T', fields: [f] });
      assert.deepEqual(errors, {}, `type ${type}`);
      if (['select', 'radio', 'multi_select'].includes(type)) assert.ok(f.options.length >= 2);
    }
  });
});

describe('normalizeFormInput', () => {
  test('requires a title and trims strings', () => {
    assert.ok(norm({ title: '   ' }).errors.title);
    const { value, errors } = norm({ title: '  Стажировка  ', description: ' d ' });
    assert.deepEqual(errors, {});
    assert.equal(value.title, 'Стажировка');
    assert.equal(value.description, 'd');
    assert.deepEqual(value.fields, []);
  });

  test('rejects non-object input and non-array fields', () => {
    assert.ok(norm(null).errors._root);
    assert.ok(norm({ title: 'T', fields: 'x' }).errors.fields);
  });

  test('rejects unknown field type and empty label with indexed keys', () => {
    const { errors } = norm({
      title: 'T',
      fields: [field({ type: 'weird' }), field({ id: 'f2', label: '' })],
    });
    assert.ok(errors['fields.0.type']);
    assert.ok(errors['fields.1.label']);
  });

  test('choice fields need at least one option and unique option labels', () => {
    let r = norm({ title: 'T', fields: [field({ type: 'select', options: [] })] });
    assert.ok(r.errors['fields.0.options']);
    r = norm({
      title: 'T',
      fields: [field({ type: 'radio', options: [{ id: 'a', label: 'X' }, { id: 'b', label: ' x ' }] })],
    });
    assert.ok(r.errors['fields.0.options.1']);
    r = norm({ title: 'T', fields: [field({ type: 'radio', options: [{ id: 'a', label: '' }] })] });
    assert.ok(r.errors['fields.0.options.0']);
  });

  test('generates missing / invalid ids and dedupes field ids', () => {
    const { value, errors } = norm({
      title: 'T',
      fields: [
        field({ id: undefined }),
        field({ id: 'dup' }),
        field({ id: 'dup' }),
        field({ id: 'bad id!' }),
        field({ id: 'c', type: 'select', options: [{ label: 'Без id' }] }),
      ],
    });
    assert.deepEqual(errors, {});
    const ids = value.fields.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)));
    assert.match(value.fields[4].options[0].id, /^[A-Za-z0-9_-]+$/);
  });

  test('strips options from non-choice fields and min/max from non-number fields', () => {
    const { value } = norm({
      title: 'T',
      fields: [field({ options: opts, min: 1, max: 2 })],
    });
    assert.deepEqual(value.fields[0].options, []);
    assert.equal(value.fields[0].min, null);
  });

  test('validates number min <= max', () => {
    const r = norm({ title: 'T', fields: [field({ type: 'number', min: 10, max: 1 })] });
    assert.ok(r.errors['fields.0.max']);
    const ok = norm({ title: 'T', fields: [field({ type: 'number', min: '1', max: '' })] });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value.fields[0].min, 1);
    assert.equal(ok.value.fields[0].max, null);
  });

  test('enforces length limits', () => {
    const r = norm({ title: 'x'.repeat(201), fields: [field({ label: 'y'.repeat(301) })] });
    assert.ok(r.errors.title);
    assert.ok(r.errors['fields.0.label']);
  });
});

describe('validateAnswers', () => {
  test('requires required fields, including required checkbox = true', () => {
    const fields = [
      field({ id: 'name', required: true }),
      field({ id: 'agree', type: 'checkbox', required: true }),
      field({ id: 'many', type: 'multi_select', options: opts, required: true }),
    ];
    const { errors } = validateAnswers(fields, { name: '  ', agree: false, many: [] });
    assert.deepEqual(Object.keys(errors).sort(), ['agree', 'many', 'name']);
  });

  test('accepts a complete valid submission and normalizes values', () => {
    const fields = [
      field({ id: 'name', required: true }),
      field({ id: 'bio', type: 'long_text' }),
      field({ id: 'mail', type: 'email', required: true }),
      field({ id: 'tel', type: 'phone' }),
      field({ id: 'age', type: 'number', min: 16, max: 99 }),
      field({ id: 'city', type: 'select', options: opts }),
      field({ id: 'course', type: 'radio', options: opts }),
      field({ id: 'skills', type: 'multi_select', options: opts }),
      field({ id: 'start', type: 'date' }),
      field({ id: 'agree', type: 'checkbox', required: true }),
    ];
    const { values, errors } = validateAnswers(fields, {
      name: ' Анна ', bio: 'Люблю код', mail: 'anna@example.com', tel: '+7 (999) 123-45-67',
      age: 20, city: 'a', course: 'b', skills: ['b', 'a', 'a'], start: '2026-02-28', agree: true,
      extra: 'ignored',
    });
    assert.deepEqual(errors, {});
    assert.equal(values.name, 'Анна');
    assert.deepEqual(values.skills, ['a', 'b']);
    assert.equal(values.extra, undefined);
  });

  test('omits empty optional answers', () => {
    const fields = [field({ id: 'x' }), field({ id: 'y', type: 'multi_select', options: opts })];
    const { values, errors } = validateAnswers(fields, { x: '', y: [] });
    assert.deepEqual(errors, {});
    assert.deepEqual(values, {});
  });

  test('rejects values of the wrong type or format', () => {
    const fields = [
      field({ id: 'mail', type: 'email' }),
      field({ id: 'tel', type: 'phone' }),
      field({ id: 'age', type: 'number', min: 16 }),
      field({ id: 'n2', type: 'number' }),
      field({ id: 'city', type: 'select', options: opts }),
      field({ id: 'skills', type: 'multi_select', options: opts }),
      field({ id: 'd', type: 'date' }),
      field({ id: 'd2', type: 'date' }),
      field({ id: 'agree', type: 'checkbox' }),
      field({ id: 'name' }),
    ];
    const { errors } = validateAnswers(fields, {
      mail: 'not-an-email', tel: 'abc', age: 10, n2: 'двадцать', city: 'zzz',
      skills: ['a', 'zzz'], d: '2026-02-30', d2: 'tomorrow', agree: 'yes', name: { evil: 1 },
    });
    assert.deepEqual(
      Object.keys(errors).sort(),
      ['age', 'agree', 'city', 'd', 'd2', 'mail', 'n2', 'name', 'skills', 'tel'],
    );
  });

  test('rejects too long text', () => {
    const { errors } = validateAnswers([field({ id: 's' })], { s: 'x'.repeat(501) });
    assert.ok(errors.s);
  });

  test('treats non-object answers as empty', () => {
    const { errors } = validateAnswers([field({ id: 's', required: true })], 'garbage');
    assert.ok(errors.s);
  });
});

describe('formatValue', () => {
  test('renders human-readable values', () => {
    assert.equal(formatValue(field({ type: 'select', options: opts }), 'b'), 'Бета');
    assert.equal(formatValue(field({ type: 'multi_select', options: opts }), ['a', 'b']), 'Альфа, Бета');
    assert.equal(formatValue(field({ type: 'checkbox' }), true), 'Да');
    assert.equal(formatValue(field({ type: 'checkbox' }), false), 'Нет');
    assert.equal(formatValue(field({ type: 'date' }), '2026-03-01'), '01.03.2026');
    assert.equal(formatValue(field({}), undefined), '—');
    assert.equal(formatValue(field({ type: 'select', options: opts }), 'gone'), 'gone');
  });
});

describe('hardening', () => {
  test('reserved object keys are never used as ids', () => {
    const { value } = norm({
      title: 'T',
      fields: [field({ id: '__proto__' }), field({ id: 'constructor' })],
    });
    assert.ok(value!.fields.every((f) => !['__proto__', 'constructor', 'prototype'].includes(f.id)));
  });

  test('stricter email and phone formats', () => {
    const fields = [field({ id: 'm', type: 'email' }), field({ id: 'p', type: 'phone' })];
    assert.ok(validateAnswers(fields, { m: 'a@b..cc', p: '+++1234567' }).errors.m);
    assert.ok(validateAnswers(fields, { m: 'a@b..cc', p: '+++1234567' }).errors.p);
    assert.deepEqual(validateAnswers(fields, { m: 'first.last@uni.edu.ru', p: '8 800 555-35-35' }).errors, {});
  });

  test('generateUuid returns RFC 4122 v4 ids without crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUuid()));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('numbers that overflow to Infinity are rejected (would be stored as null)', () => {
    const fields = [field({ id: 'n', type: 'number' })];
    assert.ok(validateAnswers(fields, { n: '9'.repeat(400) }).errors.n);
    assert.ok(norm({ title: 'T', fields: [field({ type: 'number', min: '9'.repeat(400) })] }).errors['fields.0.min']);
  });

  test('a NaN min/max (the builder marks unparsable input that way) is an error, not "no limit"', () => {
    const { errors } = norm({ title: 'T', fields: [field({ type: 'number', min: NaN, max: NaN })] });
    assert.equal(errors['fields.0.min'], 'Минимум должен быть числом');
    assert.equal(errors['fields.0.max'], 'Максимум должен быть числом');
  });

  test('accepts every number format <input type="number"> can produce', () => {
    const fields = [field({ id: 'n', type: 'number' })];
    const value = (raw: string) => validateAnswers(fields, { n: raw }).values.n;
    assert.equal(value('1e3'), 1000);
    assert.equal(value('-2.5E-1'), -0.25);
    assert.equal(value('.5'), 0.5);
    assert.equal(value('1,5'), 1.5);
    assert.equal(value(' 1e3 '), 1000);
    assert.equal(value('1e-7'), 1e-7);
    for (const bad of ['0x10', '1e', 'Infinity', '1.2.3', '--1']) {
      assert.equal(validateAnswers(fields, { n: bad }).errors.n, 'Введите число', bad);
    }
  });

  test('rejects numbers with more digits than a double keeps instead of silently rounding them', () => {
    const fields = [field({ id: 'n', type: 'number' })];
    assert.ok(validateAnswers(fields, { n: '12345678901234567890' }).errors.n);
    assert.ok(validateAnswers(fields, { n: '0.12345678901234567' }).errors.n);
    assert.equal(validateAnswers(fields, { n: '123456789012345' }).values.n, 123456789012345);
    // Trailing zeros of an integer are exact in a double, so they don't count.
    assert.equal(validateAnswers(fields, { n: '1234567890123450000' }).values.n, 1234567890123450000);
    assert.equal(validateAnswers(fields, { n: '0.000001' }).values.n, 0.000001);
  });
});

describe('isAllowedHost (DNS-rebinding guard)', async () => {
  const { isAllowedHost } = await import('../lib/server/host');
  test('accepts localhost, IP literals and ALLOWED_HOSTS, rejects other names', () => {
    for (const h of ['localhost:3000', 'app.localhost', '127.0.0.1:3000', '192.168.0.5', '[::1]:3000']) {
      assert.equal(isAllowedHost(h, ''), true, h);
    }
    for (const h of ['evil.example', 'evil.example:3000', 'localhost.evil.example', '', null]) {
      assert.equal(isAllowedHost(h, ''), false, String(h));
    }
    assert.equal(isAllowedHost('forms.example.org', ' forms.example.org , other.org'), true);
  });

  test('rejects Host values that are not a plain host[:port] (userinfo, paths, queries)', () => {
    for (const h of ['evil.example@127.0.0.1', 'evil.example@localhost:3000', '127.0.0.1/evil', 'localhost?x', 'local host']) {
      assert.equal(isAllowedHost(h, ''), false, h);
    }
  });
});

describe('rateLimit', async () => {
  const { rateLimit } = await import('../lib/server/http');
  const req = (ip: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } });

  test('a flood of other clients cannot evict a scope counter and reset its limit', () => {
    const scope = `victim-${Math.random()}`;
    rateLimit(req('10.0.0.1'), scope, 100, 2);
    rateLimit(req('10.0.0.2'), scope, 100, 2);
    // Spoofed X-Forwarded-For values create one bucket each.
    for (let i = 0; i < 25_000; i++) rateLimit(req(`spoofed-${i}`), `flood-${scope}`, 100, 1_000_000);
    assert.throws(() => rateLimit(req('10.0.0.3'), scope, 100, 2), { code: 'RATE_LIMITED' });
  });
});
