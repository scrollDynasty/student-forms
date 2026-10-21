// Shared form schema: field catalog, form-definition normalization, answer validation.
// Used by both the server (authoritative) and the browser (instant feedback), so it must
// stay free of Node- or DOM-specific imports.

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'radio'
  | 'multi_select'
  | 'date'
  | 'checkbox';

export interface Option {
  id: string;
  label: string;
}

export interface Field {
  id: string;
  type: FieldType;
  label: string;
  hint: string;
  placeholder: string;
  required: boolean;
  options: Option[];
  min: number | null;
  max: number | null;
}

export interface FormContent {
  title: string;
  description: string;
  fields: Field[];
}

export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue>;
export type ErrorMap = Record<string, string>;

interface FieldTypeMeta {
  type: FieldType;
  label: string;
  icon: string;
  placeholder?: boolean;
  choice?: boolean;
}

export const FIELD_TYPES: readonly FieldTypeMeta[] = [
  { type: 'short_text', label: 'Короткий текст', icon: 'Aa', placeholder: true },
  { type: 'long_text', label: 'Длинный текст', icon: '¶', placeholder: true },
  { type: 'email', label: 'Email', icon: '@', placeholder: true },
  { type: 'phone', label: 'Телефон', icon: '☏', placeholder: true },
  { type: 'number', label: 'Число', icon: '#', placeholder: true },
  { type: 'select', label: 'Выпадающий список', icon: '▾', choice: true },
  { type: 'radio', label: 'Один из списка', icon: '◉', choice: true },
  { type: 'multi_select', label: 'Множественный выбор', icon: '☑', choice: true },
  { type: 'date', label: 'Дата', icon: '▦' },
  { type: 'checkbox', label: 'Флажок (согласие)', icon: '✓' },
];

const TYPE_MAP = new Map<string, FieldTypeMeta>(FIELD_TYPES.map((t) => [t.type, t]));
export const isChoiceType = (type: string) => Boolean(TYPE_MAP.get(type)?.choice);
export const hasPlaceholder = (type: string) => Boolean(TYPE_MAP.get(type)?.placeholder);
export const fieldTypeLabel = (type: string) => TYPE_MAP.get(type)?.label ?? type;
export const fieldTypeIcon = (type: string) => TYPE_MAP.get(type)?.icon ?? '?';

export const LIMITS = {
  title: 200,
  description: 2000,
  fields: 100,
  label: 300,
  hint: 500,
  placeholder: 200,
  options: 50,
  optionLabel: 200,
  short_text: 500,
  long_text: 5000,
  email: 254,
  phone: 30,
} as const;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMERIC_RE = /^-?\d+([.,]\d+)?$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v) && !RESERVED_IDS.has(v);

export function generateId(length = 10): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** UUID v4 built on getRandomValues: crypto.randomUUID is missing on plain-HTTP non-localhost origins. */
export function generateUuid(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && NUMERIC_RE.test(v.trim())) return Number(v.trim().replace(',', '.'));
  return NaN;
}

export function createField(type: FieldType = 'short_text'): Field {
  const meta = TYPE_MAP.get(type) ?? TYPE_MAP.get('short_text')!;
  return {
    id: generateId(),
    type: meta.type,
    label: meta.type === 'checkbox' ? 'Я согласен(на) на обработку персональных данных' : 'Новый вопрос',
    hint: '',
    placeholder: '',
    required: false,
    options: meta.choice
      ? [
          { id: generateId(), label: 'Вариант 1' },
          { id: generateId(), label: 'Вариант 2' },
        ]
      : [],
    min: null,
    max: null,
  };
}

/**
 * Validates and normalizes a form definition coming from the admin UI.
 * Errors are a flat map keyed like "fields.2.label"; `value` is null only for a non-object input.
 */
