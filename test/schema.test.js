import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_TYPES,
  createField,
  normalizeFormInput,
  validateAnswers,
  formatValue,
} from '../shared/schema.js';

const field = (overrides) => ({
  id: 'f1', type: 'short_text', label: 'Имя', hint: '', placeholder: '',
  required: false, options: [], min: null, max: null, ...overrides,
});
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
      const { errors } = normalizeFormInput({ title: 'T', fields: [f] });
      assert.deepEqual(errors, {}, `type ${type}`);
      if (['select', 'radio', 'multi_select'].includes(type)) assert.ok(f.options.length >= 2);
    }
  });
});

describe('normalizeFormInput', () => {
  test('requires a title and trims strings', () => {
    assert.ok(normalizeFormInput({ title: '   ' }).errors.title);
    const { value, errors } = normalizeFormInput({ title: '  Стажировка  ', description: ' d ' });
    assert.deepEqual(errors, {});
    assert.equal(value.title, 'Стажировка');
    assert.equal(value.description, 'd');
    assert.deepEqual(value.fields, []);
  });

  test('rejects non-object input and non-array fields', () => {
    assert.ok(normalizeFormInput(null).errors._root);
    assert.ok(normalizeFormInput({ title: 'T', fields: 'x' }).errors.fields);
  });

  test('rejects unknown field type and empty label with indexed keys', () => {
    const { errors } = normalizeFormInput({
      title: 'T',
      fields: [field({ type: 'weird' }), field({ id: 'f2', label: '' })],
    });
    assert.ok(errors['fields.0.type']);
    assert.ok(errors['fields.1.label']);
  });

  test('choice fields need at least one option and unique option labels', () => {
    let r = normalizeFormInput({ title: 'T', fields: [field({ type: 'select', options: [] })] });
    assert.ok(r.errors['fields.0.options']);
    r = normalizeFormInput({
      title: 'T',
      fields: [field({ type: 'radio', options: [{ id: 'a', label: 'X' }, { id: 'b', label: ' x ' }] })],
    });
    assert.ok(r.errors['fields.0.options.1']);
    r = normalizeFormInput({ title: 'T', fields: [field({ type: 'radio', options: [{ id: 'a', label: '' }] })] });
    assert.ok(r.errors['fields.0.options.0']);
  });

  test('generates missing / invalid ids and dedupes field ids', () => {
    const { value, errors } = normalizeFormInput({
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
    const { value } = normalizeFormInput({
      title: 'T',
      fields: [field({ options: opts, min: 1, max: 2 })],
    });
    assert.deepEqual(value.fields[0].options, []);
    assert.equal(value.fields[0].min, null);
  });

  test('validates number min <= max', () => {
    const r = normalizeFormInput({ title: 'T', fields: [field({ type: 'number', min: 10, max: 1 })] });
    assert.ok(r.errors['fields.0.max']);
    const ok = normalizeFormInput({ title: 'T', fields: [field({ type: 'number', min: '1', max: '' })] });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value.fields[0].min, 1);
    assert.equal(ok.value.fields[0].max, null);
  });

  test('enforces length limits', () => {
    const r = normalizeFormInput({ title: 'x'.repeat(201), fields: [field({ label: 'y'.repeat(301) })] });
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