export function normalizeFormInput(input: unknown): { value: FormContent | null; errors: ErrorMap } {
  const errors: ErrorMap = {};
  if (!isPlainObject(input)) {
    return { value: null, errors: { _root: 'Ожидался объект формы' } };
  }

  const title = str(input.title);
  if (!title) errors.title = 'Укажите название формы';
  else if (title.length > LIMITS.title) errors.title = `Не длиннее ${LIMITS.title} символов`;

  const description = str(input.description);
  if (description.length > LIMITS.description) errors.description = `Не длиннее ${LIMITS.description} символов`;

  let rawFields: unknown[] = [];
  if (input.fields !== undefined && !Array.isArray(input.fields)) {
    errors.fields = 'Список полей должен быть массивом';
  } else if (Array.isArray(input.fields) && input.fields.length > LIMITS.fields) {
    errors.fields = `Не больше ${LIMITS.fields} полей`;
  } else if (Array.isArray(input.fields)) {
    rawFields = input.fields;
  }

  const usedIds = new Set<string>();
  const uniqueId = (candidate: unknown) => {
    let id = isValidId(candidate) ? candidate : generateId();
    while (usedIds.has(id)) id = generateId();
    usedIds.add(id);
    return id;
  };

  const fields = rawFields.map((raw, i): Field => {
    const key = `fields.${i}`;
    const f = isPlainObject(raw) ? raw : {};
    const meta = TYPE_MAP.get(String(f.type));
    if (!meta) errors[`${key}.type`] = 'Неизвестный тип поля';

    const label = str(f.label);
    if (!label) errors[`${key}.label`] = 'Укажите вопрос';
    else if (label.length > LIMITS.label) errors[`${key}.label`] = `Не длиннее ${LIMITS.label} символов`;

    const hint = str(f.hint);
    if (hint.length > LIMITS.hint) errors[`${key}.hint`] = `Не длиннее ${LIMITS.hint} символов`;

    const placeholder = meta?.placeholder ? str(f.placeholder) : '';
    if (placeholder.length > LIMITS.placeholder) {
      errors[`${key}.placeholder`] = `Не длиннее ${LIMITS.placeholder} символов`;
    }

    let options: Option[] = [];
    if (meta?.choice) {
      const rawOptions: unknown[] = Array.isArray(f.options) ? f.options : [];
      if (rawOptions.length === 0) errors[`${key}.options`] = 'Добавьте хотя бы один вариант';
      else if (rawOptions.length > LIMITS.options) errors[`${key}.options`] = `Не больше ${LIMITS.options} вариантов`;
      const seenLabels = new Set<string>();
      const optionIds = new Set<string>();
      options = rawOptions.slice(0, LIMITS.options).map((o, j) => {
        const opt = isPlainObject(o) ? o : {};
        const optLabel = str(opt.label);
        const lower = optLabel.toLowerCase();
        if (!optLabel) errors[`${key}.options.${j}`] = 'Вариант не может быть пустым';
        else if (optLabel.length > LIMITS.optionLabel) {
          errors[`${key}.options.${j}`] = `Не длиннее ${LIMITS.optionLabel} символов`;
        } else if (seenLabels.has(lower)) errors[`${key}.options.${j}`] = 'Такой вариант уже есть';
        seenLabels.add(lower);
        let id = isValidId(opt.id) ? opt.id : generateId();
        while (optionIds.has(id)) id = generateId();
        optionIds.add(id);
        return { id, label: optLabel };
      });
    }

    let min: number | null = null;
    let max: number | null = null;
    if (meta?.type === 'number') {
      min = toNumberOrNull(f.min);
      max = toNumberOrNull(f.max);
      if (Number.isNaN(min)) errors[`${key}.min`] = 'Минимум должен быть числом';
      if (Number.isNaN(max)) errors[`${key}.max`] = 'Максимум должен быть числом';
      if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
        errors[`${key}.max`] = 'Максимум меньше минимума';
      }
    }

    return {
      id: uniqueId(f.id),
      type: (meta?.type ?? String(f.type ?? '')) as FieldType,
      label,
      hint,
      placeholder,
      required: f.required === true,
      options,
      min,
      max,
    };
  });

  return { value: { title, description, fields }, errors };
}

function isEmptyAnswer(v: unknown) {
  return (
    v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0)
  );
}

type OneResult = { value: AnswerValue; error?: undefined } | { value?: undefined; error: string };

function validateOne(field: Field, raw: unknown): OneResult {
  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof raw !== 'string') return { error: 'Ожидался текст' };
      const v = raw.trim();
      const limit = LIMITS[field.type];
      if (v.length > limit) return { error: `Не длиннее ${limit} символов` };
      return { value: v };
    }
    case 'email': {
      if (typeof raw !== 'string') return { error: 'Ожидался email' };
      const v = raw.trim();
      if (v.length > LIMITS.email || !EMAIL_RE.test(v)) {
        return { error: 'Введите корректный email, например name@example.com' };
      }
      return { value: v };
    }
    case 'phone': {
      if (typeof raw !== 'string') return { error: 'Ожидался номер телефона' };
      const v = raw.trim();
      const digits = v.replace(/\D/g, '').length;
      if (v.length > LIMITS.phone || !PHONE_RE.test(v) || digits < 7 || digits > 15) {
        return { error: 'Введите номер телефона, например +7 999 123-45-67' };
      }
      return { value: v };
    }
    case 'number': {
      const n = toNumberOrNull(raw);
      if (n === null || Number.isNaN(n)) return { error: 'Введите число' };
      if (field.min !== null && n < field.min) return { error: `Не меньше ${field.min}` };
      if (field.max !== null && n > field.max) return { error: `Не больше ${field.max}` };
      return { value: n };
    }
    case 'select':
    case 'radio': {
      if (typeof raw !== 'string' || !field.options.some((o) => o.id === raw)) {
        return { error: 'Выберите вариант из списка' };
      }
      return { value: raw };
    }
    case 'multi_select': {
      const allowed = new Set(field.options.map((o) => o.id));
      if (!Array.isArray(raw) || raw.length > allowed.size * 2 || !raw.every((v) => typeof v === 'string' && allowed.has(v))) {
        return { error: 'Выберите варианты из списка' };
      }
      const picked = new Set<string>(raw);
      // Keep the manager-defined option order, drop duplicates.
      return { value: field.options.map((o) => o.id).filter((id) => picked.has(id)) };
    }
    case 'date': {
      const m = typeof raw === 'string' ? DATE_RE.exec(raw.trim()) : null;
      if (!m) return { error: 'Введите дату' };
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2100) {
        return { error: 'Такой даты не существует' };
      }
      return { value: m[0] };
    }
    case 'checkbox': {
      if (typeof raw !== 'boolean') return { error: 'Некорректное значение' };
      return { value: raw };
    }
    default:
      return { error: 'Неизвестный тип поля' };
  }
}

/**
 * Validates answers against the form fields. Unknown keys are dropped,
 * empty optional answers are omitted. Returns { values, errors } keyed by field id.
 */
export function validateAnswers(fields: Field[], answers: unknown): { values: Answers; errors: ErrorMap } {
  const input = isPlainObject(answers) ? answers : {};
  const values: Answers = {};
  const errors: ErrorMap = {};
  for (const field of fields) {
    const raw = Object.prototype.hasOwnProperty.call(input, field.id) ? input[field.id] : undefined;
    const uncheckedBox = field.type === 'checkbox' && raw === false;
    if (isEmptyAnswer(raw) || uncheckedBox) {
      if (field.required) {
        errors[field.id] = field.type === 'checkbox' ? 'Необходимо отметить' : 'Обязательное поле';
      } else if (uncheckedBox) {
        values[field.id] = false;
      }
      continue;
    }
    const result = validateOne(field, raw);
    if (result.error !== undefined) errors[field.id] = result.error;
    else values[field.id] = result.value;
  }
  return { values, errors };
}

/** Human-readable representation of a stored answer value. */
export function formatValue(field: Pick<Field, 'type' | 'options'>, value: unknown): string {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return '—';
  }
  const labelOf = (id: unknown) => field.options?.find((o) => o.id === id)?.label ?? String(id);
  switch (field.type) {
    case 'select':
    case 'radio':
      return labelOf(value);
    case 'multi_select':
      return Array.isArray(value) ? value.map(labelOf).join(', ') : String(value);
    case 'checkbox':
      return value === true ? 'Да' : 'Нет';
    case 'date': {
      const m = DATE_RE.exec(String(value));
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
    }
    default:
      return String(value);
  }
}
